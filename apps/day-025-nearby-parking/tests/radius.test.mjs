import test from 'node:test';
import assert from 'node:assert/strict';
import { nextRadius, RADII } from '../lib/state.js';

test('半径拡大: 段階は800→3200の2段だけ（往復回数を減らすため）', () => {
  assert.deepEqual(RADII, [800, 3200]);
  assert.equal(nextRadius(800, 0), 3200);
});

test('半径拡大: 3件以上なら停止', () => {
  assert.equal(nextRadius(800, 3), null);
  assert.equal(nextRadius(800, 20), null);
});

test('半径拡大: 3200mで打ち止め', () => {
  assert.equal(nextRadius(3200, 0), null);
});
