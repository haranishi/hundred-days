export const CAT_EMISSIVE_MAX = .16;
// Keep the warm coat legible; the trail and halo carry the light-speed effect.
export function catEmissiveIntensity(level) {
  if(level>=1)return CAT_EMISSIVE_MAX;
  const strength = Number.isNaN(level) ? 0 : (level - .55) / .45;
  return Math.min(CAT_EMISSIVE_MAX, Math.max(0, strength * CAT_EMISSIVE_MAX));
}

export const CAT_WHITEN_MAX = .18;
export const CAT_HALO_OPACITY_MAX = .24;
export const CAT_HALO_SCALE_MAX = 1.18;
function unit(value) { return Number.isNaN(value)?0:Math.max(0,Math.min(1,value)); }
export function catLightAppearance(level,ratio) {
  const strength=unit((level-.65)/.35);
  return {
    haloOpacity:strength*CAT_HALO_OPACITY_MAX,
    haloScale:1+strength*(CAT_HALO_SCALE_MAX-1),
    whiten:unit((ratio-.99)/.01)*CAT_WHITEN_MAX
  };
}
