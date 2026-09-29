import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DATA_URLS, indexBaths, loadBaths, loadStats, validateBaths, validateStats } from '../lib/data.js';

const read = (name) => JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const stats = read('stats.json');
const baths = read('baths.json');

test('同梱の stats.json: 設計で測った数字と一致する', () => {
  assert.equal(validateStats(stats), stats);
  const byName = new Map(stats.prefectures.map((pref) => [pref.name, pref]));
  assert.equal(stats.national.sources, 27899);
  assert.equal(byName.get('大分県').sources, 5094);
  assert.equal(stats.national.areas, 2839);
  assert.equal(byName.get('北海道').areas, 226);
  assert.equal(byName.get('秋田県').areas, 104);
  assert.equal(byName.get('大分県').flow, 293610);
  assert.equal(stats.national.sento, 2730);
  assert.deepEqual(['東京都', '大阪府', '青森県', '山形県'].map((name) => byName.get(name).sento), [429, 354, 261, 0]);
  assert.deepEqual(stats.national.sentoSeries.map((row) => row.count), [3231, 3120, 3000, 2847, 2730]);
  for (const metric of ['sources', 'areas', 'flow', 'sento']) {
    assert.equal(stats.prefectures.reduce((sum, pref) => sum + pref[metric], 0), stats.national[metric], metric);
  }
});

test('validateStats: 並び・数・位置が崩れていたら読めない扱い', () => {
  const clone = () => structuredClone(stats);
  const short = clone();
  short.prefectures.pop();
  assert.throws(() => validateStats(short), /47都道府県/);
  const swapped = clone();
  [swapped.prefectures[0], swapped.prefectures[1]] = [swapped.prefectures[1], swapped.prefectures[0]];
  assert.throws(() => validateStats(swapped), /01 の並び/);
  const negative = clone();
  negative.prefectures[4].sento = -1;
  assert.throws(() => validateStats(negative), /05 の sento/);
  const noPlace = clone();
  delete noPlace.prefectures[2].capital;
  assert.throws(() => validateStats(noPlace), /03 の位置/);
  const noSeries = clone();
  noSeries.national.sentoSeries = [];
  assert.throws(() => validateStats(noSeries), /推移/);
  assert.throws(() => validateStats(null), /47都道府県/);
});

test('validateBaths: 必要な項目が欠けたら読めない扱い', () => {
  assert.equal(validateBaths(baths), baths);
  assert.throws(() => validateBaths({ baths: [] }), /形が違います/);
  assert.throws(() => validateBaths({ baths: [{ id: 'n1', pref: '05', lat: 1, t: 'onsen' }], counts: {} }), /項目が足りません/);
  assert.throws(() => validateBaths({ baths: [{ id: 'n1', pref: '05', lat: 1, lng: 2, t: 'spa' }], counts: {} }), /項目が足りません/);
});

test('loadStats / loadBaths: 同一オリジンの同梱JSONを読み、失敗は例外にする', async () => {
  const seen = [];
  const fake = (body, ok = true) => async (url) => { seen.push(url); return { ok, status: ok ? 200 : 404, json: async () => body }; };
  assert.equal(await loadStats(fake(stats)), stats);
  assert.equal(await loadBaths(fake(baths)), baths);
  assert.deepEqual(seen, [DATA_URLS.stats, DATA_URLS.baths]);
  await assert.rejects(loadStats(fake(stats, false)), /data 404/);
  await assert.rejects(loadBaths(fake({ nope: true })), /形が違います/);
  await assert.rejects(loadStats(async () => { throw new TypeError('Failed to fetch'); }), /Failed to fetch/);
});

test('indexBaths: 県ごと・番号ごとに引ける', () => {
  const { byPref, byId } = indexBaths(baths.baths);
  assert.equal(byPref.get('05').length, 120);
  assert.equal(byPref.get('13').length, 334);
  assert.equal(byPref.get('44').length, 171);
  assert.equal(byId.size, 5208);
  assert.equal(byId.get('w457377725').pref, '05');
});
