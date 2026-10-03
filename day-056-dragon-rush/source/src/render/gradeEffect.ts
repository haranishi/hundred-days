// OWNER: render
// 色の仕上げ（postprocessing の Effect）。HDR のまま来た色に、露出 → トーンマップ → 色調 → 周辺減光を掛け、
// 最後に sRGB へ自分で変換してディザを入れる。SMAA は sRGB の値で輪郭を探すので、この後に置く。
import { BlendFunction, Effect } from 'postprocessing';
import { Uniform, Vector2, Vector3 } from 'three';
import { GRADE } from '../config/render';
import { HASH_GLSL } from './shaders/hashGlsl';

/*! ACES fitted adaptation: Stephen Hill, BakingLab by MJP / David Neubelt, MIT. See licenses/BakingLab.txt. */

const fragmentShader = /* glsl */ `
${HASH_GLSL}
uniform float exposure;
uniform float toeLift;
uniform float saturation;
uniform float contrast;
uniform vec3 shadowTint;
uniform vec3 highlightTint;
uniform float vignette;
uniform float greenSaturation;
uniform vec2 greenHue;
uniform float toneSatGuard;

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

// 色相（度、0..360）。彩度の無い色は -1
float gradeHue(vec3 c) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float d = mx - mn;
  if (d < 1e-5) return -1.0;
  float h = mx == c.r ? mod((c.g - c.b) / d, 6.0) : (mx == c.g ? (c.b - c.r) / d + 2.0 : (c.r - c.g) / d + 4.0);
  return h * 60.0;
}

vec3 toSrgb(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}

float gradeHash(vec2 p) {
  return drHashScalar(vec3(p, 0.0), 0u);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 hdr = max(inputColor.rgb, vec3(0.0)) * exposure;
  vec3 c = acesTonemap(hdr);
  // 暗部の足：曲線と直線のなめらかな最大値で、黒つぶれだけを持ち上げる
  vec3 lifted = hdr * toeLift * 12.0;
  vec3 h = clamp(0.5 + 0.5 * (c - lifted) / 0.02, 0.0, 1.0);
  c = mix(lifted, c, h) + 0.02 * h * (1.0 - h);
  // 影を冷たく、明部を暖かく（輝度は保つ）。r06-light：色味は色の薄い（灰色に近い）所に掛け、もう色の濃い所では弱める
  // （明るさだけで分けると、暗い濃い青の空まで影として冷やされ、street の空の上がさらに青く濃くなった）
  float l = gradeLuma(c);
  float cMax = max(c.r, max(c.g, c.b));
  float cSat = cMax > 1e-5 ? (cMax - min(c.r, min(c.g, c.b))) / cMax : 0.0;
  vec3 tint = mix(vec3(1.0), mix(shadowTint, highlightTint, smoothstep(0.08, 0.7, l)), 1.0 - toneSatGuard * cSat);
  vec3 toned = c * tint;
  c = toned * (l / max(gradeLuma(toned), 1e-5));
  // 彩度とコントラスト（中間灰を軸に）。r05-dusk：黄緑〜青緑だけ彩度を落とす（夕方の葉の緑。範囲の端はなめらかに）
  float hue = gradeHue(c);
  float green = hue < 0.0 ? 0.0 : smoothstep(greenHue.x - 15.0, greenHue.x + 10.0, hue) * (1.0 - smoothstep(greenHue.y - 10.0, greenHue.y + 15.0, hue));
  c = mix(vec3(l), c, saturation * mix(1.0, greenSaturation, green));
  c = 0.18 * pow(max(c, vec3(0.0)) / 0.18, vec3(contrast));
  // 周辺減光
  vec2 d = uv - 0.5;
  c *= 1.0 - vignette * dot(d, d) * 1.6;
  c = clamp(c, 0.0, 1.0);
  // sRGB へ変換し、8bit の段差を消すディザを入れる
  vec3 s = toSrgb(c);
  s += (gradeHash(gl_FragCoord.xy) + gradeHash(gl_FragCoord.yx + 17.0) - 1.0) / 255.0;
  outputColor = vec4(s, inputColor.a);
}
`;

export class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', fragmentShader, {
      blendFunction: BlendFunction.SRC,
      uniforms: new Map<string, Uniform>([
        ['exposure', new Uniform(GRADE.exposure)],
        ['toeLift', new Uniform(GRADE.toeLift)],
        ['saturation', new Uniform(GRADE.saturation)],
        ['contrast', new Uniform(GRADE.contrast)],
        ['shadowTint', new Uniform(new Vector3(...GRADE.shadowTint))],
        ['highlightTint', new Uniform(new Vector3(...GRADE.highlightTint))],
        ['vignette', new Uniform(GRADE.vignette)],
        ['greenSaturation', new Uniform(GRADE.greenSaturation)],
        ['greenHue', new Uniform(new Vector2(...GRADE.greenHue))],
        ['toneSatGuard', new Uniform(GRADE.toneSatGuard)],
      ]),
    });
  }

  set exposure(value: number) {
    this.uniforms.get('exposure')!.value = value;
  }

  get exposure(): number {
    return this.uniforms.get('exposure')!.value as number;
  }
}
