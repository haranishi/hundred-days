import test from 'node:test';
import assert from 'node:assert/strict';
import * as time from '../lib/time.js';
import { clockOf, hoursSpan } from '../lib/time.js';

test('time: clockOf は壁掛け時計の文字列から時刻だけを切り出す', () => {
  assert.equal(clockOf('2026-09-13T12:00'), '12:00');
  assert.equal(clockOf('2026-09-13T22:45'), '22:45');
  assert.equal(clockOf(null), '', '欠測で例外にしない');
});

test('time: clockOf は環境のタイムゾーンに左右されない', () => {
  const before = process.env.TZ;
  const readings = [];
  for (const tz of ['UTC', 'Asia/Tokyo', 'America/New_York']) {
    process.env.TZ = tz;
    readings.push(clockOf('2026-09-13T12:00'));
  }
  process.env.TZ = before;
  assert.equal(new Set(readings).size, 1, `環境ごとに違う値になった: ${readings.join(',')}`);
});

test('time: hoursSpan は「約◯時間」にする', () => {
  assert.equal(hoursSpan(1.33), '約1.3時間');
  assert.equal(hoursSpan(2.46), '約2.5時間');
  assert.equal(hoursSpan(4.5454), '約4.5時間');
  assert.equal(hoursSpan(4.55), '約4.6時間', '小数第2位は切り上がる');
  assert.equal(hoursSpan(9.96), '約10時間', '10に丸まる値で「約10.0時間」と出さない');
  assert.equal(hoursSpan(12.4), '約12時間');
});

test('time: hoursSpan は出せないものを null にする', () => {
  assert.equal(hoursSpan(null), null, '乾かないとき');
  assert.equal(hoursSpan(0), null);
  assert.equal(hoursSpan(Infinity), null);
  assert.equal(hoursSpan(24.1), null, '上限を超えたら数字を出さない');
  assert.equal(hoursSpan(24), '約24時間', '上限ちょうどは出す');
});

test('time: 時刻を作る道具を持たない（将来の時刻を組み立てられないようにする）', () => {
  for (const name of ['parseWall', 'toWall', 'nowWall', 'relativeClock', 'humanDuration', 'dateOf']) {
    assert.equal(name in time, false, `${name} が export されている`);
  }
});
