// OWNER: core
// 視界の扇：縁の細い線と、目から遠いほど薄れるごく淡い色。平常は控えめな寒色、不審は琥珀、発見は赤。
// r02-fix-play: 見た目の採点の1位「扇の塗りが地面に光を足し、扇の中が灯りに見える」を直した。
//   旧：半透明の面を普通の合成で重ねる（色へ寄せる＝暗い苔が約7倍明るくなり、灯りの島と見分けがつかない）
//   新：塗りは「地面の色 × 色み」の掛け算。色みは輝度が 1 になるようにそろえた比で、地面の明るさは変えず色合いだけを変える
//       （描き先は半精度なので 1 を超える比も切り詰められない）。扇の形は縁の細い線で読ませる。
// 写しの poly（先頭が目の位置）から、扇形の三角形を毎コマ作り直す（頂点の数は一定なので、配列を書き換えるだけ）。
// 暗い隙間の向こうの灯りの島（bands）は、線1本ぶんの角の幅の帯として同じ色みで重ね、手前と奥の端に線を引く。
// r03-fix-play: 平常の扇は、プレイヤーから扇までの距離で濃さを変える（近いほど濃く、22m より遠い扇は描かない。coneFocus.ts）。
import * as THREE from 'three';
import type { Awareness, ConeSnap } from '../../contract/snapshot';
import { SIGHT } from '../../config/rules';
import { CONE_STYLE, type ConeTone } from '../../config/view';
import { calmEmphasis, coneDistance } from './coneFocus';

const N = SIGHT.coneRays + 1;
const Y = 0.06;
/** 灯りの島の帯の上限（sim の SIGHT.coneBands と同じ）。 */
const BANDS = SIGHT.coneBands;

/** 輝度（Rec.709 の重み）が 1 になるようにそろえた色み。地面の色に掛けても明るさがほとんど変わらない。 */
function unitTint(rgb: readonly [number, number, number]): THREE.Color {
  const l = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  return new THREE.Color(rgb[0] / l, rgb[1] / l, rgb[2] / l);
}

interface Tone {
  tint: THREE.Color;
  line: THREE.Color;
  style: ConeTone;
}

const TONES: Record<Awareness, Tone> = {
  calm: { tint: unitTint(CONE_STYLE.calm.tint), line: new THREE.Color(...CONE_STYLE.calm.line), style: CONE_STYLE.calm },
  suspicious: { tint: unitTint(CONE_STYLE.suspicious.tint), line: new THREE.Color(...CONE_STYLE.suspicious.line), style: CONE_STYLE.suspicious },
  alert: { tint: unitTint(CONE_STYLE.alert.tint), line: new THREE.Color(...CONE_STYLE.alert.line), style: CONE_STYLE.alert },
};

/** 色みの強さ（0..1）を目からの距離で薄める。 */
function tintAt(st: ConeTone, d: number, floor = 0): number {
  const k = Math.min(1, d / CONE_STYLE.fadeDist);
  return Math.max(floor, st.tintEye + (st.tintFar - st.tintEye) * k);
}

/** 縁の線の濃さを目からの距離で少しだけ薄める（遠い縁も読めるように下限を持つ）。 */
function lineAt(st: ConeTone, d: number): number {
  const k = Math.min(1, d / CONE_STYLE.fadeDist);
  return st.lineEye + (st.lineFar - st.lineEye) * k;
}

function writeTint(out: Float32Array, i: number, tint: THREE.Color, s: number): void {
  out[i * 3] = 1 + (tint.r - 1) * s;
  out[i * 3 + 1] = 1 + (tint.g - 1) * s;
  out[i * 3 + 2] = 1 + (tint.b - 1) * s;
}

function writeLine(out: Float32Array, i: number, c: THREE.Color, a: number): void {
  out[i * 4] = c.r;
  out[i * 4 + 1] = c.g;
  out[i * 4 + 2] = c.b;
  out[i * 4 + 3] = a;
}

interface ConeVis {
  mesh: THREE.Mesh;
  pos: THREE.BufferAttribute;
  col: THREE.BufferAttribute;
  line: THREE.Line;
  linePos: THREE.BufferAttribute;
  lineCol: THREE.BufferAttribute;
  bands: THREE.Mesh;
  bandPos: THREE.BufferAttribute;
  bandCol: THREE.BufferAttribute;
  bandLine: THREE.LineSegments;
  bandLinePos: THREE.BufferAttribute;
  bandLineCol: THREE.BufferAttribute;
}

export class ConeLayer {
  private readonly group = new THREE.Group();
  private readonly cones = new Map<string, ConeVis>();
  /** 塗り：先にある色（地面）に頂点の色みを掛ける。足し算をしないので、地面より明るくならない。 */
  private readonly mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    toneMapped: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.ZeroFactor,
    blendDst: THREE.SrcColorFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
  });
  /** 縁の線（頂点ごとの濃さ）。 */
  private readonly lineMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: false, toneMapped: false });
  private readonly index: number[] = [];
  private readonly bandIndex: number[] = [];

  constructor(parent: THREE.Object3D) {
    this.group.name = 'cones';
    parent.add(this.group);
    for (let i = 1; i < N - 1; i++) this.index.push(0, i, i + 1);
    for (let b = 0; b < BANDS; b++) this.bandIndex.push(b * 4, b * 4 + 1, b * 4 + 2, b * 4, b * 4 + 2, b * 4 + 3);
  }

  private make(): ConeVis {
    const dyn = (n: number, size: number): THREE.BufferAttribute => {
      const a = new THREE.BufferAttribute(new Float32Array(n * size), size);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    const geo = new THREE.BufferGeometry();
    const pos = dyn(N, 3);
    const col = dyn(N, 3);
    geo.setAttribute('position', pos);
    geo.setAttribute('color', col);
    geo.setIndex(this.index);
    const mesh = new THREE.Mesh(geo, this.mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    const lgeo = new THREE.BufferGeometry();
    const linePos = dyn(N + 1, 3);
    const lineCol = dyn(N + 1, 4);
    lgeo.setAttribute('position', linePos);
    lgeo.setAttribute('color', lineCol);
    const line = new THREE.Line(lgeo, this.lineMat);
    line.frustumCulled = false;
    line.renderOrder = 3;
    const bgeo = new THREE.BufferGeometry();
    const bandPos = dyn(BANDS * 4, 3);
    const bandCol = dyn(BANDS * 4, 3);
    bgeo.setAttribute('position', bandPos);
    bgeo.setAttribute('color', bandCol);
    bgeo.setIndex(this.bandIndex);
    bgeo.setDrawRange(0, 0);
    const bands = new THREE.Mesh(bgeo, this.mat);
    bands.frustumCulled = false;
    bands.renderOrder = 2;
    // 島の手前と奥の端（帯1本につき線分2本）
    const blgeo = new THREE.BufferGeometry();
    const bandLinePos = dyn(BANDS * 4, 3);
    const bandLineCol = dyn(BANDS * 4, 4);
    blgeo.setAttribute('position', bandLinePos);
    blgeo.setAttribute('color', bandLineCol);
    blgeo.setDrawRange(0, 0);
    const bandLine = new THREE.LineSegments(blgeo, this.lineMat);
    bandLine.frustumCulled = false;
    bandLine.renderOrder = 3;
    this.group.add(mesh, line, bands, bandLine);
    return { mesh, pos, col, line, linePos, lineCol, bands, bandPos, bandCol, bandLine, bandLinePos, bandLineCol };
  }

  /** player はプレイヤーの位置（平常の扇の濃さを決める）。無ければ平常の扇も同じ濃さで描く。 */
  update(cones: readonly ConeSnap[], player: { x: number; z: number } | null = null): void {
    const seen = new Set<string>();
    for (const c of cones) {
      if (c.poly.length < N * 2) continue;
      // 平常の扇の濃さ：遠い扇は描かない（seen に入れないので、下で隠れる）
      const emph = c.awareness === 'calm' && player ? calmEmphasis(coneDistance(c.poly, N, player.x, player.z)) : 1;
      if (emph <= 1e-3) continue;
      let v = this.cones.get(c.id);
      if (!v) {
        v = this.make();
        this.cones.set(c.id, v);
      }
      seen.add(c.id);
      v.mesh.visible = true;
      v.line.visible = true;
      const tone = TONES[c.awareness];
      const st = tone.style;
      const ex = c.poly[0];
      const ez = c.poly[1];
      const p = v.pos.array as Float32Array;
      const col = v.col.array as Float32Array;
      const lp = v.linePos.array as Float32Array;
      const lc = v.lineCol.array as Float32Array;
      for (let i = 0; i < N; i++) {
        const x = c.poly[i * 2];
        const z = c.poly[i * 2 + 1];
        p[i * 3] = x;
        p[i * 3 + 1] = Y;
        p[i * 3 + 2] = z;
        // 目から遠いほど薄く（距離に比例。扇の中を線形に補間しても、距離に比例した色みになる）
        const d = Math.hypot(x - ex, z - ez);
        writeTint(col, i, tone.tint, Math.min(1, tintAt(st, d) * emph));
        lp[i * 3] = x;
        lp[i * 3 + 1] = Y + 0.01;
        lp[i * 3 + 2] = z;
        writeLine(lc, i, tone.line, Math.min(1, lineAt(st, d) * emph));
      }
      // 縁の線は目に戻って閉じる
      lp[N * 3] = ex;
      lp[N * 3 + 1] = Y + 0.01;
      lp[N * 3 + 2] = ez;
      writeLine(lc, N, tone.line, Math.min(1, st.lineEye * emph));
      v.pos.needsUpdate = true;
      v.col.needsUpdate = true;
      v.linePos.needsUpdate = true;
      v.lineCol.needsUpdate = true;
      v.mesh.geometry.computeBoundingSphere();
      // 灯りの島の帯：塗りは同じ色み（遠くても読めるよう下限を持つ）、線は手前と奥の端だけ
      const nb = Math.min(BANDS, Math.floor(c.bands.length / 8));
      const bp = v.bandPos.array as Float32Array;
      const bc = v.bandCol.array as Float32Array;
      const blp = v.bandLinePos.array as Float32Array;
      const blc = v.bandLineCol.array as Float32Array;
      for (let b = 0; b < nb; b++) {
        for (let k = 0; k < 4; k++) {
          const x = c.bands[b * 8 + k * 2];
          const z = c.bands[b * 8 + k * 2 + 1];
          const o = b * 4 + k;
          bp[o * 3] = x;
          bp[o * 3 + 1] = Y;
          bp[o * 3 + 2] = z;
          const d = Math.hypot(x - ex, z - ez);
          writeTint(bc, o, tone.tint, Math.min(1, tintAt(st, d, st.tintIsland) * emph));
          // 線分：手前（左→右）と奥（右→左）。帯の頂点の順がそのまま 2 本の線分になる
          blp[o * 3] = x;
          blp[o * 3 + 1] = Y + 0.01;
          blp[o * 3 + 2] = z;
          writeLine(blc, o, tone.line, Math.min(1, Math.max(st.lineIsland, lineAt(st, d)) * emph));
        }
      }
      v.bands.visible = nb > 0;
      v.bandLine.visible = nb > 0;
      v.bands.geometry.setDrawRange(0, nb * 6);
      v.bandLine.geometry.setDrawRange(0, nb * 4);
      if (nb > 0) {
        v.bandPos.needsUpdate = true;
        v.bandCol.needsUpdate = true;
        v.bandLinePos.needsUpdate = true;
        v.bandLineCol.needsUpdate = true;
      }
    }
    for (const [id, v] of this.cones) {
      if (seen.has(id)) continue;
      v.mesh.visible = false;
      v.line.visible = false;
      v.bands.visible = false;
      v.bandLine.visible = false;
    }
  }

  setVisible(on: boolean): void {
    this.group.visible = on;
  }

  dispose(): void {
    for (const v of this.cones.values()) {
      v.mesh.geometry.dispose();
      v.line.geometry.dispose();
      v.bands.geometry.dispose();
      v.bandLine.geometry.dispose();
    }
    this.mat.dispose();
    this.lineMat.dispose();
    this.group.removeFromParent();
  }
}
