import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  METRICS, PREFS, barRatio, buildIndex, formatValue, medianOf, normalizeQuery,
  rankLabel, rankOf, searchTowns, townsOfPref,
} from '../lib/stats.js';

/* 架空の5町。同値・null・検索の紛らわしさを仕込んである。 */
const TOWNS = [
  { code: '01001', pref: '北海道', name: '甲町', en: 'Ko-cho', pop: 100, dens: 50.0, ageAvg: 45.0, single: 30.0 },
  { code: '01002', pref: '北海道', name: '乙町', en: 'Otsu-cho', pop: 300, dens: 20.0, ageAvg: 45.0, single: null },
  { code: '05001', pref: '秋田県', name: '丙市', en: 'Hei-shi', pop: 300, dens: 10.0, ageAvg: 50.0, single: 20.0 },
  { code: '05002', pref: '秋田県', name: '丙川町', en: 'Heikawa-cho', pop: 200, dens: 40.0, ageAvg: 40.0, single: 10.0 },
  { code: '13001', pref: '東京都', name: '丁区', en: 'Tei-ku', pop: 500, dens: null, ageAvg: 35.0, single: 40.0 },
];
const index = buildIndex(TOWNS);

describe('順位', () => {
  it('降順で数え、同値は同順位（1,2,2,4方式）', () => {
    assert.deepEqual(rankOf(index, 'pop', '13001'), { rank: 1, of: 5 });
    assert.deepEqual(rankOf(index, 'pop', '01002'), { rank: 2, of: 5 });
    assert.deepEqual(rankOf(index, 'pop', '05001'), { rank: 2, of: 5 });
    assert.deepEqual(rankOf(index, 'pop', '05002'), { rank: 4, of: 5 });
    assert.deepEqual(rankOf(index, 'pop', '01001'), { rank: 5, of: 5 });
  });
  it('値がない町は順位なし。母数にも入らない', () => {
    assert.equal(rankOf(index, 'dens', '13001'), null);
    assert.deepEqual(rankOf(index, 'dens', '01001'), { rank: 1, of: 4 });
    assert.deepEqual(rankOf(index, 'single', '05002'), { rank: 4, of: 4 });
  });
});

describe('中央値', () => {
  it('奇数個はまんなか、偶数個は中間2値の平均。nullは除く', () => {
    assert.equal(medianOf(index, 'pop'), 300);
    assert.equal(medianOf(index, 'dens'), 30.0);
    assert.equal(medianOf(index, 'single'), 25.0);
  });
});

describe('表示用の文字', () => {
  const M = Object.fromEntries(METRICS.map((m) => [m.key, m]));
  it('3桁区切り・桁数・符号・null', () => {
    assert.equal(formatValue(M.pop, 1234567), '1,234,567');
    assert.equal(formatValue(M.rate, 2.5), '+2.50');
    assert.equal(formatValue(M.rate, -9.107), '-9.11');
    assert.equal(formatValue(M.ageAvg, 56.86), '56.9');
    assert.equal(formatValue(M.pop, null), '—');
  });
  it('順位の文言は方向つき', () => {
    assert.equal(rankLabel(M.pop, 123, 1741), '多い方から 123位 / 1,741');
    assert.equal(rankLabel(M.area, 1, 1741), '広い方から 1位 / 1,741');
  });
  it('価値判断語を持ち込まない', () => {
    const words = JSON.stringify(METRICS);
    for (const banned of ['良い', '悪い', '住みやす', 'ワースト']) {
      assert.ok(!words.includes(banned), banned);
    }
  });
});

describe('中央値比バー', () => {
  it('中央値ぴったりは0.5、2倍以上は1.0、0は0', () => {
    assert.equal(barRatio(30, 30), 0.5);
    assert.equal(barRatio(90, 30), 1);
    assert.equal(barRatio(0, 30), 0);
    assert.equal(barRatio(null, 30), null);
    assert.equal(barRatio(30, null), null);
  });
});

describe('検索', () => {
  it('全半角・カナかな・大文字小文字を同一視する', () => {
    assert.equal(normalizeQuery('　ヘイシ　'), 'へいし');
    assert.equal(normalizeQuery('Ｋｏ－ＣＨＯ'), 'ko-cho');
  });
  it('完全一致が先頭、次に前方一致。limitを守る', () => {
    const hits = searchTowns(TOWNS, '丙市');
    assert.equal(hits[0].code, '05001');
    const partial = searchTowns(TOWNS, '丙');
    assert.deepEqual(partial.map((t) => t.code), ['05001', '05002']);
    assert.equal(searchTowns(TOWNS, '町', 2).length, 2);
  });
  it('県名でも英名でも探せて、空や記号だけは0件', () => {
    assert.ok(searchTowns(TOWNS, '秋田県').length === 2);
    assert.equal(searchTowns(TOWNS, 'tei')[0].code, '13001');
    assert.deepEqual(searchTowns(TOWNS, '   '), []);
    assert.deepEqual(searchTowns(TOWNS, '!!'), []);
  });
});

describe('一覧', () => {
  it('都道府県の町をコード順で返す', () => {
    assert.deepEqual(townsOfPref(TOWNS, '秋田県').map((t) => t.code), ['05001', '05002']);
  });
  it('PREFSは47件で北海道から沖縄県まで', () => {
    assert.equal(PREFS.length, 47);
    assert.equal(PREFS[0], '北海道');
    assert.equal(PREFS[4], '秋田県');
    assert.equal(PREFS[46], '沖縄県');
  });
});
