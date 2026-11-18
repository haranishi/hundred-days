// 相手探し（docs/05）。行列に入り、2人そろったら部屋に案内される。名前は送らない（部屋で仮名が付く）。
// 20秒（MATCH_TIMEOUT_MS）で見つからなければ onGiveUp('timeout')。見つかってから相手が10秒来なくても同じ。
// 相手探しの部屋は2人そろうと部屋が自動で始めるので、試合の始まり（countdown）で onStart を呼ぶ。

import { MATCH_JOIN_TIMEOUT_MS, MATCH_TIMEOUT_MS } from '../../shared/protocol/constants'
import { isCharacterKey, parseLobbyMessage } from '../../shared/protocol/messages'
import { resolveNetEnv, type NetEnv, type SocketLike } from './env'
import { RoomClient } from './room-client'
import { memorySeatStore } from './seat-store'

export type MatchmakeFailure = 'timeout' | 'error' | 'daily-limit' | 'rate-limited'

export interface MatchmakeCallbacks {
  /** 選んだキャラ（'ch/〜'）。無ければ部屋が席の番号で決める */
  character?: string
  /** 行列に入った。timeoutMs はあきらめるまでの時間 */
  onWaiting?(info: { timeoutMs: number }): void
  /** 相手が見つかった（部屋につないでいる途中） */
  onMatched?(info: { code: string }): void
  /** 試合が始まった（カウントダウン）。この RoomClient をゲームに渡す */
  onStart(client: RoomClient): void
  /** 見つからなかった（timeout）・つながらなかった（error）・きょうはいっぱい（daily-limit）・やりすぎ（rate-limited） */
  onGiveUp(reason: MatchmakeFailure): void
}

export interface MatchmakeHandle {
  /** やめる（行列から外れ、つないでいた部屋からも出る） */
  cancel(): void
  /** あきらめるまでの残り秒（画面の表示用） */
  secondsLeft(): number
}

export function matchmake(cb: MatchmakeCallbacks, opts: { env?: Partial<NetEnv> } = {}): MatchmakeHandle {
  const env = resolveNetEnv(opts.env)
  const character = isCharacterKey(cb.character) ? cb.character : undefined
  let deadline = env.now() + MATCH_TIMEOUT_MS
  let done = false
  let lobby: SocketLike | null = null
  let client: RoomClient | null = null
  let timer: unknown = null

  const arm = (ms: number): void => {
    if (timer !== null) env.clearTimeout(timer)
    deadline = env.now() + Math.max(0, ms)
    timer = env.setTimeout(() => giveUp('timeout'), Math.max(0, ms))
  }
  const closeLobby = (): void => {
    const s = lobby
    lobby = null
    if (!s) return
    try {
      s.close(1000, 'bye')
    } catch {
      // すでに閉じている
    }
  }
  const finish = (): void => {
    done = true
    if (timer !== null) env.clearTimeout(timer)
    timer = null
    closeLobby()
  }
  const giveUp = (reason: MatchmakeFailure): void => {
    if (done) return
    finish()
    client?.leave()
    client = null
    cb.onGiveUp(reason)
  }

  arm(MATCH_TIMEOUT_MS)
  let s: SocketLike
  try {
    s = env.openSocket(`${env.wsBase}/api/match/ws`)
  } catch {
    env.setTimeout(() => giveUp('error'), 0)
    return { cancel: finish, secondsLeft: () => 0 }
  }
  lobby = s
  s.addEventListener('message', (ev) => {
    if (done || lobby !== s) return
    const msg = parseLobbyMessage(ev.data)
    if (!msg) return
    if (msg.type === 'error') {
      giveUp(msg.code === 'daily-limit' || msg.code === 'rate-limited' ? msg.code : 'error')
      return
    }
    if (msg.type === 'waiting') {
      cb.onWaiting?.({ timeoutMs: Math.max(0, deadline - env.now()) })
      return
    }
    // 見つかった：行列を抜けて、配られた札で部屋に入る
    closeLobby()
    arm(MATCH_JOIN_TIMEOUT_MS)
    cb.onMatched?.({ code: msg.code })
    // 相手探しの部屋は読み込み直して戻る必要が薄いので、札はメモリにだけ置く
    const c = new RoomClient({ code: msg.code, token: msg.ticket, character, env: opts.env, store: memorySeatStore() })
    client = c
    const off = c.on((e) => {
      if (done) return
      if (e.type === 'room' && (e.room.phase === 'countdown' || e.room.phase === 'playing')) {
        off()
        finish()
        cb.onStart(c)
      } else if (e.type === 'rejected' || (e.type === 'status' && e.status === 'lost')) {
        const code = e.type === 'rejected' ? e.code : c.rejectionReason
        giveUp(code === 'daily-limit' || code === 'rate-limited' ? code : 'error')
      }
    })
    c.connect()
  })
  s.addEventListener('close', () => {
    // 見つかる前に行列の接続が切れた（部屋の側の30秒の掃除・通信断）
    if (!done && lobby === s) {
      lobby = null
      giveUp('error')
    }
  })
  return {
    cancel(): void {
      if (done) return
      finish()
      client?.leave()
      client = null
    },
    secondsLeft: () => (done ? 0 : Math.max(0, Math.ceil((deadline - env.now()) / 1000))),
  }
}
