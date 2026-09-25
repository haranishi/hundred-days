import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeLayout } from '../../lib/layout.js';
import { WORLD } from '../../lib/physics.js';

const SIZES = [[360, 640], [390, 844], [430, 932], [540, 960], [768, 1024], [1024, 768], [1280, 720], [844, 390]];

test('8つの画面幅：遊び場は画面の中、縦は512〜624、天井から地面は常に420', () => {
  for (const [w, h] of SIZES) {
    const L = computeLayout(w, h);
    assert.ok(L.H >= 512 && L.H <= 624, `${w}x${h} H=${L.H}`);
    assert.equal(L.groundY - L.ceilingY, WORLD.bandH);
    assert.equal(L.H - L.groundY, WORLD.groundH);
    assert.ok(L.playX >= -1e-9 && L.playX + L.playW <= w + 1e-9, `${w}x${h} 横にはみ出す`);
    assert.ok(L.playY >= -1e-9 && L.playY + L.playH <= h + 1e-9, `${w}x${h} 縦にはみ出す`);
  }
});

test('スマホ縦持ちは上下に帯を出さない（遊び場が画面の縦いっぱい）', () => {
  for (const [w, h] of [[360, 640], [390, 844], [430, 932], [540, 960]]) {
    const L = computeLayout(w, h);
    assert.ok(Math.abs(L.playH - h) < 1.5 && Math.abs(L.playW - w) < 1.5, `${w}x${h}`);
  }
});

test('横長の画面は中央に縦長の遊び場。横持ちスマホだけ左右に振り分ける', () => {
  const pc = computeLayout(1280, 720);
  assert.ok(pc.playW < pc.vw && pc.playH === 720);
  assert.equal(pc.side, false);
  assert.equal(computeLayout(844, 390).side, true);
  assert.equal(computeLayout(1024, 768).side, false);
});
