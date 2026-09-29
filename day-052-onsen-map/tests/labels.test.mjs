import test from 'node:test';
import assert from 'node:assert/strict';
import { BASEMAP, JA_NAME, LABEL_MIN_ZOOM, contrastRatio, japanArea, planLabels, planQuietLines } from '../lib/labels.js';
import { JAPAN_BOXES } from '../lib/geo.js';
import { FIELD_OF_VIEW, NATION_VIEWS, nationViewFor } from '../lib/map.js';

// OpenFreeMap の dark スタイル（2026-09-29 に読んだもの）から、形の違う層を抜き出した小さな写し
const LATIN_JA = ['case', ['has', 'name:nonlatin'], ['concat', ['get', 'name:latin'], '\n', ['get', 'name:nonlatin']], ['coalesce', ['get', 'name_en'], ['get', 'name']]];
const DARK_LAYERS = [
  { id: 'background', type: 'background' },
  { id: 'water', type: 'fill' },
  { id: 'water_name', type: 'symbol', layout: { 'text-field': LATIN_JA } },
  { id: 'road_oneway', type: 'symbol', minzoom: 15, layout: { 'icon-image': 'oneway' } },
  { id: 'highway_name_motorway', type: 'symbol', layout: { 'text-field': ['to-string', ['get', 'ref']] } },
  { id: 'place_city', type: 'symbol', maxzoom: 14, filter: ['==', ['get', 'class'], 'city'], layout: { 'text-field': LATIN_JA } },
  { id: 'place_suburb', type: 'symbol', minzoom: 11, maxzoom: 15, layout: { 'text-field': LATIN_JA } },
  { id: 'place_state', type: 'symbol', maxzoom: 12, filter: ['==', ['get', 'class'], 'state'], layout: { 'text-field': LATIN_JA } },
  { id: 'place_country_other', type: 'symbol', maxzoom: 8, layout: { 'text-field': LATIN_JA } },
  { id: 'place_country_major', type: 'symbol', maxzoom: 6, layout: { 'text-field': LATIN_JA } },
  { id: 'old_label', type: 'symbol', maxzoom: 5, layout: { 'text-field': LATIN_JA } },
];

test('planLabels: ズーム6未満は隠し、6以上は日本語名（name:ja → name）だけにする', () => {
  const area = japanArea(JAPAN_BOXES);
  const plan = new Map(planLabels(DARK_LAYERS, area).map((step) => [step.id, step]));
  assert.equal(LABEL_MIN_ZOOM, 6);
  assert.deepEqual(JA_NAME, ['coalesce', ['get', 'name:ja'], ['get', 'name']]);
  const colors = { textColor: BASEMAP.label, haloColor: BASEMAP.halo };
  assert.deepEqual(plan.get('place_city'), { id: 'place_city', textField: JA_NAME, minzoom: 6, maxzoom: 14, ...colors });
  assert.deepEqual(plan.get('water_name'), { id: 'water_name', textField: JA_NAME, minzoom: 6, maxzoom: 24, ...colors });
  // 道路番号の層も日本語名に置き換える（ローマ字や番号の併記をやめる）
  assert.deepEqual(plan.get('highway_name_motorway').textField, JA_NAME);
  // もともと6より大きい最小ズームはそのまま
  assert.equal(plan.get('place_suburb').minzoom, 11);
  // 文字を持たない層（一方通行の矢印）や、記号でない層はさわらない
  assert.equal(plan.has('road_oneway'), false);
  assert.equal(plan.has('background'), false);
  assert.equal(plan.has('water'), false);
});

test('planLabels: 国名はどのズームでも出さず、州名は日本の範囲の中だけにする', () => {
  const area = japanArea(JAPAN_BOXES);
  const plan = new Map(planLabels(DARK_LAYERS, area).map((step) => [step.id, step]));
  assert.deepEqual(plan.get('place_country_other'), { id: 'place_country_other', visibility: 'none' });
  assert.deepEqual(plan.get('place_country_major'), { id: 'place_country_major', visibility: 'none' });
  assert.deepEqual(plan.get('place_state').filter, ['all', ['==', ['get', 'class'], 'state'], ['within', area]]);
  // ズーム6より前に消える層は、6以上にすると出番が無いので隠す
  assert.deepEqual(plan.get('old_label'), { id: 'old_label', visibility: 'none' });
  // 絞り込みを持たない州名の層にも within を付ける
  const bare = planLabels([{ id: 'place_state', type: 'symbol', layout: { 'text-field': 'x' } }], area);
  assert.deepEqual(bare[0].filter, ['within', area]);
  assert.deepEqual(planLabels(null, area), []);
});

test('BASEMAP / contrastRatio: 陸と海の比は1.3以上、地名は陸にも海にも4.5以上', () => {
  assert.equal(contrastRatio('#000000', '#ffffff'), 21);
  assert.equal(contrastRatio('#ffffff', '#000000'), 21);
  assert.equal(contrastRatio('#777777', '#777777'), 1);
  assert.ok(contrastRatio(BASEMAP.land, BASEMAP.water) >= 1.3, `${contrastRatio(BASEMAP.land, BASEMAP.water)}`);
  assert.ok(contrastRatio(BASEMAP.label, BASEMAP.land) >= 4.5, `${contrastRatio(BASEMAP.label, BASEMAP.land)}`);
  assert.ok(contrastRatio(BASEMAP.label, BASEMAP.water) >= 4.5);
  // 海岸線は海より一段明るい
  assert.ok(contrastRatio(BASEMAP.coast, BASEMAP.water) > contrastRatio(BASEMAP.land, BASEMAP.water));
  // 前の配色（陸 #171c26・海 #0a1522）は1.08しかなかった
  assert.ok(contrastRatio('#171c26', '#0a1522') < 1.1);
});

test('planQuietLines: 道路・鉄道・空港の線はズーム6未満では出さない（水・県境・建物はさわらない）', () => {
  const layers = [
    { id: 'highway_motorway_subtle', type: 'line', maxzoom: 6 }, { id: 'highway_minor', type: 'line', minzoom: 8 },
    { id: 'railway', type: 'line', minzoom: 13 }, { id: 'aeroway-runway', type: 'line', minzoom: 11 }, { id: 'road_pier', type: 'line' },
    { id: 'waterway', type: 'line' }, { id: 'boundary_state', type: 'line' }, { id: 'highway_name_other', type: 'symbol' }, { id: 'building', type: 'fill' },
  ];
  assert.deepEqual(planQuietLines(layers), [
    { id: 'highway_motorway_subtle', minzoom: 6, maxzoom: 6 },
    { id: 'highway_minor', minzoom: 8, maxzoom: 24 },
    { id: 'railway', minzoom: 13, maxzoom: 24 },
    { id: 'aeroway-runway', minzoom: 11, maxzoom: 24 },
    { id: 'road_pier', minzoom: 6, maxzoom: 24 },
  ]);
  assert.deepEqual(planQuietLines(null), []);
});

test('japanArea: 四角の和を within で使える閉じた MultiPolygon にする', () => {
  const area = japanArea([[1, 2, 3, 4]]);
  assert.deepEqual(area, { type: 'MultiPolygon', coordinates: [[[[1, 2], [3, 2], [3, 4], [1, 4], [1, 2]]]] });
  assert.equal(japanArea(JAPAN_BOXES).coordinates.length, JAPAN_BOXES.length);
});

test('nationViewFor: 地図の縦横比で全国の向きと傾きを選ぶ', () => {
  assert.deepEqual(nationViewFor(390, 437), NATION_VIEWS.portrait);
  assert.deepEqual(nationViewFor(1040, 871), NATION_VIEWS.landscape);
  assert.deepEqual(nationViewFor(768, 562), NATION_VIEWS.wide);
  assert.deepEqual(nationViewFor(1520, 1050), NATION_VIEWS.wide);
  assert.deepEqual(nationViewFor(400, 0), NATION_VIEWS.wide);
  // 縦長は列島が縦に、横長は横に伸びる向き（右回り＝正・左回り＝負）
  assert.ok(NATION_VIEWS.portrait.bearing > 0);
  assert.ok(NATION_VIEWS.landscape.bearing < 0 && NATION_VIEWS.wide.bearing < 0);
  // 傾きは40°に抑え、視野角を15°に狭めて柱の倒れを消す
  for (const view of Object.values(NATION_VIEWS)) assert.equal(view.pitch, 40);
  assert.equal(FIELD_OF_VIEW, 15);
});
