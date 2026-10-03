// OWNER: world
// 街のデータへの問い合わせ。地面の種類・建物の検索・目印の交差点を、全モジュールが同じ関数で引く。
import { containsPoint } from './geom';
import type { Building, BuildingKind, CityData, Intersection, RoadLine } from './types';

export type Surface =
  | 'water'
  | 'pier'
  | 'promenade'
  | 'road'
  | 'intersection'
  | 'sidewalk'
  | 'lot'
  | 'outside';

function lineIndexBelow(lines: readonly RoadLine[], v: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  if (v < lines[0].pos) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lines[mid].pos <= v) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function onCarriage(lines: readonly RoadLine[], v: number): boolean {
  const i = lineIndexBelow(lines, v);
  const near = [lines[i], lines[i + 1]].filter((l): l is RoadLine => l !== undefined);
  return near.some((l) => Math.abs(v - l.pos) <= l.carriageWidth / 2);
}

export class CityIndex {
  private readonly ns: RoadLine[];
  private readonly ew: RoadLine[];
  private readonly gridBlocks = new Map<string, number>();
  private readonly buildingCells = new Map<string, number[]>();
  private readonly cell = 50;

  constructor(readonly city: CityData) {
    this.ns = city.roadLines.filter((l) => l.axis === 'ns').sort((a, b) => a.pos - b.pos);
    this.ew = city.roadLines.filter((l) => l.axis === 'ew').sort((a, b) => a.pos - b.pos);
    for (const b of city.blocks) if (b.grid) this.gridBlocks.set(`${b.grid.i},${b.grid.j}`, b.id);
    for (const b of city.buildings) {
      const f = b.footprint;
      for (let i = Math.floor(f.x0 / this.cell); i <= Math.floor(f.x1 / this.cell); i++) {
        for (let j = Math.floor(f.z0 / this.cell); j <= Math.floor(f.z1 / this.cell); j++) {
          const k = `${i},${j}`;
          const list = this.buildingCells.get(k);
          if (list) list.push(b.id);
          else this.buildingCells.set(k, [b.id]);
        }
      }
    }
  }

  surfaceAt(x: number, z: number): Surface {
    const { city } = this;
    const b = city.bounds;
    if (x < city.coast.coastX) {
      const pier = city.blocks.find((blk) => blk.isPier && containsPoint(blk.curb, x, z));
      return pier ? 'pier' : 'water';
    }
    if (x > b.x1 || z < b.z0 || z > b.z1) return 'outside';
    if (containsPoint(city.coast.promenade, x, z)) return 'promenade';
    const onNs = onCarriage(this.ns, x);
    const onEw = onCarriage(this.ew, z);
    if (onNs && onEw) return 'intersection';
    if (onNs || onEw) return 'road';
    const i = lineIndexBelow(this.ns, x);
    const j = lineIndexBelow(this.ew, z);
    const blockId = this.gridBlocks.get(`${i},${j}`);
    if (blockId === undefined) return 'outside';
    const block = city.blocks[blockId];
    return containsPoint(block.lotArea, x, z) ? 'lot' : 'sidewalk';
  }

  buildingAt(x: number, z: number): Building | null {
    const list = this.buildingCells.get(`${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`) ?? [];
    for (const id of list) {
      const b = this.city.buildings[id];
      if (b.masses.some((m) => containsPoint(m.rect, x, z))) return b;
    }
    return null;
  }

  /** 半径 r の円に外形が掛かる建物。 */
  buildingsNear(x: number, z: number, r: number): Building[] {
    const out = new Set<number>();
    for (let i = Math.floor((x - r) / this.cell); i <= Math.floor((x + r) / this.cell); i++) {
      for (let j = Math.floor((z - r) / this.cell); j <= Math.floor((z + r) / this.cell); j++) {
        for (const id of this.buildingCells.get(`${i},${j}`) ?? []) out.add(id);
      }
    }
    return [...out]
      .map((id) => this.city.buildings[id])
      .filter((b) => {
        const f = b.footprint;
        const dx = Math.max(f.x0 - x, 0, x - f.x1);
        const dz = Math.max(f.z0 - z, 0, z - f.z1);
        return dx * dx + dz * dz <= r * r;
      });
  }

  /** (x,z) にいちばん近い交差点。filter で「大通りどうし」などに絞れる。 */
  intersectionNear(x: number, z: number, filter: (ix: Intersection, ns: RoadLine, ew: RoadLine) => boolean = () => true): Intersection {
    let best: Intersection | null = null;
    let bestD = Infinity;
    for (const ix of this.city.intersections) {
      const ns = this.city.roadLines[ix.nsLineId];
      const ew = this.city.roadLines[ix.ewLineId];
      if (!filter(ix, ns, ew)) continue;
      const d = Math.hypot(ns.pos - x, ew.pos - z);
      if (d < bestD) {
        bestD = d;
        best = ix;
      }
    }
    if (!best) throw new Error('intersectionNear: 条件に合う交差点がない');
    return best;
  }

  /** (x,z) にいちばん近い、指定の種類の建物。 */
  nearestBuilding(x: number, z: number, kinds: readonly BuildingKind[]): Building {
    let best: Building | null = null;
    let bestD = Infinity;
    for (const b of this.city.buildings) {
      if (!kinds.includes(b.kind)) continue;
      const cx = (b.footprint.x0 + b.footprint.x1) / 2;
      const cz = (b.footprint.z0 + b.footprint.z1) / 2;
      const d = Math.hypot(cx - x, cz - z);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    if (!best) throw new Error('nearestBuilding: 該当する建物がない');
    return best;
  }
}
