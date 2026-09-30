// 歩ける場所の格子と、押した場所までの道順。
// 格子は5cm角。壁と家具から体の半径より近い升を塗りつぶす（角は丸く太らせる）。
// 体験評価の1周目で、出入口の角で止まる・押し直しても動かない、が34回中16回起きた。
// そこで ①角を丸くする ②道順は壁から離れた通路の真ん中を選ぶ ③角に当たったら横へ滑る、の3つで歩きを作り直した。
import { HOUSE, WALLS } from './plan.js';

export const CELL = 0.05;
/* 体の半径。0.24m では壁に近づくと画面が壁一色になった（評価の B4）。肩幅くらいの距離を残す */
export const BODY_RADIUS = 0.3;
/* 道順を選ぶとき、塞がった升からこの距離（m）より近い升を遠回りに数える */
const COMFORT = 0.28;

const RAD = Math.PI / 180;

/** 歩くときに通れない壁の部分（扉の開口だけ抜く。窓は腰壁があるので通れない） */
export function wallRects() {
  const rects = [];
  for (const w of WALLS) {
    const alongX = w.a[1] === w.b[1];
    const from = alongX ? w.a[0] : w.a[1];
    const to = alongX ? w.b[0] : w.b[1];
    const gaps = w.openings.filter(o => o.kind === 'door').sort((p, q) => p.from - q.from);
    let cursor = from - w.t / 2;
    const pieces = [];
    for (const g of gaps) {
      pieces.push([cursor, g.from]);
      cursor = g.to;
    }
    pieces.push([cursor, to + w.t / 2]);
    for (const [s, e] of pieces) {
      if (e - s <= 0) continue;
      const mid = (s + e) / 2;
      const half = (e - s) / 2;
      rects.push(alongX
        ? { cx: mid, cz: w.a[1], hx: half, hz: w.t / 2, yaw: 0 }
        : { cx: w.a[0], cz: mid, hx: w.t / 2, hz: half, yaw: 0 });
    }
  }
  return rects;
}

/** 回転した長方形までの距離（m）。中なら0 */
export function distToRect(r, x, z) {
  const t = -r.yaw * RAD;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const dx = x - r.cx;
  const dz = z - r.cz;
  const lx = dx * c + dz * s;
  const lz = -dx * s + dz * c;
  const ox = Math.max(0, Math.abs(lx) - r.hx);
  const oz = Math.max(0, Math.abs(lz) - r.hz);
  return Math.hypot(ox, oz);
}

export class NavGrid {
  constructor(obstacleRects, { radius = BODY_RADIUS } = {}) {
    this.cols = Math.round(HOUSE.width / CELL);
    this.rows = Math.round(HOUSE.depth / CELL);
    const n = this.cols * this.rows;
    this.blocked = new Uint8Array(n);
    this.radius = radius;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = (c + 0.5) * CELL;
        const z = (r + 0.5) * CELL;
        if (x < radius || z < radius || x > HOUSE.width - radius || z > HOUSE.depth - radius) this.blocked[r * this.cols + c] = 1;
      }
    }
    // 歩くときの当たり判定は、升目でなくこの長方形そのもので計算する（move）
    this.rects = [...wallRects(), ...obstacleRects].map(r => {
      const t = -r.yaw * RAD;
      return { ...r, cos: Math.cos(t), sin: Math.sin(t), reach: Math.hypot(r.hx, r.hz) };
    });
    // 長方形ごとに、外接する範囲の升だけを調べる
    for (const rect of this.rects) {
      const reach = Math.hypot(rect.hx, rect.hz) + radius;
      const c0 = Math.max(0, Math.floor((rect.cx - reach) / CELL));
      const c1 = Math.min(this.cols - 1, Math.ceil((rect.cx + reach) / CELL));
      const r0 = Math.max(0, Math.floor((rect.cz - reach) / CELL));
      const r1 = Math.min(this.rows - 1, Math.ceil((rect.cz + reach) / CELL));
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          if (distToRect(rect, (c + 0.5) * CELL, (r + 0.5) * CELL) < radius) this.blocked[r * this.cols + c] = 1;
        }
      }
    }
    this.clearance = this.#clearanceField();
  }

  /** 各升から、いちばん近い塞がった升までの距離（m）。2回の走査で近似する */
  #clearanceField() {
    const { cols, rows } = this;
    const INF = 1e9;
    const d = new Float32Array(cols * rows);
    for (let i = 0; i < d.length; i++) d[i] = this.blocked[i] ? 0 : INF;
    const a = 1;
    const b = Math.SQRT2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (!d[i]) continue;
        let v = d[i];
        if (c > 0) v = Math.min(v, d[i - 1] + a);
        if (r > 0) {
          v = Math.min(v, d[i - cols] + a);
          if (c > 0) v = Math.min(v, d[i - cols - 1] + b);
          if (c < cols - 1) v = Math.min(v, d[i - cols + 1] + b);
        }
        d[i] = v;
      }
    }
    for (let r = rows - 1; r >= 0; r--) {
      for (let c = cols - 1; c >= 0; c--) {
        const i = r * cols + c;
        if (!d[i]) continue;
        let v = d[i];
        if (c < cols - 1) v = Math.min(v, d[i + 1] + a);
        if (r < rows - 1) {
          v = Math.min(v, d[i + cols] + a);
          if (c < cols - 1) v = Math.min(v, d[i + cols + 1] + b);
          if (c > 0) v = Math.min(v, d[i + cols - 1] + b);
        }
        d[i] = v;
      }
    }
    for (let i = 0; i < d.length; i++) d[i] = d[i] >= INF ? 99 : d[i] * CELL;
    return d;
  }

  cellOf(x, z) {
    return [Math.floor(x / CELL), Math.floor(z / CELL)];
  }

  isFreeCell(c, r) {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows && !this.blocked[r * this.cols + c];
  }

  isFree(x, z) {
    const [c, r] = this.cellOf(x, z);
    return this.isFreeCell(c, r);
  }

  /** その点の、塞がった升までの距離（m）。塞がっていれば0 */
  clearanceAt(x, z) {
    const [c, r] = this.cellOf(x, z);
    if (!this.isFreeCell(c, r)) return 0;
    return this.clearance[r * this.cols + c];
  }

  /**
   * 壁や家具に沿って滑るように動かす。戻り値は新しい位置。
   * 升目で判定すると角を回り込むときに升の境でつかえる（評価の1周目で出入口の角に止まった）ので、
   * 体を半径 radius の円とみなし、長方形との重なりを押し戻す。角は丸く、壁には沿って滑る。
   */
  move(x, z, dx, dz) {
    const len = Math.hypot(dx, dz);
    if (len === 0) return [x, z];
    const steps = Math.max(1, Math.ceil(len / 0.04));
    let px = x;
    let pz = z;
    const R = this.radius;
    for (let i = 0; i < steps; i++) {
      px += dx / steps;
      pz += dz / steps;
      for (let iter = 0; iter < 4; iter++) {
        let pushed = false;
        for (const r of this.rects) {
          const wx = px - r.cx;
          const wz = pz - r.cz;
          if (Math.abs(wx) > r.reach + R || Math.abs(wz) > r.reach + R) continue;
          const lx = wx * r.cos + wz * r.sin;
          const lz = -wx * r.sin + wz * r.cos;
          const qx = Math.max(-r.hx, Math.min(r.hx, lx));
          const qz = Math.max(-r.hz, Math.min(r.hz, lz));
          let ox = lx - qx;
          let oz = lz - qz;
          let d = Math.hypot(ox, oz);
          if (d >= R) continue;
          let push;
          if (d < 1e-7) {
            // 長方形の中にいる：いちばん浅い向きへ出す
            const px2 = r.hx - Math.abs(lx);
            const pz2 = r.hz - Math.abs(lz);
            if (px2 < pz2) { ox = Math.sign(lx) || 1; oz = 0; push = px2 + R; }
            else { ox = 0; oz = Math.sign(lz) || 1; push = pz2 + R; }
            d = 1;
          } else {
            push = R - d;
          }
          const nlx = lx + (ox / d) * push;
          const nlz = lz + (oz / d) * push;
          px = r.cx + nlx * r.cos - nlz * r.sin;
          pz = r.cz + nlx * r.sin + nlz * r.cos;
          pushed = true;
        }
        if (!pushed) break;
      }
      px = Math.max(R, Math.min(HOUSE.width - R, px));
      pz = Math.max(R, Math.min(HOUSE.depth - R, pz));
    }
    return [px, pz];
  }

  /** いちばん近い歩ける点（見つからなければ null） */
  nearestFree(x, z, maxDist = 2) {
    const [c0, r0] = this.cellOf(x, z);
    if (this.isFreeCell(c0, r0)) return [x, z];
    const maxR = Math.ceil(maxDist / CELL);
    for (let d = 1; d <= maxR; d++) {
      let best = null;
      let bestD = Infinity;
      for (let dr = -d; dr <= d; dr++) {
        for (let dc = -d; dc <= d; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== d) continue;
          const c = c0 + dc;
          const r = r0 + dr;
          if (!this.isFreeCell(c, r)) continue;
          const cx = (c + 0.5) * CELL;
          const cz = (r + 0.5) * CELL;
          const dd = Math.hypot(cx - x, cz - z);
          if (dd < bestD) { bestD = dd; best = [cx, cz]; }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** 2点の間をまっすぐ歩けるか。minClear を渡すと、塞がった升からその距離以上離れた線だけを通す */
  clearLine(ax, az, bx, bz, minClear = 0) {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / (CELL * 0.5));
    for (let i = 0; i <= n; i++) {
      const t = n === 0 ? 0 : i / n;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      if (!this.isFree(x, z)) return false;
      if (minClear > 0 && this.clearanceAt(x, z) < minClear) return false;
    }
    return true;
  }

  /**
   * A* で道順を探し、見通せる角だけ残して返す（[[x,z], ...]・最初は出発点）。
   * 壁の近くの升は遠回りに数えるので、道順は出入口や廊下の真ん中を通る。
   */
  path(ax, az, bx, bz) {
    const goal = this.nearestFree(bx, bz);
    const start = this.nearestFree(ax, az, 0.6);
    if (!goal || !start) return null;
    const [sc, sr] = this.cellOf(start[0], start[1]);
    const [gc, gr] = this.cellOf(goal[0], goal[1]);
    const n = this.cols * this.rows;
    const g = new Float32Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const heap = new MinHeap();
    const si = sr * this.cols + sc;
    const gi = gr * this.cols + gc;
    g[si] = 0;
    const h = (c, r) => {
      const dx = Math.abs(c - gc);
      const dy = Math.abs(r - gr);
      return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
    };
    heap.push(si, h(sc, sr));
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    let found = false;
    while (heap.size) {
      const cur = heap.pop();
      if (closed[cur]) continue;
      if (cur === gi) { found = true; break; }
      closed[cur] = 1;
      const c = cur % this.cols;
      const r = (cur - c) / this.cols;
      for (const [dc, dr, cost] of dirs) {
        const nc = c + dc;
        const nr = r + dr;
        if (!this.isFreeCell(nc, nr)) continue;
        if (dc && dr && (!this.isFreeCell(c + dc, r) || !this.isFreeCell(c, r + dr))) continue;
        const ni = nr * this.cols + nc;
        const tight = Math.max(0, COMFORT - this.clearance[ni]) / COMFORT;
        const ng = g[cur] + cost * (1 + 3 * tight);
        if (ng < g[ni]) {
          g[ni] = ng;
          came[ni] = cur;
          heap.push(ni, ng + h(nc, nr));
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let i = gi; i !== -1; i = came[i]) cells.push(i);
    cells.reverse();
    const pts = cells.map(i => [((i % this.cols) + 0.5) * CELL, (Math.floor(i / this.cols) + 0.5) * CELL]);
    pts[0] = [start[0], start[1]];
    pts[pts.length - 1] = [goal[0], goal[1]];
    // 見通せる点まで飛ばして、角だけを残す。飛ばす線は、通ってきた道と同じくらい壁から離れていること
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1) {
        const want = Math.min(0.08, this.clearanceAt(pts[i][0], pts[i][1]), this.clearanceAt(pts[j][0], pts[j][1]));
        if (this.clearLine(pts[i][0], pts[i][1], pts[j][0], pts[j][1], Math.max(0, want - 1e-6))) break;
        j--;
      }
      out.push(pts[j]);
      i = j;
    }
    return out;
  }
}

class MinHeap {
  constructor() { this.items = []; this.keys = []; }
  get size() { return this.items.length; }
  push(item, key) {
    const a = this.items;
    const k = this.keys;
    a.push(item); k.push(key);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [a[p], a[i]] = [a[i], a[p]];
      [k[p], k[i]] = [k[i], k[p]];
      i = p;
    }
  }
  pop() {
    const a = this.items;
    const k = this.keys;
    const top = a[0];
    const lastItem = a.pop();
    const lastKey = k.pop();
    if (a.length) {
      a[0] = lastItem; k[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && k[l] < k[m]) m = l;
        if (r < a.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        [k[m], k[i]] = [k[i], k[m]];
        i = m;
      }
    }
    return top;
  }
}
