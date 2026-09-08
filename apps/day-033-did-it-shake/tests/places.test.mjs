import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { groupByPref, findByCode, distanceKm, nearest, fullName } from '../lib/places.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const { places, meta } = JSON.parse(readFileSync(resolve(HERE, '..', 'data', 'places.json'), 'utf8'));

test('places: 1,741市区町村がそろっていて、コードが重複しない', () => {
  assert.equal(places.length, 1741);
  assert.equal(meta.count, 1741);
  assert.equal(new Set(places.map((place) => place.c)).size, 1741);
});

test('places: 47都道府県ぶんの組になり、北から南に並ぶ', () => {
  const groups = groupByPref(places);
  assert.equal(groups.length, 47);
  assert.equal(groups[0].pref, '北海道');
  assert.equal(groups[46].pref, '沖縄県');
  assert.equal(groups.reduce((sum, group) => sum + group.places.length, 0), 1741);
});

test('places: 座標が日本の範囲に収まっている', () => {
  for (const place of places) {
    assert.ok(place.lat > 20 && place.lat < 46, `緯度が範囲外: ${place.n} ${place.lat}`);
    assert.ok(place.lon > 122 && place.lon < 154, `経度が範囲外: ${place.n} ${place.lon}`);
    assert.equal(Math.round(place.lat * 1000) / 1000, place.lat, '緯度が3桁を超えている');
  }
});

test('places: コードで引ける', () => {
  const akita = findByCode(places, '05201');
  assert.equal(akita.n, '秋田市');
  assert.equal(akita.p, '秋田県');
  assert.equal(findByCode(places, '99999'), null);
});

test('places: 距離はおおよそ合っている（秋田市と東京都千代田区）', () => {
  const akita = findByCode(places, '05201');
  const chiyoda = findByCode(places, '13101');
  const km = distanceKm(akita, chiyoda);
  assert.ok(km > 400 && km < 500, `${km}km`);
  assert.equal(Math.round(distanceKm(akita, akita)), 0);
});

test('places: 現在地にいちばん近い市区町村を返す', () => {
  const found = nearest(places, { lat: 39.72, lon: 140.1 });
  assert.equal(found.place.n, '秋田市');
  assert.ok(found.km < 10, `${found.km}km`);
});

test('places: 表示名は都道府県と同じ名前を重ねない', () => {
  assert.equal(fullName({ p: '秋田県', n: '秋田市' }), '秋田県秋田市');
  assert.equal(fullName({ p: '東京都', n: '千代田区' }), '東京都千代田区');
  assert.equal(fullName({ p: '北海道', n: '北海道' }), '北海道');
});
