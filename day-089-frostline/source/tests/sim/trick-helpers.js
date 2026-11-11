import { createRide } from '../../src/sim/index.js';
import { plane } from './terrains.js';
import { advance } from './helpers.js';
export const DEG = Math.PI / 180;
export function flight({ pop = false, seed = 0, height = 100, flip = 0, heading = 0, time = 0, speed = 10, params = {} } = {}) {
  const r = createRide(plane(), { params: { cdA: 0, cdATuck: 0, ...params } }), snap = r.snapshot(), s = snap.state;
  s.mode = 'air'; s.leg = 0.8; s.com.y = height + 0.8; s.pos.y = height; s.vel.z = -speed;
  s.air.time = time; s.air.apex = s.com.y; s.air.flip = flip;
  s.fwd.x = Math.sin(heading) * Math.cos(flip); s.fwd.y = -Math.sin(flip); s.fwd.z = -Math.cos(heading) * Math.cos(flip); s.heading = heading;
  s.up.x = Math.sin(heading) * Math.sin(flip); s.up.y = Math.cos(flip); s.up.z = -Math.cos(heading) * Math.sin(flip);
  s.pos.x = s.com.x - s.up.x * s.leg; s.pos.y = s.com.y - s.up.y * s.leg; s.pos.z = s.com.z - s.up.z * s.leg;
  snap.memory.takeoffPop = pop; snap.memory.spin = snap.memory.initialSpin = seed;
  snap.memory.seedSide = Math.sign(seed); snap.memory.takeoffSent = time >= 0.08;
  // Air basis is deliberately initialized from the restored public orientation.
  snap.memory.airBasis = false;
  r.restore(snap); return r;
}
export function popFlight(hold, degrees = 15) {
  const terrain = plane(degrees * DEG), r = createRide(terrain);
  r.reset({ x: 0, z: 0, heading: 0, speed: 15 }); advance(r, hold, { jump: true }, 240);
  let launched = false, launch = 0, peak = 0;
  for (let i = 0; i < 720; i++) {
    const was = r.state.mode; r.step({}, 1 / 240);
    if (was !== 'air' && r.state.mode === 'air') { launched = true; launch = r.state.vel.x * r.state.up.x + r.state.vel.y * r.state.up.y + r.state.vel.z * r.state.up.z; }
    peak = Math.max(peak, r.state.pos.y - terrain.heightAt(r.state.pos.x, r.state.pos.z));
    const e = r.events.find(e => e.type === 'land'); if (e && launched) return { ...e, launch, peak };
  }
  return { air: 0, quality: 'missing', launch, peak };
}
export function brakeMeasure(brake = 1, speed = 12) {
  const r = createRide(plane(15 * DEG)); r.reset({ x: 0, z: 0, heading: 0, speed });
  let distance = 0, early = 0, second = 0, ticks = 0;
  for (; ticks < 2400; ticks++) {
    const prev = { ...r.state.pos }; r.step({ brake }, 1 / 240);
    distance += Math.hypot(r.state.pos.x - prev.x, r.state.pos.y - prev.y, r.state.pos.z - prev.z);
    if (ticks === 71) early = r.state.speed; if (ticks === 239) second = r.state.speed;
    if (ticks >= 239 && r.state.speed <= 0.25) break;
  }
  return { early, second, distance, time: (ticks + 1) / 240, speed: r.state.speed };
}
export function releaseMeasure() {
  const r = createRide(plane(20 * DEG)); r.reset({ x: 0, z: 0, heading: Math.PI / 2, speed: 15 });
  for (let i = 0; i < 2400 && r.state.speed > 0.25; i++) r.step({ brake: 1 }, 1 / 240);
  let rate = 0, aligned = -1, previous = { ...r.state.fwd };
  for (let i = 0; i < 720; i++) {
    r.step({}, 1 / 240);
    rate = Math.max(rate, Math.acos(Math.min(1, previous.x * r.state.fwd.x + previous.y * r.state.fwd.y + previous.z * r.state.fwd.z)) * 240 / DEG);
    previous = { ...r.state.fwd };
    const dot = Math.abs(-Math.sin(20 * DEG) * previous.y - Math.cos(20 * DEG) * previous.z);
    if (aligned < 0 && Math.acos(Math.min(1, dot)) <= 20 * DEG) aligned = (i + 1) / 240;
  }
  return { rate, aligned };
}
