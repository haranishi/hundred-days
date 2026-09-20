/* SVGパス（KanjiVGが使う M/m/C/c/S/s だけ）を折れ線に開く。

   ブラウザの SVGPathElement.getPointAtLength に頼らず自前で解いているのは、
   同じ関数を Node のテストからも呼べるようにするため。DOMには触れない。 */

const GROUP = { m: 2, c: 6, s: 4 };

export function tokenizePath(d) {
  const tokens = String(d).match(/[A-Za-z]|-?\d*\.?\d+/g) || [];
  const out = [];
  let i = 0;
  while (i < tokens.length) {
    const cmd = tokens[i++];
    const size = GROUP[cmd.toLowerCase()];
    if (!size) throw new Error(`扱えないコマンド: ${cmd}`);
    const groups = [];
    while (i < tokens.length && !/[A-Za-z]/.test(tokens[i])) {
      const g = tokens.slice(i, i + size).map(Number);
      if (g.length < size || g.some((n) => !Number.isFinite(n))) {
        throw new Error(`引数の数が合わない: ${cmd}`);
      }
      groups.push(g);
      i += size;
    }
    if (!groups.length) throw new Error(`引数がない: ${cmd}`);
    out.push({ cmd, groups });
  }
  return out;
}

/* 3次ベジエを steps 等分して折れ線にする。KanjiVG の1画は曲線1〜6本なので
   steps=16 で十分なめらかになる。 */
export function toPolyline(d, steps = 16) {
  const points = [];
  let cur = [0, 0];
  let prevCtrl = null;
  const push = (p) => {
    const last = points[points.length - 1];
    if (!last || Math.hypot(last[0] - p[0], last[1] - p[1]) > 1e-6) points.push(p);
  };
  const cubic = (p0, p1, p2, p3) => {
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      push([
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
      ]);
    }
  };
  for (const { cmd, groups } of tokenizePath(d)) {
    const rel = cmd === cmd.toLowerCase();
    for (const g of groups) {
      const at = (x, y) => (rel ? [cur[0] + x, cur[1] + y] : [x, y]);
      if (cmd.toLowerCase() === 'm') {
        cur = at(g[0], g[1]);
        push(cur);
        prevCtrl = null;
      } else if (cmd.toLowerCase() === 'c') {
        const p1 = at(g[0], g[1]);
        const p2 = at(g[2], g[3]);
        const p3 = at(g[4], g[5]);
        cubic(cur, p1, p2, p3);
        prevCtrl = p2;
        cur = p3;
      } else {
        /* S/s は直前の制御点を折り返す */
        const p1 = prevCtrl ? [2 * cur[0] - prevCtrl[0], 2 * cur[1] - prevCtrl[1]] : cur;
        const p2 = at(g[0], g[1]);
        const p3 = at(g[2], g[3]);
        cubic(cur, p1, p2, p3);
        prevCtrl = p2;
        cur = p3;
      }
    }
  }
  return points;
}

/* 折れ線の各点までの道のり。末尾が全長。 */
export function cumulativeLengths(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(
      cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
    );
  }
  return cum;
}

/* 道のりで等間隔に取り直す。筆の太さは「道のりのどこか」で決まるので、点が密な
   ところと粗いところがあると太さの変化がガタつく。 */
export function resample(points, cum, count) {
  const total = cum[cum.length - 1];
  if (!(total > 0) || count < 2) return points.slice(0, 1);
  const out = [];
  let j = 0;
  for (let i = 0; i < count; i++) {
    const target = (total * i) / (count - 1);
    while (j < cum.length - 2 && cum[j + 1] < target) j++;
    const span = cum[j + 1] - cum[j];
    const t = span > 0 ? (target - cum[j]) / span : 0;
    out.push([
      points[j][0] + (points[j + 1][0] - points[j][0]) * t,
      points[j][1] + (points[j + 1][1] - points[j][1]) * t,
    ]);
  }
  return out;
}

/* 1画ぶんの下ごしらえ。描画のたびに解き直さないよう、最初に1回だけ呼ぶ。 */
export function prepareStroke(d, spacing = 1.2) {
  const raw = toPolyline(d);
  const cum = cumulativeLengths(raw);
  const total = cum[cum.length - 1];
  const count = Math.max(6, Math.min(220, Math.ceil(total / spacing) + 1));
  return { points: resample(raw, cum, count), length: total };
}
