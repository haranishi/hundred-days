import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { effectiveStatus } from '../../scripts/lib/day-status.mjs';

/* 外部Dayの紹介ページ（.kiro/specs/external-intro-pages/）の検査。
   meta.json に intro を書いたDayを自動で拾う。Dayが増えても、この試験を書き換えない。

   外部の公開先（externalUrl・codeUrl）へのネットワーク到達性は見ない。外部サイトの停止で、
   このリポジトリのCIが落ちる依存を作らないため。 */

const appsDir = fileURLToPath(new URL('../../', import.meta.url));
const CANONICAL_BASE = 'https://rairakku.com/100days';
const introDays = readdirSync(appsDir)
  .filter((name) => /^day-\d{3}-/.test(name))
  .map((dir) => ({ dir, meta: JSON.parse(readFileSync(`${appsDir}${dir}/meta.json`, 'utf8')) }))
  .filter(({ dir, meta }) => meta.intro && effectiveStatus(meta, dir) === 'external');

test('intro を持つ外部Dayが、少なくとも1つある（この試験が空振りしていない）', () => {
  expect(introDays.length).toBeGreaterThan(0);
});

for (const { dir, meta } of introDays) {
  const num = String(meta.day).padStart(3, '0');
  const path = `/${dir}/`;

  test.describe(`Day ${num} ${meta.title} の紹介ページ`, () => {
    test('主ボタンは外部の公開先へ新しいタブで開く。コードのリンクもある', async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(meta.title);
      // 最初と、注意のあとの2か所。どちらも同じ行き先
      const opens = page.getByRole('link', { name: /アプリを開く/ });
      await expect(opens).toHaveCount(2);
      for (const open of await opens.all()) await expect(open).toHaveAttribute('href', meta.externalUrl);
      const open = opens.first();
      await expect(open).toHaveAttribute('target', '_blank');
      await expect(open).toHaveAttribute('rel', /noopener/);
      if (meta.intro.codeUrl) {
        const code = page.getByRole('link', { name: /コードを見る/ });
        await expect(code).toHaveAttribute('href', meta.intro.codeUrl);
        await expect(code).toHaveAttribute('rel', /noopener/);
      }
    });

    test('検索とSNS向けの情報（title・canonical・OGP・構造化データ）が公開先の住所で入っている', async ({ page }) => {
      await page.goto(path);
      const pageUrl = `${CANONICAL_BASE}/${dir}/`;
      await expect(page).toHaveTitle(new RegExp(`^${meta.title}｜Day ${num}`));
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', pageUrl);
      await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', pageUrl);
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', `${pageUrl}${meta.screenshot}`);
      await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index,follow');
      const graph = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent())['@graph'];
      expect(graph.map((node) => node['@type']).sort()).toEqual(['BreadcrumbList', 'WebPage']);
      expect(graph.find((node) => node['@type'] === 'WebPage').url).toBe(pageUrl);
    });

    test('スクリーンショットが表示され、動画は開いただけでは読み込まれない', async ({ page }) => {
      const requested = [];
      page.on('request', (request) => requested.push(new URL(request.url()).pathname));
      await page.goto(path);
      await expect(page.locator('.shot img')).toBeVisible();
      expect(await page.locator('.shot img').evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
      await page.waitForLoadState('networkidle');
      expect(requested.some((p) => p.endsWith('.mp4')), '動画の本体を先に読んでいない').toBe(false);
      const video = page.locator('video');
      await expect(video).toHaveAttribute('preload', 'none');
      // ポスターは、画面写真とは別の絵を指定できる。指定した画像が実際に配信されている
      const poster = meta.intro.poster || meta.screenshot;
      await expect(video).toHaveAttribute('poster', `./${poster}`);
      expect((await page.request.get(`/${dir}/${poster}`)).ok(), 'ポスターが配信されている').toBe(true);
      await expect(video).toHaveAttribute('controls', '');
    });

    for (const [label, viewport] of [['スマホ幅（390px）', { width: 390, height: 844 }], ['PC幅（1280px）', { width: 1280, height: 800 }]]) {
      test(`${label}で横スクロールが出ず、主ボタンが最初の画面に入る`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto(path);
        await page.evaluate(() => document.fonts.ready);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
        const box = await page.getByRole('link', { name: /アプリを開く/ }).first().boundingBox();
        expect(box.y + box.height, '主ボタンが最初の画面に収まる').toBeLessThanOrEqual(viewport.height);
        expect(box.height, '指で押しやすい高さ').toBeGreaterThanOrEqual(44);
      });
    }

    test('共有：XとLINEは画面の遷移だけで使え、コピーは公開先の住所を写す', async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.goto(path);
      const pageUrl = `${CANONICAL_BASE}/${dir}/`;
      const x = new URL(await page.getByRole('link', { name: /Xで投稿/ }).getAttribute('href'));
      expect(x.origin + x.pathname).toBe('https://x.com/intent/post');
      expect(x.searchParams.get('url')).toBe(pageUrl);
      expect(x.searchParams.get('text')).toContain('#100日チャレンジ');
      const line = new URL(await page.getByRole('link', { name: /LINEで送る/ }).getAttribute('href'));
      expect(line.searchParams.get('url')).toBe(pageUrl);
      // スクリプトが動いたあとだけ、コピーのボタンが見える。端末の共有は、使える端末だけ（この環境には無い）
      const copy = page.getByRole('button', { name: 'リンクをコピー' });
      await expect(copy).toBeVisible();
      await expect(page.getByRole('button', { name: 'ほかのアプリで共有' })).toBeHidden();
      await copy.click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(pageUrl);
      await expect(page.locator('#share-status')).toHaveText('リンクをコピーしました');
    });

    test('共有：端末の共有に対応していれば、そのボタンが出て、公開先の住所を渡す', async ({ page }) => {
      await page.addInitScript(() => {
        window.__shared = null;
        navigator.share = (data) => {
          window.__shared = data;
          return Promise.resolve();
        };
      });
      await page.goto(path);
      const share = page.getByRole('button', { name: 'ほかのアプリで共有' });
      await expect(share).toBeVisible();
      await share.click();
      const shared = await page.evaluate(() => window.__shared);
      expect(shared.url).toBe(`${CANONICAL_BASE}/${dir}/`);
    });

    test('サイトマップに載り、一覧のカードの副リンクから入れる。主ボタンとサムネは外部のまま', async ({ page }) => {
      const sitemap = await (await page.request.get('/sitemap.xml')).text();
      expect(sitemap).toContain(`<loc>${CANONICAL_BASE}/${dir}/</loc>`);

      await page.goto('/');
      const card = page.locator(`.card[data-day="${num}"]`);
      await expect(card.getByRole('link', { name: /紹介ページを開く/ })).toHaveAttribute('href', meta.externalUrl);
      expect(await card.locator('.thumb__link').getAttribute('href')).toBe(meta.externalUrl);
      const intro = card.getByRole('link', { name: /制作の記録/ });
      await expect(intro).toHaveAttribute('href', `./${dir}/`);
      await intro.click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(meta.title);

      // 一覧に戻る
      await page.getByRole('link', { name: '一覧を見る', exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/#day-${num}$`));
    });
  });
}
