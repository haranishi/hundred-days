// OWNER: audio-tools
// 音の合成の部品：標本化の定数、発振器、雑音、フィルター（双二次・状態変数）、包絡、歪み、定位、共鳴の束。
// すべて 48kHz・32bit 浮動小数の配列で扱う。ステレオは { l, r } の組。乱数は呼ぶ側が rng.mjs の系列を渡す。

export const SR = 48000;
export const TAU = Math.PI * 2;

export const len = (sec) => Math.max(1, Math.round(sec * SR));
export const dbToGain = (db) => 10 ** (db / 20);
export const gainToDb = (g) => 20 * Math.log10(Math.max(1e-12, g));
export const semis = (s) => 2 ** (s / 12);
export const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);
export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export function mono(n) {
  return new Float32Array(n);
}

export function stereo(n) {
  return { l: new Float32Array(n), r: new Float32Array(n) };
}

/** 等パワーの定位（-1 で左、+1 で右）。 */
export function panGains(pan) {
  const a = ((clamp(pan, -1, 1) + 1) * Math.PI) / 4;
  return [Math.cos(a), Math.sin(a)];
}

/** モノラルの src を dst の at 標本目から足す。 */
export function addMono(dst, src, at = 0, gain = 1, pan = 0) {
  const [gl, gr] = panGains(pan);
  const n = Math.min(src.length, dst.l.length - at);
  for (let i = Math.max(0, -at); i < n; i++) {
    const v = src[i] * gain;
    dst.l[at + i] += v * gl;
    dst.r[at + i] += v * gr;
  }
}

export function addStereo(dst, src, at = 0, gain = 1) {
  const n = Math.min(src.l.length, dst.l.length - at);
  for (let i = Math.max(0, -at); i < n; i++) {
    dst.l[at + i] += src.l[i] * gain;
    dst.r[at + i] += src.r[i] * gain;
  }
}

export function scale(buf, g) {
  for (let i = 0; i < buf.length; i++) buf[i] *= g;
  return buf;
}

export function scaleStereo(s, g) {
  scale(s.l, g);
  scale(s.r, g);
  return s;
}

export function peakOf(s) {
  let p = 0;
  const chans = s.l ? [s.l, s.r] : [s];
  for (const c of chans) for (let i = 0; i < c.length; i++) p = Math.max(p, Math.abs(c[i]));
  return p;
}

/** 配列どうしを掛ける（包絡を掛ける）。 */
export function mul(buf, env) {
  const n = Math.min(buf.length, env.length);
  for (let i = 0; i < n; i++) buf[i] *= env[i];
  for (let i = n; i < buf.length; i++) buf[i] = 0;
  return buf;
}

// ---------------------------------------------------------------- 包絡

/**
 * 折れ線の包絡。points は [[秒, 値], ...]（秒は昇順）。curve が 'exp' なら値の比で補間する（0 は -80dB とみなす）。
 */
export function env(n, points, curve = 'lin') {
  const out = new Float32Array(n);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    while (k < points.length - 2 && t >= points[k + 1][0]) k++;
    const [t0, v0] = points[k];
    const [t1, v1] = points[Math.min(k + 1, points.length - 1)];
    if (t <= t0) out[i] = v0;
    else if (t >= t1) out[i] = v1;
    else {
      const u = (t - t0) / (t1 - t0);
      if (curve === 'exp') {
        const a = Math.max(v0, 1e-4);
        const b = Math.max(v1, 1e-4);
        out[i] = a * (b / a) ** u;
      } else out[i] = v0 + (v1 - v0) * u;
    }
  }
  return out;
}

/** 立ち上がり attack 秒のあと、時定数 tau 秒で指数に減る包絡。 */
export function decayEnv(n, attack, tau, hold = 0) {
  const out = new Float32Array(n);
  const a = Math.max(1, Math.round(attack * SR));
  const h = Math.round(hold * SR);
  const k = Math.exp(-1 / (tau * SR));
  let v = 1;
  for (let i = 0; i < n; i++) {
    if (i < a) out[i] = Math.sin(((i / a) * Math.PI) / 2);
    else if (i < a + h) out[i] = 1;
    else {
      v *= k;
      out[i] = v;
    }
  }
  return out;
}

/** 端を短く丸めて、切れ目のプチ音を防ぐ。 */
export function fadeEdges(buf, inSec = 0.002, outSec = 0.01) {
  const a = Math.min(buf.length, Math.round(inSec * SR));
  const b = Math.min(buf.length, Math.round(outSec * SR));
  for (let i = 0; i < a; i++) buf[i] *= i / a;
  for (let i = 0; i < b; i++) buf[buf.length - 1 - i] *= i / b;
  return buf;
}

// 発振器と雑音は osc.mjs（ここから読めるように並べ直して出す）
export { brown, pink, pulse, saw, sine, sweepSine, wander, white } from './osc.mjs';

/** 数か標本ごとの配列から i 番目の値 */
const at = (f, i) => (typeof f === 'number' ? f : f[i]);

// ---------------------------------------------------------------- フィルター

/** 双二次フィルター（RBJ の式・転置直接形 II）。 */
export class Biquad {
  constructor() {
    this.b0 = 1;
    this.b1 = 0;
    this.b2 = 0;
    this.a1 = 0;
    this.a2 = 0;
    this.z1 = 0;
    this.z2 = 0;
  }

  set(b0, b1, b2, a0, a1, a2) {
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
    return this;
  }

  lp(f, q = Math.SQRT1_2) {
    const w = (TAU * clamp(f, 5, SR * 0.49)) / SR;
    const c = Math.cos(w);
    const al = Math.sin(w) / (2 * q);
    return this.set((1 - c) / 2, 1 - c, (1 - c) / 2, 1 + al, -2 * c, 1 - al);
  }

  hp(f, q = Math.SQRT1_2) {
    const w = (TAU * clamp(f, 5, SR * 0.49)) / SR;
    const c = Math.cos(w);
    const al = Math.sin(w) / (2 * q);
    return this.set((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al);
  }

  /** 中心で 0dB の帯域通過 */
  bp(f, q = 1) {
    const w = (TAU * clamp(f, 5, SR * 0.49)) / SR;
    const c = Math.cos(w);
    const al = Math.sin(w) / (2 * q);
    return this.set(al, 0, -al, 1 + al, -2 * c, 1 - al);
  }

  peak(f, q, db) {
    const A = 10 ** (db / 40);
    const w = (TAU * clamp(f, 5, SR * 0.49)) / SR;
    const c = Math.cos(w);
    const al = Math.sin(w) / (2 * q);
    return this.set(1 + al * A, -2 * c, 1 - al * A, 1 + al / A, -2 * c, 1 - al / A);
  }

  lowShelf(f, db, s = 1) {
    const A = 10 ** (db / 40);
    const w = (TAU * clamp(f, 5, SR * 0.49)) / SR;
    const c = Math.cos(w);
    const al = (Math.sin(w) / 2) * Math.sqrt((A + 1 / A) * (1 / s - 1) + 2);
    const sq = 2 * Math.sqrt(A) * al;
    return this.set(A * (A + 1 - (A - 1) * c + sq), 2 * A * (A - 1 - (A + 1) * c), A * (A + 1 - (A - 1) * c - sq), A + 1 + (A - 1) * c + sq, -2 * (A - 1 + (A + 1) * c), A + 1 + (A - 1) * c - sq);
  }

  highShelf(f, db, s = 1) {
    const A = 10 ** (db / 40);
    const w = (TAU * clamp(f, 5, SR * 0.49)) / SR;
    const c = Math.cos(w);
    const al = (Math.sin(w) / 2) * Math.sqrt((A + 1 / A) * (1 / s - 1) + 2);
    const sq = 2 * Math.sqrt(A) * al;
    return this.set(A * (A + 1 + (A - 1) * c + sq), -2 * A * (A - 1 + (A + 1) * c), A * (A + 1 + (A - 1) * c - sq), A + 1 - (A - 1) * c + sq, 2 * (A - 1 - (A + 1) * c), A + 1 - (A - 1) * c - sq);
  }

  process(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }

  run(buf) {
    for (let i = 0; i < buf.length; i++) buf[i] = this.process(buf[i]);
    return buf;
  }
}

/** フィルターを順に通す。specs は [['lp', 800, 0.7], ['peak', 200, 1, 3], ...]。 */
export function filt(buf, specs) {
  for (const [kind, ...args] of specs) new Biquad()[kind](...args).run(buf);
  return buf;
}

export function filtStereo(s, specs) {
  filt(s.l, specs);
  filt(s.r, specs);
  return s;
}

/**
 * 状態変数フィルター（Zavalishin の TPT 形）。中心を毎標本動かしても発散しない。
 * f と q は数か配列。mode は 'lp' | 'bp'（中心 0dB）| 'hp'。
 */
export function svf(buf, f, q, mode = 'bp') {
  const out = new Float32Array(buf.length);
  let ic1 = 0;
  let ic2 = 0;
  for (let i = 0; i < buf.length; i++) {
    const g = Math.tan((Math.PI * clamp(at(f, i), 5, SR * 0.45)) / SR);
    const k = 1 / Math.max(0.05, at(q, i));
    const a1 = 1 / (1 + g * (g + k));
    const a2 = g * a1;
    const a3 = g * a2;
    const x = buf[i];
    const v3 = x - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    out[i] = mode === 'lp' ? v2 : mode === 'hp' ? x - k * v1 - v2 : k * v1;
  }
  return out;
}

/** 1次の低域通過（係数は遮断周波数から）。 */
export function onePoleLp(buf, f) {
  const a = Math.exp((-TAU * f) / SR);
  let y = 0;
  for (let i = 0; i < buf.length; i++) {
    y = buf[i] * (1 - a) + y * a;
    buf[i] = y;
  }
  return buf;
}

/** 直流を取り除く（1次の高域通過・約 8Hz）。 */
export function dcBlock(buf) {
  let x1 = 0;
  let y1 = 0;
  const R = 0.999;
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    const y = x - x1 + R * y1;
    x1 = x;
    y1 = y;
    buf[i] = y;
  }
  return buf;
}

// ---------------------------------------------------------------- 歪み・共鳴

/** 柔らかい飽和（tanh）。drive が大きいほど倍音が増える。出力の最大は 1 に揃える。 */
export function softclip(buf, drive = 2, bias = 0) {
  const norm = 1 / Math.tanh(drive);
  const off = Math.tanh(bias * drive);
  for (let i = 0; i < buf.length; i++) buf[i] = (Math.tanh(drive * (buf[i] + bias)) - off) * norm;
  return buf;
}

/**
 * 共鳴の束（減衰する正弦の和を、励振の信号でたたく）。modes は [{ f, tau, gain }]。
 * 金属のきしみ・木の打音・鐘などに使う。
 */
export function modal(excite, modes) {
  const out = new Float32Array(excite.length);
  for (const m of modes) {
    const r = Math.exp(-1 / (m.tau * SR));
    const w = (TAU * m.f) / SR;
    const c1 = 2 * r * Math.cos(w);
    const c2 = -r * r;
    const g = m.gain * (1 - r);
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < excite.length; i++) {
      const y = c1 * y1 + c2 * y2 + excite[i] * g;
      y2 = y1;
      y1 = y;
      out[i] += y;
    }
  }
  return out;
}

/** 短い全域通過の連なりで、モノラルからわずかに違う左右を作る（広がり）。 */
export function decorrelate(buf, rng, stages = 4) {
  const l = Float32Array.from(buf);
  const r = Float32Array.from(buf);
  for (const ch of [l, r]) {
    for (let s = 0; s < stages; s++) {
      const d = rng.int(37, 331);
      const g = rng.range(0.35, 0.6);
      const line = new Float32Array(d);
      let p = 0;
      for (let i = 0; i < ch.length; i++) {
        const delayed = line[p];
        const x = ch[i];
        const y = -g * x + delayed;
        line[p] = x + g * y;
        ch[i] = y;
        p = (p + 1) % d;
      }
    }
  }
  return { l, r };
}
