// OWNER: fx
// 炎の色の表（GLSL）。吐く炎の粒・建物の窓の炎が同じ表を使う。温度 T（0〜1）から、煤 → 赤 → 橙 → 芯の白い黄へ移る。
// r03-fx：指摘「breath の炎の芯が白く飛ぶ（6.6%）」。色は config/fx.ts の FLAME にある上限の色までで、足し算で青天井に明るくしない。
// 表の値は、トーンマップと色の仕上げ（render/gradeEffect.ts）を通して sRGB で 250 を超えないように決めた。
import { Vector3 } from 'three';
import { FLAME } from '../config/fx';

export function flameUniforms(): Record<string, { value: Vector3 }> {
  return {
    uFlameCore: { value: new Vector3(...FLAME.core) },
    uFlameBody: { value: new Vector3(...FLAME.body) },
    uFlameTip: { value: new Vector3(...FLAME.tip) },
    uFlameSoot: { value: new Vector3(...FLAME.soot) },
  };
}

export const FLAME_GLSL = /* glsl */ `
uniform vec3 uFlameCore;
uniform vec3 uFlameBody;
uniform vec3 uFlameTip;
uniform vec3 uFlameSoot;
// 温度 T の炎の色（線形。上限は芯の色）
vec3 flameColor(float T) {
  vec3 c = mix(uFlameTip * 0.4, uFlameTip, smoothstep(0.08, 0.3, T));
  c = mix(c, uFlameBody, smoothstep(0.3, 0.6, T));
  return mix(c, uFlameCore, smoothstep(0.68, 0.94, T));
}
// 光っている割合（冷えた所は煤として奥を隠す）
float flameFire(float T) { return smoothstep(0.07, 0.26, T); }
`;
