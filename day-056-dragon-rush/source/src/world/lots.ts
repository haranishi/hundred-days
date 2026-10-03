// OWNER: world
// 街区を区画に割る。街区の長い辺に沿って帯を取り、帯を間口の幅で刻む。
// 深すぎる街区は中庭（建てない区画）を残す。
import type { CityConfig, Range } from '../config/city';
import { stream, type Rng } from '../core/rng';
// r01-city：中庭は駐車場か小さな公園にする（空から見て、舗装だけの区画が市松に並ばないように）。系列は city.courtyard
import { depth, rect, width } from './geom';
import type { Block, Lot, RoadClass, Side } from './types';

const CLASS_RANK: Record<RoadClass, number> = { avenue: 3, street: 2, lane: 1 };

function rank(cls: RoadClass | null): number {
  return cls === null ? 0 : CLASS_RANK[cls];
}

/** 長さ length を間口の範囲で刻む。最後の余りが小さすぎれば手前の区画に足す。 */
export function cutFrontages(length: number, frontage: Range, rng: Rng): number[] {
  const [f0, f1] = frontage;
  const out: number[] = [];
  let remaining = length;
  while (remaining > 1e-6) {
    if (remaining <= f1) {
      if (remaining < f0 * 0.6 && out.length > 0) out[out.length - 1] += remaining;
      else out.push(remaining);
      break;
    }
    const w = rng.range(f0, f1);
    out.push(w);
    remaining -= w;
  }
  return out;
}

interface Strip {
  front: Side;
  /** 帯の矩形 */
  area: { x0: number; z0: number; x1: number; z1: number };
}

function stripsFor(block: Block, maxDepth: number, minDepth: number): { strips: Strip[]; courtyards: Strip['area'][] } {
  const a = block.lotArea;
  const alongX = width(a) >= depth(a);
  const sideA: Side = alongX ? 'n' : 'w';
  const sideB: Side = alongX ? 's' : 'e';
  const short = alongX ? depth(a) : width(a);
  const strips: Strip[] = [];
  const courtyards: Strip['area'][] = [];

  const make = (side: Side, d: number): Strip['area'] => {
    switch (side) {
      case 'n':
        return rect(a.x0, a.z0, a.x1, a.z0 + d);
      case 's':
        return rect(a.x0, a.z1 - d, a.x1, a.z1);
      case 'w':
        return rect(a.x0, a.z0, a.x0 + d, a.z1);
      case 'e':
        return rect(a.x1 - d, a.z0, a.x1, a.z1);
    }
  };

  const faceA = block.faces[sideA];
  const faceB = block.faces[sideB];
  if (short >= 2 * minDepth && faceA !== null && faceB !== null) {
    const d = Math.min(short / 2, maxDepth);
    strips.push({ front: sideA, area: make(sideA, d) }, { front: sideB, area: make(sideB, d) });
    const middle = short - 2 * d;
    if (middle > 1) {
      courtyards.push(alongX ? rect(a.x0, a.z0 + d, a.x1, a.z1 - d) : rect(a.x0 + d, a.z0, a.x1 - d, a.z1));
    }
  } else {
    const front = rank(faceA) >= rank(faceB) ? sideA : sideB;
    const d = Math.min(short, maxDepth);
    strips.push({ front, area: make(front, d) });
    if (short - d > 1) {
      const back = front === sideA ? sideB : sideA;
      courtyards.push(make(back, short - d));
    }
  }
  return { strips, courtyards };
}

/** 全街区を区画に割る。区画の id は街全体で通し番号。 */
export function subdivideBlocks(cfg: CityConfig, blocks: Block[]): Lot[] {
  const lots: Lot[] = [];
  for (const block of blocks) {
    const spec = cfg.lots[block.zone];
    const rng = stream(cfg.seed, 'city.lots', block.id);
    const { strips, courtyards } = stripsFor(block, spec.maxDepth, spec.depth[0]);

    for (const strip of strips) {
      const alongX = strip.front === 'n' || strip.front === 's';
      const length = alongX ? width(strip.area) : depth(strip.area);
      const widths = cutFrontages(length, spec.frontage, rng);
      let cursor = alongX ? strip.area.x0 : strip.area.z0;
      const frontClass = block.faces[strip.front] ?? 'lane';
      const zone = block.zone === 'residential' && frontClass === 'avenue' ? 'commercial' : block.zone;
      for (const w of widths) {
        const r = alongX
          ? rect(cursor, strip.area.z0, cursor + w, strip.area.z1)
          : rect(strip.area.x0, cursor, strip.area.x1, cursor + w);
        cursor += w;
        const lot: Lot = {
          id: lots.length,
          blockId: block.id,
          rect: r,
          front: strip.front,
          frontClass,
          buildable: true,
          courtyard: null,
          zone,
          buildingId: null,
        };
        lots.push(lot);
        block.lotIds.push(lot.id);
      }
    }
    for (const c of courtyards) {
      const lot: Lot = {
        id: lots.length,
        blockId: block.id,
        rect: c,
        front: 'n',
        frontClass: 'lane',
        buildable: false,
        courtyard: stream(cfg.seed, 'city.courtyard', lots.length).chance(cfg.courtyardParkChance[block.zone]) ? 'park' : block.zone === 'port' ? 'yard' : 'parking',
        zone: block.zone,
        buildingId: null,
      };
      lots.push(lot);
      block.lotIds.push(lot.id);
    }
  }
  return lots;
}
