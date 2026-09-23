// v3 P0-1: finger strokes drive the run through the existing input reducer (PLAN-v3.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInput, enqueueInput, consumeInput, normalizeDistance } from '../lib/input.js';
import { MAX_SPEED } from '../lib/physics.js';
import { createRun, tick } from '../lib/game.js';

const DT = 1 / 60, HEIGHT = 440;
// One move event per frame: `px` normalized px over `move` s, then `rest` s still, direction alternating.
// The finger stays down, so only the first sample starts a stroke (as app3d.js does for touch).
function strokes({ px = 180, move = .6, rest = .1, until = 90, split = 1 } = {}) {
  const frames = Math.round(move * 60), events = [{ time: 0, stroke: true }];
  for (let cycle = 0; cycle * (move + rest) < until; cycle++) {
    const t0 = cycle * (move + rest), dy = (cycle % 2 ? -1 : 1) * px / frames / split;
    for (let k = 1; k <= frames; k++) for (let j = 0; j < split; j++)
      events.push({ time: t0 + k / 60, distance: normalizeDistance(dy, HEIGHT), deadzone: normalizeDistance(4, HEIGHT) });
  }
  return events;
}
// Each 1/60 s frame receives the samples stamped before its end, then consumes input and ticks the run.
function play(events, { seconds = 90, onSegment } = {}) {
  let input = createInput(), run = createRun(), next = 0, frame = 0;
  const frames = [];
  while (run.phase === 'playing' && frame < seconds * 60) {
    const end = (frame + 1) / 60;
    while (next < events.length && events[next].time <= end + 1e-9) input = enqueueInput(input, events[next++]);
    let clock = input.time;
    input = consumeInput(input, DT, (u, h) => { onSegment?.({ start: clock, u, h }); clock += h; run = tick(run, u, h); });
    frame++;
    frames.push({ time: input.time, u: input.u, speed: run.speed });
  }
  return { run, input, frames };
}

test('180pxを0.6秒で送り0.1秒止める上下交互の操作で、75秒以内に完走する', () => {
  const { run } = play(strokes());
  assert.equal(run.phase, 'result', `90秒で完走しない（速度 ${run.speed}km/h・通過 ${run.passed}）`);
  assert.ok(run.elapsed <= 75, `完走 ${run.elapsed.toFixed(2)}秒（75秒以内）`);
  assert.equal(run.passed, 20);
  assert.equal(run.speed, MAX_SPEED);
});

test('指を止めると450ms以内に推力uが0になり、その後は減速する', () => {
  // End of a stroke (fullest reservoir), mid-stroke, and during the 0.1 s rest.
  for (const stopAt of [7 * .7 + .6, 10 * .7 + .3, 12 * .7 + .65]) {
    const segments = [], events = strokes({ until: stopAt + 1 }).filter(e => e.time <= stopAt + 1e-9);
    const { frames } = play(events, { seconds: stopAt + 2, onSegment: s => segments.push(s) });
    assert.ok(segments.some(s => s.start >= stopAt - .1 && s.start < stopAt && s.u > 0), `${stopAt.toFixed(2)}秒の直前に推力がない（検査が空振り）`);
    const late = segments.filter(s => s.start >= stopAt + .45 - 1e-9);
    const leak = late.find(s => s.u !== 0);
    assert.ok(late.length > 0 && !leak, `${stopAt.toFixed(2)}秒で止めて450ms後も推力が残る：${JSON.stringify(leak)}`);
    const at = frames.find(f => f.time >= stopAt + .45 - 1e-9);
    assert.equal(at.u, 0, `${stopAt.toFixed(2)}秒で止めて450ms後の u`);
    assert.ok(frames.at(-1).speed < at.speed, '推力が0になった後は減速する');
  }
});

test('同じ距離を同じ時刻に細かく分けて送っても、速度と完走時刻が変わらない', () => {
  const at20 = split => play(strokes({ until: 21, split }), { seconds: 20 }).run.speed;
  const a = at20(1), b = at20(5);
  assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, a), `20秒後 ${a} ≠ ${b}`);
  const whole = play(strokes()).run, split = play(strokes({ split: 5 })).run;
  assert.equal(whole.phase, split.phase);
  assert.ok(Math.abs(whole.elapsed - split.elapsed) < 1e-6, `完走 ${whole.elapsed} ≠ ${split.elapsed}`);
});

test('指の移動量が多いほど速くなり、移動ゼロでは加速しない（入力量依存）', () => {
  const speedAt15 = px => play(strokes({ px, until: 16 }), { seconds: 15 }).run.speed;
  const [s0, s40, s120, s180] = [0, 40, 120, 180].map(speedAt15);
  assert.equal(s0, 0, '移動ゼロで加速した');
  assert.ok(s40 <= s120 && s120 <= s180, `40px ${s40} / 120px ${s120} / 180px ${s180}`);
  assert.ok(s180 > s40, `180px ${s180} が 40px ${s40} より速くない`);
});
