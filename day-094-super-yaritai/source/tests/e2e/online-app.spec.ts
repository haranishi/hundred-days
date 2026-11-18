// 本物のアプリを2つのブラウザで開いて、ネット対戦を最後まで通す（E2E_ONLINE=1・画面ロック中は SY_BROWSER=webkit）。
// - 友だちと：部屋を作る → ?room= のリンクで入る → はじめる → 互いのキャラが動いて見える → 参加者がベルを鳴らす →
//   点が両方の画面に出る → 主が forceEnd → 両方に結果
// - だれかと：2人がそろって試合が始まる
// - あいことばちがい：理由が出て、もどれる
// 操作は画面の担当が付けた data-a のボタンを押し、状態は試験用の窓口 window.__SY__（?debug=1）で読む。

import { mkdirSync } from 'node:fs'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { allPseudonyms } from '../../src/shared/names'
import { storeLayout } from '../../src/shared/layout/store'

const EVIDENCE = 'test-results/online-app'

interface SyPlayer {
  slot: number
  name: string
  score: number
  pos: { x: number; y: number; z: number }
}
interface SyState {
  screen: string
  phase: string | null
  timeLeft: number | null
  players: SyPlayer[]
  result: { players: { slot: number; name: string; score: number }[]; aborted: boolean } | null
}

const opened: Page[] = []

async function openApp(browser: Browser, path: string, errors: string[]): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 720 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`${path}: ${String(e)}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${path}: ${m.text()}`)
  })
  await page.goto(path)
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

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '2つのブラウザの対戦は desktop の1回だけ回す（流量の上限を食い合わないため）')
  test.setTimeout(180_000)
})

test.afterEach(async () => {
  for (const p of opened.splice(0)) await p.context().close()
})

test('友だちと：部屋を作る→?room= のリンクで入る→はじめる→互いの動きと参加者のベルの点が両方に出る→主の forceEnd で両方に結果', async ({ browser }) => {
  mkdirSync(EVIDENCE, { recursive: true })
  const errors: string[] = []
  const host = await openApp(browser, '/?debug=1', errors)

  // 主：友だちと → 名前 → 部屋を作る → 待合室にあいことばが出る
  await host.locator('[data-a=friends]').click()
  await host.locator('#sy-name').fill('ホスト')
  await host.locator('[data-a=create]').click()
  await waitScreen(host, 'lobby')
  const tiles = host.locator('.sy-code-tile')
  await expect(tiles).toHaveCount(4)
  const code = (await tiles.allTextContents()).join('')
  expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}$/)

  // 参加者：招待のリンク（?room=）で来ると、あいことばが入った状態で名前の入力へ
  const guest = await openApp(browser, `/?room=${code}&debug=1`, errors)
  await expect(guest.locator('#sy-code')).toHaveValue(code)
  await guest.locator('#sy-name').fill('ゲスト')
  await guest.locator('[data-a=join]').click()
  await waitScreen(guest, 'lobby')

  // 主の待合室に2人がそろい、「はじめる」が押せる
  await expect(host.locator('[data-a=start]')).toHaveAttribute('aria-disabled', 'false', { timeout: 15_000 })
  await host.screenshot({ path: `${EVIDENCE}/friends-lobby-host.png` })
  await guest.screenshot({ path: `${EVIDENCE}/friends-lobby-guest.png` })
  await host.locator('[data-a=start]').click()
  await waitScreen(host, 'playing')
  await waitScreen(guest, 'playing')
  await expect.poll(async () => (await state(guest)).phase, { timeout: 20_000 }).toBe('playing')
  await expect.poll(async () => (await state(host)).phase, { timeout: 20_000 }).toBe('playing')
  for (const p of [host, guest]) {
    const s = await state(p)
    expect(s.players.map((x) => x.name).sort()).toEqual(['ゲスト', 'ホスト'])
  }

  // 参加者が西へ走る → 主の画面でも参加者のキャラが西へ動く
  const startX = player(await state(host), 1)?.pos.x ?? 0
  await sy(guest, 'input', { moveX: -1 }, 40)
  await expect.poll(async () => startX - (player(await state(host), 1)?.pos.x ?? startX), { timeout: 15_000 }).toBeGreaterThan(1)
  // 主が東へ走る → 参加者の画面でも主のキャラが東へ動く
  const hostX = player(await state(guest), 0)?.pos.x ?? 0
  await sy(host, 'input', { moveX: 1 }, 40)
  await expect.poll(async () => (player(await state(guest), 0)?.pos.x ?? hostX) - hostX, { timeout: 15_000 }).toBeGreaterThan(1)

  // 参加者がベルの前へ行き、連打する
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
  // 点は主の店で参加者の slot に入り、両方の画面に出る
  await expect.poll(async () => player(await state(host), 1)?.score ?? 0, { timeout: 15_000 }).toBeGreaterThanOrEqual(40)
  await expect.poll(async () => player(await state(guest), 1)?.score ?? 0, { timeout: 15_000 }).toBeGreaterThanOrEqual(40)
  expect(player(await state(host), 0)?.score).toBe(0)
  await host.screenshot({ path: `${EVIDENCE}/friends-playing-host.png` })
  await guest.screenshot({ path: `${EVIDENCE}/friends-playing-guest.png` })

  // 一時停止（Esc）はネット対戦では試合を止めない：止めている間も残り時間が減り、つづけるで戻れる
  await guest.keyboard.press('Escape')
  await waitScreen(guest, 'paused', 10_000)
  await expect(guest.getByText('試合は止まりません')).toBeVisible()
  const pausedAt = (await state(guest)).timeLeft ?? 0
  await expect.poll(async () => pausedAt - ((await state(guest)).timeLeft ?? pausedAt), { timeout: 10_000 }).toBeGreaterThan(1)
  await guest.locator('[data-a=resume]').click()
  await waitScreen(guest, 'playing', 10_000)

  // 主が試合を終える → 両方に結果（参加者は主の final を待つ）
  await sy(host, 'forceEnd')
  await waitScreen(host, 'results')
  await waitScreen(guest, 'results')
  for (const p of [host, guest]) {
    const r = (await state(p)).result
    expect(r?.aborted).toBe(false)
    expect(r?.players.map((x) => x.name).sort()).toEqual(['ゲスト', 'ホスト'])
    expect(r?.players.find((x) => x.slot === 1)?.score).toBeGreaterThanOrEqual(40)
  }
  // もう一回は主だけ。参加者は主を待つ
  await expect(host.locator('[data-a=rematch]')).toBeVisible()
  await expect(guest.locator('[data-a=rematch]')).toHaveCount(0)
  await host.screenshot({ path: `${EVIDENCE}/friends-results-host.png` })
  await guest.screenshot({ path: `${EVIDENCE}/friends-results-guest.png` })

  // もう一回：同じ顔ぶれで次の試合が始まる
  await host.locator('[data-a=rematch]').click()
  await waitScreen(host, 'playing')
  await waitScreen(guest, 'playing')
  expect(errors).toEqual([])
})

test('だれかと：2人がそろうと仮名で試合が始まる', async ({ browser }) => {
  const errors: string[] = []
  const a = await openApp(browser, '/?debug=1', errors)
  const b = await openApp(browser, '/?debug=1', errors)
  await a.locator('[data-a=random]').click()
  await b.locator('[data-a=random]').click()
  await waitScreen(a, 'playing')
  await waitScreen(b, 'playing')
  for (const p of [a, b]) {
    const s = await state(p)
    expect(s.players).toHaveLength(2)
    for (const x of s.players) expect(allPseudonyms()).toContain(x.name)
  }
  await a.screenshot({ path: `${EVIDENCE}/random-playing-a.png` })
  expect(errors).toEqual([])
})

test('あいことばちがいは理由を出して、友だちとの画面へもどれる', async ({ browser }) => {
  const errors: string[] = []
  const p = await openApp(browser, '/?room=ZZZZ&debug=1', errors)
  await p.locator('#sy-name').fill('まいご')
  await p.locator('[data-a=join]').click()
  await expect(p.getByText('その部屋は見つかりませんでした')).toBeVisible({ timeout: 15_000 })
  await p.locator('[data-a=back]').click()
  await expect(p.locator('#sy-code')).toHaveValue('ZZZZ')
  expect(errors).toEqual([])
})
