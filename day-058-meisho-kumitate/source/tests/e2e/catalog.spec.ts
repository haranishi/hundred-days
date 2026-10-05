import { expect, test } from '@playwright/test'
import { getLandmark, MODELED_LANDMARK_IDS } from '../../src/shared/landmarks'
import { blockExternal } from './helpers'

test('出典画面に追加24問を含む48名所が載り、スマホ幅でもはみ出さない', async ({ page, context }) => {
  const external = await blockExternal(context)
  await page.goto('/?gfx=test')
  await page.locator('[data-action="credits"]').click()
  await page.locator('[data-action="sources"]').click()
  await expect(page.getByRole('heading', { name: '豆知識の出典' })).toBeVisible()
  await expect(page.locator('.source')).toHaveCount(MODELED_LANDMARK_IDS.length)
  for (const id of MODELED_LANDMARK_IDS) {
    const landmark = getLandmark(id)!
    const row = page.locator('.source').filter({ has: page.locator('.source-name', { hasText: landmark.name }) })
    await expect(row).toHaveCount(1)
    await expect(row.locator('.source-fact')).toHaveText(landmark.fact)
    await expect(row.locator('.source-link').first()).toHaveAttribute('href', /^https:\/\//)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  expect(external).toEqual([])
})
