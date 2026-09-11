import test from 'node:test';
import assert from 'node:assert/strict';
import { halftoneDots, luminanceAt, coverRect } from '../lib/halftone.js';

const solid = (value, width = 24, height = 24) => ({
  width, height, data: new Uint8ClampedArray(width * height * 4).fill(value)
});

test('luminanceAt: 白は1、黒は0', () => {
  assert.equal(luminanceAt(solid(255), 5, 5), 1);
  assert.equal(luminanceAt(solid(0), 5, 5), 0);
});

test('luminanceAt: 枠の外を指しても落ちない', () => {
  assert.equal(luminanceAt(solid(255), -10, 999), 1);
});

test('halftoneDots: 白い面には点を打たない', () => {
  assert.equal(halftoneDots(solid(255)).length, 0);
});

test('halftoneDots: 黒い面は点で埋まる', () => {
  const dots = halftoneDots(solid(0), { cell: 4 });
  assert.ok(dots.length > 20);
  for (const dot of dots) {
    assert.ok(dot.r > 0 && dot.r <= 4 * 0.74);
    assert.ok(dot.x >= 0 && dot.x < 24 && dot.y >= 0 && dot.y < 24);
  }
});

test('halftoneDots: 暗いほど点が大きい', () => {
  const dark = halftoneDots(solid(40), { cell: 4 });
  const light = halftoneDots(solid(200), { cell: 4 });
  const average = (dots) => dots.reduce((sum, d) => sum + d.r, 0) / Math.max(1, dots.length);
  assert.ok(average(dark) > average(light));
});

test('halftoneDots: セルを広げると点が減る', () => {
  assert.ok(halftoneDots(solid(0), { cell: 8 }).length < halftoneDots(solid(0), { cell: 4 }).length);
});

test('coverRect: 横長の写真は左右がはみ出す', () => {
  const fit = coverRect({ width: 1200, height: 630 }, { width: 400, height: 400 });
  assert.ok(fit.width >= 400 && fit.height >= 400);
  assert.ok(fit.x < 0);
  assert.equal(Math.round(fit.y), 0);
});

test('coverRect: 縦長の写真は上下がはみ出す', () => {
  const fit = coverRect({ width: 600, height: 1200 }, { width: 400, height: 400 });
  assert.ok(fit.y < 0);
});
