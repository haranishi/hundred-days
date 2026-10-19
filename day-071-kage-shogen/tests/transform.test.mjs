import assert from 'node:assert/strict';
import test from 'node:test';
import { VIEW } from '../lib/config.js';
import { createTransform } from '../lib/transform.js';

const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);

test('表示領域へ均等に拡大して中央に置き、yを反転する', () => {
  const t = createTransform(520, 360);
  near(t.scale, 2);
  near(t.offsetX, 0);
  near(t.offsetY, 0);
  assert.deepEqual(t.toScreen(VIEW.minX, VIEW.maxY), { x: 0, y: 0 });
  assert.deepEqual(t.toScreen(VIEW.maxX, VIEW.minY), { x: 520, y: 360 });
  const wide = createTransform(1000, 360);
  near(wide.scale, 2);
  near(wide.offsetX, (1000 - 520) / 2);
  const tall = createTransform(260, 400);
  near(tall.scale, 1);
  near(tall.offsetY, (400 - 180) / 2);
});

test('世界座標と画面座標が往復で一致する', () => {
  const t = createTransform(358, 248);
  for (const [x, y] of [[0, 0], [120, 99], [240, 180], [-10, 90], [250, 3.5]]) {
    const screen = t.toScreen(x, y);
    const back = t.toWorld(screen.x, screen.y);
    near(back.x, x, 1e-9);
    near(back.y, y, 1e-9);
  }
});

test('大きさが正の有限値でなければ RangeError', () => {
  for (const [w, h] of [[0, 100], [100, 0], [-1, 10], [Number.NaN, 10], [10, Infinity]]) {
    assert.throws(() => createTransform(w, h), RangeError);
  }
});
