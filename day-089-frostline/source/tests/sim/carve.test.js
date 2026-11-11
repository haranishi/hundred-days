import { it, expect } from 'vitest';
import { createRide } from '../../src/sim/index.js';
import { plane, circular } from './terrains.js';
import { edgeGrip, createParams } from '../../src/sim/params.js';
function advance(r, seconds, controls = {}) { for (let i = 0; i < Math.round(seconds * 240); i++) r.step(controls, 1 / 240); }
function frictionless(snow) { return { cdA: 0, cdATuck: 0, carveFriction: 0, snow: { [snow]: { mu: 0 } } }; }
it('R2 #7, #8 ideal radius and flat-arc force/lean', () => {
  expect(8 * Math.cos(Math.PI / 4)).toBeCloseTo(5.656854, 6);
  // I8: keep the 800N reference while including the new gameplay yaw limit in input calibration.
  const p = createParams(), max = Math.min(100 / (p.sidecut * Math.cos(p.edgeMax)), 10 * p.turnYawMax, p.lateralReserve * p.snow.packed.lambda * edgeGrip(p.edgeMax, p) * p.gravity);
  const r = createRide(plane(), { params: frictionless('packed') }); r.reset({ x: 0, z: 0, heading: 0, speed: 10 });
  advance(r, 3, { steer: 10 / max });
  expect(r.state.tele.edgeForce).toBeCloseTo(800, 3);
  expect(r.state.edge * 180 / Math.PI).toBeCloseTo(45.5494, 3);
  expect(r.state.speed).toBeCloseTo(10, 10);
});
it('ice enlarges the arc at least threefold', () => {
  const radii = [];
  for (const snow of ['packed', 'ice']) {
    const r = createRide(plane(0, 0, { snow: { packed: snow === 'packed' ? 1 : 0, ice: snow === 'ice' ? 1 : 0 } }), { params: frictionless(snow) });
    r.reset({ x: 0, z: 0, heading: 0, speed: 20 }); advance(r, 1, { steer: 1 });
    radii.push(r.state.speed / Math.abs(r.state.yawRate));
  }
  expect(radii[1] / radii[0]).toBeGreaterThanOrEqual(3);
});
it('edge reversal takes 0.3–0.5 seconds to reach the opposite half-command', () => {
  const r = createRide(plane(), { params: frictionless('packed') }); r.reset({ x: 0, z: 0, heading: 0, speed: 20 });
  advance(r, 3, { steer: 1 }); const initial = r.state.tele.edgeForce;
  let t = 0; while (r.state.tele.edgeForce > -initial / 2 && t < 1) { r.step({ steer: -1 }, 1 / 240); t += 1 / 240; }
  expect(t).toBeGreaterThanOrEqual(0.3); expect(t).toBeLessThanOrEqual(0.5);
});
it('no steer lets a moving traverse fall downhill', () => {
  const r = createRide(plane(Math.PI / 6)); r.reset({ x: 0, z: 0, heading: Math.PI / 2, speed: 15 }); advance(r, 2);
  expect(r.state.heading).toBeLessThan(Math.PI / 2 - 20 * Math.PI / 180); expect(r.state.vel.z).toBeLessThan(0); expect(Math.abs(r.state.edge)).toBeLessThan(15 * Math.PI / 180);
});
it('unloading produces a carveBreak event before detachment', () => {
  const terrain = plane(); let k = 0;
  terrain.curvatureAlong = () => k;
  const r = createRide(terrain, { params: frictionless('packed') }); r.reset({ x: 0, z: 0, heading: 0, speed: 12 }); advance(r, 2, { steer: 1 });
  k = -0.05; let broken = false;
  for (let i = 0; i < 200; i++) { r.step({ steer: 1 }, 1 / 240); if (r.events.some(e => e.type === 'carveBreak')) broken = true; }
  expect(broken).toBe(true);
});
