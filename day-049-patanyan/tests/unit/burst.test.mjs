import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mockCtx } from './_mock-ctx.mjs';
import { burstLook, burstCenter, BURST, drawScene } from '../../lib/render.js';
import { createGame, queueFlap, stepOnce, gameTime, CRASH } from '../../lib/game.js';
import { computeLayout } from '../../lib/layout.js';
import { starPath } from '../../lib/draw.js';
import { PHYS, WORLD } from '../../lib/physics.js';

const R = PHYS.catR;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// cat.y が target より下にいる間だけ羽ばたく。墜落した瞬間の猫の中心を返す（0.25秒の停止中は猫が動かない）
function crashAround(seed, target, skyTop = 0) {
  const g = createGame({ seed, idleBob: 0, skyTop });
  queueFlap(g, 0);
  stepOnce(g);
  while (g.phase === 'flying' && g.steps < 120 * 60) {
    if (g.cat.y > target && g.cat.vy >= 0) queueFlap(g, gameTime(g));
    stepOnce(g);
  }
  return { g, cx: WORLD.catX + g.dist, cy: g.cat.y };
}

test('当たった点：ポールは猫の円に一番近い矩形の点、地面は真下の接点。向きは猫の中心から当たった点へ', () => {
  const kinds = new Set();
  const faces = new Set();
  const top = computeLayout(390, 844).skyTop;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    for (const target of [-200, 40, 120, 200, 280, 360, 500]) {
      const { g, cx, cy } = crashAround(seed, target, top);
      const h = g.hit;
      assert.ok(h, `seed=${seed} target=${target} 墜落しない`);
      kinds.add(h.kind);
      assert.ok(Math.abs(Math.hypot(h.nx, h.ny) - 1) < 1e-9, '向きは長さ1');
      if (h.kind === 'ground') {
        assert.deepEqual([h.x, h.y, h.nx, h.ny], [cx, WORLD.bandH, 0, 1]);
        assert.equal(cy, WORLD.bandH - R);
        continue;
      }
      const p = g.course.poles.find((q) => q.n === h.pole);
      // 上のポールの矩形は -10000 から top+10000 の高さで作るので、下の縁は 1e-12 ほど丸めでずれる
      const upper = h.y <= p.top + 1e-6;
      const near = (u, v) => Math.abs(u - v) < 1e-6;
      assert.ok(near(h.x, clamp(cx, p.x, p.x + p.w)), `seed=${seed} target=${target} x`);
      assert.ok(near(h.y, upper ? Math.min(cy, p.top) : Math.max(cy, p.bottom)), `seed=${seed} target=${target} y`);
      const d = Math.hypot(h.x - cx, h.y - cy);
      assert.ok(d > 0 && d < R, `当たった点は猫の円の中（めり込み）: ${d}`);
      assert.ok(Math.abs(h.nx - (h.x - cx) / d) < 1e-9 && Math.abs(h.ny - (h.y - cy) / d) < 1e-9);
      faces.add(near(h.x, p.x) ? 'front' : upper ? 'upper-edge' : 'lower-edge');
    }
  }
  assert.ok(kinds.has('pole') && kinds.has('ground'), [...kinds].join(','));
  assert.ok(faces.has('front') && faces.size >= 2, [...faces].join(','));
});

test('はじけは星の角の先が当たった点に触れ、猫と反対側へ開く', () => {
  for (const hit of [
    { x: 100, y: 50, nx: 1, ny: 0 },
    { x: 100, y: 50, nx: 0, ny: -1 },
    { x: 100, y: 420, nx: 0, ny: 1 },
    { x: 100, y: 50, nx: Math.SQRT1_2, ny: -Math.SQRT1_2 },
  ]) {
    for (const s of [0.45, 1, 1.25]) {
      const c = burstCenter(hit, hit.x, hit.y, s);
      const tipX = c.x - Math.cos(c.ang) * BURST.r * s;
      const tipY = c.y - Math.sin(c.ang) * BURST.r * s;
      assert.ok(Math.abs(tipX - hit.x) < 1e-9 && Math.abs(tipY - hit.y) < 1e-9, `角の先 ${tipX},${tipY}`);
      // 猫の中心は当たった点から -n 側に R 以内。星の真ん中はそれより遠い
      const catX = hit.x - hit.nx * R;
      const catY = hit.y - hit.ny * R;
      assert.ok(Math.hypot(c.x - catX, c.y - catY) > R + BURST.r * s * 0.99);
    }
  }
});

test('ポールの星は拡縮中も接点から顔と反対側へ8px離れ、輪郭線も顔側に戻らない', () => {
  for (const [nx, ny] of [[1, 0], [0, -1], [0, 1], [Math.SQRT1_2, -Math.SQRT1_2]]) {
    const hit = { kind: 'pole', nx, ny };
    for (const age of [0, 0.03, 0.05, 0.1, 0.24, 0.4]) {
      for (const reduced of [false, true]) {
        const { s } = burstLook(age, reduced);
        const c = burstCenter(hit, 100, 50, s);
        const points = [];
        starPath({ moveTo: (...p) => points.push(p), lineTo: (...p) => points.push(p), closePath() {} }, c.x, c.y, BURST.r * s, c.ang - Math.PI / 2, 0.45);
        const distances = points.map(([x, y]) => (x - 100) * nx + (y - 50) * ny);
        assert.ok(Math.abs(Math.min(...distances) - 8) < 1e-9);
        assert.ok(distances.every((d) => d - 1.5 / 2 >= 7.25 - 1e-9));
      }
    }
  }
});

test('はじけは0.25秒の停止中ずっと見え、動きを減らす設定では大きさも濃さも変えない', () => {
  for (let age = 0; age < CRASH.freeze + BURST.fade - 1e-6; age += 0.005) {
    assert.deepEqual(burstLook(age, true), { s: 1, alpha: 1 }, `reduced age=${age}`);
    if (age < CRASH.freeze) assert.equal(burstLook(age, false).alpha, 1, `age=${age}`);
  }
  assert.ok(burstLook(0, false).s < burstLook(0.05, false).s, 'ふつうの設定では、はじけて広がる');
  assert.ok(burstLook(CRASH.freeze + 0.1, false).alpha < 1, '停止のあとは薄れる');
  assert.equal(burstLook(CRASH.freeze + BURST.fade, false), null);
  assert.equal(burstLook(CRASH.freeze + BURST.fade, true), null);
  assert.equal(burstLook(-0.01, false), null);
});

test('墜落の場面：はじけの描画は動きを減らす設定でも例外もNaNも出ない', () => {
  const L = computeLayout(390, 844);
  for (const target of [-200, 200, 500]) {
    const { g } = crashAround(7, target, L.skyTop);
    for (const reduced of [false, true]) {
      for (const dt of [0, 0.03, 0.1, 0.24, 0.4, 0.6]) {
        const ctx = mockCtx();
        drawScene(ctx, L, g, { rt: g.hit.t + dt, a: 1, appTime: 1, reduced, pattern: 'chatora', hud: true });
        assert.equal(ctx.__calls.nonFinite, 0, `target=${target} reduced=${reduced} dt=${dt}`);
      }
    }
  }
});
