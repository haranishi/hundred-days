import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gapFor, pitchFor } from '../../lib/difficulty.js';

test('すき間：最初の3本は150、30本目で116、その間は直線、60本目106で据え置き', () => {
  for (const n of [1, 2, 3]) assert.equal(gapFor(n), 150);
  assert.equal(gapFor(30), 116);
  assert.equal(gapFor(80), 106);
  const mid = gapFor(16.5);
  assert.ok(Math.abs(mid - 133) < 1e-9, `中間が直線でない: ${mid}`);
  for (let n = 4; n <= 30; n += 1) assert.ok(gapFor(n) < gapFor(n - 1), `${n}本目で狭まっていない`);
});

test('間隔：180から30本目で155まで直線で詰める', () => {
  assert.equal(pitchFor(1), 180);
  assert.equal(pitchFor(3), 180);
  assert.equal(pitchFor(30), 155);
  assert.equal(pitchFor(200), 150);
  for (let n = 4; n <= 30; n += 1) assert.ok(pitchFor(n) < pitchFor(n - 1));
});

 test('30〜60本は直線で縮まり、60本以降は一定', () => {
  assert.equal(gapFor(45), 111);
  assert.equal(pitchFor(45), 152.5);
  for (let n = 31; n <= 60; n += 1) {
    assert.ok(gapFor(n) < gapFor(n - 1));
    assert.ok(pitchFor(n) < pitchFor(n - 1));
  }
  for (const n of [60, 61, 80, 1000]) {
    assert.equal(gapFor(n), 106);
    assert.equal(pitchFor(n), 150);
  }
});
