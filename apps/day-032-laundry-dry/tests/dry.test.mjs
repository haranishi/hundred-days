import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FABRICS, PLACES, SMELL_HOURS, predict, judge, bestStart, tooLateToday, conditionsAt
} from '../lib/dry.js';
import { parseForecast } from '../lib/weather.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(resolve(HERE, 'fixtures/akita-2026-09-08.json'), 'utf8'));
const akita = parseForecast(fixture);

/** 同じ条件が延々と続く1日を作る（式の素の挙動を見るため） */
function flatHours({ et0, precip = 0, precipProb = 0, isDay = 1, from = '2026-09-08T00:00', count = 48 }) {
  const start = Date.UTC(2026, 8, 8, Number(from.slice(11, 13)), 0) / 60000;
  return Array.from({ length: count }, (_, i) => {
    const at = new Date((start + i * 60) * 60000);
    const pad = (n) => String(n).padStart(2, '0');
    return {
      time: `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}T${pad(at.getUTCHours())}:00`,
      et0, precip, precipProb, isDay, temp: 20, humidity: 60, wind: 10, radiation: 400
    };
  });
}

test('dry: 較正① 真夏の晴れ（ET0 0.6）で薄手は1時間ちょっと', () => {
  const result = predict({
    hours: flatHours({ et0: 0.6 }), sunsets: ['2026-09-08T18:50'],
    startAt: '2026-09-08T10:00', fabric: 'thin', place: 'sun'
  });
  assert.ok(result.hoursToDry > 0.9 && result.hoursToDry < 1.3, `薄手が${result.hoursToDry}時間`);
  assert.equal(result.verdict, 'good');
  assert.equal(result.smell, false);
});

test('dry: 較正② 秋の晴れた朝9時に干すとジーンズは昼過ぎ（実データ）', () => {
  const result = predict({
    hours: akita.hours, sunsets: akita.sunsets,
    startAt: '2026-09-08T09:00', fabric: 'thick', place: 'sun'
  });
  assert.ok(result.driedAt.startsWith('2026-09-08T1'), `乾き上がりが${result.driedAt}`);
  assert.ok(result.hoursToDry > 3.5 && result.hoursToDry < 6.5, `厚手が${result.hoursToDry}時間`);
  assert.equal(result.driedToday, true);
});

test('dry: 較正③ 冬の晴れ（ET0 0.08）でも厚手は1日で乾かない', () => {
  const result = predict({
    hours: flatHours({ et0: 0.08, count: 72 }), sunsets: ['2026-09-08T16:30'],
    startAt: '2026-09-08T09:00', fabric: 'thick', place: 'sun'
  });
  assert.ok(result.hoursToDry === null || result.hoursToDry > 24, `厚手が${result.hoursToDry}時間`);
  assert.equal(result.driedToday, false);
  assert.equal(result.verdict, 'bad');
});

test('dry: 薄手 < ふつう < 厚手 の順に時間がかかる', () => {
  const of = (fabric) => predict({
    hours: akita.hours, sunsets: akita.sunsets, startAt: '2026-09-08T09:00', fabric, place: 'sun'
  }).hoursToDry;
  assert.ok(of('thin') < of('normal'), '薄手がふつうより遅い');
  assert.ok(of('normal') < of('thick'), 'ふつうが厚手より遅い');
});

test('dry: 日かげは日なたより遅い（倍率どおり）', () => {
  const sun = predict({ hours: flatHours({ et0: 0.4 }), sunsets: ['2026-09-08T18:00'], startAt: '2026-09-08T09:00', fabric: 'normal', place: 'sun' });
  const shade = predict({ hours: flatHours({ et0: 0.4 }), sunsets: ['2026-09-08T18:00'], startAt: '2026-09-08T09:00', fabric: 'normal', place: 'shade' });
  const ratio = shade.hoursToDry / sun.hoursToDry;
  assert.ok(Math.abs(ratio - PLACES.sun.factor / PLACES.shade.factor) < 0.05, `倍率が${ratio}`);
});

test('dry: 雨の時間は乾かず、洗濯物は濡れ戻る', () => {
  const hours = flatHours({ et0: 0.3 }).map((hour, i) =>
    i >= 10 && i <= 12 ? { ...hour, precip: 1.2, precipProb: 90 } : hour);
  const result = predict({ hours, sunsets: ['2026-09-08T18:00'], startAt: '2026-09-08T09:00', fabric: 'thick', place: 'sun' });
  assert.equal(result.wetAgain, '2026-09-08T10:00');
  assert.equal(result.rainRisk, 90);
  assert.equal(result.verdict, 'bad');
  const during = result.timeline.find((row) => row.time === '2026-09-08T11:00');
  assert.equal(during.rate, 0, '雨の1時間で乾いている');
});

test('dry: 濡れ戻りは最初の水分量を超えない', () => {
  const hours = flatHours({ et0: 0.3, precip: 5, precipProb: 100 });
  const result = predict({ hours, sunsets: ['2026-09-08T18:00'], startAt: '2026-09-08T09:00', fabric: 'thin', place: 'sun' });
  const worst = Math.max(...result.timeline.map((row) => row.remaining));
  assert.ok(worst <= FABRICS.thin.water + 1e-9, `${worst} > ${FABRICS.thin.water}`);
  assert.equal(result.driedAt, null);
});

test('dry: 取り込み締切は「乾いたあと最初の雨か日没」の早いほう', () => {
  const dry = predict({ hours: flatHours({ et0: 0.6 }), sunsets: ['2026-09-08T18:00'], startAt: '2026-09-08T09:00', fabric: 'thin', place: 'sun' });
  assert.equal(dry.bringInBy, '2026-09-08T18:00', '雨が無ければ日没');

  const withRain = flatHours({ et0: 0.6 }).map((hour, i) => (i === 13 ? { ...hour, precip: 2 } : hour));
  const rainy = predict({ hours: withRain, sunsets: ['2026-09-08T18:00'], startAt: '2026-09-08T09:00', fabric: 'thin', place: 'sun' });
  assert.equal(rainy.bringInBy, '2026-09-08T13:00', '日没より早い雨が締切になる');
});

test('dry: 5時間を超えると生乾きの注意が出る', () => {
  const quick = predict({ hours: flatHours({ et0: 0.5 }), sunsets: ['2026-09-08T18:00'], startAt: '2026-09-08T08:00', fabric: 'thin', place: 'sun' });
  assert.equal(quick.smell, false);
  const slow = predict({ hours: flatHours({ et0: 0.12, count: 60 }), sunsets: ['2026-09-08T18:00'], startAt: '2026-09-08T08:00', fabric: 'normal', place: 'sun' });
  assert.ok(slow.hoursToDry > SMELL_HOURS);
  assert.equal(slow.smell, true);
});

test('dry: 判定バッジの境目', () => {
  assert.equal(judge({ hoursToDry: 4, rainRisk: 10, wetAgain: null, driedToday: true }), 'good');
  assert.equal(judge({ hoursToDry: 4, rainRisk: 30, wetAgain: null, driedToday: true }), 'fair', '降水確率30%はgoodにしない');
  assert.equal(judge({ hoursToDry: 5.1, rainRisk: 0, wetAgain: null, driedToday: true }), 'fair');
  assert.equal(judge({ hoursToDry: 10.1, rainRisk: 0, wetAgain: null, driedToday: true }), 'bad');
  assert.equal(judge({ hoursToDry: 2, rainRisk: 60, wetAgain: null, driedToday: true }), 'bad');
  assert.equal(judge({ hoursToDry: 2, rainRisk: 0, wetAgain: '2026-09-08T11:00', driedToday: true }), 'bad', '途中で雨に当たるならbad');
  assert.equal(judge({ hoursToDry: 2, rainRisk: 0, wetAgain: null, driedToday: false }), 'bad', '今日中に乾かないならbad');
  assert.equal(judge({ hoursToDry: null, rainRisk: 0, wetAgain: null, driedToday: false }), 'bad');
});

test('dry: 干し始めの端数は最初の1時間ぶんだけ按分する', () => {
  const full = predict({ hours: flatHours({ et0: 0.4 }), sunsets: ['2026-09-08T18:00'], startAt: '2026-09-08T09:00', fabric: 'normal', place: 'sun' });
  const half = predict({ hours: flatHours({ et0: 0.4 }), sunsets: ['2026-09-08T18:00'], startAt: '2026-09-08T09:30', fabric: 'normal', place: 'sun' });
  assert.ok(Math.abs(half.hoursToDry - full.hoursToDry) < 0.01, '一定の条件なら干し始めがずれても所要時間は同じ');
  assert.equal(half.timeline[0].time, '2026-09-08T09:00', '端数の1時間もタイムラインに残る');
});

test('dry: bestStart は今より後で、いちばん早く乾く正時を返す', () => {
  const best = bestStart({ hours: akita.hours, sunsets: akita.sunsets, from: '2026-09-08T06:00', fabric: 'normal', place: 'sun' });
  assert.ok(best, '候補が見つからない');
  assert.ok(best.startAt >= '2026-09-08T06:00');
  const worse = predict({ hours: akita.hours, sunsets: akita.sunsets, startAt: '2026-09-08T06:00', fabric: 'normal', place: 'sun' });
  assert.ok(best.hoursToDry <= worse.hoursToDry, '朝6時より良い候補を返せていない');
});

test('dry: bestStart は夜からの干し始めを提案しない', () => {
  const best = bestStart({ hours: akita.hours, sunsets: akita.sunsets, from: '2026-09-08T20:00', fabric: 'normal', place: 'sun' });
  assert.ok(best, '翌日の候補が無い');
  const hour = Number(best.startAt.slice(11, 13));
  assert.ok(hour >= 5 && hour <= 18, `夜を提案している: ${best.startAt}`);
});

test('dry: 日没まで1時間を切っていたら「今からでは遅い」', () => {
  assert.equal(tooLateToday({ startAt: '2026-09-08T17:30', sunsets: akita.sunsets }), true);
  assert.equal(tooLateToday({ startAt: '2026-09-08T09:00', sunsets: akita.sunsets }), false);
  assert.equal(tooLateToday({ startAt: '2026-09-08T21:00', sunsets: akita.sunsets }), true);
});

test('dry: 根拠に出す実測値は干し始めの時間帯のもの', () => {
  const hour = conditionsAt({ hours: akita.hours, startAt: '2026-09-08T11:30' });
  assert.equal(hour.time, '2026-09-08T11:00');
  assert.equal(hour.temp, 27.3);
  assert.equal(hour.humidity, 70);
});

test('dry: タイムラインは乾いた後も24時間ぶんまでで止まる', () => {
  const result = predict({ hours: akita.hours, sunsets: akita.sunsets, startAt: '2026-09-08T09:00', fabric: 'thin', place: 'sun' });
  assert.ok(result.timeline.length <= 24, `${result.timeline.length}件`);
  assert.ok(result.timeline.some((row) => row.dried), '乾いた後の時間が残っていない');
});
