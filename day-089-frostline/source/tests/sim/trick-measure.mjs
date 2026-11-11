// NODE_OPTIONS=--max-old-space-size=1536 node tests/sim/trick-measure.mjs
import { createRide } from '../../src/sim/index.js';
import { validState } from '../../src/sim/state.js';
import { advance, hash } from './helpers.js';
import { ride, slope } from './feel-helpers.js';
import { DEG, flight, popFlight, brakeMeasure, releaseMeasure } from './trick-helpers.js';
const print = (id, value) => console.log(`${id} ${JSON.stringify(value)}`);
const gate = flight(); gate.step({ jump: true, steer: 1, tuck: 1 }, 0.12);
const unarmed = flight(); advance(unarmed, 0.5, { steer: 1, tuck: 1 });
print(1, { gateSeconds: gate.state.air.time, spinAtGateDeg: gate.state.air.spin / DEG, flipAtGateDeg: gate.state.air.flip / DEG, unarmedSpinDeg: unarmed.state.air.spin / DEG, unarmedFlipDeg: unarmed.state.air.flip / DEG });
const spin = [false, true].map(jump => {
  const r = flight({ time: 0.12, pop: true, seed: 1 }); advance(r, 0.15, { jump, steer: 1 }); const at150ms = r.state.yawRate / DEG;
  advance(r, 0.3, { jump, steer: 1 }); return { jump, at150ms, steadyDegPerSec: r.state.yawRate / DEG };
});
const damping = flight({ time: 0.12, heading: 90 * DEG }); advance(damping, 0.4, { jump: true, steer: 1 }); const before = damping.snapshot().memory.spin; advance(damping, 0.25);
const assist = flight({ time: 0.2, heading: 160 * DEG }); assist.step({}, 1 / 240); const assistSpeed = assist.state.yawRate / DEG; advance(assist, 0.3);
const early = flight(); early.step({ jump: true, steer: 1, tuck: 1 }, 0.15);
print(2, { inputFromTakeoffAt150msDegPerSec: early.state.yawRate / DEG, spin, rateAfter250msPercent: Math.abs(damping.snapshot().memory.spin / before) * 100, assistDegPerSec: assistSpeed, assistHeadingDeg: assist.state.heading / DEG });
const flips = [1, -1].map(sign => { const r = flight({ time: 0.12 }); const c = { jump: true, steer: 1, tuck: sign > 0 ? 1 : 0, brake: sign < 0 ? 1 : 0 };
  advance(r, 0.15, c); const at150ms = r.snapshot().memory.flipRate / DEG; advance(r, 0.3, c); return { at150ms, steadyDegPerSec: r.snapshot().memory.flipRate / DEG };
});
const straight = flight(), rotated = flight(); advance(straight, 1, { jump: true }); advance(rotated, 1, { jump: true, steer: 1, tuck: 1 });
print(3, { inputFromTakeoffAt150msDegPerSec: early.snapshot().memory.flipRate / DEG, flips, comDifferenceM: Math.hypot(straight.state.com.x - rotated.state.com.x, straight.state.com.y - rotated.state.com.y, straight.state.com.z - rotated.state.com.z) });
const grabs = [0, -1, 1].map(steer => { const r = flight(); advance(r, 0.3, { jump: true, steer }, 240); const crouch = r.state.crouch; advance(r, 0.2); return { kind: r.state.air.grab, seconds: r.state.air.grabTime, crouch, releasedCrouch: r.state.crouch }; });
print(4, grabs);
function inverted(angle) {
  const r = flight({ time: 0.2, flip: angle * DEG }); const snap = r.snapshot(); snap.state.com.y = Math.max(0.45, 0.8 * Math.cos(angle * DEG)) + 0.001; snap.state.vel.y = -2; r.restore(snap); r.step({}, 1 / 240);
  return { degrees: angle, quality: r.events.find(e => e.type === 'land')?.quality, reason: r.events.find(e => e.type === 'crash')?.reason ?? '', boardClearanceM: r.state.pos.y };
}
const short = popFlight(0.12), full = popFlight(0.8);
print(5, { shortAirSeconds: short.air, fullAirSeconds: full.air, fullQuality: full.quality, fullEfhM: full.efh, launchNormalMps: full.launch, landings: [10, 35, 60, 180].map(inverted) });
const legacy = flight(), old = legacy.snapshot(); for (const key of ['flip', 'grab', 'grabTime']) delete old.state.air[key]; delete old.memory.flipRate; advance(legacy, 0.4, { jump: true, tuck: 1 }); legacy.restore(old);
print(6, { landPayloadFields: ['spin', 'flip', 'grab', 'grabTime', 'air', 'drop', 'pop', 'switchIn', 'switchOut'].filter(key => Object.hasOwn(full, key)).length, legacyDefaults: [legacy.state.air.flip, legacy.state.air.grab, legacy.state.air.grabTime, legacy.snapshot().memory.flipRate] });
const fullBrake = brakeMeasure(), halfBrake = brakeMeasure(0.5), stop = brakeMeasure(1, 60 / 3.6), release = releaseMeasure();
const terrain = slope(20, { packed: 1, powder: 0, ice: 0 }), skidding = ride(terrain, 28), neutral = ride(terrain, 28); advance(skidding, 2, { steer: 1 }); advance(neutral, 2);
print(7, { speedAt300msPercent: fullBrake.early / 12 * 100, speedAt1sPercent: fullBrake.second / 12 * 100, stopDistanceM: stop.distance, halfDecelerationPercent: (12 - halfBrake.second) / (12 - fullBrake.second) * 100, release, skidSpeedDifferenceMps: neutral.state.speed - skidding.state.speed, spray: skidding.state.tele.spray });
const rates = [60, 120].map(hz => { const r = flight(); advance(r, 0.75, { jump: true, steer: 1, brake: 1 }, hz); return r; });
const saved = rates[0].snapshot(); advance(rates[0], 0.3); const expected = hash(rates[0].snapshot()); rates[0].restore(saved); advance(rates[0], 0.3);
let finite = 0;
for (let angle = -180; angle <= 180; angle += 15) { const r = flight({ flip: angle * DEG, height: 0.05, time: 0.2 }); for (let i = 0; i < 240; i++) { r.step({}, 1 / 240); if (r.state.mode !== 'air') break; } if (validState(r.state) && r.state.pos.y >= 0) finite++; }
const at60 = saved.state.air, at120 = rates[1].state.air;
print(8, { spinDifferencePercent: Math.abs(at60.spin / at120.spin - 1) * 100, flipDifferencePercent: Math.abs(at60.flip / at120.flip - 1) * 100, exactRestore: hash(rates[0].snapshot()) === expected, finiteLandings: finite, testedLandings: 25 });
