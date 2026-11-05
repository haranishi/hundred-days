import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const app = '/day-084-airpresenter/';
const canonical = 'https://rairakku.com/100days/day-084-airpresenter/';

test('Day84はMac用ローカル版の必要環境と起動方法を案内し、ZIPを入手できる', async ({ page, request }) => {
  const apiCalls = [];
  const errors = [];
  page.on('request', req => { if (new URL(req.url()).pathname.startsWith('/api/')) apiCalls.push(req.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(app);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('スマホが、');
  await expect(page.locator('#requirements')).toContainText('macOS');
  await expect(page.locator('#requirements')).toContainText('Node.js 22');
  await expect(page.locator('#requirements')).toContainText('同じWi-Fi');
  await expect(page.locator('#setup')).toContainText('npm ci');
  await expect(page.locator('#setup')).toContainText('npm start');
  await expect(page.locator('#setup')).toContainText('http://localhost:3084');
  await expect(page.locator('#formats')).toContainText('完全一致');
  await expect(page.locator('#formats')).toContainText('PDF');
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonical);
  const download = page.locator('#download');
  await expect(download).toHaveAttribute('href', 'airpresenter-local.zip');
  await expect(download).toHaveAttribute('download', 'airpresenter-local.zip');
  const zip = await request.get(app + 'airpresenter-local.zip');
  expect(zip.status()).toBe(200);
  expect((await zip.body()).subarray(0, 4).toString('hex')).toBe('504b0304');
  const downloading = page.waitForEvent('download');
  await download.focus();
  await page.keyboard.press('Enter');
  expect((await downloading).suggestedFilename()).toBe('airpresenter-local.zip');
  expect(apiCalls).toEqual([]);
  expect(errors).toEqual([]);
});

test('Day84の3幅で説明と共有欄が収まり、キーボードで起動手順へ進める', async ({ page, context }) => {
  await mkdir('.cache/day084-public', { recursive: true });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto(app);
    await expect(page.locator('#preview')).toBeVisible();
    await expect.poll(() => page.locator('#preview').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(page.locator('.share')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.cache/day084-public/screen-${width}.png`, fullPage: true });
  }
  await page.locator('#setup-link').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#setup$/);
  const copy = page.locator('.share').getByRole('button', { name: 'リンクをコピー', exact: true });
  await copy.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.share__said')).toContainText('コピーしました');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(canonical);
});
