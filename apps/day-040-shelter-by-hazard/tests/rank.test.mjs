import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { hazardsOf, mergeTiles, placeId, rankPlaces } from '../lib/rank.js';

const AKITA = { lat: 39.7186, lng: 140.1025 };
const KOCHI = { lat: 33.5665, lng: 133.5432 };

// 実応答をそのまま読む。無い番号は、その区画に該当が無くタイルごと404だったもの
function tiles(city) {
  return [1, 2, 3, 4, 5, 6, 7, 8].map((hazard) => {
    const file = new URL(`./fixtures/skhb/${city}/skhb0${hazard}.json`, import.meta.url);
    return { hazard, features: existsSync(file) ? JSON.parse(readFileSync(file)).features : [] };
  });
}

test('同じ場所が複数のタイルに出ても1件になり、フラグは和集合になる', () => {
  const feature = (extra) => ({
    geometry: { type: 'Point', coordinates: [140.1, 39.72] },
    properties: { name: '山王第一街区公園', address: '秋田県秋田市山王', remarks: null, ...extra },
  });
  const merged = mergeTiles([
    { hazard: 2, features: [feature({ disaster2: 1 })] },
    { hazard: 4, features: [feature({ disaster4: 1 })] },
  ]);
  assert.equal(merged.length, 1);
  assert.deepEqual([...merged[0].hazards].sort(), [2, 4]);
  assert.equal(merged[0].address, '秋田県秋田市山王');
  assert.equal(merged[0].remarks, '');
  // disasterN のキーが1つも無くても、載っていたタイルの番号だけは残る
  const bare = mergeTiles([{ hazard: 5, features: [feature({})] }]);
  assert.deepEqual([...bare[0].hazards], [5]);
  // 座標が小数5桁で違えば別の場所
  assert.equal(mergeTiles([{ hazard: 1, features: [feature({}), {
    geometry: { type: 'Point', coordinates: [140.10001, 39.72] }, properties: { name: '山王第一街区公園' },
  }] }]).length, 2);
  assert.equal(placeId('公園', 140.1, 39.72), placeId('公園', 140.100004, 39.720001));
});

test('壊れた feature は捨てるが、残りは読み続ける', () => {
  const merged = mergeTiles([{ hazard: 1, features: [
    { properties: { name: '座標なし' } },
    { geometry: { coordinates: ['a', 'b'] }, properties: { name: '数でない座標' } },
    { geometry: { coordinates: [140.1, 39.72] } },
  ] }]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].name, '');
});

test('秋田・洪水はいちばん近い使える場所が中央市民サービスセンターで n=0', () => {
  const result = rankPlaces(mergeTiles(tiles('akita')), AKITA, 1);
  assert.equal(result.usable[0].name, '中央市民サービスセンター');
  assert.equal(Math.round(result.usable[0].distance), 174);
  assert.equal(result.nearerUnusable, 0);
  assert.equal(result.usable.length, 5);
  assert.ok(result.unusable.some((p) => p.name === '山王第一街区公園'));
  // 近い順に並んでいる
  const distances = result.unusable.map((p) => p.distance);
  assert.deepEqual(distances, [...distances].sort((a, b) => a - b));
  assert.equal(result.unusable.length, 8);
  assert.equal(result.unusableMore, 1);
  // 洪水で使えない場所は、ほかの災害では指定されている
  const park = result.unusable.find((p) => p.name === '山王第一街区公園');
  assert.deepEqual(hazardsOf(park, 1), [2, 4]);
});

test('高知・洪水は n=17 で、最初に使えるのは江ノ口小学校', () => {
  const result = rankPlaces(mergeTiles(tiles('kochi')), KOCHI, 1);
  assert.equal(result.nearerUnusable, 17);
  assert.equal(result.usable[0].name, '江ノ口小学校');
  assert.equal(Math.round(result.usable[0].distance), 500);
  assert.equal(result.unusable.length, 8);
  assert.ok(result.unusableMore > 0);
});

test('秋田・火山現象は1件も無い（タイルが404）', () => {
  const result = rankPlaces(mergeTiles(tiles('akita')), AKITA, 8);
  assert.deepEqual(result, { usable: [], nearerUnusable: 0, unusable: [], unusableMore: 0 });
  assert.equal(rankPlaces(mergeTiles(tiles('akita')), AKITA, 7).usable.length, 0);
});

test('使えない一覧は使える5件目より近いものだけ。全部使えるなら空', () => {
  const at = { lat: 35, lng: 139 };
  const place = (name, lng, hazards) => ({
    geometry: { coordinates: [lng, 35] },
    properties: { name, ...Object.fromEntries(hazards.map((n) => [`disaster${n}`, 1])) },
  });
  const all = mergeTiles([{ hazard: 1, features: [place('近', 139.001, [1]), place('中', 139.002, [1])] }]);
  const every = rankPlaces(all, at, 1);
  assert.equal(every.usable.length, 2);
  assert.deepEqual(every.unusable, []);
  assert.equal(every.unusableMore, 0);

  const mixed = mergeTiles([
    { hazard: 1, features: [place('使える1', 139.001, [1]), place('使える2', 139.004, [1])] },
    { hazard: 2, features: [place('使えない手前', 139.002, [2]), place('使えない遠く', 139.009, [2])] },
  ]);
  const some = rankPlaces(mixed, at, 1);
  assert.deepEqual(some.usable.map((p) => p.name), ['使える1', '使える2']);
  assert.equal(some.nearerUnusable, 0);
  assert.deepEqual(some.unusable.map((p) => p.name), ['使えない手前']);
});
