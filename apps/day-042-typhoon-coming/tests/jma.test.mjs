/* 気象庁JSONの読み取り。bosai は公式のWebAPIではないので、形が変わったら
   空の答えを作らずに例外を投げることまでを固定する。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE, ShapeError, dataUrl, fetchAll, num, parseForecast, parseSpecifications,
  parseTargets, parseThrough, parseTimeseries, text,
} from '../lib/jma.js';
import { rawForecast, rawSpecifications, rawTargetTc, rawThrough, rawTimeseries, stubFetch } from './fixtures.mjs';

test('外へ出る宛先は気象庁だけ', () => {
  assert.equal(new URL(BASE).hostname, 'www.jma.go.jp');
  assert.equal(dataUrl('TC2630', 'forecast'), 'https://www.jma.go.jp/bosai/typhoon/data/TC2630/forecast.json');
});

test('targetTc から eventId と台風番号を取る', () => {
  const targets = parseTargets(rawTargetTc);
  assert.equal(targets.length, 1);
  assert.equal(targets[0].tropicalCyclone, 'TC2630');
  assert.equal(targets[0].typhoonNumber, '2625');
  assert.equal(targets[0].number, 25, '下2桁が台風第25号。年の下2桁ではない');
  assert.equal(targets[0].issue, '2026-09-18T18:45:00+09:00');
});

test('台風が無いときは空配列。これだけが「台風なし」', () => {
  assert.deepEqual(parseTargets([]), []);
  assert.throws(() => parseTargets({}), ShapeError);
  assert.throws(() => parseTargets([{ tropicalCyclone: 'TC2630' }]), ShapeError);
});

test('3時間ごとの確率は375地域×40本', () => {
  const series = parseTimeseries(rawTimeseries);
  assert.equal(series.targetDatetime, '2026-09-18T15:00:00+09:00');
  assert.equal(series.validtime.length, 40);
  assert.equal(series.validtime[0], '2026-09-18T18:00:00+09:00');
  assert.equal(series.validtime[39], '2026-09-23T15:00:00+09:00');
  assert.equal(Object.keys(series.probability).length, 375);
  assert.equal(series.probability['130011'].length, 40);
  assert.equal(Math.max(...series.probability['130011']), 22);
});

test('積算は5本で、5日目が「5日以内」の値', () => {
  const through = parseThrough(rawThrough);
  assert.equal(through.validtime.length, 5);
  assert.deepEqual(through.probability['130011'], [0, 0, 29, 30, 30]);
  assert.deepEqual(through.probability['050013'], [0, 0, 1, 2, 2]);
  assert.deepEqual(through.probability['471011'], [0, 0, 0, 0, 0], '那覇（南部）は5日とも0%');
});

test('系列の長さ・桁・値がずれたら例外', () => {
  const broken = (change) => {
    const copy = JSON.parse(JSON.stringify(rawTimeseries));
    change(copy);
    return () => parseTimeseries(copy);
  };
  assert.throws(broken((c) => { c.probability['130011'].pop(); }), ShapeError, '40本でない');
  assert.throws(broken((c) => { c.validtime.pop(); }), ShapeError, 'validtime が合わない');
  assert.throws(broken((c) => { c.probability['130011'][0] = '0'; }), ShapeError, '整数でない');
  assert.throws(broken((c) => { c.probability['130011'][0] = 101; }), ShapeError, '0〜100の外');
  assert.throws(broken((c) => { c.probability['13001'] = c.probability['130011']; }), ShapeError, '6桁でない');
  assert.throws(broken((c) => { delete c.targetDatetime; }), ShapeError);
});

/* 画面は「文字列の年月日時分＝日本時間」で作ってある（lib/time.js）。
   オフセットが変わったら、9時間ずれた文を黙って出す前に形の変化として止める */
test('時刻のオフセットが +09:00 でなくなったら例外', () => {
  const swap = (value) => value.replace('+09:00', 'Z');
  const timeseries = JSON.parse(JSON.stringify(rawTimeseries));
  timeseries.validtime = timeseries.validtime.map(swap);
  assert.throws(() => parseTimeseries(timeseries), ShapeError, 'validtime が Z');

  const through = JSON.parse(JSON.stringify(rawThrough));
  through.targetDatetime = swap(through.targetDatetime);
  assert.throws(() => parseThrough(through), ShapeError, 'targetDatetime が Z');

  const targets = JSON.parse(JSON.stringify(rawTargetTc));
  targets[0].issue = targets[0].issue.replace('+09:00', '+00:00');
  assert.throws(() => parseTargets(targets), ShapeError, 'issue が別のオフセット');
});

test('実況と予報を読む。文字列の数値は数値に、"-" は出さない', () => {
  const spec = parseSpecifications(rawSpecifications);
  assert.equal(spec.number, 25);
  assert.equal(spec.name, 'ドゥージェン');
  assert.equal(spec.category, '台風');
  assert.equal(spec.issue, '2026-09-18T18:45:00+09:00');
  const now = spec.analysis;
  assert.equal(now.pressure, 975, '文字列の "975" を数値にする');
  assert.equal(now.windMs, 30);
  assert.equal(now.gustMs, 45);
  assert.equal(now.speedKmh, 25);
  assert.equal(now.course, '西');
  assert.equal(now.location, '父島の南約180km');
  assert.equal(now.accuracy, 'ほぼ正確');
  assert.equal(now.scale, '大型');
  assert.equal(now.intensity, '', '"-" は該当なしなので空にする');
  assert.deepEqual(now.position, { lat: 25.5, lng: 142.2 });
  assert.deepEqual(now.stormWarning, [{ area: '全域', km: 110 }]);
  assert.deepEqual(now.galeWarning, [{ area: '北東', km: 750 }, { area: '南西', km: 390 }]);
  assert.equal(spec.forecasts.length, 5);
  assert.deepEqual(spec.forecasts.map((row) => row.advancedHours), [12, 24, 45, 69, 93]);
  assert.equal(spec.forecasts[0].circleKm, 65);
});

test('数値と文字の揃え方', () => {
  assert.equal(num('975'), 975);
  assert.equal(num(975), 975);
  assert.equal(num('-'), null);
  assert.equal(num(''), null);
  assert.equal(num(undefined), null);
  assert.equal(num('つよい'), null);
  assert.equal(text('大型'), '大型');
  assert.equal(text('-'), '');
  assert.equal(text(undefined), '');
});

test('地図の幾何を読む。半径はメートル、角度は度のまま', () => {
  const forecast = parseForecast(rawForecast);
  assert.equal(forecast.steps.length, 6);
  const now = forecast.steps[0];
  assert.equal(now.part, '実況');
  assert.deepEqual(now.center, { lat: 25.5, lng: 142.2 });
  assert.equal(now.track.preTyphoon.length, 21);
  assert.equal(now.track.typhoon.length, 16);
  assert.deepEqual(now.arcs[0], { center: { lat: 25.5, lng: 142.2 }, radius: 111120, from: 0, to: 360 });
  assert.equal(now.galeArea.radius, 564860);
  const last = forecast.steps[5];
  assert.equal(last.circle.radius, 324100);
  assert.equal(last.arcs.length, 7);
  assert.equal(last.lines.length, 10);
});

test('壊れた応答は例外にする（空の答えを作らない）', () => {
  assert.throws(() => parseSpecifications([{ part: 'nope' }]), ShapeError);
  assert.throws(() => parseSpecifications(rawTimeseries), ShapeError);
  assert.throws(() => parseForecast([]), ShapeError);
  assert.throws(() => parseForecast(rawSpecifications), ShapeError);
});

test('台風1つぶんを4本まとめて取る', async () => {
  const { fetchImpl, seen } = stubFetch();
  const report = await fetchAll({ fetchImpl, now: () => 1 });
  assert.equal(report.typhoons.length, 1);
  assert.equal(report.typhoons[0].specifications.number, 25);
  assert.equal(seen.length, 5, '一覧1本＋台風ごとに4本');
  for (const url of seen) assert.equal(new URL(url).hostname, 'www.jma.go.jp');
});

test('1本でも取れなければ失敗にする（半端な答えを出さない）', async () => {
  const { fetchImpl } = stubFetch({ 'https://www.jma.go.jp/bosai/typhoon/data/TC2630/forecast.json': 500 });
  await assert.rejects(fetchAll({ fetchImpl }));
});

test('一覧が500なら失敗で、台風なしにはしない', async () => {
  const { fetchImpl } = stubFetch({ 'https://www.jma.go.jp/bosai/typhoon/data/targetTc.json': 500 });
  await assert.rejects(fetchAll({ fetchImpl }));
});

test('一覧が空なら、通信は1本だけで台風なしを返す', async () => {
  const { fetchImpl, seen } = stubFetch({ 'https://www.jma.go.jp/bosai/typhoon/data/targetTc.json': [] });
  const report = await fetchAll({ fetchImpl, now: () => 7 });
  assert.deepEqual(report, { fetchedAt: 7, typhoons: [] });
  assert.equal(seen.length, 1);
});
