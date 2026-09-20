import test from 'node:test';
import assert from 'node:assert/strict';
import { addDistances, formatDistance, haversineDistance } from '../lib/geo.js';

test('geo: 秋田駅から東京駅は約450km', () => {
  const distance = haversineDistance({ lat: 39.7167, lng: 140.1297 }, { lat: 35.6812, lng: 139.7671 });
  assert.ok(distance > 427500);
  assert.ok(distance < 472500);
});

test('geo: 同一点の距離は0', () => {
  assert.equal(haversineDistance({ lat: 35, lng: 139 }, { lat: 35, lng: 139 }), 0);
});

test('geo: 1000m未満はmで四捨五入', () => {
  assert.equal(formatDistance(319.6), '320m');
  assert.equal(formatDistance(999.4), '999m');
});

test('geo: 1000m以上はkm小数1桁', () => {
  assert.equal(formatDistance(1199), '1.2km');
  assert.equal(formatDistance(1000), '1.0km');
});

test('geo: 丸めて1000mになる値は1.0km（「1000m」と書かない）', () => {
  assert.equal(formatDistance(999.6), '1.0km');
  assert.equal(formatDistance(999.5), '1.0km');
});

test('geo: 距離を付加して昇順に並べる', () => {
  const result = addDistances([{ id: 'far', lat: 35.01, lng: 139 }, { id: 'near', lat: 35.001, lng: 139 }], { lat: 35, lng: 139 });
  assert.deepEqual(result.map((item) => item.id), ['near', 'far']);
  assert.ok(result[0].distance < result[1].distance);
});
