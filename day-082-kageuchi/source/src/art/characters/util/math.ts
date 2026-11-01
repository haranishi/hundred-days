// OWNER: chars-art
// 小さな数の道具。毎コマ呼ばれるので、どれも新しい物を作らない。

export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

export function clamp(x: number, a: number, b: number): number {
  return x < a ? a : x > b ? b : x;
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** 0→1 の値を、端で速さ0になる S 字に曲げる。 */
export function ease(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/** smootherstep（2階微分まで連続）。 */
export function ease5(t: number): number {
  const x = clamp01(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

export function frac(x: number): number {
  return x - Math.floor(x);
}

/** 2つの値のなめらかな最小（k は丸める幅）。 */
export function smin(a: number, b: number, k: number): number {
  const h = clamp01(0.5 + (0.5 * (b - a)) / k);
  return lerp(b, a, h) - k * h * (1 - h);
}

/** 文字列から 32 ビットの種を作る（FNV-1a）。 */
export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** 種つきの乱数（mulberry32）。0 以上 1 未満を返す関数。 */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 決まった時刻のキー列を Catmull-Rom で補間する（速さも連続）。keys は昇順の t と値の組。
 * 端の外は端の値を保つ。
 */
export function sampleKeys(ts: readonly number[], vs: readonly number[], t: number): number {
  const n = ts.length;
  if (n === 0) return 0;
  if (t <= ts[0]) return vs[0];
  if (t >= ts[n - 1]) return vs[n - 1];
  let i = 0;
  while (i < n - 2 && t > ts[i + 1]) i++;
  const t0 = ts[i];
  const t1 = ts[i + 1];
  const u = (t - t0) / (t1 - t0);
  const p0 = i > 0 ? vs[i - 1] : vs[i];
  const p1 = vs[i];
  const p2 = vs[i + 1];
  const p3 = i + 2 < n ? vs[i + 2] : vs[i + 1];
  // 区間の長さが違っても行き過ぎないよう、接線を区間の長さで割り戻す（不均等な Catmull-Rom）
  const tm = i > 0 ? ts[i - 1] : t0 - (t1 - t0);
  const tp = i + 2 < n ? ts[i + 2] : t1 + (t1 - t0);
  const m1 = ((p2 - p0) / (t1 - tm)) * (t1 - t0);
  const m2 = ((p3 - p1) / (tp - t0)) * (t1 - t0);
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p1 + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2 + (u3 - u2) * m2;
}
