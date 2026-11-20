// 質感を作るためのなめらかな乱数（値ノイズ）。樹皮・苔・和紙・木目・釉薬の模様に使う。
// 返す値は 0〜1。同じ座標・同じ種なら、いつも同じ値になる。

/** 整数の格子点ごとの、決まった乱数（0〜1）。 */
export function hash3(ix, iy, iz, seed = 0) {
  let h = (Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1) ^ Math.imul(iz | 0, 0x9e3779b1) ^ Math.imul(seed | 0, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

const smooth = (t) => t * t * (3 - 2 * t);
const mix = (a, b, t) => a + (b - a) * t;

export function valueNoise2(x, y, seed = 0) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const a = hash3(x0, y0, 0, seed);
  const b = hash3(x0 + 1, y0, 0, seed);
  const c = hash3(x0, y0 + 1, 0, seed);
  const d = hash3(x0 + 1, y0 + 1, 0, seed);
  return mix(mix(a, b, tx), mix(c, d, tx), ty);
}

export function valueNoise3(x, y, z, seed = 0) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const tz = smooth(z - z0);
  const at = (dx, dy, dz) => hash3(x0 + dx, y0 + dy, z0 + dz, seed);
  const lerpX = (dy, dz) => mix(at(0, dy, dz), at(1, dy, dz), tx);
  return mix(mix(lerpX(0, 0), lerpX(1, 0), ty), mix(lerpX(0, 1), lerpX(1, 1), ty), tz);
}

/** 重ね合わせたノイズ（0〜1）。octaves を増やすほど細かい模様が足される。 */
export function fbm2(x, y, seed = 0, octaves = 4, lacunarity = 2, gain = 0.5) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let fx = x;
  let fy = y;
  for (let i = 0; i < octaves; i += 1) {
    sum += amp * valueNoise2(fx, fy, seed + i * 101);
    norm += amp;
    amp *= gain;
    fx *= lacunarity;
    fy *= lacunarity;
  }
  return sum / norm;
}

export function fbm3(x, y, z, seed = 0, octaves = 4, lacunarity = 2, gain = 0.5) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let fx = x;
  let fy = y;
  let fz = z;
  for (let i = 0; i < octaves; i += 1) {
    sum += amp * valueNoise3(fx, fy, fz, seed + i * 101);
    norm += amp;
    amp *= gain;
    fx *= lacunarity;
    fy *= lacunarity;
    fz *= lacunarity;
  }
  return sum / norm;
}

/** 横にも縦にも、つなぎ目なく繰り返せるノイズ（タイル用）。period は格子の数。 */
export function tileNoise2(u, v, period, seed = 0, octaves = 4) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let p = Math.max(1, Math.round(period));
  for (let i = 0; i < octaves; i += 1) {
    const x = u * p;
    const y = v * p;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = smooth(x - x0);
    const ty = smooth(y - y0);
    const wrap = (n) => ((n % p) + p) % p;
    const a = hash3(wrap(x0), wrap(y0), 0, seed + i * 131);
    const b = hash3(wrap(x0 + 1), wrap(y0), 0, seed + i * 131);
    const c = hash3(wrap(x0), wrap(y0 + 1), 0, seed + i * 131);
    const d = hash3(wrap(x0 + 1), wrap(y0 + 1), 0, seed + i * 131);
    sum += amp * mix(mix(a, b, tx), mix(c, d, tx), ty);
    norm += amp;
    amp *= 0.5;
    p *= 2;
  }
  return sum / norm;
}
