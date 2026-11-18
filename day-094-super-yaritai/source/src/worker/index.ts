// Worker の入口（docs/05）。画面の静的配信と、部屋・相手探しへの振り分けを受け持つ。名所バトルの index.ts を写した。
// - POST /api/rooms            → 友だちの部屋を作り { code } を返す（あいことばはサーバーが作る。使用中なら作り直す）
// - GET  /api/rooms/:code/ws   → その部屋の RoomDO へ（WebSocket）
// - GET  /api/match/ws         → LobbyDO へ（WebSocket・相手探し）
// - それ以外の /api/*          → 404
// - それ以外                   → 静的配信（wrangler.jsonc の assets が先に受けるので、ここに来るのは assets に無いものだけ）
// WebSocket と部屋づくりは同じホストか許可リストの Origin だけを受け、許可した別 origin にだけ CORS の見出しを付ける。
// localhost では、画面と Worker を別ポートで試すため localhost どうしも受ける。

import { CLOSE_REJECTED } from '../shared/protocol/constants'
import { encodeMessage, type CreateRoomResponse, type ErrorCode } from '../shared/protocol/messages'
import { isValidRoomCode, normalizeRoomCode } from '../shared/roomcode'
import { readTestUsage, TEST_USAGE_HEADER, type TestUsage } from './budget'
import type { Env } from './env'
import { json, SECURITY_HEADERS } from './http'
import { allocateRoomCode } from './limits'
import { corsHeaders, isAllowedOrigin } from './origin'
import { randomRoomCode } from './random'
import { takeDaily } from './usage'

export { LobbyDO } from './lobby'
export { RoomDO } from './room'
export { UsageDO } from './usage'

const ROOM_WS = /^\/api\/rooms\/([^/]{1,32})\/ws$/

/**
 * 受付の流量制限（docs/05：部屋づくり5回/分、相手探し6回/分、接続30回/分）。キーは Cloudflare が付ける IP。
 * 手元の試験（localhost＋試験用の見出し）では試験ごとの名前をキーにする（試験どうしが同じ枠を食い合わないように）
 */
async function takeIngress(request: Request, limiter: RateLimit, test: TestUsage | null): Promise<boolean> {
  const key = test ? `sy:test:${test.id}` : `sy:${request.headers.get('CF-Connecting-IP') ?? 'local'}`
  try {
    return (await limiter.limit({ key })).success
  } catch {
    return false
  }
}

/** WebSocket の受け入れの前に確かめる。だめなら返す Response、よければ null */
function guardWebSocket(request: Request): Response | null {
  if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return json({ error: 'upgrade-required' }, 426)
  }
  if (!isAllowedOrigin(request.headers.get('Origin'), request.url)) return json({ error: 'forbidden-origin' }, 403)
  return null
}

/** 入れないことを、WebSocket の上で伝えて閉じる（ブラウザは HTTP の失敗の理由を読めないため） */
function rejectWebSocket(code: ErrorCode): Response {
  const pair = new WebSocketPair()
  const server = pair[1]
  server.accept()
  server.send(encodeMessage({ type: 'error', code }))
  server.close(CLOSE_REJECTED, code)
  return new Response(null, { status: 101, webSocket: pair[0] })
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname
    const test = readTestUsage(request.headers.get(TEST_USAGE_HEADER), request.url)

    if (path === '/api/rooms') {
      const origin = request.headers.get('Origin')
      const cors = corsHeaders(origin, request.url)
      if (request.method === 'OPTIONS') {
        if (!cors['access-control-allow-origin']) return json({ error: 'forbidden-origin' }, 403)
        return new Response(null, {
          status: 204,
          headers: {
            ...SECURITY_HEADERS,
            ...cors,
            'access-control-allow-methods': 'POST',
            'access-control-allow-headers': request.headers.get('Access-Control-Request-Headers') ?? 'content-type',
            'access-control-max-age': '86400',
            vary: 'Origin, Access-Control-Request-Headers',
          },
        })
      }
      if (request.method !== 'POST') return json({ error: 'method-not-allowed' }, 405, { ...cors, allow: 'POST' })
      if (!isAllowedOrigin(origin, request.url)) return json({ error: 'forbidden-origin' }, 403)
      if (!(await takeIngress(request, env.ROOM_CREATE_LIMIT, test))) return json({ error: 'rate-limited' }, 429, { ...cors, 'retry-after': '60' })
      if (!(await takeDaily(env, 'room', Date.now(), test))) return json({ error: 'daily-limit' }, 503, cors)
      const code = await allocateRoomCode(randomRoomCode, (c) => env.ROOMS.getByName(c).init({ code: c, kind: 'friends', testUsage: test }))
      if (code === null) return json({ error: 'busy' }, 503, cors)
      return json({ code } satisfies CreateRoomResponse, 201, cors)
    }

    const room = ROOM_WS.exec(path)
    if (room) {
      const bad = guardWebSocket(request)
      if (bad) return bad
      let raw = ''
      try {
        raw = decodeURIComponent(room[1] ?? '')
      } catch {
        raw = ''
      }
      const code = normalizeRoomCode(raw)
      if (!isValidRoomCode(code)) return rejectWebSocket('room-not-found')
      if (!(await takeIngress(request, env.ROOM_CONNECT_LIMIT, test))) return rejectWebSocket('rate-limited')
      return env.ROOMS.getByName(code).fetch(request)
    }

    if (path === '/api/match/ws') {
      const bad = guardWebSocket(request)
      if (bad) return bad
      if (!(await takeIngress(request, env.MATCH_LIMIT, test))) return rejectWebSocket('rate-limited')
      if (!(await takeDaily(env, 'match', Date.now(), test))) return rejectWebSocket('daily-limit')
      return env.LOBBY.getByName('lobby').fetch(request)
    }

    if (path.startsWith('/api/')) return json({ error: 'not-found' }, 404)
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
