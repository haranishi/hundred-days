// NODE_OPTIONS=--max-old-space-size=1536 node tests/sim/feel-measure.mjs
import { snow, slope, ride, trace, jump } from './feel-helpers.js';
import { wave, kicker } from './terrains.js';
import { advance } from './helpers.js';
import { createRide } from '../../src/sim/index.js';
const results = {};
results.T1 = [[22, 1.5], [12, 1]].map(([speed, time]) => {
  const t = trace(ride(slope(20), speed), time, { steer: 1 });
  return { speed, degrees: t.angle, breaks: t.events.filter(e => e.type === 'carveBreak').length };
});
const smooth = trace(ride(slope(20), 22), 2, { steer: 1 });
const rough = trace(ride(wave(0.05, 14, Math.tan(Math.PI / 9), { snow }), 22), 2, { steer: 1 });
const rates = rough.samples.slice(36).map(s => s.rate), mean = rates.reduce((a, b) => a + b, 0) / rates.length;
let longest = 0, run = 0;
for (const rate of rates) { run = rate < mean / 2 ? run + 1 / 120 : 0; longest = Math.max(longest, run); }
results.T2 = { smooth: smooth.angle, rough: rough.angle, ratio: rough.angle / smooth.angle, longest };
results.T3 = [-1, 1, 0, 0.25].map(steer => ({ steer, direction: steer < 0 ? 'valley' : steer === 0.25 ? 'hold' : steer > 0 ? 'mountain' : 'drift', degrees: trace(ride(slope(25), 15, Math.PI / 2), steer === 0.25 ? 2 : steer ? 0.5 : 3, { steer }).angle }));
const terrain = slope(0, { packed: 1, powder: 0, ice: 0 }), r = ride(terrain, 22);
advance(r, 1, { steer: 1 }); const before = { speed: r.state.speed, rate: r.state.yawRate };
terrain.curvatureAlong = () => -0.013; const drift = trace(r, 0.5, { steer: 1 }), skids = drift.samples.filter(s => s.mode === 'skid');
results.T4 = { turnRatio: Math.min(...skids.map(s => s.rate)) / before.rate, minSpray: Math.min(...skids.map(s => s.spray)), beforeSpeed: before.speed, afterSpeed: r.state.speed,
  snowAngles: ['packed', 'powder', 'ice'].map(kind => ({ kind, degrees: trace(ride(slope(20, { packed: 0, powder: 0, ice: 0, [kind]: 1 }), 22), 1.5, { steer: 1 }).angle })) };
results.T5 = [];
for (const [degrees, speed, cover, brake, duration] of [[35, 25, snow, 1, 2], [35, 25, snow, 0.3, 2], [25, 25, { packed: 0, powder: 0, ice: 1 }, 1, 2], [25, 25, { packed: 1, powder: 0, ice: 0 }, 1, 2]]) {
  const r = ride(slope(degrees, cover), speed); advance(r, duration, { brake }); results.T5.push({ degrees, brake, ice: cover.ice, endSpeed: r.state.speed });
}
const stop = ride(slope(15, { packed: 1, powder: 0, ice: 0 }), 15); let stopTime = 0;
while (stop.state.speed > 0.5 && stopTime < 2.5) { stop.step({ brake: 1 }, 1 / 120); stopTime += 1 / 120; }
results.T5.push({ degrees: 15, stopTime, endSpeed: stop.state.speed });
const originalBrake = createRide(slope(35), { params: { skidDynamic: 0.8, snow: { packed: { lambda: 1.8 }, powder: { lambda: 1.1 } } } });
originalBrake.reset({ x: 0, z: 0, heading: 0, speed: 25 }); advance(originalBrake, 2, { brake: 1 }); results.T5OriginalCoefficients = originalBrake.state.speed;
const crest = ride(kicker(1, 12, 0, { snow }), 28, Math.PI / 2); crest.reset({ x: -18, z: 0, heading: Math.PI / 2, speed: 28 });
results.T6 = trace(crest, 2, { steer: 1 }).events.filter(e => ['takeoff', 'land', 'crash'].includes(e.type)).map(e => ({ type: e.type, time: e.time, pop: e.pop, yawDeg: e.yawDeg, quality: e.quality, reason: e.reason }));
results.T7 = [30, 60].map(degrees => {
  const r = ride(slope(degrees), 33), s = r.snapshot(); s.state.mode = 'crash'; r.restore(s); let time = 0;
  while (r.state.speed > 1 && time < 20) { r.step({}, 1 / 120); time += 1 / 120; }
  return { degrees, time, speed: r.state.speed };
});
results.T8 = [{ tuck: 1 }, {}, { tuck: 1, brake: 1 }, { tuck: 1, brake: 0.03 }].map(controls => {
  const r = ride(slope(0, { packed: 0, powder: 1, ice: 0 }), 0); advance(r, 3, controls); const at3 = r.state.speed;
  const t = trace(r, 15, controls); return { controls, at3, max: Math.max(at3, ...t.samples.map(s => s.speed)) };
});
const safe = ride(slope(0), 12); advance(safe, 3.1); const moving = { ...safe.snapshot().safe };
advance(safe, 5, { brake: 1 }); advance(safe, 5); const stopped = { ...safe.snapshot().safe }; safe.respawn('safe');
results.T9 = { moving, stopped, respawn: { ...safe.state.pos } };
results.T10 = { short: jump(0.15), long: jump(0.8), tap: jump(0.1) }; results.T10.ratio = results.T10.long.time / results.T10.short.time;
const hidden = ride(slope(0, { ...snow, rock: 0.3 }), 25), hiddenTrace = trace(hidden, 3, {});
results.T11 = { hiddenSpeed: hidden.state.speed, hiddenCrashes: hiddenTrace.events.filter(e => e.type === 'crash').length, visibleCrashTime: trace(ride(slope(0, { ...snow, rock: 0.9 }), 25), 0.4, {}).events.find(e => e.type === 'crash')?.time };
console.log(JSON.stringify(results, null, 2));
