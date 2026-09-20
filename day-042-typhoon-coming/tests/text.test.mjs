/* 画面に出る文。気象業務法17条があるので、発表値に足した言葉が無いこともここで見る。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOAD_FAILED, NO_TYPHOON_NOTE, answerMetaText, answerSegments, answerSubText, answerText,
  bandLabel, issueLine, noneSubText, otherText, rangeText, scaleText, topRowText, typhoonFacts, typhoonTitle,
} from '../lib/render.js';
import { parseSpecifications, parseThrough, parseTimeseries } from '../lib/jma.js';
import { readArea } from '../lib/probability.js';
import { createTowns } from '../lib/towns.js';
import { jstNow } from '../lib/time.js';
import { rawSpecifications, rawThrough, rawTimeseries, townsJson } from './fixtures.mjs';

const report = { timeseries: parseTimeseries(rawTimeseries), through: parseThrough(rawThrough) };
const spec = parseSpecifications(rawSpecifications);
const towns = createTowns(townsJson);
const readOf = (code) => readArea(report, towns.get(code).area);

test('1行目は市区町村名と5日以内の確率。%だけ大きく出す', () => {
  const read = readOf('1310100');
  assert.equal(answerText('千代田区', read.total), '千代田区は、5日以内に暴風域に入る確率 30%。');
  const parts = answerSegments('千代田区', read.total);
  assert.deepEqual(parts.filter((part) => part.count).map((part) => part.text), ['30%']);
});

/* 判定は 5 以上（firstOver）。千代田区の該当区間はちょうど5%なので、
   「5%を超える」と書くと画面の文と判定が食い違う */
test('2行目は山と「5%以上になる」時刻', () => {
  assert.equal(answerSubText(readOf('1310100')),
    '山は 21日（月）9時〜12時 の 22%。5%以上になるのは 21日（月）0時〜3時 から。');
});

test('5%以上になる区間が無いときは、その旨を書く', () => {
  assert.equal(answerSubText(readOf('0521000')),
    '山は 21日（月）12時〜15時 の 1%。5%以上になる時間帯はありません。');
});

test('ずっと0%のときは、山の話をしない', () => {
  assert.equal(answerSubText(readOf('4720100')), '5日以内のどの時間帯も 0% です。');
  assert.equal(answerSubText(null), '5日以内のどの時間帯も 0% です。');
});

test('3行目に、いつの発表か・どの地域の値かを必ず添える', () => {
  assert.equal(answerMetaText(readOf('1310100'), '２３区西部', 25),
    '気象庁 9月18日 15時の発表（２３区西部の値）・台風第25号');
});

test('台風が無い日の文', () => {
  assert.equal(noneSubText(jstNow(Date.parse('2026-09-18T21:00:00+09:00'))),
    '気象庁が発表している台風は、9月18日 21時00分時点でありません。');
  assert.equal(NO_TYPHOON_NOTE, 'いま台風がないので、確率の発表はありません。');
});

test('台風が2つ以上あるときの2本目以降', () => {
  assert.equal(otherText(26, 4), '台風第26号：5日以内 4%');
});

test('帯の読み上げは区間と値', () => {
  assert.equal(bandLabel('2026-09-21T12:00:00+09:00', 22), '21日9時〜12時 22%');
  assert.equal(bandLabel('2026-09-19T00:00:00+09:00', 0), '18日21時〜24時 0%');
});

test('上位の行は地域名・都道府県・確率', () => {
  assert.equal(topRowText({ name: '八丈島', pref: '東京都' }, 78), '八丈島（東京都） 78%');
});

test('現況の見出しと階級。該当なしの "-" は出さない', () => {
  assert.equal(typhoonTitle(spec), '台風第25号（ドゥージェン）');
  assert.equal(typhoonTitle({ ...spec, name: '' }), '台風第25号');
  assert.equal(scaleText(spec), '台風・大型', '強さは "-" なので出さない');
  assert.equal(scaleText({ ...spec, analysis: { ...spec.analysis, intensity: '強い' } }), '台風・大型・強い');
});

test('暴風域と強風域。全方向同じなら「全域」、非対称なら方向ごと', () => {
  assert.equal(rangeText(spec.analysis.stormWarning), '全域 110km');
  assert.equal(rangeText(spec.analysis.galeWarning), '北東 750km・南西 390km');
  assert.equal(rangeText([]), '');
});

test('現況の項目', () => {
  const facts = Object.fromEntries(typhoonFacts(spec));
  assert.equal(facts['実況'], '18日（金）18時');
  assert.equal(facts['中心位置'], '父島の南約180km・ほぼ正確');
  assert.equal(facts['進行'], '西へ 25km/h');
  assert.equal(facts['中心気圧'], '975hPa');
  assert.equal(facts['最大風速'], '30m/s（最大瞬間風速 45m/s）');
  assert.equal(facts['暴風域'], '全域 110km');
  assert.equal(facts['強風域'], '北東 750km・南西 390km');
  assert.equal(issueLine('2026-09-18T18:45:00+09:00'), '気象庁 18日 18時45分 発表');
});

test('値が無い項目は行ごと出さない', () => {
  const quiet = { ...spec, analysis: { ...spec.analysis, pressure: null, course: '', galeWarning: [] } };
  const labels = typhoonFacts(quiet).map(([label]) => label);
  assert.ok(!labels.includes('中心気圧'));
  assert.ok(!labels.includes('進行'));
  assert.ok(!labels.includes('強風域'));
});

test('判断の言葉を足していない', () => {
  const all = [
    answerText('千代田区', 30), answerSubText(readOf('1310100')), answerSubText(readOf('4720100')),
    answerMetaText(readOf('1310100'), '２３区西部', 25), LOAD_FAILED, NO_TYPHOON_NOTE,
    typhoonTitle(spec), scaleText(spec), ...typhoonFacts(spec).flat(),
  ].join(' ');
  for (const word of ['危険', '安全', '大丈夫', 'おそらく', '見込みです', '避難してください']) {
    assert.ok(!all.includes(word), `「${word}」を書いている`);
  }
});
