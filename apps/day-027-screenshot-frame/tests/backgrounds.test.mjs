import assert from 'node:assert/strict';
import test from 'node:test';
import { BACKGROUNDS, DEFAULT_BACKGROUND } from '../lib/backgrounds.js';

test('背景は10種でidが重複しない', () => {
  assert.equal(BACKGROUNDS.length, 10);
  assert.equal(new Set(BACKGROUNDS.map(({ id }) => id)).size, BACKGROUNDS.length);
});
test('既定の葡萄が存在する', () => assert.ok(BACKGROUNDS.some(({ id }) => id === DEFAULT_BACKGROUND)));
test('グラデーションはすべて2色', () => {
  for (const background of BACKGROUNDS.filter(({ type }) => type === 'gradient')) assert.equal(background.colors.length, 2);
});
