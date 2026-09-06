import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCountryIndex, countryOf, countryTable } from '../tools/country-lookup.mjs';

/* Natural Earth の生データは tools/cache/（gitignore）にしか無い。手元で取得済みのときだけ実データで検算し、
   CI のようにファイルが無い環境では飛ばす（残りのテストは小さな図形で判定規則そのものを検査する） */
const SOURCE_URL = new URL('../tools/cache/ne_50m_admin_0_countries.geojson', import.meta.url);
const source = existsSync(SOURCE_URL) ? JSON.parse(readFileSync(SOURCE_URL, 'utf8')) : null;

function feature(iso2, geometry, extra = {}) {
  return { type: 'Feature', properties: { ISO_A2_EH: iso2, NAME: iso2, NAME_JA: `日${iso2}`, CONTINENT: 'Test', ...extra }, geometry };
}

test('country: Natural Earthで日本・ドイツ・遠い海上を判定する', (t) => {
  if (!source) { t.skip('tools/cache に Natural Earth の生データが無い（取得済みの環境だけで検算する）'); return; }
  const index = buildCountryIndex(source);
  assert.equal(countryOf(index, 35.6812, 139.7671), 'JP');
  assert.equal(countryOf(index, 52.52, 13.405), 'DE');
  assert.equal(countryOf(index, 0, -140), '');
});

test('country: MultiPolygonのどちらの島も同じ国になる', () => {
  const geojson = { type: 'FeatureCollection', features: [feature('MP', {
    type: 'MultiPolygon',
    coordinates: [
      [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]],
      [[[10, 10], [12, 10], [12, 12], [10, 12], [10, 10]]],
    ],
  })] };
  const index = buildCountryIndex(geojson);
  assert.equal(countryOf(index, 1, 1), 'MP');
  assert.equal(countryOf(index, 11, 11), 'MP');
});

test('country: 穴の中は点内とせず0.5度外なら国なしにする', () => {
  const geojson = { type: 'FeatureCollection', features: [feature('HL', {
    type: 'Polygon',
    coordinates: [
      [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
      [[2, 2], [8, 2], [8, 8], [2, 8], [2, 2]],
    ],
  })] };
  assert.equal(countryOf(buildCountryIndex(geojson), 5, 5), '');
});

test('country: 180度をまたぐポリゴンと0.5度の沿岸補完を扱う', () => {
  const geojson = { type: 'FeatureCollection', features: [feature('DL', {
    type: 'Polygon',
    coordinates: [[[179, -2], [-179, -2], [-179, 2], [179, 2], [179, -2]]],
  })] };
  const index = buildCountryIndex(geojson);
  assert.equal(countryOf(index, 0, 179.5), 'DL');
  assert.equal(countryOf(index, 0, -179.5), 'DL');
  assert.equal(countryOf(index, 0, 178.7), 'DL');
  assert.equal(countryOf(index, 0, 170), '');
});

test('country: 国一覧は-99を除外して指定フィールドだけを返す', () => {
  const geojson = { type: 'FeatureCollection', features: [
    feature('JP', { type: 'Polygon', coordinates: [] }, { NAME: 'Japan', NAME_JA: '日本', CONTINENT: 'Asia' }),
    feature('-99', { type: 'Polygon', coordinates: [] }),
  ] };
  assert.deepEqual(countryTable(geojson), { JP: { ja: '日本', en: 'Japan', continent: 'Asia' } });
});
