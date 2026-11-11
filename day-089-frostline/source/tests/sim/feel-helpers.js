import { createRide } from '../../src/sim/index.js';
import { plane } from './terrains.js';
import { advance } from './helpers.js';
import { wrap } from '../../src/sim/vec.js';

export const DEG = Math.PI / 180;
export const snow = { powder: 0.55, packed: 0.40, ice: 0.05 };
export const slope = (degrees, cover = snow) => plane(degrees * DEG, 0, { snow: cover });
export function ride(terrain, speed, heading = 0) {
  const r = createRide(terrain); r.reset({ x: 0, z: 0, speed, heading }); return r;
}
export function trace(r, seconds, controls, hz = 120) {
  const samples = [], events = []; let angle = 0, previous = Math.atan2(r.state.vel.x, -r.state.vel.z);
  for (let i = 0; i < Math.round(seconds * hz); i++) {
    r.step(controls, 1 / hz);
    const heading = Math.atan2(r.state.vel.x, -r.state.vel.z), rate = wrap(heading - previous) * hz;
    angle += rate / hz; previous = heading;
    samples.push({ rate, speed: r.state.speed, spray: r.state.tele.spray, mode: r.state.mode });
    events.push(...r.events.map(e => ({ ...e, time: (i + 1) / hz })));
  }
  return { angle: angle / DEG, samples, events };
}
export function jump(hold) {
  const r = ride(slope(0), 15); advance(r, hold, { jump: true });
  let time = 0, launch = 0, tookOff = false, pop = false;
  for (let i = 0; i < 240; i++) {
    const wasAir = r.state.mode === 'air'; r.step({}, 1 / 240);
    if (!wasAir && r.state.mode === 'air') { launch = r.state.vel.y; tookOff = true; }
    if (r.state.mode === 'air') time += 1 / 240;
    if (r.events.some(e => e.type === 'takeoff' && e.pop)) pop = true;
    if (tookOff && r.state.mode !== 'air') break;
  }
  return { time, launch, pop };
}
