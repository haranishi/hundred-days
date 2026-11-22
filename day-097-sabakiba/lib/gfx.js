// 画質を1段変えたときの、魚・まな板・描画先の予算をそろえる。
export const GFX_TIERS = Object.freeze({
  high: Object.freeze({ quality: 'high', dpr: 2, shadowSize: 1024, maxTextureSize: 1024, maxTriangles: 90000 }),
  standard: Object.freeze({ quality: 'standard', dpr: 1.5, shadowSize: 512, maxTextureSize: 512, maxTriangles: 45000 }),
  light: Object.freeze({ quality: 'light', dpr: 1, shadowSize: 0, maxTextureSize: 512, maxTriangles: 20000 }),
});
export const AUTO_TIERS = Object.freeze(Object.keys(GFX_TIERS));
export const SLOW_FPS = 26;

export function measuredTier(tier, fps, minFps = SLOW_FPS) {
  const index = AUTO_TIERS.indexOf(tier);
  if (index < 0 || !Number.isFinite(fps) || fps <= 0 || fps >= minFps) return tier;
  return AUTO_TIERS[Math.min(index + 1, AUTO_TIERS.length - 1)];
}
