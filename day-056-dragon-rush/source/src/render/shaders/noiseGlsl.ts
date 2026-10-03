// OWNER: render
// GLSL の値ノイズと fbm。空・水面・地面・外壁で共有する。
import { HASH_GLSL } from './hashGlsl';

export const NOISE_GLSL = /* glsl */ `
${HASH_GLSL}
float hash12(vec2 p) {
  return drHashScalar(vec3(p, 0.0), 0u);
}
float hash13(vec3 p3) {
  return drHashScalar(p3, 0u);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm2(vec2 p, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  float norm = 0.0;
  for (int o = 0; o < 6; o++) {
    if (o >= octaves) break;
    sum += amp * vnoise(p);
    norm += amp;
    amp *= 0.5;
    p = p * 2.03 + vec2(17.1, 9.7);
  }
  return sum / norm;
}
`;
