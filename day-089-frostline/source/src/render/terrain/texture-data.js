// 山の配列から、描画用の配列（傾き・細かな法線）を作る。three.js にも DOM にも依存しない。
//
// 法線を頂点で作らず、画素ごとに傾きのテクスチャから作るための材料。
// 傾きは、高さと同じ3次Bスプラインを格子の中心で微分した値（src/world/surface-math.js と同じ曲面）。

/** 格子の中心での dB/dx・dB/dz。Bスプラインの t=0 での重み [1/6,4/6,1/6] と微分 [-1/2,0,1/2] から。 */
export function buildSlope(values, n, cell, periodic) {
  const out = new Float32Array(n * n * 2);
  const idx = periodic ? (i) => ((i % n) + n) % n : (i) => (i < 0 ? 0 : i >= n ? n - 1 : i);
  const k = 1 / (12 * cell);
  for (let j = 0; j < n; j++) {
    const jm = idx(j - 1) * n;
    const j0 = j * n;
    const jp = idx(j + 1) * n;
    for (let i = 0; i < n; i++) {
      const im = idx(i - 1);
      const ip = idx(i + 1);
      const sx = (values[jm + ip] - values[jm + im]) + 4 * (values[j0 + ip] - values[j0 + im]) + (values[jp + ip] - values[jp + im]);
      const sz = (values[jp + im] - values[jm + im]) + 4 * (values[jp + i] - values[jm + i]) + (values[jp + ip] - values[jm + ip]);
      const o = (j0 + i) * 2;
      out[o] = sx * k;
      out[o + 1] = sz * k;
    }
  }
  return out;
}

/** 32bit 浮動小数 → 16bit 半精度（テクスチャ用）。範囲外は切る。 */
export function toHalfFloats(src) {
  const out = new Uint16Array(src.length);
  const f32 = new Float32Array(1);
  const u32 = new Uint32Array(f32.buffer);
  for (let i = 0; i < src.length; i++) {
    let v = src[i];
    if (v > 65504) v = 65504;
    else if (v < -65504) v = -65504;
    f32[0] = v;
    const x = u32[0];
    const sign = (x >>> 16) & 0x8000;
    let exp = ((x >>> 23) & 0xff) - 127 + 15;
    let man = x & 0x7fffff;
    if (exp <= 0) {
      if (exp < -10) { out[i] = sign; continue; }
      man = (man | 0x800000) >> (1 - exp);
      out[i] = sign | ((man + 0x1000) >> 13);
    } else if (exp >= 31) {
      out[i] = sign | 0x7c00;
    } else {
      // 足し算にして、仮数の丸めの繰り上がりを指数へ波及させる（| だと桁あふれで壊れる）
      out[i] = sign | ((exp << 10) + ((man + 0x1000) >> 13));
    }
  }
  return out;
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 周期つきの値雑音（升の数 cx×cz を n×n へ）。縦横の升の数を変えても継ぎ目の無いタイルになる。 */
function periodicNoise(n, cx, cz, rand) {
  const g = new Float32Array(cx * cz);
  for (let i = 0; i < g.length; i++) g[i] = rand() * 2 - 1;
  const out = new Float32Array(n * n);
  const sx = cx / n;
  const sz = cz / n;
  for (let j = 0; j < n; j++) {
    const fy = j * sz;
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    const wy = ty * ty * ty * (ty * (ty * 6 - 15) + 10);
    const r0 = (y0 % cz) * cx;
    const r1 = ((y0 + 1) % cz) * cx;
    for (let i = 0; i < n; i++) {
      const fx = i * sx;
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const wx = tx * tx * tx * (tx * (tx * 6 - 15) + 10);
      const c0 = x0 % cx;
      const c1 = (x0 + 1) % cx;
      const a = g[r0 + c0] + (g[r0 + c1] - g[r0 + c0]) * wx;
      const b = g[r1 + c0] + (g[r1 + c1] - g[r1 + c0]) * wx;
      out[j * n + i] = a + (b - a) * wy;
    }
  }
  return out;
}

/**
 * 雪面の細かな凹凸のタイル（継ぎ目なし）。RG に傾き（±1 を 0〜255 へ）、B に高さ、A は 255。
 * 風紋のように一方向へ流れた模様にするため、X 方向の波長を長くした雑音を混ぜる。
 */
export function buildMicroTile(n = 512, seed = 20261110) {
  const rand = mulberry(seed);
  const h = new Float32Array(n * n);
  const octaves = [
    { cx: 6, cz: 14, amp: 1.0 },   // 風紋：X に長く、Z に短い
    { cx: 16, cz: 32, amp: 0.55 },
    { cx: 48, cz: 48, amp: 0.3 },
    { cx: 128, cz: 128, amp: 0.16 }, // 粒
  ];
  for (const o of octaves) {
    const base = periodicNoise(n, o.cx, o.cz, rand);
    for (let i = 0; i < h.length; i++) h[i] += base[i] * o.amp;
  }
  const out = new Uint8Array(n * n * 4);
  const scale = 2.2; // 傾きの強さ（見た目の調整値）
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < h.length; i++) { if (h[i] < lo) lo = h[i]; if (h[i] > hi) hi = h[i]; }
  for (let j = 0; j < n; j++) {
    const jm = ((j - 1 + n) % n) * n;
    const jp = ((j + 1) % n) * n;
    for (let i = 0; i < n; i++) {
      const im = (i - 1 + n) % n;
      const ip = (i + 1) % n;
      const sx = (h[j * n + ip] - h[j * n + im]) * scale;
      const sz = (h[jp + i] - h[jm + i]) * scale;
      const o = (j * n + i) * 4;
      out[o] = Math.max(0, Math.min(255, Math.round((sx * 0.5 + 0.5) * 255)));
      out[o + 1] = Math.max(0, Math.min(255, Math.round((sz * 0.5 + 0.5) * 255)));
      out[o + 2] = Math.round(((h[j * n + i] - lo) / (hi - lo)) * 255);
      out[o + 3] = 255;
    }
  }
  return out;
}
