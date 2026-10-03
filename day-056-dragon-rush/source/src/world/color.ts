// OWNER: world
// 色の個体差を作る小さな道具。色は sRGB の 0..1 で持ち、線形への変換は描画側で行う。
import type { Rng } from '../core/rng';

export type RGB = [number, number, number];

export function hexToRgb(hex: number): RGB {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

function rgbToHsl([r, g, b]: RGB): RGB {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb([h, s, l]: RGB): RGB {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number): number => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)];
}

/** 色相・彩度・明度を少しずらして、同じ色見本からでも1棟ずつ違う色にする。 */
export function jitterColor(hex: number, rng: Rng, amount = 1): RGB {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  const nh = (h + rng.range(-0.012, 0.012) * amount + 1) % 1;
  const ns = Math.min(1, Math.max(0, s * (1 + rng.range(-0.18, 0.18) * amount)));
  const nl = Math.min(0.95, Math.max(0.03, l * (1 + rng.range(-0.09, 0.09) * amount)));
  return hslToRgb([nh, ns, nl]);
}

export function scaleColor(c: RGB, k: number): RGB {
  return [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
}
