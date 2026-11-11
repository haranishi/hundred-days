import { it, expect } from 'vitest';
import { advance } from './helpers.js';
import { ride, slope } from './feel-helpers.js';
import { brakeMeasure, releaseMeasure } from './trick-helpers.js';
it('7.1: full brake retains >=85% at 0.3s and 40..65% at 1s from 12m/s on 15° packed', () => {
  const m = brakeMeasure(); expect(m.early / 12).toBeGreaterThanOrEqual(0.85);
  expect(m.second / 12).toBeGreaterThanOrEqual(0.4); expect(m.second / 12).toBeLessThanOrEqual(0.65);
});
it('7.2: 60km/h stop takes 18..26m and half brake gives 40..65% of full 1s deceleration', () => {
  const stop = brakeMeasure(1, 60 / 3.6); expect(stop.speed).toBeLessThanOrEqual(0.25);
  expect(stop.distance).toBeGreaterThanOrEqual(18); expect(stop.distance).toBeLessThanOrEqual(26);
  const ratio = (12 - brakeMeasure(0.5).second) / (12 - brakeMeasure().second);
  expect(ratio).toBeGreaterThanOrEqual(0.4); expect(ratio).toBeLessThanOrEqual(0.65);
});
it('7.3: released traverse stop rotates <=100°/s and reaches downhill +/-20° at 0.9..2s', () => {
  const m = releaseMeasure(); expect(m.rate).toBeLessThanOrEqual(100 + 1e-5); expect(m.aligned).toBeGreaterThanOrEqual(0.9); expect(m.aligned).toBeLessThanOrEqual(2);
});
it('7.4: 28m/s full steer on 20° packed dissipates >=4m/s more than neutral, with spray >=0.3', () => {
  const terrain = slope(20, { packed: 1, powder: 0, ice: 0 }), a = ride(terrain, 28), b = ride(terrain, 28);
  advance(a, 2, { steer: 1 }); advance(b, 2);
  expect(b.state.speed - a.state.speed).toBeGreaterThanOrEqual(4); expect(a.state.tele.spray).toBeGreaterThanOrEqual(0.3);
});
it('7.3: a supported stopped board keeps its heading while full brake remains held', () => {
  const r = ride(slope(20, { packed: 1, powder: 0, ice: 0 }), 15, Math.PI / 2);
  for (let i = 0; i < 2400 && r.state.speed > 0.25; i++) r.step({ brake: 1 }, 1 / 240);
  const before = { ...r.state.fwd }; advance(r, 3, { brake: 1 });
  const angle = Math.acos(Math.min(1, before.x * r.state.fwd.x + before.y * r.state.fwd.y + before.z * r.state.fwd.z));
  expect(angle * 180 / Math.PI).toBeLessThanOrEqual(1); expect(r.state.speed).toBe(0);
});
