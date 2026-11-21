// 時間と弧長の補間。端では入力の値をそのまま返し、手順の継ぎ目をそろえる。
export const clamp01 = (x) => x > 0 ? Math.min(x, 1) : 0;
export const lerp = (a, b, t) => t === 0 ? a : t === 1 ? b : a + (b - a) * t;
export const windowT = (u, [a, b]) => clamp01((u - a) / (b - a));
export function easeInOut(x) {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
}
export function easeOut(x) {
  const t = clamp01(x);
  return t * (2 - t);
}

export const mixVector = (a, b, t) => a.map((x, k) => lerp(x, b[k], t));
export const dot = (a, b) => a.reduce((sum, x, k) => sum + x * b[k], 0);
export const unit = (v) => {
  const length = Math.hypot(...v);
  return length ? v.map(x => x / length) : v.map(() => 0);
};
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
];

export function slerpQuat(a, b, fraction) {
  const t = clamp01(fraction);
  if (t === 0) return [...a];
  if (t === 1) return [...b];
  const cosine = dot(a, b);
  const end = cosine < 0 ? b.map(x => -x) : b;
  const c = Math.min(1, Math.abs(cosine));
  if (c > 0.9995) return unit(mixVector(a, end, t));
  const theta = Math.acos(c);
  const left = Math.sin((1 - t) * theta) / Math.sin(theta);
  const right = Math.sin(t * theta) / Math.sin(theta);
  return a.map((x, k) => x * left + end[k] * right);
}

// 同じ弧長を包丁・視点・練習で使う。重なった頂点には長さも方向も割り当てない。
export function measurePolyline(points) {
  if (!Array.isArray(points) || !points.every(p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite))) {
    throw new TypeError('切る線には有限な3次元の点が必要です。');
  }
  const segments = [];
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const delta = b.map((x, k) => x - a[k]);
    const size = Math.hypot(...delta);
    if (size === 0) continue;
    segments.push({ a: [...a], b: [...b], dir: delta.map(x => x / size), size, start: length });
    length += size;
  }
  if (!(length > 0) || !Number.isFinite(length)) throw new RangeError('切る線の長さが必要です。');
  return { segments, length };
}

export function pointOnPath({ segments, length }, t) {
  if (t <= 0) return [...segments[0].a];
  if (t >= 1) return [...segments.at(-1).b];
  const distance = clamp01(t) * length;
  let lo = 0, hi = segments.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (segments[mid].start <= distance) lo = mid;
    else hi = mid - 1;
  }
  const { a, b, start, size } = segments[lo];
  return mixVector(a, b, clamp01((distance - start) / size));
}
