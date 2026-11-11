import { it, expect } from 'vitest';
import { createRide } from '../../src/sim/index.js';
import { validState } from '../../src/sim/state.js';
import { plane, wave } from './terrains.js';
import { advance, airborne, hash } from './helpers.js';
it('snapshot restores all hidden integration memory for exact continuation', () => {
  const r = createRide(wave()), c = { steer: 0.8, brake: 0.7, jump: false, tuck: 0.4 };
  r.reset({ x: 1, z: 2, heading: 0, speed: 14 }); advance(r, 1, c);
  const snap = JSON.parse(JSON.stringify(r.snapshot())), references = [r.state, r.state.pos, r.state.com, r.state.snow, r.state.tele];
  advance(r, 2, c); const expected = hash(r.snapshot());
  r.restore(snap); advance(r, 2, c); expect(hash(r.snapshot())).toBe(expected);
  expect(r.state).toBe(references[0]); expect(r.state.pos).toBe(references[1]); expect(r.state.com).toBe(references[2]); expect(r.state.snow).toBe(references[3]); expect(r.state.tele).toBe(references[4]);
});
it('mid-pop and mid-air snapshots also continue exactly', () => {
  const r = createRide(plane()); advance(r, 0.5, { jump: true, steer: 0.7 }); r.step({ steer: 0.7 }, 1 / 120);
  for (const duration of [0.1, 0.5]) {
    const snap = r.snapshot(); advance(r, duration, { steer: 0.4, tuck: 0.3 }); const expected = hash(r.snapshot());
    r.restore(snap); advance(r, duration, { steer: 0.4, tuck: 0.3 }); expect(hash(r.snapshot())).toBe(expected);
  }
});
it('copyState writes each number, including all telemetry, into the existing containers', () => {
  const r = createRide(wave()); advance(r, 1, { steer: 1, brake: 1 });
  const out = r.createState(), pos = out.pos, tele = out.tele; r.copyState(r.state, out);
  expect(hash(out)).toBe(hash(r.state)); expect(out.pos).toBe(pos); expect(out.tele).toBe(tele);
  for (const key of ['edgeForce', 'skidPower', 'spray', 'carveDrag', 'lastImpact']) expect(Number.isFinite(out.tele[key])).toBe(true);
});
it('events last exactly one public step and event records are reused', () => {
  const r = createRide(plane()); airborne(r, { height: 0.2 }); advance(r, 0.075); r.step({}, 1 / 120);
  const first = r.events.find(e => e.type === 'takeoff'); expect(first).toBeDefined();
  r.step({}, 1 / 120); expect(r.events.some(e => e.type === 'takeoff')).toBe(false);
  airborne(r, { height: 0.2 }); advance(r, 0.075); r.step({}, 1 / 120); expect(r.events.find(e => e.type === 'takeoff')).toBe(first);
});
it('microflights under 0.08 seconds suppress both takeoff and land events', () => {
  const r = createRide(plane()); airborne(r, { height: 0.005 });
  const seen = [];
  for (let i = 0; i < 30; i++) { r.step({}, 1 / 240); for (const e of r.events) seen.push(e.type); }
  expect(r.state.mode).not.toBe('air'); expect(seen.includes('takeoff')).toBe(false); expect(seen.includes('land')).toBe(false);
});
it('numeric terrain failure restores the previous good state and emits numeric crash', () => {
  const t = plane(), r = createRide(t); r.reset({ x: 0, z: 0, heading: 0, speed: 10 });
  const before = r.state.pos.z;
  t.curvatureAlong = () => NaN; r.step({}, 1 / 120);
  expect(validState(r.state)).toBe(true); expect(r.state.pos.z).toBe(before); expect(r.state.mode).toBe('crash'); expect(r.events[0].reason).toBe('numeric');
});
it('debug mode reports numeric failure after restoring state', () => {
  const t = plane(), r = createRide(t, { debug: true }); t.curvatureAlong = () => NaN;
  expect(() => r.step({}, 1 / 120)).toThrow('non-finite'); expect(validState(r.state)).toBe(true);
});
it('nonfinite controls clamp safely; grab remains reserved', () => {
  const a = createRide(plane()), b = createRide(plane());
  a.step({ steer: NaN, tuck: Infinity, brake: -Infinity, grab: 1 }, 1 / 120); b.step({}, 1 / 120);
  expect(hash(a.snapshot())).toBe(hash(b.snapshot()));
  a.step({}, NaN); a.step({}, Infinity); a.step({}, 0); expect(validState(a.state)).toBe(true);
});
it('edgeSwitch and bottomOut report their payloads', () => {
  const r = createRide(plane()); r.reset({ x: 0, z: 0, heading: 0, speed: 20 }); advance(r, 1, { steer: 1 });
  let side = 0; for (let i = 0; i < 120; i++) { r.step({ steer: -1 }, 1 / 120); const e = r.events.find(e => e.type === 'edgeSwitch'); if (e) side = e.side; }
  expect(side).toBe(-1);
  const snap = r.snapshot(); snap.state.leg = 0.451; snap.memory.legRate = -10; r.restore(snap); r.step({}, 1 / 120);
  expect(r.events.some(e => e.type === 'bottomOut' && e.impulse > 0)).toBe(true);
});

it('standing still or creeping straight reports no edgeSwitch, and one real change of edge reports exactly one', () => {
  // 見つけた不具合：出発直後の 2 秒で、操作していないのに edgeSwitch が 4 回出ていた（角度がほぼ 0 のまま符号だけ入れ替わる）
  const r = createRide(plane(15 * Math.PI / 180, Math.PI)); // 15° の斜面。下る向きは南
  r.reset({ x: 0, z: 0, heading: Math.PI, speed: 0 });
  let count = 0;
  for (let i = 0; i < 240; i++) { r.step({}, 1 / 120); count += r.events.filter(e => e.type === 'edgeSwitch').length; }
  expect(count).toBe(0);
  // 速さが乗ってから、右→左へ切り替えると 1 回だけ出る
  for (let i = 0; i < 360; i++) r.step({}, 1 / 120);
  for (let i = 0; i < 90; i++) r.step({ steer: 0.8 }, 1 / 120);
  count = 0;
  for (let i = 0; i < 120; i++) { r.step({ steer: -0.8 }, 1 / 120); count += r.events.filter(e => e.type === 'edgeSwitch').length; }
  expect(count).toBe(1);
});
