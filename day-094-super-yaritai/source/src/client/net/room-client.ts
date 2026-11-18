// 部屋への接続（WebSocket）。名乗る（hello）・札での再接続・時計合わせ・JSON とバイナリの送受信・切断の知らせを受け持つ。
// 名所バトルの connection.ts を写して直した。試合の中身（物理・点数）は知らない。ゲームの側（HostSession・GuestSession）が
// onBinary でバイナリを受け取り、sendBinary で送る。

import type { MatchResult } from '../../shared/view'
import {
  CLOSE_LEAVE,
  CLOSE_RATE_LIMITED,
  CLOSE_REJECTED,
  CLOSE_REPLACED,
  KEEPALIVE_INTERVAL_MS,
  KEEPALIVE_MESSAGE,
  LOBBY_GRACE_MS,
  PLAYING_GRACE_MS,
  type MatchDuration,
} from '../../shared/protocol/constants'
import {
  encodeMessage,
  parseServerMessage,
  type ClientMessage,
  type ErrorCode,
  type HelloMessage,
  type RoomPhase,
  type RoomView,
} from '../../shared/protocol/messages'
import { ClockSync } from './clock'
import { isSocketOpen, resolveNetEnv, type NetEnv, type SocketLike } from './env'
import { sessionSeatStore, type SeatStore } from './seat-store'

/** 入れなかった理由。部屋の理由に、つながらなかった（network）・あいことばの形がちがう（bad-code）を足したもの */
export type JoinFailure = ErrorCode | 'network' | 'bad-code'

export class RoomJoinError extends Error {
  constructor(readonly code: JoinFailure) {
    super(`部屋に入れなかった: ${code}`)
    this.name = 'RoomJoinError'
  }
}

export type ConnectionStatus = 'ok' | 'reconnecting' | 'lost'

export type RoomClientEvent =
  /** 名乗りが通った（つなぎ直しのたびにも届く） */
  | { type: 'welcome'; slot: number; rejoined: boolean }
  /** 部屋の形が届いた（段階・顔ぶれ・主・開始時刻と種） */
  | { type: 'room'; room: RoomView }
  /** 主が送った最終結果 */
  | { type: 'result'; round: number; result: MatchResult }
  /** 試合中に主が抜けた・主から結果が来なかった。参加者は最後に届いた点数で結果を出す */
  | { type: 'host-left'; round: number }
  | { type: 'status'; status: ConnectionStatus }
  /** 初めての入室で断られた・つながらなかった */
  | { type: 'rejected'; code: JoinFailure }
  /** 操作を断られた（主ではない・人数が足りない など）。接続はそのまま */
  | { type: 'notice'; code: ErrorCode }
  /** leave() で自分から出た（このあと知らせは届かない） */
  | { type: 'left' }

/** 名乗りのあとの時計合わせの回数 */
export const INITIAL_PINGS = 5
/** 試合中の時計合わせの間隔 */
export const PING_INTERVAL_MS = 10_000
/** pong を待つ上限（返ってこなければ次へ進む） */
export const PING_TIMEOUT_MS = 2_000
/** つないでから welcome を待つ上限 */
export const WELCOME_TIMEOUT_MS = 8_000

/** n 回目（0から数える）のつなぎ直しまでの待ち時間 */
export function reconnectDelayMs(attempt: number): number {
  const steps = [250, 500, 1000, 2000, 3000, 5000]
  return steps[Math.min(Math.max(0, Math.floor(attempt)), steps.length - 1)] ?? 5000
}

/** 部屋の段階を、開始時刻とサーバー時刻から求め直す（room の phase は送った時点のもの） */
export function phaseAt(room: RoomView, serverNow: number): RoomPhase {
  if (room.phase !== 'countdown' && room.phase !== 'playing') return room.phase
  if (room.startAt === null) return room.phase
  return serverNow < room.startAt ? 'countdown' : 'playing'
}

type Phase = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'lost' | 'rejected' | 'left'

export interface RoomClientOptions {
  code: string
  /** 友だちの部屋で使う名前（整えたあとのもの） */
  name?: string
  /** 選んだキャラ（'ch/〜'） */
  character?: string
  /** 再接続の札・相手探しの札 */
  token?: string
  env?: Partial<NetEnv>
  /** 札を覚える場所（既定はタブの中＝sessionStorage） */
  store?: SeatStore
}

export class RoomClient {
  readonly code: string
  readonly clock = new ClockSync()
  /** 自分の番号（welcome で決まる） */
  slot: number | null = null
  /** 再接続の札 */
  token: string | null
  /** いちばん新しい部屋の形 */
  room: RoomView | null = null
  /** いちばん新しい試合の終わり方（結果か host-left） */
  ending: { round: number; result: MatchResult | null } | null = null

  private readonly name: string | undefined
  private readonly character: string | undefined
  private readonly env: NetEnv
  private readonly store: SeatStore
  private phase: Phase = 'idle'
  private failure: JoinFailure | null = null
  private socket: SocketLike | null = null
  /** 一度でも名乗りが通ったか（通っていれば、切れたらつなぎ直す） */
  private welcomed = false
  /** いまの接続で名乗りが通ったか */
  private attemptWelcomed = false
  /** いまの接続で、名乗りの前に断られた理由 */
  private refused: ErrorCode | null = null
  private attempts = 0
  private retryTimer: unknown = null
  private lostTimer: unknown = null
  private welcomeTimer: unknown = null
  private pingTimer: unknown = null
  private pendingPing: number | null = null
  private burstLeft = 0
  private readonly listeners = new Set<(e: RoomClientEvent) => void>()
  private readonly binaryListeners = new Set<(data: Uint8Array) => void>()
  private readyWaiters: { resolve: (c: RoomClient) => void; reject: (e: RoomJoinError) => void }[] = []
  private readonly unhook: (() => void)[] = []

  constructor(opts: RoomClientOptions) {
    this.code = opts.code
    this.name = opts.name
    this.character = opts.character
    this.token = opts.token ?? null
    this.env = resolveNetEnv(opts.env)
    this.store = opts.store ?? sessionSeatStore()
  }

  /** つなぎ始める（1回だけ） */
  connect(): this {
    if (this.phase !== 'idle') return this
    this.phase = 'connecting'
    this.unhook.push(this.env.onVisible(() => this.wake(true)))
    this.unhook.push(this.env.onOnline(() => this.wake(false)))
    this.openAttempt()
    return this
  }

  /** 初めての名乗りが通るまで待つ。断られたら RoomJoinError */
  ready(): Promise<RoomClient> {
    if (this.phase === 'open' || (this.welcomed && this.phase === 'reconnecting')) return Promise.resolve(this)
    if (this.failure) return Promise.reject(new RoomJoinError(this.failure))
    if (this.phase === 'left' || this.phase === 'lost') return Promise.reject(new RoomJoinError('network'))
    return new Promise((resolve, reject) => this.readyWaiters.push({ resolve, reject }))
  }

  on(listener: (e: RoomClientEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** 試合中のバイナリ（1バイト目が種類）を受け取る。data はこの知らせの中だけで使う（取っておくなら写す） */
  onBinary(listener: (data: Uint8Array) => void): () => void {
    this.binaryListeners.add(listener)
    return () => this.binaryListeners.delete(listener)
  }

  status(): ConnectionStatus {
    if (this.phase === 'open') return 'ok'
    if (this.phase === 'idle' || this.phase === 'connecting' || this.phase === 'reconnecting') return 'reconnecting'
    return 'lost'
  }

  /** 断られて終わった理由。通信断のときは null */
  get rejectionReason(): JoinFailure | null {
    return this.failure
  }

  /** いまのサーバー時刻（時計合わせで求めた値） */
  serverNow(): number {
    return this.clock.serverNow(this.env.now())
  }

  /** 端末の時計（ミリ秒・戻らない） */
  localNow(): number {
    return this.env.now()
  }

  /** 試合開始からのミリ秒（サーバー時刻で数える。カウントダウン中は負）。試合が無ければ null */
  matchTime(): number | null {
    const startAt = this.room?.startAt
    return startAt === null || startAt === undefined ? null : this.serverNow() - startAt
  }

  /** いまの段階（開始時刻とサーバー時刻から求め直す） */
  currentPhase(): RoomPhase | null {
    return this.room ? phaseAt(this.room, this.serverNow()) : null
  }

  isHost(): boolean {
    return this.slot !== null && this.room?.hostSlot === this.slot
  }

  /** 部屋へ1通送る（JSON）。つながっていなければ送らずに false */
  send(msg: ClientMessage): boolean {
    if (this.phase !== 'open') return false
    return this.sendRaw(encodeMessage(msg))
  }

  /** 試合中のバイナリを送る。つながっていなければ送らずに false（試合中のデータは送り直さない） */
  sendBinary(data: Uint8Array): boolean {
    if (this.phase !== 'open') return false
    return this.sendRaw(data)
  }

  start(): boolean {
    return this.send({ type: 'start' })
  }

  rematch(): boolean {
    return this.send({ type: 'rematch' })
  }

  configure(duration: MatchDuration): boolean {
    return this.send({ type: 'config', duration })
  }

  final(round: number, result: MatchResult): boolean {
    return this.send({ type: 'final', round, result })
  }

  /** 部屋を出る（席をすぐに空ける）。タイマーと接続を片付ける */
  leave(): void {
    if (this.phase === 'left') return
    const s = this.socket
    this.phase = 'left'
    this.socket = null
    this.clearTimers()
    this.store.clear()
    for (const off of this.unhook.splice(0)) off()
    if (s) {
      try {
        if (isSocketOpen(s)) s.send(encodeMessage({ type: 'bye' }))
        s.close(CLOSE_LEAVE, 'leave')
      } catch {
        // すでに閉じている
      }
    }
    this.failWaiters('network')
    this.emit({ type: 'left' })
    this.listeners.clear()
    this.binaryListeners.clear()
  }

  // ── 接続の1回分 ──

  private openAttempt(): void {
    this.clearTimer('retryTimer')
    this.attemptWelcomed = false
    this.refused = null
    let s: SocketLike
    try {
      s = this.env.openSocket(`${this.env.wsBase}/api/rooms/${encodeURIComponent(this.code)}/ws`)
      s.binaryType = 'arraybuffer'
    } catch {
      this.socket = null
      this.env.setTimeout(() => this.onSocketGone(null, 1006), 0)
      return
    }
    this.socket = s
    s.addEventListener('open', () => {
      if (this.socket !== s) return
      const hello: HelloMessage = { type: 'hello' }
      if (this.name) hello.name = this.name
      if (this.character) hello.character = this.character
      if (this.token) hello.token = this.token
      this.sendRaw(encodeMessage(hello))
    })
    s.addEventListener('message', (ev) => {
      if (this.socket === s) this.onMessage(ev.data)
    })
    s.addEventListener('close', (ev) => {
      if (this.socket === s) this.onSocketGone(s, typeof ev.code === 'number' ? ev.code : 1006)
    })
    this.welcomeTimer = this.env.setTimeout(() => {
      this.welcomeTimer = null
      if (this.socket !== s || this.attemptWelcomed) return
      try {
        s.close(1000, 'timeout')
      } catch {
        // 何もしない
      }
      this.onSocketGone(s, 1006)
    }, WELCOME_TIMEOUT_MS)
  }

  private onMessage(data: unknown): void {
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
      if (!this.attemptWelcomed) return
      const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      for (const l of [...this.binaryListeners]) {
        try {
          l(bytes)
        } catch (err) {
          console.error('[net] バイナリの処理で誤り', err)
        }
      }
      return
    }
    if (typeof data !== 'string' || data === KEEPALIVE_MESSAGE) return
    const msg = parseServerMessage(data)
    if (!msg) return
    switch (msg.type) {
      case 'welcome':
        this.onWelcome(msg.slot, msg.token, msg.serverNow)
        return
      case 'room': {
        const wasMatch = this.inMatch()
        this.room = msg.room
        if (this.ending && msg.room.round !== this.ending.round) this.ending = null
        if (wasMatch !== this.inMatch() && this.phase === 'open') {
          // 試合に入ったら時計を細かく合わせ直す。試合の外では、部屋を起こさない確かめだけで接続を保つ
          if (this.inMatch()) this.startPings()
          else this.scheduleHeartbeat()
        }
        this.emit({ type: 'room', room: msg.room })
        return
      }
      case 'result':
        this.ending = { round: msg.round, result: msg.result }
        this.emit({ type: 'result', round: msg.round, result: msg.result })
        return
      case 'host-left':
        this.ending = { round: msg.round, result: null }
        this.emit({ type: 'host-left', round: msg.round })
        return
      case 'pong':
        this.clock.addSample(msg.t, this.env.now(), msg.serverNow)
        if (msg.t === this.pendingPing) this.afterPing()
        return
      case 'error':
        if (this.attemptWelcomed) {
          this.emit({ type: 'notice', code: msg.code })
          if (msg.code === 'daily-limit' || msg.code === 'room-closed' || msg.code === 'rate-limited') {
            this.refused = msg.code
            this.dropCurrent(CLOSE_REJECTED)
          }
          return
        }
        // 名乗りの前に断られた。部屋もこのあと閉じるが、閉じる合図が最後まで届かない環境もあるので、待たずに自分で閉じる
        this.refused = msg.code
        this.dropCurrent(CLOSE_REJECTED)
        return
    }
  }

  private onWelcome(slot: number, token: string, serverNow: number): void {
    this.clearTimer('welcomeTimer')
    this.clearTimer('lostTimer')
    const rejoined = this.welcomed
    this.attemptWelcomed = true
    this.slot = slot
    this.token = token
    this.clock.reset()
    this.clock.seed(serverNow, this.env.now())
    this.store.save({ code: this.code, token })
    const wasOpen = this.phase === 'open'
    this.phase = 'open'
    this.welcomed = true
    this.attempts = 0
    this.startPings()
    this.emit({ type: 'welcome', slot, rejoined })
    if (!wasOpen) this.emit({ type: 'status', status: 'ok' })
    for (const w of this.readyWaiters.splice(0)) w.resolve(this)
  }

  /** 接続が閉じた・開けなかった・名乗りが返ってこなかった */
  private onSocketGone(s: SocketLike | null, code: number): void {
    if (s !== null && this.socket !== s) return
    this.socket = null
    this.clearTimer('welcomeTimer')
    this.stopPings()
    if (this.phase === 'left' || this.phase === 'lost' || this.phase === 'rejected') return
    if (!this.welcomed) {
      // 初めての入室で断られた・つながらなかった
      this.phase = 'rejected'
      this.failure = this.refused ?? 'network'
      for (const off of this.unhook.splice(0)) off()
      this.clearTimers()
      this.emit({ type: 'rejected', code: this.failure })
      this.failWaiters(this.failure)
      return
    }
    if (this.refused !== null || code === CLOSE_REPLACED || code === CLOSE_REJECTED || code === CLOSE_RATE_LIMITED) {
      // 戻ろうとしたら断られた（席が無くなった・部屋が片付いた）、または別のタブが同じ席に入った
      this.failure = this.refused ?? (code === CLOSE_RATE_LIMITED ? 'rate-limited' : 'room-closed')
      this.toLost()
      return
    }
    if (this.phase !== 'reconnecting') {
      this.phase = 'reconnecting'
      this.attempts = 0
      // 部屋が席を残す時間（待合室60秒・試合中20秒）の間だけ、つなぎ直す
      this.lostTimer = this.env.setTimeout(() => this.toLost(), this.inMatch() ? PLAYING_GRACE_MS : LOBBY_GRACE_MS)
      this.emit({ type: 'status', status: 'reconnecting' })
    }
    this.retryTimer = this.env.setTimeout(() => {
      this.retryTimer = null
      if (this.phase === 'reconnecting' && this.socket === null) this.openAttempt()
    }, reconnectDelayMs(this.attempts++))
  }

  /** いまの接続をこちらから閉じ、閉じたものとして扱う */
  private dropCurrent(code: number): void {
    const s = this.socket
    if (!s) return
    try {
      s.close(1000, 'bye')
    } catch {
      // 何もしない
    }
    this.onSocketGone(s, code)
  }

  private toLost(): void {
    if (this.phase === 'left' || this.phase === 'lost') return
    const s = this.socket
    this.phase = 'lost'
    this.socket = null
    this.clearTimers()
    this.store.clear()
    for (const off of this.unhook.splice(0)) off()
    if (s) {
      try {
        s.close(1000, 'give-up')
      } catch {
        // 何もしない
      }
    }
    this.emit({ type: 'status', status: 'lost' })
  }

  /** 画面が裏から戻った・通信が戻った */
  private wake(visible: boolean): void {
    if (this.phase === 'reconnecting' && this.socket === null) {
      this.clearTimer('retryTimer')
      this.openAttempt()
    } else if (this.phase === 'open' && visible) {
      // 裏にいる間、端末の時計が止まっていたかもしれないので測り直す
      this.clock.reset()
      this.startPings()
    }
  }

  // ── 時計合わせ ──

  private startPings(): void {
    this.stopPings()
    this.burstLeft = INITIAL_PINGS
    this.pingNow()
  }

  /** ping を1通送り、返事（か PING_TIMEOUT_MS）を待って次へ進む */
  private pingNow(): void {
    this.clearTimer('pingTimer')
    if (this.phase !== 'open') return
    if (this.burstLeft > 0) this.burstLeft--
    const t = this.env.now()
    this.pendingPing = this.sendRaw(encodeMessage({ type: 'ping', t })) ? t : null
    this.pingTimer = this.env.setTimeout(() => this.afterPing(), PING_TIMEOUT_MS)
  }

  private afterPing(): void {
    this.clearTimer('pingTimer')
    this.pendingPing = null
    if (this.phase !== 'open') return
    if (this.burstLeft > 0) this.pingNow()
    else this.scheduleHeartbeat()
  }

  private inMatch(): boolean {
    const p = this.room?.phase
    return p === 'countdown' || p === 'playing'
  }

  private scheduleHeartbeat(): void {
    this.clearTimer('pingTimer')
    if (this.phase !== 'open') return
    if (this.inMatch()) {
      this.pingTimer = this.env.setTimeout(() => this.pingNow(), PING_INTERVAL_MS)
      return
    }
    this.pingTimer = this.env.setTimeout(() => {
      this.pingTimer = null
      const s = this.socket
      if (this.phase !== 'open' || !isSocketOpen(s)) return
      try {
        s.send(KEEPALIVE_MESSAGE)
      } catch {
        this.dropCurrent(1006)
        return
      }
      this.scheduleHeartbeat()
    }, KEEPALIVE_INTERVAL_MS)
  }

  private stopPings(): void {
    this.clearTimer('pingTimer')
    this.pendingPing = null
    this.burstLeft = 0
  }

  // ── 小さな道具 ──

  private sendRaw(data: string | Uint8Array): boolean {
    const s = this.socket
    if (!isSocketOpen(s)) return false
    try {
      s.send(data)
      return true
    } catch {
      return false
    }
  }

  private emit(e: RoomClientEvent): void {
    for (const l of [...this.listeners]) {
      try {
        l(e)
      } catch (err) {
        console.error('[net] 知らせの処理で誤り', err)
      }
    }
  }

  private failWaiters(code: JoinFailure): void {
    for (const w of this.readyWaiters.splice(0)) w.reject(new RoomJoinError(code))
  }

  private clearTimer(key: 'retryTimer' | 'lostTimer' | 'welcomeTimer' | 'pingTimer'): void {
    const id = this[key]
    if (id !== null) this.env.clearTimeout(id)
    this[key] = null
  }

  private clearTimers(): void {
    this.clearTimer('retryTimer')
    this.clearTimer('lostTimer')
    this.clearTimer('welcomeTimer')
    this.clearTimer('pingTimer')
    this.pendingPing = null
  }
}
