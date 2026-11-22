// 種の look（色・模様・うろこ）から皮の色テクスチャを純JSで生成します。
// UV規約: u = s (0:吻端 → 1:尾柄), v = phi / (2π) (0/1:左体側, 0.25:背, 0.5:右体側, 0.75:腹)
import * as THREE from '../vendor/three.js';
import { createRng, hashString } from './rng.js';
import { fbm2, tileNoise2 } from './noise.js';
import {
  clamp01, lerp, smoothstep, hexToLinearRgb, linearToSrgb, mixRgb, scaleRgb,
  createBuffer, fillPixels, drawDisc, drawPolyline, hashPixels, toDataTexture,
} from './pixels.js';

const TWO_PI = Math.PI * 2;

const DEFAULT_COLORS = {
  dorsal: '#2F4858',
  flank: '#B8C7CC',
  belly: '#EEF2F5',
  fin: '#A5A882',
  iris: '#D8D6C8',
};

/** 種の側線の高さ比（[-1, 1]）を駅 s から返します。 */
export function lateralLineRatio(species, s) {
  const id = species?.id ?? '';
  const head = (species?.shape?.opercleEdge ?? species?.shape?.headLength ?? 27.5) / 100;
  if (id === 'sanma') return -0.78;
  if (id === 'tai' || id === 'kisu') {
    const arch = Math.sin(clamp01((s - head) / Math.max(0.1, 0.92 - head)) * Math.PI);
    return 0.12 + 0.34 * arch;
  }
  if (species?.family === 'flat') {
    const arch = Math.exp(-(((s - (head + 0.10)) / 0.11) ** 2));
    return 0.04 + 0.36 * arch;
  }
  // アジ等の標準型: 胸ビレ上で緩く弧を描き、53%SL以降で直走（anatomy.js の側線・scuteRow に揃える）
  const drop = smoothstep(head, 0.53, s);
  const arch = Math.sin(clamp01((s - head) / Math.max(0.05, 0.53 - head)) * Math.PI) * (1 - drop * 0.65);
  return lerp(0.20, 0.14, drop) + 0.12 * arch;
}

/** パターン名の配列を正規化します。文字列・オブジェクトどちらにも対応します。 */
function normalizePatterns(patterns) {
  if (!Array.isArray(patterns)) return [];
  return patterns.map((p) => (typeof p === 'string' ? { type: p } : p)).filter((p) => p && p.type);
}

/** 高さ比 h (-1..1) を左右両側の v 座標（phi/2π）に変換します。 */
function ratioToV(ratio, side) {
  const clamped = Math.max(-0.98, Math.min(0.98, ratio));
  const theta = Math.asin(clamped);
  const phi = side === 'L' ? (theta < 0 ? theta + TWO_PI : theta) : Math.PI - theta;
  return phi / TWO_PI;
}

/** 模様レイヤーを sRGB 画素バッファへ重ねます。 */
function paintPatterns(buf, species, seed, lightMode) {
  const patterns = normalizePatterns(species?.look?.patterns);
  const head = (species?.shape?.opercleEdge ?? species?.shape?.headLength ?? 27.5) / 100;
  const rng = createRng(seed ^ 0x51a7e9);
  const sides = species?.family === 'flat' ? ['L'] : ['L', 'R'];

  for (const pat of patterns) {
    const t = pat.type;
    if (t === 'opercleSpot') {
      // head.js が鰓蓋後上縁（ratio≈0.62）に立体黒斑を置くため、重複させず極薄い馴染み影のみ添える
      const haloColor = [0.14, 0.20, 0.24];
      for (const side of sides) {
        const cv = ratioToV(0.60, side);
        drawDisc(buf, Math.max(0.05, head - 0.022), cv, 0.015, 0.018, haloColor, 0.24, 0.85);
      }
    } else if (t === 'dots' || t === 'sardineSpots' || t === 'spotRow') {
      // マイワシの七つ星：背と銀の境目に並ぶ小暗斑
      const count = pat.count ?? 7;
      const spotColor = [0.08, 0.15, 0.24];
      for (const side of sides) {
        for (let i = 0; i < count; i++) {
          const u = head + 0.05 + (0.54 * i) / Math.max(1, count - 1) + (rng.next() - 0.5) * 0.015;
          const r = 0.34 + 0.07 * Math.sin(i * 1.1) + (rng.next() - 0.5) * 0.03;
          const cv = ratioToV(r, side);
          drawDisc(buf, u, cv, 0.012, 0.017, spotColor, 0.68, 0.55);
        }
      }
    } else if (t === 'wavyStripes' || t === 'mackerelStripes' || t === 'sabaStripes') {
      // マサバの鯖紋：背〜上側面の波状横縞
      const stripeCount = lightMode ? 14 : 22;
      const stripeColor = [0.07, 0.18, 0.24];
      for (let i = 0; i < stripeCount; i++) {
        const baseU = head + 0.02 + (0.68 * i) / stripeCount;
        for (const side of sides) {
          const pts = [];
          const steps = 10;
          const phase = rng.next() * TWO_PI;
          for (let k = 0; k <= steps; k++) {
            const frac = k / steps;
            const h = lerp(0.95, 0.16 + 0.12 * Math.sin(i * 1.7 + phase), frac);
            const u = baseU + 0.018 * Math.sin(frac * Math.PI * 2.2 + phase) + frac * 0.012;
            pts.push([clamp01(u), ratioToV(h, side)]);
          }
          drawPolyline(buf, pts, 0.0085, stripeColor, 0.58, { softness: 0.55 });
        }
      }
    } else if (t === 'bellyStripes' || t === 'katsuoStripes') {
      // カツオの腹部暗色縦縞
      const lines = pat.count ?? 5;
      const stripeColor = [0.13, 0.17, 0.24];
      for (const side of sides) {
        for (let i = 0; i < lines; i++) {
          const baseH = -0.10 - i * 0.135;
          const pts = [];
          for (let k = 0; k <= 16; k++) {
            const frac = k / 16;
            const u = lerp(head + 0.02, 0.90 - i * 0.03, frac);
            const h = baseH + 0.025 * Math.sin(frac * Math.PI);
            pts.push([u, ratioToV(h, side)]);
          }
          drawPolyline(buf, pts, 0.009, stripeColor, 0.62, { softness: 0.5 });
        }
      }
    } else if (t === 'blueSpots' || t === 'taiSpots') {
      // マダイの瑠璃色小斑点
      const count = lightMode ? 24 : 46;
      const blue = [0.18, 0.56, 0.92];
      for (const side of sides) {
        for (let i = 0; i < count; i++) {
          const u = head + 0.02 + rng.next() * (0.90 - head);
          const h = 0.12 + rng.next() * 0.72;
          drawDisc(buf, u, ratioToV(h, side), 0.007, 0.011, blue, 0.48, 0.6);
        }
      }
    } else if (t === 'camoSpots' || t === 'flatSpots') {
      // ヒラメ有眼側の砂泥斑紋
      const count = lightMode ? 28 : 56;
      for (let i = 0; i < count; i++) {
        const u = 0.06 + rng.next() * 0.90;
        const h = (rng.next() - 0.5) * 1.84;
        const pale = rng.next() > 0.58;
        const col = pale ? [0.64, 0.58, 0.47] : [0.22, 0.18, 0.13];
        const rx = 0.014 + rng.next() * 0.024;
        drawDisc(buf, u, ratioToV(h, 'L'), rx, rx * 1.4, col, pale ? 0.34 : 0.40, 0.65);
      }
    } else if (t === 'yellowJaw') {
      // サンマ下顎先端の黄色み
      const jaw = [0.92, 0.73, 0.20];
      drawDisc(buf, 0.012, 0.75, 0.022, 0.08, jaw, 0.75, 0.6);
    }
  }
}

/**
 * 種の皮テクスチャ画素配列を決定的に生成します。
 * 返り値: { width, height, data: Uint8ClampedArray, hash: string }
 */
export function generateSkinPixels(species = {}, { width, height, quality = 'standard', rng } = {}) {
  const defaultW = quality === 'high' ? 1024 : 512;
  const w = Math.max(32, Math.round(width ?? defaultW));
  const h = Math.max(16, Math.round(height ?? Math.max(32, w >> 1)));
  const seed = rng?.seed ?? hashString(`skin:${species?.id ?? 'default'}`);
  const lightMode = quality === 'light';
  const octaves = lightMode ? 2 : 4;

  const colors = { ...DEFAULT_COLORS, ...(species?.look?.colors ?? {}) };
  const dorsalLin = hexToLinearRgb(colors.dorsal);
  const flankLin = hexToLinearRgb(colors.flank);
  const bellyLin = hexToLinearRgb(colors.belly);

  // 生鮮魚の自然な輝度設計: 背は深く濃い青緑、体側は明るい生銀、腹は澄んだ真珠白
  const deepDorsalLin = scaleRgb(dorsalLin, 0.58);
  const brightFlankLin = mixRgb(flankLin, [0.76, 0.83, 0.87], 0.32);
  const pearlBellyLin = mixRgb(bellyLin, [0.94, 0.96, 0.97], 0.35);
  // 背と体側の境目に現れる淡い青緑〜金銀の干渉帯
  const sheenBandLin = mixRgb(
    mixRgb(dorsalLin, brightFlankLin, 0.48),
    [0.24, 0.44, 0.43],
    0.34,
  );
  // 鰓蓋のやや金属質な銀肌
  const opercleTint = mixRgb(brightFlankLin, [0.82, 0.88, 0.91], 0.34);
  const headLen = (species?.shape?.opercleEdge ?? species?.shape?.headLength ?? 27.5) / 100;
  const flat = species?.family === 'flat';
  const drawLatLine = species?.id !== 'iwashi';

  // 各列 u の側線高さ比を先に計算しておき、節の無い滑らかな側線を画素単位で描く
  const latByCol = new Float32Array(w);
  for (let ix = 0; ix < w; ix++) {
    latByCol[ix] = lateralLineRatio(species, (ix + 0.5) / w);
  }

  const buf = createBuffer(w, h);
  fillPixels(buf, (u, v, ix) => {
    const phi = v * TWO_PI;
    const sinP = Math.sin(phi); // +1: 背, 0: 体側, -1: 腹
    const cosP = Math.cos(phi); // +1: 左(L), -1: 右(R)

    const nMacro = tileNoise2(u, v, 8, seed + 17, octaves);
    const nMicro = lightMode ? 0.5 : tileNoise2(u, v, 32, seed + 71, 3);
    const nFine = lightMode ? 0.5 : tileNoise2(u, v, 64, seed + 251, 2);
    const nGrain = lightMode ? 0.5 : fbm2(u * 42, sinP * 11, seed + 193, 2);

    let col;
    if (flat) {
      const eyedMask = smoothstep(-0.14, 0.14, cosP);
      const eyedBase = mixRgb(flankLin, dorsalLin, clamp01(0.45 + 0.45 * (nMacro - 0.5) + 0.25 * Math.abs(sinP)));
      const eyedMod = scaleRgb(eyedBase, 0.88 + 0.24 * nMicro);
      const blindMod = scaleRgb(pearlBellyLin, 0.96 + 0.06 * nMacro);
      col = mixRgb(blindMod, eyedMod, eyedMask);
    } else {
      // カウンターシェード: 背の青緑が上体側30%付近まで自然に下がり、銀の体側〜白い腹へ連続
      const jitter = (nMacro - 0.5) * 0.13 + (nMicro - 0.5) * 0.045;
      const dorsalT = smoothstep(0.18, 0.72, sinP + jitter * 0.55);
      const deepRidgeT = smoothstep(0.58, 0.96, sinP + jitter * 0.25);
      const bellyT = smoothstep(-0.08, -0.74, sinP + jitter * 0.35);
      const sheenBand = Math.exp(-(((sinP - 0.30 + jitter * 0.32) / 0.20) ** 2));

      col = mixRgb(brightFlankLin, dorsalLin, dorsalT ** 1.05);
      col = mixRgb(col, deepDorsalLin, deepRidgeT * 0.72);
      col = mixRgb(col, sheenBandLin, sheenBand * 0.42);
      col = mixRgb(col, pearlBellyLin, bellyT ** 0.88);

      // 色素胞の微細むら（均一なCGグラデ感を消す）
      const mottle = 1 + (nMacro - 0.5) * (0.14 + 0.12 * dorsalT)
        + (nMicro - 0.5) * 0.075 + (nFine - 0.5) * 0.045;
      col = scaleRgb(col, mottle);

      // 体側の繊細な筋反射帯
      const flankMask = 1 - Math.abs(sinP);
      col = scaleRgb(col, 1 + (nGrain - 0.5) * 0.065 * flankMask);
    }

    // 頭部・吻・鰓蓋の繊細な陰影
    const snoutDark = (1 - smoothstep(0.0, headLen * 0.58, u)) * smoothstep(-0.05, 0.58, sinP);
    col = scaleRgb(col, 1 - snoutDark * 0.24);

    if (!flat) {
      const cheek = smoothstep(headLen * 0.40, headLen * 0.72, u)
        * (1 - smoothstep(headLen * 0.94, headLen * 1.03, u))
        * smoothstep(-0.72, 0.24, sinP) * (1 - smoothstep(0.26, 0.72, sinP));
      col = mixRgb(col, opercleTint, cheek * 0.40);

      // 鰓蓋の縁のほのかな暗い溝
      const gillGroove = Math.exp(-(((u - (headLen - 0.008)) / 0.010) ** 2))
        * smoothstep(-0.82, -0.55, sinP) * (1 - smoothstep(0.55, 0.85, sinP));
      col = scaleRgb(col, 1 - gillGroove * 0.24);
    }

    // 滑らかな側線（ポリライン節点の斑点が一切出ない解析距離描画）
    if (drawLatLine && (!flat || cosP > 0)) {
      const latMaskU = smoothstep(headLen - 0.005, headLen + 0.025, u) * (1 - smoothstep(0.96, 1.0, u));
      if (latMaskU > 0.001) {
        const dLat = sinP - latByCol[ix];
        const groove = Math.exp(-((dLat / 0.017) ** 2)) * latMaskU;
        const upperGlint = Math.exp(-(((dLat - 0.020) / 0.016) ** 2)) * latMaskU;
        col = scaleRgb(col, 1 - groove * 0.20);
        col = mixRgb(col, [0.82, 0.89, 0.93], upperGlint * 0.16);
      }
    }

    // 尾柄にかけてわずかに締める
    const peduncle = smoothstep(0.84, 1.0, u);
    col = mixRgb(col, scaleRgb(col, 0.91), peduncle * 0.32);

    return [linearToSrgb(col[0]), linearToSrgb(col[1]), linearToSrgb(col[2]), 1];
  });

  paintPatterns(buf, species, seed, lightMode);

  return { width: buf.width, height: buf.height, data: buf.data, hash: hashPixels(buf.data) };
}

/** 皮の色 DataTexture を作ります。 */
export function createSkinTexture(species = {}, opts = {}) {
  const generated = generateSkinPixels(species, opts);
  const texture = toDataTexture(generated, {
    srgb: true,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.RepeatWrapping,
    mipmaps: true,
    anisotropy: opts.quality === 'light' ? 1 : 4,
  });
  texture.name = `皮色_${species?.id ?? 'default'}`;
  texture.userData.pixelHash = generated.hash;
  return { texture, hash: generated.hash, width: generated.width, height: generated.height };
}
