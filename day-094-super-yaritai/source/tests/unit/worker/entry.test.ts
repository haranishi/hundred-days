import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WORKER_ORIGIN } from '../../../src/shared/hosts'
import { TEST_USAGE_HEADER } from '../../../src/worker/budget'
import type { Env } from '../../../src/worker/env'
import { CONTENT_SECURITY_POLICY, SECURITY_HEADERS } from '../../../src/worker/http'

const { takeDaily } = vi.hoisted(() => ({ takeDaily: vi.fn() }))
vi.mock('../../../src/worker/usage', () => ({ takeDaily, UsageDO: class {} }))
vi.mock('../../../src/worker/room', () => ({ RoomDO: class {} }))
vi.mock('../../../src/worker/lobby', () => ({ LobbyDO: class {} }))
const worker = (await import('../../../src/worker/index')).default

function environment() {
  const init = vi.fn(async () => true)
  const limit = vi.fn(async () => ({ success: true }))
  const assets = vi.fn(async () => new Response('assets'))
  const roomSocket = vi.fn(async () => new Response('room-websocket'))
  const lobbySocket = vi.fn(async () => new Response('lobby-websocket'))
  const env = {
    ROOM_CREATE_LIMIT: { limit },
    MATCH_LIMIT: { limit },
    ROOM_CONNECT_LIMIT: { limit },
    ROOMS: { getByName: vi.fn(() => ({ init, fetch: roomSocket })) },
    LOBBY: { getByName: vi.fn(() => ({ fetch: lobbySocket })) },
    ASSETS: { fetch: assets },
  } as unknown as Env
  return { env, init, limit, assets, roomSocket, lobbySocket }
}

type Req = Parameters<typeof worker.fetch>[0]
const HOST = WORKER_ORIGIN
const APPS = ['https://day94.rairakku.com', 'https://super-yaritai-day94.pages.dev']
const post = (host = HOST, headers: Record<string, string> = {}): Req =>
  new Request(`${host}/api/rooms`, { method: 'POST', headers: { Origin: host, ...headers } }) as unknown as Req
const call = (req: Req, env: Env): Promise<Response> => worker.fetch(req, env)

describe('Worker の入口', () => {
  beforeEach(() => takeDaily.mockReset().mockResolvedValue(true))

  it('部屋を作るとあいことばを返す（201・no-store・CSP つき）', async () => {
    const { env, init } = environment()
    const res = await call(post(), env)
    expect(res.status).toBe(201)
    const body = (await res.json()) as { code: string }
    expect(body.code).toMatch(/^[A-HJKMNP-Z2-9]{4}$/)
    expect(init).toHaveBeenCalledWith({ code: body.code, kind: 'friends', testUsage: null })
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('content-security-policy')).toBe(CONTENT_SECURITY_POLICY)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('1日の上限なら部屋を確保せず503（daily-limit）', async () => {
    const { env, init } = environment()
    takeDaily.mockResolvedValue(false)
    const res = await call(post(), env)
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'daily-limit' })
    expect(init).not.toHaveBeenCalled()
  })

  it('流量の上限なら429。キーは Cloudflare が付ける IP。日次の数え先も部屋も呼ばない', async () => {
    const { env, init, limit } = environment()
    limit.mockResolvedValue({ success: false })
    const res = await call(post(HOST, { 'CF-Connecting-IP': '192.0.2.5' }), env)
    expect(res.status).toBe(429)
    expect(limit).toHaveBeenCalledWith({ key: 'sy:192.0.2.5' })
    expect(takeDaily).not.toHaveBeenCalled()
    expect(init).not.toHaveBeenCalled()
  })

  it('別のサイトからの部屋づくりは403（流量の部品も呼ばない）', async () => {
    const { env, limit } = environment()
    for (const origin of ['https://evil.example', 'null', 'http://localhost:5332']) {
      const res = await call(post(HOST, { Origin: origin }), env)
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: 'forbidden-origin' })
      expect(res.headers.get('access-control-allow-origin')).toBeNull()
    }
    expect(limit).not.toHaveBeenCalled()
  })

  it.each(APPS)('許可された %s の部屋づくりは201とCORSを返す', async (origin) => {
    const { env, init } = environment()
    const res = await call(post(HOST, { Origin: origin }), env)
    expect(res.status).toBe(201)
    const body = await res.json() as { code: string }
    expect(body.code).toMatch(/^[A-HJKMNP-Z2-9]{4}$/)
    expect(init).toHaveBeenCalledWith({ code: body.code, kind: 'friends', testUsage: null })
    expect(res.headers.get('access-control-allow-origin')).toBe(origin)
    expect(res.headers.get('vary')).toBe('Origin')
    expect(res.headers.get('access-control-allow-credentials')).toBeNull()
  })

  it.each([
    ['rate-limited', 429],
    ['daily-limit', 503],
    ['busy', 503],
  ] as const)('%s の失敗応答にもCORSを付ける', async (error, status) => {
    for (const origin of APPS) {
      const { env, init, limit } = environment()
      takeDaily.mockResolvedValue(error !== 'daily-limit')
      limit.mockResolvedValue({ success: error !== 'rate-limited' })
      init.mockResolvedValue(error !== 'busy')
      const res = await call(post(HOST, { Origin: origin }), env)
      expect(res.status).toBe(status)
      expect(await res.json()).toEqual({ error })
      expect(res.headers.get('access-control-allow-origin')).toBe(origin)
      expect(res.headers.get('vary')).toBe('Origin')
      if (error === 'rate-limited') expect(res.headers.get('retry-after')).toBe('60')
    }
  })

  it.each([...APPS, 'http://localhost:5332'])('%s のpreflightは204・要求した見出し・セキュリティ見出しを返す', async (origin) => {
    const { env, init, limit } = environment()
    const host = origin.startsWith('http://localhost') ? 'http://localhost:8798' : HOST
    for (const requested of ['content-type, x-test-header', null]) {
      const headers: Record<string, string> = { Origin: origin, 'Access-Control-Request-Method': 'POST' }
      if (requested !== null) headers['Access-Control-Request-Headers'] = requested
      const res = await call(new Request(`${host}/api/rooms`, { method: 'OPTIONS', headers }) as unknown as Req, env)
      expect(res.status).toBe(204)
      expect(await res.text()).toBe('')
      expect(res.headers.get('access-control-allow-origin')).toBe(origin)
      expect(res.headers.get('access-control-allow-methods')).toBe('POST')
      expect(res.headers.get('access-control-allow-headers')).toBe(requested ?? 'content-type')
      expect(res.headers.get('access-control-max-age')).toBe('86400')
      expect(res.headers.get('vary')).toBe('Origin, Access-Control-Request-Headers')
      expect(res.headers.get('access-control-allow-credentials')).toBeNull()
      for (const [key, value] of Object.entries(SECURITY_HEADERS)) expect(res.headers.get(key)).toBe(value)
    }
    expect(limit).not.toHaveBeenCalled()
    expect(takeDaily).not.toHaveBeenCalled()
    expect(init).not.toHaveBeenCalled()
  })

  it.each(['https://evil.example', HOST, 'http://localhost:5332', 'null', null])('%s のpreflightは403でCORSを付けない（同じホストも不要）', async (origin) => {
    const { env, limit } = environment()
    const headers: Record<string, string> = origin === null ? {} : { Origin: origin }
    const res = await call(new Request(`${HOST}/api/rooms`, { method: 'OPTIONS', headers }) as unknown as Req, env)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'forbidden-origin' })
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
    expect(limit).not.toHaveBeenCalled()
  })

  it('localhost の別ポートのPOSTにもCORSを付ける', async () => {
    const { env } = environment()
    const res = await call(post('http://localhost:8798', { Origin: 'http://localhost:5332' }), env)
    expect(res.status).toBe(201)
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5332')
    expect(res.headers.get('vary')).toBe('Origin')
  })

  it.each(['/api/rooms/K7QM/ws', '/api/match/ws'])('%s は許可された別originをDOへ渡す', async (path) => {
    for (const origin of APPS) {
      const { env, roomSocket, lobbySocket } = environment()
      const req = new Request(`${HOST}${path}`, { headers: { Origin: origin, Upgrade: 'websocket' } }) as unknown as Req
      const res = await call(req, env)
      expect(res.status).toBe(200)
      expect(await res.text()).toBe(path.includes('/rooms/') ? 'room-websocket' : 'lobby-websocket')
      const target = path.includes('/rooms/') ? roomSocket : lobbySocket
      expect(target).toHaveBeenCalledExactlyOnceWith(req)
      expect(path.includes('/rooms/') ? lobbySocket : roomSocket).not.toHaveBeenCalled()
    }
  })

  it.each(['/api/rooms/K7QM/ws', '/api/match/ws'])('%s は許可外のoriginをDOへ渡さず403にする', async (path) => {
    for (const origin of ['https://evil.example', 'http://localhost:5332', 'https://day94.rairakku.com/', 'null', null]) {
      const { env, roomSocket, lobbySocket, limit } = environment()
      const headers: Record<string, string> = { Upgrade: 'websocket' }
      if (origin !== null) headers.Origin = origin
      const res = await call(new Request(`${HOST}${path}`, { headers }) as unknown as Req, env)
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: 'forbidden-origin' })
      expect(res.headers.get('access-control-allow-origin')).toBeNull()
      expect(roomSocket).not.toHaveBeenCalled()
      expect(lobbySocket).not.toHaveBeenCalled()
      expect(limit).not.toHaveBeenCalled()
    }
  })

  it('localhost の試験用の見出しは、試験ごとの流量のキーと日次の数え先に使う。公開先では無視する', async () => {
    const { env, init, limit } = environment()
    await call(post('http://localhost:8798', { [TEST_USAGE_HEADER]: 'e2e1;room=3' }), env)
    const testUsage = { id: 'e2e1', limits: { room: 3, match: 600, game: 250 } }
    expect(limit).toHaveBeenCalledWith({ key: 'sy:test:e2e1' })
    expect(takeDaily).toHaveBeenCalledWith(env, 'room', expect.any(Number), testUsage)
    expect(init).toHaveBeenCalledWith(expect.objectContaining({ testUsage }))
    limit.mockClear()
    takeDaily.mockClear()
    await call(post(HOST, { [TEST_USAGE_HEADER]: 'e2e1;room=999999', 'CF-Connecting-IP': '192.0.2.9' }), env)
    expect(limit).toHaveBeenCalledWith({ key: 'sy:192.0.2.9' })
    expect(takeDaily).toHaveBeenCalledWith(env, 'room', expect.any(Number), null)
  })

  it.each(APPS)('%s からの GET /api/rooms は405で、CORS を付ける（ブラウザが失敗の理由を読めるように）', async (origin) => {
    const { env } = environment()
    const res = await call(new Request(`${HOST}/api/rooms`, { headers: { Origin: origin } }) as unknown as Req, env)
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('POST')
    expect(res.headers.get('access-control-allow-origin')).toBe(origin)
    expect(res.headers.get('vary')).toBe('Origin')
    expect(await res.json()).toEqual({ error: 'method-not-allowed' })
  })

  it('許可していない origin からの GET /api/rooms は405で、CORS を付けない', async () => {
    const { env } = environment()
    const res = await call(new Request(`${HOST}/api/rooms`, { headers: { Origin: 'https://evil.example' } }) as unknown as Req, env)
    expect(res.status).toBe(405)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('部屋づくりは POST だけ。WebSocket でない接続は426。知らない /api は404。それ以外は静的配信', async () => {
    const { env, assets } = environment()
    expect((await call(new Request(`${HOST}/api/rooms`) as unknown as Req, env)).status).toBe(405)
    expect((await call(new Request(`${HOST}/api/rooms/K7QM/ws`, { headers: { Origin: HOST } }) as unknown as Req, env)).status).toBe(426)
    expect((await call(new Request(`${HOST}/api/match/ws`) as unknown as Req, env)).status).toBe(426)
    const ws = { Upgrade: 'websocket', Origin: 'https://evil.example' }
    expect((await call(new Request(`${HOST}/api/rooms/K7QM/ws`, { headers: ws }) as unknown as Req, env)).status).toBe(403)
    expect((await call(new Request(`${HOST}/api/nothing`) as unknown as Req, env)).status).toBe(404)
    const page = await call(new Request(`${HOST}/index.html`) as unknown as Req, env)
    expect(await page.text()).toBe('assets')
    expect(assets).toHaveBeenCalledOnce()
  })
})

describe('見出し', () => {
  it('Worker の CSP は public/_headers と同じ（wasm-unsafe-eval を含み、eval は許さない）', () => {
    // vitest はリポジトリの根から走る
    const headers = readFileSync(resolve(process.cwd(), 'public/_headers'), 'utf8')
    const line = headers.split('\n').find((l) => l.trim().startsWith('Content-Security-Policy:'))
    expect(line?.split('Content-Security-Policy:')[1]?.trim()).toBe(CONTENT_SECURITY_POLICY)
    expect(CONTENT_SECURITY_POLICY).toContain("'wasm-unsafe-eval'")
    expect(CONTENT_SECURITY_POLICY).not.toContain("'unsafe-eval'")
    expect(CONTENT_SECURITY_POLICY.split('; ').find((directive) => directive.startsWith('connect-src '))).toBe(
      `connect-src 'self' ${WORKER_ORIGIN} ${WORKER_ORIGIN.replace('https:', 'wss:')}`,
    )
    expect(headers).toContain(`X-Content-Type-Options: ${SECURITY_HEADERS['x-content-type-options']}`)
    expect(headers).toContain(`Referrer-Policy: ${SECURITY_HEADERS['referrer-policy']}`)
    expect(headers).toContain(`X-Frame-Options: ${SECURITY_HEADERS['x-frame-options']}`)
    expect(headers).toContain(`Permissions-Policy: ${SECURITY_HEADERS['permissions-policy']}`)
    expect(headers).toContain(`Cross-Origin-Opener-Policy: ${SECURITY_HEADERS['cross-origin-opener-policy']}`)
  })
})
