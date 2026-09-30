import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, hashSeed, shuffle, randomSeed } from '../lib/rng.js';

const take = (rand, n) => Array.from({ length: n }, () => rand());

test('mulberry32：同じ seed は同じ並び、別の seed は別の並び、値は [0,1)', () => {
  const a = take(mulberry32(42), 50);
  assert.deepEqual(take(mulberry32(42), 50), a);
  assert.notDeepEqual(take(mulberry32(43), 50), a);
  for (const v of a) assert.ok(v >= 0 && v < 1);
});

test('hashSeed：決定的で uint32、1字違いでも別の値', () => {
  assert.equal(hashSeed('abc123'), hashSeed('abc123'));
  assert.notEqual(hashSeed('abc123'), hashSeed('abc124'));
  const h = hashSeed('ことば辻');
  assert.ok(Number.isInteger(h) && h >= 0 && h <= 0xffffffff);
});

test('shuffle：元の配列を壊さず、同じ乱数なら同じ並びの置換を返す', () => {
  const src = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const a = shuffle(src, mulberry32(7));
  assert.deepEqual(src, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.notEqual(a, src);
  assert.deepEqual([...a].sort((x, y) => x - y), [...src]);
  assert.deepEqual(shuffle(src, mulberry32(7)), a);
});

test('randomSeed：base36 の6〜8字（果たし状の書式に収まる）', () => {
  for (let i = 0; i < 200; i++) assert.match(randomSeed(), /^[0-9a-z]{6,8}$/);
});
