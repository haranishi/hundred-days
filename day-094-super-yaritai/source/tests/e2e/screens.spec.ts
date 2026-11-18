// 画面の E2E（本物の index.html をビルドして vite preview で配ったもの）。
// タイトルが出て4つの入口がある・あそびかたへ行って戻れる・タップの的が48px以上・390pxで横にはみ出さない。
// 各画面をダミーのデータで細かく確かめるのは tools/ui-shots.mjs（確認用ページは本番のビルドに入らないため）。
import { expect, test, type Page } from '@playwright/test';

const TITLE = 'スーパーやりたい放題';
const ENTRIES = ['ひとりで遊ぶ', '友だちと対戦', 'だれかと対戦', 'あそびかた'] as const;

async function openTitle(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 60_000 });
  return errors;
}

/** #screens の中の見えている押せる物のうち、48px に足りないもの */
async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('#screens button, #screens a[href], #screens .sy-char-box, #screens .sy-seg-box')) {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      if ((r.width === 0 && r.height === 0) || st.display === 'none' || st.visibility === 'hidden') continue;
      if (r.width < 47.5 || r.height < 47.5) out.push(`${(el.textContent || el.className).trim().slice(0, 12)} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    return out;
  });
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const layer = document.querySelector('#screens .sy-layer');
    return Math.max(document.documentElement.scrollWidth, layer ? layer.scrollWidth : 0) - window.innerWidth;
  });
}

test('タイトル：題字・一言・4つの入口・消音・素材の表記', async ({ page }) => {
  const errors = await openTitle(page);
  await expect(page.getByText('2分間で、スーパーの')).toBeVisible();
  for (const name of ENTRIES) await expect(page.getByRole('button', { name })).toBeVisible();
  await expect(page.getByText('リンクを送って友だちと')).toBeVisible();
  await expect(page.getByText('知らない人と自動で')).toBeVisible();
  await expect(page.getByRole('button', { name: '消音' })).toBeVisible();
  await expect(page.getByText('3D素材：Kenney（CC0）')).toBeVisible();
  // 公開前の調査で勧められた一言と、第三者ライセンスの文（縮めたコードには許諾の文が残らないので別のファイルで配る）
  await expect(page.getByText('架空のお店でのゲームです。現実のお店では、まねしないでね。')).toBeVisible();
  await expect(page.getByRole('link', { name: 'ライセンス' })).toHaveAttribute('href', 'licenses.txt');
  const licenses = await page.request.get('/licenses.txt');
  expect(licenses.status()).toBe(200);
  const licenseText = await licenses.text();
  expect(licenseText).toContain('The MIT License');
  expect(licenseText).toContain('Apache License');
  expect(await smallTargets(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('あそびかたへ行って、もどる', async ({ page }) => {
  await openTitle(page);
  await page.getByRole('button', { name: 'あそびかた' }).click();
  await expect(page.getByRole('heading', { name: 'あそびかた', level: 1 })).toBeVisible();
  await expect(page.locator('#screens .sy-deed')).toHaveCount(10);
  await expect(page.getByText('逆をやればいい。')).toBeVisible();
  expect(await smallTargets(page)).toEqual([]);
  await page.getByRole('button', { name: 'もどる' }).click();
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();
  for (const name of ENTRIES) await expect(page.getByRole('button', { name })).toBeVisible();
});

test('390px：タイトルとあそびかたが横にはみ出さない', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTitle(page);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: 'あそびかた' }).click();
  await expect(page.getByRole('heading', { name: 'あそびかた', level: 1 })).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});
