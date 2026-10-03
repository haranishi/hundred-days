// OWNER: audio-tools
// 曲の楽器（すべて合成）：太鼓の一族（大太鼓・長胴・締太鼓・縁打ち）、手平鉦、銅鑼、りん、琴（撥弦）、尺八に似た笛、低い金管、弦、合唱、低音。
// 太鼓と銅鑼と鐘は「減衰する固有振動の和」（膜や板の振動の比）、琴は弦の遅延の輪（Karplus–Strong）、笛・金管・弦は帯域を制限した波形と包絡で作る。
import { Biquad, SR, TAU, clamp, decayEnv, env, filt, len, mul, pink, saw, stereo, svf, white } from '../lib/dsp.mjs';
import { norm } from '../lib/sfxkit.mjs';

// 円形の膜の振動の比（ベッセル関数の零点の比。物理の公知の値）
const MEMBRANE = [1, 1.594, 2.136, 2.296, 2.653, 2.918, 3.156, 3.501];

const DRUMS = {
  // r05-audio：指摘「暴と頂で 50〜63Hz が 400Hz と同じ大きさ（崩落の 60Hz 未満と重なる）」 基音（57Hz）の振幅 1→0.71（-3dB）
  odaiko: { f0: 57, dur: 2.6, decays: [1.3, 0.55, 0.38, 0.32, 0.24, 0.19, 0.15, 0.12], amps: [0.71, 0.45, 0.3, 0.26, 0.18, 0.12, 0.09, 0.07], glide: 0.22, stick: 1200, slap: 520 },
  nagado: { f0: 118, dur: 1.4, decays: [0.5, 0.26, 0.2, 0.17, 0.13, 0.1, 0.08, 0.07], amps: [1, 0.55, 0.36, 0.3, 0.2, 0.14, 0.1, 0.08], glide: 0.16, stick: 1800, slap: 800 },
  shime: { f0: 330, dur: 0.5, decays: [0.13, 0.09, 0.07, 0.06, 0.05, 0.04, 0.035, 0.03], amps: [1, 0.7, 0.5, 0.42, 0.3, 0.22, 0.16, 0.12], glide: 0.08, stick: 3500, slap: 2000 },
};

/** 太鼓の1打（モノラル）。vel は 0〜1、pitch は倍率。叩く強さで高い振動と撥の音が増える。 */
export function drum(rng, kind, vel = 1, pitch = 1) {
  if (kind === 'ka') return rimHit(rng, vel);
  const D = DRUMS[kind];
  const n = len(D.dur);
  const out = new Float32Array(n);
  const f0 = D.f0 * pitch * rng.range(0.985, 1.015);
  const glide = new Float32Array(n);
  for (let i = 0; i < n; i++) glide[i] = 1 + D.glide * vel * Math.exp(-i / (0.03 * SR));
  for (let m = 0; m < MEMBRANE.length; m++) {
    const fr = f0 * MEMBRANE[m] * rng.range(0.995, 1.005);
    const a = D.amps[m] * (m === 0 ? 1 : vel ** 0.6 * (0.6 + 0.4 * vel));
    const k = Math.exp(-1 / (D.decays[m] * (0.85 + 0.15 * vel) * SR));
    let e = 1;
    let ph = rng.next() * 0.1;
    for (let i = 0; i < n; i++) {
      out[i] += Math.sin(TAU * ph) * e * a;
      ph += (fr * glide[i]) / SR;
      e *= k;
    }
  }
  const atk = Math.round(0.0015 * SR);
  for (let i = 0; i < atk; i++) out[i] *= i / atk;
  // 撥の当たり（短い雑音）と、皮を打つ鈍い音
  const stick = white(rng, len(0.03));
  new Biquad().bp(D.stick, 0.8).run(stick);
  mul(stick, decayEnv(stick.length, 0.0003, 0.005));
  const slap = white(rng, len(0.08));
  new Biquad().lp(D.slap, 0.7).run(slap);
  mul(slap, decayEnv(slap.length, 0.0005, 0.018));
  norm(stick);
  norm(slap);
  for (let i = 0; i < stick.length; i++) out[i] += stick[i] * 0.35 * vel;
  for (let i = 0; i < slap.length; i++) out[i] += slap[i] * 0.4 * vel;
  return norm(out, 0.3 + 0.7 * vel);
}

/** 縁打ち（カッ）：木の固有振動の短い鳴り。 */
function rimHit(rng, vel) {
  const n = len(0.2);
  const ex = new Float32Array(n);
  for (let i = 0; i < 40; i++) ex[i] = rng.bi() * (1 - i / 40);
  const base = rng.range(0.97, 1.03);
  const y = modalSum(ex, [
    { f: 960 * base, tau: 0.03, gain: 1 },
    { f: 1630 * base, tau: 0.022, gain: 0.7 },
    { f: 2380 * base, tau: 0.016, gain: 0.5 },
    { f: 3420 * base, tau: 0.011, gain: 0.3 },
  ]);
  for (let i = 0; i < 40; i++) y[i] += ex[i] * 0.3;
  return norm(y, 0.25 + 0.6 * vel);
}

function modalSum(ex, modes) {
  const out = new Float32Array(ex.length);
  for (const m of modes) {
    const r = Math.exp(-1 / (m.tau * SR));
    const c1 = 2 * r * Math.cos((TAU * m.f) / SR);
    const c2 = -r * r;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < ex.length; i++) {
      const y = c1 * y1 + c2 * y2 + ex[i] * m.gain;
      y2 = y1;
      y1 = y;
      out[i] += y;
    }
  }
  return out;
}

/** 手平鉦（チャッパ）：高い不協和な振動の束と、金属の擦れ。 */
export function chappa(rng, vel = 1, set = 0) {
  const n = len(1.1);
  const out = new Float32Array(n);
  const r = mulberry(set + 7);
  for (let p = 0; p < 14; p++) {
    const f = 2600 + r() * 6500;
    const tau = 0.12 + r() * 0.35;
    const k = Math.exp(-1 / (tau * SR));
    let e = 1;
    const ph = r();
    const a = 0.3 + r() * 0.7;
    for (let i = 0; i < n; i++) {
      out[i] += Math.sin(TAU * (ph + (f * i) / SR)) * e * a;
      e *= k;
    }
  }
  const hiss = white(rng, n);
  new Biquad().hp(5000, 0.7).run(hiss);
  mul(hiss, decayEnv(n, 0.0005, 0.05));
  norm(hiss);
  norm(out);
  for (let i = 0; i < n; i++) out[i] = out[i] * 0.6 + hiss[i] * 0.5;
  return norm(out, 0.2 + 0.6 * vel);
}

/** 決まった種から小さな乱数を作る（手平鉦の振動の組を、同じ楽器で同じにするため）。 */
function mulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 銅鑼：低い不協和な振動が、叩いたあと高い振動へ広がる（ふくらみ）。 */
export function gong(rng, f0 = 105, dur = 6.5, vel = 1) {
  const n = len(dur);
  const out = new Float32Array(n);
  const ratios = [1, 1.46, 2.03, 2.51, 2.99, 3.53, 4.08, 4.66, 5.37, 6.1, 7.3, 8.6];
  for (let m = 0; m < ratios.length; m++) {
    const f = f0 * ratios[m] * rng.range(0.995, 1.005);
    const tau = 4.2 / (1 + m * 0.28);
    const k = Math.exp(-1 / (tau * SR));
    const bloom = m >= 3 ? 0.35 + m * 0.03 : 0;
    const a = 1 / (1 + m * 0.35);
    let e = 1;
    const ph = rng.next();
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const grow = bloom > 0 ? 1 - Math.exp(-t / bloom) : 1;
      const drop = 1 - 0.018 * (1 - Math.exp(-t / 0.8));
      out[i] += Math.sin(TAU * (ph + f * drop * t)) * e * a * grow;
      e *= k;
    }
  }
  const mallet = white(rng, len(0.05));
  new Biquad().lp(700, 0.7).run(mallet);
  mul(mallet, decayEnv(mallet.length, 0.001, 0.012));
  norm(mallet);
  for (let i = 0; i < mallet.length; i++) out[i] += mallet[i] * 0.5;
  return norm(out, vel);
}

/** りん（小さな鉢の鐘）：わずかにずれた2つの振動がうなり、高い振動は早く消える。 */
export function rin(rng, f0 = 880, dur = 4, vel = 1) {
  const n = len(dur);
  const out = new Float32Array(n);
  const parts = [
    [1, 3.6, 1],
    [1.0036, 3.6, 0.7],
    [2.71, 1.7, 0.45],
    [5.15, 0.8, 0.22],
    [8.13, 0.4, 0.1],
  ];
  for (const [r, tau, a] of parts) {
    const k = Math.exp(-1 / (tau * SR));
    let e = 1;
    const ph = rng.next();
    for (let i = 0; i < n; i++) {
      out[i] += Math.sin(TAU * (ph + (f0 * r * i) / SR)) * e * a;
      e *= k;
    }
  }
  const atk = Math.round(0.002 * SR);
  for (let i = 0; i < atk; i++) out[i] *= i / atk;
  return norm(out, vel);
}

/**
 * 琴（撥弦）：遅延の輪で弦を鳴らす。bend は押し手（途中で半音ほど上げる）の半音数、bendAt はその時刻（秒）。
 * 爪（つめ）で弾くので立ち上がりが明るく、胴の共鳴を少し足す。
 */
export function koto(rng, freq, { dur = 3, vel = 0.8, bend = 0, bendAt = 0.3, bright = 0.6 } = {}) {
  const n = len(dur);
  const out = new Float32Array(n);
  const maxD = Math.ceil(SR / 50) + 8;
  const line = new Float32Array(maxD);
  const blend = 0.5 - 0.18 * bright;
  // 輪の中の平均（blend）が半標本ほど遅らせるので、その分だけ短くして音程を合わせる
  const d0 = SR / freq - blend;
  // 励振：弾く位置で形の決まる短い雑音（明るさで高域を残す）
  const ex = new Float32Array(Math.ceil(d0));
  let lp = 0;
  for (let i = 0; i < ex.length; i++) {
    lp = lp + (rng.bi() - lp) * (0.35 + 0.6 * bright);
    ex[i] = lp;
  }
  const pos = Math.max(1, Math.round(ex.length * 0.13));
  for (let i = ex.length - 1; i >= pos; i--) ex[i] -= ex[i - pos];
  for (let i = 0; i < ex.length; i++) line[i] = ex[i] * vel;
  const t60 = clamp(4.2 - Math.log2(freq / 110) * 1.1, 0.9, 4.2);
  const loss = 10 ** (-3 / (t60 * freq));
  let w = Math.ceil(d0);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const semi = bend !== 0 && t > bendAt ? bend * Math.min(1, (t - bendAt) / 0.12) : 0;
    const d = d0 / 2 ** (semi / 12);
    let rp = w - d;
    while (rp < 0) rp += maxD;
    const i0 = Math.floor(rp);
    const frac = rp - i0;
    const y = line[i0 % maxD] * (1 - frac) + line[(i0 + 1) % maxD] * frac;
    const filtered = (y * (1 - blend) + prev * blend) * loss;
    prev = y;
    line[w % maxD] = filtered;
    w++;
    out[i] = y;
  }
  // 爪の音（ごく短い高い雑音）と胴の共鳴
  const click = white(rng, len(0.004));
  new Biquad().hp(3000, 0.7).run(click);
  for (let i = 0; i < click.length; i++) out[i] += click[i] * 0.25 * vel * (1 - i / click.length);
  filt(out, [['peak', 290, 1.2, 3], ['peak', 1150, 1.5, 2], ['hp', 60, 0.7]]);
  const fade = Math.round(0.03 * SR);
  for (let i = 0; i < fade; i++) out[n - 1 - i] *= i / fade;
  return out;
}

/**
 * 尺八に似た笛の一節（モノラル）。notes は [{ f, t, d, v }]（Hz・開始秒・長さ秒・強さ0〜1）をつなげて吹く。
 * 音の頭は少し低いところから上げ（めり・かり）、長い音ほど後から揺れ（ビブラート）を深くし、息の雑音を音の高さの帯域に乗せる。
 */
export function flute(rng, notes, total, { bright = 0 } = {}) {
  const n = len(total);
  const f = new Float32Array(n);
  const a = new Float32Array(n);
  const vib = new Float32Array(n);
  let cur = notes[0].f;
  for (let k = 0; k < notes.length; k++) {
    const nt = notes[k];
    const s = len(nt.t);
    const e = Math.min(n, len(nt.t + nt.d));
    const prevF = cur;
    const scoop = rng.range(40, 90);
    for (let i = s; i < e; i++) {
      const t = (i - s) / SR;
      const glide = Math.min(1, t / 0.08);
      const base = prevF + (nt.f - prevF) * glide;
      const bendUp = 2 ** ((-scoop * Math.exp(-t / 0.05)) / 1200);
      f[i] = base * bendUp;
      const att = Math.min(1, t / 0.09);
      const rel = Math.min(1, (nt.d - t) / 0.12);
      const swell = 0.8 + 0.2 * Math.sin(Math.min(Math.PI, (t / nt.d) * Math.PI));
      a[i] = Math.max(a[i], nt.v * att * Math.max(0, rel) * swell);
      vib[i] = Math.min(1, Math.max(0, (t - 0.3) / 0.6));
    }
    cur = nt.f;
  }
  for (let i = 1; i < n; i++) if (f[i] === 0) f[i] = f[i - 1];
  // bright（0〜1）：篠笛のように高く明るい笛（倍音が多く、ビブラートが速く、息が強い）
  const rate = rng.range(4.8, 5.6) + bright * 0.8;
  const out = new Float32Array(n);
  const harm = [1, 0.4 + 0.25 * bright, 0.19 + 0.2 * bright, 0.09 + 0.12 * bright, 0.05 + 0.06 * bright, 0.025 + 0.03 * bright];
  let ph = 0;
  const fm = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const cents = vib[i] * 22 * Math.sin((TAU * rate * i) / SR);
    fm[i] = f[i] * 2 ** (cents / 1200);
    ph += fm[i] / SR;
    if (ph >= 1) ph -= 1;
    let v = 0;
    const bright = 0.5 + 0.5 * a[i];
    for (let h = 0; h < harm.length; h++) v += Math.sin(TAU * ph * (h + 1)) * harm[h] * bright ** h;
    out[i] = v * a[i];
  }
  // 息：音の高さの帯域に乗る雑音と、広い息のかすれ
  const noise = white(rng, n);
  const q = new Float32Array(n).fill(7);
  const breath = svf(noise, fm, q, 'bp');
  const noise2 = pink(rng, n);
  new Biquad().hp(2500, 0.7).run(noise2);
  for (let i = 0; i < n; i++) out[i] += breath[i] * a[i] * (0.55 + 0.3 * bright) + noise2[i] * a[i] * (0.05 + 0.06 * bright);
  filt(out, [['hp', 180, 0.7], ['lp', 7000 + 4000 * bright, 0.7]]);
  return out;
}

/**
 * 揺らぎの列（セント）：決まった速さの正弦ではなく、速さと深さがゆっくり揺れるビブラート＋細かな高さの揺れ。
 * onset 秒までは揺らさず、そこから深くする（奏者は音を伸ばしてから揺らす）。
 */
function humanPitch(rng, n, { rate = [4.8, 5.8], depth = 12, onset = 0.3, jitter = 3 } = {}) {
  const out = new Float32Array(n);
  const r0 = rng.range(rate[0], rate[1]);
  const rw = wanderLite(rng, n, 0.7, 0.85, 1.15);
  const dw = wanderLite(rng, n, 0.5, 0.6, 1.2);
  const jw = wanderLite(rng, n, 9, -1, 1);
  let ph = rng.next();
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (r0 * rw[i]) / SR;
    const on = t < onset ? 0 : Math.min(1, (t - onset) / 0.5);
    out[i] = depth * dw[i] * on * Math.sin(TAU * ph) + jitter * jw[i];
  }
  return out;
}

/** 軽いゆらぎ（点を rate Hz で置いて滑らかにつなぐ）。osc.mjs の wander と同じ考え方の小さな写し。 */
function wanderLite(rng, n, rate, lo, hi) {
  const out = new Float32Array(n);
  const step = Math.max(1, Math.round(SR / rate));
  let a = rng.range(lo, hi);
  let b = rng.range(lo, hi);
  for (let i = 0; i < n; i++) {
    const k = i % step;
    if (k === 0 && i > 0) {
      a = b;
      b = rng.range(lo, hi);
    }
    const u = k / step;
    out[i] = a + (b - a) * u * u * (3 - 2 * u);
  }
  return out;
}

/** 楽器の胴（弦の箱・金管のベル）の固定の共鳴。高さの揺れが共鳴の山をまたぐので、倍音ごとに強さが揺れる（合成の「平らな」揺れにならない）。 */
function bodyResonance(buf, modes) {
  const out = new Float32Array(buf.length);
  for (const [f, q, db] of modes) {
    const y = Float32Array.from(buf);
    new Biquad().bp(f, q).run(y);
    const g = 10 ** (db / 20);
    for (let i = 0; i < buf.length; i++) out[i] += y[i] * g;
  }
  for (let i = 0; i < buf.length; i++) out[i] = out[i] * 0.8 + buf[i] * 0.35;
  return out;
}

// 弦楽器の胴の共鳴（Hz・Q・dB）。空気の共鳴・板の共鳴・「ブリッジの山」を、実在の楽器の数値ではなく形だけ借りて置いた
const STRING_BODY = [
  [260, 4, 2],
  [420, 5, 3],
  [640, 4, -1],
  [980, 5, 2],
  [1550, 4, 0],
  [2450, 3, 3],
  [3400, 3, -2],
];

/**
 * 低い金管（3人の組）。ステレオ。吹き始めに低く入って上がり、強く吹くほど明るく開く（音の強さで倍音が増える）。
 * r02-audio：指摘「のこぎり波を数本ずらして低域通過に通しただけ（安いシンセのブラス）」
 * 奏者ごとの揺れ（速さと深さが揺れるビブラート・細かな高さの揺れ）、吹き始めの息の音、強さで開く明るさ、ベルの共鳴を足した。
 */
export function brass(rng, freq, { dur, vel = 0.8, attack = 0.08, release = 0.25, voices = 3 } = {}) {
  const n = len(dur + release);
  const out = stereo(n);
  for (let v = 0; v < voices; v++) {
    const det = 2 ** ((rng.bi() * 6) / 1200);
    const off = len(rng.range(0, 0.02));
    const m = n - off;
    const cents = humanPitch(rng, m, { rate: [4.4, 5.4], depth: 6, onset: 0.4, jitter: 2.5 });
    const f = new Float32Array(m);
    const scoopDepth = rng.range(20, 45);
    for (let i = 0; i < m; i++) {
      const t = i / SR;
      f[i] = freq * det * 2 ** ((-scoopDepth * Math.exp(-t / 0.05) + cents[i]) / 1200);
    }
    const x = saw(m, f, rng.next());
    const e = env(m, [[0, 0], [attack * rng.range(0.8, 1.25), 1], [Math.max(attack + 0.01, dur * 0.6), rng.range(0.85, 0.95)], [dur, 0.85], [dur + release, 0]]);
    // 明るさ：強さの2乗で開き、吹き始めに一瞬開きすぎる（唇が鳴り始める「バッ」）
    const cut = new Float32Array(m);
    const blat = rng.range(0.4, 0.8);
    for (let i = 0; i < m; i++) cut[i] = 300 + e[i] * e[i] * (600 + 2900 * vel) * (1 + blat * Math.exp(-i / (0.07 * SR)));
    const y = svf(x, cut, 0.9, 'lp');
    // 吹き始めの息（1〜2kHz の短い雑音）
    const breath = white(rng, Math.min(m, len(0.09)));
    new Biquad().bp(rng.range(1000, 1800), 1.2).run(breath);
    for (let i = 0; i < breath.length; i++) y[i] += breath[i] * 0.25 * vel * (1 - i / breath.length);
    mul(y, e);
    const shaped = bodyResonance(y, [[520, 2.5, 3], [1250, 3, 2], [2300, 3, -1]]);
    filt(shaped, [['lp', 5200, 0.7]]);
    const pan = (v / Math.max(1, voices - 1) - 0.5) * 0.7;
    const a = ((pan + 1) * Math.PI) / 4;
    for (let i = 0; i < m; i++) {
      out.l[off + i] += shaped[i] * Math.cos(a) * vel;
      out.r[off + i] += shaped[i] * Math.sin(a) * vel;
    }
  }
  return out;
}

/**
 * 弦（合奏）。mode は sustain・tremolo（細かく刻む）・spiccato（短く跳ねる）。ステレオ。
 * r02-audio：指摘「のこぎり波を数本ずらして低域通過に通しただけ（アナログシンセのストリングス）」
 * 奏者ごとに違う揺れ方のビブラート、弓の雑音（音の高さの倍音に沿う擦れ）と弾き始めの引っかき、明るさが遅れて開く立ち上がり、
 * 胴の固定の共鳴（揺れで倍音ごとの強さが揺れる）を足した。
 */
export function strings(rng, freq, { dur, vel = 0.7, attack = 0.3, release = 0.6, voices = 6, mode = 'sustain' } = {}) {
  const rel = mode === 'spiccato' ? 0.12 : release;
  const n = len(dur + rel);
  const sum = new Float32Array(n);
  const sumR = new Float32Array(n);
  const short = mode === 'spiccato';
  for (let v = 0; v < voices; v++) {
    const det = 2 ** ((rng.bi() * 8) / 1200);
    const cents = short ? null : humanPitch(rng, n, { rate: [4.6, 6.4], depth: rng.range(8, 16), onset: rng.range(0.15, 0.45), jitter: 3 });
    const f = new Float32Array(n);
    for (let i = 0; i < n; i++) f[i] = freq * det * 2 ** ((cents ? cents[i] : 0) / 1200);
    const x = saw(n, f, rng.next());
    let e;
    if (short) e = env(n, [[0, 0], [0.006, 1], [0.05, 0.55], [Math.min(dur, 0.16), 0.08], [dur + rel, 0]], 'exp');
    else e = env(n, [[0, 0], [attack * rng.range(0.7, 1.3), 1], [dur * rng.range(0.5, 0.8), rng.range(0.85, 1)], [dur, 0.9], [dur + rel, 0]]);
    if (mode === 'tremolo') {
      const tr = rng.range(12.5, 15.5);
      const vph = rng.next();
      for (let i = 0; i < n; i++) e[i] *= 0.55 + 0.45 * Math.abs(Math.sin(TAU * ((tr * i) / SR + vph)));
    }
    // 明るさ：弓が弦をつかむまで少し暗く、強さで開く
    const open = short ? 0.01 : rng.range(0.06, 0.16);
    const cut = new Float32Array(n);
    for (let i = 0; i < n; i++) cut[i] = (1800 + 3400 * vel) * (0.45 + 0.55 * Math.min(1, i / (open * SR))) * (0.7 + 0.3 * e[i]);
    const y = svf(x, cut, 0.7, 'lp');
    mul(y, e);
    const pan = (v / Math.max(1, voices - 1) - 0.5) * 1.4;
    const a = ((clamp(pan, -1, 1) + 1) * Math.PI) / 4;
    for (let i = 0; i < n; i++) {
      sum[i] += y[i] * Math.cos(a) * vel;
      sumR[i] += y[i] * Math.sin(a) * vel;
    }
  }
  // 弓の雑音：音の高さに沿う櫛の形の雑音（弓の毛が弦をこする擦れ）。弾き始めは引っかき、あとは細く続く
  const noise = white(rng, n);
  const bow = combNoise(noise, freq);
  new Biquad().hp(Math.max(300, freq * 2), 0.7).run(bow);
  const bowEnv = short ? env(n, [[0, 0], [0.004, 1], [0.05, 0.2], [0.12, 0]]) : env(n, [[0, 0], [0.01, 1], [0.08, 0.35], [dur, 0.18], [dur + rel, 0]]);
  mul(bow, bowEnv);
  norm(bow);
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(sum[i]), Math.abs(sumR[i]));
  const bowGain = peak * (short ? 0.16 : 0.07);
  for (let i = 0; i < n; i++) {
    sum[i] += bow[i] * bowGain;
    sumR[i] += bow[i] * bowGain;
  }
  const out = { l: bodyResonance(sum, STRING_BODY), r: bodyResonance(sumR, STRING_BODY) };
  for (const ch of [out.l, out.r]) filt(ch, [['hp', 45, 0.7], ['lp', 9000, 0.7]]);
  return out;
}

/** 櫛の形の雑音：遅れを足し合わせて、f の倍音の所だけ通す。 */
function combNoise(noise, f) {
  const d = Math.max(2, Math.round(SR / f));
  const out = new Float32Array(noise.length);
  for (let i = 0; i < noise.length; i++) out[i] = noise[i] + 0.85 * (i >= d ? out[i - d] : 0);
  return out;
}

// 合唱の母音の共鳴（Hz・幅・強さ）。一般の音声学の代表値（大人の男女の間）
const CHOIR_VOWELS = {
  a: [[800, 80, 1], [1150, 90, 0.5], [2900, 120, 0.25], [3900, 130, 0.12]],
  o: [[450, 70, 1], [800, 80, 0.45], [2830, 100, 0.15], [3800, 120, 0.08]],
};

/**
 * 合唱（あ・お の母音の帯）。ステレオ。遠くで支える厚みに使う。
 * r02-audio：指摘「のこぎり波を3本の帯域通過に通しただけ」 歌い手ごとに声の高さのぶれ（細かな揺れ・揺らぎ）と息の混ざり、
 * 共鳴の位置の個人差、4本目の共鳴、母音のゆっくりした移ろい（あ⇄お）、入りの時刻のずれを持たせた。
 */
export function choir(rng, freq, { dur, vel = 0.6, vowel = 'a', attack = 0.6, release = 0.9, voices = 6 } = {}) {
  const A = CHOIR_VOWELS[vowel];
  const B = CHOIR_VOWELS[vowel === 'a' ? 'o' : 'a'];
  const n = len(dur + release);
  const out = stereo(n);
  for (let v = 0; v < voices; v++) {
    const off = len(rng.range(0, 0.06));
    const m = n - off;
    const det = 2 ** ((rng.bi() * 10) / 1200);
    const cents = humanPitch(rng, m, { rate: [4.6, 5.8], depth: rng.range(10, 20), onset: rng.range(0.2, 0.5), jitter: 5 });
    const f = new Float32Array(m);
    for (let i = 0; i < m; i++) f[i] = freq * det * 2 ** (cents[i] / 1200);
    // 声の元：のこぎり波を少し丸め（声帯の閉じ方）、息の雑音を混ぜる
    const x = saw(m, f, rng.next());
    new Biquad().lp(Math.min(6000, freq * 14), 0.6).run(x);
    const breath = white(rng, m);
    new Biquad().hp(1200, 0.7).run(breath);
    const shimmer = wanderLite(rng, m, 7, 0.85, 1.1);
    const air = rng.range(0.08, 0.18);
    for (let i = 0; i < m; i++) x[i] = (x[i] + breath[i] * air) * shimmer[i];
    // 母音がゆっくり移ろう（あ⇄お の間を 0〜35%）
    const morph = wanderLite(rng, m, 0.25, 0, 0.35);
    const who = rng.range(0.95, 1.05);
    const y = new Float32Array(m);
    for (let k = 0; k < A.length; k++) {
      const fk = new Float32Array(m);
      const qk = new Float32Array(m);
      for (let i = 0; i < m; i++) {
        fk[i] = (A[k][0] + (B[k][0] - A[k][0]) * morph[i]) * who;
        qk[i] = fk[i] / A[k][1];
      }
      const b = svf(x, fk, qk, 'bp');
      const g = A[k][2];
      for (let i = 0; i < m; i++) y[i] += b[i] * g;
    }
    mul(y, env(m, [[0, 0], [attack * rng.range(0.8, 1.25), 1], [dur, 0.9], [dur + release, 0]]));
    const pan = (v / Math.max(1, voices - 1) - 0.5) * 1.2;
    const a = ((pan + 1) * Math.PI) / 4;
    for (let i = 0; i < m; i++) {
      out.l[off + i] += y[i] * Math.cos(a) * vel;
      out.r[off + i] += y[i] * Math.sin(a) * vel;
    }
  }
  return out;
}

/** 低音（弓で弾く低い弦と、その下の正弦）。モノラル。 */
export function bass(rng, freq, { dur, vel = 0.8, attack = 0.12, release = 0.4 } = {}) {
  const n = len(dur + release);
  const x = saw(n, freq * 2 ** ((rng.bi() * 3) / 1200), rng.next());
  const y = svf(x, 260 + 280 * vel, 0.8, 'lp');
  const sub = new Float32Array(n);
  for (let i = 0; i < n; i++) sub[i] = Math.sin((TAU * freq * i) / SR);
  const e = env(n, [[0, 0], [attack, 1], [dur, 0.9], [dur + release, 0]]);
  // r05-audio：下に重ねた正弦を -3dB（0.5→0.354）。崩落や着地の地鳴りが入る 40〜100Hz を空ける
  for (let i = 0; i < n; i++) y[i] = (y[i] * 0.7 + sub[i] * 0.354) * e[i] * vel;
  return y;
}
