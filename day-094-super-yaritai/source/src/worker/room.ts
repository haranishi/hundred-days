// 部屋（RoomDO）。あいことば1つにつき1つ。WebSocket でつなぎ、部屋の管理と試合中のバイナリの中継をする（docs/05）。
// 決まりの中身は room-core.ts の純粋な関数にあり、ここは保存・送信・アラーム・接続の出入りだけを受け持つ。
//
// - 休止できる WebSocket（ctx.acceptWebSocket）を使う。接続ごとの席の番号は serializeAttachment に持つ
// - 試合中のバイナリは中身を読まず、1バイト目で行き先を決めて、そのまま送る（種類1・4だけ2バイト目に送り主を書く）
// - 保存：人の操作で変わったときだけ、SAVE_DELAY_MS の間の変化をまとめて1回書く。中継では書かない
// - 時間で起こすもの（席の保持の終わり・主から結果が来ないときの打ち切り・片付け）は保存のアラーム1つにまとめる
// - 無料枠の守り：1接続の通数（毎秒40通）・1通の大きさ（16KB）・名乗りの期限・同時接続の数・部屋ごとの予算・1日の試合の上限

import { DurableObject } from 'cloudflare:workers'
import { pseudonym } from '../shared/names'
import {
  CLOSE_LEAVE,
  CLOSE_RATE_LIMITED,
  CLOSE_REJECTED,
  CLOSE_REPLACED,
  HELLO_DEADLINE_MS,
  KEEPALIVE_MESSAGE,
  MATCH_PLAYERS,
  MAX_BINARY_BYTES,
  MAX_TEXT_CHARS,
  type MatchDuration,
} from '../shared/protocol/constants'
import {
  encodeMessage,
  parseClientMessage,
  type ErrorCode,
  type FinalMessage,
  type HelloMessage,
  type RoomKind,
  type ServerMessage,
} from '../shared/protocol/messages'
import { overRoomBudget, takeToken, utcDay, type Bucket, type TestUsage } from './budget'
import type { Env } from './env'
import { randomConnId, randomInt, randomToken, randomUint32 } from './random'
import { BIN_STORE } from '../shared/protocol/binary'
import {
  banToken,
  canStartGame,
  checkHostSilent,
  configureRoom,
  createRoomRecord,
  finishGame,
  isRoomInUse,
  joinRoom,
  markDisconnected,
  maxConnections,
  nextWakeAt,
  removeSeat,
  roomView,
  routeBinary,
  shouldAutoStart,
  startGame,
  tickRoom,
  type RoomRecord,
} from './room-core'
import { takeDaily } from './usage'

const STORAGE_KEY = 'room'
/** 保存をまとめる時間 */
const SAVE_DELAY_MS = 1000

/** 接続ごとに持つ印。休止しても残る */
interface Attachment {
  connId: string
  /** hello で席が決まってから入る */
  slot: number | null
}

export interface RoomInitOptions {
  code: string
  kind: RoomKind
  /** 相手探しの部屋：2人に配る札 */
  tickets?: string[]
  /** 手元の試験で1日の上限を差し替えたとき */
  testUsage?: TestUsage | null
}

type Timer = ReturnType<typeof setTimeout>

function attachmentOf(ws: WebSocket): Attachment | null {
  try {
    const a: unknown = ws.deserializeAttachment()
    if (a && typeof a === 'object' && typeof (a as Attachment).connId === 'string') {
      const att = a as Attachment
      return { connId: att.connId, slot: typeof att.slot === 'number' ? att.slot : null }
    }
  } catch {
    // 閉じた接続などは読めないことがある
  }
  return null
}

function isOpen(ws: WebSocket): boolean {
  return ws.readyState === WebSocket.READY_STATE_OPEN
}

export class RoomDO extends DurableObject<Env> {
  private room: RoomRecord | null = null
  /** 保存のアラームの時刻（undefined は「わからない」） */
  private alarmAt: number | null | undefined = undefined
  /** いちばん新しいアラームの付け直し（アラームの処理の中では、終わる前に待つ） */
  private alarmOp: Promise<void> = Promise.resolve()
  private saveTimer: Timer | null = null
  private dirty = false
  /** 1日の上限を聞いている間（はじめるの2重押しを防ぐ） */
  private starting = false
  /** まだ usage に足していない受信の数（中継のたびに保存しないため、保存のときにまとめて足す） */
  private pendingMessages = 0
  /** 席の番号 → 接続。中継のたびに全接続を調べないための控え（出入りがあれば作り直す） */
  private sockets: Map<number, WebSocket> | null = null
  /** 席を外す処理を済ませた接続（同じ接続を2回数えない） */
  private readonly settled = new Set<string>()
  /** 接続ごとの通数の溜め。休止すると消えるが、休止は静かなときだけなので困らない */
  private readonly buckets = new WeakMap<WebSocket, Bucket>()
  /** 最後に主の店の様子（種類2）を中継した時刻。入れ替えから戻ったときは、戻った時刻から数え直す（早まって打ち切らない） */
  private lastHostFrameAt = Date.now()

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // つなぎっぱなしの確かめには、部屋を起こさずに答える（待合室で休止できるように）
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(KEEPALIVE_MESSAGE, KEEPALIVE_MESSAGE))
    void ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get<RoomRecord>(STORAGE_KEY)) ?? null
      this.alarmAt = await ctx.storage.getAlarm()
      // 休止や入れ替えから戻ったら、時間で進んだ分に追いつく
      if (this.room) this.applyTime(Date.now())
    })
  }

  // ── Worker・LobbyDO から呼ぶ（RPC） ──

  /** 部屋を確保する。使用中なら false（呼ぶ側があいことばを作り直す） */
  async init(opts: RoomInitOptions): Promise<boolean> {
    const now = Date.now()
    if (isRoomInUse(this.room, now)) return false
    if (this.room) {
      // 片付け損ねた古い部屋の残り
      for (const ws of this.ctx.getWebSockets()) this.reject(ws, 'room-not-found')
      await this.ctx.storage.deleteAll()
    }
    let matchSeats: { token: string; name: string }[] | undefined
    if (opts.kind === 'match') {
      // 相手探しの部屋では、本人が入れた名前は使わず仮名にする（名前は送らせていない）
      const names: string[] = []
      matchSeats = (opts.tickets ?? []).slice(0, MATCH_PLAYERS).map((token) => {
        const name = pseudonym(randomInt, names)
        names.push(name)
        return { token, name }
      })
    }
    this.clearSaveTimer()
    const room = createRoomRecord({ code: opts.code, kind: opts.kind, now, matchSeats, testUsage: opts.testUsage ?? null })
    // 保存1行＋片付けのアラーム1行
    this.room = { ...room, usage: { ...room.usage, writes: 2 } }
    this.pendingMessages = 0
    this.dirty = false
    this.sockets = null
    await this.ctx.storage.put(STORAGE_KEY, this.room)
    const at = nextWakeAt(this.room, now)
    if (at !== null) await this.ctx.storage.setAlarm(at)
    this.alarmAt = at
    return true
  }

  // ── 接続 ──

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('websocket only', { status: 426 })
    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    this.ctx.acceptWebSocket(server)
    const connId = randomConnId()
    server.serializeAttachment({ connId, slot: null } satisfies Attachment)
    const now = Date.now()
    const room = this.room
    if (!room || !isRoomInUse(room, now)) {
      this.reject(server, 'room-not-found')
    } else if (room.closed) {
      this.reject(server, 'room-closed')
    } else {
      // 受け入れた接続を部屋の予算で数える（断る接続も Durable Objects の1リクエストになるので数える）
      this.room = { ...room, usage: { ...room.usage, connections: room.usage.connections + 1 } }
      this.markDirty()
      if (!this.enforceBudget()) {
        const live = this.ctx.getWebSockets().filter(isOpen).length
        if (live > maxConnections(room)) {
          this.reject(server, 'room-full')
        } else {
          // 5秒以内に名乗らなければ切る
          setTimeout(() => this.helloDeadline(server, connId), HELLO_DEADLINE_MS)
        }
      }
    }
    return new Response(null, { status: 101, webSocket: client })
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const now = Date.now()
    const att = attachmentOf(ws)
    if (!att || !isOpen(ws) || this.settled.has(att.connId)) return
    this.pendingMessages++
    const rate = takeToken(this.buckets.get(ws), now)
    this.buckets.set(ws, rate.bucket)
    if (!rate.allowed) {
      // 毎秒40通を超えたら切る。名乗った人の札はしばらく戻れない（席は残る）
      this.sendError(ws, 'rate-limited')
      const token = att.slot !== null ? this.room?.seats.find((s) => s.slot === att.slot)?.token : undefined
      if (token && this.room) {
        this.room = banToken(this.room, token, now)
        this.markDirty()
      }
      await this.onGone(ws, 1006)
      this.closeSocket(ws, CLOSE_RATE_LIMITED, 'rate-limited')
      return
    }
    if (this.enforceBudget()) return

    // 大きすぎる1通は読まずに捨てる（接続はそのまま）
    if (typeof message === 'string' ? message.length > MAX_TEXT_CHARS : message.byteLength > MAX_BINARY_BYTES) return

    if (att.slot === null) {
      // 名乗る前は hello だけを受け付ける。ほかのもの（バイナリも）が来たら切る
      const msg = typeof message === 'string' ? parseClientMessage(message) : null
      if (!msg || msg.type !== 'hello') {
        this.reject(ws, 'bad-message')
        await this.onGone(ws, CLOSE_REJECTED)
        return
      }
      await this.onHello(ws, att, msg, now)
      return
    }
    const slot = att.slot
    const room = this.room
    if (!room || !room.seats.some((s) => s.slot === slot)) return

    if (typeof message !== 'string') {
      this.relay(room, slot, message, now)
      return
    }
    const msg = parseClientMessage(message)
    if (!msg) return // 型・範囲・長さが合わないものは捨てる
    switch (msg.type) {
      case 'hello':
        return // 2回目は捨てる
      case 'ping':
        this.send(ws, { type: 'pong', t: msg.t, serverNow: now })
        return
      case 'config':
        this.onConfig(ws, slot, msg.duration, now)
        return
      case 'start':
        await this.onStart(ws, slot, false)
        return
      case 'rematch':
        await this.onStart(ws, slot, true)
        return
      case 'final':
        this.onFinal(ws, slot, msg, now)
        return
      case 'bye':
        await this.onGone(ws, CLOSE_LEAVE)
        this.closeSocket(ws, CLOSE_LEAVE, 'bye')
        return
    }
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    await this.onGone(ws, code)
    this.closeSocket(ws, 1000, 'bye')
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.onGone(ws, 1006)
  }

  override async alarm(): Promise<void> {
    this.alarmAt = null
    const room = this.room
    if (!room) return
    const now = Date.now()
    if (!isRoomInUse(room, now)) {
      await this.discard()
      return
    }
    this.applyTime(now)
    // 次のアラームを付け終えてから返す（処理の途中で付け直したことにならないように）
    await this.alarmOp
  }

  // ── 受け取ったものごと ──

  private async onHello(ws: WebSocket, att: Attachment, msg: HelloMessage, now: number): Promise<void> {
    const room = this.room
    if (!room || !isRoomInUse(room, now)) {
      this.reject(ws, 'room-not-found')
      return
    }
    const res = joinRoom(room, { name: msg.name, character: msg.character, token: msg.token }, now, randomToken())
    if (!res.ok) {
      this.reject(ws, res.code)
      await this.onGone(ws, CLOSE_REJECTED)
      return
    }
    // 同じ席の古い接続（つなぎ直しが重なった・タブを2つ開いた）は外して閉じる
    for (const other of this.ctx.getWebSockets()) {
      if (other === ws) continue
      const o = attachmentOf(other)
      if (o?.slot !== res.seat.slot) continue
      this.settle(other, o)
      this.closeSocket(other, CLOSE_REPLACED, 'replaced')
    }
    ws.serializeAttachment({ connId: att.connId, slot: res.seat.slot } satisfies Attachment)
    this.sockets = null
    this.send(ws, { type: 'welcome', slot: res.seat.slot, token: res.seat.token, code: room.code, serverNow: now })
    // 結果のあとに戻ってきた人には、終わり方をもう一度知らせる（いま終わった分は commit が全員に知らせる）
    const g = room.game
    if (g && g.endedAt !== null) {
      if (g.result) this.send(ws, { type: 'result', round: g.round, result: g.result })
      else this.send(ws, { type: 'host-left', round: g.round })
    }
    this.commit(room, tickRoom(res.room, now), now)
    if (this.room && shouldAutoStart(this.room, now)) await this.onStart(null, null, false)
  }

  private onConfig(ws: WebSocket, slot: number, duration: MatchDuration, now: number): void {
    const room = this.room
    if (!room) return
    const res = configureRoom(room, slot, duration, now)
    if (!res.ok) {
      this.sendError(ws, res.code)
      return
    }
    if (res.room === room) return
    this.room = res.room
    this.markDirty()
    this.broadcastRoom(now)
  }

  /**
   * はじめる・もう一回・相手探しの部屋の自動開始。ルールの上で始められるかを見てから、1日の試合の上限を聞く。
   * ws が null のときは自動開始。日次上限なら、全員に知らせて閉じる（その日は主が交代しても始められないため）
   */
  private async onStart(ws: WebSocket | null, requester: number | null, rematch: boolean): Promise<void> {
    const room = this.room
    if (!room || room.closed || this.starting) return
    const check = canStartGame(room, requester, rematch, Date.now())
    if (!check.ok) {
      if (ws) this.sendError(ws, check.code)
      return
    }
    this.starting = true
    try {
      const budgetNow = Date.now()
      const day = utcDay(budgetNow)
      const allowed = room.reservedGameDay === day || (await takeDaily(this.env, 'game', budgetNow, room.testUsage))
      if (!allowed) {
        for (const other of this.ctx.getWebSockets()) this.reject(other, 'daily-limit')
        return
      }
      if (!this.room) return
      // 待っている間に人が抜けても、認められた枠はその日のうちの次の開始で使い回す
      this.room = { ...this.room, reservedGameDay: day }
      this.markDirty()
      const now = Date.now()
      const res = startGame(this.room, requester, rematch, now, randomUint32())
      if (!res.ok) {
        if (ws) this.sendError(ws, res.code)
        return
      }
      this.room = res.room
      // 主が黙っている時間は、試合ごとに数え直す
      this.lastHostFrameAt = now
      this.markDirty()
      this.broadcastRoom(now)
      this.rearm(now)
    } finally {
      this.starting = false
    }
  }

  private onFinal(ws: WebSocket, slot: number, msg: FinalMessage, now: number): void {
    const room = this.room
    if (!room) return
    const res = finishGame(room, slot, msg.round, msg.result, now)
    if (!res.ok) {
      this.sendError(ws, res.code)
      return
    }
    this.commit(room, res.room, now)
  }

  /** 試合中のバイナリを中継する（中身は読まない）。参加者から届いたついでに、主が黙っていないかを確かめる */
  private relay(room: RoomRecord, sender: number, message: ArrayBuffer, now: number): void {
    const data = new Uint8Array(message)
    const route = routeBinary(room, sender, data, now)
    if ('drop' in route) return
    const sockets = this.socketsBySlot()
    if (route.to === 'host') {
      const host = sockets.get(route.slot)
      if (host) this.sendRaw(host, message)
      // 参加者は毎秒15回送るので、主が20秒黙れば遅くとも1/15秒で気づける
      const next = checkHostSilent(room, this.lastHostFrameAt, now)
      if (next !== room) this.commit(room, next, now)
      return
    }
    if (data[0] === BIN_STORE) this.lastHostFrameAt = now
    for (const slot of route.slots) {
      const guest = sockets.get(slot)
      if (guest) this.sendRaw(guest, message)
    }
  }

  /** 接続が切れた。自分から出た（4001・bye）なら席を空け、それ以外は席を残す */
  private async onGone(ws: WebSocket, code: number): Promise<void> {
    const att = attachmentOf(ws)
    if (!att) return
    this.settle(ws, att)
    const slot = att.slot
    if (slot === null) return
    // 同じ席に新しい接続があれば、古い接続が切れたことは数えない
    if (this.ctx.getWebSockets().some((o) => o !== ws && isOpen(o) && attachmentOf(o)?.slot === slot)) return
    const room = this.room
    if (!room) return
    const now = Date.now()
    const next = code === CLOSE_LEAVE ? removeSeat(room, slot, now) : markDisconnected(room, slot, now)
    this.commit(room, next, now)
  }

  /** 席の印を外す（1つの接続につき1回だけ） */
  private settle(ws: WebSocket, att: Attachment): void {
    if (this.settled.has(att.connId)) return
    this.settled.add(att.connId)
    this.sockets = null
    try {
      ws.serializeAttachment({ connId: att.connId, slot: null } satisfies Attachment)
    } catch {
      // 閉じた接続には書けないことがある
    }
  }

  /** 5秒たっても名乗っていない接続を切る */
  private helloDeadline(ws: WebSocket, connId: string): void {
    const att = attachmentOf(ws)
    if (!att || att.connId !== connId || att.slot !== null || !isOpen(ws)) return
    this.settle(ws, att)
    this.closeSocket(ws, CLOSE_REJECTED, 'hello-timeout')
  }

  // ── 状態の更新 ──

  /** 部屋の状態を next にし、保存・試合の終わりの知らせ・顔ぶれの知らせ・アラームの付け直しをする */
  private commit(before: RoomRecord, next: RoomRecord, now: number): void {
    if (next === before) return
    this.room = next
    this.markDirty()
    this.announceEnd(before, next)
    this.broadcastRoom(now)
    this.rearm(now)
  }

  /** 試合がいま終わったなら、全員に終わり方を知らせる（final なら結果、それ以外は host-left） */
  private announceEnd(before: RoomRecord, after: RoomRecord): void {
    const g = after.game
    if (!g || g.endedAt === null) return
    if (before.game?.round === g.round && before.game.endedAt !== null) return
    const msg: ServerMessage = g.result ? { type: 'result', round: g.round, result: g.result } : { type: 'host-left', round: g.round }
    this.broadcast(encodeMessage(msg))
  }

  /** 時間で進むもの（席の保持の終わり・打ち切り）に追いつき、アラームを付け直す */
  private applyTime(now: number): void {
    const room = this.room
    if (!room) return
    const next = tickRoom(room, now)
    if (next !== room) this.commit(room, next, now)
    else this.rearm(now)
  }

  /** 次に起きる時刻を、保存のアラームに付け直す（変わったときだけ書く） */
  private rearm(now: number = Date.now()): void {
    const room = this.room
    if (!room) return
    const at = nextWakeAt(room, now)
    if (at === this.alarmAt) return
    this.alarmAt = at
    this.room = { ...room, usage: { ...room.usage, writes: room.usage.writes + 1 } }
    this.alarmOp = at === null ? this.ctx.storage.deleteAlarm() : this.ctx.storage.setAlarm(at)
  }

  // ── 部屋ごとの予算 ──

  /** 予算を超えていたら部屋を閉じて true */
  private enforceBudget(): boolean {
    const room = this.room
    if (!room || room.closed) return room?.closed ?? false
    if (overRoomBudget(room.usage, this.pendingMessages) === null) return false
    const now = Date.now()
    this.room = { ...room, closed: true, seats: [], hostSlot: null, emptySince: now }
    this.markDirty()
    for (const ws of this.ctx.getWebSockets()) {
      const att = attachmentOf(ws)
      if (att) this.settle(ws, att)
      this.reject(ws, 'room-closed')
    }
    this.rearm(now)
    return true
  }

  // ── 保存 ──

  /** 人の操作で変わった。SAVE_DELAY_MS のあとに、それまでの変化をまとめて1回書く */
  private markDirty(): void {
    this.dirty = true
    if (this.saveTimer !== null) return
    this.saveTimer = setTimeout(() => void this.flushSave(), SAVE_DELAY_MS)
  }

  private async flushSave(): Promise<void> {
    this.saveTimer = null
    const room = this.room
    if (!this.dirty || !room) return
    this.dirty = false
    const usage = { ...room.usage, writes: room.usage.writes + 1, messages: room.usage.messages + this.pendingMessages }
    this.pendingMessages = 0
    const saved: RoomRecord = { ...room, usage }
    this.room = saved
    await this.ctx.storage.put(STORAGE_KEY, saved)
    this.enforceBudget()
  }

  private clearSaveTimer(): void {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer)
    this.saveTimer = null
  }

  /** 10分たった空き部屋を片付ける（あいことばを空ける） */
  private async discard(): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) this.reject(ws, 'room-not-found')
    this.clearSaveTimer()
    this.room = null
    this.dirty = false
    this.pendingMessages = 0
    this.sockets = null
    await this.ctx.storage.deleteAlarm()
    await this.ctx.storage.deleteAll()
    this.alarmAt = null
  }

  // ── 送信 ──

  /** 席の番号 → 開いている接続 */
  private socketsBySlot(): Map<number, WebSocket> {
    if (this.sockets) return this.sockets
    const map = new Map<number, WebSocket>()
    for (const ws of this.ctx.getWebSockets()) {
      const att = attachmentOf(ws)
      if (att?.slot !== null && att?.slot !== undefined && isOpen(ws) && !this.settled.has(att.connId)) map.set(att.slot, ws)
    }
    this.sockets = map
    return map
  }

  private broadcastRoom(now: number): void {
    const room = this.room
    if (!room) return
    this.broadcast(encodeMessage({ type: 'room', serverNow: now, room: roomView(room, now) }))
  }

  /** 席のある接続すべてに送る */
  private broadcast(text: string): void {
    const room = this.room
    if (!room) return
    for (const [slot, ws] of this.socketsBySlot()) if (room.seats.some((s) => s.slot === slot)) this.sendRaw(ws, text)
  }

  /** 入れなかった理由を送って閉じる */
  private reject(ws: WebSocket, code: ErrorCode): void {
    this.sendError(ws, code)
    this.closeSocket(ws, CLOSE_REJECTED, code)
    this.sockets = null
  }

  private sendError(ws: WebSocket, code: ErrorCode): void {
    this.send(ws, { type: 'error', code })
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    this.sendRaw(ws, encodeMessage(msg))
  }

  private sendRaw(ws: WebSocket, data: string | ArrayBuffer): void {
    try {
      ws.send(data)
    } catch {
      // 閉じかけの接続には送れない。切れたことは webSocketClose で扱う
    }
  }

  private closeSocket(ws: WebSocket, code: number, reason: string): void {
    try {
      ws.close(code, reason)
    } catch {
      // すでに閉じている
    }
  }
}
