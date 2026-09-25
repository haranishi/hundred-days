import { test } from 'node:test';
import assert from 'node:assert/strict';
import { circleRect, circleCircle, hitPole, hitGround, clampCeiling } from '../../lib/collision.js';

test('円と矩形：辺に触れる手前は当たらず、めり込めば当たる', () => {
  assert.equal(circleRect(0, 0, 9, 9.01, -5, 10, 10), null);
  const c = circleRect(0, 0, 9, 8.9, -5, 10, 10);
  assert.ok(c);
  assert.equal(c.x, 8.9);
  assert.equal(c.y, 0);
});

test('円と矩形：角は円で判定する（四角い当たり判定より優しい）', () => {
  assert.equal(circleRect(0, 0, 9, 7, 7, 10, 10), null);
  assert.ok(circleRect(0, 0, 9, 6, 6, 10, 10));
});

test('円と円', () => {
  assert.ok(circleCircle(0, 0, 9, 16.9, 0, 8));
  assert.ok(!circleCircle(0, 0, 9, 17.1, 0, 8));
});

test('ポール：すき間の中なら当たらず、上下どちらのポールにも当たる', () => {
  const pole = { x: 100, w: 52, top: 150, bottom: 266 };
  assert.equal(hitPole(126, 208, 9, pole), null);
  assert.ok(hitPole(126, 150 + 8, 9, pole));
  assert.ok(hitPole(126, 266 - 8, 9, pole));
  assert.ok(hitPole(92, 100, 9, pole), '上のポールの正面');
  assert.equal(hitPole(90, 100, 9, pole), null, '手前');
});

test('上のポールは天井の上まで続いていて、上から回り込めない', () => {
  const pole = { x: 100, w: 52, top: 5, bottom: 121 };
  assert.ok(hitPole(126, -30, 9, pole));
});

test('地面は線、天井は止まるだけ', () => {
  assert.ok(hitGround(411, 9));
  assert.ok(!hitGround(410.9, 9));
  const b = { y: 4, vy: -300 };
  assert.equal(clampCeiling(b, 9), true);
  assert.equal(b.y, 9);
  assert.equal(b.vy, 0);
  const d = { y: 4, vy: 200 };
  clampCeiling(d, 9);
  assert.equal(d.vy, 200, '落ちている途中の速さは消さない');
});
