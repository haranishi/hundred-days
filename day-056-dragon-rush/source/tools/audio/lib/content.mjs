// OWNER: audio-tools
// 音の中身の測り方（r02-audio で足した。evals/audio.md の S3・S4・咆哮の声らしさ・B7 の根拠を数で出す）。
// 帯域の比率（素のままと K 特性）、低域が1本の音に寄る度合い、変化どうしの包絡の相関、咆哮の共鳴（F1・F2）の動きと止まった山。
// どれも { l, r }（48kHz の Float32Array）を受け取る。tools/audio-render.mjs の content の部が使う。
import { SR } from './dsp.mjs';
import { bandShares, fft, nextPow2 } from './fft.mjs';
import { kWeight } from './loudness.mjs';

const r3 = (x) => Math.round(x * 1000) / 1000;
const r1 = (x) => Math.round(x * 10) / 10;
const dbOf = (share) => r1(10 * Math.log10(Math.max(1e-9, share)));

export function monoOf(s) {
  const m = new Float32Array(s.l.length);
  for (let i = 0; i < m.length; i++) m[i] = 0.5 * (s.l[i] + s.r[i]);
  return m;
}

function slice(s, a, b) {
  const i0 = Math.max(0, Math.round(a * SR));
  const i1 = Math.min(s.l.length, Math.round(b * SR));
  return { l: s.l.subarray(i0, i1), r: s.r.subarray(i0, i1) };
}

/**
 * 帯域の比率。raw は素のエネルギー、k は K 特性を掛けたエネルギー（耳とラウドネスの測り方に近い）。
 * 境目は 60・120・250・1k・2k・8k Hz。小さなスピーカーで残る 250Hz〜2kHz の比率を k250to2kDb で見る。
 */
export function bandProfile(s, from = 0, to = Infinity) {
  const seg = slice(s, from, Math.min(to, s.l.length / SR));
  const edges = [60, 120, 250, 1000, 2000, 8000];
  const raw = bandShares([seg.l, seg.r], SR, edges, 8192);
  const kw = bandShares([Float32Array.from(kWeight(seg.l)), Float32Array.from(kWeight(seg.r))], SR, edges, 8192);
  return {
    rawBelow60: r3(raw[0]),
    rawBelow120: r3(raw[0] + raw[1]),
    raw250to2k: r3(raw[3] + raw[4]),
    rawAbove2k: r3(raw[5] + raw[6]),
    k250to1kDb: dbOf(kw[3]),
    k250to2kDb: dbOf(kw[3] + kw[4]),
    kAbove250Db: dbOf(kw[3] + kw[4] + kw[5] + kw[6]),
    kBelow60Db: dbOf(kw[0]),
  };
}

/** 窓を掛けて零を詰めた、区間の電力スペクトル（周波数の刻み df）。 */
function powerSpectrum(x, minRes = 0.5) {
  const n = nextPow2(Math.max(x.length, Math.ceil(SR / minRes)));
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < x.length; i++) re[i] = x[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (x.length - 1)));
  fft(re, im);
  const p = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) p[k] = re[k] * re[k] + im[k] * im[k];
  return { p, df: SR / n };
}

function concentrationOf(p, df, lo, hi, halfWidth) {
  const a = Math.ceil(lo / df);
  const b = Math.floor(hi / df);
  let total = 0;
  let best = a;
  for (let k = a; k <= b; k++) {
    total += p[k];
    if (p[k] > p[best]) best = k;
  }
  const w = Math.round(halfWidth / df);
  let near = 0;
  for (let k = Math.max(a, best - w); k <= Math.min(b, best + w); k++) near += p[k];
  return { share: total > 0 ? near / total : 0, peakHz: best * df, energy: total };
}

/**
 * 低域が1本の音に寄る度合い（S3）：28〜160Hz のエネルギーのうち、最も強い成分の ±4Hz に入る割合。
 * whole は区間を丸ごと1枚のスペクトルで見た値、frames は 0.25 秒の窓ごとに見てエネルギーで重み付けした平均。
 * 下がっていく正弦（シンセのサブドロップ）は窓ごとに見ると高く出る。雑音の地鳴りなら 25% 前後になる。
 */
export function lowToneConcentration(s, from, to, { lo = 28, hi = 160, halfWidth = 4 } = {}) {
  const m = monoOf(slice(s, from, to));
  if (m.length < 256) return null;
  const spec = powerSpectrum(m);
  const whole = concentrationOf(spec.p, spec.df, lo, hi, halfWidth);
  const frame = Math.round(0.25 * SR);
  let wsum = 0;
  let esum = 0;
  for (let a = 0; a + frame <= m.length; a += Math.round(frame / 2)) {
    const { p, df } = powerSpectrum(m.subarray(a, a + frame));
    const c = concentrationOf(p, df, lo, hi, halfWidth);
    wsum += c.share * c.energy;
    esum += c.energy;
  }
  return { whole: r3(whole.share), frames: esum > 0 ? r3(wsum / esum) : r3(whole.share), peakHz: r1(whole.peakHz) };
}

/** 10ms ごとの実効値の包絡（モノラル、線形）。 */
export function envelope(s, hopSec = 0.01) {
  const m = monoOf(s);
  const hop = Math.round(hopSec * SR);
  const out = new Float32Array(Math.ceil(m.length / hop));
  for (let k = 0; k < out.length; k++) {
    let e = 0;
    const a = k * hop;
    const b = Math.min(m.length, a + hop);
    for (let i = a; i < b; i++) e += m[i] * m[i];
    out[k] = Math.sqrt(e / Math.max(1, b - a));
  }
  return out;
}

function pearson(a, b) {
  const n = Math.max(a.length, b.length);
  let sa = 0, sb = 0;
  for (let i = 0; i < n; i++) (sa += a[i] ?? 0), (sb += b[i] ?? 0);
  const ma = sa / n;
  const mb = sb / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const x = (a[i] ?? 0) - ma;
    const y = (b[i] ?? 0) - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 1;
}

/** 聞こえる長さ：包絡が最大から -30dB を最後に超えていた所（ファイルの長さは -66dB まで残した余韻を含むので使わない）。 */
export function audibleSeconds(v) {
  const e = envelope(v, 0.02);
  let p = 0;
  for (const x of e) p = Math.max(p, x);
  let last = 0;
  for (let k = 0; k < e.length; k++) if (e[k] > p * 10 ** (-30 / 20)) last = k;
  return (last + 1) * 0.02;
}

/**
 * 変化どうしの包絡の似方（S4）：20ms の包絡を頭で揃え、最初の maxSec 秒を比べて、全部の組の相関の平均を出す。
 * db は各変化の最大から -40dB で止めた dB の包絡（短い方は -40 で埋める。長さの違いも似ていない側に数える）、
 * linear は線形の実効値（短い方は 0 で埋める）。同じ音の雑音違いなら db は 0.95 を超える（r01 の採点の足音 0.988 とほぼ同じ測り方）。
 */
export function envelopeSimilarity(variants, maxSec = 2) {
  const FLOOR = -40;
  // maxSec が 'auto' なら、変化のうち一番長く聞こえる長さ（+0.1 秒）までを比べる（短い音で、後ろの無音どうしが似ている分を数えない）
  if (maxSec === 'auto') maxSec = Math.max(...variants.map((v) => audibleSeconds(v))) + 0.1;
  const envs = variants.map((v) => envelope(slice(v, 0, maxSec), 0.02));
  const dbs = envs.map((e) => {
    let p = 0;
    for (const x of e) p = Math.max(p, x);
    return e.map((x) => Math.max(FLOOR, 20 * Math.log10((x + 1e-12) / (p || 1))));
  });
  const pairs = [];
  const pairsDb = [];
  for (let i = 0; i < envs.length; i++) for (let j = i + 1; j < envs.length; j++) {
    pairs.push(pearson(envs[i], envs[j]));
    const n = Math.max(dbs[i].length, dbs[j].length);
    const a = Float32Array.from({ length: n }, (_, k) => dbs[i][k] ?? FLOOR);
    const b = Float32Array.from({ length: n }, (_, k) => dbs[j][k] ?? FLOOR);
    pairsDb.push(pearson(a, b));
  }
  const mean = (xs) => (xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : 1);
  const lens = variants.map((v) => audibleSeconds(v));
  const mid = 0.5 * (Math.max(...lens) + Math.min(...lens));
  return { db: r3(mean(pairsDb)), linear: r3(mean(pairs)), maxDb: r3(Math.max(...pairsDb)), audibleSec: lens.map((x) => Math.round(x * 100) / 100), lengthSpreadPct: Math.round(((Math.max(...lens) - Math.min(...lens)) / (2 * mid)) * 100) };
}

// ------------------------------------------------------------ 咆哮の共鳴（LPC）

/** 8kHz に落とす（3.4kHz の低域通過を2回掛けて6つに1つを取る）。 */
function to8k(m) {
  const x = Float64Array.from(m);
  for (let pass = 0; pass < 4; pass++) {
    // 2次の低域通過（RBJ、3.4kHz）
    const w = (2 * Math.PI * 3400) / SR;
    const c = Math.cos(w);
    const al = Math.sin(w) / (2 * Math.SQRT1_2);
    const a0 = 1 + al;
    const b0 = (1 - c) / 2 / a0, b1 = (1 - c) / a0, b2 = b0, a1 = (-2 * c) / a0, a2 = (1 - al) / a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const y = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1;
      x1 = x[i];
      y2 = y1;
      y1 = y;
      x[i] = y;
    }
  }
  const out = new Float64Array(Math.floor(x.length / 6));
  for (let i = 0; i < out.length; i++) out[i] = x[i * 6];
  return out;
}

function lpc(frame, order) {
  const r = new Float64Array(order + 1);
  for (let k = 0; k <= order; k++) for (let i = k; i < frame.length; i++) r[k] += frame[i] * frame[i - k];
  if (r[0] <= 0) return null;
  r[0] *= 1 + 1e-9;
  const a = new Float64Array(order + 1);
  a[0] = 1;
  let e = r[0];
  for (let i = 1; i <= order; i++) {
    let acc = r[i];
    for (let j = 1; j < i; j++) acc += a[j] * r[i - j];
    const k = -acc / e;
    const prev = a.slice();
    for (let j = 1; j < i; j++) a[j] = prev[j] + k * prev[i - j];
    a[i] = k;
    e *= 1 - k * k;
    if (e <= 0) return null;
  }
  return a;
}

/** 多項式の根（Durand–Kerner）。coef は a[0]=1 の昇べき（z^-k の係数）→ z^order + a1 z^(order-1) + ... の根。 */
function roots(a) {
  const n = a.length - 1;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const ang = (2 * Math.PI * i) / n + 0.4;
    re[i] = 0.9 * Math.cos(ang);
    im[i] = 0.9 * Math.sin(ang);
  }
  const evalP = (zr, zi) => {
    let pr = 1, pi = 0;
    for (let k = 1; k <= n; k++) {
      const tr = pr * zr - pi * zi + a[k];
      const ti = pr * zi + pi * zr;
      pr = tr;
      pi = ti;
    }
    return [pr, pi];
  };
  for (let it = 0; it < 200; it++) {
    let moved = 0;
    for (let i = 0; i < n; i++) {
      const [pr, pi] = evalP(re[i], im[i]);
      let dr = 1, di = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const xr = re[i] - re[j];
        const xi = im[i] - im[j];
        const tr = dr * xr - di * xi;
        const ti = dr * xi + di * xr;
        dr = tr;
        di = ti;
      }
      const den = dr * dr + di * di || 1e-30;
      const qr = (pr * dr + pi * di) / den;
      const qi = (pi * dr - pr * di) / den;
      re[i] -= qr;
      im[i] -= qi;
      moved = Math.max(moved, Math.abs(qr) + Math.abs(qi));
    }
    if (moved < 1e-10) break;
  }
  return Array.from(re, (r, i) => [r, im[i]]);
}

/**
 * 咆哮の共鳴の動き：8kHz に落とし、40ms の窓（20ms ずつ）ごとに 12 次の LPC の根から F1・F2 を拾う。
 * 声の大きい窓（最大から -20dB 以内）だけを使い、p10〜p90 の幅を中央値で割って「±何%動くか」を出す。
 */
export function formantMotion(s) {
  const x = to8k(monoOf(s));
  const fs = SR / 6;
  const frame = Math.round(0.04 * fs);
  const hop = Math.round(0.02 * fs);
  const frames = [];
  let maxE = 0;
  for (let a = 0; a + frame <= x.length; a += hop) {
    let e = 0;
    for (let i = a; i < a + frame; i++) e += x[i] * x[i];
    frames.push({ a, e });
    maxE = Math.max(maxE, e);
  }
  const tracks = [];
  for (const f of frames) {
    if (f.e < maxE * 0.01) continue;
    const w = new Float64Array(frame);
    for (let i = 0; i < frame; i++) {
      const v = x[f.a + i] - (i > 0 ? 0.9 * x[f.a + i - 1] : 0);
      w[i] = v * (0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (frame - 1)));
    }
    const a = lpc(w, 12);
    if (!a) continue;
    const cands = roots(a)
      .filter(([r, i]) => i > 0)
      .map(([r, i]) => ({ f: (Math.atan2(i, r) * fs) / (2 * Math.PI), bw: (-Math.log(Math.hypot(r, i)) * fs) / Math.PI }))
      .filter((c) => c.f > 120 && c.f < 3600 && c.bw < 450)
      .sort((p, q) => p.f - q.f);
    if (cands.length >= 2) tracks.push({ t: (f.a + frame / 2) / fs, f1: cands[0].f, f2: cands[1].f });
  }
  const stat = (key) => {
    const v = tracks.map((t) => t[key]).sort((p, q) => p - q);
    if (!v.length) return null;
    const q = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
    const med = q(0.5);
    return { median: Math.round(med), p10: Math.round(q(0.1)), p90: Math.round(q(0.9)), swingPct: Math.round(((q(0.9) - q(0.1)) / (2 * med)) * 100) };
  };
  // 頭の 0.5 秒の後の動き（止まっているか）
  const late = tracks.filter((t) => t.t > 0.5);
  const lateSwing = (key) => {
    const v = late.map((t) => t[key]).sort((p, q) => p - q);
    if (v.length < 4) return null;
    const q = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
    return Math.round(((q(0.9) - q(0.1)) / (2 * q(0.5))) * 100);
  };
  return { frames: tracks.length, f1: stat('f1'), f2: stat('f2'), f1SwingAfterHalfSecPct: lateSwing('f1'), f2SwingAfterHalfSecPct: lateSwing('f2'), track: tracks.filter((_, k) => k % 5 === 0).map((t) => [r1(t.t), Math.round(t.f1), Math.round(t.f2)]) };
}

/**
 * 長く止まった山の高さ（dB）：声の大きい部分の平均スペクトルを 1/6 オクターブでならし、f の値と、f の ×0.8・×1.25 の平均との差。
 * 後段の固定の持ち上げ（1.3kHz・2.7kHz の +4dB）があると、この値が大きく出る。
 */
export function staticPeakDb(s, freqs) {
  const m = monoOf(s);
  const n = 8192;
  const acc = new Float64Array(n / 2);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  let frames = 0;
  for (let a = 0; a + n <= m.length; a += n / 2) {
    for (let i = 0; i < n; i++) {
      re[i] = m[a + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < n / 2; k++) acc[k] += re[k] * re[k] + im[k] * im[k];
    frames++;
  }
  const df = SR / n;
  const level = (f) => {
    const lo = Math.floor((f * 2 ** (-1 / 12)) / df);
    const hi = Math.ceil((f * 2 ** (1 / 12)) / df);
    let e = 0;
    for (let k = lo; k <= hi; k++) e += acc[k];
    return 10 * Math.log10(e / (hi - lo + 1) / Math.max(1, frames) + 1e-30);
  };
  return Object.fromEntries(freqs.map((f) => [`${f}Hz`, r1(level(f) - 0.5 * (level(f * 0.8) + level(f * 1.25)))]));
}

/** 自己相関で声の高さ（Hz）の中央値を出す（怪獣3体の声の高さを比べる）。 */
export function pitchMedian(s, lo = 25, hi = 400) {
  const m = monoOf(s);
  const frame = Math.round(0.08 * SR);
  const pitches = [];
  let maxE = 0;
  const es = [];
  for (let a = 0; a + frame <= m.length; a += frame) {
    let e = 0;
    for (let i = a; i < a + frame; i++) e += m[i] * m[i];
    es.push(e);
    maxE = Math.max(maxE, e);
  }
  for (let k = 0, a = 0; a + frame <= m.length; a += frame, k++) {
    if (es[k] < maxE * 0.1) continue;
    let best = 0;
    let bestLag = 0;
    const seg = m.subarray(a, a + frame);
    for (let lag = Math.floor(SR / hi); lag <= Math.ceil(SR / lo); lag += 2) {
      let c = 0;
      for (let i = 0; i + lag < seg.length; i += 2) c += seg[i] * seg[i + lag];
      if (c > best) (best = c), (bestLag = lag);
    }
    if (bestLag) pitches.push(SR / bestLag);
  }
  pitches.sort((p, q) => p - q);
  return pitches.length ? r1(pitches[Math.floor(pitches.length / 2)]) : null;
}

// ------------------------------------------------------------ r05-audio：怪獣どうしの差（メル64帯の平均スペクトル）

let melCache = null;

/** メル尺度（Slaney の式：1kHz まで線形、その上は対数）の三角の帯 64 本（30Hz〜12kHz、帯の面積をそろえる）。 */
function melBank(nFft = 2048, bands = 64, fmin = 30, fmax = 12000) {
  if (melCache) return melCache;
  const fsp = 200 / 3;
  const logStep = Math.log(6.4) / 27;
  const minLogMel = 1000 / fsp;
  const toMel = (f) => (f >= 1000 ? minLogMel + Math.log(f / 1000) / logStep : f / fsp);
  const toHz = (m) => (m >= minLogMel ? 1000 * Math.exp(logStep * (m - minLogMel)) : fsp * m);
  const m0 = toMel(fmin);
  const m1 = toMel(fmax);
  const hz = Array.from({ length: bands + 2 }, (_, i) => toHz(m0 + ((m1 - m0) * i) / (bands + 1)));
  const bins = nFft / 2 + 1;
  const fb = [];
  for (let b = 0; b < bands; b++) {
    const [lo, c, hi] = [hz[b], hz[b + 1], hz[b + 2]];
    const w = new Float64Array(bins);
    for (let k = 0; k < bins; k++) {
      const f = (k * SR) / nFft;
      w[k] = Math.max(0, Math.min((f - lo) / (c - lo), (hi - f) / (hi - c))) * (2 / (hi - lo));
    }
    fb.push(w);
  }
  melCache = fb;
  return fb;
}

/**
 * 音の平均のスペクトル（メル64帯、dB）。モノラルにし、2048 点の窓（512 ずつ）の電力を全部の窓で平均して、
 * 帯の電力の和で割って（音量でそろえて）から dB にする。r04 の採点の「怪獣どうしの差」と同じ値が出る設定（30 個の値の平均の外れ 0.09dB）。
 */
export function meanMelDb(s) {
  const nFft = 2048;
  const hop = 512;
  let m = monoOf(s);
  if (m.length < nFft) {
    const p = new Float32Array(nFft);
    p.set(m);
    m = p;
  }
  const fb = melBank(nFft);
  const win = new Float64Array(nFft);
  for (let i = 0; i < nFft; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (nFft - 1));
  const acc = new Float64Array(nFft / 2 + 1);
  const re = new Float64Array(nFft);
  const im = new Float64Array(nFft);
  let frames = 0;
  for (let a = 0; a + nFft <= m.length; a += hop) {
    for (let i = 0; i < nFft; i++) {
      re[i] = m[a + i] * win[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k <= nFft / 2; k++) acc[k] += re[k] * re[k] + im[k] * im[k];
    frames++;
  }
  const mel = fb.map((w) => {
    let e = 0;
    for (let k = 0; k < w.length; k++) e += w[k] * acc[k];
    return e / Math.max(1, frames);
  });
  const total = mel.reduce((x, y) => x + y, 0) || 1e-30;
  return mel.map((e) => 10 * Math.log10(e / total + 1e-20));
}

const melDist = (a, b) => a.reduce((acc, x, i) => acc + Math.abs(x - b[i]), 0) / a.length;

/**
 * 怪獣どうしの差（between：別の怪獣の変化どうしの全部の組の平均）と、同じ怪獣の変化どうしの差（within：同じ怪獣の全部の組の平均）。
 * byMonster は { 怪獣: [{ l, r }, ...] }。between が within をはっきり上回るほど、別の怪獣に聞こえやすい。
 */
export function rosterDistance(byMonster) {
  const spec = Object.fromEntries(Object.entries(byMonster).map(([m, vs]) => [m, vs.map((v) => meanMelDb(v))]));
  const names = Object.keys(spec);
  const within = {};
  for (const m of names) {
    const v = spec[m];
    const d = [];
    for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) d.push(melDist(v[i], v[j]));
    if (d.length) within[m] = r1(d.reduce((x, y) => x + y, 0) / d.length);
  }
  const between = {};
  for (let p = 0; p < names.length; p++) {
    for (let q = p + 1; q < names.length; q++) {
      const d = [];
      for (const a of spec[names[p]]) for (const b of spec[names[q]]) d.push(melDist(a, b));
      between[`${names[p]}-${names[q]}`] = r1(d.reduce((x, y) => x + y, 0) / d.length);
    }
  }
  const w = Object.values(within);
  const b = Object.values(between);
  return { within, between, minBetweenMinusMaxWithin: w.length && b.length ? r1(Math.min(...b) - Math.max(...w)) : null };
}
