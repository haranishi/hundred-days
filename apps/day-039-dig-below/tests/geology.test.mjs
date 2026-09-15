import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { years, periodAt, intervalFor, layersFor, gapYears, environment } from '../lib/geology.js';
import { groupName, groupsFor } from '../lib/taxa.js';
import { nearest } from '../lib/geo.js';
const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const time = read('../data/geo-time.json'), taxa = read('../data/taxa-ja.json'), env = read('../data/env-ja.json');
test('日本語の年数と隔たりは億・万・年を組み合わせる', () => {
  for (const [n, expected] of [[274.4, '2億7,440万年前'], [23.04, '2,304万年前'], [.0117, '1万1,700年前'], [0, '現在'], [200, '2億年前']]) assert.equal(years(n), expected);
  assert.equal(years(274.4, false), '2億7,440万年');
  assert.equal(years(undefined), '年代不明');
});
test('紀は名前でなく数値。境界そのものは新しい側、上下を固定', () => {
  for (const [boundary, old, young] of [[66, '白亜紀', '古第三紀'], [2.58, '新第三紀', '第四紀'], [251.902, 'ペルム紀', '三畳紀']]) {
    assert.equal(periodAt(boundary, time).ja, young);
    assert.equal(periodAt(boundary + .00001, time).ja, old);
    assert.equal(periodAt(boundary - .00001, time).ja, young);
  }
});
test('層は年代中央値で世を選び、世がなければ紀に落とす', () => {
  const records = [{ oid: 'a', eag: 25, lag: 15, distance: 2, oei: 'unmapped' }, { oid: 'b', eag: 20, lag: 16, distance: 1 }, { oid: 'c', eag: 1000, lag: 800, distance: 3 }];
  const layers = layersFor(records, [], time);
  assert.equal(layers.length, 2);
  assert.equal(layers[0].ja, '中新世');
  assert.equal(layers[0].collections.length, 2);
  assert.equal(layers[1].ja, 'トニア紀');
  assert.equal(intervalFor({ eag: 5, lag: 3, oei: 'UNMAPPED' }, time).ja, '鮮新世');
  assert.equal(layersFor([{ eag: 9999, lag: 9998 }], [], time)[0].ja, '年代区分不明');
});
test('隣り合う層・重なりには隔たりなし、離れた区間だけ正確な差', () => {
  assert.equal(gapYears({ from: 2.58 }, { to: 2.58 }), 0);
  assert.equal(gapYears({ from: 5 }, { to: 4 }), 0);
  assert.equal(gapYears({ from: 2.58 }, { to: 5.333 }), 2.753);
});
test('綱優先・門へフォールバック・不明分類、日本語で多い順', () => {
  assert.equal(groupName({ cll: 'Bivalvia', phl: 'Chordata' }, taxa), '二枚貝');
  assert.equal(groupName({ cll: 'NO_CLASS_SPECIFIED', phl: 'Mollusca' }, taxa), taxa.phylum.Mollusca);
  assert.equal(groupName({}, taxa), '分類が特定されていない記録');
  assert.equal(groupsFor([{ cll: 'Bivalvia' }, {}, { cll: 'Bivalvia' }], taxa)[0][1], 2);
});
test('環境欠測・未登録は推測せず、海成・陸成・汽水を識別', () => {
  assert.equal(environment(undefined, env), null);
  assert.equal(environment('new environment', env), null);
  assert.equal(environment('marine indet.', env).kind, 'marine');
  assert.equal(environment('terrestrial indet.', env).kind, 'terrestrial');
  assert.equal(environment('coastal indet.', env).kind, 'transitional');
});
for (const [city, point, count] of [['tokyo', { lat: 35.6812, lng: 139.7671 }, 4], ['kochi', { lat: 33.5597, lng: 133.5311 }, 9]]) test(`${city}の実応答を${count}層にまとめる`, () => {
  const colls = nearest(read(`fixtures/colls-${city}.json`).records, point);
  const layers = layersFor(colls, read(`fixtures/occs-${city}.json`).records, time);
  assert.equal(layers.length, count);
  assert.ok(layers.every((l, i) => !i || layers[i - 1].from <= l.from));
});
