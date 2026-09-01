import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQuery, onRequestGet, trimPlaces } from '../../../functions/api/day-025/place.js';

const ctx = (query) => ({ request: new Request(`https://x/api/day-025/place${query}`) });
const upstream = (body, status = 200) => new Response(JSON.stringify(body), { status });

test('検索語: 全角半角を揃え、空と長すぎるものを弾く', () => {
  assert.equal(normalizeQuery('  秋田駅  '), '秋田駅');
  assert.equal(normalizeQuery('ｱｷﾀ'), 'アキタ');
  assert.equal(normalizeQuery('   '), null);
  assert.equal(normalizeQuery('あ'.repeat(41)), null);
  assert.equal(normalizeQuery(undefined), null);
});

test('返すのは名前と緯度経度だけ（OSMのメタデータを持ち出さない）', () => {
  const places = trimPlaces([
    { display_name: '秋田駅', lat: '39.7176', lon: '140.1305', place_id: 1, osm_id: 2, licence: 'x' },
    { display_name: '', lat: '1', lon: '1' },
    { display_name: '壊れ', lat: 'abc', lon: '1' },
  ]);
  assert.equal(places.length, 1);
  assert.deepEqual(Object.keys(places[0]).sort(), ['lat', 'lng', 'name']);
});

test('返すのは最大5件', () => {
  const many = Array.from({ length: 9 }, (_, i) => ({ display_name: `p${i}`, lat: '1', lon: '2' }));
  assert.equal(trimPlaces(many).length, 5);
});

test('上流には識別できるUser-Agentを付ける（Nominatimは既定UAを認めない）', async () => {
  let sent;
  await onRequestGet(ctx('?q=秋田駅'), {
    fetchImpl: async (_url, init) => { sent = init; return upstream([]); },
  });
  assert.match(sent.headers['User-Agent'], /hundred-days-day025/);
  assert.match(sent.headers['User-Agent'], /hundred-days\.pages\.dev/);
});

test('不正な検索語は上流に行かず400', async () => {
  let called = false;
  const response = await onRequestGet(ctx('?q=%20%20'), { fetchImpl: async () => { called = true; } });
  assert.equal(response.status, 400);
  assert.equal(called, false);
});

test('正常系は7日キャッシュさせる（結果のキャッシュは方針の要求）', async () => {
  const response = await onRequestGet(ctx('?q=秋田駅'), {
    fetchImpl: async () => upstream([{ display_name: '秋田駅', lat: '39.7', lon: '140.1' }]),
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Cache-Control'), /s-maxage=604800/);
  assert.equal((await response.json()).places.length, 1);
});

test('上流の429・403は429とRetry-Afterで返す', async () => {
  for (const status of [429, 403]) {
    const response = await onRequestGet(ctx('?q=秋田駅'), { fetchImpl: async () => upstream({}, status) });
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('Retry-After'), '30');
  }
});
