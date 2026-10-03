// OWNER: config
// 街路樹の数値（r01-city）。樹種は日本の街路樹に多いケヤキ（壺形に枝を広げる）とイチョウ（円錐形）。
// 寸法は街路樹の実物（植栽時 4〜5m、育った木 8〜13m、枝張り 5〜8m）から決めた。
// 色は夏の終わりの緑で、夕日を受けて少し黄みを帯びる程度（秋の橙にはしない。主役は炎の色）。

/** 配置の選び方。 */
export const TREE_PLACEMENT = {
  /** 大通り・ふつうの通りで、その通りの樹種がケヤキになる割合（残りはイチョウ） */
  zelkovaOnAvenue: 0.7,
  zelkovaOnStreet: 0.4,
  /** 植え替えたばかりの若木と、枝の欠けた木の割合 */
  youngChance: 0.09,
  sparseChance: 0.06,
  /** 傾きの最大（ラジアン、約4°） */
  maxLeanRad: 0.07,
  /** 岸壁の遊歩道の並木：水際からの距離と間隔（m） */
  promenadeInset: 9.5,
  promenadeSpacing: 14,
  /** 中庭の公園の木：区画の縁からの距離と間隔（m） */
  parkInset: 4.6,
  parkSpacing: 8.5,
} as const;

/** 木の形の型（枝の育て方）。添字が TreePlacement.variant。 */
export interface TreeArchetype {
  name: string;
  species: 'zelkova' | 'ginkgo';
  /** 形を育てる乱数の系列の番号 */
  seed: number;
  /** 幹が枝分かれする高さ（m）と、幹の太さ（根元・上端の半径） */
  trunkHeight: number;
  trunkRadius: [number, number];
  /** 主枝の本数、長さ（m）、立ち上がりの角度（水平から、度） */
  limbs: number;
  limbLength: [number, number];
  limbElevation: [number, number];
  /** 子の枝の数と長さの比 */
  children: number;
  childScale: number;
  /** 何段まで枝分かれさせるか（2 か 3） */
  depth: number;
  /** 葉の塊の半径（m）と、1つの塊の葉のカードの枚数 */
  clumpRadius: [number, number];
  cardsPerClump: number;
  /** イチョウ：主幹をまっすぐ伸ばし、横枝を段に付ける */
  leader?: { height: number; tiers: number };
  /** 欠けた木：主枝を何本か切った跡にする */
  prunedLimbs?: number;
  /** 若木：支柱（3本の丸太）を立てる */
  stakes?: boolean;
}

export const TREE_ARCHETYPES: readonly TreeArchetype[] = [
  { name: 'ケヤキA', species: 'zelkova', seed: 11, trunkHeight: 2.7, trunkRadius: [0.24, 0.17], limbs: 5, limbLength: [2.6, 3.5], limbElevation: [52, 66], children: 2, childScale: 0.62, depth: 3, clumpRadius: [0.85, 1.2], cardsPerClump: 9 },
  { name: 'ケヤキB', species: 'zelkova', seed: 23, trunkHeight: 2.3, trunkRadius: [0.27, 0.19], limbs: 4, limbLength: [2.9, 3.9], limbElevation: [45, 60], children: 3, childScale: 0.55, depth: 3, clumpRadius: [0.9, 1.25], cardsPerClump: 6 },
  { name: 'イチョウA', species: 'ginkgo', seed: 37, trunkHeight: 2.2, trunkRadius: [0.2, 0.08], limbs: 0, limbLength: [1.4, 2.4], limbElevation: [20, 38], children: 2, childScale: 0.55, depth: 2, clumpRadius: [0.8, 1.1], cardsPerClump: 6, leader: { height: 9.5, tiers: 5 } },
  { name: 'イチョウB', species: 'ginkgo', seed: 41, trunkHeight: 2.5, trunkRadius: [0.18, 0.07], limbs: 0, limbLength: [1.2, 2.0], limbElevation: [25, 42], children: 2, childScale: 0.5, depth: 2, clumpRadius: [0.75, 1.05], cardsPerClump: 6, leader: { height: 8.2, tiers: 5 } },
  { name: '若木', species: 'zelkova', seed: 53, trunkHeight: 1.9, trunkRadius: [0.08, 0.05], limbs: 3, limbLength: [1.3, 1.8], limbElevation: [58, 72], children: 2, childScale: 0.6, depth: 2, clumpRadius: [0.55, 0.8], cardsPerClump: 7, stakes: true },
  { name: '欠けたケヤキ', species: 'zelkova', seed: 67, trunkHeight: 2.6, trunkRadius: [0.25, 0.18], limbs: 5, limbLength: [2.4, 3.3], limbElevation: [50, 64], children: 2, childScale: 0.6, depth: 3, clumpRadius: [0.8, 1.1], cardsPerClump: 7, prunedLimbs: 2 },
];

export const TREE_LOOK = {
  /** 樹皮の色（sRGB）：ケヤキは灰色がかった茶、イチョウは暗い灰褐色 */
  bark: { zelkova: 0x6b6358, ginkgo: 0x4d4640 },
  /** 葉の色（sRGB）。木ごとに tint でこの間を行き来する */
  leaf: {
    zelkova: [0x4a6a2a, 0x5f7a30] as const,
    ginkgo: [0x6d8a2e, 0x8a9a36] as const,
  },
  /** 葉の透過（逆光で透ける明るさ）。影を受けた後の太陽の光に掛ける */
  translucency: 0.55,
  /** 逆光でない時にも、日の当たる側から透ける光の割合 */
  translucencyBase: 0.1,
} as const;
