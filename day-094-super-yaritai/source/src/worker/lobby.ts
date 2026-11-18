// 相手探し（LobbyDO）。全体で1つ。つないだ人を来た順に2人ずつ組にして、相手探しの部屋へ案内する（docs/05）。名所バトルの lobby.ts を写した。
// - 端末からは何も受け付けない（名前も送らせない）。つないだら行列に入り、切ったら外れる
// - 2人そろったら部屋を作り、2人に { type:'matched', code, ticket } を送って接続を閉じる
// - 端末は20秒であきらめる。行列に残った接続も30秒で閉じる
// 組み合わせの決め方は lobby-core.ts の純粋な関数にある。

import { DurableObject } from 'cloudflare:workers'
import { CLOSE_MATCHED, CLOSE_REJECTED, LOBBY_MAX_WAIT_MS } from '../shared/protocol/constants'
import { encodeMessage, type LobbyMatchedMessage } from '../shared/protocol/messages'
import { readTestUsage, TEST_USAGE_HEADER, type TestUsage } from './budget'
import type { Env } from './env'
import { allocateRoomCode } from './limits'
import { pairWaiters } from './lobby-core'
import { randomConnId, randomRoomCode, randomToken } from './random'

interface LobbyAttachment {
  key: string
  joinedAt: number
  /** waiting＝行列にいる／matching＝部屋を作っている途中（ほかの組に入れない） */
  state: 'waiting' | 'matching'
  testUsage: TestUsage | null
}

function lobbyAttachment(ws: WebSocket): LobbyAttachment | null {
  try {
    const a: unknown = ws.deserializeAttachment()
    if (a && typeof a === 'object' && typeof (a as LobbyAttachment).key === 'string') return a as LobbyAttachment
  } catch {
    // 閉じた接続などは読めないことがある
  }
  return null
}

function isOpen(ws: WebSocket): boolean {
  return ws.readyState === WebSocket.READY_STATE_OPEN
}

export class LobbyDO extends DurableObject<Env> {
  /** 組み合わせの途中（部屋を作るのを待っている間に、同じ人を2回組にしない） */
  private matching = false

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('websocket only', { status: 426 })
    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    this.ctx.acceptWebSocket(server)
    const key = randomConnId()
    const testUsage = readTestUsage(request.headers.get(TEST_USAGE_HEADER), request.url)
    server.serializeAttachment({ key, joinedAt: Date.now(), state: 'waiting', testUsage } satisfies LobbyAttachment)
    setTimeout(() => {
      if (lobbyAttachment(server)?.key === key && isOpen(server)) server.close(CLOSE_REJECTED, 'wait-timeout')
    }, LOBBY_MAX_WAIT_MS)
    server.send(encodeMessage({ type: 'waiting' }))
    // 組み合わせ（部屋づくりの RPC を含む）は、この受け付けの中で待ち切る。受け付けを返したあとの続きにすると、
    // 待っている間に Durable Object が休止して、組み合わせが途中で止まるおそれがあるため
    await this.matchWaiting()
    return new Response(null, { status: 101, webSocket: client })
  }

  override async webSocketMessage(ws: WebSocket): Promise<void> {
    // 行列で端末から送るものは無い。1通目から断り、細く長い送信でも部屋を起こし続けられないようにする
    try {
      ws.send(encodeMessage({ type: 'error', code: 'bad-message' }))
      ws.close(CLOSE_REJECTED, 'bad-message')
    } catch {
      // すでに閉じている
    }
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    // 閉じた接続は readyState で行列から外れる。閉じる合図に答えておく
    try {
      ws.close(1000, 'bye')
    } catch {
      // すでに閉じている
    }
  }

  override async webSocketError(): Promise<void> {
    // 行列からは readyState で外れる
  }

  /** 行列にいる人（つながっていて、組み合わせの途中でない） */
  private waiters(): (LobbyAttachment & { ws: WebSocket })[] {
    const out: (LobbyAttachment & { ws: WebSocket })[] = []
    for (const ws of this.ctx.getWebSockets()) {
      const att = lobbyAttachment(ws)
      if (att?.state === 'waiting' && isOpen(ws)) out.push({ ...att, ws })
    }
    return out
  }

  private async matchWaiting(): Promise<void> {
    if (this.matching) return
    this.matching = true
    try {
      for (let round = 0; round < 50; round++) {
        // 試験用の行列は数え先ごとに分ける（並べて走らせた試験どうしが組にならないように）。本番は全員が同じ行列
        const groups = new Map<string, (LobbyAttachment & { ws: WebSocket })[]>()
        for (const w of this.waiters()) {
          const key = w.testUsage?.id ?? 'production'
          groups.set(key, [...(groups.get(key) ?? []), w])
        }
        const pairs = [...groups.values()].flatMap((waiters) => pairWaiters(waiters).pairs)
        if (pairs.length === 0) return
        for (const pair of pairs) {
          for (const w of pair) w.ws.serializeAttachment({ key: w.key, joinedAt: w.joinedAt, state: 'matching', testUsage: w.testUsage } satisfies LobbyAttachment)
          const tickets = [randomToken(), randomToken()]
          const code = await allocateRoomCode(randomRoomCode, (c) =>
            this.env.ROOMS.getByName(c).init({ code: c, kind: 'match', tickets, testUsage: pair[0].testUsage }),
          )
          const alive = pair.filter((w) => isOpen(w.ws))
          if (code === null || alive.length < 2) {
            // 部屋を作れなかった・待っている間に1人が抜けた：残った人は行列に戻す（作った部屋は空き部屋として片付く）
            for (const w of alive) w.ws.serializeAttachment({ key: w.key, joinedAt: w.joinedAt, state: 'waiting', testUsage: w.testUsage } satisfies LobbyAttachment)
            if (code === null) return
            continue
          }
          pair.forEach((w, i) => {
            const msg: LobbyMatchedMessage = { type: 'matched', code, ticket: tickets[i] as string }
            try {
              w.ws.send(encodeMessage(msg))
              w.ws.close(CLOSE_MATCHED, 'matched')
            } catch {
              // 送る直前に切れた。相手は部屋で待ち、端末側の待ち時間の上限であきらめる
            }
          })
        }
      }
    } finally {
      this.matching = false
    }
  }
}
