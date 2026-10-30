import { test, expect } from '@playwright/test';
import { createMountedServer } from '../../scripts/serve-mounted.mjs';

// 存在しないURLは、本物の404を返しつつ、案内のあと一覧（か、先頭が実在するDay）へ自動で移る。
// Xなどに貼られた古い・途切れたリンクが、行き止まりにならないため。ルート直下と /100days/ の下の両方で確かめる。
for (const prefix of ['', '/100days']) {
  test.describe(`案内ページ（接頭辞 ${prefix || 'なし'}）`, () => {
    let server;
    let origin;
    test.beforeAll(async () => {
      server = createMountedServer({ prefix });
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      origin = `http://127.0.0.1:${server.address().port}${prefix}`;
    });
    test.afterAll(async () => { await new Promise((resolve) => server.close(resolve)); });

    test('存在しないURLは404で、案内のあと一覧へ移る', async ({ page }) => {
      const response = await page.goto(`${origin}/day-999-nope/`, { waitUntil: 'domcontentloaded' });
      expect(response.status()).toBe(404);
      await expect(page.locator('h1')).toContainText('404');
      await expect(page.locator('#go')).toHaveAttribute('href', `${prefix}/`);
      await page.waitForURL((url) => url.pathname === `${prefix}/`, { timeout: 8000 });
      await expect(page).toHaveTitle('100 DAYS / 100 APPS');
    });

    test('先頭が実在するDayなら、そのDayへ移る（末尾に日本語がくっついたリンク）', async ({ page }) => {
      const response = await page.goto(`${origin}/day-069-nenshu-kabe/${encodeURIComponent('）で次の点を確かめます。')}`, { waitUntil: 'domcontentloaded' });
      expect(response.status()).toBe(404);
      await page.waitForURL((url) => url.pathname === `${prefix}/day-069-nenshu-kabe/`, { timeout: 8000 });
      expect(new URL(page.url()).pathname).toBe(`${prefix}/day-069-nenshu-kabe/`);
    });

    test('途切れたリンク（/day-）は一覧へ移る', async ({ page }) => {
      const response = await page.goto(`${origin}/day-`, { waitUntil: 'domcontentloaded' });
      expect(response.status()).toBe(404);
      await page.waitForURL((url) => url.pathname === `${prefix}/`, { timeout: 8000 });
    });
  });
}
