// OWNER: world-art
// シェーダーで共有する関数：ハッシュ・値ノイズ・fbm・画素幅で積分した縞・網点・手続きの凹凸。
// hash12 と画素幅で積分するパルスの式は、本人の dragon-rampage（src/render/shaders/noiseGlsl.ts・filterGlsl.ts）から写した。

export const NOISE_GLSL = /* glsl */ `
float kgHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float kgHash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 kgHash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float kgNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = kgHash12(i);
  float b = kgHash12(i + vec2(1.0, 0.0));
  float c = kgHash12(i + vec2(0.0, 1.0));
  float d = kgHash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
/** 値ノイズとその勾配（凹凸の法線に使う） */
vec3 kgNoiseD(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 du = 6.0 * f * (1.0 - f);
  float a = kgHash12(i);
  float b = kgHash12(i + vec2(1.0, 0.0));
  float c = kgHash12(i + vec2(0.0, 1.0));
  float d = kgHash12(i + vec2(1.0, 1.0));
  float v = a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y;
  vec2 g = du * (vec2(b - a, c - a) + (a - b - c + d) * u.yx);
  return vec3(v, g);
}
float kgFbm(vec2 p, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  float norm = 0.0;
  for (int o = 0; o < 6; o++) {
    if (o >= octaves) break;
    sum += amp * kgNoise(p);
    norm += amp;
    amp *= 0.5;
    p = p * 2.03 + vec2(17.1, 9.7);
  }
  return sum / norm;
}
`;

export const FILTER_GLSL = /* glsl */ `
// 周期 1 のパルス（各周期の [0,w) で 1）を、幅 fw の箱で平均したもの。遠くでは平均（w）に落ち着く
float kgPulseInt(float x, float w) { return floor(x) * w + min(fract(x), w); }
float kgPulse(float x, float w, float fw) {
  fw = max(fw, 1e-4);
  return (kgPulseInt(x + 0.5 * fw, w) - kgPulseInt(x - 0.5 * fw, w)) / fw;
}
// 周期の中央に置いたパルス（目地・桟・筋など）
float kgLine(float x, float w, float fw) { return kgPulse(x - 0.5 + 0.5 * w, w, fw); }
// 4×4 の網点のしきい値（0..1）
float kgBayer4(vec2 fc) {
  ivec2 p = ivec2(mod(fc, 4.0));
  int i = p.x + p.y * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i]) + 0.5) / 16.0;
}
float kgLuma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

/**
 * 手続きの凹凸：高さの画面上の変化（dHdx, dHdy）で視点空間の法線を傾ける（接線なしで使える）。
 * pos は視点空間の位置（-vViewPosition）、n は視点空間の法線。
 */
export const BUMP_GLSL = /* glsl */ `
vec3 kgBump(vec3 pos, vec3 n, float dhdx, float dhdy) {
  vec3 sx = dFdx(pos);
  vec3 sy = dFdy(pos);
  vec3 r1 = cross(sy, n);
  vec3 r2 = cross(n, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dhdx * r1 + dhdy * r2);
  vec3 v = abs(det) * n - grad;
  float l = length(v);
  // 退化した画素（輪郭など）で 0 を正規化すると NaN になり、光のにじみの縮小で四角く広がる
  return (l > 1e-12 && !isnan(l)) ? v / l : n;
}
`;
