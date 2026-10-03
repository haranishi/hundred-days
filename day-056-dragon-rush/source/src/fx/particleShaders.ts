// OWNER: fx
// 板の粒子のシェーダー。形（炎の舌・もくもくした煙・火の粉・ガラス片・閃光）は画素で、光と霧は粒子ごとに頂点で計算する。
// 光と霧を頂点へ寄せたのは、大きな煙が画面いっぱいに重なっても、画素ごとに空の表を何度も引かずに済ませるため。
// r03-fx：伸ばす粒（iMisc.z > 0）は、画面に映った速さの向きへ四角を伸ばす。噴き出す炎が流れの向きの筋になる。
// r04-fx2（引き継ぎ）：四角が壁・床・地面と交わる所が直線に切れていたので、奥の不透明な物に近い所ほど透かす（softFade。
// 粒の大きさの約3割の距離で消す）。四角はカメラの正面を向くので、画素の奥行きは粒の中心の奥行き（vViewZ）と同じ。
// r06-light：採点 r05 の1位「aftermath の黒い煙が茶色に寄り（煙の所の彩度 28→45%）、火が色の中心でなくなった」。煙の下地は無彩色なのに、
// 橙の太陽・地平の帯の入った空の光・帯の色の霧で茶色になっていた。空の光は面の補助光と同じ球面調和（atmoAmbient）から取り、
// 煙の光の色は無彩色へ寄せ（SMOKE_LIGHT.neutral。火の照り返しの色は残す）、霧は距離で色を決める（atmoHazeColor）。
import { SMOKE_LIGHT } from '../config/render';
import { ATMOSPHERE_PARS } from '../render/shaders/atmosphereGlsl';
import { NOISE_GLSL } from '../render/shaders/noiseGlsl';
import { SOFT_GLSL } from '../render/softParticles';
import { FLAME_GLSL } from './flameGlsl';

export const PARTICLE_VERTEX = /* glsl */ `
${ATMOSPHERE_PARS}
attribute vec3 iPos;
attribute vec4 iSize;
attribute vec4 iColor;
attribute vec4 iMisc;
attribute vec3 iVel;
uniform float uViewportH;
uniform float uMinPixels;
uniform float uSunLight;
varying vec2 vUv;
varying vec4 vColor;
varying vec4 vSize;
varying vec4 vMisc;
varying vec3 vFogT;
varying vec3 vInscatter;
varying vec3 vAmbient;
varying vec3 vSun;
varying float vNear;
varying float vViewZ;
void main() {
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  vViewZ = -mv.z;
  float size = iSize.x;
  float px = size * projectionMatrix[1][1] * 0.5 * uViewportH / max(-mv.z, 0.1);
  float boost = max(1.0, uMinPixels / max(px, 1e-3));
  size *= boost;
  vColor = iColor;
  vColor.a /= boost * boost;
  vec2 corner = position.xy;
  float stretch = iMisc.z;
  if (stretch > 0.0) {
    // 速さの向き（画面の上で）に沿って伸ばす。こちらへ向かう流れほど伸ばさない
    vec3 vv = mat3(viewMatrix) * iVel;
    float sp = length(vv.xy);
    vec2 along = sp > 1e-4 ? vv.xy / sp : vec2(0.0, 1.0);
    vec2 side = vec2(along.y, -along.x);
    float k = 1.0 + stretch * clamp(sp / max(length(vv), 1e-4), 0.0, 1.0);
    mv.xy += (side * corner.x + along * corner.y * k) * size;
  } else {
    float c = cos(iSize.y);
    float s = sin(iSize.y);
    // 炎は縦に長い舌、ガラス片は細い板
    if (iSize.w > 0.5 && iSize.w < 1.5) corner *= vec2(0.72, 1.35);
    if (iSize.w > 2.5 && iSize.w < 3.5) corner *= vec2(1.0, 0.45);
    corner = vec2(c * corner.x - s * corner.y, s * corner.x + c * corner.y);
    mv.xy += corner * size;
  }
  gl_Position = projectionMatrix * mv;
  vUv = position.xy + 0.5;
  vSize = iSize;
  vMisc = iMisc;
  vec3 toP = iPos - cameraPosition;
  float dist = length(toP);
  vec3 dir = toP / max(dist, 1e-3);
  vFogT = exp(-atmoOpticalDepth(cameraPosition, iPos) * uAtmoFogTint);
  vInscatter = atmoHazeColor(dir, dist) * uAtmoFog.w * (1.0 - vFogT);
  // 空の光：真上と、カメラの側の横向きの面が受ける補助光（面の材質と同じ球面調和。放射照度を π で割って明るさにそろえる）
  vAmbient = (atmoAmbient(vec3(0.0, 1.0, 0.0)) * 0.6 + atmoAmbient(normalize(vec3(-dir.x, 0.0, -dir.z) + vec3(0.0, 1e-4, 0.0))) * 0.4) * 0.31831;
  // 太陽の側から見ると暗く、太陽を背に透ける側（前方散乱）は明るく光る
  float mu = dot(dir, uAtmoSunDir);
  float g = 0.55;
  float phase = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * mu, 1.5);
  vSun = uAtmoSunColor * uSunLight * (0.45 + 0.35 * phase);
  // r06-light：煙と煤を照らす光の色を無彩色へ寄せる（明るさは保つ）。色は火の照り返しにだけ持たせる。
  // 画素ごとにすると重い煙の重なりで毎回計算するので、頂点で済ませる（式は線形なので結果は同じ）
  const vec3 smokeLuma = vec3(0.2126, 0.7152, 0.0722);
  vAmbient = mix(vAmbient, vec3(dot(vAmbient, smokeLuma)), ${SMOKE_LIGHT.neutral.toFixed(3)});
  vSun = mix(vSun, vec3(dot(vSun, smokeLuma)), ${SMOKE_LIGHT.neutral.toFixed(3)});
  vNear = smoothstep(iSize.x * 0.4, iSize.x * 1.4, dist);
}
`;

const COMMON_FRAG = /* glsl */ `
${NOISE_GLSL}
varying vec2 vUv;
varying vec4 vColor;
varying vec4 vSize;
varying vec4 vMisc;
varying vec3 vFogT;
varying vec3 vInscatter;
varying vec3 vAmbient;
varying vec3 vSun;
varying float vNear;
varying float vViewZ;
${SOFT_GLSL}
// 奥の物に近い所を透かす距離（m）：粒の大きさの k 倍（下限 0.4m・上限 14m）
float softOf(float k) {
  return softFade(vViewZ, clamp(vSize.x * k, 0.4, 14.0));
}
`;

export const PARTICLE_ADDITIVE_FRAG = /* glsl */ `
${COMMON_FRAG}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float shape = vSize.w;
  float age = vSize.z;
  float seed = vMisc.y;
  vec3 col = vColor.rgb;
  float m;
  float fade = 1.0 - smoothstep(0.55, 1.0, age);
  if (shape > 0.5 && shape < 1.5) {
    // 炎：上へ流れるゆがみで縁を崩し、根元は太く先は細い。若いほど白く、古いほど暗い赤へ
    float n = vnoise(vec2(p.x * 2.3 + seed * 17.0, p.y * 2.1 - age * 5.0 + seed * 9.0));
    float n2 = vnoise(vec2(p.x * 4.7 + seed * 5.0, p.y * 4.3 - age * 9.0));
    vec2 q = p * vec2(1.0 + 0.45 * max(p.y, 0.0), 0.85) + vec2(0.0, 0.2);
    float r = length(q) + (n - 0.5) * 0.65 + (n2 - 0.5) * 0.3;
    m = smoothstep(1.0, 0.15, r);
    float heat = (1.0 - age) * (0.5 + 0.5 * m);
    col *= mix(vec3(0.5, 0.1, 0.025), vec3(1.0, 0.78, 0.45), smoothstep(0.2, 0.95, heat)) * (0.3 + 1.2 * heat * heat);
    m *= smoothstep(0.0, 0.06, age);
    fade = 1.0 - smoothstep(0.45, 1.0, age);
  } else if (shape > 1.5 && shape < 2.5) {
    m = exp(-dot(p, p) * 5.0) * (0.65 + 0.35 * sin(age * 50.0 + seed * 40.0));
  } else if (shape > 2.5 && shape < 3.5) {
    // ガラス片：回るたびに夕日をきらりと返す
    m = smoothstep(1.0, 0.75, abs(p.x) + abs(p.y));
    float glint = pow(max(0.0, sin(vSize.y * 2.0 + seed * 20.0)), 24.0);
    col *= 0.2 + 6.0 * glint;
  } else if (shape > 3.5) {
    m = exp(-dot(p, p) * 3.5);
    fade = 1.0 - age;
  } else {
    m = max(0.0, 1.0 - dot(p, p));
    m *= m;
  }
  gl_FragColor = vec4(col * m * vColor.a * fade * vFogT * softOf(0.3), 1.0);
}
`;

/**
 * 炎の層（r03-fx）：前掛けの合成（色 × 覆い, 覆い）。温度は生まれたときの熱（iMisc.x）から年とともに下がり、
 * 濃い芯ほど熱い。模様は粒の縦（伸ばした粒では流れの向き）に沿って流れる。冷えた所は煤になって奥を隠す。
 */
export const PARTICLE_FLAME_FRAG = /* glsl */ `
${COMMON_FRAG}
${FLAME_GLSL}
uniform float uFireAlpha;
uniform float uSootAlpha;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float age = vSize.z;
  float seed = vMisc.y;
  float heat = vMisc.x;
  float flow = age * 2.8 + seed * 5.0;
  float n1 = fbm2(vec2(p.x * 1.6 + seed * 11.0, p.y * 1.2 - flow), 3);
  float n2 = vnoise(vec2(p.x * 4.0 + seed * 7.0, p.y * 3.0 - flow * 2.2));
  // 縁はノイズでゆがめた距離で締める（柔らかい円盤の和は橙のにじみに見えた）。中ほど熱く、縁ほど冷えて赤・煤になる
  float d = length(p) + (n1 - 0.5) * 1.1 + (n2 - 0.5) * 0.45;
  float dens = 1.0 - smoothstep(0.42, 0.8, d);
  float inner = 1.0 - smoothstep(0.0, 0.72, d);
  dens *= smoothstep(0.0, 0.07, age) * (1.0 - smoothstep(0.75, 1.0, age));
  if (dens < 0.004) discard;
  float T = heat * pow(max(1.0 - age, 0.0), 0.8) * (0.42 + 0.8 * inner) + (n2 - 0.5) * 0.2;
  float fire = flameFire(T);
  vec3 emit = flameColor(T) * vColor.rgb;
  vec3 soot = uFlameSoot * (vAmbient + vSun * 0.35);
  float a = dens * vColor.a * mix(uSootAlpha, uFireAlpha, fire) * softOf(0.3);
  gl_FragColor = vec4((mix(soot, emit, fire) * vFogT + vInscatter) * a, a);
}
`;

export const PARTICLE_SOFT_FRAG = /* glsl */ `
${COMMON_FRAG}
uniform vec3 uSunView;
uniform float uPlumeLift;
uniform float uPlumeLiftH;
uniform float uPlumeGlow;
uniform float uPlumeGlowH;
uniform vec3 uPlumeGlowColor;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  float age = vSize.z;
  float seed = vMisc.y;
  float rise = vMisc.w;
  if (rise > 0.0) {
    // r04-fx2：煙の柱と天蓋の粒。指摘「煙は小さな茶色の粒のまだらで柱にならず、火の色で下から照らされない」。
    // 1粒の縁を柔らかく、中の明暗のむらを小さくして、重なった粒が1つの塊に読めるようにする（1粒の模様を見せない）
    float n = fbm2(p * 0.9 + vec2(seed * 7.0, seed * 3.0 - age * 0.6), 2);
    float n2 = vnoise(p * 2.3 + seed * 11.0 + vec2(0.0, -age * 1.1));
    float edge = sqrt(r2) + (n - 0.5) * 0.75 + (n2 - 0.5) * 0.2;
    float m = smoothstep(1.0, 0.28, edge);
    if (m < 0.003) discard;
    vec3 nrm = normalize(vec3(p + (vec2(n, n2) - 0.5) * 0.5, sqrt(max(1.0 - r2, 0.0)) + 0.35));
    float lam = clamp(dot(nrm, uSunView) * 0.7 + 0.3, 0.0, 1.0);
    // 根元は煤で黒く、昇って薄まるほど明るい灰色
    vec3 alb = vColor.rgb * mix(1.0, uPlumeLift, smoothstep(0.0, uPlumeLiftH, rise));
    vec3 lit = alb * (vAmbient * (0.74 + 0.36 * n) + vSun * lam * (0.5 + 0.5 * n));
    // 下からの火の照り返し：火元に近いほど強く、粒の下の側ほど明るい
    float fireK = vMisc.x * uPlumeGlow * exp(-rise / uPlumeGlowH);
    lit += uPlumeGlowColor * fireK * (0.3 + 0.7 * clamp(0.5 - p.y * 0.6, 0.0, 1.0)) * (0.65 + 0.35 * n);
    float thin = mix(1.0, 0.5, smoothstep(0.15, 0.95, age));
    // 生まれてすぐ（寿命の 2.5%、約0.5秒）で濃くなる。r04-fx2（引き継ぎ）：6%（約1.1秒）では breath の3秒の煙が薄かった
    float alpha = m * vColor.a * vNear * thin * smoothstep(0.0, 0.025, age) * (1.0 - smoothstep(0.7, 1.0, age)) * softOf(0.35);
    gl_FragColor = vec4(lit * vFogT + vInscatter, alpha);
    return;
  }
  // r03-fx：もくもくした縁を締め（縁の幅 0.95〜0.15 → 0.95〜0.4）、中の凹凸で光と影を付ける。
  // 模様は粒に貼り付いて一緒に動く（指摘「煙が5秒間同じ形」：重なった柔らかい円盤の和は動いても形が読めなかった）
  float n = fbm2(p * 1.15 + vec2(seed * 7.0, seed * 3.0 - age * 0.8), 3);
  float n2 = vnoise(p * 3.2 + seed * 11.0 + vec2(0.0, -age * 1.3));
  float edge = sqrt(r2) + (n - 0.5) * 1.05 + (n2 - 0.5) * 0.28;
  float m = smoothstep(0.95, 0.4, edge);
  if (m < 0.003) discard;
  // 板を球とみなした法線に凹凸を足し、太陽の側を明るく、反対と窪みを暗くする
  vec3 nrm = normalize(vec3(p + (vec2(n, n2) - 0.5) * 0.7, sqrt(max(1.0 - r2, 0.0)) + 0.3));
  float lam = clamp(dot(nrm, uSunView) * 0.8 + 0.25, 0.0, 1.0);
  float cavity = 0.46 + 0.72 * n;
  vec3 lit = vColor.rgb * (vAmbient * cavity + vSun * lam * (0.35 + 0.75 * n));
  // 下からの火の照り返し（生まれたての煙の下側だけ）
  float young = (1.0 - age) * (1.0 - age);
  lit += vec3(1.0, 0.36, 0.09) * 1.2 * vMisc.x * young * clamp(0.3 - p.y * 0.7, 0.0, 1.0);
  // 上ほど（年を取るほど）薄い
  // r03-fx（見直し）：根元の煙は濃く（奥の街の模様に負けない）、昇って広がるほど薄くする
  float thin = mix(1.0, 0.32, smoothstep(0.08, 0.9, age));
  float alpha = m * vColor.a * vNear * thin * smoothstep(0.0, 0.08, age) * (1.0 - smoothstep(0.55, 1.0, age)) * softOf(0.35);
  gl_FragColor = vec4(lit * vFogT + vInscatter, alpha);
}
`;
