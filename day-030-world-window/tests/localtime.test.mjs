import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateOffsetHours, formatLocalTime } from '../lib/localtime.js';

test('localtime: 経度を15度帯に丸め、実用上のUTC範囲に収める', () => {
  assert.equal(estimateOffsetHours(139.7), 9);
  assert.equal(estimateOffsetHours(-74), -5);
  assert.equal(estimateOffsetHours(220), 14);
  assert.equal(estimateOffsetHours(-220), -12);
});

test('localtime: 日付をまたいでも現地の時刻だけをHH:MMで返す', () => {
  assert.equal(formatLocalTime(135, new Date('2026-01-01T18:05:00Z')), '03:05');
  assert.equal(formatLocalTime(-75, new Date('2026-01-01T02:07:00Z')), '21:07');
});
