import assert from 'node:assert/strict';
import test from 'node:test';
import { daysBetween, isDateString, localDateString } from '../lib/days.js';

test('localDateStringは現地日付をゼロ埋めする', () => {
  const date = new Date(2026, 0, 2, 23, 59);
  assert.equal(localDateString(date), '2026-01-02');
});

test('isDateStringは実在する日付だけを受け付ける', () => {
  assert.equal(isDateString('2026-02-30'), false);
  assert.equal(isDateString('2028-02-29'), true);
  assert.equal(isDateString('2026-2-03'), false);
});

test('daysBetweenは暦日の差を正負で返す', () => {
  assert.equal(daysBetween('2026-09-04', '2026-09-04'), 0);
  assert.equal(daysBetween('2026-09-04', '2026-09-05'), 1);
  assert.equal(daysBetween('2026-09-05', '2026-09-04'), -1);
  assert.equal(daysBetween('2025-12-31', '2026-01-01'), 1);
  assert.equal(daysBetween('2028-02-28', '2028-03-01'), 2);
});
