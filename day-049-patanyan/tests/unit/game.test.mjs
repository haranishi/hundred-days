import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, queueFlap, stepOnce, advanceTo, gameTime, drainEvents, CRASH, snapshot, CEIL_PAD } from '../../lib/game.js';
import { autopilotWants } from '../../lib/autopilot.js';
import { PHYS, WORLD } from '../../lib/physics.js';
import { SIT_BOTTOM } from '../../lib/cat.js';

function steps(g, n, pilot = false) {
  const events = [];
  for (let i = 0; i < n; i += 1) {
    if (pilot && autopilotWants(g)) queueFlap(g, gameTime(g));
    stepOnce(g);
    events.push(...drainEvents(g));
  }
  return events;
}

test('1本くぐるごとに1点。点数はくぐったポールの数と一致する', () => {
  const g = createGame({ seed: 20260924, idleBob: 0 });
  const events = [];
  while (g.score < 12) {
    events.push(...steps(g, 1, true));
    assert.ok(g.phase === 'flying' || g.phase === 'ready');
  }
  const passes = events.filter((e) => e.type === 'pass');
  assert.equal(passes.length, 12);
  passes.forEach((e, i) => assert.equal(e.score, i + 1));
  const wx = WORLD.catX + g.dist;
  const behind = g.course.poles.filter((p) => p.x + p.w < wx).length;
  assert.equal(g.score, behind);
});

test('魚は点数とは別に数える（魚を取っても点数は増えない）', () => {
  const g = createGame({ seed: 5, idleBob: 0 });
  g.course.ensureCount(40);
  for (const p of g.course.poles) p.fish = { x: p.x + p.w / 2, y: p.center + p.gap * 0.18, taken: false };
  const events = [];
  while (g.score < 20) events.push(...steps(g, 1, true));
  const fishEvents = events.filter((e) => e.type === 'fish').length;
  assert.ok(fishEvents > 0, '1匹も取れていない');
  assert.equal(g.fish, fishEvents);
  assert.equal(g.score, events.filter((e) => e.type === 'pass').length);
  assert.equal(g.course.poles.filter((p) => p.fish.taken).length, g.fish);
});

test('天井にぶつかっても終わらず、そこで止まる', () => {
  const g = createGame({ seed: 9, idleBob: 0 });
  for (let i = 0; i < 90; i += 1) {
    queueFlap(g, gameTime(g));
    stepOnce(g);
    if (g.cat.x + g.dist > 200) break;
  }
  assert.equal(g.phase, 'flying');
  assert.equal(g.cat.y, CEIL_PAD);
});

test('地面に落ちると0.25秒止まり、ずっこけて座り込む（1.2秒以内）', () => {
  const g = createGame({ seed: 9, idleBob: 0 });
  queueFlap(g, 0);
  let events = [];
  while (g.phase !== 'crashing') events.push(...steps(g, 1));
  assert.equal(g.hit.kind, 'ground');
  const y0 = g.cat.y;
  steps(g, Math.floor(CRASH.freeze * 120) - 1);
  assert.equal(g.cat.y, y0, '止まっている間に動いた');
  events = [];
  const t0 = g.crashT;
  while (g.phase === 'crashing') events.push(...steps(g, 1));
  assert.equal(g.phase, 'landed');
  assert.ok(g.landedT - t0 < CRASH.resultMax, `座るまで ${g.landedT - t0}s`);
  assert.ok(events.some((e) => e.type === 'land'));
  assert.ok(Math.abs(g.cat.y + CRASH.sitOffset - WORLD.bandH) < 1e-9, '地面に座っていない');
});

test('ポールに当たると当たった所が記録され、その後ポールをすり抜けずに着地する', () => {
  const g = createGame({ seed: 11, idleBob: 0 });
  queueFlap(g, 0);
  stepOnce(g);
  // 羽ばたき続けて上のポールに当てる
  while (g.phase === 'flying') {
    if (g.cat.vy >= 0) queueFlap(g, gameTime(g));
    stepOnce(g);
  }
  assert.equal(g.hit.kind, 'pole');
  const p = g.course.poles.find((q) => q.n === g.hit.pole);
  assert.ok(g.hit.x >= p.x - 1e-9 && g.hit.x <= p.x + p.w + 1e-9);
  advanceTo(g, gameTime(g) + 3);
  assert.equal(g.phase, 'landed');
  const bottom = g.cat.y + CRASH.sitOffset;
  assert.ok(bottom <= WORLD.bandH + 1e-9);
});

test('座った時の最下点は猫の絵と一致する', () => {
  assert.equal(CRASH.sitOffset, SIT_BOTTOM);
});

test('状態の読み出しは画面座標のポール一覧を返す', () => {
  const g = createGame({ seed: 2, idleBob: 0 });
  const s = snapshot(g);
  assert.equal(s.phase, 'ready');
  assert.ok(s.poles.length >= 1);
  assert.equal(s.cat.r, PHYS.catR);
});
