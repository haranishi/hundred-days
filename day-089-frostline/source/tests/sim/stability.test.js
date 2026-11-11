import { it, expect } from 'vitest';
import { createRide } from '../../src/sim/index.js';
import { validState } from '../../src/sim/state.js';
import { plane, wave } from './terrains.js';
import { terminal, constantBrake, dropImpact, endurance } from './measurements.js';
import { seeded, hash } from './helpers.js';
for (const degrees of [0, 20, 30]) it(`R2 #10/11 constant μb=.8 stopping distance on ${degrees}°`, () => {
  const result = constantBrake(degrees);
  expect(result.actual / result.target).toBeCloseTo(1, 2); expect(result.time / result.targetTime).toBeCloseTo(1, 2);
});
it('terminal speed spread across 60/120/240Hz stays below 1%', () => {
  const values = [60, 120, 240].map(hz => terminal(30, 0.6, hz).actual);
  expect(Math.max(...values) / Math.min(...values) - 1).toBeLessThan(0.01);
});
it('actual drops from 1.2m have less than 5% impact spread at all three rates', () => {
  const values = [60, 120, 240].map(hz => dropImpact(hz).impact);
  expect(Math.min(...values)).toBeGreaterThan(0);
  expect(Math.max(...values) / Math.min(...values) - 1).toBeLessThan(0.05);
  for (const v of values) expect(v).toBeCloseTo(1.2, 2);
});
it('identical input sequences produce identical state and event hashes at every tick', () => {
  const a = createRide(wave()), b = createRide(wave()), rng = seeded(123456), c = { steer: 0, tuck: 0, brake: 0, jump: false };
  for (let i = 0; i < 2400; i++) {
    if (i % 12 === 0) { c.steer = rng() * 2 - 1; c.tuck = rng(); c.brake = rng() > 0.7 ? rng() : 0; c.jump = rng() > 0.85; }
    a.step(c, 1 / 120); b.step(c, 1 / 120);
    expect(hash(a.state)).toBe(hash(b.state)); expect(hash(a.events)).toBe(hash(b.events));
  }
});
it('five minutes of seeded random input on waves remain finite without numeric recovery', () => {
  const result = endurance(); expect(result.numeric).toBe(false); expect(validState(result.ride.state)).toBe(true);
  expect(result.airborneSteps).toBeGreaterThan(0); expect(result.skidSteps).toBeGreaterThan(0);
});
it('low-speed transitions and snow-normal transport have no position or velocity impulse', () => {
  const r = createRide(plane(0.2)); r.reset({ x: 0, z: 0, heading: Math.PI, speed: 3.1 });
  for (let i = 0; i < 2000; i++) {
    const x = r.state.pos.x, y = r.state.pos.y, z = r.state.pos.z, vx = r.state.vel.x, vy = r.state.vel.y, vz = r.state.vel.z;
    r.step({}, 1 / 240);
    expect(Math.hypot(r.state.vel.x - vx, r.state.vel.y - vy, r.state.vel.z - vz)).toBeLessThan(0.1);
    expect(Math.hypot(r.state.pos.x - x, r.state.pos.y - y, r.state.pos.z - z)).toBeLessThan(0.06);
  }
});
