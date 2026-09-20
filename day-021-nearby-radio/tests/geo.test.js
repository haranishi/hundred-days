import test from 'node:test';
import assert from 'node:assert/strict';
import { haversine } from '../lib/geo.js';

test('haversine: 同じ地点は0km', () => {
  assert.equal(haversine(35.68, 139.76, 35.68, 139.76), 0);
});

test('haversine: 東京駅から大阪駅の既知距離は約404km', () => {
  const distance = haversine(35.6812, 139.7671, 34.7025, 135.4959);
  assert.ok(distance > 400 && distance < 410, `distance=${distance}`);
});

test('haversine: 不正な座標はNaN', () => {
  assert.ok(Number.isNaN(haversine(null, 139, 35, 140)));
  assert.ok(Number.isNaN(haversine(undefined, 139, 35, 140)));
});
