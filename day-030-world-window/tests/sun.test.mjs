import test from 'node:test';
import assert from 'node:assert/strict';
import { dayPhase, sunElevation } from '../lib/sun.js';

test('sun: 東京の夏至は正午が昼、深夜が夜になる', () => {
  const noon = sunElevation(35.6812, 139.7671, new Date('2026-06-21T03:00:00Z'));
  const midnight = sunElevation(35.6812, 139.7671, new Date('2026-06-20T15:00:00Z'));
  assert.equal(dayPhase(noon), 'day');
  assert.equal(dayPhase(midnight), 'night');
  assert.ok(noon > 70);
});

test('sun: 北緯80度の夏至の深夜は白夜になる', () => {
  const elevation = sunElevation(80, 0, new Date('2026-06-21T00:00:00Z'));
  assert.ok(['day', 'twilight'].includes(dayPhase(elevation)));
});

test('sun: 昼・薄明・夜の境界を含めて分類する', () => {
  assert.equal(dayPhase(6), 'day');
  assert.equal(dayPhase(-6), 'twilight');
  assert.equal(dayPhase(-6.01), 'night');
});
