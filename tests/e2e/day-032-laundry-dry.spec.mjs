import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const APP = '/day-032-laundry-dry/';
const appDir = fileURLToPath(new URL('../../apps/day-032-laundry-dry/', import.meta.url));
const FORECAST = JSON.parse(readFileSync(`${appDir}tests/fixtures/akita-2026-09-08.json`, 'utf8'));

/* 予報は 2026-09-08T00:00 から3日ぶん。時計を固定しないと、明日には別の結果を見ることになる */
const MORNING = new Date('2026-09-08T00:30:00Z'); // 日本時間 09:30
const NIGHT = new Date('2026-09-08T11:30:00Z'); // 日本時間 20:30
const AKITA = { latitude: 39.72, longitude: 140.1 };

const consoleErrors = new WeakMap();
const tolerated = new WeakMap();
const allowFailedRequests = (page) => tolerated.set(page, /Failed to load resource/);

test.beforeEach(async ({ page }) => {
  const errors = [];
  consoleErrors.set(page, errors);
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(async ({ page }) => {
  const skip = tolerated.get(page);
  const errors = (consoleErrors.get(page) ?? []).filter((text) => !skip?.test(text));
  expect(errors, `コンソールにエラーが出ている: ${errors.join(' / ')}`).toEqual([]);
});

/** 天気APIを固定応答に差し替える。返した回数も数える */
async function stubForecast(page, { status = 200, body = FORECAST } = {}) {
  const calls = { count: 0, urls: [] };
  await page.route('**://api.open-meteo.com/**', async (route) => {
    calls.count += 1;
    calls.urls.push(route.request().url());
    if (status !== 200) return route.fulfill({ status, contentType: 'application/json', body: '{}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return calls;
}

async function openAt(page, at = MORNING) {
  await page.clock.setFixedTime(at);
  await page.goto(APP);
}

/** 市区町村から秋田市を選んで結果まで進む */
async function pickAkita(page) {
  await page.getByRole('button', { name: '市区町村から選ぶ' }).click();
  await expect(page.locator('#place-dialog')).toBeVisible();
  await page.locator('#pref-select').selectOption('秋田県');
  await page.locator('#town-select').selectOption('05201');
  await page.getByRole('button', { name: 'この場所にする' }).click();
  await expect(page.locator('#ready')).toBeVisible();
}

test('最初は場所を決める画面で、外へは何も取りに行かない', async ({ page }) => {
  const calls = await stubForecast(page);
  await openAt(page);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'start');
  await expect(page.getByRole('button', { name: '現在地で調べる' })).toBeVisible();
  await expect(page.locator('#ready')).toBeHidden();
  expect(calls.count, '場所を決める前に天気を取りに行っている').toBe(0);
});

test('市区町村を選ぶと、乾く時刻と取り込みの締切が出る', async ({ page }) => {
  const calls = await stubForecast(page);
  await openAt(page);
  await pickAkita(page);

  await expect(page.locator('#place-name')).toHaveText('秋田県秋田市');
  await expect(page.locator('#dry-time')).toHaveText(/^\d{1,2}:\d{2}$/);
  await expect(page.locator('#dry-sub')).toContainText('あと');
  await expect(page.locator('#bring-in')).toContainText('取り込みは');
  await expect(page.locator('#verdict')).not.toBeEmpty();
  expect(calls.count).toBe(1);

  // 叩いているのは Open-Meteo の予報1本だけで、座標は3桁に丸めてある
  const url = new URL(calls.urls[0]);
  expect(url.pathname).toBe('/v1/forecast');
  expect(url.searchParams.get('latitude')).toMatch(/^\d{2}\.\d{1,3}$/);
  expect(url.searchParams.get('longitude')).toMatch(/^\d{3}\.\d{1,3}$/);
  expect(url.searchParams.get('timezone')).toBe('Asia/Tokyo');
  expect(url.searchParams.get('hourly')).toContain('et0_fao_evapotranspiration');
});

test('干し方を変えても再通信せず、厚手のほうが遅く乾く', async ({ page }) => {
  const calls = await stubForecast(page);
  await openAt(page);
  await pickAkita(page);

  const thin = await page.locator('#dry-time').textContent();
  await page.getByRole('radio', { name: /厚手/ }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-fabric', 'thick');
  const thick = await page.locator('#dry-time').textContent();

  expect(thick).not.toBe(thin);
  expect(thick > thin, `厚手(${thick})が薄手(${thin})より早い`).toBe(true);
  expect(calls.count, '切り替えで通信している').toBe(1);
});

test('日かげに変えても再通信しない', async ({ page }) => {
  const calls = await stubForecast(page);
  await openAt(page);
  await pickAkita(page);
  await page.getByRole('radio', { name: '日かげ・軒下' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-place', 'shade');
  expect(calls.count).toBe(1);
});

test('矢印キーで干し方を選べる', async ({ page }) => {
  await stubForecast(page);
  await openAt(page);
  await pickAkita(page);
  await page.getByRole('radio', { name: /ふつう/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#app')).toHaveAttribute('data-fabric', 'thick');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#app')).toHaveAttribute('data-fabric', 'normal');
});

test('夜は「乾きません」と言い切り、次に干すときの提案を出す', async ({ page }) => {
  await stubForecast(page);
  await openAt(page, NIGHT);
  await pickAkita(page);
  await expect(page.locator('#dry-time')).toHaveText('乾きません');
  await expect(page.locator('#dry-sub')).toContainText('明日の朝');
  await expect(page.locator('#best-start')).toBeVisible();
  await expect(page.locator('#best-start')).toContainText('明日の');
});

test('24時間バーは24コマで、乾き上がりの位置に印がつく', async ({ page }) => {
  await stubForecast(page);
  await openAt(page);
  await pickAkita(page);
  const cells = page.locator('#timeline-bar .timeline__cell');
  await expect(cells).toHaveCount(24);
  await expect(page.locator('#timeline-bar [data-dried="true"]')).toHaveCount(1);
  await expect(page.locator('#timeline')).toHaveAttribute('aria-label', /乾きます/);
});

test('計算の根拠を開くと、使った値と但し書きが出る', async ({ page }) => {
  await stubForecast(page);
  await openAt(page);
  await pickAkita(page);
  await page.locator('#why > summary').click();
  await expect(page.locator('#why-formula')).toContainText('ET0');
  await expect(page.locator('#why-values')).toContainText('mm/h');
  await expect(page.locator('.why__caveat')).toContainText('実測値ではありません');
});

test('通信に失敗したら知らせて、やり直せる', async ({ page }) => {
  allowFailedRequests(page);
  const calls = await stubForecast(page, { status: 503 });
  await openAt(page);
  await pickAkita(page).catch(() => {});
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#error-text')).toContainText('取れませんでした');
  await expect(page.getByRole('button', { name: '市区町村から選ぶ' })).toBeVisible();

  await page.unroute('**://api.open-meteo.com/**');
  await stubForecast(page);
  await page.getByRole('button', { name: 'もう一度' }).click();
  await expect(page.locator('#ready')).toBeVisible();
  expect(calls.count).toBe(1);
});

test('現在地を許可すると、いちばん近い市区町村の名前を添えて出す', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(AKITA);
  await stubForecast(page);
  await openAt(page);
  await page.getByRole('button', { name: '現在地で調べる' }).click();
  await expect(page.locator('#ready')).toBeVisible();
  await expect(page.locator('#place-name')).toHaveText('現在地（秋田市あたり）');
});

test('現在地を断られても、市区町村から進める', async ({ page, context }) => {
  await context.clearPermissions();
  await context.setGeolocation(null);
  await stubForecast(page);
  await openAt(page);
  await page.getByRole('button', { name: '現在地で調べる' }).click();
  await expect(page.locator('#geo-note')).toBeVisible();
  await expect(page.locator('#geo-note')).toContainText('市区町村から選んで');
  await pickAkita(page);
});

test('選んだ場所は次に開いたときも残る', async ({ page }) => {
  await stubForecast(page);
  await openAt(page);
  await pickAkita(page);
  await page.getByRole('radio', { name: /厚手/ }).click();

  await page.reload();
  await expect(page.locator('#ready')).toBeVisible();
  await expect(page.locator('#place-name')).toHaveText('秋田県秋田市');
  await expect(page.locator('#app')).toHaveAttribute('data-fabric', 'thick');
});

test('押せるものはどれも44px以上ある', async ({ page }) => {
  await stubForecast(page);
  await openAt(page);
  await pickAkita(page);
  const targets = page.locator('#ready button, #ready summary');
  const count = await targets.count();
  expect(count).toBeGreaterThan(5);
  for (let i = 0; i < count; i += 1) {
    const box = await targets.nth(i).boundingBox();
    const label = (await targets.nth(i).textContent())?.trim().slice(0, 12);
    expect(Math.round(box.height), `「${label}」の高さが44px未満`).toBeGreaterThanOrEqual(44);
  }
});

for (const width of [360, 390, 1280]) {
  test(`幅${width}pxで横スクロールが出ない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 780 });
    await stubForecast(page);
    await openAt(page);
    await pickAkita(page);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${width}px で横に${overflow}pxはみ出している`).toBeLessThanOrEqual(1);
  });
}

test('出典とお断りをいつも出している', async ({ page }) => {
  await stubForecast(page);
  await openAt(page);
  const foot = page.locator('.site-foot');
  await expect(foot).toContainText('Weather data by Open-Meteo.com');
  await expect(foot).toContainText('CC BY 4.0');
  await expect(foot).toContainText('公式の予報ではありません');
  await expect(foot.getByRole('link', { name: /Open-Meteo/ })).toHaveAttribute('href', 'https://open-meteo.com/');
});

test('明日の提案が2行重ならない', async ({ page }) => {
  await stubForecast(page);
  await openAt(page, NIGHT);
  await pickAkita(page);
  // 夜は「いちばん早く乾くのは明日の…」が出る。同じことを言う「明日9時に干すなら」は出さない
  await expect(page.locator('#best-start')).toContainText('明日の');
  await expect(page.locator('#tomorrow')).toBeHidden();
});
