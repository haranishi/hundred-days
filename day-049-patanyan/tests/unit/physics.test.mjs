import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHYS, integrate, applyFlap, stepIndexFor } from '../../lib/physics.js';
import { createGame, advanceTo, queueFlap } from '../../lib/game.js';
import { createFrameClock } from '../../lib/loop.js';

const DT = PHYS.dt;
// 人の連打に近い、刻みにもフレームにも揃っていない時刻
const INPUTS = [0.0, 0.5371, 1.0913, 1.6099, 2.1538, 2.7109, 3.2502, 3.8013, 4.3371, 4.8012];

function run(hz, duration = 5.2) {
  const g = createGame({ seed: 7, idleBob: 0 });
  // ポールの無い空で比べる。当たって羽ばたきが無視されると、比べる軌道が短くなってしまう
  g.course = { poles: [], ensureUntil() {}, ensureCount() {} };
  const clock = createFrameClock();
  clock.frame(0);
  let sim = 0;
  let k = 0;
  const byStep = new Map();
  const rendered = [];
  const frames = Math.round(duration * hz);
  for (let i = 1; i <= frames; i += 1) {
    const now = i / hz;
    const raw = [];
    while (k < INPUTS.length && INPUTS[k] < now) raw.push(INPUTS[k++]);
    const { delta, offsets } = clock.frame(now, raw);
    for (const off of offsets) queueFlap(g, sim + off);
    sim += delta;
    advanceTo(g, sim);
    byStep.set(g.steps, g.cat.y);
    const a = 1 - (g.steps * DT - sim) / DT;
    rendered.push([sim, g.cat.prevY + (g.cat.y - g.cat.prevY) * a]);
  }
  const ys = [...byStep.values()];
  return { byStep, rendered, flaps: g.flaps, phase: g.phase, minY: Math.min(...ys), maxY: Math.max(...ys) };
}

test('入力の時刻は描画の間隔に関係なく同じ刻みの境目に割り当てられる', () => {
  assert.equal(stepIndexFor(0), 0);
  assert.equal(stepIndexFor(DT * 3), 3);
  assert.equal(stepIndexFor(DT * 3 + 1e-6), 4);
  assert.equal(stepIndexFor(0.2371), Math.ceil(0.2371 / DT));
});

test('60/120/144Hz で同じ入力列なら軌道の差は1px未満（刻みの上では完全一致）', () => {
  const r60 = run(60);
  const r120 = run(120);
  const r144 = run(144);
  assert.equal(r60.flaps, INPUTS.length);
  assert.equal(r120.flaps, INPUTS.length);
  assert.equal(r144.flaps, INPUTS.length);
  assert.equal(r120.phase, 'flying');
  assert.ok(r120.minY > 20 && r120.maxY < 400, `天井や地面に張り付いて比べていない: ${r120.minY}〜${r120.maxY}`);
  let compared = 0;
  let maxDiff = 0;
  for (const other of [r60, r144]) {
    for (const [step, y] of other.byStep) {
      if (!r120.byStep.has(step)) continue;
      maxDiff = Math.max(maxDiff, Math.abs(y - r120.byStep.get(step)));
      compared += 1;
    }
  }
  assert.ok(compared > 400, `比べた点が少ない: ${compared}`);
  assert.ok(maxDiff < 1e-9, `刻みの上でずれた: ${maxDiff}`);
  // 描画位置（補間後）も、120Hzの刻み列を線形補間した基準と1px未満
  const refAt = (t) => {
    const s = t / DT;
    const i = Math.floor(s + 1e-9);
    const f = Math.max(0, s - i);
    const y0 = r120.byStep.get(i);
    const y1 = r120.byStep.get(i + 1) ?? y0;
    return y0 === undefined ? undefined : y0 + (y1 - y0) * f;
  };
  let renderDiff = 0;
  for (const r of [r60, r144]) {
    for (const [t, y] of r.rendered) {
      const want = refAt(t);
      if (want === undefined) continue;
      renderDiff = Math.max(renderDiff, Math.abs(y - want));
    }
  }
  assert.ok(renderDiff < 1, `描画位置の差が1px以上: ${renderDiff}`);
});

test('1回の経過は0.1秒で打ち切る（タブ復帰で一気に進まない）', () => {
  const clock = createFrameClock();
  clock.frame(10);
  const { delta, offsets } = clock.frame(12.5, [11, 12.4]);
  assert.equal(delta, 0.1);
  assert.deepEqual(offsets, [0.1, 0.1]);
});

test('描画より後の時刻が付いた入力も、そのフレームの中に押し込む', () => {
  const clock = createFrameClock();
  clock.frame(1);
  const { delta, offsets } = clock.frame(1 + 1 / 60, [1 + 1 / 60 + 0.002]);
  assert.ok(Math.abs(offsets[0] - delta) < 1e-12);
});

test('羽ばたきは代入で、連打しても上向きの速さは -420 のまま', () => {
  const b = { y: 100, vy: -300 };
  applyFlap(b);
  applyFlap(b);
  assert.equal(b.vy, PHYS.flapVy);
});

test('落下の速さは600で頭打ち', () => {
  const b = { y: 0, vy: 0 };
  for (let i = 0; i < 240; i += 1) integrate(b);
  assert.equal(b.vy, PHYS.maxFall);
});

test('入力のあった描画で、もう上向きの速さになっている', () => {
  const g = createGame({ seed: 3, idleBob: 0 });
  advanceTo(g, 0.5);
  queueFlap(g, 0.5);
  advanceTo(g, 0.5 + 1 / 60);
  assert.equal(g.phase, 'flying');
  assert.ok(g.cat.vy < 0);
});
