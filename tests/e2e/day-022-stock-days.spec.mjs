import { expect, test } from '@playwright/test';

const APP = '/day-022-stock-days/';
const consoleErrors = new WeakMap();

test.beforeEach(async ({ page }) => {
  const errors = [];
  consoleErrors.set(page, errors);
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(async ({ page }) => {
  expect(consoleErrors.get(page), 'コンソールエラーが発生した').toEqual([]);
});

async function open(page) {
  await page.goto(APP);
  await expect(page.locator('#summary-main')).toBeVisible();
}

async function fillCore(page) {
  await page.locator('#people').fill('4');
  await page.locator('#water-stock').fill('24');
  await page.locator('#food-stock').fill('20');
  await page.locator('#toilet-stock').fill('30');
}

test('空状態は入力案内を表示する', async ({ page }) => {
  await open(page);
  await expect(page.locator('#summary-main')).toHaveText('人数と在庫を入れると、ここに日数が出ます');
});

test('空状態の要約から飲料水の入力へ移動できる', async ({ page }) => {
  await open(page);
  const action = page.locator('#summary-empty-action');
  await expect(action).toHaveAttribute('href', '#water-stock');
  await action.click();
  await expect(page.locator('#water-stock')).toBeFocused();
});

test('在庫入力後は空状態の入力案内を隠す', async ({ page }) => {
  await open(page);
  await fillCore(page);
  await expect(page.locator('#summary-empty-action')).toBeHidden();
});

test('3行から全体日数と先に尽きる行を出す', async ({ page }) => {
  await open(page);
  await fillCore(page);
  await expect(page.locator('#water-days')).toHaveText('2.0 日');
  await expect(page.locator('#food-days')).toHaveText('1.6 日');
  await expect(page.locator('#toilet-days')).toHaveText('1.5 日');
  await expect(page.locator('#summary-main')).toContainText('あと 1.5 日');
  await expect(page.locator('#summary-main')).toContainText('先に尽きるのは 簡易トイレ');
  await expect(page.locator('[data-row-id="toilet"]')).toHaveClass(/is-bottleneck/);
});

test('要約の日数と事実チップをリンク付きで表示する', async ({ page }) => {
  await open(page);
  await fillCore(page);
  await expect(page.locator('#summary-days')).toHaveText('1.5');
  await expect(page.locator('#summary-bottleneck')).toHaveAttribute('href', '#row-toilet');
  await expect(page.locator('#summary-shortage')).toHaveAttribute('href', '#result');
});

test('要約の不足チップにボトルネック名を表示する', async ({ page }) => {
  await open(page);
  await fillCore(page);
  await expect(page.locator('#summary-shortage')).toContainText('簡易トイレ');
});

test('390px幅で要約バーを120px以内に収める', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await open(page);
  await fillCore(page);
  const height = await page.locator('.summary-wrap').evaluate((element) => element.getBoundingClientRect().height);
  expect(height).toBeLessThanOrEqual(120);
});

test('7日・4人の水不足を60L、2Lペット30本と出す', async ({ page }) => {
  await open(page);
  await fillCore(page);
  const water = page.locator('#shortage-list li').filter({ hasText: '飲料水' });
  await expect(water).toContainText('+60L（2Lペット30本）');
});

test('買い足しリストをクリップボードへコピーする', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Clipboard API の検証は Chromium のみ');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page);
  await fillCore(page);
  await page.locator('#copy-shortage').click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe([
    '7日分まで',
    '飲料水 +60L（2Lペット30本）',
    '食料 +64食',
    '簡易トイレ +110回'
  ].join('\n'));
  await expect(page.locator('#copy-shortage')).toHaveText('コピーしました');
});

test('目標3日と7日を切り替えると不足量が変わる', async ({ page }) => {
  await open(page);
  await fillCore(page);
  await page.locator('input[name="target"][value="3"]').check();
  await expect(page.locator('#shortage-list li').filter({ hasText: '飲料水' })).toContainText('+12L（2Lペット6本）');
  await page.locator('input[name="target"][value="7"]').check();
  await expect(page.locator('#shortage-list li').filter({ hasText: '飲料水' })).toContainText('+60L（2Lペット30本）');
});

test('自由行を追加し、1日の量が空なら除外文言を出す', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: /カセットボンベ/ }).click();
  await page.locator('.custom-card input[id$="-stock"]').fill('3');
  await expect(page.locator('.custom-help')).toHaveText('1日に使う量を入れると日数が出ます');
  await expect(page.locator('.custom-card .days-line')).toContainText('— 日');
  await page.locator('.custom-card input[id$="-per-day"]').fill('1');
  await expect(page.locator('.custom-card .days-line')).toContainText('3.0 日');
});

test('負数は行内エラーにしてサマリーで修正を求める', async ({ page }) => {
  await open(page);
  await page.locator('#water-stock').fill('-1');
  await expect(page.locator('#water-error')).toBeVisible();
  await expect(page.locator('#summary-main')).toHaveText('入力を直してください');
});

test('入力は再読み込み後に復元される', async ({ page }) => {
  await open(page);
  await fillCore(page);
  await page.reload();
  await expect(page.locator('#people')).toHaveValue('4');
  await expect(page.locator('#water-stock')).toHaveValue('24');
  await expect(page.locator('#summary-main')).toContainText('あと 1.5 日');
});

test('入力を消すボタンは2回目で消す', async ({ page }) => {
  await open(page);
  await fillCore(page);
  await page.locator('#clear-button').click();
  await expect(page.locator('#clear-button')).toHaveText('もう一度押すと消えます');
  await expect(page.locator('#water-stock')).toHaveValue('24');
  await page.locator('#clear-button').click();
  await expect(page.locator('#water-stock')).toHaveValue('');
  await expect(page.locator('#summary-main')).toHaveText('人数と在庫を入れると、ここに日数が出ます');
});

test('過去日は期限切れ、30日以内は期限が近いと表示する', async ({ page }) => {
  await open(page);
  await page.locator('#water-expiry').fill('2000-01-01');
  await expect(page.locator('#water-expiry-badge')).toHaveText('期限切れ');
  await expect(page.locator('#summary-expiry')).toContainText('期限切れ: 飲料水');
  const today = await page.evaluate(() => {
    const date = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  });
  await page.locator('#food-expiry').fill(today);
  await expect(page.locator('#food-expiry-badge')).toHaveText('期限が近い');
});

test('localStorageのgetterが例外でも入力と計算が動く', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
  });
  await open(page);
  await expect(page.locator('#storage-error')).toBeVisible();
  await fillCore(page);
  await expect(page.locator('#summary-main')).toContainText('あと 1.5 日');
});

for (const width of [320, 390, 1280]) {
  test(`${width}px幅で横スクロールがない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    await fillCore(page);
    const sizes = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth
    }));
    expect(sizes.scroll).toBeLessThanOrEqual(sizes.client);
  });
}
