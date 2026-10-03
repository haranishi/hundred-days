// OWNER: world
// 街の純データを作る入口。同じ設定（種を含む）なら必ず同じ街になる。
import type { CityConfig } from '../config/city';
import { draftBuildings, initialVariant } from './buildings';
import { materialize } from './buildingLook';
import { generateLayout } from './layout';
import { subdivideBlocks } from './lots';
import { enforceVariety, facingLotPairs, lotNeighborPairs } from './neighbors';
import { BUILDING_KINDS, type BuildingKind, type CityData, type CityStats } from './types';

function emptyByKind(): Record<BuildingKind, number> {
  return Object.fromEntries(BUILDING_KINDS.map((k) => [k, 0])) as Record<BuildingKind, number>;
}

export function computeStats(buildings: CityData['buildings']): CityStats {
  const volumeByKind = emptyByKind();
  const countByKind = emptyByKind();
  let totalVolume = 0;
  for (const b of buildings) {
    volumeByKind[b.kind] += b.volume;
    countByKind[b.kind] += 1;
    totalVolume += b.volume;
  }
  return { buildingCount: buildings.length, totalVolume, volumeByKind, countByKind };
}

export function generateCity(cfg: CityConfig): CityData {
  const layout = generateLayout(cfg);
  const lots = subdivideBlocks(cfg, layout.blocks);
  const drafts = draftBuildings(cfg, lots);
  const variants = drafts.map((d) => initialVariant(cfg, d));

  // 区画の隣り合いを、建物（下書きの番号）の隣り合いに置き換える
  const draftIndexByLot = new Map(drafts.map((d, i) => [d.lotId, i]));
  const pairs: [number, number][] = [];
  for (const [a, b] of lotNeighborPairs(lots)) {
    const ia = draftIndexByLot.get(a);
    const ib = draftIndexByLot.get(b);
    if (ia !== undefined && ib !== undefined) pairs.push(ia < ib ? [ia, ib] : [ib, ia]);
  }
  // 通りを挟んで向かい合う組（r01-city：判定を強めた）
  const facing: [number, number][] = [];
  for (const [a, b] of facingLotPairs(lots)) {
    const ia = draftIndexByLot.get(a);
    const ib = draftIndexByLot.get(b);
    if (ia !== undefined && ib !== undefined) facing.push(ia < ib ? [ia, ib] : [ib, ia]);
  }
  enforceVariety(cfg, drafts, variants, pairs, facing);

  const buildings = drafts.map((d, i) => materialize(cfg, i, d, variants[i]));
  for (const b of buildings) lots[b.lotId].buildingId = b.id;

  return {
    seed: cfg.seed,
    bounds: layout.bounds,
    groundLevel: cfg.groundLevel,
    curbHeight: cfg.curbHeight,
    coast: layout.coast,
    roadLines: layout.roadLines,
    segments: layout.segments,
    intersections: layout.intersections,
    blocks: layout.blocks,
    lots,
    buildings,
    neighborPairs: pairs,
    facingPairs: facing,
    stats: computeStats(buildings),
  };
}
