// OWNER: fx
// 崩れた建物の跡に残る瓦礫の山。
// r04-fx2：指摘「下の塊は約0.1秒で瓦礫の山に差し替わる」「瓦礫の山はどこでも同じ灰茶の迷彩模様の丘」。
//   山は崩落の最後の 0.6〜1 秒で根元から盛り上がる（進みは city/collapsePose.ts の moundProgress、高さは moundHeight）。
//   色は崩れたビルから取る（rubblePalette.ts）：塊（ボロノイの格子）ごとに外壁のかけら・コンクリ・ガラスを割合で塗り分け、
//   塊の隙間は暗く、上を向いた面には土埃、燃えていた建物は焦げの分だけ黒い。面は平らな塊に割る（flatShading と塊ごとの面の傾き）。
//   形は1つの山を使い回すが、左右非対称にして、建物ごとに向きを4通りに変える。落ちた破片が山の上に載るよう、山の高さを返す（heightAt）。
// r05-camera：体験の採点の B2「瓦礫の山に怪獣が埋まって見えない」。カメラと竜の間の山は、建物と同じく網点で透かす（画面の上で体と照準の
//   まわりだけ。city/damageGlsl.ts の OCCLUSION_GLSL）。透かす度合いは、壊れ方の表の建物ごとの値（T4.x）を建物番号で引く（追うカメラが
//   間の山の建物番号を occluders に入れる）。影は透かさない（影は既定の深さの材質で描く）
import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { RUBBLE } from '../config/fx';
import { AMBIENT } from '../config/render';
import { hash01 } from '../core/rng';
import type { MaterialKit } from '../render/materials';
import { replaceOrThrow } from '../render/materials';
import { NOISE_GLSL } from '../render/shaders/noiseGlsl';
import { OCCLUSION_GLSL } from '../city/damageGlsl';
import { DAMAGE_TEXELS_PER_BUILDING, sharedOcclusion } from '../city/damageTexture';
import type { Building } from '../world/types';
import type { RubblePalette } from './rubblePalette';

/**
 * 単位の山の高さ（0〜1 前後）。u, v は -0.5〜0.5。角の丸い台形（外形の上はほぼ平らに高く、崩れた建物の外形の角でも頂の7割ほど）に、
 * 左右非対称の凸凹を足す（建物ごとに向きを変えると、違う形に見える）。
 */
export function heapHeight(u: number, v: number): number {
  const e = Math.max(Math.abs(u), Math.abs(v)) * 2;
  const q = 0.85 * e + 0.15 * Math.hypot(u, v) * 2;
  const base = Math.pow(Math.max(0, 1 - Math.pow(q, 3)), 0.55);
  const bump = 0.14 * Math.sin(u * 23.1 + v * 7.7) * Math.cos(v * 17.3 - u * 5.1) + 0.08 * Math.sin(u * 51 + v * 43) + 0.12 * Math.sin(u * 6.1 + 1.3) * Math.cos(v * 4.3 - 0.7);
  return Math.max(0, base * (0.92 + bump));
}

function heapGeometry(): BufferGeometry {
  const n = 22;
  const pos: number[] = [];
  const nrm: number[] = [];
  const p = (i: number, j: number): Vector3 => {
    const u = i / n - 0.5;
    const v = j / n - 0.5;
    return new Vector3(u, heapHeight(u, v), v);
  };
  const a = new Vector3();
  const b = new Vector3();
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (const tri of [
        [p(i, j), p(i, j + 1), p(i + 1, j + 1)],
        [p(i, j), p(i + 1, j + 1), p(i + 1, j)],
      ]) {
        const nn = a.subVectors(tri[1], tri[0]).cross(b.subVectors(tri[2], tri[0])).normalize();
        if (nn.y < 0) nn.negate();
        for (const q of tri) {
          pos.push(q.x, q.y, q.z);
          nrm.push(nn.x, nn.y, nn.z);
        }
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3));
  g.computeBoundingSphere();
  return g;
}

const f4 = (x: number): string => x.toFixed(4);
const v3 = (c: readonly number[]): string => `vec3(${f4(c[0])}, ${f4(c[1])}, ${f4(c[2])})`;

const VERT_PARS = /* glsl */ `
attribute vec4 iRubbleA;
attribute vec4 iRubbleB;
attribute vec3 iRubbleW;
attribute float iRubbleId;
uniform highp sampler2D uDmgTex;
uniform float uDmgTexWidth;
uniform mat4 uOccViewProj;
varying vec4 vRubbleOcc;
varying vec3 vRubblePos;
varying vec4 vRubbleA;
varying vec4 vRubbleB;
varying vec3 vRubbleW;
`;

const VERT_MAIN = /* glsl */ `
{ vec4 rp = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
rp = instanceMatrix * rp;
#endif
vRubblePos = (modelMatrix * rp).xyz; vRubbleA = iRubbleA; vRubbleB = iRubbleB; vRubbleW = iRubbleW;
  // r05-camera：透かす度合い（壊れ方の表の T4.x）と、遊ぶカメラの画面の座標（網点の範囲用）
  int occW = int(uDmgTexWidth);
  int occI = int(floor(iRubbleId + 0.5)) * ${DAMAGE_TEXELS_PER_BUILDING} + 4;
  float occ = iRubbleId < 0.0 ? 0.0 : texelFetch(uDmgTex, ivec2(occI - (occI / occW) * occW, occI / occW), 0).x;
  vec4 occC = uOccViewProj * vec4(vRubblePos, 1.0);
  vRubbleOcc = vec4(occC.xy, occC.w, occ); }
`;

const FRAG_PARS = /* glsl */ `
varying vec4 vRubbleOcc;
${OCCLUSION_GLSL}
varying vec3 vRubblePos;
varying vec4 vRubbleA;
varying vec4 vRubbleB;
varying vec3 vRubbleW;
vec2 gRubbleCell = vec2(0.0);
float gRubbleGlass = 0.0;
${NOISE_GLSL}
`;

// 塊と隙間：ボロノイの格子（RUBBLE.chunk m）の塊ごとに種類（外壁・コンクリ・ガラス）と明るさを決め、境目を暗くする
const FRAG_COLOR = /* glsl */ `
occDiscard(vRubbleOcc);
{
  float seed = vRubbleA.w;
  vec2 g = vRubblePos.xz / ${f4(RUBBLE.chunk)} + seed * 17.0;
  vec2 i0 = floor(g);
  vec2 f0 = fract(g);
  float d1 = 8.0;
  float d2 = 8.0;
  vec2 cell = vec2(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 h = vec2(hash12(i0 + o), hash12(i0 + o + 19.7));
      float d = length(o + h - f0);
      if (d < d1) { d2 = d1; d1 = d; cell = i0 + o; } else if (d < d2) { d2 = d; }
    }
  }
  gRubbleCell = cell;
  float px = length(fwidth(g));
  float gap = (1.0 - smoothstep(0.02, 0.1 + px, d2 - d1)) * (1.0 - smoothstep(0.25, 0.6, px));
  float pick = hash12(cell * 1.31 + seed * 7.0);
  gRubbleGlass = step(vRubbleW.x + vRubbleW.y, pick);
  vec3 kindC = pick < vRubbleW.x ? vRubbleA.rgb : (pick < vRubbleW.x + vRubbleW.y ? ${v3(RUBBLE.concrete)} : vRubbleB.rgb);
  float tone = 1.0 + ${f4(RUBBLE.chunkTone)} * (hash12(cell * 2.7 + 3.1) * 2.0 - 1.0);
  vec3 c = kindC * tone;
  // 上を向いた面（平らな塊の面の向き）に土埃がかかる
  vec3 wn = normalize(cross(dFdx(vRubblePos), dFdy(vRubblePos)));
  wn *= sign(wn.y + 1e-4);
  c = mix(c, ${v3(RUBBLE.dust)}, 0.45 * smoothstep(0.62, 0.95, wn.y) * (1.0 - gRubbleGlass * 0.6));
  c *= 1.0 - 0.55 * gap;
  c = mix(c, ${v3(RUBBLE.soot)}, vRubbleB.w * (0.55 + 0.45 * hash12(cell * 3.3 + 1.7)));
  diffuseColor.rgb = c;
}
`;

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _up = new Vector3(0, 1, 0);

interface HeapSlot {
  cx: number;
  cz: number;
  /** 世界の軸に沿った半分の広がり（m、判定用）と、単位の山への縮尺（m） */
  hx: number;
  hz: number;
  sx: number;
  sz: number;
  /** 向き（π/2 の何倍か）・地面の高さ・いまの高さ（m）・いまの根元の広がり（盛り上がりきって 1） */
  rot: number;
  ground: number;
  height: number;
  spread: number;
}

export class RubbleField {
  readonly mesh: InstancedMesh;
  readonly group = new Group();
  private readonly slotOf = new Map<number, number>();
  private readonly slots: HeapSlot[] = [];
  private readonly attrA: InstancedBufferAttribute;
  private readonly attrB: InstancedBufferAttribute;
  private readonly attrW: InstancedBufferAttribute;
  private readonly attrId: InstancedBufferAttribute;

  constructor(kit: MaterialKit, capacity: number) {
    const material = new MeshStandardMaterial({ roughness: 0.95, metalness: 0, envMapIntensity: AMBIENT.envIntensity, flatShading: true });
    // r05-camera：網点の値（壊れ方の表と範囲）は、遊びの場面の表と同じ uniform を共有する（無ければ透かさない値）
    const occ = sharedOcclusion.uniforms;
    kit.patch(material, {
      key: 'rubble-r05',
      uniforms: { uDmgTex: occ.uDmgTex, uDmgTexWidth: occ.uDmgTexWidth, uOccViewProj: occ.uOccViewProj, uOccBox: occ.uOccBox, uOccAim: occ.uOccAim },
      vertex: (src) =>
        replaceOrThrow(replaceOrThrow(src, '#include <common>', `#include <common>\n${VERT_PARS}`), '#include <begin_vertex>', `#include <begin_vertex>\n${VERT_MAIN}`),
      fragment: (src) => {
        let s = replaceOrThrow(src, '#include <common>', `#include <common>\n${FRAG_PARS}`);
        s = replaceOrThrow(s, '#include <color_fragment>', `#include <color_fragment>\n${FRAG_COLOR}`);
        // ガラスの塊は滑らかで空を映す。ほかは粗い
        s = replaceOrThrow(s, '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.95, 0.22, gRubbleGlass);');
        s = replaceOrThrow(s, '#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(0.0, 0.45, gRubbleGlass);');
        // 塊ごとに面を少し傾け、平らな丘ではなく積み重なった塊に見せる
        s = replaceOrThrow(
          s,
          '#include <normal_fragment_maps>',
          '#include <normal_fragment_maps>\n{ vec3 tiltW = vec3(hash12(gRubbleCell * 4.1 + 2.3) - 0.5, 0.0, hash12(gRubbleCell * 5.3 + 7.1) - 0.5) * 0.9; normal = normalize(normal + (viewMatrix * vec4(tiltW, 0.0)).xyz); }',
        );
        return s;
      },
    });
    material.name = 'Rubble';
    const geometry = heapGeometry();
    const make = (n: number): InstancedBufferAttribute => {
      const a = new InstancedBufferAttribute(new Float32Array(capacity * n), n);
      a.setUsage(DynamicDrawUsage);
      return a;
    };
    this.attrA = make(4);
    this.attrB = make(4);
    this.attrW = make(3);
    this.attrId = make(1);
    (this.attrId.array as Float32Array).fill(-1);
    geometry.setAttribute('iRubbleA', this.attrA);
    geometry.setAttribute('iRubbleB', this.attrB);
    geometry.setAttribute('iRubbleW', this.attrW);
    geometry.setAttribute('iRubbleId', this.attrId);
    this.mesh = new InstancedMesh(geometry, material, capacity);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.name = 'rubble';
    this.group.add(this.mesh);
  }

  /** 建物 b の山を置く（崩れている間は毎コマ）。mound は盛り上がり（0〜1）、height は盛り上がりきった高さ（m）。 */
  place(b: Building, mound: number, groundY: number, height: number, palette: RubblePalette): void {
    let slot = this.slotOf.get(b.id);
    const f = b.footprint;
    if (slot === undefined) {
      slot = this.mesh.count++;
      this.slotOf.set(b.id, slot);
      const rot = Math.floor(hash01(b.id, 91) * 4) % 4;
      const w = (f.x1 - f.x0) * RUBBLE.spread + RUBBLE.pad;
      const d = (f.z1 - f.z0) * RUBBLE.spread + RUBBLE.pad;
      // 奇数回の 90° では、単位の山の u が世界の z に沿う
      const odd = rot % 2 === 1;
      this.slots[slot] = { cx: (f.x0 + f.x1) / 2, cz: (f.z0 + f.z1) / 2, hx: w / 2, hz: d / 2, sx: odd ? d : w, sz: odd ? w : d, rot, ground: groundY, height: 0, spread: 1 };
      const A = this.attrA.array as Float32Array;
      const B = this.attrB.array as Float32Array;
      const W = this.attrW.array as Float32Array;
      A.set([...palette.facade, hash01(b.id, 97)], slot * 4);
      B.set([...palette.glass, palette.soot], slot * 4);
      W.set(palette.weights, slot * 3);
      (this.attrId.array as Float32Array)[slot] = b.id;
      for (const a of [this.attrA, this.attrB, this.attrW, this.attrId]) {
        a.addUpdateRange(slot * a.itemSize, a.itemSize);
        a.needsUpdate = true;
      }
    }
    const s = this.slots[slot];
    const t = Math.min(1, Math.max(0, mound));
    s.height = height * t;
    s.ground = groundY;
    // 盛り上がりながら、根元が少し広がる
    s.spread = 0.82 + 0.18 * t;
    _p.set(s.cx, groundY, s.cz);
    _q.setFromAxisAngle(_up, (s.rot * Math.PI) / 2);
    _s.set(s.sx * s.spread, Math.max(0.01, s.height), s.sz * s.spread);
    this.mesh.setMatrixAt(slot, _m.compose(_p, _q, _s));
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** (x, z) での瓦礫の山の表面の高さ（m）。山が無ければ -Infinity。 */
  heightAt(x: number, z: number): number {
    let best = -Infinity;
    for (const s of this.slots) {
      if (!s || s.height <= 0.01) continue;
      const dx = x - s.cx;
      const dz = z - s.cz;
      if (Math.abs(dx) > s.hx || Math.abs(dz) > s.hz) continue;
      // 世界 → 単位の山（向きの逆回し。90° の倍数なので cos と sin は 0 か ±1）
      const a = (s.rot * Math.PI) / 2;
      const c = Math.round(Math.cos(a));
      const sn = Math.round(Math.sin(a));
      const u = (dx * c - dz * sn) / (s.sx * s.spread);
      const v = (dx * sn + dz * c) / (s.sz * s.spread);
      if (Math.abs(u) > 0.5 || Math.abs(v) > 0.5) continue;
      best = Math.max(best, s.ground + heapHeight(u, v) * s.height);
    }
    return best;
  }

  clear(): void {
    this.slotOf.clear();
    this.slots.length = 0;
    this.mesh.count = 0;
  }

  /** シェーダーを先に作らせるため、1個だけ見える状態にする。 */
  prime(on: boolean): void {
    this.mesh.count = on ? Math.max(1, this.slotOf.size) : this.slotOf.size;
  }
}
