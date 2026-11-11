import { it, expect } from 'vitest';
import { createRide } from '../../src/sim/index.js';
import { PARAMS } from '../../src/sim/params.js';
import { circular, wave, kicker, parabola } from './terrains.js';
import { advance, hash } from './helpers.js';
import { DEG, ride, slope, trace } from './feel-helpers.js';

function crestEntry(speed, leg = 0.9) {
  const r = ride(circular(-1 / 100), speed, Math.PI / 2);
  const snap = r.snapshot(); snap.state.leg = leg; snap.memory.legRate = 0; r.restore(snap);
  return r;
}
it('T12: a 100m crest detaches at 37m/s within 0.1s, but supports 25m/s', () => {
  const fast = crestEntry(37); let time = 0;
  while (fast.state.mode !== 'air' && time < 0.1) { fast.step({}, 1 / 240); time += 1 / 240; }
  const slow = ride(circular(-1 / 100), 25, Math.PI / 2); advance(slow, 0.1);
  console.log('I8 T12', { time, mode: fast.state.mode, slowLoad: slow.state.load });
  expect(fast.state.mode).toBe('air'); expect(time).toBeLessThanOrEqual(0.1 + 1e-12);
  expect(slow.state.mode).toBe('carve'); expect(slow.state.load).toBeGreaterThanOrEqual(0.2); expect(slow.state.load).toBeLessThanOrEqual(0.5);
});
it('T13: zero spring support detaches after 0.04s, not before; brief crouch unloading stays grounded', () => {
  const r = crestEntry(37, 0.96);
  for (let i = 0; i < 9; i++) { r.step({}, 1 / 240); expect(r.state.mode).not.toBe('air'); expect(r.state.load).toBe(0); }
  r.step({}, 1 / 240);
  console.log('I8 T13', { modeAtThreshold: r.state.mode, leg: r.state.leg });
  expect(r.state.mode).toBe('air'); expect(PARAMS.unloadTime).toBe(0.04);
  const brief = ride(circular(0), 10); let zeroDuration = 0, maxZero = 0;
  for (let i = 0; i < 120; i++) {
    brief.step({ jump: i < 5 }, 1 / 240);
    zeroDuration = brief.state.load === 0 ? zeroDuration + 1 / 240 : 0; maxZero = Math.max(maxZero, zeroDuration);
    expect(brief.state.mode).not.toBe('air');
  }
  expect(maxZero).toBeGreaterThan(0); expect(maxZero).toBeLessThan(0.04);
});

it('T14: slow turns are bounded while medium-speed and stationary steering stay responsive', () => {
  const low = trace(ride(slope(15), 3), 1.5, { steer: 0.8 });
  const medium = trace(ride(slope(20), 12), 1, { steer: 1 });
  const stopped = ride(slope(15), 0); advance(stopped, 1, { steer: 0.5 });
  console.log('I8 T14', { low: low.angle, medium: medium.angle, stopped: stopped.state.heading / DEG });
  expect(low.angle).toBeGreaterThanOrEqual(55); expect(low.angle).toBeLessThanOrEqual(95);
  expect(medium.angle).toBeGreaterThanOrEqual(55); expect(stopped.state.heading / DEG).toBeGreaterThanOrEqual(35);
});

it('T15: neutral traverse falls downhill, while a weak uphill command holds the line', () => {
  const r = ride(slope(25), 15, Math.PI / 2); let maxEdge = 0;
  for (let i = 0; i < 360; i++) { r.step({}, 1 / 120); maxEdge = Math.max(maxEdge, Math.abs(r.state.edge) / DEG); }
  const fall = 90 - Math.atan2(r.state.vel.x, -r.state.vel.z) / DEG;
  const held = trace(ride(slope(25), 15, Math.PI / 2), 2, { steer: 0.25 });
  console.log('I8 T15', { fall, maxEdge, held: held.angle });
  expect(fall).toBeGreaterThanOrEqual(25); expect(fall).toBeLessThanOrEqual(80); expect(maxEdge).toBeLessThanOrEqual(15);
  expect(Math.abs(held.angle)).toBeLessThanOrEqual(10);
  const packed = trace(ride(slope(25, { packed: 1, powder: 0, ice: 0 }), 15, Math.PI / 2), 2, { steer: 0.25 });
  console.log('I8 T15 packed hold', packed.angle); expect(Math.abs(packed.angle)).toBeLessThanOrEqual(10);
});
it('T16: neutral rollers keep a flat board without false edgeSwitch events', () => {
  const r = ride(wave(0.05, 14), 22); let switches = 0, maxEdge = 0;
  for (let i = 0; i < 600; i++) {
    r.step({}, 1 / 120); switches += r.events.filter(e => e.type === 'edgeSwitch').length;
    maxEdge = Math.max(maxEdge, Math.abs(r.state.edge) / DEG); expect(r.state.mode).not.toBe('air');
  }
  console.log('I8 T16', { switches, maxEdge });
  expect(switches).toBe(0); expect(maxEdge).toBeLessThanOrEqual(20);
});
it('T16: a brief unloaded neutral traverse does not snap the edge to 60 degrees', () => {
  const r = ride(slope(25), 15, Math.PI / 2), snap = r.snapshot();
  snap.state.leg = 0.96; snap.memory.legRate = 0; r.restore(snap);
  r.step({}, 1 / 240);
  console.log('I8 T16 unloaded', { load: r.state.load, edge: r.state.edge / DEG });
  expect(r.state.load).toBe(0); expect(Math.abs(r.state.edge) / DEG).toBeLessThanOrEqual(20);
});
it('T17: safe/drop respawns face downhill on slopes, stop initially, then move without input', () => {
  const r = ride(slope(25), 15, Math.PI / 2); advance(r, 5, { steer: 0.25 });
  const safe = r.snapshot().safe;
  expect(Math.abs(safe.heading / DEG - 90)).toBeLessThan(20);
  advance(r, 5, { brake: 1 });
  for (const kind of ['safe', 'drop']) {
    r.respawn(kind);
    console.log('I8 T17', { kind, heading: r.state.heading / DEG });
    expect(Math.abs(r.state.heading) / DEG).toBeLessThanOrEqual(20); expect(r.state.speed).toBe(0);
    advance(r, 1.5); expect(r.state.speed).toBeGreaterThanOrEqual(2);
  }
  const gentle = ride(slope(4), 12, 0.7); advance(gentle, 3.2);
  const saved = gentle.snapshot();
  for (const kind of ['safe', 'drop']) {
    gentle.respawn(kind); expect(gentle.state.speed).toBe(0);
    expect(gentle.state.heading).toBe(saved[kind].heading);
  }
});
function tree(x, z, radius = 0.4) { return { type: 'tree', x, z, radius, y: -100, height: 300 }; }
it('T18: respawn moves sideways at most 6m to clear the full 12m by 4m corridor', () => {
  for (const kind of ['safe', 'drop']) {
    const obstacle = tree(0, -10);
    // The obstacle is farther ahead than crash recovery's existing 4m check.
    const terrain = slope(25); terrain.obstaclesNear = (x, z, radius, out) => { out.length = 0; if (Math.hypot(x - obstacle.x, z - obstacle.z) <= radius + obstacle.radius) out.push(obstacle); return out; };
    const subject = createRide(terrain); subject.reset({ x: 0, z: 0, heading: Math.PI / 2, speed: 0 });
    subject.respawn(kind);
    console.log('I8 T18', { kind, x: subject.state.pos.x, z: subject.state.pos.z });
    expect(Math.abs(subject.state.pos.x)).toBeGreaterThanOrEqual(2 + obstacle.radius + PARAMS.riderRadius);
    expect(Math.abs(subject.state.pos.x)).toBeLessThanOrEqual(6); expect(subject.state.pos.z).toBe(0);
    expect(subject.state.speed).toBe(0);
    const result = trace(subject, 2, {}); expect(result.events.filter(e => e.type === 'collision')).toHaveLength(0);
  }
});
it('T18: when both sides are blocked, choose the corridor with the greatest clearance', () => {
  const obstacles = [tree(-4, -8, 4), tree(3, -8, 4)];
  const terrain = slope(25); terrain.obstaclesNear = (x, z, radius, out) => { out.length = 0; out.push(...obstacles); return out; };
  const r = ride(terrain, 0); r.respawn('drop');
  console.log('I8 T18 blocked', r.state.pos.x);
  // At x=+6 the nearest trunk center is 3m away; x=-6 is only 2m away, the interior gap at best 3.5m.
  // The widest interior gap is centered at -0.5; it is 3.5m from either center.
  expect(r.state.pos.x).toBeCloseTo(-0.5, 8); expect(r.state.pos.z).toBe(0);
});
// 2026-11-11：決まりを変えた。制動で止まった後は、近いほうの端ではなく、板の「先」を谷へ向ける（後ろ向きで滑り出さない）。
// 回る量の上限は 100° → 180°。板の先が山を向いて止まる、いちばん不利な場面では、回る量が 90° → 約 120° に増えるぶん（毎秒 100° まで）、
// 谷へ秒速 2 m で動き出すまでの時間を、2 秒 → 2.3 秒とした（実測 2 秒で秒速 1.97 m）
it('T19: releasing a steered stop pivots the nose downhill (never starts switch) and moves within 2.3s', () => {
  for (const sign of [-1, 1]) {
    const r = ride(slope(20), 15, Math.PI); // The nose starts uphill: the hardest case for a nose-first restart.
    let stop = 0;
    while (r.state.speed > 0.25 && stop < 8) { r.step({ brake: 1, steer: sign }, 1 / 120); stop += 1 / 120; }
    expect(r.state.speed).toBeLessThanOrEqual(0.25);
    let previous = r.state.heading, total = 0, max = 0;
    for (let i = 0; i < 276; i++) {
      r.step({}, 1 / 120);
      const delta = Math.atan2(Math.sin(r.state.heading - previous), Math.cos(r.state.heading - previous));
      total += delta; previous = r.state.heading; max = Math.max(max, Math.abs(total) / DEG);
    }
    const downhillSpeed = -r.state.vel.z * Math.cos(20 * DEG) - r.state.vel.y * Math.sin(20 * DEG);
    console.log('I8 T19', { sign, stop, max, downhillSpeed, switch: r.state.switch });
    expect(max).toBeLessThanOrEqual(180); expect(downhillSpeed).toBeGreaterThanOrEqual(2); expect(r.state.switch).toBe(false);
  }
});
it('T22: 谷へ滑って制動で止まり、離すと、板の先から滑り出す（後ろ向きにならない）', () => {
  for (const degrees of [10, 20]) for (const speed of [8, 14, 20]) for (const brake of [0.5, 1]) for (const steer of [0, 0.4, -0.4]) {
    const r = ride(slope(degrees), speed, 0);
    advance(r, 0.6, { steer }); advance(r, 6, { brake }); expect(r.state.speed).toBeLessThan(0.5);
    advance(r, 4, {});
    expect(r.state.switch, JSON.stringify({ degrees, speed, brake, steer })).toBe(false);
    expect(r.state.speed).toBeGreaterThan(0.5); // 動き出している（ゆるい斜面の新雪では、4 秒で秒速 1.6 m ほど）
  }
});

it('I8: small natural hops land aligned without a crash while steering stays held', () => {
  for (const height of [0.2, 0.3]) {
    const r = ride(kicker(height, 8), 28, Math.PI / 2); r.reset({ x: -12, z: 0, heading: Math.PI / 2, speed: 28 });
    const t = trace(r, 2, { steer: 1 }), airtime = t.samples.filter(s => s.mode === 'air').length / 120;
    console.log('I8 short hop', { height, airtime });
    expect(airtime).toBeGreaterThanOrEqual(0.1); expect(airtime).toBeLessThanOrEqual(0.3);
    expect(t.events.find(e => e.type === 'takeoff')?.pop).toBe(false);
    expect(t.events.find(e => e.type === 'land')?.yawDeg).toBeLessThanOrEqual(15);
    expect(t.events.some(e => e.type === 'crash')).toBe(false);
  }
});
it('I8: an unload timer survives snapshots and clears when a loaded contact returns', () => {
  const r = crestEntry(37, 0.96); advance(r, 5 / 240, {}, 240);
  const snapshot = r.snapshot(); advance(r, 5 / 240, {}, 240); expect(r.state.mode).toBe('air');
  const result = hash(r.snapshot()); r.restore(snapshot); advance(r, 5 / 240, {}, 240); expect(hash(r.snapshot())).toBe(result);
  r.reset({ x: 0, z: 0, heading: Math.PI / 2, speed: 25 }); advance(r, 0.1); expect(r.state.mode).toBe('carve');
});
it('I8: new steering, unloading and stop-release behavior agrees at 60 and 120Hz', () => {
  for (const scenario of ['low', 'traverse', 'crest', 'release']) {
    const samples = [60, 120].map(hz => {
      const r = scenario === 'crest' ? crestEntry(37, 0.96) : ride(slope(scenario === 'traverse' ? 25 : 20), scenario === 'low' ? 3 : 15, scenario === 'traverse' ? Math.PI / 2 : scenario === 'release' ? Math.PI : 0);
      if (scenario === 'release') advance(r, 2, { steer: 1, brake: 1 }, hz);
      const t = trace(r, scenario === 'crest' ? 0.1 : 2, scenario === 'low' ? { steer: 0.8 } : {}, hz);
      expect(t.events.some(e => e.reason === 'numeric')).toBe(false);
      return { ...r.state.pos, speed: r.state.speed, heading: r.state.heading, mode: r.state.mode };
    });
    expect(samples[0].mode).toBe(samples[1].mode);
    for (const field of ['x', 'y', 'z', 'speed', 'heading']) expect(Math.abs(samples[0][field] - samples[1][field])).toBeLessThan(1e-8);
  }
});

it('T17/T18: a sideways respawn follows the fall line at the shifted position', () => {
  const terrain = parabola(0.2, Math.tan(25 * DEG), { obstacles: [tree(0, -10)] });
  const r = ride(terrain, 0); r.respawn('drop'); const surface = {};
  terrain.sampleSurface(r.state.pos.x, r.state.pos.z, surface);
  const downhill = Math.atan2(surface.nx, -surface.nz);
  expect(Math.abs(r.state.heading - downhill) / DEG).toBeLessThanOrEqual(20);
});
it('T13: passive zero support also detaches while the leg is shortening', () => {
  const r = ride(slope(60), 10), snap = r.snapshot(); snap.state.leg = 0.99; r.restore(snap);
  for (let i = 0; i < 9; i++) { r.step({}, 1 / 240); expect(r.state.load).toBe(0); expect(r.state.mode).toBe('carve'); }
  r.step({}, 1 / 240); expect(r.state.mode).toBe('air');
});
