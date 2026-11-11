import { it, expect } from 'vitest';
import { createRide } from '../../src/sim/index.js';
import { createParams } from '../../src/sim/params.js';
import { landingReason } from '../../src/sim/landing.js';
import { plane, kicker } from './terrains.js';
function fall({ efh = 0.3, heading = 0, speed = 10, crouch = 0, hz = 120 } = {}) {
  const r = createRide(plane(), { params: { cdA: 0, cdATuck: 0 } });
  const snap = r.snapshot(), s = snap.state;
  s.mode = 'air'; s.pos.y = 0.001; s.leg = 0.8; s.com.y = s.pos.y + s.leg; s.vel.y = -Math.sqrt(2 * 9.81 * efh); s.vel.z = -speed;
  s.fwd.x = Math.sin(heading); s.fwd.z = -Math.cos(heading); s.heading = heading; s.crouch = crouch; s.air.time = 0.2;
  snap.memory.takeoffSent = true; r.restore(snap); r.step({ tuck: crouch }, 1 / hz); return r;
}
it('R2 #12 normal speed 3m/s gives EFH .459m, with payload', () => {
  const r = fall({ efh: 9 / 19.62 }); const e = r.events.find(e => e.type === 'land');
  expect(e.efh).toBeCloseTo(9 / 19.62, 2); expect(e.yawDeg).toBeCloseTo(0, 10); expect(e.quality).toBe('clean');
});
it('all four outcomes: clean, heavy, sketchy, crash', () => {
  expect(fall({ efh: 0.3 }).events.find(e => e.type === 'land').quality).toBe('clean');
  expect(fall({ efh: 0.9 }).events.find(e => e.type === 'land').quality).toBe('heavy');
  expect(fall({ efh: 1.2 }).events.find(e => e.type === 'land').quality).toBe('sketchy');
  expect(fall({ efh: 1.6 }).events.find(e => e.type === 'crash').reason).toBe('landing-hard');
  expect(fall({ heading: Math.PI / 2 }).events.find(e => e.type === 'crash').reason).toBe('landing-sideways');
});
it('classification boundaries and crouched allowance are strict', () => {
  const p = createParams();
  expect(landingReason(1.5, 0, 10, 0, p)).toBe(''); expect(landingReason(1.5001, 0, 10, 0, p)).toBe('landing-hard');
  expect(landingReason(1.8, 0, 10, 0.5, p)).toBe(''); expect(landingReason(1.8001, 0, 10, 0.5, p)).toBe('landing-hard');
  expect(landingReason(0, 55 * Math.PI / 180, 7, 0, p)).toBe(''); expect(landingReason(0, 56 * Math.PI / 180, 6, 0, p)).toBe('');
});
it('reverse landing continues in switch without flipping steering', () => {
  const r = fall({ heading: Math.PI, efh: 0.3 }); expect(r.state.switch).toBe(true); expect(r.state.vel.z).toBeLessThan(0); expect(r.state.fwd.z).toBeGreaterThan(0);
  for (let i = 0; i < 60; i++) r.step({ steer: 1 }, 1 / 120); expect(r.state.vel.x).toBeGreaterThan(0);
});
it('R2 #13 a matched downhill landing is lighter than the flat landing', () => {
  const impacts = [];
  for (const angle of [0, Math.PI / 6]) {
    const r = createRide(plane(angle), { params: { cdA: 0, cdATuck: 0 } }), snap = r.snapshot();
    const s = snap.state;
    s.mode = 'air'; s.pos.x = s.pos.z = 0; s.pos.y = 0.000001; s.leg = 0.8;
    s.up.x = 0; s.up.y = Math.cos(angle); s.up.z = -Math.sin(angle);
    s.com.x = 0; s.com.y = s.pos.y + s.up.y * s.leg; s.com.z = s.up.z * s.leg;
    s.fwd.x = 0; s.fwd.y = -Math.sin(angle); s.fwd.z = -Math.cos(angle);
    s.vel.y = -10; s.vel.z = -Math.sqrt(300); s.air.time = 0.2; snap.memory.takeoffSent = true;
    r.restore(snap); r.step({}, 1 / 120);
    expect(r.events.some(e => e.type === 'land')).toBe(true);
    impacts.push(r.state.tele.lastImpact);
  }
  expect(impacts[0]).toBeCloseTo(100 / 19.62, 2); expect(impacts[1]).toBeLessThan(0.01);
});
it('60/120/240Hz landing impacts differ less than 5%', () => {
  const impacts = [60, 120, 240].map(hz => fall({ efh: 0.8, hz }).state.tele.lastImpact);
  expect(Math.max(...impacts) / Math.min(...impacts) - 1).toBeLessThan(0.05);
});
it('finds the first thin ridge crossing even when tick endpoints are above the ground', () => {
  const r = createRide(kicker(1, 0.3, 0), { params: { cdA: 0, cdATuck: 0 } });
  const snap = r.snapshot(), s = snap.state;
  s.mode = 'air'; s.pos.x = s.com.x = -1; s.pos.y = 0.3; s.com.y = 1.1; s.leg = 0.8; s.vel.x = 480; s.air.time = 0.2;
  s.fwd.x = 1; s.fwd.z = 0; s.heading = Math.PI / 2; snap.memory.takeoffSent = true;
  r.restore(snap); r.step({}, 1 / 240);
  expect(r.events.some(e => e.type === 'land')).toBe(true); expect(r.state.tele.lastImpact).toBeGreaterThan(0);
});
it('landing on a different support normal keeps COM position continuous', () => {
  const r = createRide(plane(Math.PI / 6), { params: { cdA: 0, cdATuck: 0 } }), snap = r.snapshot(), s = snap.state;
  s.mode = 'air'; s.pos.x = s.pos.z = 0; s.pos.y = 1e-5; s.com.x = s.com.z = 0; s.com.y = 0.80001;
  s.up.x = s.up.z = 0; s.up.y = 1; s.leg = 0.8; s.vel.x = 0; s.vel.y = -3; s.vel.z = -1; s.air.time = 0.2;
  snap.memory.takeoffSent = true; r.restore(snap);
  let y = s.com.y, z = s.com.z;
  for (let i = 0; i < 120; i++) {
    r.step({}, 1 / 240);
    expect(Math.hypot(r.state.com.y - y, r.state.com.z - z)).toBeLessThan(0.05);
    y = r.state.com.y; z = r.state.com.z;
    if (i === 0) expect(r.events.some(e => e.type === 'land')).toBe(true);
  }
});
