import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWall, toWall, nowWall, clockOf, dateOf, humanDuration, relativeClock } from '../lib/time.js';

test('time: 壁時計の文字列は環境のタイムゾーンに左右されない', () => {
  const before = process.env.TZ;
  const readings = [];
  for (const tz of ['UTC', 'Asia/Tokyo', 'America/New_York']) {
    process.env.TZ = tz;
    readings.push(parseWall('2026-09-08T09:00'));
  }
  process.env.TZ = before;
  assert.equal(new Set(readings).size, 1, `環境ごとに違う値になった: ${readings.join(',')}`);
});

test('time: parseWall と toWall は往復する', () => {
  for (const wall of ['2026-01-01T00:00', '2026-09-08T15:40', '2026-12-31T23:59']) {
    assert.equal(toWall(parseWall(wall)), wall);
  }
});

test('time: 1時間の差はちょうど60', () => {
  assert.equal(parseWall('2026-09-08T10:00') - parseWall('2026-09-08T09:00'), 60);
  assert.equal(parseWall('2026-09-09T00:00') - parseWall('2026-09-08T23:00'), 60);
});

test('time: nowWall は日本時間を返す', () => {
  // 2026-09-08T00:30 UTC = 日本時間 09:30
  assert.equal(nowWall(new Date('2026-09-08T00:30:00Z')), '2026-09-08T09:30');
  // 年をまたぐ側も見る
  assert.equal(nowWall(new Date('2026-12-31T16:00:00Z')), '2027-01-01T01:00');
});

test('time: clockOf と dateOf', () => {
  assert.equal(clockOf('2026-09-08T15:40'), '15:40');
  assert.equal(dateOf('2026-09-08T15:40'), '2026-09-08');
});

test('time: humanDuration', () => {
  assert.equal(humanDuration(4.333), '4時間20分');
  assert.equal(humanDuration(0.67), '40分');
  assert.equal(humanDuration(3), '3時間');
  assert.equal(humanDuration(1.008), '1時間');
});

test('time: relativeClock は日付が変わるときだけ日を付ける', () => {
  assert.equal(relativeClock('2026-09-08T15:40', '2026-09-08T09:00'), '15:40');
  assert.equal(relativeClock('2026-09-09T10:00', '2026-09-08T22:00'), '明日の10:00');
  assert.equal(relativeClock('2026-09-10T10:00', '2026-09-08T22:00'), '9/10の10:00');
});
