// OWNER: config
// 画質の段階。影・AO・反射・後処理の量を1か所でまとめて切り替える。
// 1つだけ切ると絵の釣り合いが崩れるので、段ごとに全部の値を持たせる。

export type QualityName = 'high' | 'medium' | 'low';

export interface QualityPreset {
  /** 画素比の上限（Retina で重くなりすぎないように） */
  maxPixelRatio: number;
  shadow: {
    enabled: boolean;
    cascades: number;
    mapSize: number;
    /** 影を描く最遠距離（m） */
    maxFar: number;
    /** 段の境目を混ぜる */
    fade: boolean;
  };
  ao: {
    enabled: boolean;
    samples: number;
    denoiseSamples: number;
    halfRes: boolean;
  };
  bloom: { enabled: boolean; levels: number };
  smaa: 'high' | 'medium' | 'low' | 'off';
  /** 水面の鏡像の解像度（画面に対する倍率。0 で鏡像なし） */
  waterMirrorScale: number;
  /** 水面の鏡像の多重サンプリングの数（r01-city。稜線の映り込みの階段を消す） */
  waterMirrorSamples: number;
  /** 環境マップ（キューブ）の一辺 */
  envMapSize: number;
  /** 遠景の代役（周りの街並み）を置く半径（m） */
  fillerRadius: number;
  /**
   * 街路樹（r01-city で3段に）：near までは葉のカードと枝、mid までは葉の塊（shadow までは影も落とす）、far までは1つの塊、その先は描かない（m）
   */
  trees: { near: number; shadow: number; mid: number; far: number };
  /**
   * 通りの暮らし（r01-city）：車は detail まで細かい形（窓の柱・ミラー・番号板）、near まで粗い断面の同じ輪郭、far まで箱。
   * 人は person まで手足と髪のある形、people まで1つの回転体、小物は people まで描く（m）
   */
  life: { detail: number; near: number; far: number; person: number; people: number };
}

export const QUALITY_PRESETS: Record<QualityName, QualityPreset> = {
  high: {
    maxPixelRatio: 1,
    shadow: { enabled: true, cascades: 4, mapSize: 2048, maxFar: 2600, fade: true },
    ao: { enabled: true, samples: 16, denoiseSamples: 8, halfRes: false },
    bloom: { enabled: true, levels: 8 },
    smaa: 'high',
    waterMirrorScale: 0.5,
    waterMirrorSamples: 4,
    envMapSize: 256,
    fillerRadius: 3200,
    trees: { near: 85, shadow: 240, mid: 420, far: 1800 },
    life: { detail: 70, near: 240, far: 1500, person: 90, people: 320 },
  },
  medium: {
    maxPixelRatio: 1,
    shadow: { enabled: true, cascades: 3, mapSize: 2048, maxFar: 1800, fade: true },
    ao: { enabled: true, samples: 8, denoiseSamples: 4, halfRes: true },
    bloom: { enabled: true, levels: 6 },
    smaa: 'medium',
    waterMirrorScale: 0.33,
    waterMirrorSamples: 2,
    envMapSize: 128,
    fillerRadius: 2600,
    trees: { near: 60, shadow: 160, mid: 300, far: 1200 },
    life: { detail: 45, near: 170, far: 1000, person: 60, people: 220 },
  },
  low: {
    maxPixelRatio: 1,
    shadow: { enabled: true, cascades: 2, mapSize: 1024, maxFar: 1000, fade: false },
    ao: { enabled: false, samples: 8, denoiseSamples: 4, halfRes: true },
    bloom: { enabled: true, levels: 5 },
    smaa: 'low',
    waterMirrorScale: 0,
    waterMirrorSamples: 0,
    envMapSize: 64,
    fillerRadius: 2000,
    trees: { near: 35, shadow: 90, mid: 180, far: 700 },
    life: { detail: 0, near: 110, far: 600, person: 35, people: 140 },
  },
};

/** 既定の画質。?q=high|medium|low で上書きできる。撮影ツールは high で撮る。 */
export const DEFAULT_QUALITY: QualityName = 'high';

export function isQualityName(value: string): value is QualityName {
  return value === 'high' || value === 'medium' || value === 'low';
}
