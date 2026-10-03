// OWNER: audio-tools
// 音量の測定（ITU-R BS.1770 の K 特性とゲート）と真のピーク（4倍の補間）。生成の中で音量を揃えるのに使う。
// 報告用の最終の数値は tools/audio-render.mjs が ffmpeg の ebur128 で測り直す（同じ規格なので 0.1LU 程度で一致する）。
import { SR } from './dsp.mjs';

// K 特性の係数は BS.1770 の表（48kHz）のまま
const K1 = { b: [1.53512485958697, -2.69169618940638, 1.19839281085285], a: [-1.69065929318241, 0.73248077421585] };
const K2 = { b: [1.0, -2.0, 1.0], a: [-1.99004745483398, 0.99007225036621] };

function biquadRun(x, { b, a }) {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[0] * y1 - a[1] * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}

/** K 特性を掛けた写し（Float64Array）。帯域ごとの「聞こえる大きさ」の比率を測るのに使う（content.mjs）。 */
export function kWeight(channel) {
  return biquadRun(biquadRun(channel, K1), K2);
}

/** 400ms の窓（100ms ずつずらす）ごとの平均二乗の和（左右の重みは 1）。 */
function blockPowers(channels, windowSec = 0.4, hopSec = 0.1) {
  const weighted = channels.map((c) => biquadRun(biquadRun(c, K1), K2));
  const n = channels[0].length;
  const w = Math.round(windowSec * SR);
  const hop = Math.round(hopSec * SR);
  const out = [];
  if (n < w) {
    let s = 0;
    for (const c of weighted) for (let i = 0; i < n; i++) s += c[i] * c[i];
    out.push(s / w);
    return out;
  }
  const prefix = weighted.map((c) => {
    const p = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) p[i + 1] = p[i] + c[i] * c[i];
    return p;
  });
  for (let start = 0; start + w <= n; start += hop) {
    let s = 0;
    for (const p of prefix) s += p[start + w] - p[start];
    out.push(s / w);
  }
  return out;
}

const toLufs = (power) => -0.691 + 10 * Math.log10(Math.max(1e-20, power));

/** 統合の音量（LUFS）。絶対ゲート -70、相対ゲート -10LU。 */
export function integratedLufs(channels) {
  const blocks = blockPowers(channels);
  const abs = blocks.filter((p) => toLufs(p) > -70);
  if (abs.length === 0) return -Infinity;
  const rel = toLufs(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const gated = abs.filter((p) => toLufs(p) > rel);
  return toLufs(gated.reduce((a, b) => a + b, 0) / gated.length);
}

/** 最大の瞬時の音量（400ms）と短時間の音量（3秒）。短い効果音の大きさの目安。 */
export function maxLoudness(channels) {
  const m = blockPowers(channels, 0.4, 0.05);
  const s = blockPowers(channels, 3, 0.1);
  return { momentaryMax: toLufs(Math.max(...m)), shortTermMax: toLufs(Math.max(...s)) };
}

// 4倍の補間の多相 FIR（窓付きの sinc、24 タップ×4 相）
const PHASES = 4;
const TAPS = 24;
const FIR = (() => {
  const n = PHASES * TAPS;
  const h = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = (i - (n - 1) / 2) / PHASES;
    const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
    const w = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)) + 0.08 * Math.cos((4 * Math.PI * i) / (n - 1));
    h[i] = sinc * w;
  }
  return h;
})();

/** 真のピーク（dBTP）。大きい標本の周りだけを 4 倍に補間して見る（長い曲でも速い）。 */
export function truePeakDb(channels) {
  let peak = 0;
  for (const c of channels) for (let i = 0; i < c.length; i++) peak = Math.max(peak, Math.abs(c[i]));
  if (peak === 0) return -Infinity;
  const thresh = peak * 0.5;
  let tp = peak;
  for (const c of channels) {
    for (let i = 0; i < c.length; i++) {
      if (Math.abs(c[i]) < thresh) continue;
      for (let ph = 0; ph < PHASES; ph++) {
        let v = 0;
        for (let k = 0; k < TAPS; k++) {
          const idx = i - k + TAPS / 2;
          if (idx < 0 || idx >= c.length) continue;
          v += c[idx] * FIR[k * PHASES + ph];
        }
        tp = Math.max(tp, Math.abs(v));
      }
    }
  }
  return 20 * Math.log10(tp);
}

export function samplePeakDb(channels) {
  let peak = 0;
  for (const c of channels) for (let i = 0; i < c.length; i++) peak = Math.max(peak, Math.abs(c[i]));
  return 20 * Math.log10(Math.max(1e-12, peak));
}

/** 最初に音が立ち上がる位置（秒）：最大値の -30dB を初めて超えた標本。 */
export function onsetSeconds(channels, relDb = -30) {
  let peak = 0;
  for (const c of channels) for (let i = 0; i < c.length; i++) peak = Math.max(peak, Math.abs(c[i]));
  const th = peak * 10 ** (relDb / 20);
  let first = Infinity;
  for (const c of channels) {
    for (let i = 0; i < c.length; i++) {
      if (Math.abs(c[i]) >= th) {
        first = Math.min(first, i);
        break;
      }
    }
  }
  return Number.isFinite(first) ? first / SR : 0;
}

/** 余韻の長さ：最後に最大値の -60dB を超えていた位置（秒）。 */
export function tailSeconds(channels, relDb = -60) {
  let peak = 0;
  for (const c of channels) for (let i = 0; i < c.length; i++) peak = Math.max(peak, Math.abs(c[i]));
  const th = peak * 10 ** (relDb / 20);
  let last = 0;
  for (const c of channels) {
    for (let i = c.length - 1; i >= 0; i--) {
      if (Math.abs(c[i]) >= th) {
        last = Math.max(last, i);
        break;
      }
    }
  }
  return last / SR;
}

/**
 * 層を混ぜたときの統合の音量を、倍率を変えながら何度も速く測るための型。
 * K 特性は線形なので、層ごとに1回だけ掛け、100ms ごとに層どうしの積の和を持っておけば、どの倍率の組でも音量が出せる。
 * stems は [{ l, r }, ...]。戻り値は gains（層ごとの倍率の配列）→ LUFS の関数。
 */
export function mixLoudnessModel(stems) {
  const sub = Math.round(0.1 * SR);
  const k = stems.map((s) => [biquadRun(biquadRun(s.l, K1), K2), biquadRun(biquadRun(s.r, K1), K2)]);
  const n = stems[0].l.length;
  const blocks = Math.floor(n / sub);
  const m = stems.length;
  const pairs = [];
  for (let a = 0; a < m; a++) for (let b = a; b < m; b++) pairs.push([a, b]);
  const sums = new Float64Array(blocks * pairs.length);
  for (let j = 0; j < blocks; j++) {
    for (let p = 0; p < pairs.length; p++) {
      const [a, b] = pairs[p];
      let s = 0;
      for (let c = 0; c < 2; c++) {
        const x = k[a][c];
        const y = k[b][c];
        for (let i = j * sub; i < (j + 1) * sub; i++) s += x[i] * y[i];
      }
      sums[j * pairs.length + p] = s;
    }
  }
  return (gains) => {
    const coef = pairs.map(([a, b]) => gains[a] * gains[b] * (a === b ? 1 : 2));
    const powers = [];
    for (let j = 0; j + 4 <= blocks; j++) {
      let s = 0;
      for (let q = 0; q < 4; q++) for (let p = 0; p < pairs.length; p++) s += coef[p] * sums[(j + q) * pairs.length + p];
      powers.push(s / (4 * sub));
    }
    const abs = powers.filter((p) => toLufs(p) > -70);
    if (abs.length === 0) return -Infinity;
    const rel = toLufs(abs.reduce((x, y) => x + y, 0) / abs.length) - 10;
    const gated = abs.filter((p) => toLufs(p) > rel);
    return toLufs(gated.reduce((x, y) => x + y, 0) / gated.length);
  };
}
