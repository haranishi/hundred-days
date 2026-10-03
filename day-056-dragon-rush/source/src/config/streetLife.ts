// OWNER: config
// 通りの暮らし（車・人・道の小物）の数値（r01-city。採点 r00a の改善2位「通りに暮らしを置く」）。
// 寸法は日本の車（普通車・軽・ワゴン・路線バス・小型トラック）と歩道の実物から、色は日本の車の色の多さ
// （白・銀・黒が大半、少しの紺・赤・茶）から決めた。黄色いタクシーは置かない（参照の画の写しを避ける）。

/**
 * 車の型：形の番号（city/carGeometry.ts の carShapes の添字）と、長さ・幅・高さ（m）の範囲。
 * r01-city：形を作り直したときに、小型車（ハッチバック・5）と軽（背の高い箱・6）をセダンと箱形から分けた
 */
export const CAR_TYPES = {
  sedan: { shape: 0, len: [4.5, 4.9], wid: [1.75, 1.82], hgt: [1.42, 1.5] },
  compact: { shape: 5, len: [3.9, 4.3], wid: [1.68, 1.72], hgt: [1.48, 1.55] },
  minivan: { shape: 1, len: [4.6, 4.8], wid: [1.72, 1.8], hgt: [1.8, 1.9] },
  kei: { shape: 6, len: [3.35, 3.4], wid: [1.47, 1.48], hgt: [1.62, 1.75] },
  taxi: { shape: 2, len: [4.6, 4.7], wid: [1.69, 1.7], hgt: [1.5, 1.55] },
  bus: { shape: 3, len: [10.4, 10.9], wid: [2.49, 2.5], hgt: [3.05, 3.15] },
  truck: { shape: 4, len: [5.9, 6.6], wid: [1.9, 2.1], hgt: [2.6, 2.9] },
} as const;

export type CarType = keyof typeof CAR_TYPES;

/** 走っている車・信号待ちの車の型の割合（駐車場と路肩はバス・トラックを除く） */
export const CAR_MIX: Record<CarType, number> = { sedan: 0.3, compact: 0.2, minivan: 0.16, kei: 0.16, taxi: 0.07, bus: 0.03, truck: 0.08 };
export const PARKED_MIX: Record<CarType, number> = { sedan: 0.3, compact: 0.25, minivan: 0.2, kei: 0.2, taxi: 0, bus: 0, truck: 0.05 };

/** 車体の色（sRGB）と重み。タクシーは黒か深い緑、バスは白地（帯は形の側で描く） */
export const CAR_COLORS: readonly (readonly [number, number])[] = [
  [0xecebe7, 0.27],
  [0xdedbd2, 0.08],
  [0xa9adb1, 0.17],
  [0x6f7479, 0.08],
  [0x1b1c1f, 0.2],
  [0x243553, 0.06],
  [0x6b1d1c, 0.04],
  [0x7a6a52, 0.04],
  [0x4f6a7a, 0.03],
  [0x324b3a, 0.03],
];
export const TAXI_COLORS: readonly number[] = [0x17181b, 0x1f3a2e, 0x2b2f3a];
export const BUS_COLOR = 0xf0efe9;

export const TRAFFIC = {
  /** 交差点の手前で信号待ちの列ができる割合と、列の長さの上限（台） */
  queueChance: { avenue: 0.7, street: 0.45, lane: 0.1 },
  queueMax: { avenue: 5, street: 3, lane: 1 },
  /** 停止線（交差点の端から 6.5m）と前の車の間、車どうしの間（m） */
  stopGap: 1.2,
  queueGap: [1.4, 2.4] as const,
  /** 走っている車の平均の間隔（m、1車線あたり） */
  movingGap: { avenue: 34, street: 60, lane: 140 },
  /** 路肩の駐車：ふつうの通りの縁石沿い、7m ごとに置く割合 */
  parkedChance: 0.14,
  /** 駐車場（空き地の区画）の区画ごとの埋まり具合 */
  lotOccupancy: 0.62,
  /** 交差点の端から、動いている車・路肩の車を置かない距離（m） */
  endClear: 12,
} as const;

export const PEOPLE = {
  /** 店先（1階が店の建物の前）に立つ人の数の上限と、店先から歩道側への距離（m） */
  perShop: 4,
  shopOffset: [0.8, 2.6] as const,
  /** 横断歩道の前で信号を待つ人の数（1か所あたりの上限） */
  perCrossing: 6,
  /** 歩道を歩く人の平均の間隔（m）。人通り（道の格付け×都心への近さ）で割る。夕方の都心の大通りで約10m に1人 */
  walkSpacing: 10,
  /** 岸壁の遊歩道を歩く人の間隔（m） */
  promenadeSpacing: 22,
  /** 背の高さ（m） */
  height: [1.52, 1.84] as const,
} as const;

/** 服の色（sRGB）。上着は落ち着いた色が中心（白・紺・灰・黒・ベージュ・少しの差し色） */
export const CLOTHES: readonly number[] = [0xe8e6e0, 0x1f2a44, 0x7c7f84, 0x1c1c1e, 0xc9b99a, 0x5d6b52, 0x8a3b32, 0x3f5f7f, 0xd9cfb8, 0x6b4f3a, 0x9fb3c8, 0xb07a52];

/**
 * 避難の規則：壊れかけた建物（ひび以上・燃えている）の外形から、この距離の内側にいる人は見えなくする（逃げた）。
 * 距離は高さに比例させる（高いビルほど倒れたときに届く範囲が広い）。竜のまわりにも同じく避難の輪を置く。
 * 車は消さない（乗り捨てられた車として残る）。
 */
export const EVACUATION = {
  base: 22,
  perHeight: 0.6,
  /** 竜の体（胴の中心から前後左右に約25m）のすぐ外まで。人は竜の大きさの物差しとして、その先には残す */
  dragonRadius: 28,
  /** カメラの近く（3次元の距離、m）の車は描かない。目の高さの構図で、手前の1台が主役を隠さないようにする */
  carCameraClear: 25,
} as const;

/** 港の物（r01-city）：コンテナの色（sRGB と重み）、係船柱の間隔、船の大きさと色 */
export const HARBOR = {
  containerColors: [
    [0x7d3a2c, 0.22],
    [0x2c4f7a, 0.2],
    [0x4a6b4d, 0.12],
    [0x8a8d8f, 0.14],
    [0xc9c6bd, 0.1],
    [0xa8642d, 0.1],
    [0x5b4a6b, 0.06],
    [0x2f3336, 0.06],
  ] as readonly (readonly [number, number])[],
  bollardSpacing: 18,
  /** 埠頭の片側に貨物船を着ける割合と、船の長さ・幅（m） */
  shipChance: 0.45,
  shipLength: [62, 96] as const,
  shipBeam: 14,
  shipColors: [0x3a2b2a, 0x243548, 0x5a2a24, 0x2c3d33] as readonly number[],
  boatColors: [0xe9e7e1, 0xdcd8cc, 0x2d4a66, 0xb8c3c7, 0x8a3a2c] as readonly number[],
} as const;

/** 道の小物：消火栓・ごみ箱・自動販売機・バス停・電柱の置き方 */
export const FURNITURE = {
  /** バス停：大通りの歩道、交差点の先に置く割合 */
  busStopChance: 0.35,
  /** 消火栓：交差点の角に置く割合 */
  hydrantChance: 0.45,
  /** 自動販売機（ごみ箱を2つ添える）：店先の建物ごとの割合 */
  vendingChance: 0.22,
  /** 電柱：住宅地の路地と通りの歩道に置く間隔（m） */
  poleSpacing: 32,
} as const;
