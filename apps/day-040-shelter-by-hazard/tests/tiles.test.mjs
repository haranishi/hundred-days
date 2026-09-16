import test from 'node:test';
import assert from 'node:assert/strict';
import { createTileStore, hazardName, issuedOn, tileEdges, tileOf, tileUrl, tilesNear } from '../lib/tiles.js';

test('区画は実測どおりの番号になる', () => {
  assert.deepEqual(tileOf({ lat: 39.7186, lng: 140.1025 }), { x: 910, y: 388 });
  assert.deepEqual(tileOf({ lat: 35.681, lng: 139.767 }), { x: 909, y: 403 });
  assert.deepEqual(tileOf({ lat: 33.5665, lng: 133.5432 }), { x: 891, y: 410 });
});

test('隣の区画は辺まで5km未満のときだけ増え、角では4区画になる', () => {
  // 秋田駅は、いちばん近い辺まで6.5km以上ある
  assert.deepEqual(tilesNear({ lat: 39.7186, lng: 140.1025 }), [{ x: 910, y: 388 }]);
  // 高知駅は東の辺までおよそ4.7km
  assert.deepEqual(tilesNear({ lat: 33.5665, lng: 133.5432 }), [{ x: 891, y: 410 }, { x: 892, y: 410 }]);

  const edge = tileEdges({ x: 910, y: 388 });
  const middle = { lat: (edge.north + edge.south) / 2, lng: (edge.west + edge.east) / 2 };
  assert.equal(tilesNear(middle).length, 1);
  // 角のすぐ内側では斜めも含めて4区画
  const corner = { lat: edge.north - 0.001, lng: edge.west + 0.001 };
  const near = tilesNear(corner);
  assert.equal(near.length, 4);
  assert.deepEqual(near.map((t) => `${t.x}/${t.y}`).sort(), ['909/387', '909/388', '910/387', '910/388']);
  // 同じ角でも5kmより手前しか見ないと決めれば、区画は増えない
  assert.equal(tilesNear(corner, 0).length, 1);
});

test('タイルのURLと災害名', () => {
  assert.equal(tileUrl(1, { x: 910, y: 388 }), 'https://cyberjapandata.gsi.go.jp/xyz/skhb01/10/910/388.geojson');
  assert.equal(tileUrl(8, { x: 891, y: 410 }), 'https://cyberjapandata.gsi.go.jp/xyz/skhb08/10/891/410.geojson');
  assert.equal(hazardName(2), '崖崩れ、土石流及び地滑り');
  assert.equal(hazardName('5'), '津波');
  assert.equal(hazardName(9), '');
});

test('配信日は last-modified から。無ければ空', () => {
  assert.equal(issuedOn('Sun, 14 Sep 2026 03:00:00 GMT'), '2026-09-14');
  assert.equal(issuedOn(''), '');
  assert.equal(issuedOn(null), '');
  assert.equal(issuedOn('きのう'), '');
});

const reply = (status, body, headers = {}) => ({
  status, ok: status >= 200 && status < 300,
  headers: { get: (name) => headers[name] ?? null },
  json: async () => body,
});

test('404は0件、同じURLは取り直さない、失敗は投げる', async () => {
  const asked = [];
  const store = createTileStore(async (url) => {
    asked.push(url);
    if (url.includes('skhb08')) return reply(404, null);
    if (url.includes('skhb07')) return reply(500, null);
    return reply(200, { type: 'FeatureCollection', features: [{ properties: {} }] },
      { 'last-modified': 'Sun, 14 Sep 2026 03:00:00 GMT' });
  });
  const one = tileUrl(1, { x: 910, y: 388 }), eight = tileUrl(8, { x: 910, y: 388 });
  const held = await store.load([one, eight]);
  assert.equal(held[0].features.length, 1);
  assert.equal(held[0].issued, '2026-09-14');
  assert.deepEqual(held[1], { features: [], issued: '' });
  await store.load([one, eight]);
  assert.equal(asked.length, 2);
  await assert.rejects(store.load([tileUrl(7, { x: 910, y: 388 })]));
});

test('features が配列でない応答は読み取れないとして扱う', async () => {
  const store = createTileStore(async () => reply(200, { type: 'FeatureCollection' }));
  await assert.rejects(store.load([tileUrl(1, { x: 1, y: 1 })]));
});
