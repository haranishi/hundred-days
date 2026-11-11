import { describe, it, expect, vi } from 'vitest';
import { buildGraph, applyParams, createAudio, VOICE_GAIN } from '../../src/audio/engine.js';
import { createAudioMemory, computeAudioParams } from '../../src/audio/params.js';
import { FakeAudioContext, fakeClock } from './fake-audio.js';
import { riding } from '../ride/fixtures.js';

// 聞こえ方の調整（試聴）で値を変えるたびに試験を直さずに済むよう、係数は実装の値をそのまま使う
const coefficients = VOICE_GAIN;
const last = (param, method = 'setTargetAtTime') => param.calls.filter(call => call.method === method).at(-1);
function setup() {
  const ctx = new FakeAudioContext(), clock = fakeClock(), createContext = vi.fn(() => ctx);
  const audio = createAudio({ createContext, ...clock });
  const frame = { state: riding(), events: [], frameDt: 1 / 60, settings: { volume: 1, muted: false } };
  const master = () => ctx.nodes.find(node => node.kind === 'gain');
  const advance = ms => { clock.advance(ms); ctx.advance(ms / 1000); clock.tick(); };
  return { ctx, clock, createContext, audio, frame, master, advance };
}

describe('WebAudio graph', () => {
  it('shares one deterministic two-second noise buffer with distinct loop offsets', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw Error('非決定的な乱数'); });
    try {
      const a = buildGraph(new FakeAudioContext()), b = buildGraph(new FakeAudioContext());
      expect(a.ctx.buffers.length).toBe(1); expect(a.noiseBuffer.duration).toBe(2);
      const av = a.noiseBuffer.getChannelData(0), bv = b.noiseBuffer.getChannelData(0);
      expect(av.length).toBe(96000);
      for (let i = 0; i < av.length; i++) if (av[i] !== bv[i] || Math.abs(av[i]) > 1) throw Error(`雑音不一致: ${i}`);
      const sources = Object.values(a.voices).map(v => v.source);
      expect(new Set(sources.map(source => source.starts[0].offset)).size).toBe(6);
      for (const source of sources) { expect(source.buffer).toBe(a.noiseBuffer); expect(source.loop).toBe(true); }
    } finally { random.mockRestore(); }
  });
  it('routes six voices, rumble, bounded chatter and compression to the destination', () => {
    const ctx = new FakeAudioContext(), g = buildGraph(ctx), v = g.voices;
    for (const name of ['wind', 'glide', 'carve', 'skid']) {
      expect(v[name].filter.type).toBe('bandpass');
      expect(v[name].filter.Q.value).toBe({ wind: 0.7, glide: 1, carve: 3, skid: 0.9 }[name]);
    }
    expect(v.wind.source.connections).toContain(v.wind.rumbleFilter);
    expect(v.wind.rumbleFilter.frequency.value).toBe(120); expect(v.wind.rumble.connections).toContain(v.wind.pan);
    expect(v.wind.gain.connections).toContain(v.wind.pan); expect(v.wind.pan.connections).toContain(g.master);
    expect(v.skid.highpass.type).toBe('highpass'); expect(v.skid.source.connections).toContain(v.skid.highpass);
    expect(v.skid.highpass.connections).toContain(v.skid.filter);
    expect(v.powder.filter.frequency.value).toBe(650); expect(v.ambient.filter.frequency.value).toBe(220);
    expect(v.carve.lfo.frequency.value).toBe(28); expect(v.carve.depth.connections).toContain(v.carve.modulation.gain);
    expect(v.carve.gain.connections).toContain(v.carve.modulation);
    expect(g.master.connections).toContain(g.compressor); expect(g.compressor.connections).toContain(ctx.destination);
    expect(g.compressor.threshold.value).toBe(-14); expect(g.compressor.ratio.value).toBe(4);
  });
  it('applies gains, frequencies, pan and chatter smoothly at the supplied context time', () => {
    const g = buildGraph(new FakeAudioContext()), s = riding({ yawRate: 2 });
    s.snow.ice = 1; s.snow.powder = 0.6; s.tele.edgeForce = 2000; s.tele.skidPower = 9000;
    const params = computeAudioParams(s, [], 2, createAudioMemory(), {});
    applyParams(g, params, 1.25);
    for (const [name, coefficient] of Object.entries(coefficients)) {
      expect(last(g.voices[name].gain.gain)).toEqual({ method: 'setTargetAtTime', value: params[name].gain * coefficient, time: 1.25, timeConstant: 0.03 });
      if (params[name].freq !== undefined) expect(last(g.voices[name].filter.frequency).value).toBe(params[name].freq);
    }
    expect(last(g.voices.wind.pan.pan).value).toBe(params.wind.pan);
    expect(last(g.voices.wind.rumble.gain).value).toBe(params.wind.gain * 0.025);
    expect(last(g.voices.skid.highpass.frequency).value).toBe(params.skid.freq * 0.5);
    expect(last(g.voices.carve.depth.gain).value).toBe(params.carve.chatter * 0.5);
    expect(last(g.voices.carve.modulation.gain).value).toBe(1 - params.carve.chatter * 0.5);
  });
  it('copies impact numbers into automation and disconnects every temporary node on completion', () => {
    const ctx = new FakeAudioContext(), g = buildGraph(ctx);
    const params = computeAudioParams(riding(), [{ type: 'land', efh: 1.5 }], 1, createAudioMemory(), {});
    applyParams(g, params, 0.2);
    const voice = g.impacts[0], impact = { ...params.impacts[0] };
    expect(voice.sine.frequency.calls[0].value).toBe(impact.freq);
    expect(last(voice.sine.frequency, 'exponentialRampToValueAtTime').value).toBe(impact.freq * 0.4);
    expect(voice.nodes.find(n => n.kind === 'biquad').frequency.valueAtTime(0.2)).toBe(900);
    params.impacts[0].duration = 10;
    ctx.advance(0.2 + impact.duration);
    expect(g.impacts.length).toBe(0);
    for (const node of voice.nodes) expect(node.disconnects).toBe(1);
  });
});

describe('game audio lifecycle', () => {
  it('calculates before resume without creating a context or timer', () => {
    const { audio, createContext, clock, frame } = setup();
    for (let i = 0; i < 20; i++) audio.update(frame);
    expect(createContext).not.toHaveBeenCalled(); expect(clock.intervals.size).toBe(0);
    expect(audio.debug().running).toBe(false); expect(audio.debug().lastParams.wind.gain).toBeGreaterThan(0);
  });
  it('starts lazily, applies computed voice gains after resume and never replays old impacts', async () => {
    const { audio, createContext, ctx, frame } = setup();
    audio.update({ ...frame, events: [{ type: 'land', efh: 2 }] });
    await audio.resume(); await audio.resume(); expect(createContext).toHaveBeenCalledTimes(1);
    expect(audio.debug()).toMatchObject({ running: true, voices: 0 });
    audio.update(frame);
    const params = audio.debug().lastParams;
    const voiceGains = ctx.nodes.filter(node => node.kind === 'gain' && node.gain.calls.some(call => call.method === 'setTargetAtTime'));
    for (const [name, coefficient] of Object.entries(coefficients)) {
      expect(voiceGains.some(node => last(node.gain).value === params[name].gain * coefficient)).toBe(true);
    }
    audio.dispose();
  });
  it('squares volume and respects mute, including settings supplied before resume', async () => {
    const { audio, frame, master } = setup(); frame.settings.volume = 0.5;
    audio.update(frame); await audio.resume(); audio.update(frame);
    expect(last(master().gain).value).toBe(0.25);
    audio.update({ ...frame, settings: { volume: 1, muted: true } }); expect(last(master().gain).value).toBe(0);
    audio.dispose();
  });
  it('watches every 100 ms, fades after 250 ms and preserves the 100 ms recovery across updates', async () => {
    const { audio, frame, master, clock, advance } = setup(); await audio.resume(); audio.update(frame);
    expect([...clock.intervals.values()][0].ms).toBe(100);
    advance(249); expect(last(master().gain, 'linearRampToValueAtTime')).toBeUndefined();
    advance(1); expect(last(master().gain, 'linearRampToValueAtTime')).toMatchObject({ value: 0, time: 0.4 });
    const calls = master().gain.calls.length; advance(150); expect(master().gain.value).toBeCloseTo(0);
    expect(master().gain.calls.length).toBe(calls);
    audio.update(frame); expect(last(master().gain, 'linearRampToValueAtTime')).toMatchObject({ value: 1, time: 0.5 });
    advance(50); expect(master().gain.value).toBeCloseTo(0.5); audio.update(frame);
    expect(last(master().gain, 'linearRampToValueAtTime').time).toBe(0.5);
    advance(50); expect(master().gain.value).toBeCloseTo(1); audio.dispose();
  });
  it('recovers to the current squared volume or mute instead of an old setting', async () => {
    const { audio, frame, master, advance } = setup(); await audio.resume(); audio.update(frame);
    advance(400); audio.update({ ...frame, settings: { volume: 0.5 } });
    expect(last(master().gain, 'linearRampToValueAtTime').value).toBe(0.25);
    advance(400); audio.update({ ...frame, settings: { muted: true, volume: 1 } });
    expect(last(master().gain, 'linearRampToValueAtTime').value).toBe(0); audio.dispose();
  });
  it('cancels the previous recovery ramp if mute changes while recovery is in progress', async () => {
    const { audio, frame, master, advance } = setup(); await audio.resume(); audio.update(frame);
    advance(250); advance(150); audio.update(frame); advance(50);
    expect(master().gain.value).toBeCloseTo(0.5);
    audio.update({ ...frame, settings: { muted: true, volume: 1 } });
    expect(last(master().gain).value).toBe(0);
    advance(100); expect(master().gain.value).toBeLessThan(0.02);
    expect(master().gain.events.some(e => e.method === 'linearRampToValueAtTime' && e.value === 1)).toBe(false);
    audio.dispose();
  });
  it('steals the oldest impact so ten landings never leave more than eight playing', async () => {
    const { audio, frame, ctx } = setup(); await audio.resume(); const baseline = ctx.nodes.length;
    audio.update({ ...frame, events: Array.from({ length: 10 }, () => ({ type: 'land', efh: 1.5 })) });
    expect(audio.debug().voices).toBe(8);
    const temporary = ctx.nodes.slice(baseline);
    expect(temporary.filter(node => node.disconnects).length).toBe(10);
    for (const source of temporary.slice(0, 10).filter(node => node.starts)) expect(source.stopTime).toBe(0);
    ctx.advance(1); expect(audio.debug().voices).toBe(0);
    expect(temporary.every(node => node.disconnects === 1)).toBe(true); audio.dispose();
  });
  it('never allocates nodes or buffers across 600 updates without impacts', async () => {
    const { audio, ctx, frame } = setup(); await audio.resume(); const count = ctx.nodes.length;
    for (let i = 0; i < 600; i++) audio.update(frame);
    expect(ctx.nodes.length).toBe(count); expect(ctx.buffers.length).toBe(1); audio.dispose();
  });
  it('swallows context creation failures and can retry on a later user gesture', async () => {
    const clock = fakeClock(), createContext = vi.fn().mockImplementationOnce(() => { throw Error('禁止'); }).mockImplementation(() => new FakeAudioContext());
    const audio = createAudio({ ...clock, createContext });
    await expect(audio.resume()).resolves.toBeUndefined();
    expect(() => audio.update({ state: riding(), frameDt: 1 / 60 })).not.toThrow();
    await audio.resume(); expect(audio.debug().running).toBe(true); audio.dispose();
  });
  it('swallows synchronous and asynchronous resume/close failures', async () => {
    for (const synchronous of [false, true]) {
      const { audio, ctx, frame } = setup();
      ctx.resume = () => { if (synchronous) throw Error('再開拒否'); return Promise.reject(Error('再開拒否')); };
      ctx.close = () => { if (synchronous) throw Error('終了拒否'); return Promise.reject(Error('終了拒否')); };
      await expect(audio.resume()).resolves.toBeUndefined(); expect(() => audio.update(frame)).not.toThrow();
      expect(() => audio.dispose()).not.toThrow(); await Promise.resolve();
    }
  });
  it('deduplicates pending resumes and remains disposed if a pending resume completes later', async () => {
    const { audio, ctx, createContext } = setup(); let finish;
    ctx.resume = () => new Promise(resolve => { finish = resolve; });
    const first = audio.resume(), second = audio.resume(); expect(first).toBe(second);
    expect(createContext).toHaveBeenCalledTimes(1); audio.dispose(); finish(); await first;
    await audio.resume(); expect(audio.debug().running).toBe(false); expect(createContext).toHaveBeenCalledTimes(1);
  });
  it('disposes twice, clears the watch, stops and disconnects all sources and ignores later calls', async () => {
    const { audio, frame, ctx, clock } = setup(); await audio.resume();
    audio.update({ ...frame, events: [{ type: 'crash', efh: 3 }] });
    audio.dispose(); audio.dispose(); audio.update(frame); await audio.resume();
    expect(clock.intervals.size).toBe(0); expect(ctx.closeCalls).toBe(1);
    expect(audio.debug()).toMatchObject({ running: false, voices: 0 });
    for (const node of ctx.nodes.filter(n => n.starts)) { expect(node.stops.length).toBeGreaterThan(0); expect(node.disconnects).toBe(1); }
  });
  it('disposes before resume without ever creating a context', async () => {
    const { audio, frame, createContext } = setup(); audio.dispose(); audio.dispose(); audio.update(frame); await audio.resume();
    expect(createContext).not.toHaveBeenCalled(); expect(audio.debug().running).toBe(false);
  });
});
