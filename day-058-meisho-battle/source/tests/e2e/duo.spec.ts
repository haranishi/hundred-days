// ふたりで：F で押す→はずれ→−200と締め出し→J で押す→正解
// 8倍速では回答の時間が実時間0.75秒しかないので、押してから確かめ終えるまではゲームの時計を止める（helpers.ts の説明）
import { expect, test } from '@playwright/test'
import { buzzerId, correctIndex, pauseGame, resumeGame, waitPhase } from './helpers'

test('ふたりで：Fで押してはずれ→−200と締め出し→Jで押して正解', async ({ page }) => {
  await page.goto('/?test=1&seed=3&speed=8&gfx=test')
  await page.locator('[data-action="duo"]').click()
  await expect(page.getByRole('heading', { name: 'ふたりで' })).toBeVisible()
  await expect(page.locator('.duo-keys')).toHaveAttribute('aria-label', '左が1P＝Fキー、右が2P＝Jキー')
  await page.getByRole('radio', { name: '日本', exact: true }).check()
  await page.getByRole('button', { name: 'はじめる' }).click()

  // 左下に1P、右下に2Pのボタン（直径110px以上）
  const b1 = page.locator('.buzzer[data-player="p1"]')
  const b2 = page.locator('.buzzer[data-player="p2"]')
  await expect(b1).toBeVisible()
  await expect(b2).toBeVisible()
  const box1 = await b1.boundingBox()
  const box2 = await b2.boundingBox()
  expect(box1 !== null && box2 !== null && box1.x < box2.x).toBe(true)
  expect(box1 !== null && box1.width >= 110 && box1.height >= 110).toBe(true)

  // 1P が F で押して、はずれを選ぶ
  await expect(b1).toBeEnabled()
  await pauseGame(page)
  await page.keyboard.press('f')
  await waitPhase(page, ['answering'])
  expect(await buzzerId(page)).toBe('p1')
  await expect(page.locator('.answer')).toHaveAttribute('data-slot', '0')
  const correct = await correctIndex(page)
  const wrong = (correct + 1) % 4
  await page.keyboard.press(String(wrong + 1))

  // −200 と締め出しがはっきり見える
  const chip1 = page.locator('.chip[data-player="p1"]')
  await expect(chip1.locator('.delta-pop.is-minus')).toHaveText('−200')
  await expect(b1.locator('.delta-pop.is-minus')).toHaveText('−200')
  await expect(chip1.locator('.chip-score')).toHaveText('−200')
  await expect(chip1).toHaveAttribute('data-locked', 'true')
  await expect(chip1.locator('.chip-lock')).toBeVisible()
  await expect(b1).toHaveAttribute('data-state', 'locked')
  await expect(b1).toBeDisabled()
  await expect(b1.locator('.buzzer-lock')).toBeVisible()
  await expect(b1.locator('.buzzer-lock')).toContainText('押せません')
  await expect(page.locator('.toast')).toContainText('まちがい')
  await expect(page.locator('.answer')).toBeHidden()

  // 締め出された1Pがもう一度 F を押しても、答える番にならない
  expect(await waitPhase(page, ['building', 'lastcall'])).not.toBe('answering')
  await page.keyboard.press('f')
  await page.waitForTimeout(80)
  expect(await buzzerId(page)).toBe(null)

  // 2P が J で押して正解
  await expect(b2).toBeEnabled()
  await page.keyboard.press('j')
  await waitPhase(page, ['answering'])
  expect(await buzzerId(page)).toBe('p2')
  await page.keyboard.press(String(correct + 1))
  const reveal = page.locator('.reveal')
  await expect(reveal).toBeVisible()
  await expect(reveal.locator('.reveal-row.is-wrong')).toContainText('1P')
  await expect(reveal.locator('.reveal-row.is-wrong .reveal-delta')).toHaveText('−200')
  await expect(reveal.locator('.reveal-row.is-correct')).toContainText('2P')
  await expect(page.locator('.chip[data-player="p2"] .chip-score')).not.toHaveText('0')
  await resumeGame(page)
})

test('ふたりで：画面のボタンを指で押しても遊べる（右の2Pが押すと2Pの色の枠で4択）', async ({ page }) => {
  await page.goto('/?test=1&seed=4&speed=8&gfx=test')
  await page.locator('[data-action="duo"]').click()
  await page.getByRole('button', { name: 'はじめる' }).click()
  const b2 = page.locator('.buzzer[data-player="p2"]')
  await expect(b2).toBeEnabled()
  await pauseGame(page)
  await b2.click()
  await waitPhase(page, ['answering'])
  expect(await buzzerId(page)).toBe('p2')
  await expect(page.locator('.answer')).toHaveAttribute('data-slot', '1')
  await expect(page.locator('.game')).toHaveAttribute('data-phase', 'answering')
  const i = await correctIndex(page)
  await page.locator(`.choice[data-index="${i}"]`).click()
  await expect(page.locator('.reveal-row.is-correct')).toContainText('2P')
  await resumeGame(page)
})
