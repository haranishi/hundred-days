import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const APP = '/day-032-laundry-dry/';
const appDir = fileURLToPath(new URL('../../apps/day-032-laundry-dry/', import.meta.url));
const fixture = (name) => JSON.parse(readFileSync(`${appDir}tests/fixtures/${name}`, 'utf8'));

/* 固定応答は「いまの1時点」だけ。実際に Open-Meteo が返したものをそのまま置いてある。
   昼＝ET0 0.12mm/15分（＝0.48mm/h）でよく乾く、夜＝雨0.9mm/15分で乾かない。

   時計を固定しない。このアプリは端末の時計を読まず、応答の `current.time` だけを見るので、
   いつ流しても同じ画面になる（将来の時刻を扱わなくなった副産物）。 */
const DAY = fixture('akita-current-day.json');
const RAIN = fixture('akita-current-night-rain.json');
/** 固定応答が「いつの値か」。画面に出てよい唯一の時刻 */
const OBSERVED = DAY.current.time.slice(11, 16); // '12:00'

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

/** 天気APIを固定応答に差し替える。返した回数とURLも数える */
async function stubWeather(page, { status = 200, body = DAY, delayMs = 0 } = {}) {
  const calls = { count: 0, urls: [] };
  await page.route('**://api.open-meteo.com/**', async (route) => {
    calls.count += 1;
    calls.urls.push(route.request().url());
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    if (status !== 200) return route.fulfill({ status, contentType: 'application/json', body: '{}' });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: typeof body === 'string' ? body : JSON.stringify(body)
    });
  });
  return calls;
}

/** 市区町村から秋田市を選んで結果まで進む */
async function pickAkita(page, { wait = true } = {}) {
  await page.getByRole('button', { name: '市区町村から選ぶ' }).click();
  await expect(page.locator('#place-dialog')).toBeVisible();
  await page.locator('#pref-select').selectOption('秋田県');
  await page.locator('#town-select').selectOption('05201');
  await page.getByRole('button', { name: 'この場所にする' }).click();
  if (wait) await expect(page.locator('#ready')).toBeVisible();
}

/** 「約1.3時間ぶん」の3行を数値にして返す（薄手・ふつう・厚手の順） */
async function spanHours(page) {
  const texts = await page.locator('#dry-list dd').allInnerTexts();
  return texts.map((text) => Number(text.match(/([\d.]+)\s*時間/)?.[1]));
}

test('最初は場所を決める画面で、外へは何も取りに行かない', async ({ page }) => {
  const calls = await stubWeather(page);
  await page.goto(APP);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'start');
  await expect(page.getByRole('button', { name: '現在地で調べる' })).toBeVisible();
  await expect(page.locator('#ready')).toBeHidden();
  expect(calls.count, '場所を決める前に天気を取りに行っている').toBe(0);
});

test('読み込み中は読み込み中だと知らせる', async ({ page }) => {
  await stubWeather(page, { delayMs: 1500 });
  await page.goto(APP);
  await pickAkita(page, { wait: false });
  await expect(page.locator('#loading')).toBeVisible();
  await expect(page.locator('#loading')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#ready')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#loading')).toBeHidden();
});

test('市区町村を選ぶと、いまの判定と3つの所要時間が同時に出る', async ({ page }) => {
  const calls = await stubWeather(page);
  await page.goto(APP);
  await pickAkita(page);

  await expect(page.locator('#place-name')).toHaveText('秋田県秋田市');
  await expect(page.locator('#observed-at')).toContainText(OBSERVED, { useInnerText: true });
  await expect(page.locator('#verdict')).toHaveText('よく乾きます');
  await expect(page.locator('#rate-line')).toContainText('ET0 0.48 mm/h（日なた）');

  // 干すものは選ばせず、薄手・ふつう・厚手を同時に出す
  await expect(page.locator('#dry-list dt')).toHaveText([/薄手/, /ふつう/, /厚手/]);
  const dd = page.locator('#dry-list dd');
  await expect(dd).toHaveCount(3);
  await expect(dd).toHaveText([/^約[\d.]+時間ぶん$/, /^約[\d.]+時間ぶん$/, /^約[\d.]+時間ぶん$/]);
  const [thin, normal, thick] = await spanHours(page);
  expect(thin, `薄手(${thin}) < ふつう(${normal})`).toBeLessThan(normal);
  expect(normal, `ふつう(${normal}) < 厚手(${thick})`).toBeLessThan(thick);

  expect(calls.count).toBe(1);
  const url = new URL(calls.urls[0]);
  expect(url.pathname).toBe('/v1/forecast');
  expect(url.searchParams.get('latitude')).toMatch(/^\d{2}\.\d{1,3}$/);
  expect(url.searchParams.get('longitude')).toMatch(/^\d{3}\.\d{1,3}$/);
  expect(url.searchParams.get('timezone')).toBe('Asia/Tokyo');
});

/* ここから2本が今回の改修の要。気象業務法17条の予報業務にしないための線を、
   ユニットとは別の角度（実際に飛ぶリクエストと、実際に画面へ出る文字）で固定する */

test('将来を出さない①：天気APIに将来の時刻を要求しない', async ({ page }) => {
  const calls = await stubWeather(page);
  await page.goto(APP);
  await pickAkita(page);
  await page.getByRole('radio', { name: '日かげ・軒下' }).click();
  await page.locator('#why > summary').click();

  expect(calls.urls.length).toBeGreaterThan(0);
  for (const raw of calls.urls) {
    const url = new URL(raw);
    expect(url.origin, '知らない相手に投げている').toBe('https://api.open-meteo.com');
    for (const key of [
      'hourly', 'daily', 'minutely_15',
      'forecast_days', 'forecast_hours', 'forecast_minutely_15',
      'past_days', 'past_hours', 'past_minutes',
      'start_date', 'end_date', 'start_hour', 'end_hour'
    ]) {
      expect(url.searchParams.has(key), `${key} を送っている＝将来の値が返ってくる`).toBe(false);
    }
    expect(url.searchParams.get('current'), 'いまの値を頼んでいない').toContain('et0_fao_evapotranspiration');
  }
});

test('将来を出さない②：画面に出る時刻は「いつの値か」だけ', async ({ page }) => {
  await stubWeather(page);
  await page.goto(APP);
  await pickAkita(page);
  await page.locator('#why > summary').click(); // 折りたたみの中まで見る
  await expect(page.locator('#why-values')).toBeVisible();

  const shown = await page.locator('#ready').innerText();
  const clocks = shown.match(/\d{1,2}:\d{2}/g) ?? [];
  expect(clocks.length, '「いつの値か」すら出ていない').toBeGreaterThan(0);
  expect(
    [...new Set(clocks)],
    `観測時刻(${OBSERVED})以外の時刻が画面に出ている: ${clocks.join(' / ')}`
  ).toEqual([OBSERVED]);

  // 乾き上がりや取り込みの言い回しが復活していないか
  for (const phrase of ['に乾きます', '取り込み', '明日', 'までに']) {
    expect(shown, `「${phrase}」が画面に出ている`).not.toContain(phrase);
  }
});

test('日かげに変えても再通信せず、どれも時間が伸びる', async ({ page }) => {
  const calls = await stubWeather(page);
  await page.goto(APP);
  await pickAkita(page);
  const sun = await spanHours(page);

  await page.getByRole('radio', { name: '日かげ・軒下' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-place', 'shade');
  const shade = await spanHours(page);

  for (const [i, label] of ['薄手', 'ふつう', '厚手'].entries()) {
    expect(shade[i], `${label}が日かげ(${shade[i]})で日なた(${sun[i]})より速い`).toBeGreaterThan(sun[i]);
  }
  expect(calls.count, '切り替えで通信している').toBe(1);
});

test('矢印キーで干す場所を選べる', async ({ page }) => {
  await stubWeather(page);
  await page.goto(APP);
  await pickAkita(page);
  await page.getByRole('radio', { name: '日なた' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#app')).toHaveAttribute('data-place', 'shade');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#app')).toHaveAttribute('data-place', 'sun');
});

test('いま雨なら時間を出さず、理由を言う', async ({ page }) => {
  await stubWeather(page, { body: RAIN });
  await page.goto(APP);
  await pickAkita(page);

  await expect(page.locator('#verdict')).toHaveText('いま雨が降っています');
  await expect(page.locator('#no-dry')).toBeVisible();
  await expect(page.locator('#no-dry')).toContainText('雨に当たると');
  await expect(page.locator('#spans'), '乾かないのに所要時間を出している').toBeHidden();
  await expect(page.locator('#observed-at')).toContainText(RAIN.current.time.slice(11, 16));
});

test('計算の根拠を開くと、使った値と但し書きが出る', async ({ page }) => {
  await stubWeather(page);
  await page.goto(APP);
  await pickAkita(page);
  await page.locator('#why > summary').click();
  await expect(page.locator('#why-formula')).toContainText('ET0');
  await expect(page.locator('#why-values')).toContainText('mm/h');
  await expect(page.locator('#why-values')).toContainText('いつの値か');
  await expect(page.locator('.why__caveat').first()).toContainText('実測値ではありません');
  await expect(page.locator('.why__caveat').last()).toContainText('いまの値');
});

test('通信に失敗したら知らせて、やり直せる', async ({ page }) => {
  allowFailedRequests(page);
  const calls = await stubWeather(page, { status: 503 });
  await page.goto(APP);
  await pickAkita(page, { wait: false });
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#error-text')).toContainText('取れませんでした');
  await expect(page.getByRole('button', { name: '市区町村から選ぶ' })).toBeVisible();

  await page.unroute('**://api.open-meteo.com/**');
  await stubWeather(page);
  await page.getByRole('button', { name: 'もう一度' }).click();
  await expect(page.locator('#ready')).toBeVisible();
  expect(calls.count).toBe(1);
});

test('中身の無い応答もエラーにする（黙って空画面にしない）', async ({ page }) => {
  await stubWeather(page, { body: '{}' });
  await page.goto(APP);
  await pickAkita(page, { wait: false });
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#error-text')).toContainText('取れませんでした');
  await expect(page.locator('#ready')).toBeHidden();
});

test('現在地を許可すると、いちばん近い市区町村の名前を添えて出す', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(AKITA);
  await stubWeather(page);
  await page.goto(APP);
  await page.getByRole('button', { name: '現在地で調べる' }).click();
  await expect(page.locator('#ready')).toBeVisible();
  await expect(page.locator('#place-name')).toHaveText('現在地（秋田市あたり）');
});

test('現在地を断られても、市区町村から進める', async ({ page, context }) => {
  await context.clearPermissions();
  await context.setGeolocation(null);
  await stubWeather(page);
  await page.goto(APP);
  await page.getByRole('button', { name: '現在地で調べる' }).click();
  await expect(page.locator('#geo-note')).toBeVisible();
  await expect(page.locator('#geo-note')).toContainText('市区町村から選んで');
  await pickAkita(page);
});

test('選んだ場所と干す場所は次に開いたときも残る', async ({ page }) => {
  await stubWeather(page);
  await page.goto(APP);
  await pickAkita(page);
  await page.getByRole('radio', { name: '日かげ・軒下' }).click();

  await page.reload();
  await expect(page.locator('#ready')).toBeVisible();
  await expect(page.locator('#place-name')).toHaveText('秋田県秋田市');
  await expect(page.locator('#app')).toHaveAttribute('data-place', 'shade');
});

test('押せるものはどれも44px以上ある', async ({ page }) => {
  await stubWeather(page);
  await page.goto(APP);
  await pickAkita(page);
  const targets = page.locator('#ready button, #ready summary');
  const count = await targets.count();
  expect(count).toBeGreaterThanOrEqual(5);
  for (let i = 0; i < count; i += 1) {
    const box = await targets.nth(i).boundingBox();
    const label = (await targets.nth(i).textContent())?.trim().slice(0, 12);
    expect(Math.round(box.height), `「${label}」の高さが44px未満`).toBeGreaterThanOrEqual(44);
  }
});

for (const width of [360, 390, 1280]) {
  test(`幅${width}pxで横スクロールが出ない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 780 });
    await stubWeather(page);
    await page.goto(APP);
    await pickAkita(page);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${width}px で横に${overflow}pxはみ出している`).toBeLessThanOrEqual(1);
  });
}

test('出典とお断りをいつも出している', async ({ page }) => {
  await stubWeather(page);
  await page.goto(APP);
  const foot = page.locator('.site-foot');
  await expect(foot).toContainText('Weather data by Open-Meteo.com');
  await expect(foot).toContainText('CC BY 4.0');
  await expect(foot).toContainText('天気予報ではありません');
  await expect(foot).toContainText('この先の天気は予想していません');
  await expect(foot.getByRole('link', { name: /Open-Meteo/ })).toHaveAttribute('href', 'https://open-meteo.com/');
});
