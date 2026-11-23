// promo-audio.mjs — Day098「残火の鎌倉 — 隠れ谷の灯」宣伝動画用のオリジナル和風劇伴BGM（30秒・48kHz・ステレオ・24bit WAV + 192kbps MP3）。
// 外部音源・サンプル不使用。D の陰旋法（都節音階：D・Eb・G・A・Bb）・90 BPM。
// A案「残火の静寂」（低音ドローン＋箏/三味線の撥弦＋遠太鼓＋刀戟アクセント）
// B案「隠れ谷の陣太鼓」（脈打つ太鼓・締め太鼓＋拍子木＋撥弦＋剣戟・とどめの大太鼓）
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BEAT, BPM, CUT_BEATS, DURATION, HITS } from './timeline.mjs';

const SR = 48000;
const N = Math.round(DURATION * SR);
const TARGET_LUFS = -16.5;
const MAX_TP = -1.8;
const FADE_OUT = 1.2;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PC = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };
export const SCALE = ['D', 'Eb', 'G', 'A', 'Bb'];
function hz(name) {
  const m = /^([A-G]b?)(\d)$/.exec(name);
  if (!m || !SCALE.includes(m[1])) throw new Error(`音階外の音: ${name}`);
  const midi = 12 * (Number(m[2]) + 1) + PC[m[1]];
  return 440 * 2 ** ((midi - 69) / 12);
}

const beat = b => b * BEAT;

class Mix {
  constructor() {
    this.L = new Float32Array(N);
    this.R = new Float32Array(N);
    this.sendL = new Float32Array(N);
    this.sendR = new Float32Array(N);
  }
  add(t0, mono, gain, pan = 0, send = 0.22) {
    const i0 = Math.round(t0 * SR);
    const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
    const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
    for (let k = 0; k < mono.length; k++) {
      const i = i0 + k;
      if (i < 0 || i >= N) continue;
      const v = mono[k];
      this.L[i] += v * gl;
      this.R[i] += v * gr;
      this.sendL[i] += v * gl * send;
      this.sendR[i] += v * gr * send;
    }
  }
}

function pluck(freq, { dur = 2.4, bright = 0.62, decay = 0.996, seed = 1 } = {}) {
  const r = rng(seed);
  const n = Math.round(dur * SR);
  const out = new Float32Array(n);
  const p = Math.max(2, Math.round(SR / freq));
  const buf = new Float32Array(p);
  let prev = 0;
  for (let i = 0; i < p; i++) {
    const w = r() * 2 - 1;
    prev = prev + bright * (w - prev);
    buf[i] = prev;
  }
  let idx = 0;
  for (let i = 0; i < n; i++) {
    const a = buf[idx];
    const b = buf[(idx + 1) % p];
    buf[idx] = decay * 0.5 * (a + b);
    idx = (idx + 1) % p;
    const attack = i < 0.004 * SR ? (1 - i / (0.004 * SR)) * 0.32 * (r() * 2 - 1) : 0;
    out[i] = a + attack;
  }
  const tail = Math.round(0.03 * SR);
  for (let i = 0; i < tail; i++) out[n - 1 - i] *= i / tail;
  return out;
}

function taiko({ f0 = 60, dur = 1.35, body = 0.36, skin = 0.52, far = 0, seed = 7 } = {}) {
  const r = rng(seed);
  const n = Math.round(dur * SR);
  const out = new Float32Array(n);
  let ph = 0;
  let lp = 0;
  const cut = 1 - far * 0.85;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = f0 * (1 + 1.45 * Math.exp(-t / 0.018));
    ph += (2 * Math.PI * f) / SR;
    const e = Math.exp(-t / body) * Math.min(1, t / 0.002);
    let v = Math.sin(ph) * e + 0.25 * Math.sin(2.02 * ph) * e * Math.exp(-t / 0.08);
    const w = (r() * 2 - 1) * Math.exp(-t / 0.025) * skin;
    lp += 0.12 * cut * (w - lp);
    v += lp * 2.2;
    out[i] = v;
  }
  if (far > 0) {
    let y = 0;
    const a = 0.25 + 0.6 * (1 - far);
    for (let i = 0; i < n; i++) {
      y += a * (out[i] - y);
      out[i] = y;
    }
  }
  return out;
}

function shime({ seed = 11 } = {}) {
  return taiko({ f0: 192, dur: 0.34, body: 0.07, skin: 0.9, seed });
}

function hyoshigi() {
  const n = Math.round(0.24 * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const e = Math.exp(-t / 0.022);
    out[i] =
      e *
      (Math.sin(2 * Math.PI * 1720 * t) * 0.6 +
        Math.sin(2 * Math.PI * 2650 * t) * 0.35 +
        Math.sin(2 * Math.PI * 940 * t) * 0.3);
  }
  return out;
}

// 刀の鍔迫り合い・弾き音（金属の高調波＋短い火花ノイズ）
function swordClash(seed = 88) {
  const r = rng(seed);
  const n = Math.round(0.42 * SR);
  const out = new Float32Array(n);
  const freqs = [2180, 3410, 4890, 6320];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const ring = freqs.reduce((acc, f, idx) => acc + Math.sin(2 * Math.PI * f * t) * Math.exp(-t / (0.09 - idx * 0.015)), 0);
    const scrape = (r() * 2 - 1) * Math.exp(-t / 0.018);
    out[i] = (ring * 0.24 + scrape * 0.45) * Math.min(1, t / 0.001);
  }
  return out;
}

function drone(mix, notes, level, { pan = 0.3, seed = 3 } = {}) {
  const r = rng(seed);
  const parts = notes.map(nm => ({
    f: hz(nm),
    ph: r() * 6.28,
    ph2: r() * 6.28,
    lfo: 0.07 + r() * 0.08,
    lph: r() * 6.28,
  }));
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const g = level(t);
    if (g <= 0) continue;
    let l = 0;
    let rr = 0;
    for (const p of parts) {
      const a = 0.75 + 0.25 * Math.sin(2 * Math.PI * p.lfo * t + p.lph);
      const v1 = Math.sin(2 * Math.PI * p.f * t + p.ph);
      const v2 = Math.sin(2 * Math.PI * (p.f + 0.21) * t + p.ph2);
      l += a * (v1 * 0.6 + v2 * 0.4);
      rr += a * (v1 * 0.4 + v2 * 0.6);
    }
    l *= g / parts.length;
    rr *= g / parts.length;
    mix.L[i] += l * (1 - pan * 0.3);
    mix.R[i] += rr * (1 - pan * 0.3);
    mix.sendL[i] += l * 0.15;
    mix.sendR[i] += rr * 0.15;
  }
}

function reverb(inp, offset) {
  const combs = [1557, 1617, 1491, 1422].map(d => ({
    d: Math.round(((d + offset) * SR) / 44100),
    fb: 0.82,
    damp: 0.3,
  }));
  const aps = [225, 556].map(d => Math.round(((d + offset) * SR) / 44100));
  const out = new Float32Array(N);
  for (const c of combs) {
    const buf = new Float32Array(c.d);
    let idx = 0;
    let lp = 0;
    for (let i = 0; i < N; i++) {
      const y = buf[idx];
      lp = y * (1 - c.damp) + lp * c.damp;
      buf[idx] = inp[i] + lp * c.fb;
      idx = (idx + 1) % c.d;
      out[i] += y * 0.25;
    }
  }
  for (const d of aps) {
    const buf = new Float32Array(d);
    let idx = 0;
    for (let i = 0; i < N; i++) {
      const bv = buf[idx];
      const x = out[i];
      const y = -x + bv;
      buf[idx] = x + bv * 0.5;
      idx = (idx + 1) % d;
      out[i] = y;
    }
  }
  return out;
}

const env = pts => t => {
  if (t <= pts[0][0]) return pts[0][1];
  for (let k = 1; k < pts.length; k++) {
    if (t <= pts[k][0]) {
      const [t0, v0] = pts[k - 1];
      const [t1, v1] = pts[k];
      return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  return pts[pts.length - 1][1];
};

function melody() {
  const ev = [];
  // Cut 1 (0..6拍): 燃える鎌倉 — 重く悲壮な動機
  const c1 = ['A4', 'D4', 'Eb4', 'D4', 'Bb4', 'A4'];
  c1.forEach((nm, k) => ev.push([k, nm, k === 0 ? 1.0 : 0.78]));
  ev.push([0, 'D3', 0.95]);
  // Cut 2 (6..12拍): 隠れ谷の夕景と疾走
  const c2 = ['D5', 'A4', 'Bb4', 'G4', 'A4', 'D5'];
  c2.forEach((nm, k) => ev.push([6 + k, nm, 0.82]));
  // Cut 3 (12..20拍): 選択と闇討ち（16拍目で一閃）
  for (let k = 0; k < 8; k++) ev.push([12 + k * 0.5, k % 2 ? 'Eb4' : 'D4', 0.5 + 0.04 * k]);
  ev.push([HITS.stealthBeat, 'D3', 1.15], [HITS.stealthBeat, 'A4', 0.95], [17, 'Bb4', 0.8], [18, 'A4', 0.85], [19, 'G4', 0.8]);
  // Cut 4 (20..29拍): 水穂の里の剣戟（23拍目で弾き、26拍目でとどめ）
  const c4 = ['D5', 'Eb5', 'D5', 'Bb4', 'A4', 'G4', 'A4', 'Bb4', 'D5', 'Eb5', 'G5', 'A5', 'Bb4', 'A4', 'G4', 'A4', 'D5', 'D5'];
  c4.forEach((nm, k) => ev.push([20 + k * 0.5, nm, 0.85]));
  // Cut 5 (29..38拍): 弥十郎との共闘と帰還
  const c5 = ['A4', 'Bb4', 'D5', 'A4', 'G4', 'A4', 'Eb4', 'D4', 'A4'];
  c5.forEach((nm, k) => ev.push([29 + k, nm, 0.8]));
  // Cut 6 (38..45拍): エンドカードの余韻
  ev.push([HITS.endBeat, 'D3', 1.0], [HITS.endBeat, 'A3', 0.9], [HITS.endBeat, 'D4', 0.85], [40, 'Bb4', 0.6], [41.5, 'A4', 0.65], [43, 'D4', 0.7]);
  return ev;
}

function arrangeA(mix) {
  drone(mix, ['D2', 'A2', 'D3'], env([[0, 0.18], [8, 0.2], [13.3, 0.24], [19.3, 0.28], [25.3, 0.22], [30, 0.12]]));
  let s = 100;
  for (const [b, nm, v] of melody()) {
    mix.add(beat(b), pluck(hz(nm), { seed: s++, bright: 0.52 + 0.28 * Math.min(1, v), dur: 2.4 }), 0.44 * v, ((s * 37) % 10) / 10 - 0.5, 0.34);
  }
  for (let b = 0; b < 12; b += 2) mix.add(beat(b), taiko({ far: 0.6, seed: b + 1 }), 0.48, -0.15, 0.45);
  for (const b of CUT_BEATS) {
    mix.add(beat(b), taiko({ f0: 54, body: 0.5, far: 0.15, seed: 300 + b }), 0.82, 0, 0.45);
    mix.add(beat(b), hyoshigi(), 0.28, 0.35, 0.35);
  }
  mix.add(beat(HITS.stealthBeat), taiko({ f0: 52, body: 0.55, seed: 701 }), 0.9, 0, 0.45);
  mix.add(beat(HITS.parryBeat), swordClash(801), 0.72, 0.15, 0.35);
  mix.add(beat(HITS.parryBeat), taiko({ f0: 58, body: 0.45, seed: 702 }), 0.85, -0.1, 0.4);
  mix.add(beat(HITS.finisherBeat), taiko({ f0: 48, body: 0.68, dur: 2.2, seed: 703 }), 1.0, 0, 0.55);
  for (let b = 20; b < 38; b++) {
    mix.add(beat(b), taiko({ far: 0.2, seed: 500 + b }), b % 2 ? 0.44 : 0.6, 0, 0.38);
    mix.add(beat(b + 0.5), shime({ seed: 600 + b }), 0.18, 0.3, 0.28);
  }
}

function arrangeB(mix) {
  drone(mix, ['D2', 'A2'], env([[0, 0.14], [13.3, 0.2], [19.3, 0.25], [25.3, 0.18], [30, 0.1]]));
  for (let k = 0; k < 38 * 2; k++) {
    const b = k / 2;
    const accent = k % 4 === 0 ? 1.0 : k % 2 === 0 ? 0.72 : 0.45;
    const sec = b < 6 ? 0.65 : b < 20 ? 0.82 : 1.0;
    mix.add(beat(b), taiko({ far: b < 6 ? 0.4 : 0.18, seed: 1000 + k, dur: 0.85, body: 0.22 }), 0.52 * accent * sec, k % 2 ? 0.2 : -0.2, 0.32);
  }
  for (let b = 0; b < 38; b += 2) {
    mix.add(beat(b), pluck(hz('D3'), { seed: 3000 + b, bright: 0.45, dur: 1.6 }), 0.44, -0.28, 0.28);
  }
  for (let k = 0; k < (38 - 12) * 2; k++) {
    const b = 12 + k / 2;
    mix.add(beat(b + 0.25), shime({ seed: 2000 + k }), b < 20 ? 0.12 : 0.2, 0.36, 0.25);
  }
  for (const b of CUT_BEATS) {
    mix.add(beat(b), taiko({ f0: 52, body: 0.52, seed: 2500 + b }), 0.85, 0, 0.45);
    mix.add(beat(b), hyoshigi(), 0.26, 0.38, 0.35);
  }
  for (const [b, nm, v] of melody().filter(([b]) => b < 12 || b >= 20)) {
    mix.add(beat(b), pluck(hz(nm), { seed: Math.round(b * 10) + 4000, dur: 2.1 }), 0.36 * v, 0.25, 0.3);
  }
  mix.add(beat(HITS.stealthBeat), taiko({ f0: 50, body: 0.58, seed: 2701 }), 0.92, 0, 0.45);
  mix.add(beat(HITS.parryBeat), swordClash(2801), 0.78, 0.15, 0.35);
  mix.add(beat(HITS.parryBeat), taiko({ f0: 54, body: 0.5, seed: 2702 }), 0.88, -0.1, 0.4);
  mix.add(beat(HITS.finisherBeat), taiko({ f0: 46, body: 0.72, dur: 2.4, seed: 2703 }), 1.05, 0, 0.55);
  mix.add(beat(HITS.endBeat), taiko({ f0: 50, body: 0.8, dur: 2.8, seed: 2704 }), 0.9, 0, 0.58);
}

function finish(mix) {
  const rl = reverb(mix.sendL, 0);
  const rr = reverb(mix.sendR, 23);
  const L = new Float32Array(N);
  const R = new Float32Array(N);
  const hp = x => {
    const w = (2 * Math.PI * 25) / SR;
    const q = Math.SQRT1_2;
    const al = Math.sin(w) / (2 * q);
    const cs = Math.cos(w);
    const b0 = (1 + cs) / 2;
    const b1 = -(1 + cs);
    const b2 = (1 + cs) / 2;
    const a0 = 1 + al;
    const a1 = -2 * cs;
    const a2 = 1 - al;
    const y = new Float32Array(x.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
      x2 = x1; x1 = x[i]; y2 = y1; y1 = v;
      y[i] = v;
    }
    return y;
  };
  for (let i = 0; i < N; i++) {
    L[i] = mix.L[i] + rl[i] * 0.52;
    R[i] = mix.R[i] + rr[i] * 0.52;
  }
  const hl = hp(L);
  const hr = hp(R);
  const fo = Math.round(FADE_OUT * SR);
  for (let i = 0; i < N; i++) {
    const k = N - 1 - i;
    const g = k < fo ? 0.5 - 0.5 * Math.cos((Math.PI * k) / fo) : 1;
    hl[i] *= g;
    hr[i] *= g;
  }
  return { L: hl, R: hr };
}

function limit(L, R, ceil) {
  const n = L.length;
  const g = new Float32Array(n);
  const rel = 1 - Math.exp(-1 / (0.08 * SR));
  let cur = 1;
  for (let i = 0; i < n; i++) {
    const a = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    const need = a > ceil ? ceil / a : 1;
    cur = cur + (1 - cur) * rel;
    if (need < cur) cur = need;
    g[i] = cur;
  }
  const ramp = 1 / Math.round(0.004 * SR);
  for (let i = n - 2; i >= 0; i--) g[i] = Math.min(g[i], g[i + 1] + ramp);
  let minG = 1;
  for (let i = 0; i < n; i++) {
    L[i] *= g[i];
    R[i] *= g[i];
    minG = Math.min(minG, g[i]);
  }
  return minG;
}

function writeWav24(filePath, L, R, sampleRate = SR) {
  const n = L.length;
  const dataBytes = n * 2 * 3;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 6, 28);
  buf.writeUInt16LE(6, 32);
  buf.writeUInt16LE(24, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);
  let clipped = 0;
  let off = 44;
  for (let i = 0; i < n; i++) {
    for (const s of [L[i], R[i]]) {
      if (Math.abs(s) >= 1) clipped++;
      const c = Math.max(-1, Math.min(1, s));
      let v = Math.round(c * 8388607);
      if (v < 0) v += 16777216;
      buf[off] = v & 0xff;
      buf[off + 1] = (v >> 8) & 0xff;
      buf[off + 2] = (v >> 16) & 0xff;
      off += 3;
    }
  }
  writeFileSync(filePath, buf);
  return { clipped };
}

export function parseEbur(text) {
  const sum = text.slice(text.lastIndexOf('Summary:'));
  const I = Number(/I:\s+(-?[\d.]+) LUFS/.exec(sum)?.[1]);
  const tp = Number(/True peak:\s+Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(sum)?.[1]);
  const lra = Number(/LRA:\s+(-?[\d.]+) LU/.exec(sum)?.[1]);
  return { I, tp, lra };
}

export function ebur(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], {
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  });
  if (r.status !== 0) throw new Error(`ffmpeg (ebur128) failed: ${r.stderr.slice(-500)}`);
  return r.stderr;
}

export function renderVariant(name, outDir) {
  mkdirSync(outDir, { recursive: true });
  const mix = new Mix();
  if (name === 'a') arrangeA(mix);
  else arrangeB(mix);
  const { L, R } = finish(mix);
  const wavFile = path.join(outDir, `bgm_${name}.wav`);
  const mp3File = path.join(outDir, `bgm_${name}.mp3`);

  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  let g = 0.5 / peak;
  let thr = 0.62;
  let reduction = 1;
  const scaled = (gain, th) => {
    const l = L.map(v => v * gain);
    const r = R.map(v => v * gain);
    reduction = limit(l, r, th);
    return [l, r];
  };

  let result = null;
  for (let pass = 0; pass < 10; pass++) {
    const [l, r] = scaled(g, thr);
    const { clipped } = writeWav24(wavFile, l, r, SR);
    const m = parseEbur(ebur(wavFile));
    const okI = Math.abs(m.I - TARGET_LUFS) <= 0.25;
    if (okI && m.tp <= MAX_TP) {
      result = {
        ...m,
        gain: Number(g.toFixed(4)),
        limiterCeiling: Number(thr.toFixed(3)),
        maxGainReductionDb: Number((20 * Math.log10(reduction)).toFixed(1)),
        clipped,
        passes: pass + 1,
      };
      break;
    }
    if (okI) thr *= 10 ** ((MAX_TP - m.tp - 0.2) / 20);
    else g *= 10 ** ((TARGET_LUFS - m.I) / 20);
  }
  if (!result) throw new Error(`${name}: failed to converge loudness`);

  spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', wavFile, '-c:a', 'libmp3lame', '-b:a', '192k', mp3File]);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const pick = flag => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const outDir = path.resolve(pick('--out-dir') || process.env.PROMO_OUT_DIR || '.');
  const variant = pick('--variant');
  const variants = variant ? [variant] : ['a', 'b'];
  const summary = { bpm: BPM, beat: BEAT, duration: DURATION, scale: 'D 陰旋法（都節：D・Eb・G・A・Bb）', variants: {} };
  for (const v of variants) {
    summary.variants[v] = renderVariant(v, outDir);
    console.log(`BGM ${v}:`, JSON.stringify(summary.variants[v]));
  }
}
