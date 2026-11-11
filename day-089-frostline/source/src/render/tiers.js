// 画質の段ごとの値。1項目だけ切ると画の釣り合いが崩れるので、段ごとにまとめて決める。
// 段の名前（high・mid・low）の選び方は src/core/quality.js が持つ。ここは中身だけ。

/**
 * 区画の葉の一辺（m）：山の一辺を 128 に割る（一辺 6,144 m なら 24 m、4,096 m なら 32 m）。
 * 葉を 24 m に決め打ちしていたときは、山を 4,096 m へ縮めたら 2 の累乗で割れなくなり、区画の木が山を覆わず、
 * 近くの地面が描かれなかった（2026-11-11）。山の大きさから決める。
 */
export const TERRAIN_LEAVES = 128;
export const terrainLeaf = (size) => size / TERRAIN_LEAVES;
/** 段 0 を使う距離（m）。葉の 2√2 倍（2.83 倍）以上でないと、2段の寄せで境目が合わない。葉の 3 倍にする */
export const terrainBaseRange = (leaf) => leaf * 3;

export const TIERS = Object.freeze({
  high: Object.freeze({
    name: 'high',
    pixelBudget: 1920 * 1200, // 内部の画素数の上限（これを超える画素比にしない）
    maxPixelRatio: 2,
    gridQuads: 32, // 葉の頂点の間隔：葉の一辺 ÷ 32（一辺 4,096 m の山で 1 m）
    shadow: Object.freeze({ cascades: 3, mapSize: 2048, maxFar: 420, terrainCasts: true }),
    antialias: 'traa',
    bloom: true,
    microNormal: true,
    anisotropy: 8,
    treeRadius: 1200,
  }),
  mid: Object.freeze({
    name: 'mid',
    pixelBudget: 1600 * 900,
    maxPixelRatio: 1.5,
    gridQuads: 16, // 同じく 2 m
    shadow: Object.freeze({ cascades: 2, mapSize: 1024, maxFar: 260, terrainCasts: false }),
    antialias: 'fxaa',
    bloom: false,
    microNormal: true,
    anisotropy: 4,
    treeRadius: 800,
  }),
  low: Object.freeze({
    name: 'low',
    pixelBudget: 1280 * 720,
    maxPixelRatio: 1,
    gridQuads: 16,
    shadow: Object.freeze({ cascades: 1, mapSize: 1024, maxFar: 120, terrainCasts: false }),
    antialias: 'fxaa',
    bloom: false,
    microNormal: false,
    anisotropy: 1,
    treeRadius: 500,
  }),
});

export function tierByName(name) {
  return TIERS[name] || TIERS.mid;
}

/** 画面の大きさと段から、描画の画素比を決める */
export function pixelRatioFor(tier, cssWidth, cssHeight, devicePixelRatio) {
  const want = Math.min(devicePixelRatio || 1, tier.maxPixelRatio);
  const area = Math.max(1, cssWidth * cssHeight);
  const cap = Math.sqrt(tier.pixelBudget / area);
  return Math.max(0.5, Math.min(want, cap));
}
