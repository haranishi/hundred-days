import { smoothTo } from '../render/ride/springs.js';
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const CHANNELS = ['wind', 'glide', 'carve', 'skid', 'powder', 'ambient'];
const FIELDS = [['gain', 'freq', 'pan'], ['gain', 'freq'], ['gain', 'freq', 'chatter'], ['gain', 'freq'], ['gain'], ['gain']];
function values() {
  return { wind: { gain: 0, freq: 300, pan: 0 }, glide: { gain: 0, freq: 220 }, carve: { gain: 0, freq: 800, chatter: 0 },
    skid: { gain: 0, freq: 300 }, powder: { gain: 0 }, ambient: { gain: 0 } };
}
/** Reserve only at setup, never in computeAudioParams. Default covers eight full sim event pools.
 * Consumers copy impact numbers before retaining them past the next compute call.
 */
function reserveImpacts(capacity) {
  for (let i = this.impactPool.length; i < capacity; i++) this.impactPool.push({ gain: 0, freq: 60, noise: 0, duration: 0 });
}
export function createAudioMemory() {
  const memory = { current: values(), targets: values(), impacts: [], impactPool: [], reserveImpacts,
    capacityError: new RangeError('Reserve more impacts with memory.reserveImpacts(count) before the frame loop') };
  memory.reserveImpacts(1024); return memory;
}
/** Pure, allocation-free parameter update. Missing out channels are attached from memory at first use. */
export function computeAudioParams(state, events, dt, memory, out) {
  const s = state, m = memory, t = m.targets, speed = Math.max(0, s.speed), ratio = clamp(speed / 30);
  let impactCount = 0;
  for (let i = 0; i < events.length; i++) if (events[i].type === 'land' || events[i].type === 'crash') impactCount++;
  if (impactCount > m.impactPool.length) throw m.capacityError;
  const ice = clamp(s.snow.ice), powder = clamp(s.snow.powder), load = clamp(s.load, 0, 2);
  const ground = s.mode === 'air' ? 0 : 1;
  // I4: initial synthesis gains, to tune with engine.js and actual listening.
  t.wind.gain = clamp((speed / 30) ** 2); t.wind.freq = 300 + ratio * 1700; t.wind.pan = clamp(s.yawRate * 0.25, -1, 1);
  t.glide.gain = clamp(ratio * load * 0.65) * ground;
  t.glide.freq = clamp(220 + speed * 12 + ice * 900 - powder * 180, 80, 1800);
  // edgeForce is signed in ride-sim; either turn direction must sound equally loud.
  t.carve.gain = clamp(Math.abs(s.tele.edgeForce) * speed / 60000) * ground;
  t.carve.freq = clamp(800 + ratio * 1000 + ice * 700, 800, 2500); t.carve.chatter = ice * 0.8;
  t.skid.gain = clamp(s.tele.skidPower / 10000) * ground; t.skid.freq = 300 + Math.sqrt(clamp(s.tele.skidPower / 10000)) * 3700;
  t.powder.gain = clamp(powder * ratio * load * 0.8) * ground; t.ambient.gain = 0.035;
  for (let i = 0; i < CHANNELS.length; i++) {
    const name = CHANNELS[i], current = m.current[name], target = t[name], dst = out[name] || (out[name] = current), fields = FIELDS[i];
    for (let k = 0; k < fields.length; k++) {
      const key = fields[k], tau = key === 'gain' ? (i > 0 && i < 5 && !ground ? 0.05 : 0.10) : 0.12;
      let value = smoothTo(current[key], target[key], tau, dt);
      if (key === 'gain') { value = clamp(value); if (target[key] === 0 && value < 1e-10) value = 0; }
      current[key] = value; dst[key] = value;
    }
  }
  const impacts = out.impacts || (out.impacts = m.impacts); impacts.length = 0;
  let index = 0;
  for (let i = 0; i < events.length; i++) {
    const e = events[i]; if (e.type !== 'land' && e.type !== 'crash') continue;
    const crash = e.type === 'crash', level = clamp((e.efh || (crash ? s.tele.lastImpact : 0)) / 4);
    const impact = m.impactPool[index++];
    impact.gain = crash ? clamp(0.75 + level * 0.25 + speed / 120) : clamp(Math.max(0, e.efh) * 0.4);
    impact.freq = 90 - level * 30; impact.noise = crash ? 0.85 : 0.35 + level * 0.35;
    impact.duration = crash ? 0.45 + level * 0.25 : 0.12 + level * 0.10;
    impacts.push(impact);
  }
  return out;
}
