// 身・骨・断面の質感に使う純JS詳細テクスチャと、魚体プロファイル LUT を作ります。
import * as THREE from '../vendor/three.js';
import { hashString } from './rng.js';
import { tileNoise2 } from './noise.js';
import { makeProfile } from './profile.js';
import { lateralLineRatio } from './textures-skin.js';
import { clamp01, smoothstep, createBuffer, fillPixels, hashPixels, toDataTexture } from './pixels.js';

/**
 * タイル可能な身・組織の詳細テクスチャ画素を決定的に作ります。
 * R: 筋繊維の細かい流れ / G: コラーゲン・膜の揺らぎ / B: 有機的な色むら / A: 濡れた微細凹凸
 */
export function generateFleshPixels({ size, quality = 'standard', seed = 9701 } = {}) {
  const s = Math.max(32, Math.round(size ?? (quality === 'light' ? 128 : 256)));
  const lightMode = quality === 'light';
  const buf = createBuffer(s, s);
  fillPixels(buf, (u, v) => {
    // R: 長軸方向に細長い筋繊維（v方向に高周波、u方向に緩やか）
    const fiberA = tileNoise2(u, v * 4, 8, seed + 11, lightMode ? 2 : 4);
    const fiberB = tileNoise2(u * 2, v * 6, 12, seed + 29, lightMode ? 2 : 3);
    const fiber = clamp01(0.62 * fiberA + 0.38 * fiberB);

    // G: コラーゲンや筋膜の繊細な粒感
    const collagen = tileNoise2(u, v, 16, seed + 53, lightMode ? 2 : 4);

    // B: 大きな色温度の揺らぎ（生身の透明感と自然なむら）
    const organic = tileNoise2(u, v, 4, seed + 97, lightMode ? 2 : 3);

    // A: 濡れた表面の微細凹凸（クリアコート下の揺らぎ）
    const micro = lightMode
      ? 0.5 + (collagen - 0.5) * 0.5
      : tileNoise2(u, v, 24, seed + 149, 3);

    return [fiber, collagen, organic, micro];
  });
  return { width: buf.width, height: buf.height, data: buf.data, hash: hashPixels(buf.data) };
}

/** 身の微細詳細 DataTexture（リニア空間・タイル繰り返し）を作ります。 */
export function createFleshTexture(opts = {}) {
  const generated = generateFleshPixels(opts);
  const texture = toDataTexture(generated, {
    srgb: false,
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping,
    mipmaps: true,
    anisotropy: opts.quality === 'light' ? 1 : 4,
  });
  texture.name = '身詳細';
  texture.userData.pixelHash = generated.hash;
  return { texture, hash: generated.hash, width: generated.width, height: generated.height };
}

/**
 * 魚体の駅 s∈[0,1] ごとの断面寸法を 64×2 の Float32 LUT に詰めます。
 * 行0: (top, bottom, half, axisY) [cm]
 * 行1: (spineRadius [cm], lateralRatio [-1..1], scuteMask [0..1], cavityMask [0..1])
 */
export function generateProfileData(species = {}, { samples = 64 } = {}) {
  const shape = species?.shape ?? {};
  const family = species?.family ?? 'round';
  const TL = Number.isFinite(species?.sizeCm?.typical) ? species.sizeCm.typical : 21;
  const TL_over_SL = Number.isFinite(shape.TL_over_SL) ? shape.TL_over_SL : 1.16;
  const SL = TL / TL_over_SL;
  const profile = makeProfile(shape, family, SL);

  const headLength = (shape.opercleEdge ?? shape.headLength ?? 27.5) / 100;
  const vent = (species?.vent ?? 50) / 100;
  const cavityEnd = (species?.cavityEnd ?? vent * 100) / 100;
  const peak = profile((shape.maxDepthPos ?? 40) / 100);
  const maxDepth = peak.top + peak.bottom;
  const dia = species?.vertebraDia ?? shape.vertebraDia;
  const baseSpineR = dia == null ? 0.0125 * SL : maxDepth * dia / 200;

  const scuteCount = species?.scutes?.count ?? 0;
  const scuteFrom = (species?.scutes?.from ?? 53) / 100;
  // マアジは側線全域にぜいごがあるが、直走部（53%SL〜）が特に硬く明瞭。
  // イワシの腹部稜鱗は体側ぜいごではないため除外する。
  const hasLateralScutes = scuteCount > 0 && species?.id !== 'iwashi';

  const width = Math.max(16, Math.round(samples));
  const height = 2;
  const data = new Float32Array(width * height * 4);

  for (let i = 0; i < width; i++) {
    const s = i / (width - 1);
    const pr = profile(s);
    const spineR = Math.min(baseSpineR, pr.half * 0.58, pr.top * 0.43, pr.bottom * 0.43);
    const latRatio = lateralLineRatio(species, s);

    let scuteMask = 0;
    if (hasLateralScutes) {
      const backStrong = smoothstep(Math.max(scuteFrom, 0.48), 0.56, s) * (1 - smoothstep(0.96, 1.0, s));
      const frontSoft = smoothstep(scuteFrom, scuteFrom + 0.05, s) * (1 - smoothstep(0.50, 0.58, s)) * 0.35;
      scuteMask = clamp01(backStrong + frontSoft);
    }
    const cavityMask = smoothstep(headLength - 0.03, headLength + 0.02, s)
      * (1 - smoothstep(cavityEnd - 0.04, cavityEnd + 0.02, s));

    const r0 = i * 4;
    data[r0] = Math.max(pr.top, 1e-4);
    data[r0 + 1] = Math.max(pr.bottom, 1e-4);
    data[r0 + 2] = Math.max(pr.half, 1e-4);
    data[r0 + 3] = pr.axisY;

    const r1 = (width + i) * 4;
    data[r1] = Math.max(spineR, 1e-4);
    data[r1 + 1] = latRatio;
    data[r1 + 2] = scuteMask;
    data[r1 + 3] = cavityMask;
  }

  return {
    width,
    height,
    data,
    meta: {
      SL,
      TL,
      maxDepth,
      headLength,
      cavityEnd,
      hasLateralScutes,
      scuteCount,
      scuteFrom,
      seed: hashString(`profile:${species?.id ?? 'default'}`),
    },
  };
}

/** 魚体プロファイル LUT を RGBA32F の DataTexture として生成します（拡張不要の NearestFilter）。 */
export function createProfileTexture(species = {}, opts = {}) {
  const { width, height, data, meta } = generateProfileData(species, opts);
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.needsUpdate = true;
  texture.name = `断面LUT_${species?.id ?? 'default'}`;
  return { texture, meta };
}
