export const ASPECTS = ['auto', '1:1', '4:5', '16:9', '9:16', '1.91:1'];

const RATIOS = { '1:1': 1, '4:5': 4 / 5, '16:9': 16 / 9, '9:16': 9 / 16, '1.91:1': 1.91 };
const clamp = (value) => Math.min(100, Math.max(0, Math.round(Number.isFinite(Number(value)) ? Number(value) : 0)));
const pixel = (value) => Math.max(1, Math.round(value));

export function computeLayout({ imgW, imgH, padding, radius, shadow, aspect, frame, maxSide = 4096 }) {
  const sourceW = Math.max(1, Number.isFinite(Number(imgW)) ? Number(imgW) : 1);
  const sourceH = Math.max(1, Number.isFinite(Number(imgH)) ? Number(imgH) : 1);
  const paddingLevel = clamp(padding);
  const radiusLevel = clamp(radius);
  const shadowLevel = clamp(shadow);
  const rawPad = Math.round(sourceW * 0.25 * paddingLevel / 100);
  const rawBar = frame ? Math.round(Math.max(18, sourceW * 0.036)) : 0;
  const cardW = sourceW;
  const cardH = sourceH + rawBar;
  const ratio = RATIOS[aspect];
  const rawWidth = ratio
    ? Math.max(cardW + 2 * rawPad, (cardH + 2 * rawPad) * ratio)
    : cardW + 2 * rawPad;
  const rawHeight = ratio ? rawWidth / ratio : cardH + 2 * rawPad;
  const limit = Math.max(1, Number(maxSide) || 1);
  const scale = Math.min(1, limit / Math.max(rawWidth, rawHeight));
  const width = pixel(rawWidth * scale);
  const height = pixel(rawHeight * scale);
  const scaledCardW = pixel(cardW * scale);
  const scaledCardH = pixel(cardH * scale);
  const bar = rawBar ? pixel(rawBar * scale) : 0;
  const cardX = Math.round((width - scaledCardW) / 2);
  const cardY = Math.round((height - scaledCardH) / 2);
  const blur = Math.round(sourceW * 0.08 * shadowLevel / 100 * scale);

  return {
    width,
    height,
    scale,
    pad: Math.round(rawPad * scale),
    radius: Math.round(sourceW * 0.06 * radiusLevel / 100 * scale),
    shadow: {
      blur,
      offsetY: Math.round(blur * 0.45),
      alpha: shadowLevel === 0 ? 0 : 0.18 + 0.27 * shadowLevel / 100
    },
    bar,
    card: { x: cardX, y: cardY, w: scaledCardW, h: scaledCardH },
    image: { x: cardX, y: cardY + bar, w: scaledCardW, h: pixel(sourceH * scale) }
  };
}
