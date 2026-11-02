// BGM：コードで作るオリジナル曲（サンプル・外の音源は使わない）。36 秒・48kHz・ステレオ・24bit の WAV を2本書く。
//   node audio.mjs            → output/bgm-a.wav（本編）・output/bgm-b.wav（B案）と output/audio.json（測った値）
// 調は D の陰旋法（都節音階：D・E♭・G・A・B♭）、テンポは 90 BPM（1拍 = 2/3 秒）。映像の切り替え（edit.mjs）はすべて拍の上にある。
// 構成：導入（0〜10 秒）→ 高まり（10〜18）→ 張りつめ（18〜24）→ 息をのむ（24〜26）→ 討ち取りの一打（26.0 秒＝39拍目）と山（26〜31.3）→ 余韻（31.3〜36、最後の 1.2 秒でフェードアウト）。
// A案＝静かな緊張（低いドローン＋撥弦＋遠い太鼓）、B案＝脈打つ太鼓が中心。
// 音量は ffmpeg の ebur128 で測って、積分ラウドネス −17 LUFS・真のピーク −2 dBTP 以下（AAC にしたあと −1 を超えない余裕）に合わせる。
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { BEAT, DURATION, HITS } from './edit.mjs';
import { OUT } from './lib/harness.mjs';
import { writeWav } from './lib/wav.mjs';

const SR = 48000;
const N = Math.round(DURATION * SR);
const TARGET_LUFS = -17;
const MAX_TP = -2.0;
const FADE_OUT = 1.2;

/** 決まった乱数（毎回同じ曲になる）。 */
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

// 音名 → 周波数（平均律・A4 = 440Hz）。この曲は D の陰旋法の音（D・E♭・G・A・B♭）だけを使う
const PC = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };
export const SCALE = ['D', 'Eb', 'G', 'A', 'Bb'];
/** 'D4'・'Bb3' のような名前を周波数に。 */
function hz(name) {
  const m = /^([A-G]b?)(\d)$/.exec(name);
  if (!m || !SCALE.includes(m[1])) throw new Error(`音階の外の音: ${name}`);
  const midi = 12 * (Number(m[2]) + 1) + PC[m[1]];
  return 440 * 2 ** ((midi - 69) / 12);
}

const beat = (b) => b * BEAT;

class Mix {
  constructor() {
    this.L = new Float32Array(N);
    this.R = new Float32Array(N);
    this.sendL = new Float32Array(N);
    this.sendR = new Float32Array(N);
  }
  /** 1つの音（モノ）を pan（-1 左〜1 右）と残響の送り量で足す。 */
  add(t0, mono, gain, pan = 0, send = 0.2) {
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

/** 撥弦（箏のような音）：Karplus–Strong。bright は最初の明るさ。 */
function pluck(freq, { dur = 2.4, bright = 0.6, decay = 0.996, seed = 1 } = {}) {
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
    const v = decay * 0.5 * (a + b);
    buf[idx] = v;
    idx = (idx + 1) % p;
    // 弾いた直後の爪の音（ごく短い）
    const attack = i < 0.004 * SR ? (1 - i / (0.004 * SR)) * 0.3 * (r() * 2 - 1) : 0;
    out[i] = a + attack;
  }
  // 終わりを 30ms で閉じる
  const tail = Math.round(0.03 * SR);
  for (let i = 0; i < tail; i++) out[n - 1 - i] *= i / tail;
  return out;
}

/** 太鼓：音程が下がる胴の鳴り＋皮を打つ雑音。far は遠さ（0〜1、上の帯域を削る）。 */
function taiko({ f0 = 62, dur = 1.4, body = 0.38, skin = 0.5, far = 0, seed = 7 } = {}) {
  const r = rng(seed);
  const n = Math.round(dur * SR);
  const out = new Float32Array(n);
  let ph = 0;
  let lp = 0;
  const cut = 1 - far * 0.85;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = f0 * (1 + 1.4 * Math.exp(-t / 0.018));
    ph += (2 * Math.PI * f) / SR;
    const env = Math.exp(-t / body) * Math.min(1, t / 0.002);
    let v = Math.sin(ph) * env + 0.25 * Math.sin(2.02 * ph) * env * Math.exp(-t / 0.08);
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

/** 締め太鼓（高く短い）。 */
function shime({ seed = 11 } = {}) {
  return taiko({ f0: 190, dur: 0.35, body: 0.07, skin: 0.9, seed });
}

/** 拍子木（木を打つ乾いた音）。 */
function hyoshigi() {
  const n = Math.round(0.25 * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const e = Math.exp(-t / 0.022);
    out[i] = e * (Math.sin(2 * Math.PI * 1720 * t) * 0.6 + Math.sin(2 * Math.PI * 2650 * t) * 0.35 + Math.sin(2 * Math.PI * 940 * t) * 0.3);
  }
  return out;
}

/** 低いドローン（正弦の重ね。わずかにずらしてうねらせる）。level(t) が音量の線。 */
function drone(mix, notes, level, { pan = 0.3, seed = 3 } = {}) {
  const r = rng(seed);
  const parts = notes.map((nm) => ({ f: hz(nm), ph: r() * 6.28, ph2: r() * 6.28, lfo: 0.07 + r() * 0.08, lph: r() * 6.28 }));
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

/** 風（低くこもった雑音）。山場の手前に吸い込むように上げる。 */
function wind(mix, level, seed = 5) {
  const r = rng(seed);
  let a = 0;
  let b = 0;
  for (let i = 0; i < N; i++) {
    const g = level(i / SR);
    const w = r() * 2 - 1;
    a += 0.02 * (w - a);
    b += 0.02 * (r() * 2 - 1 - b);
    if (g <= 0) continue;
    mix.L[i] += a * g * 3;
    mix.R[i] += b * g * 3;
  }
}

/** 残響（Schroeder：櫛形 4 本＋全域通過 2 本を左右で少しずらす）。 */
function reverb(inp, offset) {
  const combs = [1557, 1617, 1491, 1422].map((d) => ({ d: Math.round(((d + offset) * SR) / 44100), fb: 0.83, damp: 0.3 }));
  const aps = [225, 556].map((d) => Math.round(((d + offset) * SR) / 44100));
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

/** 線形の補間で作る音量の線：[[秒, 値], ...] */
const env = (pts) => (t) => {
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

const CUT_BEATS = [15, 17, 21, 27, 30, 36];
const KILL = HITS.killBeat;
const TAKEDOWN = HITS.takedownBeat;
const END_BEAT = 47;

/** 撥弦の旋律（拍, 音名, 強さ）。A案・B案で共有する骨組み。 */
function melody() {
  const ev = [];
  // 導入（0〜14拍）：2拍ごとに、ゆっくり下りて戻る動機
  const intro = ['A4', 'D4', 'Bb4', 'A4', 'G4', 'A4', 'Eb4', 'D4'];
  intro.forEach((nm, k) => ev.push([k * 2, nm, k === 0 ? 1.0 : 0.75]));
  ev.push([0, 'D3', 0.9]);
  ev.push([1.5, 'Eb5', 0.35]);
  ev.push([9.5, 'Eb5', 0.35]);
  // 高まり（15〜26拍）：1拍ごと、オクターブ上を混ぜる
  const build = ['D5', 'A4', 'Bb4', 'A4', 'G4', 'Eb5', 'D5', 'A4', 'Bb4', 'D5', 'Eb5', 'D5'];
  build.forEach((nm, k) => ev.push([15 + k, nm, 0.7 + 0.02 * k]));
  // 張りつめ（27〜35拍）：半拍ごとの刻み（A と B♭ の揺れ）がだんだん強く
  for (let k = 0; k < 18; k++) ev.push([27 + k * 0.5, k % 2 ? 'Bb4' : 'A4', 0.4 + 0.03 * k]);
  // 息をのむ（36〜38拍）：高い一音だけ
  ev.push([36, 'Eb5', 0.6]);
  // 討ち取り（39拍）：低い和音
  ev.push([KILL, 'D3', 1.2], [KILL, 'A3', 1.0], [KILL, 'D4', 0.9]);
  // 山（40〜46拍）：陰旋法を駆け上がる
  const run = ['D4', 'Eb4', 'G4', 'A4', 'Bb4', 'D5', 'Eb5', 'G5', 'A5', 'Bb4', 'A4', 'G4', 'A4', 'D5'];
  run.forEach((nm, k) => ev.push([40 + k * 0.5, nm, 0.75]));
  // 余韻（47拍〜）：終わりの和音
  ev.push([END_BEAT, 'D4', 1.0], [END_BEAT, 'A4', 0.85], [END_BEAT, 'D5', 0.7], [END_BEAT + 2, 'Bb4', 0.5], [END_BEAT + 3, 'A4', 0.6]);
  return ev;
}

function arrangeA(mix) {
  drone(mix, ['D2', 'A2', 'D3'], env([[0, 0.16], [10, 0.18], [18, 0.22], [24, 0.26], [24.6, 0.12], [26, 0.1], [26.05, 0.3], [31.3, 0.28], [36, 0.12]]));
  drone(mix, ['Bb2', 'Eb3'], env([[0, 0], [18, 0], [23.5, 0.08], [24.5, 0], [26, 0], [26.05, 0.12], [31.3, 0.05], [33, 0]]), { seed: 9 });
  wind(mix, env([[0, 0.02], [22, 0.03], [25.9, 0.09], [26.0, 0.0], [26.5, 0.03], [36, 0.02]]));
  let s = 100;
  for (const [b, nm, v] of melody()) mix.add(beat(b), pluck(hz(nm), { seed: s++, bright: 0.5 + 0.3 * Math.min(1, v), dur: 2.6 }), 0.42 * v, ((s * 37) % 10) / 10 - 0.5, 0.35);
  // 遠い太鼓：導入は4拍ごと
  for (let b = 0; b < 15; b += 4) mix.add(beat(b), taiko({ far: 0.8, seed: b + 1 }), 0.45, -0.2, 0.5);
  // 高まり：切り替えごとに太鼓、当て身の拍に強い一打、拍子木
  for (const b of [15, 17, 19, 21, 25]) mix.add(beat(b), taiko({ far: 0.5, seed: b }), 0.5, 0.1, 0.45);
  mix.add(beat(TAKEDOWN), taiko({ far: 0.2, seed: 77, f0: 58 }), 0.75, 0, 0.4);
  for (const b of [15, 17, 21]) mix.add(beat(b), hyoshigi(), 0.25, 0.4, 0.4);
  // 張りつめ：切り替えに太鼓、終わりに向けて連打（だんだん強く）
  for (const b of [27, 30]) mix.add(beat(b), taiko({ far: 0.3, seed: b }), 0.6, 0, 0.4);
  for (let k = 0; k < 10; k++) mix.add(beat(33 + k * 0.25), taiko({ far: 0.4, seed: 200 + k, dur: 0.6, body: 0.12 }), 0.18 + 0.04 * k, k % 2 ? 0.25 : -0.25, 0.4);
  mix.add(beat(36), taiko({ far: 0.6, seed: 36 }), 0.4, 0, 0.6);
  // 討ち取りの一打（2つ重ねる）と山
  mix.add(beat(KILL), taiko({ f0: 50, body: 0.6, dur: 2.5, seed: 390 }), 1.0, -0.1, 0.55);
  mix.add(beat(KILL), taiko({ f0: 72, body: 0.4, dur: 1.6, seed: 391 }), 0.7, 0.15, 0.5);
  for (let b = KILL + 1; b < END_BEAT; b++) {
    mix.add(beat(b), taiko({ far: 0.15, seed: 400 + b }), b % 2 ? 0.45 : 0.62, 0, 0.4);
    mix.add(beat(b + 0.5), shime({ seed: 500 + b }), 0.16, 0.35, 0.3);
  }
  mix.add(beat(END_BEAT), taiko({ f0: 55, body: 0.7, dur: 2.8, seed: 470 }), 0.8, 0, 0.6);
}

function arrangeB(mix) {
  drone(mix, ['D2', 'A2'], env([[0, 0.12], [24, 0.18], [24.6, 0.08], [26, 0.08], [26.05, 0.22], [36, 0.1]]));
  wind(mix, env([[0, 0.015], [25.9, 0.07], [26.0, 0], [36, 0.015]]));
  // 脈：導入から半拍ごとの太鼓（強弱をつけた手順）、低い撥弦で D の保続
  const pulseEnd = 36;
  for (let k = 0; k < pulseEnd * 2; k++) {
    const b = k / 2;
    const accent = k % 8 === 0 ? 1 : k % 2 === 0 ? 0.7 : 0.42;
    const sec = b < 15 ? 0.6 : b < 27 ? 0.8 : 1.0;
    mix.add(beat(b), taiko({ far: b < 15 ? 0.5 : 0.25, seed: 1000 + k, dur: 0.9, body: 0.22 }), 0.5 * accent * sec, k % 2 ? 0.2 : -0.2, 0.35);
  }
  for (let b = 0; b < 36; b += 2) mix.add(beat(b), pluck(hz('D3'), { seed: 3000 + b, bright: 0.4, dur: 1.6 }), 0.45, -0.3, 0.3);
  // 締め太鼓の刻みは高まりから
  for (let k = 0; k < (36 - 15) * 2; k++) {
    const b = 15 + k / 2;
    mix.add(beat(b + 0.25), shime({ seed: 2000 + k }), b < 27 ? 0.1 : 0.16, 0.4, 0.25);
  }
  for (const b of CUT_BEATS) mix.add(beat(b), taiko({ f0: 55, body: 0.45, seed: 2500 + b }), 0.7, 0, 0.45);
  mix.add(beat(TAKEDOWN), taiko({ f0: 52, body: 0.5, seed: 2577 }), 0.8, 0, 0.4);
  for (const b of [15, 17, 21]) mix.add(beat(b), hyoshigi(), 0.22, 0.4, 0.4);
  // 旋律は短い合いの手だけ
  for (const [b, nm, v] of melody().filter(([b]) => b === 0 || b >= KILL || (b >= 15 && b < 27 && Number.isInteger(b) && b % 3 === 0))) {
    mix.add(beat(b), pluck(hz(nm), { seed: Math.round(b * 10) + 4000, dur: 2.2 }), 0.36 * v, 0.3, 0.3);
  }
  for (let k = 0; k < 12; k++) mix.add(beat(33 + k * 0.25), shime({ seed: 4200 + k }), 0.12 + 0.03 * k, k % 2 ? 0.3 : -0.3, 0.3);
  mix.add(beat(KILL), taiko({ f0: 48, body: 0.7, dur: 2.6, seed: 4390 }), 1.0, 0, 0.55);
  mix.add(beat(KILL), taiko({ f0: 70, body: 0.4, dur: 1.6, seed: 4391 }), 0.7, 0.2, 0.5);
  for (let k = 0; k < (END_BEAT - KILL - 1) * 4; k++) {
    const b = KILL + 1 + k / 4;
    mix.add(beat(b), (k % 4 === 0 ? taiko({ seed: 4400 + k, body: 0.3 }) : shime({ seed: 4600 + k })), k % 4 === 0 ? 0.62 : 0.18, k % 2 ? 0.25 : -0.25, 0.35);
  }
  mix.add(beat(END_BEAT), taiko({ f0: 52, body: 0.8, dur: 3, seed: 4470 }), 0.85, 0, 0.6);
}

/** 仕上げ：残響を混ぜ、低域の直流を取り、最後をフェードアウト。 */
function finish(mix) {
  const rl = reverb(mix.sendL, 0);
  const rr = reverb(mix.sendR, 23);
  const L = new Float32Array(N);
  const R = new Float32Array(N);
  // 2次の高域通過（25Hz）で直流と超低域を除く
  const hp = (x) => {
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
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
      x2 = x1;
      x1 = x[i];
      y2 = y1;
      y1 = v;
      y[i] = v;
    }
    return y;
  };
  for (let i = 0; i < N; i++) {
    L[i] = mix.L[i] + rl[i] * 0.55;
    R[i] = mix.R[i] + rr[i] * 0.55;
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

/**
 * 先読みのリミッター（左右共通の音量）：ceil を超える所の手前 4ms で音量を直線的に下げ、80ms で戻す。
 * 切り詰め（クリップ）ではなく音量を動かすので、波形は歪まない。
 */
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

/** ffmpeg の ebur128（結果は標準エラー）の要約から、積分ラウドネス（LUFS）と真のピーク（dBTP）を読む。 */
export function parseEbur(text) {
  const sum = text.slice(text.lastIndexOf('Summary:'));
  const I = Number(/I:\s+(-?[\d.]+) LUFS/.exec(sum)?.[1]);
  const tp = Number(/True peak:\s+Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(sum)?.[1]);
  const lra = Number(/LRA:\s+(-?[\d.]+) LU/.exec(sum)?.[1]);
  return { I, tp, lra };
}
export function ebur(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ffmpeg（ebur128）に失敗: ${r.stderr.slice(-500)}`);
  return r.stderr;
}

function render(name, arrange) {
  const mix = new Mix();
  arrange(mix);
  const { L, R } = finish(mix);
  const file = path.join(OUT, `bgm-${name}.wav`);
  // 仮の音量で書いて測り、目標との差だけ音量を変える。真のピークが余るなら、柔らかい制限のしきい値を下げてもう一度
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  let g = 0.5 / peak;
  let thr = 0.6;
  let reduction = 1;
  const scaled = (gain, th) => {
    const l = L.map((v) => v * gain);
    const r = R.map((v) => v * gain);
    reduction = limit(l, r, th);
    return [l, r];
  };
  let result = null;
  for (let pass = 0; pass < 10; pass++) {
    const [l, r] = scaled(g, thr);
    const { clipped } = writeWav(file, l, r, SR);
    const m = parseEbur(ebur(file));
    const okI = Math.abs(m.I - TARGET_LUFS) <= 0.2;
    console.log(`  ${name} 回 ${pass + 1}: 音量 ${g.toFixed(3)}・制限 ${thr.toFixed(3)} → ${m.I} LUFS・真のピーク ${m.tp} dBTP・切り詰め ${clipped}`);
    if (okI && m.tp <= MAX_TP) {
      result = { ...m, gain: Number(g.toFixed(4)), limiterCeiling: Number(thr.toFixed(3)), maxGainReductionDb: Number((20 * Math.log10(reduction)).toFixed(1)), clipped, passes: pass + 1 };
      break;
    }
    if (okI) thr *= 10 ** ((MAX_TP - m.tp - 0.2) / 20);
    else g *= 10 ** ((TARGET_LUFS - m.I) / 20);
  }
  if (!result) throw new Error(`${name}: 音量が目標に収まらない`);
  // 1コマ目（1/30 秒）の音の大きさと、平均（直流）
  const [l, r] = scaled(result.gain, thr);
  let e = 0;
  let dc = 0;
  const f1 = Math.round(SR / 30);
  for (let i = 0; i < f1; i++) e += l[i] * l[i] + r[i] * r[i];
  for (let i = 0; i < N; i++) dc += l[i] + r[i];
  result.firstFrameDbfs = Number((10 * Math.log10(e / (2 * f1) + 1e-20)).toFixed(1));
  result.dc = Number((dc / (2 * N)).toExponential(2));
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(OUT, { recursive: true });
  const report = { bpm: 60 / BEAT, beat: BEAT, scale: 'D 陰旋法（都節：D・E♭・G・A・B♭）', killBeat: KILL, killSec: beat(KILL), takedownSec: beat(TAKEDOWN), endcardSec: beat(END_BEAT), cutBeats: CUT_BEATS };
  report.a = render('a', arrangeA);
  report.b = render('b', arrangeB);
  writeFileSync(path.join(OUT, 'audio.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
