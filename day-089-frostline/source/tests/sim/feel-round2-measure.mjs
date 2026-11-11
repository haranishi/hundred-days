// NODE_OPTIONS=--max-old-space-size=1536 node tests/sim/feel-round2-measure.mjs
import { DEG, snow, slope, ride, trace } from './feel-helpers.js';
import { advance } from './helpers.js';
import { circular, wave, kicker } from './terrains.js';
const result = {};
function crest(speed, leg) {
  const r = ride(circular(-0.01), speed, Math.PI / 2);
  if (leg !== undefined) { const s = r.snapshot(); s.state.leg = leg; s.memory.legRate = 0; r.restore(s); }
  return r;
}
const fast = crest(37, 0.9), slow = crest(25); let ticks = 0;
while (fast.state.mode !== 'air' && ticks < 48) { fast.step({}, 1 / 240); ticks++; }
advance(slow, 0.1); result.T12 = { seconds: ticks / 240, slowMode: slow.state.mode, slowLoad: slow.state.load };
const unloaded = crest(37, 0.96); ticks = 0;
while (unloaded.state.mode !== 'air' && ticks < 24) { unloaded.step({}, 1 / 240); ticks++; }
result.T13 = { seconds: ticks / 240, leg: unloaded.state.leg };
const stopped = ride(slope(15), 0); advance(stopped, 1, { steer: 0.5 });
result.T14 = { lowDegrees: trace(ride(slope(15), 3), 1.5, { steer: 0.8 }).angle,
  mediumDegrees: trace(ride(slope(20), 12), 1, { steer: 1 }).angle, stoppedDegrees: stopped.state.heading / DEG };
const traverse = ride(slope(25), 15, Math.PI / 2); let maxEdge = 0;
for (let i = 0; i < 360; i++) { traverse.step({}, 1 / 120); maxEdge = Math.max(maxEdge, Math.abs(traverse.state.edge) / DEG); }
result.T15 = { downhillDegrees: 90 - traverse.state.heading / DEG, maxEdge,
  uphillHoldDegrees: trace(ride(slope(25), 15, Math.PI / 2), 2, { steer: 0.25 }).angle,
  packedHoldDegrees: trace(ride(slope(25, { packed: 1, powder: 0, ice: 0 }), 15, Math.PI / 2), 2, { steer: 0.25 }).angle };
const neutral = ride(wave(0.05, 14), 22); let switches = 0; maxEdge = 0;
for (let i = 0; i < 600; i++) { neutral.step({}, 1 / 120); maxEdge = Math.max(maxEdge, Math.abs(neutral.state.edge) / DEG); switches += neutral.events.filter(e => e.type === 'edgeSwitch').length; }
result.T16 = { switches, maxEdge };
const safe = ride(slope(25), 15, Math.PI / 2); advance(safe, 5, { steer: 0.25 }); const savedHeading = safe.snapshot().safe.heading / DEG;
advance(safe, 5, { brake: 1 }); result.T17 = { savedHeading, respawns: [] };
for (const kind of ['safe', 'drop']) { safe.respawn(kind); const heading = safe.state.heading / DEG, initialSpeed = safe.state.speed;
  advance(safe, 1.5); result.T17.respawns.push({ kind, heading, initialSpeed, speedAt1_5: safe.state.speed }); }
const tree = { type: 'tree', x: 0, z: -10, y: -100, height: 300, radius: 0.4 };
const terrain = slope(25); terrain.obstaclesNear = (x, z, radius, out) => { out.length = 0; if (Math.hypot(x, z + 10) <= radius + tree.radius) out.push(tree); return out; };
const obstacle = ride(terrain, 0, Math.PI / 2); obstacle.respawn('safe');
result.T18 = { lateral: obstacle.state.pos.x, forward: obstacle.state.pos.z, initialSpeed: obstacle.state.speed };
result.T19 = [];
for (const sign of [-1, 1]) {
  const r = ride(slope(20), 15, Math.PI); let stop = 0;
  while (r.state.speed > 0.25 && stop < 8) { r.step({ brake: 1, steer: sign }, 1 / 120); stop += 1 / 120; }
  let last = r.state.heading, total = 0, max = 0;
  for (let i = 0; i < 240; i++) { r.step({}, 1 / 120); total += Math.atan2(Math.sin(r.state.heading - last), Math.cos(r.state.heading - last)); last = r.state.heading; max = Math.max(max, Math.abs(total) / DEG); }
  result.T19.push({ sign, maxDegrees: max, downhillSpeed: -r.state.vel.z * Math.cos(20 * DEG) - r.state.vel.y * Math.sin(20 * DEG), switch: r.state.switch });
}
result.smallHops = [0.2, 0.3].map(height => {
  const r = ride(kicker(height, 8), 28, Math.PI / 2); r.reset({ x: -12, z: 0, heading: Math.PI / 2, speed: 28 });
  const t = trace(r, 2, { steer: 1 }); return { height, airSeconds: t.samples.filter(s => s.mode === 'air').length / 120, crashes: t.events.filter(e => e.type === 'crash').length };
});
const smooth = trace(ride(slope(20), 22), 2, { steer: 1 });
result.T2 = [0.05, 0.25].map(amplitude => {
  const t = trace(ride(wave(amplitude, 14, Math.tan(20 * DEG), { snow }), 22), 2, { steer: 1 });
  return { amplitude, turnRatio: t.angle / smooth.angle, hasAir: t.samples.some(s => s.mode === 'air') };
});
console.log(JSON.stringify(result, null, 2));
