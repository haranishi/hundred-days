// OWNER: core
// 番兵が壁を回り込むための 0.5m 格子と A*。格子はステージごとに一度だけ作る（やり直しでは作り直さない）。
// 格子の升は「その中心に体の円を置いても当たりに重ならない」なら通れる。
// 行けない場所（別の島）を目指したときに全体を探し回らないよう、島の番号を前もって振っておく。
import type { StageDef } from '../stage/types';
import { GUARD } from '../config/rules';
import { getQuery, type StageQuery } from './query';

export interface Pt {
  x: number;
  z: number;
}

const SQRT2 = Math.SQRT2;
/** A* の見積もりの重み（1 で最短。r01-core：毎秒何本も引くので 1.3 に）。 */
const H_WEIGHT = 1.3;
const NB_DX = [1, -1, 0, 0, 1, 1, -1, -1];
const NB_DZ = [0, 0, 1, -1, 1, -1, 1, -1];

export class NavGrid {
  readonly cell: number;
  readonly x0: number;
  readonly z0: number;
  readonly w: number;
  readonly h: number;
  /** 1＝通れる */
  readonly free: Uint8Array;
  /** 島の番号（通れない升は 0） */
  readonly island: Int32Array;
  private readonly g: Float32Array;
  private readonly parent: Int32Array;
  private readonly stamp: Uint32Array;
  private readonly closed: Uint32Array;
  private readonly heapIdx: Int32Array;
  private readonly heapF: Float32Array;
  private heapSize = 0;
  private run = 0;
  /** 直近の探索で広げた升の数（計測用）。 */
  lastExpanded = 0;

  constructor(q: StageQuery, radius: number, crouch: boolean, cell = 0.5) {
    const bd = q.stage.bounds;
    this.cell = cell;
    this.x0 = bd.x0;
    this.z0 = bd.z0;
    this.w = Math.floor((bd.x1 - bd.x0) / cell);
    this.h = Math.floor((bd.z1 - bd.z0) / cell);
    const n = this.w * this.h;
    this.free = new Uint8Array(n);
    for (let j = 0; j < this.h; j++) {
      for (let i = 0; i < this.w; i++) {
        this.free[j * this.w + i] = q.overlaps(this.cx(i), this.cz(j), radius, crouch) ? 0 : 1;
      }
    }
    this.island = new Int32Array(n);
    this.labelIslands();
    this.g = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.heapIdx = new Int32Array(n * 8 + 16);
    this.heapF = new Float32Array(n * 8 + 16);
  }

  cx(i: number): number {
    return this.x0 + (i + 0.5) * this.cell;
  }

  cz(j: number): number {
    return this.z0 + (j + 0.5) * this.cell;
  }

  indexAt(x: number, z: number): number {
    const i = Math.floor((x - this.x0) / this.cell);
    const j = Math.floor((z - this.z0) / this.cell);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return -1;
    return j * this.w + i;
  }

  isFreeAt(x: number, z: number): boolean {
    const k = this.indexAt(x, z);
    return k >= 0 && this.free[k] === 1;
  }

  private labelIslands(): void {
    let label = 0;
    const stack = new Int32Array(this.w * this.h);
    for (let s = 0; s < this.free.length; s++) {
      if (!this.free[s] || this.island[s]) continue;
      label++;
      let top = 0;
      stack[top++] = s;
      this.island[s] = label;
      while (top > 0) {
        const c = stack[--top];
        const ci = c % this.w;
        const cj = (c - ci) / this.w;
        for (let k = 0; k < 4; k++) {
          const ni = ci + NB_DX[k];
          const nj = cj + NB_DZ[k];
          if (ni < 0 || nj < 0 || ni >= this.w || nj >= this.h) continue;
          const nIdx = nj * this.w + ni;
          if (this.free[nIdx] && !this.island[nIdx]) {
            this.island[nIdx] = label;
            stack[top++] = nIdx;
          }
        }
      }
    }
  }

  /** 近くの通れる升（同じ島に限るなら island を渡す）。見つからなければ -1。 */
  nearestFree(x: number, z: number, island = 0, maxRing = 12): number {
    const i0 = Math.floor((x - this.x0) / this.cell);
    const j0 = Math.floor((z - this.z0) / this.cell);
    let best = -1;
    let bestD = Infinity;
    for (let ring = 0; ring <= maxRing; ring++) {
      for (let dj = -ring; dj <= ring; dj++) {
        for (let di = -ring; di <= ring; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== ring) continue;
          const i = i0 + di;
          const j = j0 + dj;
          if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue;
          const k = j * this.w + i;
          if (!this.free[k] || (island && this.island[k] !== island)) continue;
          const d = (this.cx(i) - x) ** 2 + (this.cz(j) - z) ** 2;
          if (d < bestD) {
            bestD = d;
            best = k;
          }
        }
      }
      // ひとまわり外にも、より近い升がありうるので、見つけた次の輪まで見る
      if (best >= 0 && ring > 0 && Math.sqrt(bestD) < (ring - 0.5) * this.cell) break;
    }
    return best;
  }

  /** 線分の上がすべて通れる升か（升の半分の間隔で調べる）。 */
  lineFree(ax: number, az: number, bx: number, bz: number): boolean {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / (this.cell * 0.5)));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const idx = this.indexAt(ax + (bx - ax) * t, az + (bz - az) * t);
      if (idx < 0 || !this.free[idx]) return false;
    }
    return true;
  }

  private push(idx: number, f: number): void {
    let i = this.heapSize++;
    const hi = this.heapIdx;
    const hf = this.heapF;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hf[p] <= f) break;
      hi[i] = hi[p];
      hf[i] = hf[p];
      i = p;
    }
    hi[i] = idx;
    hf[i] = f;
  }

  private pop(): number {
    const hi = this.heapIdx;
    const hf = this.heapF;
    const top = hi[0];
    const lastI = hi[--this.heapSize];
    const lastF = hf[this.heapSize];
    let i = 0;
    const n = this.heapSize;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= n) break;
      if (c + 1 < n && hf[c + 1] < hf[c]) c++;
      if (hf[c] >= lastF) break;
      hi[i] = hi[c];
      hf[i] = hf[c];
      i = c;
    }
    hi[i] = lastI;
    hf[i] = lastF;
    return top;
  }

  /**
   * (sx, sz) から (tx, tz) への道（始点を除く点の並び。最後は目標そのもの）。
   * 目標が通れない・別の島なら、始点の島の中で目標に近い升へ向かう。道が無ければ null。
   */
  findPath(sx: number, sz: number, tx: number, tz: number): Pt[] | null {
    const s = this.nearestFree(sx, sz);
    if (s < 0) return null;
    const isl = this.island[s];
    const tIdxExact = this.indexAt(tx, tz);
    const exactOk = tIdxExact >= 0 && this.free[tIdxExact] === 1 && this.island[tIdxExact] === isl;
    const t = exactOk ? tIdxExact : this.nearestFree(tx, tz, isl);
    if (t < 0) return null;
    const goalX = exactOk ? tx : this.cx(t % this.w);
    const goalZ = exactOk ? tz : this.cz(Math.floor(t / this.w));
    if (s === t) return [{ x: goalX, z: goalZ }];

    this.run++;
    this.heapSize = 0;
    const w = this.w;
    const ti = t % w;
    const tj = (t - ti) / w;
    // 見積もりに重み（H_WEIGHT）を掛けて、広げる升を減らす（道は最短より少し長くなりうるが、糸引きで整う）
    const hOf = (k: number): number => {
      const i = k % w;
      const j = (k - i) / w;
      const dx = Math.abs(i - ti);
      const dz = Math.abs(j - tj);
      return (dx + dz + (SQRT2 - 2) * Math.min(dx, dz)) * H_WEIGHT;
    };
    this.g[s] = 0;
    this.stamp[s] = this.run;
    this.parent[s] = -1;
    this.push(s, hOf(s));
    let expanded = 0;
    let found = false;
    while (this.heapSize > 0) {
      const cur = this.pop();
      if (this.closed[cur] === this.run) continue;
      this.closed[cur] = this.run;
      expanded++;
      if (cur === t) {
        found = true;
        break;
      }
      const ci = cur % w;
      const cj = (cur - ci) / w;
      const gc = this.g[cur];
      for (let k = 0; k < 8; k++) {
        const ni = ci + NB_DX[k];
        const nj = cj + NB_DZ[k];
        if (ni < 0 || nj < 0 || ni >= w || nj >= this.h) continue;
        const n = nj * w + ni;
        if (!this.free[n] || this.closed[n] === this.run) continue;
        let cost = 1;
        if (k >= 4) {
          // 斜めは、角を削らないよう両隣が通れるときだけ
          if (!this.free[cj * w + ni] || !this.free[nj * w + ci]) continue;
          cost = SQRT2;
        }
        const ng = gc + cost;
        if (this.stamp[n] !== this.run || ng < this.g[n]) {
          this.stamp[n] = this.run;
          this.g[n] = ng;
          this.parent[n] = cur;
          this.push(n, ng + hOf(n));
        }
      }
    }
    this.lastExpanded = expanded;
    if (!found) return null;

    const cells: number[] = [];
    for (let c = t; c !== -1; c = this.parent[c]) cells.push(c);
    cells.reverse();
    const pts: Pt[] = cells.map((c) => ({ x: this.cx(c % w), z: this.cz(Math.floor(c / w)) }));
    pts[pts.length - 1] = { x: goalX, z: goalZ };
    // 糸を引くように、見通せる限り先の点まで飛ばして角を減らす（前から貪欲に。後ろから探すと長い道で重い）
    const out: Pt[] = [];
    let from: Pt = { x: sx, z: sz };
    let i = 0;
    while (i < pts.length - 1) {
      let j = i + 1;
      while (j + 1 < pts.length && this.lineFree(from.x, from.z, pts[j + 1].x, pts[j + 1].z)) j++;
      out.push(pts[j]);
      from = pts[j];
      i = j;
    }
    if (out.length === 0) out.push(pts[pts.length - 1]);
    return out;
  }
}

const cache = new WeakMap<StageDef, NavGrid>();

/** 番兵の格子（体の半径＋余白。水抜き穴は通れない）。ステージごとに一度だけ作る。 */
export function getGuardNav(stage: StageDef): NavGrid {
  let g = cache.get(stage);
  if (!g) {
    g = new NavGrid(getQuery(stage), GUARD.radius + GUARD.navMargin, false);
    cache.set(stage, g);
  }
  return g;
}
