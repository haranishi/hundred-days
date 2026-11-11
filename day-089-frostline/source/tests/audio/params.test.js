import { describe, it, expect } from 'vitest';
import { createAudioMemory, computeAudioParams } from '../../src/audio/params.js';
import { riding } from '../ride/fixtures.js';
function settled(state, seconds = 3) {
  const memory = createAudioMemory(), out = {};
  for (let i = 0; i < seconds * 60; i++) computeAudioParams(state, [], 1 / 60, memory, out);
  return out;
}
const channels = ['wind', 'glide', 'carve', 'skid', 'powder', 'ambient'];

describe('audio parameters', () => {
  it('increases wind monotonically with speed squared, reaching one at 30 m/s', () => {
    let previous = -1;
    for (const speed of [0, 3, 6, 10, 15, 20, 25, 30]) {
      const out = settled(riding({ speed })); expect(out.wind.gain).toBeGreaterThanOrEqual(previous);
      expect(out.wind.gain).toBeCloseTo((speed / 30) ** 2, 5); previous = out.wind.gain;
    }
    expect(previous).toBeGreaterThan(0.99);
  });
  it('fades every surface sound to zero in air with a 0.05s time constant', () => {
    const s = riding(); s.tele.edgeForce = 2000; s.tele.skidPower = 5000; s.snow.powder = 1;
    const m = createAudioMemory(), out = {}; computeAudioParams(s, [], 2, m, out);
    const before = out.glide.gain; s.mode = 'air'; computeAudioParams(s, [], 0.05, m, out);
    expect(out.glide.gain).toBeCloseTo(before * Math.exp(-1), 10);
    for (let i = 0; i < 120; i++) computeAudioParams(s, [], 1 / 60, m, out);
    for (const name of ['glide', 'carve', 'skid', 'powder']) expect(out[name].gain).toBeLessThan(1e-8);
    expect(out.wind.gain).toBeGreaterThan(0); expect(out.ambient.gain).toBeGreaterThan(0);
  });
  it('exchanges carve/skid levels and treats left and right forces equally', () => {
    const s = riding(); s.tele.edgeForce = 1800; const carve = settled(s);
    s.tele.edgeForce = -1800; const left = settled(s); expect(left.carve.gain).toBeCloseTo(carve.carve.gain, 10);
    s.tele.edgeForce = 0; s.tele.skidPower = 6000; const skid = settled(s);
    expect(carve.carve.gain).toBeGreaterThan(carve.skid.gain); expect(skid.skid.gain).toBeGreaterThan(skid.carve.gain);
    expect(carve.carve.freq).toBeGreaterThanOrEqual(800); expect(carve.carve.freq).toBeLessThanOrEqual(2500);
  });
  it('raises carve pitch/chatter on ice, lowers glide pitch and raises powder in fresh snow', () => {
    const s = riding(); s.tele.edgeForce = 1000; const packed = settled(s);
    s.snow.ice = 1; const ice = settled(s);
    expect(ice.carve.freq).toBeGreaterThan(packed.carve.freq); expect(ice.carve.chatter).toBeGreaterThanOrEqual(0.5);
    s.snow.ice = 0; s.snow.powder = 1; const powder = settled(s);
    expect(powder.glide.freq).toBeLessThan(packed.glide.freq); expect(powder.powder.gain).toBeGreaterThan(packed.powder.gain);
  });
  it('emits one pooled impact per land/crash event, resets each call, and scales with efh', () => {
    const s = riding(), m = createAudioMemory(), out = {};
    const events = [{ type: 'land', efh: 0.2 }, { type: 'edgeSwitch' }, { type: 'land', efh: 2 }, { type: 'crash' }];
    computeAudioParams(s, events, 1 / 60, m, out); expect(out.impacts.length).toBe(3);
    const first = out.impacts[0], array = out.impacts;
    expect(out.impacts[1].gain).toBeGreaterThan(first.gain); expect(out.impacts[2].duration).toBeGreaterThan(out.impacts[1].duration);
    for (const impact of out.impacts) { expect(impact.gain).toBeGreaterThanOrEqual(0); expect(impact.gain).toBeLessThanOrEqual(1); expect(impact.freq).toBeGreaterThanOrEqual(60); expect(impact.freq).toBeLessThanOrEqual(90); }
    computeAudioParams(s, [{ type: 'land', efh: 0.2 }], 1 / 60, m, out); expect(out.impacts[0]).toBe(first);
    computeAudioParams(s, [], 1 / 60, m, out); expect(out.impacts).toBe(array); expect(out.impacts.length).toBe(0);
  });
  it('supports reserving a larger event pool outside the frame loop without truncating events', () => {
    const m = createAudioMemory(), out = {}, s = riding(); m.reserveImpacts(1100);
    const events = Array.from({ length: 1100 }, () => ({ type: 'land', efh: 1 }));
    computeAudioParams(s, events, 0.1, m, out); expect(out.impacts.length).toBe(1100);
  });
  it('keeps gains in range and preserves supplied output containers and state', () => {
    const s = riding({ speed: 80, load: 12, yawRate: 8 }); s.tele.edgeForce = 1e6; s.tele.skidPower = 1e9;
    const before = JSON.stringify(s), m = createAudioMemory(), out = { wind: {}, glide: {}, carve: {}, skid: {}, powder: {}, ambient: {}, impacts: [] };
    const wind = out.wind, impacts = out.impacts; computeAudioParams(s, [], 1, m, out);
    for (const channel of channels) { expect(out[channel].gain).toBeGreaterThanOrEqual(0); expect(out[channel].gain).toBeLessThanOrEqual(1); }
    expect(out.wind.pan).toBeLessThanOrEqual(1); expect(out.wind).toBe(wind); expect(out.impacts).toBe(impacts); expect(JSON.stringify(s)).toBe(before);
  });
  it('smooths pitch/gain and is frame independent for constant targets', () => {
    const s = riding({ speed: 30 }), m = createAudioMemory(), a = {}, b = {};
    computeAudioParams(s, [], 0, m, a); const initial = a.wind.gain;
    computeAudioParams(s, [], 1 / 60, m, a); expect(a.wind.gain).toBeGreaterThan(initial); expect(a.wind.gain).toBeLessThan(1);
    const n = createAudioMemory(); for (let i = 0; i < 60; i++) computeAudioParams(s, [], 1 / 60, n, a);
    computeAudioParams(s, [], 1, createAudioMemory(), b); expect(a.wind.gain).toBeCloseTo(b.wind.gain, 10);
  });
});
