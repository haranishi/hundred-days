import { it, expect } from 'vitest';
import { createRide } from '../../src/sim/index.js';
import { plane } from './terrains.js';
function hit(speed, kind = 'tree', x = 0) {
  const obstacle = { id: 1, type: kind, x, y: 0, z: -1, radius: 0.3, height: 5 };
  const r = createRide(plane(0, 0, { obstacles: [obstacle] }), { params: { cdA: 0, cdATuck: 0, snow: { packed: { mu: 0 } } } });
  r.reset({ x: 0, z: 0, heading: 0, speed }); return r;
}
for (const [kind, threshold] of [['tree', 6], ['rock', 5]]) it(`${kind} collision threshold is based on normal impact speed`, () => {
  for (const delta of [-0.01, 0.01]) {
    const r = hit(threshold + delta, kind); let collision = false, crashed = false;
    for (let i = 0; i < 120; i++) {
      r.step({}, 1 / 240);
      if (r.events.some(e => e.type === 'collision' && e.obstacleType === kind)) collision = true;
      if (r.events.some(e => e.type === 'crash' && e.reason === kind)) crashed = true;
    }
    expect(collision).toBe(true); expect(crashed).toBe(delta > 0);
  }
});
it('a glancing tree contact deflects and dissipates without a crash', () => {
  const r = hit(8, 'tree', 0.6); let collision = false, crashed = false, vx = 0;
  for (let i = 0; i < 120; i++) { r.step({}, 1 / 240); if (r.events.some(e => e.type === 'collision')) { collision = true; vx = r.state.vel.x; } if (r.state.mode === 'crash') crashed = true; }
  expect(collision).toBe(true); expect(crashed).toBe(false); expect(vx).toBeLessThan(0); expect(r.state.speed).toBeLessThan(8);
});
it('swept contacts do not tunnel through a trunk at high speed', () => {
  const r = hit(480); r.step({}, 1 / 240); expect(r.events.some(e => e.type === 'collision')).toBe(true); expect(r.state.mode).toBe('crash');
});
it('airborne riders above an obstacle do not collide', () => {
  const r = hit(10), snap = r.snapshot(); snap.state.mode = 'air'; snap.state.pos.y = 10; snap.state.com.y = 10.8; snap.state.leg = 0.8; r.restore(snap);
  for (let i = 0; i < 40; i++) { r.step({}, 1 / 240); expect(r.events.some(e => e.type === 'collision')).toBe(false); }
});
it('the boundary stops the rider and emits once on entry', () => {
  const r = createRide(plane(0, 0, { half: 100 })); r.reset({ x: 0, z: -39, heading: 0, speed: 20 }); let bounds = 0;
  for (let i = 0; i < 240; i++) { r.step({}, 1 / 120); bounds += r.events.filter(e => e.type === 'bounds').length; }
  expect(bounds).toBe(1); expect(r.state.speed).toBe(0); expect(r.state.pos.z).toBeGreaterThan(-100);
});
