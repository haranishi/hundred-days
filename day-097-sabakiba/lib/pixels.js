// 純JSの画素生成ユーティリティ。Canvas を使わずに決定的な DataTexture を作ります。
import * as THREE from '../vendor/three.js';

export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  if (e0 === e1) return x < e0 ? 0 : 1;
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** #RRGGBB または #RGB を 0〜1 の sRGB [r, g, b] に変換します。 */
export function hexToRgb(hex, fallback = [0.72, 0.78, 0.80]) {
  if (typeof hex !== 'string') return [...fallback];
  const s = hex.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(s)) {
    return [
      parseInt(s.slice(0, 2), 16) / 255,
      parseInt(s.slice(2, 4), 16) / 255,
      parseInt(s.slice(4, 6), 16) / 255,
    ];
  }
  if (/^[0-9a-fA-F]{3}$/.test(s)) {
    return [
      parseInt(s[0] + s[0], 16) / 255,
      parseInt(s[1] + s[1], 16) / 255,
      parseInt(s[2] + s[2], 16) / 255,
    ];
  }
  return [...fallback];
}

/** sRGB [0..1] → 線形値 [0..1]。 */
export function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** 線形値 [0..1] → sRGB [0..1]。 */
export function linearToSrgb(c) {
  const v = clamp01(c);
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
}

export function hexToLinearRgb(hex, fallback) {
  return hexToRgb(hex, fallback).map(srgbToLinear);
}

export function mixRgb(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function scaleRgb(c, s) {
  return [c[0] * s, c[1] * s, c[2] * s];
}

export function toByte(v) {
  const n = Math.round(clamp01(v) * 255);
  return n < 0 ? 0 : n > 255 ? 255 : n;
}

/** RGBA 画素バッファを作ります。 */
export function createBuffer(width, height, fill = [0, 0, 0, 255]) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const data = new Uint8ClampedArray(w * h * 4);
  if (fill[0] || fill[1] || fill[2] || fill[3]) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = fill[0];
      data[i + 1] = fill[1];
      data[i + 2] = fill[2];
      data[i + 3] = fill[3];
    }
  }
  return { width: w, height: h, data };
}

/** (x, y) の画素を上書きします。wrapX/wrapY で周回できます。 */
export function setPixel(buf, x, y, r, g, b, a = 255, { wrapX = false, wrapY = false } = {}) {
  let ix = x | 0;
  let iy = y | 0;
  if (wrapX) ix = ((ix % buf.width) + buf.width) % buf.width;
  else if (ix < 0 || ix >= buf.width) return;
  if (wrapY) iy = ((iy % buf.height) + buf.height) % buf.height;
  else if (iy < 0 || iy >= buf.height) return;
  const i = (iy * buf.width + ix) * 4;
  buf.data[i] = r;
  buf.data[i + 1] = g;
  buf.data[i + 2] = b;
  buf.data[i + 3] = a;
}

/** sRGB バイト配列上にアルファ合成します（color は 0〜1 の sRGB [r,g,b]）。 */
export function blendPixel(buf, x, y, color, alpha, { wrapX = false, wrapY = false } = {}) {
  if (alpha <= 0) return;
  let ix = x | 0;
  let iy = y | 0;
  if (wrapX) ix = ((ix % buf.width) + buf.width) % buf.width;
  else if (ix < 0 || ix >= buf.width) return;
  if (wrapY) iy = ((iy % buf.height) + buf.height) % buf.height;
  else if (iy < 0 || iy >= buf.height) return;
  const t = clamp01(alpha);
  const inv = 1 - t;
  const i = (iy * buf.width + ix) * 4;
  buf.data[i] = Math.round(buf.data[i] * inv + color[0] * 255 * t);
  buf.data[i + 1] = Math.round(buf.data[i + 1] * inv + color[1] * 255 * t);
  buf.data[i + 2] = Math.round(buf.data[i + 2] * inv + color[2] * 255 * t);
}

/** 全画素に関数 fn(u, v, ix, iy) -> [r, g, b, a]（0〜1）を適用します。 */
export function fillPixels(buf, fn) {
  const { width, height, data } = buf;
  const invW = 1 / width;
  const invH = 1 / height;
  for (let iy = 0; iy < height; iy++) {
    const v = (iy + 0.5) * invH;
    const row = iy * width * 4;
    for (let ix = 0; ix < width; ix++) {
      const u = (ix + 0.5) * invW;
      const rgba = fn(u, v, ix, iy);
      const off = row + ix * 4;
      data[off] = toByte(rgba[0]);
      data[off + 1] = toByte(rgba[1]);
      data[off + 2] = toByte(rgba[2]);
      data[off + 3] = rgba.length > 3 ? toByte(rgba[3]) : 255;
    }
  }
  return buf;
}

/** 縦方向（v）の多点グラデーションを評価します。stops は [[v, [r,g,b]], ...] の昇順。 */
export function sampleGradient(stops, v) {
  if (v <= stops[0][0]) return stops[0][1];
  const last = stops.length - 1;
  if (v >= stops[last][0]) return stops[last][1];
  for (let i = 0; i < last; i++) {
    const [v0, c0] = stops[i];
    const [v1, c1] = stops[i + 1];
    if (v <= v1) {
      const t = smoothstep(v0, v1, v);
      return mixRgb(c0, c1, t);
    }
  }
  return stops[last][1];
}

/** 柔らかい楕円斑点を描きます（v の周回に対応）。 */
export function drawDisc(buf, cu, cv, ru, rv, color, alpha = 1, softness = 0.45, { wrapV = true } = {}) {
  const { width, height } = buf;
  const minX = Math.max(0, Math.floor((cu - ru) * width) - 1);
  const maxX = Math.min(width - 1, Math.ceil((cu + ru) * width) + 1);
  const ySpan = Math.ceil(rv * height) + 2;
  const cyPx = Math.floor(cv * height);
  const invRu = 1 / Math.max(ru, 1e-6);
  const invRv = 1 / Math.max(rv, 1e-6);
  const inner = clamp01(1 - softness);
  for (let dy = -ySpan; dy <= ySpan; dy++) {
    const rawY = cyPx + dy;
    if (!wrapV && (rawY < 0 || rawY >= height)) continue;
    const iy = wrapV ? ((rawY % height) + height) % height : rawY;
    const v = (iy + 0.5) / height;
    let dv = v - cv;
    if (wrapV) {
      if (dv > 0.5) dv -= 1;
      else if (dv < -0.5) dv += 1;
    }
    const ny = dv * invRv;
    const ny2 = ny * ny;
    if (ny2 >= 1) continue;
    for (let ix = minX; ix <= maxX; ix++) {
      const u = (ix + 0.5) / width;
      const nx = (u - cu) * invRu;
      const d = Math.sqrt(nx * nx + ny2);
      if (d >= 1) continue;
      const w = (1 - smoothstep(inner, 1, d)) * alpha;
      blendPixel(buf, ix, iy, color, w);
    }
  }
}

/** 折れ線に沿った柔らかい帯を描きます。points は [[u, v], ...]。 */
export function drawPolyline(buf, points, halfWidthV, color, alpha = 1, { wrapV = true, softness = 0.55 } = {}) {
  if (!points || points.length < 2) return;
  const { width, height } = buf;
  const aspect = height / width;
  const inner = clamp01(1 - softness);
  for (let k = 0; k < points.length - 1; k++) {
    const [u0, v0] = points[k];
    const [u1, v1] = points[k + 1];
    let dvSeg = v1 - v0;
    if (wrapV) {
      if (dvSeg > 0.5) dvSeg -= 1;
      else if (dvSeg < -0.5) dvSeg += 1;
    }
    const duSeg = u1 - u0;
    const segLen2 = (duSeg / aspect) ** 2 + dvSeg * dvSeg;
    const minU = Math.min(u0, u1) - halfWidthV * aspect;
    const maxU = Math.max(u0, u1) + halfWidthV * aspect;
    const minX = Math.max(0, Math.floor(minU * width) - 1);
    const maxX = Math.min(width - 1, Math.ceil(maxU * width) + 1);
    const vMid = v0 + dvSeg * 0.5;
    const vRadius = Math.abs(dvSeg) * 0.5 + halfWidthV + 2 / height;
    const ySpan = Math.ceil(vRadius * height);
    const cy = Math.floor(vMid * height);
    for (let dy = -ySpan; dy <= ySpan; dy++) {
      const rawY = cy + dy;
      if (!wrapV && (rawY < 0 || rawY >= height)) continue;
      const iy = wrapV ? ((rawY % height) + height) % height : rawY;
      const v = (iy + 0.5) / height;
      let dv0 = v - v0;
      if (wrapV) {
        if (dv0 > 0.5) dv0 -= 1;
        else if (dv0 < -0.5) dv0 += 1;
      }
      for (let ix = minX; ix <= maxX; ix++) {
        const u = (ix + 0.5) / width;
        const du0 = u - u0;
        const t = segLen2 > 1e-12
          ? clamp01(((du0 / aspect) * (duSeg / aspect) + dv0 * dvSeg) / segLen2)
          : 0;
        const dx = (du0 - duSeg * t) / aspect;
        const dyLocal = dv0 - dvSeg * t;
        const d = Math.hypot(dx, dyLocal) / Math.max(halfWidthV, 1e-6);
        if (d >= 1) continue;
        const w = (1 - smoothstep(inner, 1, d)) * alpha;
        blendPixel(buf, ix, iy, color, w);
      }
    }
  }
}

/** 画素配列の決定的32ビットハッシュ（FNV-1a、16進8桁）を返します。 */
export function hashPixels(data) {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    h ^= data[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** 画素バッファを THREE.DataTexture に変換します。 */
export function toDataTexture(buf, {
  srgb = true,
  wrapS = THREE.ClampToEdgeWrapping,
  wrapT = THREE.RepeatWrapping,
  mipmaps = true,
  anisotropy = 4,
} = {}) {
  const tex = new THREE.DataTexture(buf.data, buf.width, buf.height, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = wrapS;
  tex.wrapT = wrapT;
  tex.flipY = false;
  tex.generateMipmaps = mipmaps;
  tex.minFilter = mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}
