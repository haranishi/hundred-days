import { test, expect } from '@playwright/test';

/* さばき場（Day097）。形・時間・手順・採点の正しさは day-097-sabakiba/tests の単体試験が持つ。
   ここでは、実ブラウザで「魚をえらぶ→3Dで手順を最後まで進める→左利き・透視・視点・練習→安全→3Dが使えない端末→スマホの指」を、
   本番と同じCSP・外部通信0で確かめる。開発サーバーで流すときは DAY097_BASE=/ を付ける（tools/playwright.dev.config.mjs）。 */

const base = process.env.DAY097_BASE ?? '/day-097-sabakiba/';
const SPECIES = ['aji', 'iwashi', 'saba', 'sanma', 'tai', 'hirame', 'kisu', 'katsuo'];
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const READY = { timeout: 90_000 };

async function open(page, hash = '', query = 'debug=1') {
  const errors = [], requests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', (r) => requests.push(r.url()));
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective}: ${e.blockedURI}`));
  });
  await page.goto(`${base}?${query}${hash}`);
  const origin = new URL(page.url()).origin;
  // 自分の配信元以外へ出た通信（data:・blob: は除く）
  const externals = () => requests.filter((u) => !/^(data:|blob:|about:)/.test(u) && new URL(u).origin !== origin);
  return { errors, externals };
}
const ready3d = (page) => expect(page.locator('body')).toHaveAttribute('data-ready', 'true', READY);
const cards = (page) => page.locator('[data-testid^="species-card-"]');

test('入口: 8種のカードが並び、方法と初心者向けで絞り込める', async ({ page }) => {
  const { errors } = await open(page);
  await expect(cards(page)).toHaveCount(8);
  await page.getByTestId('filter-method-tebiraki').click();
  await expect(cards(page)).toHaveCount(1);
  await page.getByTestId('filter-method-all').click();
  await page.getByTestId('filter-beginner').click();
  await expect(cards(page)).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('ガイド: アジの15手順を次へで最後まで進み、3Dが出て、できた画面へ着く（外部通信0・CSP違反0）', async ({ page }) => {
  test.setTimeout(180_000);
  const { errors, externals } = await open(page, '#/fish/aji/1');
  await ready3d(page);
  await expect(page.locator('#stage canvas')).toHaveCount(1);
  const stats = await page.evaluate(() => window.__sabaki.stats());
  expect(stats.triangles).toBeGreaterThan(5000);
  expect(stats.stepCount).toBe(15);
  for (let i = 1; i < 15; i++) {
    await expect(page.getByTestId('step-counter')).toContainText(`${i} / 15`);
    await page.getByTestId('btn-next').click();
  }
  await expect(page.getByTestId('step-counter')).toContainText('15 / 15');
  await page.getByTestId('btn-next').click();
  await expect(page).toHaveURL(/#\/done\/aji/);
  expect(errors).toEqual([]);
  expect(externals()).toEqual([]);
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
});

test('左利き・透視・視点・キー操作が効く', async ({ page }) => {
  test.setTimeout(120_000);
  const { errors } = await open(page, '#/fish/aji/1');
  await ready3d(page);
  const place = page.locator('.place-text');
  await expect(place).toContainText('左');
  await page.getByTestId('toggle-left').click();
  await expect(place).toContainText('右');
  await page.getByTestId('toggle-left').click();
  await expect(place).toContainText('左');
  await page.getByTestId('toggle-xray').click();
  expect(await page.evaluate(() => window.__sabaki.state().xray)).toBe(true);
  const view0 = await page.evaluate(() => window.__sabaki.state().view);
  await page.getByTestId('toggle-view').click();
  expect(await page.evaluate(() => window.__sabaki.state().view)).not.toBe(view0);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('step-counter')).toContainText('2 / 15');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('step-counter')).toContainText('1 / 15');
  await page.keyboard.press('x');
  expect(await page.evaluate(() => window.__sabaki.state().xray)).toBe(false);
  expect(errors).toEqual([]);
});

test('手順の一覧シートから好きな手順へ移れる（選ぶと閉じる）', async ({ page }) => {
  test.setTimeout(120_000);
  const { errors } = await open(page, '#/fish/aji/1');
  await ready3d(page);
  await page.getByTestId('btn-steps').click();
  const sheet = page.locator('dialog[open]');
  await expect(sheet).toBeVisible();
  await page.getByTestId('step-item-7').click();
  await expect(page.getByTestId('step-counter')).toContainText('7 / 15');
  await expect(sheet).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('なぞって練習: 切りのある手順で練習を始め、なぞると採点が出る', async ({ page }) => {
  test.setTimeout(150_000);
  const { errors } = await open(page, '#/fish/aji/4');
  await ready3d(page);
  await page.getByTestId('btn-practice').click();
  await expect(page.getByTestId('practice-panel')).toBeVisible();
  const box = await page.locator('#stage canvas').boundingBox();
  const y = box.y + box.height * 0.55;
  await page.mouse.move(box.x + box.width * 0.35, y);
  await page.mouse.down();
  for (let i = 0; i <= 12; i++) await page.mouse.move(box.x + box.width * (0.35 + 0.3 * i / 12), y + (i % 2) * 3, { steps: 2 });
  await page.mouse.up();
  await expect(page.getByTestId('practice-result')).toBeVisible({ timeout: 20_000 });
  expect(errors).toEqual([]);
});

test('さばく前に: 8項目と公的機関の出典リンクが読める', async ({ page }) => {
  const { errors } = await open(page, '#/safety');
  await expect(page.locator('main details')).toHaveCount(8);
  const links = page.locator('main a[href^="https://"]');
  expect(await links.count()).toBeGreaterThanOrEqual(12);
  for (const rel of await links.evaluateAll((as) => as.map((a) => a.rel))) expect(rel).toContain('noopener');
  expect(errors).toEqual([]);
});

test('3Dが使えない端末（?gl=off）では、文章だけの手順で最後まで読める', async ({ page }) => {
  const { errors } = await open(page, '#/fish/aji/1', 'debug=1&gl=off');
  await expect(page.locator('body')).toHaveAttribute('data-gl', 'off');
  await expect(page.locator('ol li').first()).toBeVisible();
  expect(await page.locator('ol > li').count()).toBeGreaterThanOrEqual(15);
  expect(errors).toEqual([]);
});

test('壊れた保存データがあっても起動する', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sabakiba.v1', '{bad json'));
  const { errors } = await open(page);
  await expect(cards(page)).toHaveCount(8);
  expect(errors).toEqual([]);
});

test('動きを減らす設定では、自動再生しない', async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  const { errors } = await open(page, '#/fish/aji/1');
  await ready3d(page);
  expect(await page.evaluate(() => window.__sabaki.state().playing)).toBe(false);
  expect(errors).toEqual([]);
  await context.close();
});

for (const id of SPECIES) {
  test(`${id}: 3Dが出て、最初・中ほど・最後の手順へ飛べる（エラー0）`, async ({ page }) => {
    test.setTimeout(150_000);
    const { errors, externals } = await open(page, `#/fish/${id}/1`);
    await ready3d(page);
    const n = await page.evaluate(() => window.__sabaki.stats().stepCount);
    expect(n).toBeGreaterThanOrEqual(10);
    for (const step of [0, Math.floor(n / 2), n - 1]) await page.evaluate(([sp, s]) => window.__sabaki.goto(sp, s, 1), [id, step]);
    expect(errors).toEqual([]);
    expect(externals()).toEqual([]);
  });
}

test.describe('スマホ（390×844・指）', () => {
  test.use(phone);
  test('入口とガイドが横にはみ出さず、「次へ」は大きく、指でタップして進める', async ({ page }) => {
    test.setTimeout(150_000);
    const { errors } = await open(page);
    await expect(cards(page)).toHaveCount(8);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.evaluate(() => { location.hash = '#/fish/aji/1'; });
    await ready3d(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const next = page.getByTestId('btn-next');
    const box = await next.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    await next.tap();
    await expect(page.getByTestId('step-counter')).toContainText('2 / 15');
    expect(errors).toEqual([]);
  });
});
