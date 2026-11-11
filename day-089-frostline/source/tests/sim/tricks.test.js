import { it, expect } from 'vitest';
import { createRide } from '../../src/sim/index.js';
import { createEventPool, emit, validState } from '../../src/sim/state.js';
import { plane } from './terrains.js';
import { advance, hash } from './helpers.js';
import { DEG, flight, popFlight } from './trick-helpers.js';

it('1: neutral natural hops ignore held steer/tuck/brake; all trick rotations wait 0.12s', () => {
  for (const c of [{ steer: 1 }, { tuck: 1 }, { brake: 1 }]) {
    const r = flight(); advance(r, 0.5, c); expect(r.state.air.spin).toBeCloseTo(0, 10); expect(r.state.air.flip).toBe(0);
  }
  const r = flight(); r.step({ jump: true, steer: 1, tuck: 1 }, 0.12);
  expect(r.state.air.spin).toBeCloseTo(0, 10); expect(r.state.air.flip).toBeCloseTo(0, 10);
  advance(r, 0.1, { jump: true, steer: 1, tuck: 1 }, 240); expect(r.state.air.spin).toBeGreaterThan(0); expect(r.state.air.flip).toBeGreaterThan(0);
});
it('2: spin reaches 300/430° per second within 0.15s; prepared spin is capped at takeoff', () => {
  for (const [jump, target] of [[false, 300], [true, 430]]) {
    const r = flight({ pop: true, seed: 1, time: 0.12 }); advance(r, 0.15, { steer: 1, jump });
    expect(r.state.yawRate / DEG).toBeGreaterThanOrEqual(target * 0.9);
    advance(r, 0.3, { steer: 1, jump }); expect(r.state.yawRate / DEG).toBeCloseTo(target, 0);
  }
  const r = flight({ pop: true, seed: 6, time: 0.12 }); advance(r, 0.1, { steer: -1 });
  expect(Math.abs(r.state.yawRate)).toBeLessThan(6 * 0.4); // changing side cancels the prepared-spin permission
});
it('2: release damps spin by 90% within 0.25s and assists only inside 45° at <=240°/s', () => {
  const r = flight({ time: 0.12, heading: 90 * DEG }); advance(r, 0.4, { jump: true, steer: 1 });
  const before = Math.abs(r.state.yawRate); advance(r, 0.25); expect(Math.abs(r.state.yawRate)).toBeLessThanOrEqual(before * 0.1);
  const aligned = flight({ time: 0.2, heading: 160 * DEG }); aligned.step({}, 1 / 240);
  expect(Math.abs(aligned.state.yawRate) / DEG).toBeLessThanOrEqual(240 + 1e-6);
  advance(aligned, 0.3); expect(Math.abs(aligned.state.heading) / DEG).toBeCloseTo(180, 4);
});
it('3: flip forward/backward reaches 400°/s, damps, and coexists with spin', () => {
  for (const [controls, sign] of [[{ tuck: 1 }, 1], [{ brake: 1 }, -1]]) {
    const r = flight({ time: 0.12 }); advance(r, 0.15, { ...controls, jump: true, steer: 1 });
    const prev = r.state.air.flip; r.step({ ...controls, jump: true, steer: 1 }, 1 / 240);
    expect((r.state.air.flip - prev) * 240 / DEG * sign).toBeGreaterThanOrEqual(360);
    expect(r.state.air.spin).toBeGreaterThan(0); expect(r.state.fwd.y * sign).toBeLessThan(0);
    const snap = r.snapshot(); snap.state.air.flip = 100 * DEG; snap.memory.flipRate = sign * 400 * DEG; snap.memory.airBasis = false; r.restore(snap);
    advance(r, 0.25); expect(Math.abs(r.snapshot().memory.flipRate) / DEG).toBeLessThanOrEqual(40);
  }
});
it('3: flip rotates about COM without changing ballistic motion; basis stays orthonormal', () => {
  const a = flight(), b = flight();
  for (let i = 0; i < 120; i++) {
    a.step({ jump: true }, 1 / 120); b.step({ jump: true, tuck: 1, steer: 1 }, 1 / 120);
    expect(b.state.com).toEqual(a.state.com); expect(b.state.vel).toEqual(a.state.vel);
    const s = b.state; expect(Math.hypot(s.right.x, s.right.y, s.right.z)).toBeCloseTo(1, 10);
    expect(s.up.x * s.fwd.x + s.up.y * s.fwd.y + s.up.z * s.fwd.z).toBeCloseTo(0, 10);
    expect(Math.hypot(s.pos.x - s.com.x, s.pos.y - s.com.y, s.pos.z - s.com.z)).toBeCloseTo(s.leg, 10);
  }
});
it('4: grab confirms at 0.3s and latches the entry steer; releasing extends the legs', () => {
  for (const [steer, kind] of [[0, 1], [-1, 2], [1, 3]]) {
    const r = flight(); advance(r, 0.05, { jump: true, steer }, 240);
    // 手を伸ばす先（reach）は、押した瞬間から出る。成立（grab）は 0.3 秒つづけてから
    expect(r.state.air.reach).toBe(kind); expect(r.state.air.reachTime).toBeCloseTo(0.05, 9); expect(r.state.air.grab).toBe(0);
    advance(r, 0.24, { jump: true, steer }, 240); expect(r.state.air.grab).toBe(0);
    advance(r, 0.01, { jump: true, steer: -steer }, 240); expect(r.state.air.grab).toBe(kind); expect(r.state.air.reach).toBe(kind);
    expect(r.state.air.grabTime).toBeCloseTo(0.3, 9); const crouch = r.state.crouch;
    advance(r, 0.2); expect(r.state.crouch).toBeLessThan(crouch / 4);
    // 離すと、手は戻る（reach は 0）。成立したつかみは、着地まで残る（点の計算に使う）
    expect(r.state.air.reach).toBe(0); expect(r.state.air.reachTime).toBe(0); expect(r.state.air.grab).toBe(kind);
  }
});
it('5: charged/short 15° pops meet airtime targets and charged landings are clean', () => {
  const short = popFlight(0.12), full = popFlight(0.8);
  expect(short.air).toBeGreaterThanOrEqual(0.4); expect(short.air).toBeLessThanOrEqual(0.55);
  expect(full.air).toBeGreaterThanOrEqual(0.75); expect(full.air).toBeLessThanOrEqual(0.95); expect(full.quality).toBe('clean');
});
function landingAt(degrees, height = 0.001) {
  const r = flight({ flip: degrees * DEG, time: 0.2, height, speed: 10 });
  const snap = r.snapshot(); snap.state.vel.y = -2;
  // Set a consistent body/board separation, placing the lower collider just above contact.
  snap.state.com.y = Math.max(0.45, 0.8 * Math.cos(degrees * DEG)) + height; r.restore(snap);
  r.step({}, 1 / 240); return r;
}
it('5: flip landing <=20 clean, 20..50 sketchy, >50 or body-first inverted crash; board returns above snow', () => {
  for (const [angle, quality, reason] of [[10, 'clean', ''], [35, 'sketchy', ''], [60, '', 'landing-inverted'], [180, '', 'landing-inverted']]) {
    const r = landingAt(angle); const e = r.events.find(e => e.type === 'land');
    expect(e).toBeDefined(); if (quality) expect(e.quality).toBe(quality);
    expect(r.events.find(e => e.type === 'crash')?.reason ?? '').toBe(reason); expect(r.state.pos.y).toBeGreaterThanOrEqual(0);
  }
});
it('5: air-held jump cannot trigger a pop on ground release, but a fresh press can', () => {
  const r = flight({ height: 0.03, time: 0.2 }); r.step({ jump: true }, 0.2); expect(r.state.mode).not.toBe('air');
  advance(r, 0.3, { jump: true }); advance(r, 0.4); expect(r.state.mode).not.toBe('air');
  advance(r, 0.8, { jump: true }); advance(r, 0.2); expect(r.state.mode).toBe('air');
});
it('6: legacy snapshots default added fields and clear stale memory; pooled event payloads reset', () => {
  const r = flight(), legacy = r.snapshot(); delete legacy.state.air.flip; delete legacy.state.air.grab; delete legacy.state.air.grabTime;
  delete legacy.memory.flipRate; advance(r, 0.4, { jump: true, tuck: 1 }); r.restore(legacy);
  expect(r.state.air.flip).toBe(0); expect(r.state.air.grab).toBe(0); expect(r.state.air.grabTime).toBe(0); expect(r.snapshot().memory.flipRate).toBe(0);
  const ctx = { events: [], pool: createEventPool(1) }, e = emit(ctx, 'land');
  for (const key of ['spin', 'flip', 'grab', 'grabTime', 'air', 'drop']) { expect(e[key]).toBe(0); e[key] = 7; }
  e.switchIn = e.switchOut = true; ctx.events.length = 0; const next = emit(ctx, 'takeoff');
  expect(next).toBe(e); expect(next.flip).toBe(0); expect(next.switchIn).toBe(false); expect(next.switchOut).toBe(false);
});
it('6: land event records signed totals, airtime, drop, pop and switch direction', () => {
  const e = popFlight(0.8); for (const key of ['spin', 'flip', 'grab', 'grabTime', 'air', 'drop']) expect(Number.isFinite(e[key])).toBe(true);
  expect(e.pop).toBe(true); expect(e.switchIn).toBe(false); expect(e.switchOut).toBe(false); expect(e.drop).toBeGreaterThan(0);
});
it('8: trick continuation is exact after restore, and 60/120Hz rotation totals differ <3%', () => {
  const run = hz => { const r = flight(); advance(r, 0.75, { jump: true, steer: 1, brake: 1 }, hz); return r; };
  const a = run(60), b = run(120);
  for (const key of ['spin', 'flip']) expect(Math.abs(a.state.air[key] / b.state.air[key] - 1)).toBeLessThanOrEqual(0.03);
  const snap = a.snapshot(); advance(a, 0.3); const expected = hash(a.snapshot()); a.restore(snap); advance(a, 0.3); expect(hash(a.snapshot())).toBe(expected);
  for (let angle = -180; angle <= 180; angle += 15) { const r = landingAt(angle); expect(validState(r.state)).toBe(true); expect(r.state.pos.y).toBeGreaterThanOrEqual(0); }
});

it('2.4: spin assist chooses the nearer reverse axis and preserves switch on landing', () => {
  const r = flight({ time: 0.2, height: 0.6, heading: 160 * DEG });
  let e;
  for (let i = 0; i < 240; i++) { r.step({}, 1 / 240); e = r.events.find(event => event.type === 'land'); if (e) break; }
  expect(e?.switchOut).toBe(true); expect(e?.quality).toBe('clean'); expect(r.state.switch).toBe(true); expect(r.state.fwd.z).toBeGreaterThan(0);
});
it('3.2: flip assist respects the 45° window and the 240°/s speed cap in both directions', () => {
  for (const sign of [-1, 1]) {
    const r = flight({ flip: sign * 40 * DEG, time: 0.2 }); const before = r.state.air.flip;
    r.step({}, 1 / 240); expect(Math.abs(r.state.air.flip - before) * 240 / DEG).toBeLessThanOrEqual(240 + 1e-6);
    advance(r, 0.2); expect(r.state.air.flip).toBeCloseTo(0, 9);
    const outside = flight({ flip: sign * 70 * DEG, time: 0.2 }); advance(outside, 0.25); expect(outside.state.air.flip / DEG).toBeCloseTo(sign * 70, 9);
  }
});
it('5.2: upside-down body lands before the board, on flat and tilted surfaces', () => {
  for (const slope of [0, 30 * DEG]) {
    const r = createRide(plane(slope)), snap = r.snapshot(), s = snap.state;
    s.mode = 'air'; s.air.flip = Math.PI; s.air.time = 0.2; s.leg = 0.8;
    s.up.y = -Math.cos(slope); s.up.z = Math.sin(slope); s.fwd.y = Math.sin(slope); s.fwd.z = Math.cos(slope);
    s.com.y = 1.2; s.pos.y = 1.2 - s.up.y * s.leg; s.pos.z = -s.up.z * s.leg;
    snap.memory.airBasis = false; snap.memory.takeoffSent = true; r.restore(snap);
    let hit;
    for (let i = 0; i < 240; i++) { r.step({}, 1 / 240); hit = r.events.find(e => e.type === 'crash'); if (hit) break; }
    expect(hit?.reason).toBe('landing-inverted'); expect(r.state.pos.y).toBeGreaterThanOrEqual(plane(slope).heightAt(r.state.pos.x, r.state.pos.z));
    const clearance = (r.state.com.y - plane(slope).heightAt(r.state.com.x, r.state.com.z)) * Math.cos(slope);
    expect(clearance).toBeGreaterThan(0.44); // normal clearance, independent of the world's altitude
  }
});
it('1.3: an unprepared pop also follows travel outside the trick-assist window', () => {
  const r = flight({ pop: true, heading: 80 * DEG, time: 0.2 }); advance(r, 0.5);
  expect(Math.abs(r.state.heading) / DEG).toBeLessThan(1);
});
it('2.1/3.1: input from the first airborne tick reaches 90% by 0.15s despite the angle gate', () => {
  const r = flight(); r.step({ jump: true, steer: 1, tuck: 1 }, 0.15);
  expect(r.state.yawRate / DEG).toBeGreaterThanOrEqual(430 * 0.9);
  expect(r.snapshot().memory.flipRate / DEG).toBeGreaterThanOrEqual(400 * 0.9);
});
