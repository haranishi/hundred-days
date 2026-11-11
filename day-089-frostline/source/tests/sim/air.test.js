import { it, expect } from 'vitest';
import { createRide } from '../../src/sim/index.js';
import { plane } from './terrains.js';
import { airborne } from './helpers.js';
it('I10: a 0.5s charged pop produces a visible 0.55–0.8m board rise', () => {
  const r = createRide(plane()); for (let i = 0; i < 60; i++) r.step({ jump: true }, 1 / 120);
  let max = 0, tookOff = false;
  for (let i = 0; i < 120; i++) { r.step({}, 1 / 120); max = Math.max(max, r.state.pos.y); if (r.events.some(e => e.type === 'takeoff' && e.pop)) tookOff = true; }
  expect(tookOff).toBe(true); expect(max).toBeGreaterThanOrEqual(0.55); expect(max).toBeLessThanOrEqual(0.8);
});
it('R2 #16 ballistic COM apex and return time without air', () => {
  const r = createRide(plane(), { params: { cdA: 0, cdATuck: 0 } }); airborne(r, { height: 10, vy: 5 });
  const y = r.state.com.y; let max = y;
  for (let i = 0; i < 240; i++) { r.step({}, 1 / 240); max = Math.max(max, r.state.com.y); }
  expect(max - y).toBeCloseTo(25 / 19.62, 4);
  const r2 = createRide(plane(), { params: { cdA: 0, cdATuck: 0 } }); airborne(r2, { height: 10, vy: 5 });
  r2.step({}, 10 / 9.81); expect(r2.state.com.y).toBeCloseTo(y, 9);
});
it('I10: tuck alone does not authorize spin, even with residual takeoff momentum', () => {
  const a = createRide(plane()), b = createRide(plane()); airborne(a, { height: 100, spin: 2 }); airborne(b, { height: 100, spin: 2, crouch: 1 });
  for (let i = 0; i < 120; i++) { a.step({}, 1 / 240); b.step({ tuck: 1 }, 1 / 240); }
  expect(Math.abs(a.state.yawRate)).toBeLessThan(0.1); expect(Math.abs(b.state.yawRate)).toBeLessThan(0.1);
  expect(a.snapshot().memory.spin).toBe(b.snapshot().memory.spin);
});
it('I10: armed spin approaches its target, then damps on release without another pop', () => {
  const r = createRide(plane()); airborne(r, { height: 100, spin: 1 });
  for (let i = 0; i < 60; i++) r.step({ steer: 1, jump: true }, 1 / 120);
  expect(r.state.yawRate * 180 / Math.PI).toBeGreaterThan(410);
  for (let i = 0; i < 60; i++) r.step({ steer: 1 }, 1 / 120);
  expect(Math.abs(r.snapshot().memory.spin) * 180 / Math.PI).toBeLessThan(43); expect(r.state.vel.y).toBeLessThan(-9);
  expect(r.snapshot().memory.popping).toBe(false);
});
it('a short press cannot charge a pop', () => {
  const r = createRide(plane()); for (let i = 0; i < 6; i++) r.step({ jump: true }, 1 / 120);
  for (let i = 0; i < 120; i++) r.step({}, 1 / 120); expect(r.state.mode).toBe('carve');
});
it('ground windup is consumed by exactly one takeoff', () => {
  const r = createRide(plane());
  for (let i = 0; i < 60; i++) r.step({ jump: true, steer: 1 }, 1 / 120);
  let tookOff = false;
  for (let i = 0; i < 60; i++) { r.step({}, 1 / 120); if (r.state.mode === 'air') { tookOff = true; break; } }
  expect(tookOff).toBe(true); expect(r.snapshot().memory.initialSpin).toBeGreaterThan(1); expect(r.snapshot().memory.windup).toBe(0);
});
