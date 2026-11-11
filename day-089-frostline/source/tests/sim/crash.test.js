import { it, expect } from 'vitest';
import { createRide } from '../../src/sim/index.js';
import { plane } from './terrains.js';
function advance(r, seconds, c = {}) { for (let i = 0; i < Math.round(seconds * 120); i++) r.step(c, 1 / 120); }
it('a crash slides to a stop and recovers within 1.5s after settling', () => {
  const r = createRide(plane()), snap = r.snapshot(); snap.state.mode = 'crash'; snap.state.vel.z = -5; r.restore(snap);
  let stop = -1, recover = -1;
  for (let i = 0; i < 600; i++) {
    r.step({}, 1 / 120); if (stop < 0 && r.state.speed < 0.5) stop = (i + 1) / 120;
    if (r.events.some(e => e.type === 'recover')) { recover = (i + 1) / 120; break; }
  }
  expect(recover).toBeGreaterThan(stop); expect(recover - stop).toBeLessThanOrEqual(1.5 + 1e-12); expect(r.state.mode).toBe('carve');
});
it('drop and safe respawn both stop and preserve nested state references', () => {
  const r = createRide(plane()), s = r.state, pos = s.pos;
  r.reset({ x: 4, z: 8, heading: 0.2, speed: 10 }); advance(r, 4); const safe = r.snapshot().safe;
  expect(safe.z).not.toBe(8); r.respawn('drop'); expect(r.state.pos.x).toBe(4); expect(r.state.pos.z).toBe(8); expect(r.state.speed).toBe(0);
  r.respawn('safe'); expect(r.state.pos.x).toBe(safe.x); expect(r.state.pos.z).toBe(safe.z); expect(r.state.speed).toBe(0);
  expect(r.state).toBe(s); expect(r.state.pos).toBe(pos);
});
it('safe points update only after consecutive stable ground time', () => {
  const r = createRide(plane()); r.reset({ x: 0, z: 0, heading: 0, speed: 10 }); advance(r, 2);
  const initial = JSON.stringify(r.snapshot().safe); advance(r, 2, { brake: 1 }); expect(JSON.stringify(r.snapshot().safe)).toBe(initial);
  const snap = r.snapshot(); snap.state.mode = 'air'; snap.state.pos.y = 100; snap.state.com.y = 100.8; snap.state.leg = 0.8; r.restore(snap);
  advance(r, 2); expect(JSON.stringify(r.snapshot().safe)).toBe(initial);
});
it('sustained rock exposure above 14m/s crashes with a reason', () => {
  const r = createRide(plane(0, 0, { snow: { rock: 1, packed: 0 } })); r.reset({ x: 0, z: 0, heading: 0, speed: 20 });
  let reason = ''; for (let i = 0; i < 40; i++) { r.step({}, 1 / 120); const e = r.events.find(e => e.type === 'crash'); if (e) reason = e.reason; }
  expect(reason).toBe('rock');
});
it('crash output bases stay orthonormal on changing surface normals', async () => {
  const { wave } = await import('./terrains.js'); const r = createRide(wave()), snap = r.snapshot();
  snap.state.mode = 'crash'; snap.state.vel.z = -10; r.restore(snap);
  for (let i = 0; i < 120; i++) {
    r.step({}, 1 / 120); const s = r.state;
    expect(s.fwd.x * s.up.x + s.fwd.y * s.up.y + s.fwd.z * s.up.z).toBeCloseTo(0, 10);
    expect(Math.hypot(s.right.x, s.right.y, s.right.z)).toBeCloseTo(1, 10);
  }
});
it('a crash on a steep 40 degree slope still comes to rest and recovers', () => {
  // 摩擦が一定だと tan(40°)=0.84 > 0.45 で止まらない。時間とともに強くつかむので止まる
  const r = createRide(plane(40 * Math.PI / 180, 0)); r.reset({ x: 0, z: 0, heading: 0, speed: 0 });
  const snap = r.snapshot(); snap.state.mode = 'crash'; snap.state.vel.z = -12; r.restore(snap);
  let recover = -1, peak = 0;
  for (let i = 0; i < 120 * 10; i++) {
    r.step({}, 1 / 120); peak = Math.max(peak, r.state.speed);
    if (r.events.some(e => e.type === 'recover')) { recover = (i + 1) / 120; break; }
  }
  expect(recover).toBeGreaterThan(0); expect(recover).toBeLessThan(8); expect(r.state.mode).toBe('carve'); expect(r.state.speed).toBeLessThan(0.5);
});
it('recovering next to an obstacle moves clear of it and can ride away', () => {
  // 木のすぐ山側で転ぶ。立ち上がったあと、押しつけられたまま止まらず、谷へ滑り出せること
  const slope = 25 * Math.PI / 180;
  const r = createRide(plane(slope, 0, { obstacles: [{ id: 1, type: 'tree', x: 0, y: -100, z: -6.2, radius: 0.4, height: 300 }] }));
  r.reset({ x: 0, z: 0, heading: 0, speed: 0 });
  const snap = r.snapshot(); snap.state.mode = 'crash'; snap.state.vel.z = -3; r.restore(snap);
  let recovered = false, collisions = 0;
  for (let i = 0; i < 120 * 12; i++) {
    r.step({}, 1 / 120);
    if (r.events.some(e => e.type === 'recover')) recovered = true;
    if (recovered) collisions += r.events.filter(e => e.type === 'collision').length;
  }
  expect(recovered).toBe(true); expect(collisions).toBeLessThan(3);
  expect(r.state.pos.z).toBeLessThan(-12); // 木（z=-6.2）より谷側へ抜けている
});
