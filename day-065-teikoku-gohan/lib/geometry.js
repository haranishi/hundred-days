// 線路の形の計算（折れ線の長さ・途中の点・両端の切り詰め・平行線）。座標は盤の単位（360×240）。

export function edgePoints(level, edge) {
  return [level.nodes[edge.from].pos, ...(edge.via ?? []), level.nodes[edge.to].pos].map(([x, y]) => [x, y]);
}

const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

export function polyLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return len;
}

// 始点から d の位置の点と、その向き（ラジアン）
export function pointAt(pts, d) {
  let rest = Math.max(0, d);
  for (let i = 1; i < pts.length; i++) {
    const seg = dist(pts[i - 1], pts[i]);
    if (rest <= seg || i === pts.length - 1) {
      const u = seg === 0 ? 0 : Math.min(1, rest / seg);
      const [ax, ay] = pts[i - 1];
      const [bx, by] = pts[i];
      return { x: ax + (bx - ax) * u, y: ay + (by - ay) * u, angle: Math.atan2(by - ay, bx - ax) };
    }
    rest -= seg;
  }
  const [x, y] = pts[0];
  return { x, y, angle: 0 };
}

// 折れ線の a〜b の部分（始点からの距離で指定）
export function subPath(pts, a, b) {
  const out = [];
  const start = pointAt(pts, a);
  out.push([start.x, start.y]);
  let walked = 0;
  for (let i = 1; i < pts.length; i++) {
    walked += dist(pts[i - 1], pts[i]);
    if (walked > a && walked < b) out.push([...pts[i]]);
  }
  const end = pointAt(pts, b);
  out.push([end.x, end.y]);
  return out;
}

// 中心から向き (dx,dy) に進んで、幅 2hw・高さ 2hh の長方形の縁に当たるまでの距離
export function rectExit(hw, hh, dx, dy) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < 1e-9 && ay < 1e-9) return 0;
  const tx = ax < 1e-9 ? Infinity : hw / ax;
  const ty = ay < 1e-9 ? Infinity : hh / ay;
  return Math.min(tx, ty);
}

// 片側に d だけずらした平行線（角はとがらせてつなぐ）
export function offsetPolyline(pts, d) {
  const normals = [];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0];
    const dy = pts[i][1] - pts[i - 1][1];
    const len = Math.hypot(dx, dy) || 1;
    normals.push([-dy / len, dx / len]);
  }
  return pts.map((p, i) => {
    const n1 = normals[Math.max(0, i - 1)];
    const n2 = normals[Math.min(normals.length - 1, i)];
    let mx = n1[0] + n2[0];
    let my = n1[1] + n2[1];
    const ml = Math.hypot(mx, my) || 1;
    mx /= ml;
    my /= ml;
    const cos = mx * n1[0] + my * n1[1] || 1;
    return [p[0] + (mx * d) / cos, p[1] + (my * d) / cos];
  });
}

export const pointsAttr = (pts) => pts.map(([x, y]) => `${round(x)},${round(y)}`).join(' ');
export const round = (v) => Math.round(v * 100) / 100;
