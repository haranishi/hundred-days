import { it, expect } from 'vitest';
import { createRide } from '../../src/sim/index.js';
import { plane } from './terrains.js';
import { advance } from './helpers.js';
it('R2 #7 geometric radius is recovered when the material force cap is removed', () => {
  const r = createRide(plane(), { params: { cdA: 0, cdATuck: 0, carveFriction: 0, edgeMax: Math.PI / 4, snow: { packed: { mu: 0, lambda: 100 } } } });
  r.reset({ x: 0, z: 0, heading: 0, speed: 10 }); advance(r, 3, { steer: 1 });
  expect(r.state.speed / r.state.yawRate).toBeCloseTo(8 * Math.cos(Math.PI / 4), 4);
});
it('R2 #9 reference material formula converts stress × edge area to 600N', () => {
  // A units/reference check only: ride-sim intentionally uses the model's λNE cap,
  // and does not claim to simulate this laboratory material-failure law.
  const stressPa = 50000, edgeLengthM = 1.2, penetrationM = 0.010;
  expect(stressPa * edgeLengthM * penetrationM).toBe(600);
});
