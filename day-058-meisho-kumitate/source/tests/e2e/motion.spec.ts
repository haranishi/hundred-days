// 「動きを減らす」設定と ?gfx=test（軽い描画）で、1ゲームを最後まで遊べる
import { expect, test } from '@playwright/test'
import { correctIndex, pauseGame, playSoloToEnd, resumeGame, startSolo, waitPhase } from './helpers'

test.use({ reducedMotion: 'reduce' })

test('動きを減らす＋?gfx=test：ひとりで1ゲーム遊べ、答えあわせと結果が出る', async ({ page }) => {
  await page.goto('/?test=1&seed=6&speed=8&gfx=test')
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
  await startSolo(page, /伝説のガイド/, '世界')
  const answered = await playSoloToEnd(page, { checkReveal: true })
  expect(answered).toBeGreaterThan(0)
  const result = page.locator('.result')
  await expect(result).toBeVisible()
  await expect(result.locator('.result-headline')).not.toBeEmpty()
  await expect(result.locator('.qr')).toHaveCount(8)
})

test('動きを減らす：まちがいの −200 は動かさずに見せる', async ({ page }) => {
  await page.goto('/?test=1&seed=3&speed=8&gfx=test')
  await page.locator('[data-action="duo"]').click()
  await page.getByRole('button', { name: 'はじめる' }).click()
  await expect(page.locator('.buzzer[data-player="p1"]')).toBeEnabled()
  await pauseGame(page)
  await page.keyboard.press('f')
  await waitPhase(page, ['answering'])
  const correct = await correctIndex(page)
  await page.keyboard.press(String(((correct + 1) % 4) + 1))
  const pop = page.locator('.chip[data-player="p1"] .delta-pop')
  await expect(pop).toBeVisible()
  // 動きを止めても、透明にならずに見えている
  expect(Number(await pop.evaluate((el) => getComputedStyle(el).opacity))).toBeGreaterThan(0.9)
  await expect(page.locator('.buzzer[data-player="p1"]')).toHaveAttribute('data-state', 'locked')
  await resumeGame(page)
})
