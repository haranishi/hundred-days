import test from 'node:test';
import assert from 'node:assert/strict';
import { nowWall, dateOf, clockOf, dayOf, relativeTime, absoluteTime } from '../lib/time.js';
test('日本時間の表示はUTCでも同じ。年と日付の境目', () => {
  const now = Date.parse('2026-12-31T15:00:00Z');
  assert.equal(nowWall(now), '2027-01-01T00:00'); assert.equal(dateOf(now), '2027-01-01');
  assert.equal(clockOf(now), '00:00'); assert.equal(dayOf(now), '1月1日');
});
test('相対時刻の全境界', () => {
  for (const [ms, text] of [[0, 'いま'], [59999, 'いま'], [60000, '1分前'], [3599999, '59分前'], [3600000, '1時間前'], [86399999, '23時間前'], [86400000, '1日前']]) assert.equal(relativeTime(0, ms), text);
});
test('同じ日は時刻だけ、前日以前は月日も付く', () => {
  const now = Date.parse('2026-09-09T00:05:00+09:00');
  assert.equal(absoluteTime(now, now), '00:05');
  assert.equal(absoluteTime(now - 600000, now), '9月8日 23:55');
});
