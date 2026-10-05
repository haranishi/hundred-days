// 宣伝動画の音声を、音源ファイルを使わずに合成して WAV に書き出す。
// BGM と効果音は、ゲームの中の合成（source/src/client/audio/bgm.ts・synth.ts）と同じ旋律・同じ作りを、
// Web Audio の代わりにここで計算する。音量の最終調整（-17 LUFS）は render-promo.mjs が ffmpeg で行う。
import { writeFileSync } from 'node:fs';

const RATE = 48000;
const SILENT = 0.0001;
const midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);

function wave(type, phase) {
  const x = phase - Math.floor(phase);
  if (type === 'sine') return Math.sin(2 * Math.PI * x);
  if (type === 'triangle') return 1 - 4 * Math.abs(x - 0.5);
  if (type === 'square') return x < 0.5 ? 1 : -1;
  return 2 * x - 1; // sawtooth
}

/** Web Audio の exponentialRampToValueAtTime と同じ形の包絡（SILENT→peak→SILENT） */
function envelope(dt, attack, decay, peak) {
  if (dt < 0 || dt > attack + decay) return 0;
  if (dt < attack) return SILENT * (peak / SILENT) ** (dt / attack);
  return peak * (SILENT / peak) ** ((dt - attack) / decay);
}

function biquad(type, freq, q = 1) {
  const w = (2 * Math.PI * freq) / RATE;
  const alpha = Math.sin(w) / (2 * q);
  const cos = Math.cos(w);
  let b0, b1, b2;
  if (type === 'lowpass') [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
  else if (type === 'highpass') [b0, b1, b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
  else [b0, b1, b2] = [alpha, 0, -alpha]; // bandpass
  const [a0, a1, a2] = [1 + alpha, -2 * cos, 1 - alpha];
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => {
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

export function createMix(seconds) {
  const buffer = new Float32Array(Math.ceil(seconds * RATE));
  const add = (start, length, sample, filter) => {
    const from = Math.max(0, Math.floor(start * RATE));
    const to = Math.min(buffer.length, Math.ceil((start + length) * RATE));
    for (let i = from; i < to; i++) {
      const v = sample(i / RATE - start);
      buffer[i] += filter ? filter(v) : v;
    }
  };
  const tone = ({ type, freq, freqEnd, t, attack, decay, peak, detune = 0 }, filter) => {
    const base = freq * 2 ** (detune / 1200);
    const length = attack + decay;
    let phase = 0;
    let last = 0;
    add(t, length, (dt) => {
      const f = freqEnd === undefined ? base : base * (Math.max(20, freqEnd) / freq) ** Math.min(1, dt / length);
      phase += f * (dt - last);
      last = dt;
      return wave(type, phase) * envelope(dt, attack, decay, peak);
    }, filter);
  };
  const held = (type, freq, t, length, peak, filter) => {
    add(t, length, (dt) => {
      let g;
      if (dt < 0.012) g = SILENT * (peak / SILENT) ** (dt / 0.012);
      else if (dt < length - 0.03) g = peak;
      else g = peak * (SILENT / peak) ** ((dt - (length - 0.03)) / 0.03);
      return wave(type, freq * dt) * g;
    }, filter);
  };
  const noise = ({ t, decay, peak, filter, freq, q }) => {
    const f = biquad(filter, freq, q ?? 1);
    add(t, 0.003 + decay, (dt) => (Math.random() * 2 - 1) * envelope(dt, 0.003, decay, peak), f);
  };
  return { buffer, tone, held, noise };
}

// ── BGM（bgm.ts と同じ：ハ長調・116拍/分・8小節） ──
const STEP = 60 / 116 / 2;
const MELODY = [
  [[0, 76, 1], [2, 79, 1], [4, 81, 1], [5, 79, 1], [6, 76, 2]],
  [[0, 72, 1], [2, 76, 1], [4, 74, 1], [5, 72, 1], [6, 69, 2]],
  [[0, 77, 1], [2, 81, 1], [4, 79, 1], [5, 77, 1], [6, 74, 2]],
  [[0, 79, 3], [4, 71, 2], [6, 74, 2]],
  [[0, 76, 1], [2, 79, 1], [4, 84, 2], [6, 81, 1], [7, 79, 1]],
  [[0, 81, 2], [2, 79, 1], [3, 76, 2], [6, 74, 2]],
  [[0, 77, 2], [2, 76, 1], [3, 74, 1], [4, 79, 2], [6, 71, 2]],
  [[0, 72, 6]],
];
const CHORDS = [
  [[60, 64, 67], [60, 64, 67]], [[57, 60, 64], [57, 60, 64]], [[57, 60, 65], [57, 60, 65]], [[55, 59, 62], [55, 59, 62]],
  [[60, 64, 67], [60, 64, 67]], [[57, 60, 64], [57, 60, 64]], [[57, 62, 65], [55, 59, 62]], [[60, 64, 67], [60, 64, 67]],
];
const BASS = [[48, 48], [45, 45], [41, 41], [43, 43], [48, 48], [45, 45], [38, 43], [48, 48]];

function bgm(mix, from, to) {
  for (let step = 0; from + step * STEP < to; step++) {
    const t = from + step * STEP;
    const bar = Math.floor(step / 8) % 8;
    const pos = step % 8;
    for (const [at, m, len] of MELODY[bar]) {
      if (at === pos) mix.tone({ type: 'triangle', freq: midiToHz(m), t, attack: 0.012, decay: Math.max(0.12, len * STEP * 0.95), peak: 0.085 });
    }
    const half = pos < 4 ? 0 : 1;
    if (pos === 0 || pos === 4) {
      mix.held('sine', midiToHz(BASS[bar][half]), t, STEP * 1.7, 0.13);
      mix.tone({ type: 'sine', freq: 110, freqEnd: 46, t, attack: 0.002, decay: 0.12, peak: 0.09 });
    }
    if (pos % 2 === 1) {
      for (const m of CHORDS[bar][half]) mix.tone({ type: 'triangle', freq: midiToHz(m), t, attack: 0.006, decay: STEP * 0.7, peak: 0.022 });
      mix.noise({ t, decay: 0.03, peak: 0.02, filter: 'highpass', freq: 8000 });
    }
  }
}

// ── 効果音（synth.ts と同じ作り） ──
const bell = (mix, freq, t, decay, peak) => {
  mix.tone({ type: 'sine', freq, t, attack: 0.004, decay, peak });
  mix.tone({ type: 'sine', freq: freq * 2, t, attack: 0.004, decay: decay * 0.5, peak: peak * 0.3 });
  mix.tone({ type: 'triangle', freq: freq * 3.01, t, attack: 0.003, decay: decay * 0.25, peak: peak * 0.12 });
};
const SOUNDS = {
  buzz: (mix, t) => { bell(mix, midiToHz(88), t, 0.35, 0.2); bell(mix, midiToHz(84), t + 0.16, 0.7, 0.2); },
  correct: (mix, t) => {
    [72, 76, 79, 84].forEach((m, i) => mix.tone({ type: 'triangle', freq: midiToHz(m), t: t + i * 0.055, attack: 0.006, decay: 0.75, peak: 0.11 }));
    [84, 88, 91].forEach((m) => mix.tone({ type: 'sine', freq: midiToHz(m), t: t + 0.22, attack: 0.01, decay: 1.0, peak: 0.06 }));
  },
  wrong: (mix, t) => {
    for (const [start, length] of [[0, 0.17], [0.23, 0.42]]) {
      mix.held('sawtooth', 138, t + start, length, 0.1, biquad('lowpass', 1100, 0.7));
      mix.held('square', 141, t + start, length, 0.05, biquad('lowpass', 1100, 0.7));
    }
  },
  fanfare: (mix, t) => {
    for (const [m, at] of [[79, 0], [84, 0.13], [88, 0.26], [91, 0.39]]) {
      mix.tone({ type: 'triangle', freq: midiToHz(m), t: t + at, attack: 0.005, decay: 0.22, peak: 0.12 });
      mix.tone({ type: 'square', freq: midiToHz(m), t: t + at, attack: 0.005, decay: 0.12, peak: 0.025 });
    }
    for (const m of [84, 88, 91, 96]) mix.tone({ type: 'triangle', freq: midiToHz(m), t: t + 0.55, attack: 0.01, decay: 1.3, peak: 0.08 });
    mix.tone({ type: 'sine', freq: midiToHz(48), t: t + 0.55, attack: 0.01, decay: 1.2, peak: 0.12 });
  },
};

/** 台本（timeline.mjs）の長さと効果音の時刻から、音声を作って WAV に書く */
export function renderAudio(timeline, path) {
  const music = createMix(timeline.total);
  // BGM は効果音より小さく（ゲームの中の音量の比に合わせる）。最後の1.2秒で消す
  bgm(music, 0.05, timeline.total);
  const effects = createMix(timeline.total);
  for (const cue of timeline.cues) SOUNDS[cue.sound](effects, cue.at);
  const fadeFrom = timeline.total - 1.2;
  const samples = music.buffer.map((v, i) => {
    const t = i / RATE;
    const fade = t < fadeFrom ? 1 : Math.max(0, 1 - (t - fadeFrom) / 1.2);
    return v * 0.55 * fade + effects.buffer[i] * 0.9;
  });
  const peak = samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  const gain = 0.7 / peak;
  const data = Buffer.alloc(44 + samples.length * 4);
  data.write('RIFF', 0); data.writeUInt32LE(36 + samples.length * 4, 4); data.write('WAVE', 8);
  data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22);
  data.writeUInt32LE(RATE, 24); data.writeUInt32LE(RATE * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(samples.length * 4, 40);
  samples.forEach((v, i) => {
    const x = Math.max(-1, Math.min(1, v * gain));
    const int = Math.round(x * 32767);
    data.writeInt16LE(int, 44 + i * 4);
    data.writeInt16LE(int, 46 + i * 4);
  });
  writeFileSync(path, data);
}
