import { expect, test } from '@playwright/test';

const APP = '/day-026-tonight-moon/';
const AT = `${APP}?at=2026-09-02T21:00`;
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

async function open(page, url = AT) {
  await page.goto(url);
  await expect(page.locator('#moon-age')).not.toHaveText('—');
}

test('9月2日21時の月齢・呼び名と東京の出入りを表示する', async ({ page }) => {
  await open(page);
  await expect(page.locator('#moon-age')).toHaveText('20.8');
  await expect(page.locator('#moon-name')).toHaveText('二十一日の月');
  // 月の出後、最初に入る時刻を「今夜の月」の組として表示する
  await expect(page.locator('#moonrise')).toHaveText('20:38');
  await expect(page.locator('#moonset')).toHaveText('翌 11:27');
  await expect(page.locator('#sunset')).toHaveText('18:08');
});

test('9月2日の名月カードはあと23日', async ({ page }) => {
  await open(page);
  await expect(page.locator('#harvest-lead')).toHaveText('中秋の名月まで あと 23 日');
  await expect(page.locator('#harvest-date')).toContainText('9月25日（金）');
});

test('9月25日は今夜が中秋の名月で満月は名月の2日後', async ({ page }) => {
  await open(page, `${APP}?at=2026-09-25T20:00`);
  await expect(page.locator('#harvest-lead')).toHaveText('今夜が中秋の名月');
  await expect(page.locator('#full-difference')).toContainText('満月は名月の2日後');
});

test('スライダーで翌日に進み今夜へ戻れる', async ({ page }) => {
  await open(page);
  const originalAge = await page.locator('#moon-age').textContent();
  await page.locator('#date-range').fill('1');
  await expect(page.locator('#date-label')).toContainText('9月3日（木）');
  await expect(page.locator('#moon-age')).not.toHaveText(originalAge);
  await expect(page.locator('#today-button')).toBeVisible();
  await page.locator('#today-button').click();
  await expect(page.locator('#date-label')).toHaveText('9月2日（水）・今夜');
  await expect(page.locator('#moon-age')).toHaveText(originalAge);
});

test('大阪を選ぶと再読込後も大阪', async ({ page }) => {
  await open(page);
  await page.locator('#place-select').selectOption('osaka');
  await expect(page.locator('#place-heading')).toHaveText('大阪の空');
  await page.reload();
  await expect(page.locator('#place-select')).toHaveValue('osaka');
  await expect(page.locator('#place-heading')).toHaveText('大阪の空');
});

test('現在地を使うと丸めた位置で時刻が変わる', async ({ page, context }) => {
  await context.setGeolocation({ latitude: 39.72, longitude: 140.10 });
  await context.grantPermissions(['geolocation']);
  await open(page);
  const before = await page.locator('#moonrise').textContent();
  await page.locator('#geo-button').click();
  await expect(page.locator('#place-select')).toHaveValue('geo');
  await expect(page.locator('#place-heading')).toHaveText('現在地の空');
  await expect(page.locator('#moonrise')).not.toHaveText(before);
});

test('現在地取得の拒否はエラーを出し前の地点を保つ', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition(_success, error) { error({ code: 1 }); } }
    });
  });
  await open(page);
  await expect(page.locator('#place-select')).toHaveValue('tokyo');
  await page.locator('#geo-button').click();
  await expect(page.locator('#geo-status')).toHaveText('現在地を取得できませんでした。地点を選んでください');
  await expect(page.locator('#place-select')).toHaveValue('tokyo');
});

test('見た月は同日1件だけで再読込後も残る', async ({ page }) => {
  await open(page);
  await page.locator('#seen-button').click();
  await expect(page.locator('#stamp-list li')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('#stamp-list li')).toHaveCount(1);
  await expect(page.locator('#seen-button')).toBeDisabled();
  await expect(page.locator('#seen-button')).toHaveText('✓ 記録済み');
  await expect(page.locator('#stamp-list li')).toHaveCount(1);
});

test('帳は2回押しで消す', async ({ page }) => {
  await open(page);
  await page.locator('#seen-button').click();
  await page.locator('#clear-journal').click();
  await expect(page.locator('#clear-journal')).toHaveText('もう一度押すと消えます');
  await expect(page.locator('#stamp-list li')).toHaveCount(1);
  await page.locator('#clear-journal').click();
  await expect(page.locator('#stamp-list li')).toHaveCount(0);
  await expect(page.locator('#journal-empty')).toBeVisible();
});

test('localStorage不可でも画面と計算は動く', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
  });
  await open(page);
  await expect(page.locator('#storage-error')).toBeVisible();
  await expect(page.locator('#moon-age')).toHaveText('20.8');
  await page.locator('#seen-button').click();
  await expect(page.locator('#stamp-list li')).toHaveCount(1);
});

test('reduced motionでは月の出とまたたきを止める', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await expect(page.locator('#moon-canvas')).not.toHaveClass(/is-rising/);
  const animation = await page.locator('.twinkle').first().evaluate((node) => getComputedStyle(node).animationName);
  expect(animation).toBe('none');
});

test('Canvasの説明と44px以上の操作領域がある', async ({ page }) => {
  await open(page);
  await expect(page.locator('#moon-canvas')).toHaveAttribute('aria-label', /月齢 20\.8、二十一日の月、輝面 \d+%/);
  const heights = await page.locator('button, select').evaluateAll((nodes) => nodes.filter((node) => !node.hidden).map((node) => node.getBoundingClientRect().height));
  for (const height of heights) expect(height).toBeGreaterThanOrEqual(44);
});

test('未来の日には見た月を記録できない', async ({ page }) => {
  await open(page);
  await page.locator('#date-range').fill('2');
  await expect(page.locator('#seen-button')).toBeDisabled();
});

test('日の入りから月の出までの差・方位・現在の状態を表示する', async ({ page }) => {
  await open(page);
  await expect(page.locator('#moonrise-direction')).not.toHaveText('');
  await expect(page.locator('#moonset-direction')).not.toHaveText('');
  await expect(page.locator('.difference-row dt')).toHaveText('日の入り → 月の出');
  await expect(page.locator('#sunset-difference')).toHaveText('+2時間31分');
  await expect(page.locator('#hero-rise')).toContainText('月の出 20:38・');
  await expect(page.locator('#now-status')).toContainText('いま出ています');
});

test('1200×750で月・時刻・名月の見出しが同じ画面に収まる', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 750 });
  await open(page);
  for (const selector of ['#moon-canvas', '#times-title', '#harvest-title']) {
    const box = await page.locator(selector).boundingBox();
    expect(box).not.toBeNull();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(750);
  }
});

test('不正なatを無視して通常表示する', async ({ page }) => {
  await open(page, `${APP}?at=2026-02-30T99:99`);
  await expect(page.locator('#date-label')).not.toHaveText('');
  await expect(page.locator('#moon-age')).toHaveText(/^\d+\.\d$/);
});

for (const width of [320, 390, 1280]) {
  test(`${width}px幅で横スクロールがない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    const sizes = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth
    }));
    expect(sizes.scroll).toBeLessThanOrEqual(sizes.client);
  });
}
