import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

/* Day100 kamoku。会計の処理と SQLite はブラウザの中で動くので、本番と同じ CSP を付けて、
   画面の操作だけで確かめる。kamoku 本体の細かい条件は kamoku 側の試験が受け持つ。 */

const DIR = 'day-100-kamoku';
const BASE = `/${DIR}/`;
const PUBLIC_URL = 'https://rairakku.com/100days/day-100-kamoku/';
const headers = readFileSync(new URL('../../dist/_headers', import.meta.url), 'utf8');
const rule = headers.split(`/${DIR}/*`)[1]?.split(/\n(?=\S)/)[0] || '';
const csp = rule.match(/Content-Security-Policy:\s*([^\n]+)/)?.[1];
const observations = new WeakMap();

test.use({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo', acceptDownloads: true });

test.beforeEach(async ({ page, context, baseURL }) => {
  expect(csp, 'Day100の生成CSPがない').toBeTruthy();
  expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(csp).not.toContain("'unsafe-eval'");
  const record = { outside: [], errors: [], policy: [] };
  observations.set(page, record);
  const origin = new URL(baseURL).origin;
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (/^(?:data|blob):/.test(url.protocol)) return;
    if (url.origin !== origin || url.pathname.startsWith('/api/')) record.outside.push(request.url());
  });
  page.on('pageerror', (error) => record.errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && /content.security.policy|violates.*directive/i.test(message.text())) record.policy.push(message.text());
  });
  await page.addInitScript(() => {
    window.__day100Policy = [];
    document.addEventListener('securitypolicyviolation', (event) => window.__day100Policy.push(event.effectiveDirective));
  });
  // serve-dist は _headers を読まないので、生成した本番の CSP を応答に付けて動かす
  await context.route(`**${BASE}**`, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } });
  });
});

test.afterEach(async ({ page }) => {
  const record = observations.get(page);
  expect(record.outside, '配信元以外か /api/ への通信がある').toEqual([]);
  expect(record.errors).toEqual([]);
  expect(record.policy).toEqual([]);
  if (!page.isClosed()) expect(await page.evaluate(() => window.__day100Policy || [])).toEqual([]);
});

async function openDemo(page) {
  await page.goto(BASE);
  await expect(page.locator('main h1')).toHaveText('ホーム');
  await expect(page.locator('.banner-title')).toHaveText('お試し版です');
}

const go = (page, hash) => page.evaluate((next) => { location.hash = next; }, hash);

async function addSupplies(page, description, amount) {
  await go(page, '#/entry');
  const form = page.locator('form.entry-form');
  await expect(form.getByLabel('日付')).toHaveValue(/^2026-09-30/);
  await form.getByLabel('金額').fill(amount);
  await form.getByRole('combobox', { name: /科目/ }).click();
  await page.keyboard.insertText('しょうもう');
  await page.keyboard.press('Enter');
  await expect(form.getByRole('combobox', { name: /科目/ })).toHaveValue('消耗品費');
  const wallet = form.getByRole('combobox', { name: /口座/ }).last();
  if (!(await wallet.inputValue()).includes('現金')) {
    await wallet.click();
    await page.keyboard.insertText('現金');
    await page.keyboard.press('Enter');
  }
  await form.getByLabel('摘要').fill(description);
  await page.getByRole('button', { name: /保存して続ける/ }).click();
  await expect(page.locator('.toast').filter({ hasText: 'を登録しました' })).toBeVisible();
}

test('開くと、架空の帳簿の画面が出て、帯に100日チャレンジと共有の入口がある', async ({ page }) => {
  await openDemo(page);
  await expect(page.getByText('サンプル事務所（デモ）').first()).toBeVisible();
  await expect(page.locator('.d100-bar')).toContainText('Day 100');
  await expect(page.getByRole('button', { name: 'このアプリを共有する' })).toBeVisible();
  await expect(page.getByRole('link', { name: '100日チャレンジ' })).toHaveAttribute('href', '../');
});

test('登録した取引を、理由を付けて訂正し、取り消せる。再読み込みで最初の帳簿に戻る', async ({ page }) => {
  await openDemo(page);
  const description = 'Day100の試し書き';
  await addSupplies(page, description, '3300');

  await go(page, `#/journal?q=${encodeURIComponent(description)}`);
  const row = page.locator('.journal-table tbody tr', { hasText: description });
  await expect(row).toHaveCount(1);
  await row.click();
  await expect(page.getByRole('dialog')).toContainText(description);
  await page.keyboard.press('e');
  await expect(page.locator('main h1')).toHaveText('取引を訂正');
  await page.locator('form.entry-form').getByLabel('金額').fill('3850');
  await page.getByLabel('訂正の理由').fill('金額の入力ミス');
  await page.getByRole('button', { name: /訂正を確かめる/ }).click();
  await page.getByRole('button', { name: '訂正を保存' }).click();
  await expect(page.getByRole('dialog')).toContainText('訂正 第2版');

  await page.keyboard.press('v');
  const confirm = page.getByRole('dialog', { name: '仕訳を取り消しますか' });
  await confirm.getByLabel('取消の理由').fill('試し書きのため');
  await confirm.getByRole('button', { name: '取り消す' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(page.getByRole('dialog')).toContainText('取消済み');

  await page.reload();
  await expect(page.locator('main h1')).toBeVisible();
  await go(page, `#/journal?q=${encodeURIComponent(description)}`);
  await expect(page.locator('main h1')).toHaveText('仕訳帳');
  await expect(page.locator('.journal-table tbody tr', { hasText: description })).toHaveCount(0);
});

test('仕訳帳をCSVで書き出せる', async ({ page }) => {
  await openDemo(page);
  await go(page, '#/settings?section=data');
  const pending = page.waitForEvent('download');
  await page.getByRole('link', { name: '仕訳帳のCSV' }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  expect(readFileSync(await download.path(), 'utf8')).toContain('日付');
});

test('共有の窓は、公開URLを渡し、開いている間のキー操作を後ろの画面へ渡さない', async ({ page }) => {
  await openDemo(page);
  const opener = page.getByRole('button', { name: 'このアプリを共有する' });
  await opener.click();
  const dialog = page.locator('#d100-share-dialog');
  await expect(dialog).toBeVisible();
  const x = dialog.getByRole('link', { name: 'Xで投稿' });
  expect(await x.getAttribute('href')).toContain(encodeURIComponent(PUBLIC_URL));
  const before = await page.evaluate(() => location.hash);
  await page.keyboard.press('n');
  await page.keyboard.press('g');
  await page.keyboard.press('j');
  expect(await page.evaluate(() => location.hash)).toBe(before);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

for (const width of [390, 768, 1440]) {
  test(`幅${width}で横にはみ出さず、帯と共有の窓が本体と重ならない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openDemo(page);
    const layout = await page.evaluate(() => {
      const box = (selector) => document.querySelector(selector).getBoundingClientRect();
      const side = document.querySelector('.sidebar');
      const sideShown = side && getComputedStyle(side).display !== 'none';
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        bar: box('.d100-bar').toJSON(),
        bannersTop: box('#banners').top,
        sideRight: sideShown ? side.getBoundingClientRect().right : null,
        sideBottom: sideShown ? box('.sidebar-inner').bottom : null,
        share: box('#d100-share-open').toJSON(),
      };
    });
    expect(layout.overflow).toBeLessThanOrEqual(1);
    expect(layout.bar.bottom).toBeLessThanOrEqual(layout.bannersTop + 1);
    expect(layout.share.height).toBeGreaterThanOrEqual(44);
    if (layout.sideRight !== null) {
      // 帯は左の列の右にあり、左の列（高さは画面と同じで、中が長ければ列の中でスクロール）は、開いた直後の画面に収まる
      expect(layout.bar.left).toBeGreaterThanOrEqual(layout.sideRight - 1);
      expect(layout.sideBottom).toBeLessThanOrEqual(844 + 1);
    }
    await page.getByRole('button', { name: 'このアプリを共有する' }).click();
    const inside = await page.locator('#d100-share-dialog').evaluate((node) => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, spill: node.scrollWidth - node.clientWidth };
    });
    expect(inside.left).toBeGreaterThanOrEqual(0);
    expect(inside.right).toBeLessThanOrEqual(width);
    expect(inside.spill).toBeLessThanOrEqual(1);
  });
}
