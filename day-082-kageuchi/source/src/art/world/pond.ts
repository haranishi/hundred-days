// OWNER: world-art
// 池：楕円の窪み（濡れた岸）・縁の石・暗い水面。水面には、空と、書院の障子の明かり・石灯籠・行灯が映る。
// 映り込みは鏡像を描かず、水面の点から反射の向きへ「書院の正面の面」と「灯りの点」を計算で引く
// （手続きの反射。安く、映したい物だけを確実に映せる）。小さな波で反射の向きを揺らし、灯りの像を縦に伸ばす。
import { Mesh, ShaderMaterial, Vector2, Vector3, Vector4, type PointLight } from 'three';
import type { StageDef } from '../../stage/types';
import { FIRE_LIGHT } from '../render/config';
import { BURN_UNIFORMS } from '../render/materials';
import { SKY_PARS_GLSL, SKY_UNIFORMS } from '../render/sky';
import type { Builders } from './buildings';
import { MeshBuilder, rng, seedOf } from './geometry';
import { MAT, PART } from './materialsLib';
import { rock } from './props';

const WATER_Y = -0.12;
const MAX_GLOWS = 4;

const vertexShader = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

// r02-fix-visual: 指摘「低い角度では障子の格子を鏡のように写して網に見え、真上からは何も映らない黒い穴」
//   旧：障子の面を格子ごと鋭く写し、灯りの像は細い。真上では反射率 2% の空しか無い
//   新：障子は柱間の明暗だけを残したにじんだ窓（遠い像ほどぼける）。灯りと炎上の光は縦長ににじんだ像で、波で揺れる。
//       さらに、灯りのそばの水面に淡い明かりを落とす（視点に依らないので、真上からでも水面と分かる）
const fragmentShader = /* glsl */ `
${SKY_PARS_GLSL}
uniform vec4 uShojiRect;   // x0, x1, y0, y1（障子の面）
uniform vec4 uShojiPlane;  // x: 面の z, y: 屋根の下端の高さ, z: 屋根の上端の高さ, w: 明るさ
uniform vec3 uShojiColor;
uniform vec2 uShojiBay;    // 柱の筋：x 最初の柱の x, y 柱間の幅
uniform vec4 uGlowPos[${MAX_GLOWS}];   // xyz 位置, w 明るさ
uniform vec3 uGlowColor[${MAX_GLOWS}];
uniform vec4 uFirePos[3];              // 炎上の光（xyz 位置, w 強さ）
uniform vec3 uFireColor;
uniform vec4 uKgBurn;
uniform vec3 uDeep;
varying vec3 vWorld;

vec2 ripple(vec2 p) {
  vec2 g = vec2(0.0);
  g += vec2(cos(p.x * 3.1 + uKgTime * 1.3), sin(p.y * 2.7 - uKgTime * 1.1)) * 0.012;
  g += vec2(sin(p.y * 7.3 + p.x * 2.0 + uKgTime * 2.3), cos(p.x * 6.1 - uKgTime * 1.9)) * 0.006;
  vec3 n = kgNoiseD(p * 1.6 + vec2(uKgTime * 0.15, -uKgTime * 0.1));
  g += n.yz * 0.008;
  return g;
}

// 灯りの映り：反射の向き R と灯りへの向き Ld の差で、縦に長くにじんだ像（soft が大きいほどぼける）
float kgReflLobe(vec3 R, vec3 Ld, float soft) {
  vec3 d = R - Ld;
  return exp(-(dot(d.xz, d.xz) * 150.0 + d.y * d.y * 20.0) / soft);
}

void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  float fw = length(fwidth(vWorld.xz));
  vec2 g = ripple(vWorld.xz) * (1.0 - smoothstep(0.03, 0.12, fw));
  // 映りを揺らすため、さざ波の傾きは強めに使う
  vec3 n = normalize(vec3(-g.x * 1.8, 1.0, -g.y * 1.8));
  float cosV = clamp(dot(n, V), 0.0, 1.0);
  float F = 0.02 + 0.98 * pow(1.0 - cosV, 5.0);
  vec3 R = reflect(-V, n);
  // r01-world-周4: 指摘「真上寄りの角度では池が黒い穴で、水だと分からない」 空は星ごと映す（さざ波で揺れる点）
  vec3 refl = kgSkyFull(R) * 1.6;
  // 書院の正面：建物の影で空を隠し、障子はにじんだ窓として映す（格子の線は写さない）
  if (R.z < -0.01) {
    float t = (uShojiPlane.x - vWorld.z) / R.z;
    vec3 h = vWorld + R * t;
    // 水面の像は縦ににじみ、横はあまりぼけない（さざ波は手前と奥の向きに像を引き伸ばす）
    float softX = 0.05 + 0.025 * t;
    float softY = 0.2 + 0.07 * t;
    float bld = smoothstep(-0.4, 0.3, h.y) * (1.0 - smoothstep(uShojiPlane.z - 0.4, uShojiPlane.z + 0.4, h.y))
              * smoothstep(uShojiRect.x - 2.2, uShojiRect.x - 1.0, h.x) * (1.0 - smoothstep(uShojiRect.y + 1.0, uShojiRect.y + 2.2, h.x));
    refl = mix(refl, vec3(0.003, 0.0035, 0.005), bld);
    float wx = smoothstep(uShojiRect.x - softX, uShojiRect.x + softX, h.x) * (1.0 - smoothstep(uShojiRect.y - softX, uShojiRect.y + softX, h.x));
    float wy = smoothstep(uShojiRect.z - softY, uShojiRect.z + softY, h.y) * (1.0 - smoothstep(uShojiRect.w - softY, uShojiRect.w + softY, h.y));
    // 柱の暗い縦の筋（柱間ごとの明るさの違いも少し残す）
    float bx = (h.x - uShojiBay.x) / uShojiBay.y;
    float pil = smoothstep(0.07, 0.07 + softX * 1.5, abs(fract(bx + 0.5) - 0.5) * uShojiBay.y);
    float bay = 0.75 + 0.25 * kgHash12(vec2(floor(bx), 3.0));
    vec3 shoji = uShojiColor * uShojiPlane.w * bay * pil;
    // 炎上：障子の像が炎の色へ
    shoji = mix(shoji, vec3(1.0, 0.4, 0.09) * 2.4 * pil, smoothstep(0.05, 0.4, uKgBurn.x));
    // さざ波で像が横の筋に割れる（見る向きに直交する筋が、時間でゆっくり流れる）
    // 2つの波の和をノイズでゆがめ、規則的な縞（砂紋のような畝）にしない。暗い切れ目を多めに残す
    float sc = dot(vWorld.xz, normalize(toCam.xz + vec2(1e-4)));
    float w1 = sin(sc * 11.0 + (g.x + g.y) * 40.0 + uKgTime * 1.3 + kgNoise(vWorld.xz * 1.3) * 4.0);
    float w2 = sin(sc * 23.0 - uKgTime * 1.9 + kgNoise(vWorld.xz * 2.7 + 5.0) * 5.0);
    float streak = smoothstep(0.05, 0.85, 0.55 * w1 + 0.35 * w2 + (kgNoise(vWorld.xz * vec2(2.0, 9.0) + uKgTime * 0.3) - 0.5) * 1.1);
    refl += shoji * wx * wy * 0.24 * (0.12 + 0.88 * streak);
  }
  vec3 glow = vec3(0.0);
  vec3 sheen = vec3(0.0);
  for (int i = 0; i < ${MAX_GLOWS}; i++) {
    if (uGlowPos[i].w <= 0.0) continue;
    vec3 L = uGlowPos[i].xyz - vWorld;
    float ld = length(L);
    vec3 Ld = L / ld;
    glow += uGlowColor[i] * uGlowPos[i].w * kgReflLobe(R, Ld, 1.0 + ld * 0.06) / (1.0 + ld * 0.12);
    // さざ波の斜面が拾う柔らかい照り（真上からでも、灯りの側の斜面が光る）
    float nh = max(dot(n, normalize(V + Ld)), 0.0);
    glow += uGlowColor[i] * uGlowPos[i].w * (pow(nh, 260.0) * 2.5 + pow(nh, 48.0) * 0.3) / (1.0 + ld * ld * 0.08);
    // 水面に落ちる淡い明かり（視点に依らない）。灯りの側の水際に寄せる
    sheen += uGlowColor[i] * uGlowPos[i].w * exp(-length(L.xz) * 1.0) / (1.0 + L.y * L.y);
  }
  for (int i = 0; i < 3; i++) {
    if (uFirePos[i].w <= 0.0) continue;
    vec3 L = uFirePos[i].xyz - vWorld;
    float ld = length(L);
    vec3 Ld = L / ld;
    glow += uFireColor * uFirePos[i].w * 0.05 * kgReflLobe(R, Ld, 2.5 + ld * 0.08);
    sheen += uFireColor * uFirePos[i].w * 0.015 / (1.0 + ld * ld * 0.02);
  }
  // 落ちた明かりは、さざ波で揺れる斑（明るい所と暗い所が流れる）
  float rip = smoothstep(0.32, 0.78, kgFbm(vWorld.xz * 3.0 + vec2(uKgTime * 0.45, -uKgTime * 0.3), 3));
  vec3 col = uDeep + refl * max(F, 0.05) + glow * max(F, 0.12) + sheen * 0.2 * (0.2 + 0.8 * rip);
  col = kgApplyFog(col, cameraPosition, vWorld);
  gl_FragColor = vec4(col, 1.0);
}
`;

/** 池：縁の窪み・縁石（builder へ足す）と水面。update で炎上の光を水面へ渡す。 */
export interface Pond {
  mesh: Mesh;
  /** 炎上の光（world の炎上の枠）の位置と強さを、水面の映りへ写す。毎コマ、灯りを進めた後に呼ぶ。 */
  update(fires: readonly PointLight[]): void;
}

export function buildPond(bd: Builders, stage: StageDef): Pond | null {
  const pond = stage.ponds[0];
  if (!pond) return null;
  const { center, rx, rz } = pond;
  // 窪み：縁 (y=0) から中心 (y=-0.5) へ。濡れた泥の岸
  const basin: MeshBuilder = bd.stoneLow;
  basin.kg = [PART.stone.rough, 31, 0, 0];
  basin.grid(
    48,
    6,
    (u, v) => {
      const a = u * Math.PI * 2;
      const rr = 1.02 - v;
      const y = -0.5 * (1 - rr * rr) - 0.01;
      return { p: [center.x + Math.cos(a) * rx * rr, y, center.z + Math.sin(a) * rz * rr], uv: [u * 20, v * 3] };
    },
    true,
  );
  // 縁の石：北（奥）は大きな石の組み、手前は小さく間を空ける。等間隔に並べない
  // r01-world-周1: 指摘「縁石が首飾りのように等間隔で同じ大きさ」 22個の等間隔 → 乱数の角度・大きさ・間引き
  const seed = seedOf(pond.id);
  const rr = rng(seed);
  let a = rr() * 0.4;
  while (a < Math.PI * 2) {
    const north = Math.max(0, -Math.sin(a));
    const big = rr() < 0.18 + 0.35 * north;
    const size = big ? 0.45 + 0.35 * rr() : 0.16 + 0.18 * rr();
    const out = 1.0 + (big ? 0.06 : 0.02) + rr() * 0.05;
    if (rr() > 0.18 || big) rock(bd.stoneLow, center.x + Math.cos(a) * rx * out, center.z + Math.sin(a) * rz * out, size, seed + Math.floor(a * 100), big ? 0.75 : 0.5);
    a += (size * 1.25 + 0.08 + rr() * 0.35) / Math.max(rx, rz);
  }
  // 水面
  const shoin = stage.buildings.find((b) => b.kind === 'shoin');
  const glows = stage.lights
    .filter((l) => (l.kind === 'stoneLantern' || l.kind === 'andon') && Math.hypot(l.pos.x - center.x, l.pos.z - center.z) < 14)
    .slice(0, MAX_GLOWS);
  const glowPos: Vector4[] = [];
  const glowCol: Vector3[] = [];
  for (let i = 0; i < MAX_GLOWS; i++) {
    const l = glows[i];
    glowPos.push(l ? new Vector4(l.pos.x, l.height + 0.05, l.pos.z, l.kind === 'andon' ? 2.2 : 2.6) : new Vector4(0, -100, 0, 0));
    glowCol.push(l ? new Vector3(...l.color) : new Vector3());
  }
  const material = new ShaderMaterial({
    name: 'kg-pond',
    uniforms: {
      ...SKY_UNIFORMS,
      uShojiRect: { value: shoin ? new Vector4(shoin.footprint.x0 + 0.6, shoin.footprint.x1 - 0.6, 0.72, 2.5) : new Vector4(0, 0, 0, 0) },
      uShojiPlane: { value: shoin ? new Vector4(shoin.footprint.z1 - 1.12, 3.4, shoin.ridgeHeight, 1.7) : new Vector4(-100, 0, 0, 0) },
      uShojiColor: { value: new Vector3(...MAT.glow) },
      // 書院の柱：buildings.ts の書院の本体（足跡の内側 0.5m・柱間の目安 1.82m）と同じ割り付け
      uShojiBay: {
        value: shoin
          ? new Vector2(shoin.footprint.x0 + 0.5, (shoin.footprint.x1 - shoin.footprint.x0 - 1) / Math.max(1, Math.round((shoin.footprint.x1 - shoin.footprint.x0 - 1) / 1.82)))
          : new Vector2(0, 1),
      },
      uGlowPos: { value: glowPos },
      uGlowColor: { value: glowCol },
      uFirePos: { value: [new Vector4(), new Vector4(), new Vector4()] },
      uFireColor: { value: new Vector3(...FIRE_LIGHT.color) },
      uKgBurn: BURN_UNIFORMS.uKgBurn,
      uDeep: { value: new Vector3(0.002, 0.004, 0.005) },
    },
    vertexShader,
    fragmentShader,
  });
  const water = new MeshBuilder();
  water.grid(
    48,
    4,
    (u, v) => {
      const a = u * Math.PI * 2;
      const rr = 0.9 * (1 - v);
      return { p: [center.x + Math.cos(a) * rx * rr, WATER_Y, center.z + Math.sin(a) * rz * rr], uv: [0, 0] };
    },
    true,
  );
  const mesh = new Mesh(water.build(), material);
  mesh.name = 'pond';
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  const fires = material.uniforms.uFirePos.value as Vector4[];
  return {
    mesh,
    update(ls: readonly PointLight[]): void {
      for (let i = 0; i < fires.length; i++) {
        const l = ls[i];
        if (l) fires[i].set(l.position.x, l.position.y, l.position.z, l.intensity);
        else fires[i].w = 0;
      }
    },
  };
}
