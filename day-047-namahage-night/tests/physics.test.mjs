import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step, advance, DT } from '../lib/physics.js';
import { fixture, run } from './helpers.mjs';
test('固定刻み・入力列の決定性と入力状態の非破壊', () => {
  const initial = fixture(),
    copy = structuredClone(initial);
  let a = initial,
    b = initial;
  for (let i = 0; i < 300; i++) {
    const input = { right: i < 150, jump: i % 60 < 35 };
    a = step(a, input);
    b = step(b, input);
  }
  assert.deepEqual(a, b);
  assert.deepEqual(initial, copy);
  const one = advance(initial, 1, { right: true });
  let chunks = { state: initial, remainder: 0 };
  for (let i = 0; i < 60; i++)
    chunks = advance(chunks.state, 1 / 60, { right: true }, chunks.remainder);
  assert.deepEqual(one.state, chunks.state);
  assert.equal(one.state.tick, 120);
});
test('=を下から抜け、下降時は上に着地', () => {
  let s = fixture([
    [5, 9, '='],
    [6, 9, '='],
  ]);
  Object.assign(s.player, { x: 82, y: 162 });
  let above = false,
    landed = false;
  for (let i = 0; i < 120; i++) {
    s = step(s, { jump: true });
    if (s.player.y + s.player.h <= 144) above = true;
    if (above && s.player.grounded && s.player.y + s.player.h === 144)
      landed = true;
  }
  assert.ok(above);
  assert.ok(landed);
});
test('氷の地上摩擦は1/4、空中は120', () => {
  const normal = fixture(),
    ice = fixture([[1, 11, '~']]);
  normal.player.vx = ice.player.vx = 80;
  assert.equal((80 - step(normal).player.vx) / (80 - step(ice).player.vx), 4);
  normal.player.grounded = false;
  normal.player.y = 60;
  assert.equal(step(normal).player.vx, 79);
});
test('ジャンプを離すと-120で打ち切る', () => {
  let s = step(fixture(), { jump: true });
  assert.equal(s.player.vy, -300 + 900 * DT);
  s = step(s, { jump: false });
  assert.equal(s.player.vy, -120 + 900 * DT);
});
test('なまはげの初速と荒鬼の二段ジャンプ', () => {
  let s = fixture([], { stage: 2 });
  s = step(s, { jump: true });
  assert.equal(s.player.vy, -330 + 900 * DT);
  s = step(s);
  s = step(s, { jump: true });
  assert.equal(s.player.jumps, 2);
  assert.equal(s.player.vy, -330 + 900 * DT);
  s = step(s);
  s = step(s, { jump: true });
  assert.equal(s.player.jumps, 2);
  assert.ok(s.player.vy > -120);
});
test('コヨーテ時間と着地前の先行入力', () => {
  let s = fixture();
  Object.assign(s.player, { y: 140, grounded: false, coyote: 0.04 });
  s = step(s, { jump: true });
  assert.ok(s.player.vy < 0);
  s = fixture();
  Object.assign(s.player, { y: 150, grounded: false, coyote: 0, vy: 150 });
  s = step(s, { jump: true });
  s = run(s, 8, { jump: true });
  assert.ok(s.player.vy < 0);
  assert.equal(s.player.jumps, 1);
});
test('敵を踏むと消え、反動は-220', () => {
  let s = fixture([[5, 10, 'D']]);
  Object.assign(s.player, {
    x: 82,
    y: 145,
    vy: 160,
    grounded: false,
    coyote: 0,
  });
  s = step(s);
  assert.equal(s.entities.find(e => e.type === 'D').alive, false);
  assert.equal(s.player.vy, -220);
  assert.ok(s.events.includes('stomp'));
});
test('被弾で段階低下・1.2秒無敵・ちびは残機減少', () => {
  for (const stage of [0, 1, 2]) {
    let s = fixture([[5, 10, 'D']], { stage });
    s.player.x = 80;
    s = step(s);
    if (stage) {
      assert.equal(s.stage, stage - 1);
      assert.equal(s.player.invincible, 1.2);
      assert.equal(step(s).stage, stage - 1);
    } else {
      assert.equal(s.lives, 2);
      assert.equal(s.status, 'dying');
      s = run(s, 95);
      assert.equal(s.status, 'dying');
      s = step(s);
      assert.equal(s.status, 'playing');
      assert.equal(s.player.x, 16);
    }
  }
});
test('落下は段階によらずミス、残機0で面選択用over', () => {
  let s = fixture([], { stage: 2, lives: 1 });
  s.player.y = 209;
  s = step(s);
  assert.equal(s.lives, 0);
  s = run(s, 96);
  assert.equal(s.status, 'over');
});
test('餅で進化、最大は得点、米俵20個で残機増', () => {
  for (const stage of [0, 1, 2]) {
    let s = fixture([[2, 10, 'o']], { stage });
    s.player.x = 32;
    s = step(s);
    assert.equal(s.stage, Math.min(2, stage + 1));
    assert.equal(s.mochi, 1);
    if (stage === 2) assert.equal(s.score, 100);
  }
  let s = fixture([[2, 10, '*']], { rice: 19 });
  s.player.x = 32;
  s = step(s);
  assert.equal(s.lives, 4);
  assert.equal(s.rice, 20);
});
test('戸口に触れるとclearになり更新が止まる', () => {
  let s = fixture();
  s.player.x = 352;
  s = step(s);
  assert.equal(s.status, 'clear');
  assert.equal(step(s), s);
});
