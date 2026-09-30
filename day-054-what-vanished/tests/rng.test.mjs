import test from 'node:test';
import assert from 'node:assert/strict';
import { hashString, mulberry32, newSeed, shuffled, stream } from '../lib/rng.js';

test('同じ種と系列名なら同じ乱数の列になる', () => {
  const a = stream(123, 'arrange', 0);
  const b = stream(123, 'arrange', 0);
  for (let i = 0; i < 20; i++) assert.equal(a(), b());
});

test('系列名が違えば別の列になる（機能ごとに独立）', () => {
  const a = stream(123, 'arrange', 0);
  const b = stream(123, 'vanish', 0);
  const xs = Array.from({ length: 8 }, () => a());
  const ys = Array.from({ length: 8 }, () => b());
  assert.notDeepEqual(xs, ys);
});

test('0以上1未満を返し、偏りすぎない', () => {
  const r = mulberry32(hashString('x'));
  let sum = 0;
  for (let i = 0; i < 5000; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1);
    sum += v;
  }
  assert.ok(Math.abs(sum / 5000 - 0.5) < 0.03);
});

test('shuffled は元の配列を変えず、同じ要素を並べ替えるだけ', () => {
  const list = [1, 2, 3, 4, 5, 6];
  const out = shuffled(stream(1, 's'), list);
  assert.deepEqual(list, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual([...out].sort(), list);
});

test('newSeed は挑戦リンクに載る1〜999999の整数', () => {
  assert.equal(newSeed(() => 0), 1);
  assert.equal(newSeed(() => 0.999999999), 999999);
});
