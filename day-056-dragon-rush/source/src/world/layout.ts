// OWNER: world
// 地割り：岸・埠頭・道の格子・交差点・街区と、その用途（区域）を決める。
import type { CityConfig } from '../config/city';
import { stream } from '../core/rng';
import { clamp, lerp, rect, inset, centerX, centerZ } from './geom';
import type {
  Block,
  Coast,
  Intersection,
  Rect,
  RoadClass,
  RoadLine,
  RoadSegment,
  Zone,
} from './types';

export interface Layout {
  bounds: Rect;
  coast: Coast;
  roadLines: RoadLine[];
  segments: RoadSegment[];
  intersections: Intersection[];
  blocks: Block[];
}

function spacingLine(
  start: number,
  end: number,
  spacing: (at: number) => readonly [number, number],
  next: () => number,
): number[] {
  const out = [start];
  for (;;) {
    const prev = out[out.length - 1];
    const [lo, hi] = spacing(prev);
    const candidate = prev + lerp(lo, hi, next());
    if (candidate >= end) break;
    out.push(candidate);
  }
  // 最後の線は街の縁にそろえる。縁との間が狭すぎるときは1本減らす。
  const [lo] = spacing(out[out.length - 1]);
  if (end - out[out.length - 1] < lo * 0.7 && out.length > 1) out.pop();
  out.push(end);
  return out;
}

function nearestIndex(values: readonly number[], target: number, skip: ReadonlySet<number>): number {
  let best = -1;
  let bestDist = Infinity;
  values.forEach((v, i) => {
    if (skip.has(i)) return;
    const d = Math.abs(v - target);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

function makeLines(cfg: CityConfig): { ns: RoadLine[]; ew: RoadLine[] } {
  const half = cfg.size / 2;
  const firstX = cfg.coast.x + cfg.coast.promenadeWidth + cfg.roads.street.carriage / 2;
  const nsRng = stream(cfg.seed, 'city.grid.ns');
  const ewRng = stream(cfg.seed, 'city.grid.ew');

  const xs = spacingLine(
    firstX,
    half,
    (at) => {
      const t = clamp((at - firstX) / (half - firstX), 0, 1);
      return [
        lerp(cfg.grid.nsSpacingNear[0], cfg.grid.nsSpacingFar[0], t),
        lerp(cfg.grid.nsSpacingNear[1], cfg.grid.nsSpacingFar[1], t),
      ];
    },
    () => nsRng.next(),
  );
  const zs = spacingLine(-half, half, () => cfg.grid.ewSpacing, () => ewRng.next());

  const nsClass: RoadClass[] = xs.map(() => 'street');
  const ewClass: RoadClass[] = zs.map(() => 'street');
  const edgesNs = new Set([0, xs.length - 1]);
  const edgesEw = new Set([0, zs.length - 1]);
  nsClass[nearestIndex(xs, cfg.grid.mainAvenueX, edgesNs)] = 'avenue';
  const mainEw = nearestIndex(zs, cfg.grid.mainAvenueZ, edgesEw);
  ewClass[mainEw] = 'avenue';
  ewClass[nearestIndex(zs, cfg.grid.secondAvenueZ, new Set([...edgesEw, mainEw]))] = 'avenue';
  // 東の住宅地では南北の線を1本おきに路地にする（縁の線は除く）
  let laneToggle = false;
  xs.forEach((x, i) => {
    if (x < cfg.grid.laneFromX || edgesNs.has(i) || nsClass[i] !== 'street') return;
    if (laneToggle) nsClass[i] = 'lane';
    laneToggle = !laneToggle;
  });

  let id = 0;
  const toLine = (axis: 'ns' | 'ew', pos: number, cls: RoadClass): RoadLine => {
    const spec = cfg.roads[cls];
    return { id: id++, axis, pos, cls, carriageWidth: spec.carriage, sidewalkWidth: spec.sidewalk, lanes: spec.lanes };
  };
  return {
    ns: xs.map((x, i) => toLine('ns', x, nsClass[i])),
    ew: zs.map((z, i) => toLine('ew', z, ewClass[i])),
  };
}

function zoneFor(cfg: CityConfig, x: number, z: number, jitter: number): Zone {
  const c = cfg.zones.downtownCenter;
  const d = Math.hypot(x - c.x, z - c.z) * (1 + cfg.zones.jitter * jitter);
  if (d < cfg.zones.downtownRadius) return 'downtown';
  if (d < cfg.zones.commercialRadius) return 'commercial';
  return 'residential';
}

function makePiers(cfg: CityConfig, startId: number): Block[] {
  const rng = stream(cfg.seed, 'city.piers');
  const half = cfg.size / 2;
  const centers: number[] = [];
  let guard = 0;
  while (centers.length < cfg.piers.count && guard++ < 200) {
    const z = rng.range(-half + 140, half - 140);
    if (centers.every((c) => Math.abs(c - z) > cfg.piers.minGap + cfg.piers.width[1])) centers.push(z);
  }
  centers.sort((a, b) => a - b);
  return centers.map((zc, k) => {
    const w = rng.range(cfg.piers.width[0], cfg.piers.width[1]);
    const len = rng.range(cfg.piers.length[0], cfg.piers.length[1]);
    const curb = rect(cfg.coast.x - len, zc - w / 2, cfg.coast.x, zc + w / 2);
    const apron = 7;
    return {
      id: startId + k,
      zone: 'port',
      curb,
      lotArea: inset(curb, apron, apron, 0, apron),
      sidewalk: { n: apron, s: apron, e: 0, w: apron },
      faces: { n: 'lane', s: 'lane', e: null, w: 'lane' },
      isPier: true,
      grid: null,
      lotIds: [],
    } satisfies Block;
  });
}

export function generateLayout(cfg: CityConfig): Layout {
  const half = cfg.size / 2;
  const { ns, ew } = makeLines(cfg);
  const roadLines = [...ns, ...ew];

  const segments: RoadSegment[] = [];
  let segId = 0;
  for (const line of ns) {
    for (let j = 0; j + 1 < ew.length; j++) {
      const a = ew[j];
      const b = ew[j + 1];
      segments.push({
        id: segId++,
        lineId: line.id,
        axis: 'ns',
        cls: line.cls,
        lanes: line.lanes,
        rect: rect(line.pos - line.carriageWidth / 2, a.pos + a.carriageWidth / 2, line.pos + line.carriageWidth / 2, b.pos - b.carriageWidth / 2),
      });
    }
  }
  for (const line of ew) {
    for (let i = 0; i + 1 < ns.length; i++) {
      const a = ns[i];
      const b = ns[i + 1];
      segments.push({
        id: segId++,
        lineId: line.id,
        axis: 'ew',
        cls: line.cls,
        lanes: line.lanes,
        rect: rect(a.pos + a.carriageWidth / 2, line.pos - line.carriageWidth / 2, b.pos - b.carriageWidth / 2, line.pos + line.carriageWidth / 2),
      });
    }
  }

  const intersections: Intersection[] = [];
  let ixId = 0;
  ns.forEach((nl, i) => {
    ew.forEach((el, j) => {
      intersections.push({
        id: ixId++,
        nsLineId: nl.id,
        ewLineId: el.id,
        rect: rect(nl.pos - nl.carriageWidth / 2, el.pos - el.carriageWidth / 2, nl.pos + nl.carriageWidth / 2, el.pos + el.carriageWidth / 2),
        // 横断歩道は、その先に車道が続き、渡る道が路地でない辺にだけ描く
        crosswalks: {
          n: j > 0 && nl.cls !== 'lane',
          s: j < ew.length - 1 && nl.cls !== 'lane',
          w: i > 0 && el.cls !== 'lane',
          e: i < ns.length - 1 && el.cls !== 'lane',
        },
      });
    });
  });

  const blocks: Block[] = [];
  const zoneRng = stream(cfg.seed, 'city.zones');
  for (let i = 0; i + 1 < ns.length; i++) {
    for (let j = 0; j + 1 < ew.length; j++) {
      const w = ns[i];
      const e = ns[i + 1];
      const n = ew[j];
      const s = ew[j + 1];
      const curb = rect(w.pos + w.carriageWidth / 2, n.pos + n.carriageWidth / 2, e.pos - e.carriageWidth / 2, s.pos - s.carriageWidth / 2);
      const sidewalk = { n: n.sidewalkWidth, s: s.sidewalkWidth, e: e.sidewalkWidth, w: w.sidewalkWidth };
      let zone = zoneFor(cfg, centerX(curb), centerZ(curb), zoneRng.range(-1, 1));
      if (i === 0 && zone !== 'downtown') zone = 'port';
      blocks.push({
        id: blocks.length,
        zone,
        curb,
        lotArea: inset(curb, sidewalk.n, sidewalk.s, sidewalk.e, sidewalk.w),
        sidewalk,
        faces: { n: n.cls, s: s.cls, e: e.cls, w: w.cls },
        isPier: false,
        grid: { i, j },
        lotIds: [],
      });
    }
  }
  blocks.push(...makePiers(cfg, blocks.length));

  const coast: Coast = {
    coastX: cfg.coast.x,
    waterLevel: cfg.waterLevel,
    promenade: rect(cfg.coast.x, -half, ns[0].pos - ns[0].carriageWidth / 2, half),
  };

  return { bounds: rect(-half, -half, half, half), coast, roadLines, segments, intersections, blocks };
}
