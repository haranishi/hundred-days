// 2つのブラウザ（別々のコンテキスト）で、部屋を作る→あいことばで入る→始める→中継→結果 までを通す（E2E_ONLINE=1）。
// ゲームの画面は第2波でつなぐので、ここでは Worker の応答（/api/nothing の404。CSP の見出しつき）を開き、
// その中からブラウザの fetch と WebSocket を使う。CSP の connect-src 'self' のままで同じホストの ws:// に届くことも確かめる。
// 画面ロック中は Chromium が起動しないので SY_BROWSER=webkit で回す。

import { mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import {
  BIN_SELF,
  BIN_STORE,
  decodeSelfState,
  decodeStoreFrame,
  encodeSelfState,
  StoreFrameEncoder,
} from '../../src/shared/protocol'
import { makeView, makeWorld, nudgeProp, sampleResult } from '../unit/net-fixtures'

const EVIDENCE = 'test-results/online-browser'

type Msg = Record<string, unknown> & { type?: string }

/** ページの中に、部屋とやりとりする小さな道具（window.__net）を置く。届いたものは画面に書き出す */
async function installNet(page: Page, label: string): Promise<void> {
  await page.evaluate((who) => {
    type M = Record<string, unknown> & { type?: string }
    const lines: string[] = []
    const state = {
      log: [] as M[],
      bins: [] as number[][],
      ws: null as WebSocket | null,
      closed: false,
      note(text: string): void {
        lines.push(text)
        const body = document.body ?? document.documentElement
        body.innerHTML = ''
        const h = document.createElement('h1')
        h.textContent = `${who}（このブラウザ）`
        h.setAttribute('style', 'font:700 22px system-ui;margin:12px')
        const pre = document.createElement('pre')
        pre.textContent = lines.join('\n')
        pre.setAttribute('style', 'font:15px/1.5 ui-monospace,monospace;margin:12px;white-space:pre-wrap')
        body.append(h, pre)
      },
      connect(code: string, hello: Record<string, unknown>): Promise<M> {
        return new Promise((resolve) => {
          const ws = new WebSocket(`ws://${location.host}/api/rooms/${code}/ws`)
          ws.binaryType = 'arraybuffer'
          state.ws = ws
          ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', ...hello }))
          ws.onclose = () => {
            state.closed = true
          }
          ws.onerror = () => resolve({ type: 'socket-error' })
          ws.onmessage = (e) => {
            if (typeof e.data === 'string') {
              const m = JSON.parse(e.data) as M
              state.log.push(m)
              if (m.type === 'welcome') {
                state.note(`入室：あいことば ${String(m.code)}・席 ${String(m.slot)}（${Number(m.slot) + 1}P）`)
                resolve(m)
              } else if (m.type === 'room') {
                const r = m.room as { phase: string; hostSlot: number; members: { slot: number; name: string }[]; round: number }
                state.note(`部屋：${r.phase}・主 ${r.hostSlot + 1}P・${r.members.map((x) => `${x.slot + 1}P ${x.name}`).join(' / ')}・試合 ${r.round}`)
              } else if (m.type === 'result') {
                const res = m.result as { players: { name: string; score: number; rank: number }[] }
                state.note(`結果：${res.players.map((p) => `${p.rank}位 ${p.name} ${p.score}点`).join(' / ')}`)
              } else if (m.type === 'error') {
                state.note(`断られた：${String(m.code)}`)
                resolve(m)
              } else if (m.type !== 'pong') {
                state.note(`知らせ：${m.type}`)
              }
            } else {
              const bytes = Array.from(new Uint8Array(e.data as ArrayBuffer))
              state.bins.push(bytes)
              const kind = ['?', '自分の様子', '店の様子', '出来事', '意図'][bytes[0] ?? 0] ?? '?'
              state.note(`受信：種類${bytes[0]}（${kind}）${bytes.length}バイト・2バイト目=${bytes[1]}`)
            }
          }
        })
      },
      send(obj: unknown): void {
        state.ws?.send(JSON.stringify(obj))
      },
      sendBin(arr: number[], what: string): void {
        state.ws?.send(new Uint8Array(arr))
        state.note(`送信：種類${arr[0]}（${what}）${arr.length}バイト`)
      },
    }
    ;(window as unknown as { __net: typeof state }).__net = state
  }, label)
}

async function log(page: Page): Promise<Msg[]> {
  return page.evaluate(() => (window as unknown as { __net: { log: Msg[] } }).__net.log)
}

async function bins(page: Page): Promise<number[][]> {
  return page.evaluate(() => (window as unknown as { __net: { bins: number[][] } }).__net.bins)
}

async function waitMsg(page: Page, pred: (m: Msg) => boolean, label: string): Promise<Msg> {
  let hit: Msg | undefined
  await expect.poll(async () => (hit = (await log(page)).find(pred)) !== undefined, { message: label, timeout: 10_000 }).toBe(true)
  return hit as Msg
}

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '2つのブラウザの対戦は desktop の1回だけ回す（流量の上限を食い合わないため）')
})

test('2つのブラウザ：部屋を作る→あいことばで入る→始める→主の店の様子が届き、参加者の様子が slot つきで主に届く→結果', async ({ browser, baseURL }) => {
  mkdirSync(EVIDENCE, { recursive: true })
  const ctxA = await browser.newContext({ viewport: { width: 760, height: 560 } })
  const ctxB = await browser.newContext({ viewport: { width: 760, height: 560 } })
  const a = await ctxA.newPage()
  const b = await ctxB.newPage()
  const errors: string[] = []
  for (const p of [a, b]) p.on('pageerror', (e) => errors.push(String(e)))

  // Worker の応答のページを開く（CSP の見出しが付いている）
  const res = await a.goto(`${baseURL}/api/nothing`)
  expect(res?.headers()['content-security-policy']).toContain("connect-src 'self'")
  await b.goto(`${baseURL}/api/nothing`)
  await installNet(a, 'ブラウザA')
  await installNet(b, 'ブラウザB')

  // A が部屋を作る（ブラウザの fetch。Origin はブラウザが付ける）
  const code = await a.evaluate(async () => {
    const r = await fetch('/api/rooms', { method: 'POST' })
    return ((await r.json()) as { code: string }).code
  })
  expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}$/)

  const wa = await a.evaluate((c) => (window as unknown as { __net: { connect(c: string, h: object): Promise<Msg> } }).__net.connect(c, { name: 'ブラウザA', character: 'ch/character-male-e' }), code)
  expect(wa.type).toBe('welcome')
  // B はあいことばを小文字で打っても入れる（部屋の URL は大文字で組む端末の部品を使わず、ここでは大文字で送る）
  const wb = await b.evaluate((c) => (window as unknown as { __net: { connect(c: string, h: object): Promise<Msg> } }).__net.connect(c, { name: 'ブラウザB' }), code)
  expect(wb.type).toBe('welcome')
  expect([wa.slot, wb.slot]).toEqual([0, 1])
  await waitMsg(a, (m) => m.type === 'room' && (m.room as { members: unknown[] }).members.length === 2, '2人がそろう')

  await a.evaluate(() => (window as unknown as { __net: { send(o: object): void } }).__net.send({ type: 'start' }))
  const cd = await waitMsg(b, (m) => m.type === 'room' && (m.room as { phase: string }).phase === 'countdown', 'カウントダウン')
  const room = cd.room as { seed: number; startAt: number }

  // A（主）が店の様子を送る → B に同じバイト列が届く
  const world = makeWorld(350, room.seed)
  const enc = new StoreFrameEncoder(world)
  const view = makeView(world)
  nudgeProp(view, 3, 0.4, 0, 0.5)
  const frame = Array.from(enc.encode(view, -1500))
  await a.evaluate((arr) => (window as unknown as { __net: { sendBin(a: number[], w: string): void } }).__net.sendBin(arr, '店の様子'), frame)
  await expect.poll(async () => (await bins(b)).find((x) => x[0] === BIN_STORE)?.length ?? 0).toBe(frame.length)
  const atB = (await bins(b)).find((x) => x[0] === BIN_STORE) as number[]
  expect(atB).toEqual(frame)
  expect(decodeStoreFrame(new Uint8Array(atB))?.props.ids).toEqual([3])

  // B（参加者）が自分の様子を送る → A に、部屋が書き込んだ B の slot（1）つきで届く
  const self = Array.from(encodeSelfState({ seq: 1, t: -1400, pos: { x: 4, y: 0, z: 11 }, vel: { x: 0, y: 0, z: -5 }, yaw: 0.3, anim: 'run', ridingCart: null, holding: null, actionHeld: false }))
  await b.evaluate((arr) => (window as unknown as { __net: { sendBin(a: number[], w: string): void } }).__net.sendBin(arr, '自分の様子'), self)
  await expect.poll(async () => (await bins(a)).some((x) => x[0] === BIN_SELF)).toBe(true)
  const atA = (await bins(a)).find((x) => x[0] === BIN_SELF) as number[]
  expect(atA[1]).toBe(1)
  expect(decodeSelfState(new Uint8Array(atA))?.pos.x).toBeCloseTo(4, 2)

  // B が店の様子を送っても（なりすまし）A には届かない
  await b.evaluate((arr) => (window as unknown as { __net: { sendBin(a: number[], w: string): void } }).__net.sendBin(arr, '店の様子・なりすまし'), frame)
  await b.waitForTimeout(400)
  expect((await bins(a)).filter((x) => x[0] === BIN_STORE)).toHaveLength(0)

  // 試合が始まってから、主が結果を送る → 両方に結果
  await expect.poll(() => Date.now() >= room.startAt + 50, { timeout: 8000 }).toBe(true)
  const result = sampleResult()
  await a.evaluate((r) => (window as unknown as { __net: { send(o: object): void } }).__net.send({ type: 'final', round: 1, result: r }), result)
  for (const p of [a, b]) {
    const r = await waitMsg(p, (m) => m.type === 'result', '結果')
    expect((r.result as { players: { name: string }[] }).players.map((x) => x.name)).toEqual(['ブラウザA', 'ブラウザB'])
  }
  expect(errors).toEqual([])
  await a.screenshot({ path: `${EVIDENCE}/online-browser-A.png` })
  await b.screenshot({ path: `${EVIDENCE}/online-browser-B.png` })
  await ctxA.close()
  await ctxB.close()
})
