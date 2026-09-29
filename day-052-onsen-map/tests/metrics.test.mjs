import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_METRIC, MAX_PILLAR_METERS, METRICS, METRIC_IDS, compactMetrics, formatValue, headline, metricLine, metricOf, mixColor,
  pillarColor, pillarHeight, prefHeadline, rankOf, ranking, sentoTrend, topLabels,
} from '../lib/metrics.js';
import { GROW_MS, PILLAR_STEPS, buildPillars, easeOut } from '../lib/pillars.js';

const stats = JSON.parse(readFileSync(new URL('../data/stats.json', import.meta.url), 'utf8'));
const { prefectures } = stats;
const akita = prefectures.find((pref) => pref.code === '05');

test('metrics: 4指標と既定（源泉の数）', () => {
  assert.deepEqual(METRIC_IDS, ['sources', 'areas', 'flow', 'sento']);
  assert.equal(DEFAULT_METRIC, 'sources');
  assert.equal(metricOf('sento').family, 'sento');
  assert.equal(metricOf('nope'), null);
  assert.equal(METRICS.filter((metric) => metric.family === 'onsen').length, 3);
});

test('formatValue: 単位の付け方（か所・毎分◯L・軒）', () => {
  assert.equal(formatValue('sources', 5094), '5,094か所');
  assert.equal(formatValue('areas', 226), '226か所');
  assert.equal(formatValue('flow', 293610), '毎分293,610L');
  assert.equal(formatValue('sento', 0), '0軒');
  assert.throws(() => formatValue('x', 1), /知らない指標/);
});

test('headline: 指標ごとの1位の文（同梱データ）', () => {
  assert.equal(headline(prefectures, 'sources'), '源泉の数、1位は大分県。5,094か所');
  assert.equal(headline(prefectures, 'areas'), '温泉地の数、1位は北海道。226か所');
  assert.equal(headline(prefectures, 'flow'), '湧き出る量、1位は大分県。毎分293,610L');
  assert.equal(headline(prefectures, 'sento'), '銭湯の数、1位は東京都。429軒');
});

test('headline: 1位が同数なら県名を「・」で並べる', () => {
  const tied = [{ code: '01', name: 'A県', sento: 5 }, { code: '02', name: 'B県', sento: 5 }, { code: '03', name: 'C県', sento: 1 }];
  assert.equal(headline(tied, 'sento'), '銭湯の数、1位はA県・B県。5軒');
});

test('ranking: 大きい順。同じ値は同じ順位で、次は飛ばす（並びは県コード順）', () => {
  const rows = ranking(prefectures, 'sources');
  assert.equal(rows.length, 47);
  assert.deepEqual(rows.slice(0, 3).map((row) => [row.name, row.value, row.rank]), [['大分県', 5094, 1], ['鹿児島県', 2735, 2], ['北海道', 2249, 3]]);
  assert.equal(rankOf(prefectures, 'sources', '05'), 11);
  assert.equal(rankOf(prefectures, 'areas', '05'), 7);
  // 銭湯が1軒の4県（茨城・島根・佐賀・沖縄）はそろって43位、0軒の山形は47位
  const sento = ranking(prefectures, 'sento');
  assert.deepEqual(sento.filter((row) => row.value === 1).map((row) => [row.code, row.rank]), [['08', 43], ['32', 43], ['41', 43], ['47', 43]]);
  assert.equal(rankOf(prefectures, 'sento', '06'), 47);
  assert.deepEqual(sento.slice(0, 3).map((row) => row.name), ['東京都', '大阪府', '青森県']);
  assert.equal(rankOf(prefectures, 'sento', '99'), null);
});

test('metricLine: 県のカードの1行', () => {
  assert.equal(metricLine(prefectures, akita, 'sources'), '源泉の数 616か所（全国11位）');
  assert.equal(metricLine(prefectures, akita, 'areas'), '温泉地の数 104か所（全国7位）');
  assert.equal(metricLine(prefectures, akita, 'sento'), '銭湯の数 12軒（全国32位）');
  assert.match(metricLine(prefectures, akita, 'flow'), /^湧き出る量 毎分79,766L（全国\d+位）$/);
});

test('compactMetrics / prefHeadline: 県のカードの残り3指標と、県の画面の見出し', () => {
  assert.deepEqual(compactMetrics(prefectures, akita, 'sources'), ['温泉地 104か所（7位）', '湧き出る量 毎分79,766L（9位）', '銭湯 12軒（32位）']);
  assert.deepEqual(compactMetrics(prefectures, akita, 'sento'), ['源泉 616か所（11位）', '温泉地 104か所（7位）', '湧き出る量 毎分79,766L（9位）']);
  // 全角の空白で県名と文を分ける
  assert.equal(prefHeadline(prefectures, akita, 'sources'), `秋田県${String.fromCharCode(0x3000)}源泉の数 616か所・全国11位`);
  assert.equal(prefHeadline(prefectures, prefectures.find((pref) => pref.code === '13'), 'sento'), `東京都${String.fromCharCode(0x3000)}銭湯の数 429軒・全国1位`);
});

test('topLabels: 上位3県の柱の根元の文字（指標を変えると差し替わる）', () => {
  assert.deepEqual(topLabels(prefectures, 'sources').map((item) => item.text), ['大分県 5,094', '鹿児島県 2,735', '北海道 2,249']);
  assert.deepEqual(topLabels(prefectures, 'sento').map((item) => item.text), ['東京都 429', '大阪府 354', '青森県 261']);
  assert.deepEqual(topLabels(prefectures, 'areas').map((item) => item.text), ['北海道 226', '長野県 193', '新潟県 135']);
  const oita = topLabels(prefectures, 'sources')[0];
  assert.deepEqual([oita.code, oita.lng, oita.lat], ['44', prefectures[43].capital.lng, prefectures[43].capital.lat]);
  // 3位が同数なら並べて出す。0は出さない
  const tied = [{ code: '01', name: 'A', sento: 3, capital: { lng: 1, lat: 1 } }, { code: '02', name: 'B', sento: 2, capital: { lng: 1, lat: 1 } },
    { code: '03', name: 'C', sento: 1, capital: { lng: 1, lat: 1 } }, { code: '04', name: 'D', sento: 1, capital: { lng: 1, lat: 1 } }, { code: '05', name: 'E', sento: 0, capital: { lng: 1, lat: 1 } }];
  assert.deepEqual(topLabels(tied, 'sento').map((item) => item.text), ['A 3', 'B 2', 'C 1', 'D 1']);
});

test('sentoTrend: 4年で3,231軒→2,730軒（501軒減）', () => {
  assert.equal(sentoTrend(stats.national.sentoSeries), '全国の銭湯は4年で3,231軒→2,730軒（501軒減）');
  assert.equal(sentoTrend([{ fy: 2020, count: 10 }, { fy: 2022, count: 12 }]), '全国の銭湯は2年で10軒→12軒（2軒増）');
  assert.equal(sentoTrend([{ fy: 2020, count: 10 }, { fy: 2021, count: 10 }]), '全国の銭湯は1年で10軒→10軒（増減なし）');
  assert.equal(sentoTrend([]), '');
  assert.equal(sentoTrend(null), '');
});

test('pillarHeight: 値÷最大値×最大高さ。0や最大0は柱なし', () => {
  assert.equal(pillarHeight(5094, 5094), MAX_PILLAR_METERS);
  assert.equal(pillarHeight(2547, 5094, 1000), 500);
  assert.equal(pillarHeight(0, 5094), 0);
  assert.equal(pillarHeight(5, 0), 0);
  assert.equal(pillarHeight(-1, 10), 0);
});

test('pillarColor: 温泉は朱→橙、銭湯は藍→水色。平方根で配る', () => {
  assert.equal(pillarColor('onsen', 0), '#d8432b');
  assert.equal(pillarColor('onsen', 1), '#ffb43e');
  assert.equal(pillarColor('sento', 0), '#3a63d6');
  assert.equal(pillarColor('sento', 1), '#8fe0ff');
  assert.equal(pillarColor('onsen', 0.25), mixColor('#d8432b', '#ffb43e', 0.5));
  assert.equal(mixColor('#000000', '#ffffff', 2), '#ffffff');
  assert.equal(mixColor('#000000', '#ffffff', -1), '#000000');
  assert.equal(mixColor('#000000', '#fefefe', 0.5), '#7f7f7f');
});

test('buildPillars: 47本。id は県の並び（1〜47）で指標を変えても同じ', () => {
  const sources = buildPillars(prefectures, 'sources');
  assert.equal(sources.features.length, 47);
  assert.deepEqual(sources.features.map((feature) => feature.id), Array.from({ length: 47 }, (_, index) => index + 1));
  const oita = sources.features.find((feature) => feature.properties.code === '44');
  assert.equal(oita.id, 44);
  assert.equal(oita.properties.h, MAX_PILLAR_METERS);
  assert.equal(oita.properties.label, '大分県 5,094か所（1位）');
  assert.equal(oita.properties.color, '#ffb43e');
  // 柱の根元（県庁所在地）。押した位置との近さを測るのに使う
  const capital = prefectures.find((pref) => pref.code === '44').capital;
  assert.deepEqual([oita.properties.cx, oita.properties.cy], [capital.lng, capital.lat]);
  const ring = oita.geometry.coordinates[0];
  assert.equal(ring.length, PILLAR_STEPS + 1);
  assert.deepEqual(ring[0], ring.at(-1));
});

test('buildPillars: 銭湯0軒の山形県には柱を立てない', () => {
  const sento = buildPillars(prefectures, 'sento');
  assert.equal(sento.features.length, 46);
  assert.equal(sento.features.some((feature) => feature.properties.code === '06'), false);
  assert.equal(sento.features.find((feature) => feature.properties.code === '13').id, 13);
  assert.equal(sento.features.find((feature) => feature.properties.code === '13').properties.label, '東京都 429軒（1位）');
});

test('easeOut: 0から1へ、1.2秒の ease-out', () => {
  assert.equal(GROW_MS, 1200);
  assert.equal(easeOut(0), 0);
  assert.equal(easeOut(1), 1);
  assert.equal(easeOut(2), 1);
  assert.equal(easeOut(-1), 0);
  assert.equal(easeOut(0.5), 0.875);
  assert.ok(easeOut(0.2) < easeOut(0.4));
});
