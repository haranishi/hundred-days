import { it, expect } from 'vitest';
import { createRide } from '../../src/sim/index.js';
import { plane } from './terrains.js';
it('powder sinks deeper and slows more than packed snow; rock slows hardest', () => {
  const rides = [];
  for (const kind of ['packed', 'powder', 'rock']) {
    const r = createRide(plane(0, 0, { snow: { packed: 0, [kind]: 1 } })); r.reset({ x: 0, z: 0, heading: 0, speed: 10 });
    for (let i = 0; i < 120; i++) r.step({}, 1 / 120); rides.push(r);
  }
  expect(rides[1].state.sink).toBeGreaterThan(rides[0].state.sink);
  expect(rides[1].state.speed).toBeLessThan(rides[0].state.speed); expect(rides[2].state.speed).toBeLessThan(rides[1].state.speed);
});
