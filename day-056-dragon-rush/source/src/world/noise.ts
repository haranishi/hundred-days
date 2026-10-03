// OWNER: world
// 決定的な値ノイズ（1次元・2次元）と、その重ね合わせ（fbm）。地形の起伏や色むらに使う。
import { hash01 } from '../core/rng';

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

export function valueNoise1(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash01(seed, i);
  const b = hash01(seed, i + 1);
  return a + (b - a) * fade(f);
}

export function valueNoise2(x: number, z: number, seed: number): number {
  const i = Math.floor(x);
  const j = Math.floor(z);
  const fx = fade(x - i);
  const fz = fade(z - j);
  const a = hash01(seed, i, j);
  const b = hash01(seed, i + 1, j);
  const c = hash01(seed, i, j + 1);
  const d = hash01(seed, i + 1, j + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

/** 1次元の fbm。戻り値はおよそ 0..1。 */
export function fbm1(x: number, seed: number, octaves = 5): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise1(x * freq, seed + o * 131);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

export function fbm2(x: number, z: number, seed: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise2(x * freq, z * freq, seed + o * 131);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}
