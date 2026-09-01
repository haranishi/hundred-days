import { expect, test } from '@playwright/test';

const PATH = '/day-025-nearby-parking/';
const PARKING = '**/api/day-025/parking*';
const PLACE = '**/api/day-025/place*';
const AKITA = { latitude: 39.7176, longitude: 140.1305 };

/* 地図タイルは外へ出さない。空のスタイルを返せばMapLibreは初期化でき、
   マーカーはDOM要素なので選択の検証はそのまま通る。 */
const EMPTY_STYLE = { version: 8, sources: {}, layers: [], glyphs: '', sprite: '' };

const node = (id, tags, offset = 0) => ({
  type: 'node', id, lat: AKITA.latitude + offset / 10000, lon: AKITA.longitude,
  tags: { amenity: 'parking', ...tags },
});

const SAMPLE = [
  node(1, { name: 'トピコ第一駐車場', fee: 'yes', capacity: '64' }, 1),
  node(2, { fee: 'no' }, 3),
  node(3, { name: '駅東駐車場', fee: 'yes' }, 5),
  node(4, {}, 7),
  node(5, { access: 'private' }, 2),
];

async function stub(page, { elements = SAMPLE, status = 200 } = {}) {
  await page.route('https://tiles.openfreemap.org/**', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(EMPTY_STYLE) }));
  await page.route(PLACE, (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ places: [{ name: '秋田駅', lat: AKITA.latitude, lng: AKITA.longitude }] }),
  }));
  const seen = [];
  await page.route(PARKING, (route) => {
    const radius = Number(new URL(route.request().url()).searchParams.get('radius'));
    seen.push(radius);
    if (status !== 200) {
      return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ error: 'rate_limited' }) });
    }
    const list = typeof elements === 'function' ? elements(radius) : elements;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ elements: list }) });
  });
  return seen;
}

const locate = async (page) => {
  await page.getByRole('button', { name: '現在地', exact: true }).click();
};

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(AKITA);
});

test('Day 025 ちかくの駐車場 › 現在地から探すと、地図とリストに同時に出る', async ({ page }) => {
  await stub(page);
  await page.goto(PATH);
  await locate(page);
  // 私有(access=private)は既定で隠すので4件
  await expect(page.locator('.parking-card')).toHaveCount(4);
  await expect(page.locator('#result-count')).toHaveText('4件');
  await expect(page.locator('.parking-marker')).toHaveCount(4);
  // 近い順に並ぶ
  const first = page.locator('.parking-card').first();
  await expect(first).toContainText('トピコ第一駐車場');
});

test('Day 025 ちかくの駐車場 › 料金の3値で絞れる', async ({ page }) => {
  await stub(page);
  await page.goto(PATH);
  await locate(page);
  await page.getByRole('button', { name: '無料', exact: true }).click();
  await expect(page.locator('.parking-card')).toHaveCount(1);
  await expect(page.locator('.parking-card').first()).toContainText('無料');
  await page.getByRole('button', { name: '料金不明', exact: true }).click();
  await expect(page.locator('.parking-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'すべて', exact: true }).click();
  await expect(page.locator('.parking-card')).toHaveCount(4);
});

test('Day 025 ちかくの駐車場 › 行を選ぶと地図の同じ場所が選択状態になる', async ({ page }) => {
  await stub(page);
  await page.goto(PATH);
  await locate(page);
  await expect(page.locator('.parking-marker.is-selected')).toHaveCount(0);
  await page.locator('.parking-card .card-main').nth(1).click();
  await expect(page.locator('.parking-card.is-selected')).toHaveCount(1);
  await expect(page.locator('.parking-marker.is-selected')).toHaveCount(1);
});

test('Day 025 ちかくの駐車場 › ルートはGoogleマップの経路へ渡す', async ({ page }) => {
  await stub(page);
  await page.goto(PATH);
  await locate(page);
  const href = await page.locator('.parking-card').first().getByRole('link', { name: 'ルート' }).getAttribute('href');
  const url = new URL(href);
  expect(url.host).toBe('www.google.com');
  expect(url.pathname).toBe('/maps/dir/');
  expect(url.searchParams.get('destination')).toMatch(/^39\.\d+,140\.\d+$/);
});

test('Day 025 ちかくの駐車場 › 0件なら3200mまで広げるが、往復は2回で止める', async ({ page }) => {
  const seen = await stub(page, { elements: () => [] });
  await page.goto(PATH);
  await locate(page);
  await expect(page.getByText('駐車場が見つかりませんでした')).toBeVisible();
  await expect(page.locator('#banner')).toContainText('3200m');
  // 800m→3200mの2回だけ。旧400/800/1600/3200の4往復に戻したらここで落ちる
  expect(seen).toEqual([800, 3200]);
});

test('Day 025 ちかくの駐車場 › 上限に当たったら専用の文言を出し、叩き直させない', async ({ page }) => {
  const seen = await stub(page, { status: 429 });
  await page.goto(PATH);
  await locate(page);
  await expect(page.locator('#banner')).toContainText('上限に達しました');
  expect(seen).toEqual([800]);
});

test('Day 025 ちかくの駐車場 › 表示上限に当たったら「◯件中50件」と出す', async ({ page }) => {
  const many = Array.from({ length: 120 }, (_, i) => node(100 + i, { fee: 'yes' }, i + 1));
  await stub(page, { elements: many });
  await page.goto(PATH);
  await locate(page);
  await expect(page.locator('.parking-card')).toHaveCount(50);
  await expect(page.locator('#result-count')).toHaveText('120件中50件');
});

test('Day 025 ちかくの駐車場 › 地名検索は中継API経由で、候補から地点を選べる', async ({ page }) => {
  const requests = [];
  page.on('request', (r) => {
    // ファイル名に nominatim を含む自前のモジュールと混同しないよう、ホスト名で見る
    const host = new URL(r.url()).hostname;
    if (/(^|\.)overpass-api\.de$|(^|\.)openstreetmap\.org$/.test(host)) requests.push(r.url());
  });
  await stub(page);
  await page.goto(PATH);
  await page.fill('#place-input', '秋田駅');
  await page.click('#place-submit');
  await page.locator('#place-candidates button').first().click();
  await expect(page.locator('.parking-card')).toHaveCount(4);
  // ブラウザから上流を直接叩いていないこと（利用方針上ここが肝）
  expect(requests).toEqual([]);
});
