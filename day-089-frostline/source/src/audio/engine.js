import { computeAudioParams, createAudioMemory } from './params.js';
import { DEFAULT_SETTINGS } from '../core/settings.js';

// 初期の釣り合い。素材を使わず、各帯域の実効値に合わせて試聴で調整する。
// 実ブラウザで測った実効値（tools/shots/audio-check.mjs）をもとに、横滑りが他の4〜6倍に突出していたのを下げ、
// 速さの手がかりになる風と、止まっているときの山の静けさを上げた。耳での確認は本人の試聴で行う。
export const VOICE_GAIN = Object.freeze({ wind: 0.3, glide: 0.8, carve: 0.4, skid: 0.38, powder: 0.7, ambient: 1.2 });
const WIND_RUMBLE_GAIN = 0.025;
const WIND_RUMBLE_FREQ = 120;
const FILTER_Q = Object.freeze({ wind: 0.7, glide: 1, carve: 3, skid: 0.9, lowpass: 0.707 });
const SKID_HIGHPASS_RATIO = 0.5;
const POWDER_FREQ = 650;
const AMBIENT_FREQ = 220;
const CHATTER_FREQ = 28;
const CHATTER_DEPTH = 0.5;
const IMPACT_GAIN = 1.3;
const IMPACT_NOISE_FREQ = 900;
const IMPACT_PITCH_RATIO = 0.4;
const IMPACT_ATTACK = 0.004;
const IMPACT_FLOOR = 0.0001;
const MAX_IMPACTS = 8;
const COMPRESSOR = Object.freeze({ threshold: -14, ratio: 4, knee: 12, attack: 0.003, release: 0.2 });
const PARAM_TAU = 0.03;
const WATCH_INTERVAL_MS = 100;
const WATCH_TIMEOUT_MS = 250;
const PAUSE_FADE = 0.15;
const RESUME_FADE = 0.1;
const NOISE_SECONDS = 2;
const NOISE_SEED = 0x47494e52;
const NOISE_OFFSET_STEP = 0.271;

function noiseBuffer(ctx) {
  const buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * NOISE_SECONDS), ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  let seed = NOISE_SEED;
  for (let i = 0; i < samples.length; i++) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    samples[i] = (seed >>> 0) / 0x100000000 * 2 - 1;
  }
  return buffer;
}

/** 同じ配線をオフラインでも使い、試聴用と本番用の音の差を防ぐ。 */
export function buildGraph(ctx) {
  const graph = { ctx, nodes: [], sources: [], voices: {}, impacts: [], disposed: false, noiseIndex: 0 };
  const node = (kind) => { const result = ctx[kind](); graph.nodes.push(result); return result; };
  graph.node = node;
  graph.noiseBuffer = noiseBuffer(ctx);
  graph.master = node('createGain');
  graph.compressor = node('createDynamicsCompressor');
  for (const [key, value] of Object.entries(COMPRESSOR)) graph.compressor[key].setValueAtTime(value, ctx.currentTime);
  graph.master.connect(graph.compressor); graph.compressor.connect(ctx.destination);
  for (const name of Object.keys(VOICE_GAIN)) {
    const source = loopNoise(graph);
    const band = node('createBiquadFilter'), gain = node('createGain');
    band.type = name === 'powder' || name === 'ambient' ? 'lowpass' : 'bandpass';
    band.Q.setValueAtTime(FILTER_Q[name] ?? FILTER_Q.lowpass, ctx.currentTime);
    band.frequency.setValueAtTime(name === 'powder' ? POWDER_FREQ : name === 'ambient' ? AMBIENT_FREQ : 300, ctx.currentTime);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    const voice = graph.voices[name] = { source, filter: band, gain };
    if (name === 'skid') {
      voice.highpass = node('createBiquadFilter'); voice.highpass.type = 'highpass';
      voice.highpass.Q.setValueAtTime(FILTER_Q.lowpass, ctx.currentTime);
      source.connect(voice.highpass); voice.highpass.connect(band);
    } else source.connect(band);
    band.connect(gain);
    if (name === 'wind') {
      voice.pan = node('createStereoPanner'); gain.connect(voice.pan); voice.pan.connect(graph.master);
      voice.rumbleFilter = node('createBiquadFilter'); voice.rumbleFilter.type = 'lowpass';
      voice.rumbleFilter.frequency.setValueAtTime(WIND_RUMBLE_FREQ, ctx.currentTime);
      voice.rumbleFilter.Q.setValueAtTime(FILTER_Q.lowpass, ctx.currentTime);
      voice.rumble = node('createGain'); voice.rumble.gain.setValueAtTime(0, ctx.currentTime);
      source.connect(voice.rumbleFilter); voice.rumbleFilter.connect(voice.rumble); voice.rumble.connect(voice.pan);
    } else if (name === 'carve') {
      voice.modulation = node('createGain'); voice.depth = node('createGain'); voice.lfo = node('createOscillator');
      voice.lfo.frequency.setValueAtTime(CHATTER_FREQ, ctx.currentTime);
      voice.depth.gain.setValueAtTime(0, ctx.currentTime);
      voice.lfo.connect(voice.depth); voice.depth.connect(voice.modulation.gain);
      // 変調を0〜1に収め、氷上でも負の音量や過大なピークを作らない。
      gain.connect(voice.modulation); voice.modulation.connect(graph.master);
      voice.lfo.start(ctx.currentTime); graph.sources.push(voice.lfo);
    } else gain.connect(graph.master);
  }
  return graph;
}

function loopNoise(graph) {
  const source = graph.node('createBufferSource');
  source.buffer = graph.noiseBuffer; source.loop = true;
  source.start(graph.ctx.currentTime, ((graph.noiseIndex++ * NOISE_OFFSET_STEP) % NOISE_SECONDS));
  graph.sources.push(source);
  return source;
}

const target = (param, value, when) => param.setTargetAtTime(value, when, PARAM_TAU);

/** 連続音の節を再利用し、毎コマの作成と破棄による負荷を避ける。 */
export function applyParams(graph, params, when = graph.ctx.currentTime) {
  if (graph.disposed) return;
  for (const [name, coefficient] of Object.entries(VOICE_GAIN)) {
    const voice = graph.voices[name], value = params[name];
    target(voice.gain.gain, value.gain * coefficient, when);
    if (value.freq !== undefined) target(voice.filter.frequency, value.freq, when);
  }
  target(graph.voices.wind.pan.pan, params.wind.pan, when);
  target(graph.voices.wind.rumble.gain, params.wind.gain * WIND_RUMBLE_GAIN, when);
  target(graph.voices.skid.highpass.frequency, params.skid.freq * SKID_HIGHPASS_RATIO, when);
  const depth = params.carve.chatter * CHATTER_DEPTH;
  target(graph.voices.carve.depth.gain, depth, when);
  target(graph.voices.carve.modulation.gain, 1 - depth, when);
  for (const impact of params.impacts) playImpact(graph, impact, when);
}

function stop(source, when) {
  try { source.stop(when); } catch { /* 終了済みでも他の音の片付けを続ける。 */ }
}

function playImpact(graph, impact, when) {
  while (graph.impacts.length >= MAX_IMPACTS) graph.impacts[0].release();
  const ctx = graph.ctx, nodes = [];
  // 一時音を常設の管理配列へ入れると、切断済みの節を保持し続けてしまう。
  const node = kind => { const result = ctx[kind](); nodes.push(result); return result; };
  const sine = node('createOscillator'), noise = node('createBufferSource');
  const band = node('createBiquadFilter'), noiseGain = node('createGain'), envelope = node('createGain');
  const end = when + impact.duration, peak = Math.max(IMPACT_FLOOR, impact.gain * IMPACT_GAIN);
  sine.frequency.setValueAtTime(impact.freq, when);
  sine.frequency.exponentialRampToValueAtTime(impact.freq * IMPACT_PITCH_RATIO, end);
  noise.buffer = graph.noiseBuffer; noise.loop = true;
  band.type = 'lowpass'; band.frequency.setValueAtTime(IMPACT_NOISE_FREQ, when);
  band.Q.setValueAtTime(FILTER_Q.lowpass, when); noiseGain.gain.setValueAtTime(impact.noise, when);
  envelope.gain.setValueAtTime(0, when);
  envelope.gain.linearRampToValueAtTime(peak, when + Math.min(IMPACT_ATTACK, impact.duration / 2));
  envelope.gain.exponentialRampToValueAtTime(IMPACT_FLOOR, end);
  envelope.gain.setValueAtTime(0, end);
  sine.connect(envelope); noise.connect(band); band.connect(noiseGain); noiseGain.connect(envelope); envelope.connect(graph.master);
  let released = false;
  const voice = { sine, noise, nodes, release() {
    if (released) return; released = true;
    sine.onended = null; noise.onended = null;
    stop(sine, ctx.currentTime); stop(noise, ctx.currentTime);
    for (const item of nodes) item.disconnect();
    const index = graph.impacts.indexOf(voice); if (index >= 0) graph.impacts.splice(index, 1);
  } };
  graph.impacts.push(voice);
  // 両方とも同じ終了時刻。先に届いた終了通知で一式を解放する。
  sine.onended = voice.release; noise.onended = voice.release;
  sine.start(when); noise.start(when, (graph.noiseIndex++ * NOISE_OFFSET_STEP) % NOISE_SECONDS);
  sine.stop(end); noise.stop(end);
}

function disposeGraph(graph) {
  if (!graph || graph.disposed) return;
  graph.disposed = true;
  while (graph.impacts.length) graph.impacts[0].release();
  for (const source of graph.sources) stop(source, graph.ctx.currentTime);
  for (const node of graph.nodes) node.disconnect();
}

function closeContext(ctx) {
  try { Promise.resolve(ctx?.close?.()).catch(() => {}); } catch { /* 音を閉じられなくてもゲームの終了を妨げない。 */ }
}

function masterLevel(graph, value, duration) {
  const param = graph.master.gain, when = graph.ctx.currentTime;
  // 復帰中の設定変更でも古い予約を消し、後から消音が解除されるのを防ぐ。
  if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(when);
  else { const held = param.value; param.cancelScheduledValues(when); param.setValueAtTime(held, when); }
  if (duration !== undefined) param.linearRampToValueAtTime(value, when + duration);
  else target(param, value, when);
}

/** 利用者の操作までContextを遅延し、音の失敗を滑走へ波及させない。 */
export function createAudio(options = {}) {
  const makeContext = options.createContext ?? (() => new globalThis.AudioContext());
  const now = options.now ?? (() => globalThis.performance.now());
  const schedule = options.setInterval ?? ((fn, ms) => globalThis.setInterval(fn, ms));
  const unschedule = options.clearInterval ?? (id => globalThis.clearInterval(id));
  const memory = createAudioMemory(), lastParams = {};
  let ctx, graph, timer, pendingResume, disposed = false, stale = false;
  let lastUpdate = now(), desiredVolume = null;

  function watch() {
    if (disposed || !graph || stale || now() - lastUpdate < WATCH_TIMEOUT_MS) return;
    stale = true; masterLevel(graph, 0, PAUSE_FADE);
  }
  return {
    update({ state, events = [], frameDt = 0, settings = DEFAULT_SETTINGS }) {
      if (disposed) return;
      computeAudioParams(state, events, frameDt, memory, lastParams);
      lastUpdate = now();
      if (!graph) return;
      applyParams(graph, lastParams, ctx.currentTime);
      const volume = settings.muted ? 0 : (settings.volume ?? DEFAULT_SETTINGS.volume) ** 2;
      if (stale || volume !== desiredVolume) masterLevel(graph, volume, stale ? RESUME_FADE : undefined);
      desiredVolume = volume; stale = false;
    },
    resume() {
      if (disposed) return Promise.resolve();
      if (pendingResume) return pendingResume;
      // resume自体は操作イベントの中で同期的に呼び、ブラウザの操作権限を保つ。
      try {
        if (!ctx) {
          ctx = makeContext(); graph = buildGraph(ctx);
          graph.master.gain.setValueAtTime(0, ctx.currentTime);
          timer = schedule(watch, WATCH_INTERVAL_MS);
        }
        pendingResume = Promise.resolve(ctx.resume()).catch(() => {}).finally(() => { pendingResume = null; });
        return pendingResume;
      } catch {
        if (timer !== undefined) unschedule(timer);
        disposeGraph(graph); closeContext(ctx);
        graph = undefined; ctx = undefined; timer = undefined; desiredVolume = null;
        return Promise.resolve();
      }
    },
    dispose() {
      if (disposed) return; disposed = true;
      if (timer !== undefined) unschedule(timer);
      disposeGraph(graph); closeContext(ctx);
    },
    debug() {
      return { running: !disposed && !!graph && ctx.state === 'running', voices: graph?.impacts.length ?? 0,
        lastParams: lastParams.wind ? lastParams : null };
    },
  };
}
