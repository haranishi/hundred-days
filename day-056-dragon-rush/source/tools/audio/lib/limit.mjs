// OWNER: audio-tools
// 生成の最後に掛ける先読みの制限器（ブリックウォール）。ピークの手前で音量を滑らかに下げ、上限を超えさせない。
// 手順：必要な倍率を標本ごとに出す → 前後 L 標本の最小を取る → 長さ L の移動平均でならす → 戻りは release でゆっくり。
// 平均の窓がすべて最小の台地の中に入るので、ピークの標本では必ず必要な倍率になり、下げ始めは直線の傾きになる（段差が出ない）。
import { SR } from './dsp.mjs';

// 標本の間の山を見るための 4 倍の補間（窓付き sinc、8 タップ×4 相。効果音の短い音にだけ使う）
const OS = 4;
const OT = 8;
const OFIR = (() => {
  const h = new Float64Array(OS * OT);
  for (let i = 0; i < h.length; i++) {
    const t = (i - (h.length - 1) / 2) / OS;
    const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
    h[i] = sinc * (0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / h.length));
  }
  return h;
})();

function interPeak(c, i) {
  let p = Math.abs(c[i]);
  for (let ph = 1; ph < OS; ph++) {
    let v = 0;
    for (let k = 0; k < OT; k++) {
      const idx = i - k + OT / 2;
      if (idx >= 0 && idx < c.length) v += c[idx] * OFIR[k * OS + ph];
    }
    p = Math.max(p, Math.abs(v));
  }
  return p;
}

/** 倍率の包絡（Float32Array）を返す。channels は Float32Array の配列。truePeak で標本の間の山も上限に入れる。 */
export function limiterGain(channels, { ceilingDb = -1.5, lookaheadMs = 3, releaseMs = 120, truePeak = false } = {}) {
  const n = channels[0].length;
  const ceil = 10 ** (ceilingDb / 20);
  const L = Math.max(2, Math.round((lookaheadMs / 1000) * SR));
  const req = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let p = 0;
    for (const c of channels) p = Math.max(p, truePeak && Math.abs(c[i]) > ceil * 0.5 ? interPeak(c, i) : Math.abs(c[i]));
    req[i] = p > ceil ? ceil / p : 1;
  }
  // 前後 L の最小（単調な両端キューで O(n)）
  const mins = new Float32Array(n);
  const q = new Int32Array(n);
  let head = 0;
  let tail = 0;
  let j = 0;
  for (let i = 0; i < n; i++) {
    while (j < n && j <= i + L) {
      while (tail > head && req[q[tail - 1]] >= req[j]) tail--;
      q[tail++] = j++;
    }
    while (q[head] < i - L) head++;
    mins[i] = req[q[head]];
  }
  // 中心の移動平均（窓の外は端の値とみなす。1 とみなすと、頭の数ms にある山＝破裂で始まる音が下がりきらない）
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + mins[i];
  const half = Math.floor(L / 2);
  const out = new Float32Array(n);
  let g = 1;
  const rel = Math.exp(-1 / ((releaseMs / 1000) * SR));
  for (let i = 0; i < n; i++) {
    const a = i - half;
    const b = i + half;
    const lo = Math.max(0, a);
    const hi = Math.min(n - 1, b);
    // 窓の中の各値は「i を含む範囲の最小」なので、平均も req[i] を超えない（上限は必ず守られる）
    const t = (prefix[hi + 1] - prefix[lo] + (lo - a) * mins[0] + (b - hi) * mins[n - 1]) / (b - a + 1);
    // 戻り（release）：上がるときだけゆっくり
    g = t < g ? t : t + (g - t) * rel;
    out[i] = g;
  }
  return out;
}

/** 制限器をその場で掛け、最大の下げ幅（dB、正の値）を返す。 */
export function limitInPlace(channels, opts) {
  const g = limiterGain(channels, opts);
  let minG = 1;
  for (const c of channels) for (let i = 0; i < c.length; i++) c[i] *= g[i];
  for (let i = 0; i < g.length; i++) minG = Math.min(minG, g[i]);
  return -20 * Math.log10(minG);
}
