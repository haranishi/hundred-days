import { test, expect } from '@playwright/test';

const path = '/day-056-dragon-rush/';
test('Day56: 開始前に3D・音を読まない', async ({ page }) => {
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('怪獣ラッシュ');
  await expect(page.locator('#start')).toBeEnabled();
  expect(requests.some(url => /\.glb|\.ogg|assets\/index-/.test(url))).toBe(false);
  expect(await page.evaluate(() => window.__appReady)).toBeUndefined();
});
test('Day56: スマホに未対応を明示し、横にはみ出さない', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto(path);
  await expect(page.locator('#start')).toBeDisabled();
  await expect(page.getByText('スマートフォンのタッチ操作には未対応です。', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});
test('Day56: 読み込み失敗を入口に表示する', async ({ page }) => {
  await page.route('**/game/entry.json', route => route.fulfill({ status: 503, body: '' }));
  await page.goto(path);
  await page.locator('#start').click();
  await expect(page.locator('#load-status')).toContainText('失敗');
  await expect(page.locator('#landing')).toBeVisible();
});
test('Day56: クレジットから許諾全文が読める', async ({ page }) => {
  await page.goto(path + 'credits.html');
  for (const href of ['three.txt', 'postprocessing.txt', 'n8ao.txt', 'SMAA.txt', 'BlueNoise.txt', 'BakingLab.txt']) {
    const response = await page.request.get(path + 'game/licenses/' + href);
    expect(response.ok()).toBe(true);
  }
  await expect(page.getByText('自己ベスト', { exact: false })).toBeVisible();
});
