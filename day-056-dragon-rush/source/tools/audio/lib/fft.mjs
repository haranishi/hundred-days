// OWNER: audio-tools
// 高速フーリエ変換（基数2・その場で計算）と、それを使った畳み込み（重畳加算）。残響の畳み込みと帯域の測定に使う。

const tableCache = new Map();

function tables(n) {
  let t = tableCache.get(n);
  if (t) return t;
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n);
    sin[i] = Math.sin((2 * Math.PI * i) / n);
  }
  const rev = new Uint32Array(n);
  const bits = Math.log2(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    rev[i] = r;
  }
  t = { cos, sin, rev };
  tableCache.set(n, t);
  if (tableCache.size > 6) tableCache.delete(tableCache.keys().next().value);
  return t;
}

/** re・im をその場で変換する（inverse で逆変換、1/n の正規化も含む）。n は2の冪。 */
export function fft(re, im, inverse = false) {
  const n = re.length;
  const { cos, sin, rev } = tables(n);
  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (j > i) {
      let t = re[i];
      re[i] = re[j];
      re[j] = t;
      t = im[i];
      im[i] = im[j];
      im[j] = t;
    }
  }
  const sign = inverse ? 1 : -1;
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = n / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = cos[k * step];
        const wi = sign * sin[k * step];
        const a = start + k;
        const b = a + half;
        const xr = re[b] * wr - im[b] * wi;
        const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

export const nextPow2 = (n) => 2 ** Math.ceil(Math.log2(Math.max(2, n)));

/**
 * 畳み込み：x（長い信号）と h（インパルス応答）。出力の長さは x + h - 1。
 * 重畳加算で、1回の変換の大きさを block + h に抑える（3分の曲でもメモリを食いすぎない）。
 */
export function convolve(x, h, block = 1 << 17) {
  const out = new Float32Array(x.length + h.length - 1);
  const n = nextPow2(Math.min(block, x.length) + h.length - 1);
  const step = n - h.length + 1;
  const hr = new Float64Array(n);
  const hi = new Float64Array(n);
  hr.set(h);
  fft(hr, hi);
  const xr = new Float64Array(n);
  const xi = new Float64Array(n);
  for (let start = 0; start < x.length; start += step) {
    xr.fill(0);
    xi.fill(0);
    const end = Math.min(x.length, start + step);
    for (let i = start; i < end; i++) xr[i - start] = x[i];
    fft(xr, xi);
    for (let k = 0; k < n; k++) {
      const r = xr[k] * hr[k] - xi[k] * hi[k];
      const im = xr[k] * hi[k] + xi[k] * hr[k];
      xr[k] = r;
      xi[k] = im;
    }
    fft(xr, xi, true);
    const lim = Math.min(n, out.length - start);
    for (let i = 0; i < lim; i++) out[start + i] += xr[i];
  }
  return out;
}

/** ステレオの残響：左右それぞれを別のインパルス応答で畳み込む（ir は { l, r }）。長さは x に合わせて切る。 */
export function reverbStereo(x, ir, keepTail = false) {
  const l = convolve(x.l, ir.l);
  const r = convolve(x.r, ir.r);
  if (keepTail) return { l, r };
  return { l: l.subarray(0, x.l.length).slice(), r: r.subarray(0, x.r.length).slice() };
}

/**
 * 帯域ごとのエネルギーの比（全体を 1 とする）。edges は境目の周波数（Hz）。
 * 長い信号は間引いた窓で見る（最大 maxFrames 個の窓）。
 */
export function bandShares(channels, sampleRate, edges, frame = 8192, maxFrames = 400) {
  const n = frame;
  const bands = new Float64Array(edges.length + 1);
  const win = new Float64Array(n);
  for (let i = 0; i < n; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  const total = channels[0].length;
  const hops = Math.max(1, Math.floor((total - n) / n) + 1);
  const stride = Math.max(1, Math.ceil(hops / maxFrames));
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let h = 0; h < hops; h += stride) {
    const start = h * n;
    for (const ch of channels) {
      for (let i = 0; i < n; i++) {
        re[i] = (ch[start + i] ?? 0) * win[i];
        im[i] = 0;
      }
      fft(re, im);
      for (let k = 1; k < n / 2; k++) {
        const f = (k * sampleRate) / n;
        let b = 0;
        while (b < edges.length && f >= edges[b]) b++;
        bands[b] += re[k] * re[k] + im[k] * im[k];
      }
    }
  }
  const sum = bands.reduce((a, b) => a + b, 0) || 1;
  return Array.from(bands, (v) => v / sum);
}
