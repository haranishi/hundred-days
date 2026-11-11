import { createRide } from '../../src/sim/index.js';
import { createParams, edgeGrip } from '../../src/sim/params.js';
import { plane, wave } from './terrains.js';
import { advance, seeded } from './helpers.js';

export function terminal(degrees, cdA, hz = 120) {
  const theta = degrees * Math.PI / 180;
  const r = createRide(plane(theta), { params: { cdA, cdATuck: cdA } });
  r.reset({ x: 0, z: 0, heading: 0, speed: 5 }); advance(r, 80, {}, hz);
  return { target: Math.sqrt(2 * 80 * 9.81 * (Math.sin(theta) - 0.04 * Math.cos(theta)) / (1.1 * cdA)) * 3.6, actual: r.state.speed * 3.6 };
}
/** R2 constant total μb=.8: board is exactly transverse, no yaw, no aerodynamic drag.
 * This deliberately differs from the default rotating 75° board's stopping distance. */
export function constantBrake(degrees, hz = 120) {
  const p = createParams(), theta = degrees * Math.PI / 180;
  const lambda = 0.8 / (p.skidDynamic * edgeGrip(p.skidEdgeBase + p.skidEdgeBrake, p));
  const r = createRide(plane(theta), { params: { cdA: 0, cdATuck: 0, skidAngle: Math.PI / 2, skidLowSpeed: 0, skidOmega: 0, skidRegularSpeed: 1e-10, snow: { packed: { mu: 0, lambda } } } });
  r.reset({ x: 0, z: 0, heading: 0, speed: 60 / 3.6 });
  const snap = r.snapshot(), s = snap.state;
  s.mode = 'skid'; s.heading = Math.PI / 2; s.fwd.x = 1; s.fwd.y = s.fwd.z = 0; s.right.x = 0; s.right.y = -s.up.z; s.right.z = s.up.y;
  r.restore(snap);
  let distance = 0, time = 0;
  while (r.state.speed > 1e-8 && time < 30) {
    const x = r.state.pos.x, y = r.state.pos.y, z = r.state.pos.z; r.step({ brake: 1 }, 1 / hz);
    distance += Math.hypot(r.state.pos.x - x, r.state.pos.y - y, r.state.pos.z - z); time += 1 / hz;
  }
  return { target: (60 / 3.6) ** 2 / (2 * 9.81 * (0.8 * Math.cos(theta) - Math.sin(theta))), actual: distance,
    targetTime: (60 / 3.6) / (9.81 * (0.8 * Math.cos(theta) - Math.sin(theta))), time };
}
export function dropImpact(hz) {
  const r = createRide(plane(), { params: { cdA: 0, cdATuck: 0 } }), snap = r.snapshot();
  snap.state.mode = 'air'; snap.state.pos.y = 1.2; snap.state.com.y = 2; snap.state.leg = 0.8;
  snap.state.vel.z = -10; snap.state.air.time = 0; r.restore(snap);
  let impact = -1, at = 0;
  for (let i = 0; i < hz * 2; i++) {
    r.step({}, 1 / hz); const e = r.events.find(e => e.type === 'land');
    if (e) { impact = e.efh; at = (i + 1) / hz; break; }
  }
  return { impact, at };
}
export function defaultBrake(degrees = 0) {
  const r = createRide(plane(degrees * Math.PI / 180)); r.reset({ x: 0, z: 0, heading: 0, speed: 60 / 3.6 });
  let distance = 0, time = 0;
  while (r.state.speed > 0.25 && time < 20) {
    const x = r.state.pos.x, y = r.state.pos.y, z = r.state.pos.z; r.step({ brake: 1 }, 1 / 120);
    distance += Math.hypot(r.state.pos.x - x, r.state.pos.y - y, r.state.pos.z - z); time += 1 / 120;
  }
  return { distance, time };
}
export function popHeight() {
  const r = createRide(plane()); advance(r, 0.5, { jump: true }); let height = 0;
  for (let i = 0; i < 240; i++) { r.step({}, 1 / 240); height = Math.max(height, r.state.pos.y); }
  return height;
}
/** One deterministic five-minute scenario; timing is optional and never feeds physics. */
export function endurance(measure = false) {
  const r = createRide(wave(0.6, 12, 0.2), { debug: true }); r.reset({ x: 0, z: 0, heading: 0, speed: 12 });
  const rng = seeded(0x6a09e667), controls = { steer: 0, brake: 0, tuck: 0, jump: false };
  let total = 0, max = 0, numeric = false, airborneSteps = 0, crashSteps = 0, skidSteps = 0;
  for (let i = 0; i < 36000; i++) {
    if (i % 24 === 0) { controls.steer = rng() * 2 - 1; controls.brake = rng() < 0.15 ? rng() : 0; controls.tuck = rng(); controls.jump = rng() < 0.2; }
    const start = measure ? performance.now() : 0; r.step(controls, 1 / 120);
    if (measure) { const elapsed = (performance.now() - start) * 1000; total += elapsed; max = Math.max(max, elapsed); }
    if (r.events.some(e => e.reason === 'numeric')) numeric = true;
    if (r.state.mode === 'air') airborneSteps++; if (r.state.mode === 'skid') skidSteps++; if (r.state.mode === 'crash') crashSteps++;
  }
  return { ride: r, averageUs: total / 36000, maxUs: max, numeric, airborneSteps, skidSteps, crashSteps };
}
