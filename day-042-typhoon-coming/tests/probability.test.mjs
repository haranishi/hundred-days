/* 確率の選び方。値そのものは気象庁の発表で、ここでやるのは「どれを出すか」だけ。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { firstOver, peakOf, rankTyphoons, readArea, throughLast, topAreas } from '../lib/probability.js';
import { parseSpecifications, parseThrough, parseTimeseries } from '../lib/jma.js';
import { createTowns } from '../lib/towns.js';
import { intervalText } from '../lib/time.js';
import { rawSpecifications, rawThrough, rawTimeseries, townsJson } from './fixtures.mjs';

const report = { timeseries: parseTimeseries(rawTimeseries), through: parseThrough(rawThrough) };
const towns = createTowns(townsJson);

test('山は最大値。同じ値が並んだら早いほうを採る', () => {
  assert.deepEqual(peakOf([0, 3, 7, 7, 2]), { index: 2, value: 7 });
  assert.deepEqual(peakOf([0, 0, 0]), { index: 0, value: 0 });
  assert.deepEqual(peakOf([]), { index: -1, value: 0 });
});

test('「5%以上になる」は5以上になる最初の区間（ちょうど5%も該当する）', () => {
  assert.equal(firstOver([0, 1, 4, 5, 9]), 3);
  assert.equal(firstOver([0, 1, 4]), -1);
  assert.equal(firstOver([5]), 0);
});

test('5日以内の確率は積算の最後の値', () => {
  assert.equal(throughLast([0, 0, 29, 30, 30]), 30);
  assert.equal(throughLast([]), 0);
});

test('千代田区（２３区西部）の答えは、積算30・山22・5%超は21日0時〜3時から', () => {
  const town = towns.get('1310100');
  assert.equal(town.name, '千代田区');
  assert.equal(town.area, '130011');
  assert.equal(town.areaName, '２３区西部');
  const read = readArea(report, town.area);
  assert.equal(read.total, 30);
  assert.equal(read.peak.value, 22);
  assert.equal(read.peak.validtime, '2026-09-21T12:00:00+09:00');
  assert.equal(intervalText(read.peak.validtime), '21日（月）9時〜12時');
  assert.equal(read.over.validtime, '2026-09-21T03:00:00+09:00');
  assert.equal(intervalText(read.over.validtime), '21日（月）0時〜3時');
  assert.equal(read.targetDatetime, '2026-09-18T15:00:00+09:00');
});

test('由利本荘市（本荘由利地域）は積算2・山1で、5%以上になる区間が無い', () => {
  const town = towns.get('0521000');
  assert.equal(town.areaName, '本荘由利地域');
  const read = readArea(report, town.area);
  assert.equal(read.total, 2);
  assert.equal(read.peak.value, 1);
  assert.equal(intervalText(read.peak.validtime), '21日（月）12時〜15時');
  assert.equal(read.over, null);
});

test('那覇市（南部）は5日とも0%', () => {
  const read = readArea(report, towns.get('4720100').area);
  assert.equal(read.total, 0);
  assert.equal(read.peak.value, 0);
  assert.equal(read.over, null);
});

test('発表に無い地域は null を返す（画面を失敗にしない）', () => {
  assert.equal(readArea(report, '999999'), null);
});

test('上位5地域は積算5日目の降順。同じ値は北→南', () => {
  const rows = topAreas(report.through, (code) => towns.areaOrder(code));
  assert.deepEqual(rows.map((row) => [towns.area(row.area).name, towns.area(row.area).pref, row.value]), [
    ['小笠原諸島', '東京都', 100],
    ['八丈島', '東京都', 78],
    ['三宅島', '東京都', 62],
    ['夷隅・安房', '千葉県', 53],
    ['香取・海匝', '千葉県', 49],
  ]);
});

test('同じ値のときは並び順（気象庁のファイル順＝北→南）が先のほうを上にする', () => {
  const through = { probability: { '050013': [0, 0, 0, 0, 9], '130011': [0, 0, 0, 0, 9] } };
  const rows = topAreas(through, (code) => towns.areaOrder(code));
  assert.deepEqual(rows.map((row) => row.area), ['050013', '130011'], '秋田が東京より北');
  assert.ok(towns.areaOrder('050013') < towns.areaOrder('130011'));
});

test('台風が2つ以上なら、選んだ街の積算が高いほうを主答えにする', () => {
  const weak = {
    specifications: parseSpecifications(rawSpecifications),
    through: { probability: { '130011': [0, 0, 0, 1, 1] } },
  };
  const strong = {
    specifications: { ...parseSpecifications(rawSpecifications), number: 26 },
    through: report.through,
  };
  const ranked = rankTyphoons([weak, strong], '130011');
  assert.deepEqual(ranked.map((row) => [row.typhoon.specifications.number, row.total]), [[26, 30], [25, 1]]);
  /* 街が決まっていないときは台風番号の順で安定させる */
  assert.deepEqual(rankTyphoons([strong, weak], null).map((row) => row.typhoon.specifications.number), [25, 26]);
});
