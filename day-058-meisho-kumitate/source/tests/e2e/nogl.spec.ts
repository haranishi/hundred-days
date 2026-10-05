// WebGL が使えない端末：描画の mount が例外を投げても止まらず、「3Dの模型を表示できません」と出す
import { expect, test } from '@playwright/test'

test('WebGL が使えないと、その旨の画面を出す', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (/webgl/i.test(type)) return null
      return (original as (...a: unknown[]) => unknown).call(this, type, ...rest)
    } as typeof HTMLCanvasElement.prototype.getContext
  })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'この端末では3Dの模型を表示できません' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.dataset.webgl)).toBe('no')
  expect(errors).toEqual([])
})
