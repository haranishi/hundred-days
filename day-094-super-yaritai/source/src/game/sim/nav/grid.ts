/**
 * 歩ける場所の格子（0.5m）と A* の経路探し。CPU・店員・客が使う。
 * 動かない物（店のデータの当たり判定）だけから作る。動く商品やカートは避けずに押しのけて進む。
 */
import { NAV } from '../../../shared/rules/tuning';
import type { Box3, StoreLayout } from '../../../shared/layout/store';

export interface P2 {
  x: number;
  z: number;
}

/** 頭より低い所にある物だけが通せんぼになる（天井の照明などは無視） */
const BLOCK_BELOW = 1.7;

export class NavGrid {
  readonly cell: number;
  readonly x0: number;
  readonly z0: number;
  readonly cols: number;
  readonly rows: number;
  readonly blocked: Uint8Array;

  constructor(x0: number, z0: number, x1: number, z1: number, cell: number) {
    this.cell = cell;
    this.x0 = x0;
    this.z0 = z0;
    this.cols = Math.round((x1 - x0) / cell);
    this.rows = Math.round((z1 - z0) / cell);
    this.blocked = new Uint8Array(this.cols * this.rows);
  }

  static fromLayout(layout: StoreLayout, clearance: number = NAV.clearance): NavGrid {
    const b = layout.bounds;
    const g = new NavGrid(b.x0, b.z0, b.x1, b.z1, NAV.cell);
    const boxes: Box3[] = [];
    for (const f of layout.fixtures) for (const c of f.colliders) if (c.min.y < BLOCK_BELOW) boxes.push(c);
    for (let r = 0; r < g.rows; r++) {
      for (let c = 0; c < g.cols; c++) {
        const p = g.center(c, r);
        // 店の内側の壁から clearance 以内も歩かない
        let blocked = p.x < b.x0 + clearance || p.x > b.x1 - clearance || p.z < b.z0 + clearance || p.z > b.z1 - clearance;
        for (let i = 0; !blocked && i < boxes.length; i++) {
          const k = boxes[i]!;
          if (k.max.x - k.min.x > 30 || k.max.z - k.min.z > 30) continue; // 外周の壁は上で見ている
          blocked = p.x > k.min.x - clearance && p.x < k.max.x + clearance && p.z > k.min.z - clearance && p.z < k.max.z + clearance;
        }
        g.blocked[r * g.cols + c] = blocked ? 1 : 0;
      }
    }
    return g;
  }

  center(c: number, r: number): P2 {
    return { x: this.x0 + (c + 0.5) * this.cell, z: this.z0 + (r + 0.5) * this.cell };
  }

  cellOf(x: number, z: number): [number, number] {
    const c = Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.x0) / this.cell)));
    const r = Math.min(this.rows - 1, Math.max(0, Math.floor((z - this.z0) / this.cell)));
    return [c, r];
  }

  freeCell(c: number, r: number): boolean {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows && this.blocked[r * this.cols + c] === 0;
  }

  isFree(x: number, z: number): boolean {
    const [c, r] = this.cellOf(x, z);
    return this.freeCell(c, r);
  }

  /** いちばん近い歩けるマスの中心（自分が歩けるならそのまま） */
  nearestFree(x: number, z: number, maxRing = 12): P2 | null {
    const [c0, r0] = this.cellOf(x, z);
    if (this.freeCell(c0, r0)) return { x, z };
    for (let ring = 1; ring <= maxRing; ring++) {
      let best: P2 | null = null;
      let bestD = Infinity;
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          if (!this.freeCell(c0 + dc, r0 + dr)) continue;
          const p = this.center(c0 + dc, r0 + dr);
          const d = (p.x - x) ** 2 + (p.z - z) ** 2;
          if (d < bestD) {
            bestD = d;
            best = p;
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** 線分の上がすべて歩けるか（マスの1/3刻みで調べる） */
  lineOfSight(a: P2, b: P2): boolean {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len / (this.cell / 3)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (!this.isFree(a.x + dx * t, a.z + dz * t)) return false;
    }
    return true;
  }

  /**
   * A*（8方向・角の斜め抜けなし）で道を探し、見通しの利く点を飛ばして短くする。
   * 返す点の列は from を含まず、最後が to（歩けない所なら近くの歩けるマス）。見つからなければ null。
   */
  findPath(from: P2, to: P2): P2[] | null {
    const start = this.nearestFree(from.x, from.z);
    const goal = this.nearestFree(to.x, to.z);
    if (!start || !goal) return null;
    const [sc, sr] = this.cellOf(start.x, start.z);
    const [gc, gr] = this.cellOf(goal.x, goal.z);
    const n = this.cols * this.rows;
    const gScore = new Float32Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const heap = new MinHeap();
    const si = sr * this.cols + sc;
    const gi = gr * this.cols + gc;
    gScore[si] = 0;
    heap.push(si, this.h(sc, sr, gc, gr));
    let found = false;
    while (heap.size > 0) {
      const cur = heap.pop();
      if (cur === gi) {
        found = true;
        break;
      }
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cc = cur % this.cols;
      const cr = (cur - cc) / this.cols;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nc = cc + dc;
          const nr = cr + dr;
          if (!this.freeCell(nc, nr)) continue;
          if (dr !== 0 && dc !== 0 && (!this.freeCell(cc + dc, cr) || !this.freeCell(cc, cr + dr))) continue;
          const ni = nr * this.cols + nc;
          if (closed[ni]) continue;
          const ng = gScore[cur]! + (dr !== 0 && dc !== 0 ? Math.SQRT2 : 1);
          if (ng < gScore[ni]!) {
            gScore[ni] = ng;
            came[ni] = cur;
            heap.push(ni, ng + this.h(nc, nr, gc, gr));
          }
        }
      }
    }
    if (!found) return null;
    const cells: P2[] = [];
    for (let i = gi; i !== -1 && i !== si; i = came[i]!) cells.push(this.center(i % this.cols, Math.floor(i / this.cols)));
    cells.reverse();
    if (cells.length > 0) cells[cells.length - 1] = goal;
    else cells.push(goal);
    // 見通しの利く点は飛ばす（ジグザグを減らす）
    const out: P2[] = [];
    let anchor: P2 = start;
    let i = 0;
    while (i < cells.length) {
      let j = cells.length - 1;
      while (j > i && !this.lineOfSight(anchor, cells[j]!)) j--;
      out.push(cells[j]!);
      anchor = cells[j]!;
      i = j + 1;
    }
    return out;
  }

  /** 経路の長さ（m） */
  static pathLength(from: P2, path: readonly P2[]): number {
    let d = 0;
    let p = from;
    for (const q of path) {
      d += Math.hypot(q.x - p.x, q.z - p.z);
      p = q;
    }
    return d;
  }

  private h(c: number, r: number, gc: number, gr: number): number {
    const dx = Math.abs(c - gc);
    const dz = Math.abs(r - gr);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  }
}

/** A* 用の小さな二分ヒープ（添え字と優先度） */
class MinHeap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size(): number {
    return this.ids.length;
  }
  push(id: number, key: number): void {
    this.ids.push(id);
    this.keys.push(key);
    let i = this.ids.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p]! <= key) break;
      this.ids[i] = this.ids[p]!;
      this.keys[i] = this.keys[p]!;
      i = p;
    }
    this.ids[i] = id;
    this.keys[i] = key;
  }
  pop(): number {
    const top = this.ids[0]!;
    const lastId = this.ids.pop()!;
    const lastKey = this.keys.pop()!;
    if (this.ids.length > 0) {
      let i = 0;
      const n = this.ids.length;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        let mk = lastKey;
        if (l < n && this.keys[l]! < mk) {
          m = l;
          mk = this.keys[l]!;
        }
        if (r < n && this.keys[r]! < mk) m = r;
        if (m === i) break;
        this.ids[i] = this.ids[m]!;
        this.keys[i] = this.keys[m]!;
        i = m;
      }
      this.ids[i] = lastId;
      this.keys[i] = lastKey;
    }
    return top;
  }
}
