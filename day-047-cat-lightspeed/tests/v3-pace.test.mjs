// v3 P0-1: the acceleration curve under maximum thrust (PLAN-v3.md).
// Time is always tick count / 60, so the measured crossing times never drift.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIGHT_SPEED } from '../lib/milestones.js';
import { MAX_SPEED, advanceSpeed } from '../lib/physics.js';
import { WORLDS } from '../lib/worlds.js';
import { createRun, tick } from '../lib/game.js';

const DT = 1 / 60;
const timeline = (() => {
  const speeds = [0];
  let v = 0;
  for (let i = 1; i <= 120 * 60 && v < MAX_SPEED; i++) { v = advanceSpeed(v, 1, DT); speeds.push(v); }
  return speeds;
})();
// First tick whose speed is at least `speed`, in seconds after the start.
const firstAt = speed => { const i = timeline.findIndex(v => v >= speed); return i < 0 ? Infinity : i / 60; };
const seconds = t => Number.isFinite(t) ? `${t.toFixed(3)}秒` : '到達しない';

const windows = [
  ['最初の通過（カタツムリ）', .05, .3, 1.5],
  ['歩く人', 4, 0, 4],
  ['自転車', 20, 0, 6],
  [`${WORLDS[1].name}（${WORLDS[0].name}の出口）`, WORLDS[0].limit, 8, 12],
  [WORLDS[2].name, WORLDS[1].limit, 14, 18],
  [WORLDS[3].name, WORLDS[2].limit, 19, 24],
  [WORLDS[4].name, WORLDS[3].limit, 24, 29],
  [WORLDS[5].name, WORLDS[4].limit, 29, 34],
];
for (const [label, speed, lo, hi] of windows) test(`最大推力で${label} ${speed.toLocaleString('en-US')}km/h に${lo ? `${lo}〜${hi}秒で` : `${hi}秒以内に`}届く`, () => {
  const t = firstAt(speed);
  assert.ok(t >= lo && t <= hi, `${speed}km/h の初通過は ${seconds(t)}（許容 ${lo}〜${hi}秒）`);
});

test('最大推力で光速の99.999%（完走）に45〜60秒で届き、その後はMAX_SPEEDで止まる', () => {
  const t = firstAt(MAX_SPEED);
  assert.ok(t >= 45 && t <= 60, `完走は ${seconds(t)}（許容 45〜60秒）`);
  let v = timeline.at(-1);
  for (let i = 0; i < 600; i++) { v = advanceSpeed(v, 1, DT); assert.equal(v, MAX_SPEED); }
  assert.ok(MAX_SPEED < LIGHT_SPEED);
});

test('最大推力の速度は完走まで毎tick増え、光速には届かない', () => {
  for (let i = 1; i < timeline.length; i++) {
    assert.ok(timeline[i] > timeline[i - 1], `${(i / 60).toFixed(3)}秒で増えていない：${timeline[i - 1]} → ${timeline[i]}`);
    assert.ok(timeline[i] < LIGHT_SPEED);
  }
  assert.equal(timeline.at(-1), MAX_SPEED);
});

test('6つの世界にそれぞれ4秒以上とどまる', () => {
  const entries = [0, ...WORLDS.slice(0, -1).map(w => firstAt(w.limit)), firstAt(MAX_SPEED)];
  WORLDS.forEach((w, i) => {
    const stay = entries[i + 1] - entries[i];
    assert.ok(stay >= 4, `${w.name}の滞在 ${seconds(stay)}（4秒以上）`);
  });
});

test('光速比90%から完走まで8〜15秒かける', () => {
  const span = firstAt(MAX_SPEED) - firstAt(LIGHT_SPEED * .9);
  assert.ok(span >= 8 && span <= 15, `90%→完走 ${seconds(span)}（許容 8〜15秒）`);
});

test('推力0では毎tick減速し、0で止まって負にならない', () => {
  for (const v0 of [1, 100, 1e5, LIGHT_SPEED * .95, MAX_SPEED]) {
    let v = v0, t = 0;
    while (v > 0 && t < 300) {
      const next = advanceSpeed(v, 0, DT);
      assert.ok(next < v && next >= 0, `${v0}km/hから離して ${t.toFixed(2)}秒：${v} → ${next}`);
      v = next; t += DT;
    }
    assert.equal(v, 0, `${v0}km/hから離して300秒以内に止まる`);
  }
});

test('入力なし（推力0）では自動で加速しない', () => {
  for (const dt of [DT, .5, 10]) assert.equal(advanceSpeed(0, 0, dt), 0);
  for (const v of [.01, 50, 5e4, 9e8]) assert.ok(advanceSpeed(v, 0, DT) < v);
  let run = createRun();
  for (let i = 0; i < 600; i++) run = tick(run, 0, DT);
  assert.equal(run.speed, 0); assert.equal(run.passed, 0); assert.equal(run.phase, 'playing');
});

// The pre-existing split test compares 80 s, which the v3 curve passes only at MAX_SPEED.
// Compare before the finish so splitting is really exercised on every segment of the curve.
const splitRuns = (v0, u, total, h) => { let v = v0, left = total; while (left > 1e-12) { const d = Math.min(h, left); v = advanceSpeed(v, u, d); left -= d; } return v; };
test('完走前のどの時刻でも、1/30・1/60・1/120・0.016・0.1秒刻みと一括計算が一致する', () => {
  for (const total of [.5, 3, 7, 13, 21, 27, 33, 40, 44]) {
    const once = advanceSpeed(0, 1, total);
    for (const h of [1 / 30, 1 / 60, 1 / 120, .016, .1]) {
      const split = splitRuns(0, 1, total, h);
      assert.ok(Math.abs(split - once) <= 1e-10 * once, `${total}秒・刻み${h}：${split} ≠ ${once}`);
    }
  }
});
test('部分推力・減速でも時間分割に依存しない', () => {
  for (const u of [0, .3, .5, .7]) for (const v0 of [2, 500, 3e5, LIGHT_SPEED * .95]) for (const total of [.4, 2, 6]) {
    const once = advanceSpeed(v0, u, total);
    for (const h of [1 / 60, 1 / 120, .1]) {
      const split = splitRuns(v0, u, total, h);
      assert.ok(Math.abs(split - once) <= 1e-9 * Math.max(1, once), `u=${u}・${v0}km/h・${total}秒・刻み${h}：${split} ≠ ${once}`);
    }
  }
});
