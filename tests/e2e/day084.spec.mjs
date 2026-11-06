import { test, expect } from '@playwright/test';

const app = '/day-084-airpresenter/';
const canonical = 'https://rairakku.com/100days/day-084-airpresenter/';

// The shared site preview is static. Real relay/PDF/PowerPoint/phone flows run in the web runtime tests.
test('Day84 serves the browser app and direct PowerPoint guidance without an installation flow', async ({ page, request }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(app);
  await expect(page.locator('#choosePdf')).toBeVisible();
  await expect(page.locator('#filePicker')).toHaveAttribute('accept', '.pdf,.pptx,.ppt');
  await expect(page.locator('.browser-intro')).toContainText('インストール不要');
  await expect(page.locator('body')).toContainText('PowerPoint');
  await expect(page.locator('body')).toContainText('PDF');
  await expect(page.locator('body')).toContainText('4時間');
  await expect(page.locator('a[download],#download')).toHaveCount(0);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonical);
  // Runtime source and fixtures must never be served with the app assets.
  for (const path of ['web/worker.mjs', 'web/package-lock.json', 'web/test-fixtures/japanese-presentation.pdf', 'web/test-fixtures/japanese-presentation.pptx', 'web/test-fixtures/japanese-presentation.ppt', 'web/powerpoint.test.mjs', 'source/server.js', 'tools/package.py']) {
    expect((await request.get(app + path)).status(), path).toBe(404);
  }
  expect(errors).toEqual([]);
});

test('Day84 fits three widths and copies only its public URL using the keyboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto(app);
    await expect(page.locator('#choosePdf')).toBeVisible();
    await expect(page.locator('#share')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  const copy = page.locator('#share').getByRole('button', { name: 'リンクをコピー', exact: true });
  await copy.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.share__said')).toContainText('コピーしました');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(canonical);
});
