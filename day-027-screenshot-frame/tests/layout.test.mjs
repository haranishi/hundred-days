import assert from 'node:assert/strict';
import test from 'node:test';
import { computeLayout } from '../lib/layout.js';

const defaults = { imgW: 800, imgH: 500, padding: 40, radius: 35, shadow: 50, aspect: 'auto', frame: false };

test('800×500の既定値は自動で960×660', () => {
  const result = computeLayout(defaults);
  assert.equal(result.pad, 80);
  assert.deepEqual([result.width, result.height], [960, 660]);
});
test('1:1は960×960', () => assert.deepEqual([computeLayout({ ...defaults, aspect: '1:1' }).width, computeLayout({ ...defaults, aspect: '1:1' }).height], [960, 960]));
test('枠ありは帯29pxで960×689', () => {
  const result = computeLayout({ ...defaults, frame: true });
  assert.equal(result.bar, 29);
  assert.deepEqual([result.width, result.height], [960, 689]);
});
test('6000×3000は長辺4096pxへ縮小', () => {
  const result = computeLayout({ ...defaults, imgW: 6000, imgH: 3000 });
  assert.equal(result.scale, 4096 / 7200);
  assert.deepEqual([result.width, result.height], [4096, 2389]);
});
test('設定値は0〜100の整数へ丸める', () => {
  const low = computeLayout({ ...defaults, padding: -9, radius: -2, shadow: -1 });
  const high = computeLayout({ ...defaults, padding: 140, radius: 101, shadow: 120 });
  assert.equal(low.pad, 0);
  assert.equal(low.radius, 0);
  assert.equal(low.shadow.alpha, 0);
  assert.equal(high.pad, 200);
  assert.equal(high.radius, 48);
  assert.equal(high.shadow.alpha, .45);
});
test('極小・不正寸法でも各寸法は最小1px', () => {
  const result = computeLayout({ ...defaults, imgW: 0, imgH: 0, maxSide: 1 });
  assert.ok(result.width >= 1 && result.height >= 1);
  assert.ok(result.card.w >= 1 && result.card.h >= 1 && result.image.w >= 1 && result.image.h >= 1);
});
