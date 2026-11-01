// OWNER: world-art
// 色の仕上げ（postprocessing の Effect）。HDR のまま来た色に、露出 → トーンマップ → 色調 → 周辺減光 → 粒を掛け、
// 最後に sRGB へ自分で変換してディザを入れる。SMAA は sRGB の値で輪郭を探すので、この後に置く。
// 本人の dragon-rampage（src/render/gradeEffect.ts）から写し、発見の赤み（alert）・討ち取りの演出（finale）・粒を足した。
import { BlendFunction, Effect } from 'postprocessing';
import { Uniform, Vector3, Vector4 } from 'three';
import { GRADE } from './config';

const fragmentShader = /* glsl */ `
uniform float exposure;
uniform float toeLift;
uniform float saturation;
uniform float contrast;
uniform vec3 shadowTint;
uniform vec3 highlightTint;
uniform float vignette;
uniform vec4 grainParams;   // x: 強さ, y: 種（撮影では固定）
uniform float alertK;
uniform vec3 alertTint;
uniform float alertVignette;
uniform vec4 alertParams;   // xyz: 縁の帯に足す赤い光（r02-fix-visual）
uniform float finaleK;
uniform vec4 finaleParams;  // x: 色抜き, y: 周辺減光, z: コントラスト
uniform vec3 finaleWarm;
uniform float drainK;       // 捕まったときの色抜き（r01-integrate）

// ACES の近似（RRT+ODT の当てはめ。入力と出力の行列で色相のずれを抑える）
vec3 rrtOdtFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 acesTonemap(vec3 color) {
  const mat3 inputMat = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 outputMat = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  color = inputMat * color;
  color = rrtOdtFit(color);
  color = outputMat * color;
  return clamp(color, 0.0, 1.0);
}

float gradeLuma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 toSrgb(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}

// MurmurHash3 の最終混合 fmix32（パブリックドメイン）。座標の float のビット列を混ぜて 0..1 にする
uint gradeMix(uint h) {
  h ^= h >> 16;
  h *= 0x85ebca6bu;
  h ^= h >> 13;
  h *= 0xc2b2ae35u;
  h ^= h >> 16;
  return h;
}

float gradeHash(vec2 p) {
  uvec2 b = floatBitsToUint(p);
  return float(gradeMix(b.x ^ gradeMix(b.y)) >> 8) * (1.0 / 16777216.0);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 hdr = max(inputColor.rgb, vec3(0.0)) * exposure;
  vec3 c = acesTonemap(hdr);
  // 暗部の足：曲線と直線のなめらかな最大値で、黒つぶれだけを持ち上げる
  vec3 lifted = hdr * toeLift * 12.0;
  vec3 h = clamp(0.5 + 0.5 * (c - lifted) / 0.02, 0.0, 1.0);
  c = mix(lifted, c, h) + 0.02 * h * (1.0 - h);
  // 影を冷たく、明部を暖かく（輝度は保つ）
  float l = gradeLuma(c);
  vec3 tint = mix(shadowTint, highlightTint, smoothstep(0.06, 0.6, l));
  vec3 toned = c * tint;
  c = toned * (l / max(gradeLuma(toned), 1e-5));
  // 彩度とコントラスト（中間灰を軸に）
  c = mix(vec3(l), c, saturation);
  float con = mix(contrast, finaleParams.z, finaleK);
  c = 0.18 * pow(max(c, vec3(0.0)) / 0.18, vec3(con));
  // 討ち取りの演出：色を抜き、暖色へ寄せる
  if (finaleK > 0.0) {
    float fl = gradeLuma(c);
    vec3 grey = vec3(fl) * finaleWarm;
    // r01-integrate: 指摘「演出の色抜きで炎まで灰色になり、燃え上がる勢いが消える」 明るい所（炎）は色を残す
    // r02-fix-visual: 炎の胴（橙・赤）は白黄の芯より暗いので灰色になっていた。ある程度明るく、赤みの強い所も色を残す
    float fsat = smoothstep(0.45, 0.8, (c.r - c.b) / max(c.r, 1e-4));
    float keep = max(smoothstep(0.28, 0.72, fl), smoothstep(0.09, 0.22, fl) * fsat);
    c = mix(c, mix(c, grey, finaleParams.x * (1.0 - keep)), finaleK);
  }
  // 発見の赤み：画面の縁へ寄せる。中央は明るさを保ってほんのり赤く、縁ほど赤へ寄せて沈め、縁の帯には赤い光を足す
  // r02-fix-visual: 指摘「発見中は景色ごと赤黒く沈み、どこへ逃げるか読めない（ui-alert の平均輝度 0.013）」
  //   旧：画面全体を、暗部ほど強く赤へ（明るさは 6 割弱に）　新：縁の帯だけ赤。中央の明るさは平常のまま
  if (alertK > 0.0) {
    vec2 ad = (uv - 0.5) * vec2(1.0, 0.82);
    float edge = smoothstep(0.42, 1.02, length(ad) * 2.0);
    float al = gradeLuma(c);
    vec3 red = c * alertTint;
    red *= al / max(gradeLuma(red), 1e-5);
    c = mix(c, red, alertK * mix(0.14, 0.85, edge));
    c *= 1.0 - alertK * 0.22 * edge;
    c += alertParams.xyz * alertK * edge * edge;
  }
  // 捕まった：色を抜き、わずかに冷たく沈める（赤みも抜けて灰に近づく）
  if (drainK > 0.0) {
    float dl = gradeLuma(c);
    c = mix(c, vec3(dl) * vec3(0.93, 0.97, 1.05) * 0.86, drainK * 0.9);
  }
  // 周辺減光
  vec2 d = uv - 0.5;
  float v = vignette + finaleK * (finaleParams.y - vignette) + alertK * (alertVignette - vignette) * 0.5 + drainK * 0.3;
  c *= 1.0 - v * dot(d, d) * 1.8;
  c = clamp(c, 0.0, 1.0);
  // ごく薄い粒（暗部ほど目立たせない）
  float g = gradeHash(gl_FragCoord.xy + grainParams.y * 37.0) - 0.5;
  c += g * grainParams.x * (0.25 + 0.75 * sqrt(gradeLuma(c)));
  c = clamp(c, 0.0, 1.0);
  // sRGB へ変換し、8bit の段差を消すディザを入れる
  vec3 s = toSrgb(c);
  s += (gradeHash(gl_FragCoord.xy) + gradeHash(gl_FragCoord.yx + 17.0) - 1.0) / 255.0;
  outputColor = vec4(s, inputColor.a);
}
`;

export class GradeEffect extends Effect {
  constructor() {
    super('KgGradeEffect', fragmentShader, {
      blendFunction: BlendFunction.SRC,
      uniforms: new Map<string, Uniform>([
        ['exposure', new Uniform(GRADE.exposure)],
        ['toeLift', new Uniform(GRADE.toeLift)],
        ['saturation', new Uniform(GRADE.saturation)],
        ['contrast', new Uniform(GRADE.contrast)],
        ['shadowTint', new Uniform(new Vector3(...GRADE.shadowTint))],
        ['highlightTint', new Uniform(new Vector3(...GRADE.highlightTint))],
        ['vignette', new Uniform(GRADE.vignette)],
        ['grainParams', new Uniform(new Vector4(GRADE.grain, 0, 0, 0))],
        ['alertK', new Uniform(0)],
        ['alertTint', new Uniform(new Vector3(...GRADE.alert.tint))],
        ['alertVignette', new Uniform(GRADE.alert.vignette)],
        ['alertParams', new Uniform(new Vector4(...GRADE.alert.edgeGlow, 0))],
        ['finaleK', new Uniform(0)],
        ['finaleParams', new Uniform(new Vector4(GRADE.finale.desaturate, GRADE.finale.vignette, GRADE.finale.contrast, 0))],
        ['finaleWarm', new Uniform(new Vector3(...GRADE.finale.warm))],
        ['drainK', new Uniform(0)],
      ]),
    });
  }

  private u(name: string): Uniform {
    const u = this.uniforms.get(name);
    if (!u) throw new Error(`GradeEffect: ${name} が無い`);
    return u;
  }

  set alert(k: number) {
    this.u('alertK').value = Math.min(1, Math.max(0, k));
  }

  set finale(k: number) {
    this.u('finaleK').value = Math.min(1, Math.max(0, k));
  }

  /** 0→1：捕まったときの色抜き。 */
  set drain(k: number) {
    this.u('drainK').value = Math.min(1, Math.max(0, k));
  }

  /** 粒の種。撮影では固定、遊ぶときは毎コマ変える。 */
  set grainSeed(s: number) {
    (this.u('grainParams').value as Vector4).y = s;
  }

  set exposure(e: number) {
    this.u('exposure').value = e;
  }
}
