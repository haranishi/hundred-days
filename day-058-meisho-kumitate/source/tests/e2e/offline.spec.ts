// 外部への通信が0：localhost 以外へのリクエストを全部失敗させても、全部の画面を回ってひとりで1ゲーム遊べる
import { expect, test } from '@playwright/test'
import { blockExternal, playSoloToEnd, startSolo } from './helpers'

test('localhost 以外へのリクエストを全部失敗させても遊べ、外へ出ようとした通信は0件', async ({ page, context }) => {
  const external = await blockExternal(context)
  const failed: string[] = []
  page.on('requestfailed', (r) => failed.push(r.url()))

  // 既定の描画（gfx の指定なし）で開いて、しばらく置く（画面なしのブラウザでは重いので、操作は軽い描画で行う）
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '名所くみたて早押し' })).toBeVisible()
  await page.waitForTimeout(3000)

  // メニューの画面を全部開く
  await page.goto('/?gfx=test')
  for (const [action, heading] of [
    ['howto', '遊び方'],
    ['settings', '設定'],
    ['credits', 'クレジット'],
  ] as const) {
    await page.locator(`[data-action="${action}"]`).first().click()
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    if (action === 'credits') {
      await page.locator('[data-action="sources"]').click()
      await expect(page.getByRole('heading', { name: '豆知識の出典' })).toBeVisible()
      await page.locator('[data-action="back"]').click()
      await expect(page.getByRole('heading', { name: 'クレジット' })).toBeVisible()
    }
    await page.locator('[data-action="back"]').click()
    await expect(page.getByRole('heading', { name: '名所くみたて早押し' })).toBeVisible()
  }

  // ひとりで1ゲーム（自動テストの窓口つき・軽い描画・8倍速）
  await page.goto('/?test=1&seed=5&speed=8&gfx=test')
  await startSolo(page, /見習いガイド/, 'ぜんぶ')
  await playSoloToEnd(page)
  await expect(page.locator('.result')).toBeVisible()

  expect(external).toEqual([])
  expect(failed).toEqual([])
})
