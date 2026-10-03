import { test, expect } from '@playwright/test';

const path = '/day-056-dragon-rush/';
test('Day56: 開始前に3D・音を読まない', async ({ page }) => {
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('破壊紀行');
  await expect(page.locator('#start')).toBeEnabled();
  expect(requests.some(url => /\.glb|\.ogg|assets\/index-/.test(url))).toBe(false);
  expect(await page.evaluate(() => window.__appReady)).toBeUndefined();
});
test('Day56: スマホの開始が有効で、条件を示し横にはみ出さない', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto(path);
  await expect(page.locator('#start')).toBeEnabled();
  await expect(page.locator('#device-note')).toContainText('横向きでタッチ操作');
  await expect(page.getByText('スマートフォンのタッチ操作に対応。', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.body.classList.contains('dr-mobile'))).toBe(true);
  expect(await page.evaluate(() => window.__appReady)).toBeUndefined();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});
test('Day56: 読み込み失敗を入口に表示する', async ({ page }) => {
  await page.route('**/game/entry.json', route => route.fulfill({ status: 503, body: '' }));
  await page.goto(path);
  await page.locator('#start').click();
  await expect(page.locator('#load-status')).toContainText('失敗');
  await expect(page.locator('#landing')).toBeVisible();
  await expect(page.getByTestId('loading-screen')).toHaveAttribute('data-phase', 'error');
  await expect(page.locator('.dr-load-reload')).toBeVisible();
  await expect(page.locator('.dr-load-reload')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('.dr-load-reload')).toBeFocused();
  await page.locator('.dr-load-reload').click();
  await expect(page.locator('#start')).toBeEnabled();
  await expect(page.getByTestId('loading-screen')).toBeHidden();
});
test('Day56: 本体を待つ間は実進捗・経過時間を出し、背後の操作を止める', async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/game/entry.json', async route => {
    await gate;
    await route.fulfill({ status: 503, body: '' });
  });
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(path);
    await page.locator('#start').click();
    const loading = page.getByTestId('loading-screen');
    await expect(loading).toBeVisible();
    await expect(loading).toHaveAttribute('data-phase', 'loading');
    await expect(loading.locator('progress')).toHaveAttribute('value', '0');
    await expect(page.locator('#landing')).toHaveJSProperty('inert', true);
    await page.keyboard.press('Tab');
    await expect(loading).toBeFocused();
    await expect(loading.locator('[data-loading-time]')).toContainText('1秒', { timeout: 5000 });
    expect(await loading.locator('.dr-load-spinner').evaluate(node => getComputedStyle(node).animationName)).toBe('none');
    for (const [width, height] of [[390, 844], [768, 1024], [1440, 900], [667, 375]]) {
      await page.setViewportSize({ width, height });
      expect(await loading.locator('.dr-load-panel').evaluate(node => {
        const rect = node.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight;
      })).toBe(true);
    }
    await expect(loading.locator('.dr-load-slow')).toBeVisible({ timeout: 20_000 });
    await expect(loading.locator('.dr-load-reload')).toBeVisible();
    await expect(loading).toHaveAttribute('data-phase', 'loading');
    await expect(loading.locator('progress')).toHaveAttribute('value', '0');
  } finally { release(); }
  await expect(page.getByTestId('loading-screen')).toHaveAttribute('data-phase', 'error');
});
test('Day56: クレジットから許諾全文が読める', async ({ page }) => {
  await page.goto(path + 'credits.html');
  for (const href of ['three.txt', 'postprocessing.txt', 'n8ao.txt', 'SMAA.txt', 'BlueNoise.txt', 'BakingLab.txt']) {
    const response = await page.request.get(path + 'game/licenses/' + href);
    expect(response.ok()).toBe(true);
  }
  await expect(page.getByText('自己ベスト', { exact: false })).toBeVisible();
});
