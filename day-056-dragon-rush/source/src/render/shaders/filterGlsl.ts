// OWNER: render
// 周期模様を画素の幅で積分する関数（箱フィルタを掛けたパルス列）。
// 窓の格子・目地・路面の標示が、遠くでちらつかずに平均の色へ落ち着く。
// 同じ式を TS でも持ち（render/filterMath.ts）、テストで平均への収束を確かめている。

export const FILTER_GLSL = /* glsl */ `
// 周期 1 のパルス（各周期の [0,w) で 1）の積分
float pulseIntegral(float x, float w) { return floor(x) * w + min(fract(x), w); }
// 幅 fw の箱で平均したパルス
float fpulse(float x, float w, float fw) {
  fw = max(fw, 1e-4);
  return (pulseIntegral(x + 0.5 * fw, w) - pulseIntegral(x - 0.5 * fw, w)) / fw;
}
// 周期の中央に置いたパルス
float fpulseC(float x, float w, float fw) { return fpulse(x - 0.5 + 0.5 * w, w, fw); }
// 0 を境にした段差を幅 fw でならしたもの
float fstep(float x, float fw) { return clamp(x / max(fw, 1e-4) + 0.5, 0.0, 1.0); }
// 区間 [a,b] の内側
float fband(float x, float a, float b, float fw) { return fstep(x - a, fw) * (1.0 - fstep(x - b, fw)); }
vec3 srgbToLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
`;
