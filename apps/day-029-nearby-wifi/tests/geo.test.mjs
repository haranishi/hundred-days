import test from 'node:test';
import assert from 'node:assert/strict';
import { bearing, directionLabel, formatDistance, haversineDistance } from '../lib/geo.js';

test('haversineDistance: 同一点は0', () => assert.equal(haversineDistance({ lat: 39, lng: 140 }, { lat: 39, lng: 140 }), 0));
test('haversineDistance: 秋田駅から東京駅は約450km', () => {
  const distance = haversineDistance({ lat: 39.7167, lng: 140.1297 }, { lat: 35.6812, lng: 139.7671 });
  assert.ok(distance > 427500 && distance < 472500);
});
test('formatDistance: 1000m未満はm、以上はkm', () => {
  assert.equal(formatDistance(319.6), '320m');
  assert.equal(formatDistance(1199), '1.2km');
  assert.equal(formatDistance(999.6), '1.0km');
});

test('bearing: 方位角を北から時計回りの度数で返す', () => {
  const origin = { lat: 35, lng: 139 };
  assert.ok(bearing(origin, { lat: 36, lng: 139 }) < 1);
  assert.ok(bearing(origin, { lat: 35, lng: 140 }) > 89 && bearing(origin, { lat: 35, lng: 140 }) < 91);
});

test('directionLabel: 方位角を8方位へ変換する', () => {
  assert.deepEqual([0, 45, 90, 135, 180, 225, 270, 315].map(directionLabel),
    ['北', '北東', '東', '南東', '南', '南西', '西', '北西']);
  assert.equal(directionLabel(359), '北');
});
