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

    test('ボタンが枠で見分けられる（地色に対して3:1以上）', async ({ page }) => {
      await page.goto(`/${dir}/`);

      /* 枠は currentColor から作った半透明なので、指定値だけ読んでも見え方は分からない。
         地色に混ぜてから測る（文字側で opacity を見ていなかったのと同じ穴を、枠でも作らない）。 */
      const measured = await page.locator('.share__button').evaluateAll((nodes) => {
        const parse = (value) => {
          const numbers = (value.match(/[\d.]+/g) ?? []).map(Number);
          /* color-mix() の計算結果は Chromium では color(srgb 0.93 0.94 0.96 / 0.75) の形で返り、
             各成分が0〜1になる。rgb() と同じ読み方をすると、どんな色もほぼ黒として測ってしまう。 */
          const scale = value.startsWith('color(') ? 255 : 1;
          return { rgb: numbers.slice(0, 3).map((one) => one * scale), alpha: numbers.length > 3 ? numbers[3] : 1 };
        };
        const channel = (value) => {
          const scaled = value / 255;
          return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
        };
        const luminance = (rgb) => 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
        const ratio = (one, other) => (Math.max(one, other) + 0.05) / (Math.min(one, other) + 0.05);

        /* 背景を持ついちばん近い先祖まで遡る。グラデーションで塗っているアプリ（Day009）は
           backgroundColor が透明のままなので、そこで止めると「白の上」として測ってしまう。
           その場合は色の停止点を全部拾い、いちばん条件の悪いところで判定する。 */
        const groundsOf = (node) => {
          let behind = node.parentElement;
          while (behind) {
            const style = getComputedStyle(behind);
            const back = parse(style.backgroundColor);
            if (back.alpha > 0) return [back.rgb];
            if (style.backgroundImage !== 'none') {
              const stops = style.backgroundImage.match(/rgba?\([^)]*\)|color\(srgb[^)]*\)/g);
              if (stops?.length) return stops.map((one) => parse(one).rgb);
            }
            behind = behind.parentElement;
          }
          return [[255, 255, 255]];
        };

        /* 見るのは「枠と地色」。枠と面の比は見ない——塗りのあるボタン（--primary）は
           面そのものが地色との境目になるので、そこまで求めると塗りを濃くできなくなる。 */
        return nodes.map((node) => {
          const edge = parse(getComputedStyle(node).borderTopColor);
          const scores = groundsOf(node).map((ground) => {
            const border = edge.rgb.map((value, index) => edge.alpha * value + (1 - edge.alpha) * ground[index]);
            return ratio(luminance(border), luminance(ground));
          });
          return { name: node.textContent.trim(), ratio: Math.min(...scores) };
        });
      });

      expect(measured.length).toBeGreaterThanOrEqual(3);
      for (const { name, ratio } of measured) expect(ratio, `${name} の枠と地色`).toBeGreaterThanOrEqual(3);
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
