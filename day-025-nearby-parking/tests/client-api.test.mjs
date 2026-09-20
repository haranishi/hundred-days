import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequestUrl, ENDPOINT, fetchParking, RATE_LIMIT_STATUS } from '../lib/api.js';
import { buildRequestUrl as buildPlaceUrl, searchPlaces } from '../lib/nominatim.js';

const json = (body, status = 200) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

test('取得先は同一オリジンの中継API（ブラウザからOverpassを直接叩かない）', () => {
  assert.equal(ENDPOINT, '/api/day-025/parking');
  const url = buildRequestUrl(39.7176, 140.1305, 800);
  assert.ok(url.startsWith('/api/day-025/parking?'));
  assert.ok(!/overpass/i.test(url));
});

test('座標は5桁に丸めて送る（同じ場所の再検索がURLごと一致する）', () => {
  assert.match(buildRequestUrl(39.717612345, 140.130554321, 800), /lat=39\.71761&lng=140\.13055&radius=800/);
});

test('地名検索も中継API経由', () => {
  assert.equal(buildPlaceUrl('秋田駅'), '/api/day-025/place?q=%E7%A7%8B%E7%94%B0%E9%A7%85');
});

test('駐車場: elements配列を返す', async () => {
  const elements = await fetchParking(39.7, 140.1, 800, async () => json({ elements: [{ type: 'node', id: 1 }] }));
  assert.equal(elements.length, 1);
});

test('駐車場: elementsが無い応答でも空配列にする', async () => {
  assert.deepEqual(await fetchParking(39.7, 140.1, 800, async () => json({})), []);
});

test('駐車場: 429はrateLimitedを立てて投げる（叩き直させない）', async () => {
  assert.equal(RATE_LIMIT_STATUS, 429);
  await assert.rejects(
    fetchParking(39.7, 140.1, 800, async () => json({ error: 'rate_limited' }, 429)),
    (error) => error.rateLimited === true,
  );
});

test('駐車場: それ以外の失敗はrateLimitedを立てない', async () => {
  await assert.rejects(
    fetchParking(39.7, 140.1, 800, async () => json({ error: 'upstream_unavailable' }, 502)),
    (error) => error.rateLimited === undefined,
  );
});

test('地名検索: placesを返し、429はrateLimitedになる', async () => {
  const places = await searchPlaces('秋田駅', async () => json({ places: [{ name: 'x', lat: 1, lng: 2 }] }));
  assert.equal(places.length, 1);
  await assert.rejects(
    searchPlaces('秋田駅', async () => json({ error: 'rate_limited' }, 429)),
    (error) => error.rateLimited === true,
  );
});
