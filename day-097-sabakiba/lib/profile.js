// 寸法表の長さは %SL、駅とその断面寸法は SL を 1 とした比で扱います。
export const clamp01 = (x) => Math.max(0, Math.min(1, x));

// 不等間隔の PCHIP。極大・極小と平らな区間の両端では傾きを 0 にします。
export function pchip(xs, ys) {
  if (xs.length !== ys.length || xs.length < 2) throw new RangeError('補間には2駅以上必要です。');
  const intervals = xs.slice(1).map((x, i) => x - xs[i]);
  if (!intervals.every((h) => h > 0)) throw new RangeError('駅は昇順で指定します。');
  const slopes = intervals.map((h, i) => (ys[i + 1] - ys[i]) / h);
  const last = xs.length - 1;
  function endSlope(h0, h1, d0, d1) {
    const m = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
    if (Math.sign(m) !== Math.sign(d0)) return 0;
    if (Math.sign(d0) !== Math.sign(d1) && Math.abs(m) > 3 * Math.abs(d0)) return 3 * d0;
    return m;
  }
  const tangents = [slopes[0]];
  for (let i = 1; i < last; i++) {
    const a = slopes[i - 1], b = slopes[i];
    const w1 = 2 * intervals[i] + intervals[i - 1], w2 = intervals[i] + 2 * intervals[i - 1];
    tangents[i] = a * b > 0 ? (w1 + w2) / (w1 / a + w2 / b) : 0;
  }
  tangents[last] = slopes[last - 1];
  if (last > 1) {
    tangents[0] = endSlope(intervals[0], intervals[1], slopes[0], slopes[1]);
    tangents[last] = endSlope(intervals[last - 1], intervals[last - 2], slopes[last - 1], slopes[last - 2]);
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[last]) return ys[last];
    let lo = 0, hi = last;
    while (hi - lo > 1) {
      const mid = (lo + hi) >>> 1;
      if (x < xs[mid]) hi = mid;
      else lo = mid;
    }
    const h = intervals[lo], t = (x - xs[lo]) / h, u = 1 - t;
    return u * u * ((1 + 2 * t) * ys[lo] + t * h * tangents[lo])
      + t * t * ((3 - 2 * t) * ys[hi] - u * h * tangents[hi]);
  };
}

export function profileFromKeyMeasures(shape = {}, family = 'round') {
  const flat = family === 'flat';
  const depth = (shape.maxDepth ?? (flat ? 45 : 25)) / 100;
  const width = (shape.maxWidth ?? (flat ? 6 : 12)) / 100;
  const peak = (shape.maxDepthPos ?? 40) / 100, wide = peak * 0.9;
  const peduncle = (shape.peduncleDepth ?? 4) / 100;
  const belly = shape.belly ?? 0.94;
  // 吻から肩は丸みのある弧、肩から尾柄は両端の傾きが 0 の曲線です。
  function outline(s, at, maximum, end, fullness) {
    if (s < at) {
      const u = s / at, arc = u * (2 - u);
      return maximum * Math.sqrt(arc) * (fullness + (1 - fullness) * arc);
    }
    const t = (s - at) / (1 - at);
    return end + (maximum - end) * (1 - t) ** 2 * (1 + 2 * t);
  }
  const stations = new Set([0, 0.001, 0.004, 0.012, peak, wide, 1]);
  for (let i = 1; i < 32; i++) stations.add(i / 32);
  return [...stations].sort((a, b) => a - b).map((s) => {
    const height = outline(s, peak, depth, peduncle, 0.75);
    const half = outline(s, wide, width / 2, Math.min(width * 0.24, peduncle * 0.32), 0.65);
    const blend = clamp01(s / (peak * 0.6));
    const ease = blend * blend * (3 - 2 * blend);
    return { s, top: height / (1 + belly), bottom: height * belly / (1 + belly), half,
      nTop: 2 + (flat ? 0.6 : 0.3) * ease, nBottom: 2 + (flat ? 0.6 : 0.1) * ease, axisY: 0 };
  });
}

export function makeProfile(shape, family, SL) {
  const stations = profileFromKeyMeasures(shape, family);
  // √s を補間座標にすると、先端を極小の平面で切り落とさずに丸められます。
  const xs = stations.map(({ s }) => Math.sqrt(s));
  const fields = ['top', 'bottom', 'half', 'axisY', 'nTop', 'nBottom'].map((key) =>
    pchip(xs, stations.map((p) => p[key] * (key.startsWith('n') ? 1 : SL))));
  return (s) => {
    const x = Math.sqrt(clamp01(s));
    return { top: fields[0](x), bottom: fields[1](x), half: fields[2](x), axisY: fields[3](x),
      nTop: fields[4](x), nBottom: fields[5](x) };
  };
}
