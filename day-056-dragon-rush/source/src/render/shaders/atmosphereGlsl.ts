// OWNER: render
// 空の表（LUT）を引く GLSL と、霧（空気遠近）の GLSL。空・霧・水面・環境マップが同じ関数を通る。
// 表の座標の式は render/atmosphere.ts の skyLutUv と同じにしておくこと。
import { SKY_LUT } from '../atmosphere';

const f = (x: number): string => (Number.isInteger(x) ? `${x}.0` : `${x}`);

/** uniform の宣言と、空の色を引く関数。フラグメントシェーダーの先頭付近に入れる。 */
export const ATMOSPHERE_PARS = /* glsl */ `
uniform sampler2D uAtmoLut;
uniform vec3 uAtmoSunDir;
uniform vec3 uAtmoSunColor;
uniform float uAtmoRadiance;
uniform vec4 uAtmoFog;      // x: 地表の消散係数, y: 高さの減衰, z: 霧の始まる距離, w: 散乱光の強さ
uniform vec3 uAtmoFogTint;  // 波長ごとの消散の比
uniform vec3 uAtmoHaze;     // 遠いほど濃くなる霞（x: 足す光学的厚み, y: 始まりの距離, z: 満ちる距離）
uniform vec3 uAtmoBand;     // r06-light：地平の帯の色（大気の上端の太陽照度 1 あたり）。表の A（帯の重み）に掛けると、その方向の帯の分
uniform vec4 uAtmoHazeBand; // r06-light：x・y＝霧に帯の色が入り始める距離と全部入る距離（m）、z＝近い霧の色を取る仰角の下限（sin）、w＝近い霧に残す帯の割合
// r06-light：補助光の球面調和（画面の単位。空の上は帯を減らした空、低い所と下は照り返し）。9個の係数を、赤・緑・青ごとに mat3 に入れる。
// vec3 の配列にしないこと：three は配列の uniform を前の値と比べずに描画命令のたびに送り直し、WebKit では closeup が1コマ約 7ms 重くなった
uniform mat3 uAtmoAmbientR;
uniform mat3 uAtmoAmbientG;
uniform mat3 uAtmoAmbientB;

#define ATMO_LUT_W ${f(SKY_LUT.width)}
#define ATMO_LUT_H ${f(SKY_LUT.height)}
#define ATMO_EL_MIN ${f(SKY_LUT.elevationMin)}
#define ATMO_PI 3.14159265359

vec2 atmoLutUv(vec3 dir) {
  float el = asin(clamp(dir.y, -1.0, 1.0));
  vec2 hd = dir.xz;
  float hl = length(hd);
  hd = hl > 1e-6 ? hd / hl : vec2(1.0, 0.0);
  vec2 hs = uAtmoSunDir.xz;
  float sl = length(hs);
  hs = sl > 1e-6 ? hs / sl : vec2(1.0, 0.0);
  float u = acos(clamp(dot(hd, hs), -1.0, 1.0)) / ATMO_PI;
  float v = sqrt(clamp((el - ATMO_EL_MIN) / (0.5 * ATMO_PI - ATMO_EL_MIN), 0.0, 1.0));
  // 端の画素の中心に合わせる
  return vec2(u * (ATMO_LUT_W - 1.0) + 0.5, v * (ATMO_LUT_H - 1.0) + 0.5) / vec2(ATMO_LUT_W, ATMO_LUT_H);
}

/** 太陽の向き（地面から太陽へ）。uniform より前に置いた関数から前方宣言で呼べるように、関数で渡す（r01-city） */
vec3 atmoSunDirection() { return uAtmoSunDir; }

/** 方向 dir の空の放射輝度（画面の単位）。地平線より下は地平線の値で止める。 */
vec3 atmoSky(vec3 dir) {
  vec3 d = dir;
  d.y = max(d.y, 0.0);
  d = normalize(d + vec3(0.0, 1e-5, 0.0));
  return texture2D(uAtmoLut, atmoLutUv(d)).rgb * uAtmoRadiance;
}

/** r06-light：空の色から、地平の帯を keep の割合だけ残したもの（0 で帯を外す）。CPU の sampleSkyLutBand と同じ式。 */
vec3 atmoSkyBand(vec3 dir, float keep) {
  vec3 d = dir;
  d.y = max(d.y, 0.0);
  d = normalize(d + vec3(0.0, 1e-5, 0.0));
  vec4 t = texture2D(uAtmoLut, atmoLutUv(d));
  return max(t.rgb - uAtmoBand * (t.a * (1.0 - keep)), vec3(0.0)) * uAtmoRadiance;
}

/**
 * r06-light：霧（もや）の色は距離で決める（指摘「手前の建物と煙にもやの色が付き、街が琥珀ひと色」）。
 * 空の表の地平線の色は、何十 km の道のりで赤くなった光と地平の帯の色で、見下ろすと全部この色になっていた。
 * 近いもや（数 km まで）は短い道のりの散乱なので、少し持ち上げた仰角（uAtmoHazeBand.z 以上）の空の色に、帯を uAtmoHazeBand.w の割合だけ残して使う。
 * uAtmoHazeBand.x から y にかけて、地平線の帯の色へ移す（遠い対岸と山並みは今までどおり暖かい帯に溶ける）。
 */
vec3 atmoHazeColor(vec3 dir, float dist) {
  // 要らない方の表は引かない（街のほとんどの画素は近いもやだけ、対岸と山並みは遠いもやだけ）
  float far = smoothstep(uAtmoHazeBand.x, uAtmoHazeBand.y, dist);
  vec3 farColor = far > 0.0 ? atmoSky(dir) : vec3(0.0);
  if (far >= 1.0) return farColor;
  vec3 lifted = normalize(vec3(dir.x, max(dir.y, uAtmoHazeBand.z), dir.z));
  return mix(atmoSkyBand(lifted, uAtmoHazeBand.w), farColor, far);
}

/** r06-light：補助光（空からの光の拡散）の放射照度。法線はワールドの向き。CPU の shIrradiance と同じ式。 */
vec3 atmoAmbient(vec3 n) {
  float x = n.x, y = n.y, z = n.z;
  // 係数 i に掛ける重み（mat3 の列の順：w[0] = (w0, w1, w2)、w[1] = (w3, w4, w5)、w[2] = (w6, w7, w8)）
  mat3 w = mat3(
    0.886227, 2.0 * 0.511664 * y, 2.0 * 0.511664 * z,
    2.0 * 0.511664 * x, 2.0 * 0.429043 * x * y, 2.0 * 0.429043 * y * z,
    0.743125 * z * z - 0.247708, 2.0 * 0.429043 * x * z, 0.429043 * ( x * x - y * y )
  );
  vec3 r = vec3(
    dot( w[0], uAtmoAmbientR[0] ) + dot( w[1], uAtmoAmbientR[1] ) + dot( w[2], uAtmoAmbientR[2] ),
    dot( w[0], uAtmoAmbientG[0] ) + dot( w[1], uAtmoAmbientG[1] ) + dot( w[2], uAtmoAmbientG[2] ),
    dot( w[0], uAtmoAmbientB[0] ) + dot( w[1], uAtmoAmbientB[1] ) + dot( w[2], uAtmoAmbientB[2] )
  );
  return max(r, vec3(0.0));
}

/**
 * カメラ cam から点 p までの霧の光学的厚み（高さ指数分布を解析的に積分）。
 * r01-city：遠いほど濃くなる霞（uAtmoHaze）を、同じ高さの減衰（経路の平均）を掛けて足す。
 */
float atmoOpticalDepth(vec3 cam, vec3 p) {
  vec3 d = p - cam;
  float dist = length(d);
  float s = max(dist - uAtmoFog.z, 0.0);
  if (s <= 0.0) return 0.0;
  vec3 dir = d / dist;
  float y0 = cam.y + dir.y * uAtmoFog.z;
  float b = uAtmoFog.y;
  float k = b * dir.y * s;
  float integral = abs(k) > 1e-4 ? (1.0 - exp(-k)) / (b * dir.y) : s;
  float heightMean = exp(-b * max(y0, -50.0)) * integral / s;
  float haze = uAtmoHaze.x * smoothstep(uAtmoHaze.y, uAtmoHaze.z, dist);
  return (uAtmoFog.x * s + haze) * heightMean;
}

/** 表面の色に霧を掛ける。遠くでは空の色（同じ表）に溶ける。r06-light：もやの色は距離で帯を足す（atmoHazeColor）。 */
vec3 atmoApplyFog(vec3 color, vec3 cam, vec3 p) {
  float od = atmoOpticalDepth(cam, p);
  // 霧の始まりより近い所は霧が 0（結果は同じ。空の表を引く計算を省く）
  if (od <= 0.0) return color;
  vec3 T = exp(-od * uAtmoFogTint);
  vec3 d = p - cam;
  float dist = length(d);
  vec3 inscatter = atmoHazeColor(d / max(dist, 1e-3), dist) * uAtmoFog.w;
  return color * T + inscatter * (1.0 - T);
}
`;

/** 頂点シェーダー用：ワールド座標を渡す varying と、その計算。 */
export const ATMOSPHERE_VERTEX_PARS = /* glsl */ `
varying vec3 vAtmoWorld;
`;

export const ATMOSPHERE_VERTEX = /* glsl */ `
{
  vec4 atmoWp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    atmoWp = instanceMatrix * atmoWp;
  #endif
  vAtmoWorld = (modelMatrix * atmoWp).xyz;
}
`;

export const ATMOSPHERE_FRAGMENT_PARS = /* glsl */ `
varying vec3 vAtmoWorld;
${ATMOSPHERE_PARS}
`;
