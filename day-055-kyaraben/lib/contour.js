// 2値マスクの輪郭を多角形にする。型紙は印刷して切るので、画素のギザギザは消すが、形は崩さない程度にだけなめらかにする

// 1マスの4隅（左上8・右上4・右下2・左下1）から、通る辺の組を決める。
// 向きは「内側を右手に見る」にそろえ、始点から終点をたどれば輪が閉じるようにする。
// 斜めに接する画素（5・10）はつながっているとみなす（パーツを8連結で数えるのと合わせる）
const T = 0;
const R = 1;
const B = 2;
const L = 3;
const CASES = [
  [], [[L, B]], [[B, R]], [[L, R]], [[R, T]], [[L, T], [R, B]], [[B, T]], [[L, T]],
  [[T, L]], [[T, B]], [[T, R], [B, L]], [[T, R]], [[R, L]], [[R, B]], [[B, L]], [],
];

// 画素 (x, y) は [x, x+1] × [y, y+1] を占める座標で返す（n 画素の正方形は幅 n になる）
function marching(mask, w, h) {
  const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? mask[y * w + x] : 0);
  const stride = 2 * w + 4;
  // 辺の中点は半画素の格子に乗るので、2倍した整数で持つと端点を確実に突き合わせられる
  const key = (cx, cy, edge) => {
    if (edge === T) return (2 * cy + 1) * stride + 2 * cx + 2;
    if (edge === R) return (2 * cy + 2) * stride + 2 * cx + 3;
    if (edge === B) return (2 * cy + 3) * stride + 2 * cx + 2;
    return (2 * cy + 2) * stride + 2 * cx + 1;
  };
  const next = new Map();
  for (let cy = -1; cy < h; cy++) {
    for (let cx = -1; cx < w; cx++) {
      const c = (at(cx, cy) ? 8 : 0) | (at(cx + 1, cy) ? 4 : 0) | (at(cx + 1, cy + 1) ? 2 : 0) | (at(cx, cy + 1) ? 1 : 0);
      if (c === 0 || c === 15) continue;
      for (const [a, b] of CASES[c]) next.set(key(cx, cy, a), key(cx, cy, b));
    }
  }
  const loops = [];
  for (const start of next.keys()) {
    if (!next.has(start)) continue;
    const loop = [];
    let k = start;
    while (next.has(k)) {
      const nk = next.get(k);
      next.delete(k);
      loop.push([(k % stride) / 2, Math.floor(k / stride) / 2]);
      k = nk;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

function segmentDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

function rdp(points, eps) {
  const n = points.length;
  if (n < 3) return points.slice();
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = segmentDistance(points[i], points[a], points[b]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > eps) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

// 閉じた輪は、始点といちばん遠い点で2本に分けてから間引く（始点の角が不自然に残らないように）
function simplifyClosed(loop, eps) {
  if (loop.length <= 4) return loop;
  let far = 0;
  let best = -1;
  for (let i = 1; i < loop.length; i++) {
    const d = (loop[i][0] - loop[0][0]) ** 2 + (loop[i][1] - loop[0][1]) ** 2;
    if (d > best) {
      best = d;
      far = i;
    }
  }
  const a = rdp(loop.slice(0, far + 1), eps);
  const b = rdp([...loop.slice(far), loop[0]], eps);
  const out = [...a.slice(0, -1), ...b.slice(0, -1)];
  return out.length >= 4 ? out : loop;
}

// Chaikin の角切り。長い辺の角まで大きく丸めると四角が崩れるので、切る長さに上限をつける
function chaikin(loop, times, cap = 1.2) {
  let pts = loop;
  for (let it = 0; it < times; it++) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      const dx = q[0] - p[0];
      const dy = q[1] - p[1];
      const len = Math.hypot(dx, dy);
      const t = len > 0 ? Math.min(0.25, cap / len) : 0.25;
      out.push([p[0] + dx * t, p[1] + dy * t], [q[0] - dx * t, q[1] - dy * t]);
    }
    pts = out;
  }
  return pts;
}

export function traceMask(mask, w, h, { epsilon = 0.6, smooth = 2 } = {}) {
  return marching(mask, w, h).map((loop) => chaikin(simplifyClosed(loop, epsilon), smooth));
}

// 外周は正、穴は負（y が下向きの座標で「内側を右手」にたどるため）
export function polyArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

export function polyPerimeter(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    s += Math.hypot(x2 - x1, y2 - y1);
  }
  return s;
}

// SVG の d と Path2D の両方にそのまま渡せる文字列。穴は evenodd で抜く前提
export function toPathD(polys, scale = 1, offsetX = 0, offsetY = 0) {
  const f = (v) => String(Math.round(v * 100) / 100);
  return polys.map((poly) => 'M' + poly.map(([x, y]) => `${f(x * scale + offsetX)} ${f(y * scale + offsetY)}`).join('L') + 'Z').join('');
}
