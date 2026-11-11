import { it, expect } from 'vitest';
import { createRide } from '../../src/sim/index.js';
import { PARAMS } from '../../src/sim/params.js';
import { plane, circular, parabola } from './terrains.js';
it('state references and nested copy destinations are stable', () => {
  const r = createRide(plane()), s = r.state, pos = s.pos, snow = s.snow, dst = r.createState(), dp = dst.pos;
  r.step({}, 1 / 120); r.copyState(s, dst);
  expect(r.state).toBe(s); expect(s.pos).toBe(pos); expect(s.snow).toBe(snow); expect(dst.pos).toBe(dp);
  expect(JSON.stringify(s)).toBe(JSON.stringify(dst));
});
it('R2 #14 hill/valley loads and leg length have the correct signs', () => {
  for (const [k, force] of [[-0.05, 384.8], [0.05, 1184.8]]) {
    const r = createRide(circular(k)); r.reset({ x: 0, z: 0, heading: Math.PI / 2, speed: 10 });
    r.step({}, 1 / 240);
    expect(r.state.load * 80 * 9.81).toBeCloseTo(force, 5);
    expect(Math.sign(r.state.leg - 0.9)).toBe(-Math.sign(k));
  }
});
it('R2 #15 convex support vanishes at sqrt(g R) with fully extended legs', () => {
  for (const speed of [14.008, 15]) {
    // I7: the rigid-path threshold applies when no leg extension remains.
    const r = createRide(circular(-0.05), { params: { legMax: 0.9 } }); r.reset({ x: 0, z: 0, heading: Math.PI / 2, speed }); r.step({}, 1 / 240);
    expect(r.state.mode).toBe('air'); expect(r.state.load).toBe(0);
  }
});
it('cross-slope load uses surface normal curvature', () => {
  const b = 0.8, k = 0.05, r = createRide(parabola(k, b));
  r.reset({ x: 0, z: 0, heading: Math.PI / 2, speed: 10 }); r.step({}, 1 / 240);
  expect(r.state.load * 80 * 9.81).toBeCloseTo(80 * (9.81 + 100 * k) / Math.sqrt(1 + b * b), 5);
});
it('R2 #18 static compression and damping ratio', () => {
  expect(80 * 9.81 / PARAMS.spring).toBeCloseTo(0.05232, 10);
  expect(PARAMS.dampingCompress / (2 * Math.sqrt(PARAMS.spring * 80))).toBeCloseTo(0.821584, 5);
  const r = createRide(plane()); for (let i = 0; i < 240; i++) r.step({}, 1 / 120);
  expect(r.state.leg).toBeCloseTo(0.9, 12); expect(r.state.load).toBeCloseTo(1, 12);
});
it('a crouch can unload the unilateral spring but cannot pull downward faster than gravity', () => {
  const r = createRide(plane()); let rate = 0;
  for (let i = 0; i < 120; i++) {
    r.step({ jump: true }, 1 / 240); const next = r.snapshot().memory.legRate;
    if (r.state.leg > PARAMS.legMin) expect((next - rate) * 240).toBeGreaterThanOrEqual(-9.81 - 1e-9);
    expect(r.state.load).toBeGreaterThanOrEqual(0); rate = next;
  }
});
