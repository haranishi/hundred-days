import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceKm, nearest, inJapan, bounds } from '../lib/geo.js';
test('既知の赤道1度と日付変更線で距離誤差1%以内', () => {
  for (const [a, b] of [[{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }], [{ lat: 0, lng: 179.5 }, { lat: 0, lng: -179.5 }]])
    assert.ok(Math.abs(distanceKm(a, b) / 111.32 - 1) < .01);
  assert.equal(distanceKm({ lat: 35, lng: 139 }, { lat: 35, lng: 139 }), 0);
});
test('近い順40件は半径で切らず、40未満も保持し重複しない', () => {
  const records = Array.from({ length: 50 }, (_, i) => ({ oid: `col:${i}`, lat: 40 + i / 100, lng: 140 }));
  const result = nearest(records.reverse(), { lat: 20, lng: 123 });
  assert.equal(result.length, 40);
  assert.equal(result[0].oid, 'col:0');
  assert.ok(result[0].distance > 1000);
  assert.equal(nearest([records[0], records[0]], { lat: 35, lng: 139 }).length, 1);
  assert.deepEqual(nearest([], { lat: 35, lng: 139 }), []);
});
test('日本の外れ値と非数値を除外し境界を含む', () => {
  for (const p of [{ lat: 139, lng: 35 }, { lat: 19.99, lng: 139 }, { lat: 47, lng: 139 }, { lat: 35, lng: 121 }, { lat: 35, lng: 155 }, { lat: null, lng: 139 }]) assert.equal(inJapan(p), false);
  assert.equal(inJapan({ lat: 20, lng: 122 }), true);
  assert.equal(inJapan({ lat: 46.5, lng: 154 }), true);
});
test('検索矩形の全辺は小数1桁、元座標を含む', () => {
  const point = { lat: 35.681234, lng: 139.767123 };
  const b = bounds(point, .3);
  assert.deepEqual(b, { lngmin: '139.5', lngmax: '140.1', latmin: '35.4', latmax: '36.0' });
  assert.ok(b.latmin < point.lat && b.latmax > point.lat);
});
