/* 熱の帯の色。透明度ではなく「明るさ」で強さを伝える。
   暗い背景の上では不透明度を上げても輝度がほとんど動かず、熱の差が見分けられないため、
   暗い赤 → 明るい橙へ輝度そのものを上げる階調にしてある。 */
export const BACKDROP = [6, 11, 25];
const STOPS = [
  { at: 0, rgb: [92, 44, 52] },
  { at: 0.3, rgb: [190, 90, 70] },
  { at: 1, rgb: [255, 140, 90] },
];
export function heatRgb(heat) {
  const h = Math.max(0, Math.min(1, Number.isFinite(heat) ? heat : 0));
  const i = h <= STOPS[1].at ? 0 : 1;
  const from = STOPS[i], to = STOPS[i + 1], t = (h - from.at) / (to.at - from.at);
  return from.rgb.map((v, k) => Math.round(v + (to.rgb[k] - v) * t));
}
export const heatFill = heat => `rgb(${heatRgb(heat).join(',')})`;
const channel = v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
export const relativeLuminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
export function contrastRatio(one, other) {
  const a = relativeLuminance(one), b = relativeLuminance(other);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
export const heatContrast = (heat, backdrop = BACKDROP) => contrastRatio(heatRgb(heat), backdrop);
