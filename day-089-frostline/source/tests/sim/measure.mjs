// Run after Vitest: NODE_OPTIONS=--max-old-space-size=1536 node tests/sim/measure.mjs
import { terminal, constantBrake, dropImpact, defaultBrake, popHeight, endurance } from './measurements.js';
import { createParams } from '../../src/sim/params.js';
import { snowSupport } from '../../src/sim/snow.js';
const results = {
  terminals: [[20, 0.6], [30, 0.6], [40, 0.6], [30, 0.3]].map(([angle, cdA]) => ({ angle, cdA, ...terminal(angle, cdA) })),
  constantBrake: [0, 20, 30].map(angle => ({ angle, ...constantBrake(angle) })),
  drops: [60, 120, 240].map(hz => ({ hz, ...dropImpact(hz) })),
  defaultBrake: [0, 20].map(angle => ({ angle, ...defaultBrake(angle) })), popHeight: popHeight(),
  powderSupport: snowSupport(0.1, 10, 8000, createParams()),
};
// Warm JIT before measuring; wall-clock maxima also include OS scheduling/GC pauses.
endurance(); const timing = endurance(true);
results.timing = { averageUs: timing.averageUs, maxUs: timing.maxUs, steps: 36000, airborneSteps: timing.airborneSteps, crashSteps: timing.crashSteps, skidSteps: timing.skidSteps, numeric: timing.numeric };
console.log(JSON.stringify(results, null, 2));
