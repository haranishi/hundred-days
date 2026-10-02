import test from 'node:test';
import assert from 'node:assert/strict';
import { traceMask, polyArea, toPathD } from '../lib/contour.js';

const mask = (w, h, inside) => {
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = inside(x, y) ? 1 : 0;
  return m;
};
const total = (polys) => polys.reduce((s, p) => s + polyArea(p), 0);

test('正方形は1つの輪で、面積と幅がほぼ保たれる', () => {
  const polys = traceMask(mask(50, 50, (x, y) => x >= 5 && x < 45 && y >= 5 && y < 45), 50, 50);
  assert.equal(polys.length, 1);
  assert.ok(Math.abs(total(polys) - 1600) / 1600 < 0.05, `面積 ${total(polys)}`);
  const xs = polys[0].map((p) => p[0]);
  assert.ok(Math.min(...xs) >= 4.9 && Math.max(...xs) <= 45.1);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 39);
});

test('円の面積の誤差は5%以内', () => {
  const r = 30;
  const polys = traceMask(mask(80, 80, (x, y) => (x + 0.5 - 40) ** 2 + (y + 0.5 - 40) ** 2 <= r * r), 80, 80);
  assert.equal(polys.length, 1);
  const want = Math.PI * r * r;
  assert.ok(Math.abs(total(polys) - want) / want < 0.05, `面積 ${total(polys)} / ${want}`);
});

test('穴は向きの逆な輪になり、evenodd で抜ける', () => {
  const polys = traceMask(mask(60, 60, (x, y) => x >= 10 && x < 50 && y >= 10 && y < 50 && !(x >= 20 && x < 40 && y >= 20 && y < 40)), 60, 60);
  assert.equal(polys.length, 2);
  const signs = polys.map((p) => Math.sign(polyArea(p))).sort();
  assert.deepEqual(signs, [-1, 1]);
  assert.ok(Math.abs(total(polys) - 1200) / 1200 < 0.05, `面積 ${total(polys)}`);
});

test('1画素でも閉じた形になる', () => {
  const polys = traceMask(mask(5, 5, (x, y) => x === 2 && y === 2), 5, 5);
  assert.equal(polys.length, 1);
  assert.ok(total(polys) > 0.2);
  const d = toPathD(polys, 2, 1, 1);
  assert.match(d, /^M[\d. L]+Z$/);
});

test('toPathD は倍率とずらしを掛ける', () => {
  assert.equal(toPathD([[[0, 0], [1, 0], [1, 1]]], 10, 5, 2), 'M5 2L15 2L15 12Z');
});
