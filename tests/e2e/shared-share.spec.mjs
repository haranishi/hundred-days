import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* シェア機能は全アプリ共通のルール（2026-08-17 本人指示）なので、Dayごとではなくここで横断的に見る。
   新しいDayを足したら、このspecが自動でその1件も見にいく。 */

const appsDir = fileURLToPath(new URL('../../apps/', import.meta.url));
const published = readdirSync(appsDir)
  .filter((name) => name.startsWith('day-'))
  .map((dir) => ({ dir, meta: JSON.parse(readFileSync(`${appsDir}${dir}/meta.json`, 'utf8')) }))
  .filter(({ meta }) => (meta.status || 'published') === 'published')
  .sort((a, b) => a.meta.day - b.meta.day);

test('公開しているアプリが1つ以上ある', () => {
  expect(published.length).toBeGreaterThan(0);
});

for (const { dir, meta } of published) {
  test.describe(`Day ${String(meta.day).padStart(3, '0')} ${meta.title}`, () => {
    const url = `https://hundred-days.pages.dev/${dir}/`;

    test('リンクを貼ったときに中身が出る（OGPとcanonical）', async ({ page }) => {
      await page.goto(`/${dir}/`);

      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', url);
      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', meta.title);
      await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', url);
      await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
      // 画像は実在するものを指していること（存在しないURLだとリンクがのっぺらぼうになる）
      const image = await page.locator('meta[property="og:image"]').getAttribute('content');
      expect(image).toContain(dir);
      const shot = await page.request.get(image.replace('https://hundred-days.pages.dev', ''));
      expect(shot.ok(), `og:image が見つからない: ${image}`).toBe(true);
    });

    test('シェア欄が据え付けられている', async ({ page }) => {
      await page.goto(`/${dir}/`);
      const share = page.locator('.share');
      await expect(share).toHaveCount(1, '二重に据え付けていないこと');
      await expect(share).toBeVisible();

      // Xは本文とURLを載せた投稿画面が開く
      const x = share.getByRole('link', { name: 'Xで投稿' });
      const href = await x.getAttribute('href');
      expect(href).toContain('https://x.com/intent/post?');
      expect(href).toContain(encodeURIComponent(url));
      expect(decodeURIComponent(href)).toContain(meta.title);
      await expect(x).toHaveAttribute('rel', 'noopener noreferrer');

      // LINEも公式の共有URLがある
      const line = share.getByRole('link', { name: 'LINEで送る' });
      expect(await line.getAttribute('href')).toContain(encodeURIComponent(url));

      await expect(share.getByRole('button', { name: 'リンクをコピー' })).toBeVisible();

      /* InstagramとYouTubeにはWebから投稿画面を開く公式の仕組みが無い。
         「押しても何も渡らないボタン」を置いていないこと、代わりの方法を書いてあることを固定する */
      await expect(share.getByRole('link', { name: /Instagram|YouTube/i })).toHaveCount(0);
      await expect(share.locator('.share__note')).toContainText('Instagram');
      await expect(share.locator('.share__note')).toContainText('YouTube');
    });

    test('シェアのボタンが押せる大きさで、スマホ幅でも崩れない', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/${dir}/`);

      const heights = await page
        .locator('.share__button')
        .evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().height)));
      expect(heights.length).toBeGreaterThanOrEqual(3);
      for (const height of heights) expect(height).toBeGreaterThanOrEqual(44);

      // 横にはみ出していない
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  });
}

test('コピーボタンは公開URLをそのまま渡す', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'クリップボードの許可はChromiumでだけ与えられる');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  const { dir } = published[published.length - 1];
  await page.goto(`/${dir}/`);
  await page.getByRole('button', { name: 'リンクをコピー' }).click();

  await expect(page.locator('.share__said')).toHaveText('コピーしました');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(`https://hundred-days.pages.dev/${dir}/`);
});
