// OWNER: config
// 街の生成に使う数値。単位は m。値は日本の湾岸都市の実寸（道路幅・階高・建物の大きさ）から決めた。
import type { BuildingKind, RoadClass, Zone } from '../world/types';

export type Range = readonly [number, number];

export interface RoadClassSpec {
  carriage: number;
  sidewalk: number;
  lanes: number;
}

export interface LotSpec {
  frontage: Range;
  depth: Range;
  /** 奥行きの上限。これより深い街区は中庭（空き地）を残す */
  maxDepth: number;
}

export interface KindSpec {
  floors: Range;
  floorHeight: Range;
  /** 通りからの後退 */
  frontSetback: Range;
  /** 隣との隙間（片側） */
  sideGap: Range;
  /** この種類が建てられる区画の最小辺 */
  minLotSide: number;
  /** 通りから奥への建物の奥行きの上限（その種類がふつう取る奥行き） */
  depthCap: number;
}

export interface CityConfig {
  seed: number;
  /** 街の一辺。中心は原点 */
  size: number;
  groundLevel: number;
  curbHeight: number;
  waterLevel: number;
  coast: { x: number; promenadeWidth: number };
  piers: { count: number; width: Range; length: Range; minGap: number };
  roads: Record<RoadClass, RoadClassSpec>;
  grid: {
    /** 南北の道の間隔（岸の近く・遠く） */
    nsSpacingNear: Range;
    nsSpacingFar: Range;
    ewSpacing: Range;
    /** この位置にいちばん近い線を大通りにする */
    mainAvenueX: number;
    mainAvenueZ: number;
    secondAvenueZ: number;
    /** これより東の南北の線は1本おきに路地にする */
    laneFromX: number;
  };
  zones: {
    downtownCenter: { x: number; z: number };
    downtownRadius: number;
    commercialRadius: number;
    /** 区域の境目を崩す揺らぎ（半径に対する割合） */
    jitter: number;
  };
  lots: Record<Zone, LotSpec>;
  kinds: Record<BuildingKind, KindSpec>;
  /** 中庭（建てない奥の区画）を公園にする割合（r01-city。残りは駐車場） */
  courtyardParkChance: Record<Zone, number>;
  /** 塊の積み方（r01-city）：段を付ける割合と、段を付ける最小の階数 */
  massing: {
    towerChance: number;
    towerMinFloors: number;
    midriseChance: number;
    zakkyoChance: number;
    apartmentChance: number;
    minFloors: number;
  };
  /** 区域ごとの建物の種類の重み */
  kindWeights: Record<Zone, Partial<Record<BuildingKind, number>>>;
  /** 見た目の選択肢（sRGB の16進）。palette の番号が variant.palette になる */
  palettes: {
    tileWall: readonly number[];
    zakkyoWall: readonly number[];
    apartmentWall: readonly number[];
    houseWall: readonly number[];
    houseRoof: readonly number[];
    warehouseWall: readonly number[];
    towerGlass: readonly number[];
    towerStone: readonly number[];
    flatRoof: readonly number[];
    trim: readonly number[];
    windowGlass: readonly number[];
  };
}

export const CITY_CONFIG: CityConfig = {
  seed: 20260929,
  size: 1500,
  groundLevel: 0,
  curbHeight: 0.15,
  waterLevel: -1.6,
  coast: { x: -470, promenadeWidth: 26 },
  piers: { count: 3, width: [48, 72], length: [150, 250], minGap: 120 },
  roads: {
    avenue: { carriage: 24, sidewalk: 6, lanes: 6 },
    street: { carriage: 12, sidewalk: 3.5, lanes: 2 },
    lane: { carriage: 6.5, sidewalk: 1.2, lanes: 1 },
  },
  grid: {
    nsSpacingNear: [115, 165],
    nsSpacingFar: [72, 104],
    ewSpacing: [86, 132],
    mainAvenueX: -150,
    mainAvenueZ: 10,
    secondAvenueZ: -400,
    laneFromX: 330,
  },
  zones: {
    downtownCenter: { x: -250, z: 20 },
    downtownRadius: 330,
    commercialRadius: 640,
    jitter: 0.18,
  },
  lots: {
    downtown: { frontage: [34, 62], depth: [34, 60], maxDepth: 60 },
    commercial: { frontage: [12, 30], depth: [18, 34], maxDepth: 36 },
    residential: { frontage: [9.5, 15], depth: [13, 19], maxDepth: 20 },
    port: { frontage: [32, 72], depth: [28, 56], maxDepth: 60 },
  },
  kinds: {
    glassTower: { floors: [18, 33], floorHeight: [3.9, 4.2], frontSetback: [2, 5], sideGap: [2, 4], minLotSide: 30, depthCap: 70 },
    tileMidrise: { floors: [6, 13], floorHeight: [3.4, 3.8], frontSetback: [0.5, 2], sideGap: [0, 1.5], minLotSide: 12, depthCap: 26 },
    zakkyo: { floors: [4, 10], floorHeight: [3.1, 3.4], frontSetback: [0, 0.6], sideGap: [0, 0.5], minLotSide: 8, depthCap: 18 },
    apartment: { floors: [5, 14], floorHeight: [2.9, 3.1], frontSetback: [1.5, 4], sideGap: [1, 3], minLotSide: 13, depthCap: 14 },
    house: { floors: [2, 3], floorHeight: [2.8, 3.0], frontSetback: [1.5, 3.5], sideGap: [0.8, 1.6], minLotSide: 7, depthCap: 12 },
    warehouse: { floors: [2, 3], floorHeight: [4.8, 6.2], frontSetback: [3, 8], sideGap: [2, 6], minLotSide: 18, depthCap: 60 },
  },
  courtyardParkChance: { downtown: 0.35, commercial: 0.4, residential: 0.55, port: 0.1 },
  // r01-city：集合住宅の段は 0（0.3 にすると自動プレイ（basic）の狙う建物が入れ替わり、3分の間に燃え広がりが1度も起きなくなった。
  // 塔・中層・雑居ビルの段では、最初の崩落 7.1秒と燃え広がり6回は r00b と同じ）
  massing: { towerChance: 0.55, towerMinFloors: 16, midriseChance: 0.45, zakkyoChance: 0.35, apartmentChance: 0, minFloors: 5 },
  kindWeights: {
    downtown: { glassTower: 0.5, tileMidrise: 0.3, zakkyo: 0.08, apartment: 0.12 },
    commercial: { tileMidrise: 0.34, zakkyo: 0.36, apartment: 0.2, glassTower: 0.04, house: 0.06 },
    residential: { house: 0.72, apartment: 0.14, zakkyo: 0.09, tileMidrise: 0.05 },
    port: { warehouse: 0.86, tileMidrise: 0.14 },
  },
  palettes: {
    tileWall: [0xcdbb9e, 0x8f6d55, 0xe0dbd0, 0x9ea598, 0xab6b4f, 0xbdb8ae, 0x6a5444, 0xc9b58c],
    zakkyoWall: [0xa9a49b, 0xdedad1, 0xd4c7a6, 0x98a4ab, 0xc39a86, 0x6f6d69, 0xb8a58f, 0x8c9a8a],
    apartmentWall: [0xe2dfd6, 0xd3c6ab, 0xc3c2bd, 0xa98067, 0xd9cfbf, 0xb6b9b6],
    houseWall: [0xe0d6bf, 0xe8e6e0, 0xaaaba6, 0xcbb592, 0xa8ae97, 0x8f9ba4, 0x7e6653, 0xd8c3a6],
    houseRoof: [0x3b3e43, 0x2c3542, 0x5a4336, 0x74402f, 0x4b5a4b, 0x4a5a6f],
    warehouseWall: [0x9ea4a8, 0x7e8e9b, 0xcfc6ab, 0x8e4b3b, 0x5f7b69, 0xd6d6cf],
    towerGlass: [0x4e6c73, 0x4b5f79, 0x6b5b49, 0x5c6267, 0x8b939a, 0x3f5560],
    towerStone: [0xb9b1a3, 0x8e887f, 0xcfc8b8, 0x6f6a64],
    flatRoof: [0x6e6e6b, 0x908d85, 0x55615b, 0x7d7167, 0xa29f97],
    trim: [0xd9d6ce, 0x8a8a86, 0x3e3f42, 0xb6ab98, 0x5a5048],
    windowGlass: [0x2d3a42, 0x34383a, 0x3b4546, 0x28303a],
  },
};

/** 遠景（湾の対岸・背後の山・街の外の代役）の数値。 */
export const SCENERY_CONFIG = {
  /** 対岸の丘の帯（湾の向こう、x の負の側） */
  farShore: { x: -6200, depth: 2200, heights: [40, 320] as Range, zExtent: 16000, step: 50, roughness: 0.08 },
  /** 背後の山並み（北と東の遠く） */
  mountains: { radius: 9000, heights: [220, 780] as Range, arcFromDeg: -75, arcToDeg: 175, step: 0.8, roughness: 0.07 },
  /** 街の外に置く安い建物の代役 */
  filler: { cell: 64, heights: [8, 52] as Range, footprint: [26, 52] as Range, emptyChance: 0.1, splitChance: 0.45 },
} as const;

/** 道の小物の置き方（歩道の縁石からの距離と間隔、m）。 */
export const PROPS_CONFIG = {
  /** 交差点の角から空ける距離（見通しのため） */
  cornerClear: 9,
  trees: { avenueSpacing: 9.5, streetSpacing: 11, minSidewalk: 3, maxInset: 1.3 },
  lamps: { spacing: 28, inset: 0.5 },
  /** 信号の柱を交差点の角からずらす距離 */
  signalOffset: 1.1,
} as const;
