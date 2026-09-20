import test from 'node:test';
import assert from 'node:assert/strict';
import { prefectures, worldCities } from '../lib/places.js';

test('都道府県庁所在地が47件ある', () => {
  assert.equal(prefectures.length, 47);
  assert.equal(new Set(prefectures.map(({ name }) => name)).size, 47);
});

test('旅モードの世界都市が30件ある', () => {
  assert.equal(worldCities.length, 30);
  assert.equal(new Set(worldCities.map(({ name }) => name)).size, 30);
});

test('全地点が有効な座標を持つ', () => {
  for (const place of [...prefectures, ...worldCities]) {
    assert.ok(Number.isFinite(place.lat));
    assert.ok(Number.isFinite(place.lon));
  }
});
