// 卓や木を作る側と描画する側が同じ段を使うよう、負荷を決める値をここに置く。
export const GFX_TIERS = Object.freeze({
  high: Object.freeze({
    dpr: 2, shadowSize: 2048, stageSize: 1024, barkSize: 256, leafSize: 256,
    padCards: 120, anisotropy: 8, antialias: true, motion: true, foliageCore: true, pineMinCards: 80,
    potSegments: 64, soilRadial: 48, soilRings: 10, mossX: 48, mossZ: 36,
    mossClumps: 24, mossRadial: 8, stoneLat: 7, stoneLon: 10,
    wallX: 48, wallY: 28, mossSpecks: 2200, wallFibers: 2000,
  }),
  mid: Object.freeze({
    dpr: 1.75, shadowSize: 1024, stageSize: 512, barkSize: 256, leafSize: 208,
    padCards: 84, anisotropy: 4, antialias: true, motion: true, foliageCore: true, pineMinCards: 0,
    potSegments: 56, soilRadial: 42, soilRings: 8, mossX: 39, mossZ: 30,
    mossClumps: 18, mossRadial: 8, stoneLat: 7, stoneLon: 10,
    wallX: 38, wallY: 23, mossSpecks: 1500, wallFibers: 1400,
  }),
  low: Object.freeze({
    dpr: 1.25, shadowSize: 1024, stageSize: 256, barkSize: 160, leafSize: 160,
    padCards: 60, anisotropy: 2, antialias: false, motion: true, foliageCore: true, pineMinCards: 0,
    potSegments: 48, soilRadial: 36, soilRings: 7, mossX: 30, mossZ: 24,
    mossClumps: 12, mossRadial: 8, stoneLat: 7, stoneLon: 10,
    wallX: 28, wallY: 18, mossSpecks: 900, wallFibers: 800,
  }),
  test: Object.freeze({
    dpr: 1, shadowSize: 0, stageSize: 128, barkSize: 64, leafSize: 64,
    padCards: 6, anisotropy: 1, antialias: false, motion: false, foliageCore: false, pineMinCards: 0,
    potSegments: 24, soilRadial: 20, soilRings: 4, mossX: 14, mossZ: 12,
    mossClumps: 4, mossRadial: 6, stoneLat: 5, stoneLon: 7,
    wallX: 12, wallY: 8, mossSpecks: 180, wallFibers: 180,
  }),
});

export const AUTO_TIERS = Object.freeze(['high', 'mid', 'low']);
export const GFX_SETTINGS = Object.freeze(['auto', ...AUTO_TIERS]);
