export const QUALITY_TIERS = Object.freeze({
  high: Object.freeze({ name: 'high', shadowCascades: 4, pixelRatio: 1.5, renderScale: 1, traa: true, ao: true, trees: 1, spray: 1 }),
  mid: Object.freeze({ name: 'mid', shadowCascades: 2, pixelRatio: 1.25, renderScale: .85, traa: true, ao: false, trees: .65, spray: .6 }),
  low: Object.freeze({ name: 'low', shadowCascades: 1, pixelRatio: 1, renderScale: .7, traa: false, ao: false, trees: .35, spray: .3 }),
});
/** URL > 保存値 > 端末。画素数は CSS 寸法×実効画素比の2乗。 */
export function selectQuality({ search = '', quality = 'auto', webgpu = false, touch = false,
  width = 1440, height = 900, pixelRatio = 1 } = {}) {
  const forced = new URLSearchParams(search).get('q');
  if (Object.hasOwn(QUALITY_TIERS, forced)) return forced;
  if (Object.hasOwn(QUALITY_TIERS, quality)) return quality;
  if (!webgpu) return 'low';
  if (touch || width * height * pixelRatio ** 2 > 3_000_000) return 'mid';
  return 'high';
}
