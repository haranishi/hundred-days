import { test, expect } from '@playwright/test';

/* Day 021「ちかくのラジオ」。Radio Browser APIと位置情報とaudioをすべてスタブし、
   外部ネットワークへ接続せずに、距離順表示・半径の自動拡大・エラー局のスキップ・
   都道府県フォールバックという骨格の動きを固定する。

   再生の失敗は、URLに /fail を含む局だけ play() を拒否するスタブで再現する
   （アプリ側にテスト用の分岐は置いていない）。 */

const APP = '/day-021-nearby-radio/';
const origin = { latitude: 35.68, longitude: 139.76 };

function station(name, url, lat, uuid) {
  return {
    name,
    url_resolved: url,
    stationuuid: uuid,
    favicon: '',
    tags: 'music,local',
    codec: 'MP3',
    bitrate: 128,
    geo_lat: lat,
    geo_long: 139.76,
    countrycode: 'JP',
    homepage: ''
  };
}

const fixtures = [
  station('Far FM', 'https://stream.test/far', 35.95, 'far'),
  station('Nearest FM', 'https://stream.test/nearest', 35.681, 'near'),
  station('Middle FM', 'https://stream.test/middle', 35.75, 'middle'),
  station('East Radio', 'https://stream.test/east', 35.82, 'east'),
  station('Night Wave', 'https://stream.test/night', 35.90, 'night')
];

async function stubAudio(page) {
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.load = function load() {};
    HTMLMediaElement.prototype.pause = function pause() {};
    HTMLMediaElement.prototype.play = function play() {
      if (String(this.src).includes('/fail')) return Promise.reject(new Error('stubbed failure'));
      queueMicrotask(() => this.dispatchEvent(new Event('playing')));
      return Promise.resolve();
    };
  });
}

async function allowLocation(context) {
  await context.setGeolocation(origin);
  await context.grantPermissions(['geolocation'], { origin: 'http://127.0.0.1:4173' });
}

async function routeApi(page, responder = () => fixtures) {
  await page.route('https://*.api.radio-browser.info/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('/json/url/')) return route.fulfill({ status: 200, json: { ok: true } });
    return route.fulfill({ status: 200, json: responder(url) });
  });
}

test.beforeEach(async ({ page, context }) => {
  await stubAudio(page);
  await allowLocation(context);
});

test('局リストがクライアント計算の距離順で描画される', async ({ page }) => {
  await routeApi(page);
  await page.goto(APP);
  await expect(page.locator('.station-card')).toHaveCount(5);
  await expect(page.locator('.station-name')).toHaveText(['Nearest FM', 'Middle FM', 'East Radio', 'Night Wave', 'Far FM']);
});

test('検索はhttps配信の局に絞って問い合わせる', async ({ page }) => {
  let searchUrl;
  await routeApi(page, (url) => {
    searchUrl = url;
    return fixtures;
  });
  await page.goto(APP);
  await expect(page.locator('.station-card')).toHaveCount(5);
  expect(searchUrl.searchParams.get('is_https')).toBe('true');
});

test('0件レスポンスなら半径を自動で段階拡大する', async ({ page }) => {
  const distances = [];
  await routeApi(page, (url) => {
    const distance = Number(url.searchParams.get('geo_distance'));
    distances.push(distance);
    return distance < 300000 ? [] : fixtures;
  });
  await page.goto(APP);
  await expect(page.locator('.station-card')).toHaveCount(5);
  expect(distances).toEqual([25000, 100000, 300000]);
  await expect(page.locator('input[name="radius"][value="300"]')).toBeChecked();
  await expect(page.locator('#expansion-note')).toHaveText('25kmでは0件 → 300kmに拡大');
});

test('再生エラー局をNGにして距離順の次局へ進む', async ({ page }) => {
  const errorFixtures = [station('Broken FM', 'https://stream.test/fail', 35.681, 'broken'), ...fixtures.slice(2)];
  await routeApi(page, () => errorFixtures);
  await page.goto(APP);
  await expect(page.locator('.station-card')).toHaveCount(errorFixtures.length);
  await page.locator('.station-card').first().click();
  await expect(page.locator('.station-card').first()).toContainText('NG');
  await expect(page.locator('.station-card').nth(1)).toHaveClass(/is-playing/);
});

test('全局の再生失敗時に範囲拡大と再試行の導線を表示する', async ({ page }) => {
  const errorFixtures = [
    station('Broken One', 'https://stream.test/fail-one', 35.681, 'broken-one'),
    station('Broken Two', 'https://stream.test/fail-two', 35.69, 'broken-two')
  ];
  await routeApi(page, () => errorFixtures);
  await page.goto(APP);
  await page.locator('.station-card').first().click();
  await expect(page.getByText('この範囲の局に接続できませんでした')).toBeVisible();
  await expect(page.getByRole('button', { name: '範囲を広げる' })).toBeEnabled();
  await expect(page.getByRole('button', { name: '再試行' })).toBeVisible();
  await expect(page.locator('#player-state')).toHaveText('NO SIGNAL');
});

test('buffering中のカードだけにTUNING表示を出す', async ({ page }) => {
  await routeApi(page);
  await page.goto(APP);
  await page.evaluate(() => {
    HTMLMediaElement.prototype.play = () => new Promise(() => {});
  });
  await page.locator('.station-card').first().click();
  await expect(page.locator('.station-card').first()).toHaveClass(/is-buffering/);
  await expect(page.locator('.station-card').first().locator('.tuning-badge')).toHaveText('TUNING…');
  await expect(page.locator('.station-card').nth(1).locator('.tuning-badge')).toHaveCount(0);
});

test('位置拒否後に都道府県プルダウンで検索できる', async ({ page, context }) => {
  await context.clearPermissions();
  await routeApi(page);
  await page.goto(APP);
  await expect(page.getByText('都道府県を選んでください')).toBeVisible();
  await page.locator('#prefecture-select').selectOption('東京都');
  await expect(page.locator('.station-card')).toHaveCount(5);
  await expect(page.locator('#mode-label')).toHaveText('東京都');
});

for (const width of [320, 390, 1280]) {
  test(`${width}px幅で横スクロールが出ない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await routeApi(page);
    await page.goto(APP);
    await expect(page.locator('.station-card')).toHaveCount(5);
    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflows).toBe(false);
    if (width <= 390) {
      await expect(page.locator('.volume-control svg')).toBeVisible();
      const volumeWidth = await page.locator('.volume-control').evaluate((element) => element.getBoundingClientRect().width);
      expect(volumeWidth).toBeLessThanOrEqual(112);
    }
    if (width === 1280) {
      const contentWidth = await page.locator('.control-panel').evaluate((element) => element.getBoundingClientRect().width);
      expect(contentWidth).toBeLessThanOrEqual(880);
    }
  });
}
