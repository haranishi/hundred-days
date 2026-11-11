import { it, expect } from 'vitest';
import { createRide } from '../../src/sim/index.js';
import { plane } from './terrains.js';
it('I10: 60 km/h full braking stops in 18–26m on packed 15° snow', () => {
  const r = createRide(plane(15 * Math.PI / 180)); r.reset({ x: 0, z: 0, heading: 0, speed: 60 / 3.6 });
  let distance = 0, t = 0, lastX = 0, lastY = 0, lastZ = 0;
  while (r.state.speed > 0.25 && t < 15) {
    r.step({ brake: 1 }, 1 / 120); distance += Math.hypot(r.state.pos.x - lastX, r.state.pos.y - lastY, r.state.pos.z - lastZ);
    lastX = r.state.pos.x; lastY = r.state.pos.y; lastZ = r.state.pos.z; t += 1 / 120;
  }
  console.log(`TARGET full brake 15deg distance=${distance}, time=${t}`);
  expect(distance).toBeGreaterThanOrEqual(18); expect(distance).toBeLessThanOrEqual(26); expect(t).toBeLessThan(15);
});
it('release aligns the board within half a second', () => {
  const r = createRide(plane()); r.reset({ x: 0, z: 0, heading: 0, speed: 25 });
  for (let i = 0; i < 120; i++) r.step({ brake: 1 }, 1 / 240);
  for (let i = 0; i < 120; i++) r.step({}, 1 / 240);
  expect(Math.abs(r.state.slip)).toBeLessThan(4 * Math.PI / 180);
});
it('snow forces never add kinetic energy, including low-speed skid', () => {
  for (const initial of [0, 0.1, 0.9, 5, 20]) {
    const r = createRide(plane(), { params: { cdA: 0, cdATuck: 0 } }); r.reset({ x: 0, z: 0, heading: 0, speed: initial });
    let last = initial;
    for (let i = 0; i < 600; i++) { r.step({ brake: 1, steer: i < 300 ? 1 : -1 }, 1 / 120); expect(r.state.speed).toBeLessThanOrEqual(last + 1e-10); last = r.state.speed; }
  }
});
it('brake+steer reaches a smaller turn radius than carve and reduces speed', () => {
  const a = createRide(plane()), b = createRide(plane());
  a.reset({ x: 0, z: 0, heading: 0, speed: 18 }); b.reset({ x: 0, z: 0, heading: 0, speed: 18 });
  for (let i = 0; i < 360; i++) { a.step({ steer: 1 }, 1 / 240); b.step({ brake: 1, steer: 1 }, 1 / 240); }
  const ha = Math.atan2(a.state.vel.x, -a.state.vel.z), hb = Math.atan2(b.state.vel.x, -b.state.vel.z);
  a.step({ steer: 1 }, 1 / 240); b.step({ brake: 1, steer: 1 }, 1 / 240);
  const ra = a.state.speed / (Math.abs(Math.atan2(a.state.vel.x, -a.state.vel.z) - ha) * 240);
  const rb = b.state.speed / (Math.abs(Math.atan2(b.state.vel.x, -b.state.vel.z) - hb) * 240);
  expect(rb).toBeLessThan(ra); expect(b.state.speed).toBeLessThan(a.state.speed);
});
it('mode changes preserve velocity and position continuously and use the uphill edge', () => {
  const r = createRide(plane()); r.reset({ x: 0, z: 0, heading: 0, speed: 20 });
  for (let i = 0; i < 240; i++) {
    const x = r.state.pos.x, z = r.state.pos.z, vx = r.state.vel.x, vz = r.state.vel.z;
    r.step({ steer: 1, brake: i < 120 ? 1 : 0 }, 1 / 240);
    expect(Math.hypot(r.state.pos.x - x, r.state.pos.z - z)).toBeLessThan(0.09);
    expect(Math.hypot(r.state.vel.x - vx, r.state.vel.z - vz)).toBeLessThan(0.2);
    const w = r.state.vel.x * r.state.right.x + r.state.vel.y * r.state.right.y + r.state.vel.z * r.state.right.z;
    if (r.state.mode === 'skid' && Math.abs(w) > 1e-9) expect(r.state.edge * w).toBeLessThanOrEqual(0);
  }
});
it('braking without steer remembers the immediately preceding carve side', () => {
  const r = createRide(plane()); r.reset({ x: 0, z: 0, heading: 0, speed: 20 });
  for (let i = 0; i < 120; i++) r.step({ steer: -1 }, 1 / 240);
  for (let i = 0; i < 60; i++) r.step({ brake: 1 }, 1 / 240);
  expect(r.snapshot().memory.side).toBe(-1); expect(r.state.slip).toBeLessThan(0);
});
