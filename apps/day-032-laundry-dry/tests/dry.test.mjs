import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as dry from '../lib/dry.js';
import {
  FABRICS, PLACES, SMELL_HOURS, MAX_SHOWN_HOURS, RAIN_MM,
  dryRate, hoursFor, estimate, judge, whyNotDrying
} from '../lib/dry.js';
import { parseCurrent } from '../lib/weather.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const load = (name) => parseCurrent(JSON.parse(readFileSync(resolve(HERE, 'fixtures', name), 'utf8')));

/* 実際に Open-Meteo が返した1時点（2026-09-13 秋田）。
   昼＝ET0 0.12mm/15分＝0.48mm/h、夜＝雨0.9mm/15分・ET0 0 */
const day = load('akita-current-day.json');
const nightRain = load('akita-current-night-rain.json');

/** 条件をひとつだけ変えた「いまの値」を作る */
const at = (patch) => ({ ...day, ...patch });

test('dry: 較正① 真夏の晴れ（ET0 0.6mm/h）で薄手は1時間ちょっと', () => {
  const result = estimate({ current: at({ et0PerHour: 0.6 }), place: 'sun' });
  const thin = result.items.find((item) => item.key === 'thin');
  assert.ok(thin.hours > 0.9 && thin.hours < 1.3, `薄手が${thin.hours}時間ぶん`);
  assert.equal(result.verdict, 'good');
  assert.equal(result.smell, false);
});

test('dry: 較正② 秋の晴れた昼（実データ・ET0 0.48mm/h）で厚手は4〜5時間ぶん', () => {
  const result = estimate({ current: day, place: 'sun' });
  assert.equal(result.et0PerHour, 0.48, 'fixture の 0.12mm/15分 が mm/h に直っていない');
  const thick = result.items.find((item) => item.key === 'thick');
  assert.ok(thick.hours > 3.5 && thick.hours < 6.5, `厚手が${thick.hours}時間ぶん`);
});

test('dry: 較正③ 冬の晴れ（ET0 0.08mm/h）でも厚手は1日ぶんでは足りない', () => {
  const result = estimate({ current: at({ et0PerHour: 0.08 }), place: 'sun' });
  const thick = result.items.find((item) => item.key === 'thick');
  assert.ok(thick.hours > MAX_SHOWN_HOURS, `厚手が${thick.hours}時間ぶん`);
  assert.equal(thick.tooLong, true);
  assert.equal(result.verdict, 'slow');
});

test('dry: 薄手 < ふつう < 厚手 の順に時間がかかり、3つとも同時に出す', () => {
  const { items } = estimate({ current: day, place: 'sun' });
  assert.deepEqual(items.map((item) => item.key), ['thin', 'normal', 'thick'], '3つ揃っていない');
  assert.ok(items[0].hours < items[1].hours && items[1].hours < items[2].hours);
});

test('dry: 日かげは日なたより遅い（倍率どおり）', () => {
  const sun = estimate({ current: day, place: 'sun' });
  const shade = estimate({ current: day, place: 'shade' });
  const ratio = shade.items[1].hours / sun.items[1].hours;
  assert.ok(Math.abs(ratio - PLACES.sun.factor / PLACES.shade.factor) < 0.01, `倍率が${ratio}`);
});

test('dry: いま雨なら乾かない（実データの夜＋雨）', () => {
  const result = estimate({ current: nightRain, place: 'sun' });
  assert.equal(result.precipPerHour, 3.6, '0.9mm/15分 が mm/h に直っていない');
  assert.equal(result.raining, true);
  assert.equal(result.rate, 0);
  assert.equal(result.verdict, 'rain');
  assert.ok(result.items.every((item) => item.hours === null), '雨なのに時間が出ている');
  assert.match(whyNotDrying(result), /雨に当たる/);
});

test('dry: 雨でなくても乾かす力が0なら時間を出さない（夜）', () => {
  const result = estimate({ current: at({ et0PerHour: 0, precipPerHour: 0, isDay: false }), place: 'sun' });
  assert.equal(result.verdict, 'none');
  assert.ok(result.items.every((item) => item.hours === null));
  assert.match(whyNotDrying(result), /日が沈んで/);
});

test('dry: ET0 が正でも弱い雨が降っていれば乾かない扱いにする', () => {
  const justUnder = estimate({ current: at({ precipPerHour: RAIN_MM - 0.01 }), place: 'sun' });
  const justOver = estimate({ current: at({ precipPerHour: RAIN_MM }), place: 'sun' });
  assert.ok(justUnder.rate > 0, 'しきい値未満で止めてしまっている');
  assert.equal(justOver.rate, 0);
});

test('dry: 5時間ぶんを超えると生乾きの注意が出る', () => {
  assert.equal(estimate({ current: at({ et0PerHour: 0.5 }), place: 'sun' }).smell, false);
  const slow = estimate({ current: at({ et0PerHour: 0.16 }), place: 'sun' });
  assert.ok(slow.items[1].hours > SMELL_HOURS);
  assert.equal(slow.smell, true);
});

test('dry: 判定の境目は「ふつう」が何時間ぶんか', () => {
  const rateFor = (hours) => FABRICS.normal.water / hours;
  assert.equal(judge({ rate: rateFor(4) }), 'good');
  assert.equal(judge({ rate: rateFor(SMELL_HOURS) }), 'good', '5時間ちょうどは good');
  assert.equal(judge({ rate: rateFor(5.1) }), 'fair');
  assert.equal(judge({ rate: rateFor(10) }), 'fair');
  assert.equal(judge({ rate: rateFor(10.1) }), 'slow');
  assert.equal(judge({ rate: 0 }), 'none');
  assert.equal(judge({ rate: 0, raining: true }), 'rain');
});

test('dry: 速さと割り算は素直な純関数', () => {
  assert.equal(dryRate({ et0PerHour: 0.4, place: 'sun' }), 0.4 * PLACES.sun.factor);
  assert.equal(dryRate({ et0PerHour: 0.4, precipPerHour: 1, place: 'sun' }), 0);
  assert.equal(dryRate({ et0PerHour: -1, place: 'sun' }), 0, '負のET0で負の速さを返している');
  assert.equal(hoursFor(0.5, 0.25), 2);
  assert.equal(hoursFor(0.5, 0), null);
});

/* ここから下は「将来の予想を出さない」ことを固定するテスト。
   気象業務法17条の予報業務にしないための線なので、機能追加で崩れたら必ず気づけるようにする */

test('dry: 戻り値に「いまより先の時刻」が入らない', () => {
  const result = estimate({ current: day, place: 'sun' });
  const stamps = [];
  const walk = (node) => {
    if (typeof node === 'string') {
      if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(node)) stamps.push(node);
    } else if (node && typeof node === 'object') {
      Object.values(node).forEach(walk);
    }
  };
  walk(result);
  assert.deepEqual(stamps, [day.time], `いま(${day.time})以外の時刻が混ざっている: ${stamps.join(',')}`);
});

test('dry: 廃止した「将来の時刻」の項目が復活していない', () => {
  const result = estimate({ current: day, place: 'sun' });
  for (const key of ['driedAt', 'bringInBy', 'wetAgain', 'timeline', 'hoursToDry', 'driedToday', 'rainRisk']) {
    assert.equal(key in result, false, `${key} が戻り値に復活している`);
  }
});

test('dry: 将来の予報を読む関数を公開していない', () => {
  for (const name of ['predict', 'bestStart', 'tooLateToday', 'conditionsAt']) {
    assert.equal(name in dry, false, `${name} が export されている`);
  }
});

test('dry: 入力として時系列（将来の予報）を受け取らない', () => {
  const withFuture = estimate({
    current: day,
    place: 'sun',
    // 将来の予報を渡しても無視される＝計算に入る余地がない
    hours: [{ time: '2026-09-14T09:00', et0: 9 }],
    sunsets: ['2026-09-13T18:00']
  });
  assert.deepEqual(withFuture, estimate({ current: day, place: 'sun' }));
});
