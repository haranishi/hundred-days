// OWNER: world-art
// 炎・火の粉・煙。篝火（いつも燃えている）、明智勢の篝火（遠くの小さな炎）、炎上（setFire の進みで燃え広がる）を、
// 同じ3つの材質（炎の板・煙の板・火の粉の点）でまとめて描く。動きはすべて「位置の種と時刻」だけで決まる
// （撮影で同じ時刻なら同じ絵になる）。燃え広がりは uniform の進みとインスタンスごとのしきい値で切り替え、シェーダーは作り直さない。
// 炎は足し算でなく重ねの合成で描く（足し算で重ねると芯が白く飛ぶ：dragon-rampage の落とし穴）。
import {
  BufferAttribute,
  BufferGeometry,
  CustomBlending,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  NormalBlending,
  OneFactor,
  Points,
  ShaderMaterial,
  ZeroFactor,
} from 'three';
import { SKY_PARS_GLSL, SKY_UNIFORMS } from '../render/sky';
import { FIRE_LAYER, SOFT_GLSL, SOFT_UNIFORMS } from '../render/softDepth';
import type { V3 } from './geometry';

/** 炎の板1枚。base は根元、w・h は大きさ、from は燃え始めの進み（-1 はいつも）、kind 0 篝火 1 炎上 2 遠くの篝火 */
export interface FlameDef {
  base: V3;
  w: number;
  h: number;
  seed: number;
  from: number;
  kind: number;
}
export interface SmokeDef {
  base: V3;
  size: number;
  rise: number;
  seed: number;
  from: number;
  /** 濃さ（0..1） */
  density: number;
}
export interface SparkDef {
  base: V3;
  spread: number;
  rise: number;
  seed: number;
  from: number;
  count: number;
}

export const FIRE_UNIFORMS = {
  uKgFire: { value: 0 },
};

const QUAD = new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]);
const QUAD_UV = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
const QUAD_IDX = [0, 1, 2, 0, 2, 3];

function quadGeometry(): InstancedBufferGeometry {
  const g = new InstancedBufferGeometry();
  g.setAttribute('position', new BufferAttribute(QUAD, 3));
  g.setAttribute('uv', new BufferAttribute(QUAD_UV, 2));
  g.setIndex(QUAD_IDX);
  return g;
}

// ---- 炎の板：縦に立てたまま、カメラの方へ回す（円柱状の板）。形はノイズで揺らした涙形 ----
// r02-fix-visual: 指摘「炎上の炎が同じ形の板の櫛、燃え盛ると橙一色のぼかし」
// 炎上（種類 1）は形を4種にした（0 胴の太い炎・1 細く高い舌・2 千切れる炎・3 低く這う炎）。種から選び、縦横・速さ・舌の数・
// 千切れ始める高さを変える。色は温度の段（白黄の芯 → 橙 → 赤 → 暗い赤の縁）で塗り、縁の暗さで隣の炎と分ける。
const flameVertex = /* glsl */ `
attribute vec4 aBase;    // xyz 根元, w 種
attribute vec4 aSize;    // x 幅, y 高さ, z 燃え始め, w 種類
uniform float uKgTime;
uniform float uKgFire;
varying vec2 vUv;
varying float vSeed;
varying float vGrow;
varying vec3 vWorld;
varying float vKind;
varying float vType;
varying float vKgViewZ;
void main() {
  // r01-world-周3: 指摘「0.1 では煙だけで炎が見えない」 育つ幅 0.12→0.05
  float grow = aSize.z < 0.0 ? 1.0 : smoothstep(aSize.z, aSize.z + 0.05, uKgFire);
  // 炎上は大火（進み 1）に近いほど大きくなる
  bool blaze = aSize.w == 1.0;
  // r02-fix-visual: 演出の 0.6〜0.75 で炎が小さな棘に見えた 0.75＋0.6·s(0.6,1) → 0.85＋0.5·s(0.35,0.9)
  float big = blaze ? (0.85 + 0.5 * smoothstep(0.35, 0.9, uKgFire)) : 1.0;
  float type = floor(fract(aBase.w * 4.731) * 4.0);
  vec2 shapeK = vec2(1.0);
  if (blaze) shapeK = type < 0.5 ? vec2(1.25, 0.95) : type < 1.5 ? vec2(0.78, 1.25) : type < 2.5 ? vec2(1.0, 1.1) : vec2(1.6, 0.55);
  vec3 toCam = cameraPosition - aBase.xyz;
  vec2 side = normalize(vec2(toCam.z, -toCam.x) + 1e-5);
  // r03-fix-visual: 指摘「手前の屋根の炎が画面の 3 割を覆う膜になる」 炎上の板は、画面の高さの 26% を超えないよう形を保って縮める
  float cap = 1.0;
  if (blaze) {
    float screenH = 2.0 * length(toCam) / projectionMatrix[1][1];
    cap = min(1.0, 0.26 * screenH / max(aSize.y * big * shapeK.y, 1e-3));
  }
  float w = aSize.x * big * grow * shapeK.x * cap;
  // 炎上の高さは2つの拍子の和で不規則に伸び縮みする（隣の炎と頭がそろわない）
  float pulse = 0.6 * sin(uKgTime * (2.1 + 1.6 * fract(aBase.w * 9.1)) + aBase.w * 17.0) + 0.4 * sin(uKgTime * 5.3 + aBase.w * 31.0);
  float h = aSize.y * big * grow * shapeK.y * cap * (blaze ? 0.84 + 0.16 * pulse : 0.88 + 0.12 * sin(uKgTime * 3.1 + aBase.w * 17.0));
  // r03-fix-visual: 指摘「炎の板が屋根と水平の硬い線で交わる」 硬い線は板の水平な根元だった（傾いた屋根の下り側で宙に浮く）。
  // 炎上の炎は根元を高さの 18% だけ屋根の中へ沈め、根元の溶かしを長くする（kgBlaze）。屋根の中の分は深さで溶ける（softDepth.ts）
  float sink = blaze ? 0.18 * h : 0.0;
  vec3 p = aBase.xyz + vec3(side.x, 0.0, side.y) * position.x * w + vec3(0.0, position.y * h - sink, 0.0);
  // 先の方は横へ揺れる
  p.xz += vec2(side.x, side.y) * sin(uKgTime * 4.3 + aBase.w * 9.0 + position.y * 2.0) * 0.08 * w * position.y;
  vUv = uv;
  vSeed = aBase.w;
  vGrow = grow;
  vWorld = p;
  vKind = aSize.w;
  vType = type;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vKgViewZ = mv.z;
  gl_Position = projectionMatrix * mv;
}
`;
const flameFragment = /* glsl */ `
${SKY_PARS_GLSL}
${SOFT_GLSL}
varying vec2 vUv;
varying float vSeed;
varying float vGrow;
varying vec3 vWorld;
varying float vKind;
varying float vType;

// 炎の温度 0..1 → 色（暗い赤の縁 → 赤 → 橙 → 白黄の芯）
vec3 kgFireRamp(float T) {
  vec3 c = mix(vec3(0.12, 0.016, 0.006), vec3(0.58, 0.08, 0.014), smoothstep(0.0, 0.22, T));
  c = mix(c, vec3(1.0, 0.32, 0.045), smoothstep(0.18, 0.48, T));
  c = mix(c, vec3(1.0, 0.6, 0.16), smoothstep(0.45, 0.74, T));
  return mix(c, vec3(1.0, 0.86, 0.58), smoothstep(0.72, 0.97, T));
}

// 炎上の炎1枚：形の種類ごとに、しなり・舌・千切れ方を変えた密度の場を作り、温度で塗る
vec4 kgBlaze(vec2 uv, float k, float tp) {
  float t = uKgTime;
  float y = uv.y;
  float speed = tp < 0.5 ? 1.6 : tp < 1.5 ? 2.5 : tp < 2.5 ? 2.1 : 3.1;
  float tongues = tp < 0.5 ? 2.0 + floor(fract(k * 7.31) * 2.0) : tp < 1.5 ? 1.0 : tp < 2.5 ? 2.0 + floor(fract(k * 3.7) * 2.0) : 3.0 + floor(fract(k * 5.3) * 2.0);
  float breakAt = tp < 0.5 ? 0.56 : tp < 1.5 ? 0.48 : tp < 2.5 ? 0.28 : 0.42;
  float x = (uv.x - 0.5) * 2.0;
  // 全体のしなり（上ほど大きく）と、種ごとの傾き
  float bend = (kgNoise(vec2(k * 13.0, t * 0.8 + y * 1.1)) - 0.5) * 0.9 + (fract(k * 3.17) - 0.5) * 0.5;
  float xx = x - bend * y * y;
  vec2 q = vec2(xx * 1.5 + k * 11.0, y * 2.0 - t * speed);
  vec2 wq = vec2(kgNoise(q * 1.9), kgNoise(q * 1.9 + 7.3)) - 0.5;
  float n = kgFbm(q + wq * 1.5, 4);
  // 幅：根元が一番広く（屋根から湧く火の胴）、上へ細る。舌の炎は細く速く細る
  float baseW = tp < 0.5 ? 0.95 : tp < 1.5 ? 0.72 : tp < 2.5 ? 0.9 : 1.0;
  float taper = tp < 0.5 ? 0.42 : tp < 1.5 ? 0.85 : tp < 2.5 ? 0.6 : 0.35;
  // 先は尖らせない（細った先に幅を残し、先の形は千切れのノイズで崩す）
  float prof = baseW * pow(max(0.0, 1.0 - y), taper) + 0.16 * (1.0 - y) * y;
  // 上の方で舌に分かれる
  float lobe = 0.5 + 0.5 * cos(xx / max(prof, 0.08) * 1.5708 * tongues + n * 3.2 + t * 1.9 + k * 21.0);
  prof *= mix(1.0, 0.3 + 0.7 * lobe, smoothstep(0.22, 0.7, y));
  float dens = 1.0 - abs(xx) / max(prof, 1e-3) + (n - 0.5) * 1.25;
  // 縁のぎざぎざ（細かいノイズを上ほど強く、速く上へ流す）
  float n3 = kgNoise(vec2(xx * 7.0 + k * 13.0, y * 5.5 - t * speed * 1.9));
  dens += (n3 - 0.5) * 0.3 * (0.35 + 0.65 * y);
  // 上へ細く千切れる：高いほど、上へ流れるノイズで穴をあける
  float br = kgFbm(vec2(xx * 2.3 - k * 5.0, y * 3.2 - t * speed * 1.4), 3);
  dens -= smoothstep(breakAt, 1.0, y) * max(0.0, 0.78 - br) * 2.2;
  dens -= smoothstep(0.78, 1.0, y) * 0.7;
  // 根元は屋根の中から湧くようにぼかす（r03-fix-visual: 0.07〜0.16 → 0.28〜0.38。根元の水平な縁を見せない）
  dens *= smoothstep(0.02, 0.28 + 0.1 * n, y);
  if (dens <= 0.0) return vec4(0.0);
  float body = smoothstep(0.0, 0.45, dens);
  float T = clamp(smoothstep(0.12, 1.0, dens) * (1.06 - 0.72 * y) + 0.12 * (1.0 - y), 0.0, 1.0);
  float fl = 0.86 + 0.26 * kgNoise(vec2(t * 7.0 + k * 40.0, k * 9.0));
  vec3 col = kgFireRamp(T) * (0.24 + 1.4 * T * T) * fl;
  // 縁（温度の低い所）ほど透けさせ、暗い赤の縁取りが輪郭線に見えないようにする
  // r03-fix-visual: 指摘「手前の炎の板が半透明の膜に見える」 温度の低い所の濃さ 0.5→0.3（膜の色かぶりを減らし、炎の胴と芯で形を読ませる）
  return vec4(col, body * (0.3 + 0.7 * smoothstep(0.03, 0.5, T)));
}

void main() {
  if (vGrow <= 0.001) discard;
  if (vKind == 1.0) {
    vec4 b = kgBlaze(vUv, vSeed, vType);
    if (b.a <= 0.01) discard;
    vec3 c = kgApplyFog(b.rgb, cameraPosition, vWorld);
    // r03-fix-visual: 屋根に刺さる所を深さで溶かす（硬い線を消す）
    float a = b.a * vGrow * kgSoftDepth(1.1) * smoothstep(1.5, 4.0, -vKgViewZ);
    if (a <= 0.004) discard;
    gl_FragColor = vec4(c * a, a);
    return;
  }
  // r01-world-周1: 指摘「炎上の炎が同じ形の三角の列」 種から傾き・舌の数（1〜3）・幅を変える
  float k = vSeed;
  float tongues = 1.0 + floor(fract(k * 7.31) * 3.0);
  vec2 uv = vUv;
  float y = uv.y;
  float x = (uv.x - 0.5) * 2.0 + (fract(k * 3.17) - 0.5) * 0.45 * y;
  // 上へ流れるノイズで縁を崩す（炎上は大きく乱す：ぎざぎざの舌）
  float rag = vKind == 1.0 ? 1.0 : 0.6;
  vec2 warp = vec2(kgNoise(vec2(uv.x * 4.0 + k * 3.0, y * 3.0 - uKgTime * 3.0)), kgNoise(vec2(uv.x * 4.0 - k, y * 3.0 - uKgTime * 2.2) + 7.0)) - 0.5;
  float n = kgFbm(vec2(uv.x * 3.2 + k * 7.0, y * 2.4 - uKgTime * 2.6 + k * 3.0) + warp * 1.5 * rag, 4);
  float n2 = kgNoise(vec2(uv.x * 9.0 - k * 5.0, y * 6.0 - uKgTime * 4.1) + warp * 2.0);
  float width = pow(max(0.0, 1.0 - y), 0.5) * (0.6 + 0.4 * smoothstep(0.0, 0.15, y)) * (0.8 + 0.4 * fract(k * 5.7));
  float tong = mix(1.0, 0.45 + 0.55 * abs(sin((x * 0.5 + 0.5) * 3.14159 * tongues + n * 2.2 + uKgTime * 1.3)), smoothstep(0.3, 0.85, y));
  float d = abs(x + (n - 0.5) * (0.6 + 0.5 * rag) * y) / max(width * tong, 1e-3);
  float shape = 1.0 - smoothstep(0.45 + 0.4 * n2, 1.0, d);
  shape *= smoothstep(1.0, 0.5 + 0.3 * n, y + 0.12 * (n - 0.5));
  if (shape <= 0.01) discard;
  float core = (1.0 - smoothstep(0.0, 0.5, d)) * (1.0 - smoothstep(0.15, 0.7, y));
  vec3 col = mix(vec3(0.6, 0.08, 0.015), vec3(1.0, 0.38, 0.07), smoothstep(0.1, 0.65, shape));
  col = mix(col, vec3(1.0, 0.64, 0.28), core * (vKind == 1.0 ? 0.7 : 1.0));
  // 明るさ：篝火 3.0、炎上 1.8、遠くの篝火 2.0（白飛びしない所まで。r01-world-周1: 炎上の白飛び 15% → 炎上 2.3→1.8）
  float power = vKind == 2.0 ? 2.0 : (vKind == 1.0 ? 1.4 : 3.0);
  col *= power * (0.8 + 0.4 * n);
  col = kgApplyFog(col, cameraPosition, vWorld);
  // 炎上の炎は縁ほど透けて、重なると一枚の火の幕になる
  float a = clamp(shape * (vKind == 1.0 ? 0.8 : 1.2), 0.0, 1.0) * vGrow * kgSoftDepth(0.35);
  if (a <= 0.004) discard;
  gl_FragColor = vec4(col * a, a);
}
`;

// ---- 煙の板：上がりながら広がって薄れる。下の方は炎に照らされて橙 ----
const smokeVertex = /* glsl */ `
attribute vec4 aBase;    // xyz 根元, w 種
attribute vec4 aSize;    // x 大きさ, y 上がる高さ, z 燃え始め, w 濃さ
uniform float uKgTime;
uniform float uKgFire;
varying vec2 vUv;
varying float vAlpha;
varying float vPhase;
varying vec3 vWorld;
varying float vSeed;
varying float vBlaze;
varying float vKgViewZ;
void main() {
  float on = aSize.z < 0.0 ? 1.0 : smoothstep(aSize.z, aSize.z + 0.15, uKgFire);
  vBlaze = aSize.z < 0.0 ? 0.0 : 1.0;
  float rate = 0.06 + 0.05 * fract(aBase.w * 13.7);
  float ph = fract(uKgTime * rate + aBase.w);
  vec3 c = aBase.xyz + vec3(sin(aBase.w * 31.0 + ph * 2.0) * 0.6, ph * aSize.y, cos(aBase.w * 17.0 + ph * 1.7) * 0.6) * vec3(ph * aSize.x * 0.5, 1.0, ph * aSize.x * 0.5);
  // 風で少し流れる（東から西へ）
  c.x -= ph * ph * aSize.y * 0.35;
  float s = aSize.x * (0.35 + 1.1 * ph);
  vec3 toCam = normalize(cameraPosition - c);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam) + 1e-5);
  vec3 up = cross(toCam, right);
  float rot = aBase.w * 6.28 + ph * 1.5;
  vec2 q = vec2(position.x, position.y - 0.5);
  q = vec2(q.x * cos(rot) - q.y * sin(rot), q.x * sin(rot) + q.y * cos(rot));
  vec3 p = c + (right * q.x + up * q.y) * s;
  vUv = uv;
  vAlpha = on * aSize.w * smoothstep(0.0, 0.12, ph) * (1.0 - smoothstep(0.55, 1.0, ph));
  vPhase = ph;
  vWorld = p;
  vSeed = aBase.w;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vKgViewZ = mv.z;
  gl_Position = projectionMatrix * mv;
}
`;
const smokeFragment = /* glsl */ `
${SKY_PARS_GLSL}
${SOFT_GLSL}
uniform float uKgFire;
varying vec2 vUv;
varying float vAlpha;
varying float vPhase;
varying vec3 vWorld;
varying float vSeed;
varying float vBlaze;
void main() {
  if (vAlpha <= 0.002) discard;
  // r01-world-周1: 指摘「煙が丸い綿の玉」 ゆがめたノイズで縁を削り、もくもくした塊にする
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  vec2 warp = vec2(kgNoise(vUv * 2.5 + vSeed * 7.0 + uKgTime * 0.03), kgNoise(vUv * 2.5 - vSeed * 5.0 + 3.1)) - 0.5;
  float n = kgFbm(vUv * 3.2 + warp * 1.6 + vSeed * 11.0 + vec2(0.0, -uKgTime * 0.05), 5);
  float m = (1.0 - smoothstep(0.2, 1.0, r + (0.5 - n) * 0.9)) * smoothstep(0.32, 0.62, n);
  if (m <= 0.005) discard;
  vec3 col;
  float a = clamp(m * vAlpha, 0.0, 1.0) * kgSoftDepth(1.6);
  if (a <= 0.003) discard;
  if (vBlaze > 0.5) {
    // r02-fix-visual: 指摘「炎上の煙が橙に光り、炎と混ざって一色のぼかしになる」 炎上の煙は黒い煤煙。
    // 塊の下側（板の下半分・上がり始め）だけが炎に照らされて赤茶に、上は夜より暗い煤。濃く塗って空と炎を隠す
    vec3 soot = vec3(0.014, 0.012, 0.011) * (0.75 + 0.5 * n);
    // 下側は炎に照らされた赤茶（上がるほど、板の上ほど暗い煤）。照りは暗めに抑え、空と炎の前で黒い塊に読ませる
    float lit = (1.0 - smoothstep(0.0, 0.55, vPhase)) * smoothstep(0.85, 0.1, vUv.y) * (0.55 + 0.45 * n);
    col = mix(soot, vec3(0.3, 0.09, 0.024) * (0.35 + 0.9 * uKgFire), lit);
    a = clamp(a * 1.4, 0.0, 0.95);
  } else {
    // 色：上は夜の空気に溶ける暗い灰、下は炎の照り返し
    // 夜の空気より少し明るい灰褐色（暗い町を背にしても煙の形が読める）。下は炎の照り返しの橙
    vec3 cool = vec3(0.045, 0.04, 0.04);
    vec3 warm = vec3(0.8, 0.3, 0.08) * (0.4 + 1.8 * uKgFire);
    col = mix(warm, cool, smoothstep(0.0, 0.45, vPhase));
  }
  col = kgApplyFog(col, cameraPosition, vWorld);
  gl_FragColor = vec4(col * a, a);
}
`;

// ---- 火の粉：点。上がりながら揺れ、明滅して消える ----
const sparkVertex = /* glsl */ `
attribute vec4 aBase;    // xyz 根元, w 種
attribute vec4 aSize;    // x 広がり, y 上がる高さ, z 燃え始め, w 0
uniform float uKgTime;
uniform float uKgFire;
uniform float uKgPx;
varying float vBright;
varying vec3 vWorld;
varying float vKgViewZ;
void main() {
  float on = aSize.z < 0.0 ? 1.0 : smoothstep(aSize.z, aSize.z + 0.1, uKgFire);
  float rate = 0.35 + 0.5 * fract(aBase.w * 7.31);
  float ph = fract(uKgTime * rate + aBase.w);
  vec3 p = aBase.xyz;
  float a = aBase.w * 40.0;
  p.x += sin(a + ph * 5.0) * aSize.x * (0.3 + ph) - ph * ph * aSize.y * 0.25;
  p.z += cos(a * 1.3 + ph * 4.0) * aSize.x * (0.3 + ph);
  p.y += ph * aSize.y * (0.7 + 0.3 * fract(aBase.w * 3.7));
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vKgViewZ = mv.z;
  gl_Position = projectionMatrix * mv;
  float tw = 0.6 + 0.4 * sin(uKgTime * 23.0 + a);
  vBright = on * (1.0 - ph) * tw;
  vWorld = p;
  gl_PointSize = max(1.5, uKgPx * 0.045 / max(-mv.z, 0.5));
  if (vBright <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;
const sparkFragment = /* glsl */ `
${SKY_PARS_GLSL}
${SOFT_GLSL}
varying float vBright;
varying vec3 vWorld;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p) * 2.0;
  float m = (1.0 - smoothstep(0.2, 1.0, d)) * kgSoftDepth(0.12);
  if (m * vBright <= 0.01) discard;
  vec3 col = vec3(1.0, 0.55, 0.18) * 4.5 * vBright * m;
  col = kgApplyFog(col, cameraPosition, vWorld);
  gl_FragColor = vec4(col, 1.0);
}
`;

export class FireSystem {
  readonly flames: Mesh;
  readonly smoke: Mesh;
  readonly sparks: Points;
  private readonly flameAlways: number;
  private readonly flameAll: number;
  private readonly smokeAlways: number;
  private readonly smokeAll: number;
  private readonly sparkAlways: number;
  private readonly sparkAll: number;
  private readonly sparkMat: ShaderMaterial;
  private primed = false;
  private fire = 0;

  constructor(flames: FlameDef[], smokes: SmokeDef[], sparks: SparkDef[]) {
    // いつも燃えている物を前に、燃え広がりの物を後ろに並べる（燃えていないときは数を減らして描かない）
    const fl = [...flames.filter((f) => f.from < 0), ...flames.filter((f) => f.from >= 0)];
    this.flameAlways = flames.filter((f) => f.from < 0).length;
    this.flameAll = fl.length;
    const fg = quadGeometry();
    fg.setAttribute('aBase', new InstancedBufferAttribute(new Float32Array(fl.flatMap((f) => [...f.base, f.seed])), 4));
    fg.setAttribute('aSize', new InstancedBufferAttribute(new Float32Array(fl.flatMap((f) => [f.w, f.h, f.from, f.kind])), 4));
    fg.instanceCount = this.flameAlways;
    const flameMat = new ShaderMaterial({
      name: 'kg-flame',
      uniforms: { ...SKY_UNIFORMS, ...FIRE_UNIFORMS, ...SOFT_UNIFORMS },
      vertexShader: flameVertex,
      fragmentShader: flameFragment,
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
      premultipliedAlpha: true,
    });
    this.flames = new Mesh(fg, flameMat);
    this.flames.frustumCulled = false;
    this.flames.name = 'flames';
    this.flames.renderOrder = 10;

    const sm = [...smokes.filter((s) => s.from < 0), ...smokes.filter((s) => s.from >= 0)];
    this.smokeAlways = smokes.filter((s) => s.from < 0).length;
    this.smokeAll = sm.length;
    const sg = quadGeometry();
    sg.setAttribute('aBase', new InstancedBufferAttribute(new Float32Array(sm.flatMap((s) => [...s.base, s.seed])), 4));
    sg.setAttribute('aSize', new InstancedBufferAttribute(new Float32Array(sm.flatMap((s) => [s.size, s.rise, s.from, s.density])), 4));
    sg.instanceCount = this.smokeAlways;
    const smokeMat = new ShaderMaterial({
      name: 'kg-smoke',
      uniforms: { ...SKY_UNIFORMS, ...FIRE_UNIFORMS, ...SOFT_UNIFORMS },
      vertexShader: smokeVertex,
      fragmentShader: smokeFragment,
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
      premultipliedAlpha: true,
    });
    this.smoke = new Mesh(sg, smokeMat);
    this.smoke.frustumCulled = false;
    this.smoke.name = 'smoke';
    this.smoke.renderOrder = 11;

    // 火の粉：エミッタごとに count 個の点
    const base: number[] = [];
    const size: number[] = [];
    const ordered = [...sparks.filter((s) => s.from < 0), ...sparks.filter((s) => s.from >= 0)];
    let always = 0;
    for (const s of ordered) {
      for (let i = 0; i < s.count; i++) {
        base.push(...s.base, (s.seed * 13.37 + i * 0.6180339) % 1);
        size.push(s.spread, s.rise, s.from, 0);
      }
      if (s.from < 0) always += s.count;
    }
    this.sparkAlways = always;
    this.sparkAll = base.length / 4;
    const pg = new BufferGeometry();
    pg.setAttribute('position', new BufferAttribute(new Float32Array(this.sparkAll * 3), 3));
    pg.setAttribute('aBase', new BufferAttribute(new Float32Array(base), 4));
    pg.setAttribute('aSize', new BufferAttribute(new Float32Array(size), 4));
    pg.setDrawRange(0, this.sparkAlways);
    this.sparkMat = new ShaderMaterial({
      name: 'kg-sparks',
      uniforms: { ...SKY_UNIFORMS, ...FIRE_UNIFORMS, ...SOFT_UNIFORMS, uKgPx: { value: 720 } },
      vertexShader: sparkVertex,
      fragmentShader: sparkFragment,
      transparent: true,
      depthWrite: false,
      // 足し算。炎の段の画に重ねるので、不透明さ（α）は足さない（足すと重ねるときに後ろを黒く抜く）
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneFactor,
      blendSrcAlpha: ZeroFactor,
      blendDstAlpha: OneFactor,
    });
    this.sparks = new Points(pg, this.sparkMat);
    this.sparks.frustumCulled = false;
    this.sparks.name = 'sparks';
    this.sparks.renderOrder = 12;
    // r03-fix-visual: ふつうの場面の描画から外し、後処理の炎の段（深さで縁を溶かす）で描く
    for (const o of [this.flames, this.smoke, this.sparks]) o.layers.set(FIRE_LAYER);
  }

  setFire(progress: number): void {
    this.fire = progress;
    FIRE_UNIFORMS.uKgFire.value = progress;
    this.syncCounts();
  }

  /** warmUp の間は全部を描く数にする（燃え広がりの物も同じ材質なので、作られるシェーダーは変わらない）。 */
  prime(on: boolean): void {
    this.primed = on;
    this.syncCounts();
  }

  /** 画面の高さ（画素）。火の粉の大きさに使う。 */
  setViewportHeight(px: number): void {
    this.sparkMat.uniforms.uKgPx.value = px;
  }

  private syncCounts(): void {
    const all = this.primed || this.fire > 0.001;
    (this.flames.geometry as InstancedBufferGeometry).instanceCount = all ? this.flameAll : this.flameAlways;
    (this.smoke.geometry as InstancedBufferGeometry).instanceCount = all ? this.smokeAll : this.smokeAlways;
    this.sparks.geometry.setDrawRange(0, all ? this.sparkAll : this.sparkAlways);
  }
}
