// 樹皮の色と凹凸。canvas に描く前の色計算はタイルノイズだけなので、端がつながり、Node で試験できる。
// 紅葉は滑らかな灰褐、黒松は板状の割れ、梅は荒いまだら。画像ファイルは使わない。
import { tileNoise2 } from './noise.js';

export const BARK_RGB = Object.freeze({
  maple: Object.freeze([0x6b, 0x5a, 0x4d]),
  pine: Object.freeze([0x3a, 0x32, 0x2c]),
  plum: Object.freeze([0x6a, 0x60, 0x56]),
});

const PINE_CRACK = [0x6b, 0x4a, 0x39];
const clampByte = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

function mix(a, b, t) {
  return a + (b - a) * t;
}

/**
 * 1点の樹皮。u,v は 0〜1。戻り値 r,g,b は 0〜255、h は 0〜1 の高さ（bump 用）。
 * 周期は整数倍のノイズと sin(2πn) だけなので、u=0 と u=1 は同じ色になる。
 */
export function barkSample(species, u, v, seed = 1) {
  const id = species === 'pine' || species === 'plum' ? species : 'maple';
  const base = BARK_RGB[id];
  const broad = tileNoise2(u, v, 3, seed, 4);
  const fine = tileNoise2(u, v, 9, seed + 17, 3);
  // u を縮めると 0 と 1 が別の場所を指し、横の継ぎ目が切れる。周期はそのままにする。
  const grain = tileNoise2(u, v, 5, seed + 41, 2);
  if (id === 'pine') {
    const warp = tileNoise2(u, v, 2, seed + 5, 2);
    const vertical = Math.abs(Math.sin((u * 7 + warp * 1.4) * Math.PI));
    const horizontal = Math.abs(Math.sin((v * 4 + warp * 0.8) * Math.PI));
    const crack = vertical < 0.16 || horizontal < 0.1;
    const plate = 0.78 + broad * 0.28;
    const r = crack ? mix(PINE_CRACK[0], 28, fine) : base[0] * plate;
    const g = crack ? mix(PINE_CRACK[1], 22, fine) : base[1] * plate;
    const b = crack ? mix(PINE_CRACK[2], 18, fine) : base[2] * plate;
    const h = crack ? 0.12 + fine * 0.08 : 0.55 + broad * 0.4;
    return { r: clampByte(r), g: clampByte(g), b: clampByte(b), h };
  }
  if (id === 'plum') {
    const pit = fine > 0.62 && grain > 0.55;
    const tone = 0.72 + broad * 0.36 + (pit ? -0.18 : 0);
    return {
      r: clampByte(base[0] * tone + grain * 18),
      g: clampByte(base[1] * tone + grain * 12),
      b: clampByte(base[2] * tone),
      h: pit ? 0.22 : 0.4 + fine * 0.45,
    };
  }
  const lenticel = fine > 0.7 && grain > 0.36;
  const tone = 0.74 + broad * 0.38 - (lenticel ? 0.3 : 0);
  return {
    r: clampByte(base[0] * tone + 8),
    g: clampByte(base[1] * tone + 4),
    b: clampByte(base[2] * tone),
    // 高さの底は黒松の割れ目より上に残す（割れの深さは松が勝つ）。
    h: 0.52 + (broad - 0.5) * 0.2 + (lenticel ? -0.06 : 0),
  };
}

export function barkSize(gfx = 'high') {
  if (gfx === 'test') return 64;
  if (gfx === 'low') return 160;
  return 256;
}

function paint(ctx, width, height, species, seed, channel) {
  const image = ctx.createImageData(width, height);
  const data = image.data;
  for (let y = 0; y < height; y += 1) {
    const v = y / height;
    for (let x = 0; x < width; x += 1) {
      const sample = barkSample(species, x / width, v, seed);
      const i = (y * width + x) * 4;
      if (channel === 'bump') {
        const g = clampByte(sample.h * 255);
        data[i] = g;
        data[i + 1] = g;
        data[i + 2] = g;
      } else {
        data[i] = sample.r;
        data[i + 1] = sample.g;
        data[i + 2] = sample.b;
      }
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

function makeCanvas(createCanvas, size) {
  const factory = createCanvas === undefined
    ? (typeof document !== 'undefined' ? (w, h) => document.createElement('canvas') : null)
    : createCanvas;
  if (typeof factory !== 'function') return null;
  const canvas = factory(size, size);
  if (!canvas || typeof canvas.getContext !== 'function') return null;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof ctx.createImageData !== 'function') return null;
  return { canvas, ctx };
}

/** 色と bump。canvas が無ければ null（試験やフォールバック）。 */
export function createBarkTextures(THREE, species, { seed = 1, gfx = 'high', createCanvas } = {}) {
  const size = barkSize(gfx);
  const color = makeCanvas(createCanvas, size);
  const bump = makeCanvas(createCanvas, size);
  if (!color || !bump) return { map: null, bump: null, size };
  paint(color.ctx, size, size, species, seed, 'color');
  paint(bump.ctx, size, size, species, seed, 'bump');
  const map = new THREE.CanvasTexture(color.canvas);
  const bumpMap = new THREE.CanvasTexture(bump.canvas);
  if (THREE.SRGBColorSpace) map.colorSpace = THREE.SRGBColorSpace;
  if (THREE.NoColorSpace) bumpMap.colorSpace = THREE.NoColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  map.anisotropy = gfx === 'high' ? 8 : 4;
  map.needsUpdate = true;
  bumpMap.needsUpdate = true;
  return { map, bump: bumpMap, size };
}

export function barkBumpScale(species) {
  if (species === 'pine') return 0.085;
  if (species === 'plum') return 0.05;
  return 0.045;
}
