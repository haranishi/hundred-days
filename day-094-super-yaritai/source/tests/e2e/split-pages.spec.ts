// 画面（Pages）と Worker を別の origin に分けた構成の公開ゲート（docs/05_ネット対戦.md）。
// - 手元：npm run e2e:split（tools/split-e2e.mjs が Pages 相当の画面と Worker を別ポートで起こす。画面ロック中は WebKit）
// - 公開後の確認：SPLIT_LIVE=1 E2E_SPLIT=1 SPLIT_APP_URL=https://super-yaritai-day94.pages.dev npx playwright test
//   （本番の画面と本番の Worker。?api= は付けず、画面が接続先を自分で決める。相手探しは知らない人と当たるので流さない）
// 通すもの：別 origin の画面から、部屋づくり（CORS）・WebSocket（Origin の検査）・CSP が、ネット対戦を最後まで通す。
// 操作は data-a のボタンを押し、状態は試験用の窓口 window.__SY__（?debug=1）で読む。

import { randomBytes } from 'node:crypto'
import http from 'node:http'
import https from 'node:https'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { storeLayout } from '../../src/shared/layout/store'
import { allPseudonyms } from '../../src/shared/names'
import { APP_ORIGINS, WORKER_ORIGIN } from '../../src/shared/hosts'
import { CONTENT_SECURITY_POLICY } from '../../src/worker/http'

const LIVE = process.env.SPLIT_LIVE === '1'
const APP = process.env.SPLIT_APP_URL ?? ''
/** 手元では split-e2e.mjs が渡した Worker。公開後は本番の Worker */
const API = LIVE ? WORKER_ORIGIN : (process.env.SPLIT_API_URL ?? '')
const appOrigin = APP ? new URL(APP).origin : ''
const apiOrigin = API ? new URL(API).origin : ''
const apiWs = apiOrigin.replace(/^http/, 'ws')
/** 手元では ?api= で Worker を指す（localhost のときだけ効く）。公開後は付けない */
const apiQuery = LIVE ? '' : `&api=${encodeURIComponent(API)}`

interface SyPlayer {
  slot: number
  name: string
  score: number
  pos: { x: number; y: number; z: number }
}
interface SyState {
  screen: string
  phase: string | null
  players: SyPlayer[]
  result: { players: { slot: number; name: string; score: number }[]; aborted: boolean } | null
}
interface Sink {
  errors: string[]
  origins: Set<string>
  sockets: string[]
  createHeaders: Record<string, string>[]
}

const opened: Page[] = []

async function openApp(browser: Browser, path: string, sink: Sink): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 720 } })
  const page = await ctx.newPage()
  // CSP の違反は、コンソールのエラーに加えて、イベントでも数える
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] }
    w.__csp = []
    document.addEventListener('securitypolicyviolation', (e) => w.__csp.push(`${e.violatedDirective} ${e.blockedURI}`))
  })
  page.on('pageerror', (e) => sink.errors.push(`${path}: ${String(e)}`))
  page.on('console', (m) => {
    if (m.type() === 'error') sink.errors.push(`${path}: ${m.text()}`)
  })
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (u.protocol === 'http:' || u.protocol === 'https:') sink.origins.add(u.origin)
  })
  page.on('websocket', (ws) => sink.sockets.push(ws.url()))
  page.on('response', async (r) => {
    if (r.url() === `${apiOrigin}/api/rooms` && r.request().method() === 'POST') sink.createHeaders.push(await r.allHeaders())
  })
  await page.goto(`${APP}${path}`)
  await page.waitForFunction(() => Boolean((window as unknown as { __SY__?: unknown }).__SY__), undefined, { timeout: 30_000 })
  opened.push(page)
  return page
}

async function state(page: Page): Promise<SyState> {
  return page.evaluate(() => (window as unknown as { __SY__: { state(): SyState } }).__SY__.state())
}

async function sy(page: Page, fn: string, ...args: unknown[]): Promise<void> {
  await page.evaluate(
    ([name, rest]) => {
      const api = (window as unknown as { __SY__: Record<string, (...a: unknown[]) => void> }).__SY__
      api[name as string]?.(...(rest as unknown[]))
    },
    [fn, args] as const,
  )
}

async function waitScreen(page: Page, screen: string, timeout = 30_000): Promise<void> {
  await expect.poll(async () => (await state(page)).screen, { timeout, message: `画面 ${screen}` }).toBe(screen)
}

function player(s: SyState, slot: number): SyPlayer | undefined {
  return s.players.find((p) => p.slot === slot)
}

/** 通信の記録：許可した2つの origin（画面と Worker）以外へ出ていない・CSP の違反が0・WebSocket は Worker だけ */
async function expectContained(sink: Sink, pages: Page[]): Promise<void> {
  expect(sink.errors).toEqual([])
  expect([...sink.origins].filter((o) => o !== appOrigin && o !== apiOrigin)).toEqual([])
  expect(sink.sockets.length).toBeGreaterThanOrEqual(2)
  expect(sink.sockets.filter((u) => !u.startsWith(`${apiWs}/api/`))).toEqual([])
  for (const p of pages) expect(await p.evaluate(() => (window as unknown as { __csp: string[] }).__csp)).toEqual([])
}

/**
 * WebSocket の握手だけを送り、サーバーの返答の状態（101＝開く・403＝断る）を読む。
 * WebSocket の error では理由が分からず、「壊れて落ちた」と「Origin で断られた」を見分けられないため。
 */
function handshake(path: string, origin: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${apiOrigin}${path}`)
    const lib = url.protocol === 'https:' ? https : http
    const req = lib.request(url, {
      headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': randomBytes(16).toString('base64'), Origin: origin },
      timeout: 8000,
    })
    req.on('upgrade', (res, socket) => {
      socket.destroy()
      resolve(res.statusCode ?? 0)
    })
    req.on('response', (res) => {
      res.resume()
      resolve(res.statusCode ?? 0)
    })
    req.on('timeout', () => req.destroy(new Error(`握手が時間切れ: ${path}`)))
    req.on('error', reject)
    req.end()
  })
}

const sinks: Sink[] = []
function newSink(): Sink {
  const sink: Sink = { errors: [], origins: new Set(), sockets: [], createHeaders: [] }
  sinks.push(sink)
  return sink
}

test.beforeEach(({}, testInfo) => {
  test.skip(!APP || !API, 'npm run e2e:split から回す（SPLIT_APP_URL・SPLIT_API_URL が要る）')
  test.skip(testInfo.project.name !== 'desktop', '2つのブラウザの対戦は desktop の1回だけ回す（流量の上限を食い合わないため）')
  test.setTimeout(180_000)
})

test.afterEach(async ({}, testInfo) => {
  // 落ちたときは、通信とコンソールの記録を残す（接続先・CORS・CSP のどれで止まったかを読めるように）
  if (testInfo.status !== testInfo.expectedStatus) {
    for (const s of sinks) {
      console.log(JSON.stringify({ errors: s.errors, origins: [...s.origins], sockets: s.sockets, createHeaders: s.createHeaders }, null, 1))
    }
  }
  sinks.length = 0
  for (const p of opened.splice(0)) await p.context().close()
})

test('Pages の配信：セキュリティ見出しが付き、connect-src が Worker の住所を含み、存在しない住所は404', async ({ request }) => {
  const res = await request.get(`${APP}/`)
  expect(res.status()).toBe(200)
  const h = res.headers()
  const csp = h['content-security-policy'] ?? ''
  expect(csp).toContain(`connect-src 'self' ${WORKER_ORIGIN} ${WORKER_ORIGIN.replace('https:', 'wss:')}`)
  expect(csp).toContain("'wasm-unsafe-eval'")
  // 公開後は、本番の Pages が配る CSP が Worker 側と1字も違わない
  if (LIVE) expect(csp).toBe(CONTENT_SECURITY_POLICY)
  expect(h['x-frame-options']).toBe('DENY')
  expect(h['cross-origin-opener-policy']).toBe('same-origin')
  expect(h['permissions-policy']).toBe('camera=(), microphone=(), geolocation=()')
  expect(h['x-content-type-options']).toBe('nosniff')
  // Pages はトップを返さず、404.html で404を返す（外した住所を200で返す罠を避ける）
  expect((await request.get(`${APP}/nonexistent-path-xyz`)).status()).toBe(404)
  // 許諾の文
  const licenses = await request.get(`${APP}/licenses.txt`)
  expect(licenses.status()).toBe(200)
  expect(await licenses.text()).toContain('The MIT License')
})

test('友だちと：別 origin の画面から、部屋づくり→?room= のリンクで入る→はじめる→互いの動きと参加者のベルの点が両方に出る→主の forceEnd で両方に結果', async ({ browser }) => {
  const sink = newSink()
  const host = await openApp(browser, `/?debug=1${apiQuery}`, sink)

  await host.locator('[data-a=friends]').click()
  await host.locator('#sy-name').fill('ホスト')
  await host.locator('[data-a=create]').click()
  await waitScreen(host, 'lobby')
  const tiles = host.locator('.sy-code-tile')
  await expect(tiles).toHaveCount(4)
  const code = (await tiles.allTextContents()).join('')
  expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}$/)

  const guest = await openApp(browser, `/?room=${code}&debug=1${apiQuery}`, sink)
  await expect(guest.locator('#sy-code')).toHaveValue(code)
  await guest.locator('#sy-name').fill('ゲスト')
  await guest.locator('[data-a=join]').click()
  await waitScreen(guest, 'lobby')

  await expect(host.locator('[data-a=start]')).toHaveAttribute('aria-disabled', 'false', { timeout: 15_000 })
  await host.locator('[data-a=start]').click()
  await waitScreen(host, 'playing')
  await waitScreen(guest, 'playing')
  await expect.poll(async () => (await state(guest)).phase, { timeout: 20_000 }).toBe('playing')
  await expect.poll(async () => (await state(host)).phase, { timeout: 20_000 }).toBe('playing')
  for (const p of [host, guest]) expect((await state(p)).players.map((x) => x.name).sort()).toEqual(['ゲスト', 'ホスト'])

  // 参加者が西へ走る → 主の画面でも西へ。主が東へ走る → 参加者の画面でも東へ
  const startX = player(await state(host), 1)?.pos.x ?? 0
  await sy(guest, 'input', { moveX: -1 }, 40)
  await expect.poll(async () => startX - (player(await state(host), 1)?.pos.x ?? startX), { timeout: 15_000 }).toBeGreaterThan(1)
  const hostX = player(await state(guest), 0)?.pos.x ?? 0
  await sy(host, 'input', { moveX: 1 }, 40)
  await expect.poll(async () => (player(await state(guest), 0)?.pos.x ?? hostX) - hostX, { timeout: 15_000 }).toBeGreaterThan(1)

  // 参加者がベルを鳴らす → 点は主の店で参加者の slot に入り、両方の画面に出る
  const bell = storeLayout().places.bell
  await sy(guest, 'teleport', 1, bell.x, bell.z)
  await expect
    .poll(async () => {
      const p = player(await state(host), 1)
      return p ? Math.hypot(p.pos.x - bell.x, p.pos.z - bell.z) : 99
    }, { timeout: 15_000 })
    .toBeLessThan(1)
  for (let i = 0; i < 12; i++) {
    await sy(guest, 'input', { action: true, actionPressed: true }, 1)
    await guest.waitForTimeout(120)
    await sy(guest, 'input', { actionReleased: true }, 1)
    await guest.waitForTimeout(120)
  }
  await expect.poll(async () => player(await state(host), 1)?.score ?? 0, { timeout: 15_000 }).toBeGreaterThanOrEqual(40)
  await expect.poll(async () => player(await state(guest), 1)?.score ?? 0, { timeout: 15_000 }).toBeGreaterThanOrEqual(40)

  await sy(host, 'forceEnd')
  await waitScreen(host, 'results')
  await waitScreen(guest, 'results')
  for (const p of [host, guest]) {
    const r = (await state(p)).result
    expect(r?.aborted).toBe(false)
    expect(r?.players.map((x) => x.name).sort()).toEqual(['ゲスト', 'ホスト'])
  }

  // 部屋づくりの応答は、画面の origin にだけ CORS で読ませている（Origin をそのまま返し、Vary: Origin）
  expect(sink.createHeaders).toHaveLength(1)
  expect(sink.createHeaders[0]?.['access-control-allow-origin']).toBe(appOrigin)
  expect(sink.createHeaders[0]?.vary?.toLowerCase()).toContain('origin')
  expect(sink.createHeaders[0]?.['access-control-allow-credentials']).toBeUndefined()
  await expectContained(sink, [host, guest])
})

test('だれかと：別 origin の画面から、相手探しの WebSocket で2人がそろうと仮名で試合が始まる', async ({ browser }) => {
  test.skip(LIVE, '公開後の確認では、知らない人と当たるので流さない')
  const sink = newSink()
  const a = await openApp(browser, `/?debug=1${apiQuery}`, sink)
  const b = await openApp(browser, `/?debug=1${apiQuery}`, sink)
  await a.locator('[data-a=random]').click()
  await b.locator('[data-a=random]').click()
  await waitScreen(a, 'playing')
  await waitScreen(b, 'playing')
  for (const p of [a, b]) {
    const s = await state(p)
    expect(s.players).toHaveLength(2)
    for (const x of s.players) expect(allPseudonyms()).toContain(x.name)
  }
  await expectContained(sink, [a, b])
})

test('Worker の入口：本番の画面の住所にだけ CORS（preflight 含む）を返し、許可していない origin の部屋づくりと WebSocket は断る', async () => {
  // 許可リストの住所（本番の画面）：preflight は204で CORS の見出し
  for (const origin of APP_ORIGINS) {
    const res = await fetch(`${apiOrigin}/api/rooms`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' } })
    expect(res.status, origin).toBe(204)
    expect(res.headers.get('access-control-allow-origin'), origin).toBe(origin)
    expect(res.headers.get('access-control-allow-methods'), origin).toBe('POST')
    expect(res.headers.get('vary')?.toLowerCase(), origin).toContain('origin')
    expect(res.headers.get('access-control-allow-credentials'), origin).toBeNull()
  }
  // 許可していない origin・Origin なし：preflight も部屋づくりも403で、CORS の見出しを付けない
  for (const headers of [{}, { Origin: 'https://evil.example' }, { Origin: 'https://day94.rairakku.com.evil.example' }, { Origin: 'http://day94.rairakku.com' }] as Record<string, string>[]) {
    for (const method of ['OPTIONS', 'POST']) {
      const res = await fetch(`${apiOrigin}/api/rooms`, { method, headers })
      expect(res.status, `${method} ${JSON.stringify(headers)}`).toBe(403)
      expect(res.headers.get('access-control-allow-origin'), `${method} ${JSON.stringify(headers)}`).toBeNull()
    }
  }
  // WebSocket：許可していない origin は握手が403。許可した origin は握手が通り（101）、存在しない部屋は理由つきで閉じられる
  for (const origin of ['https://evil.example', 'https://day94.rairakku.com.evil.example']) {
    expect(await handshake('/api/rooms/ZZZZ/ws', origin), origin).toBe(403)
    expect(await handshake('/api/match/ws', origin), origin).toBe(403)
  }
  for (const origin of APP_ORIGINS) expect(await handshake('/api/rooms/ZZZZ/ws', origin), origin).toBe(101)
  // localhost の例外は、手元の Worker（届いた URL が localhost）だけ。公開の Worker は localhost の origin を断る
  const fromLocalhost = 'http://localhost:4196'
  expect(await handshake('/api/rooms/ZZZZ/ws', fromLocalhost), fromLocalhost).toBe(LIVE ? 403 : 101)
  if (LIVE) {
    const res = await fetch(`${apiOrigin}/api/rooms`, { method: 'POST', headers: { Origin: fromLocalhost } })
    expect(res.status).toBe(403)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  }
})
