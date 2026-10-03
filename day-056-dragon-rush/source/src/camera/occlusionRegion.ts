// OWNER: camera
// r05-camera：網点で透かす範囲（画面の上）。怪獣の骨を画面に写した外接矩形と、照準の円の中だけを透かす（city/damageGlsl.ts）。
// 体験の採点の TOP5「網点を体のすぐ周りに絞る」：r04 までは間の建物を1棟まるごと同じ割合で透かし、焔角の地上で画面の最大85%が網目越しになった。
// 骨の位置は前のコマの姿勢（描画が行列を更新した後の値）。1コマ遅れても、体の厚み（bodyRadius）と縁の幅で包む。
// r06-camera2：透かし方を3つ持つ（CAMERA_OCCLUSION.style）。window＝今の四角い窓、spread＝カメラのすぐ前の大きな壁では窓を壁全体へ
// なだらかに広げる（追うカメラが広げる度合いを決める）、outline＝四角を使わず、怪獣の形（骨をつないだ太さのある線と翼の膜の三角形）だけを
// 透かして、壁の上に怪獣の輪郭を描く。形は画面の座標（横は縦横比を掛けた NDC）で、壊れ方の表の最後の行に書く（damageTexture.ts）。
import { Vector3, type Object3D, type PerspectiveCamera } from 'three';
import { CAMERA_OCCLUSION as O } from '../config/camera';

/** 画面の上の範囲（NDC：x は横 -1〜1、y は縦 -1〜1）。valid が false なら範囲を使わない（建物ごと透かす） */
export interface ScreenBox {
  cx: number;
  cy: number;
  hx: number;
  hy: number;
  valid: boolean;
}

export type OcclusionStyle = 'window' | 'spread' | 'outline' | 'outlineSpread';

/** 怪獣の形の書き込み先の大きさ（4つ組の数）：見出し1・太さのある線 MAX_SEGS×2・三角形 MAX_TRIS×2・形の外接矩形1 */
export const SIL_MAX_SEGS = O.silhouetteMax.segs;
export const SIL_MAX_TRIS = O.silhouetteMax.tris;
/** 形の外接矩形（線の太さを含む。x0, y0, x1, y1）を書く4つ組の位置。シェーダーはこの矩形から遠い画素で線の距離の計算を省く */
export const SIL_BOX_TEXEL = 1 + SIL_MAX_SEGS * 2 + SIL_MAX_TRIS * 2;
export const SIL_TEXELS = SIL_BOX_TEXEL + 1;

const _v = new Vector3();
const _f = new Vector3();
/** 外接矩形を切る画面の端（NDC。縁のなだらかさの分だけ外まで） */
const SCREEN_CLIP = 1.05;

/** 骨の名前 → 太さ（体の半径に対する割合）。r06-camera2：怪獣の形を透かす（outline）ための目安の太さ */
function boneShare(name: string): number {
  if (/^(body|pelvis|spine|chest)$/.test(name)) return O.silhouette.torso;
  if (name.startsWith('neck_')) return O.silhouette.neck;
  if (name === 'head') return O.silhouette.head;
  if (name === 'jaw') return O.silhouette.jaw;
  if (name.startsWith('tail_')) {
    const k = Math.min(1, Math.max(0, (Number(name.slice(5)) - 1) / 9));
    return O.silhouette.tailRoot + (O.silhouette.tailTip - O.silhouette.tailRoot) * k;
  }
  if (/^(thigh|scapula|upperarm)_/.test(name)) return O.silhouette.limbRoot;
  if (/^(shin|forearm)_/.test(name)) return O.silhouette.limbMid;
  if (/^(foot|toe|hand|finger)_/.test(name)) return O.silhouette.limbTip;
  if (name.startsWith('wing_')) return O.silhouette.wing;
  return O.silhouette.limbMid;
}

/** 翼の膜の三角形（骨の名前の3つ組。無い骨の三角形は使わない）。指の先は、最後の骨の頭から親の骨の向きへ同じ長さだけ延ばす */
const WING_TRIS: [string, string, string][] = [];
for (const s of ['L', 'R']) {
  WING_TRIS.push([`wing_arm_${s}`, `wing_hand_${s}`, `tip:wing_f4b_${s}`]);
  WING_TRIS.push([`wing_arm_${s}`, `wing_hand_${s}`, `tip:wing_f3b_${s}`]);
  WING_TRIS.push([`wing_hand_${s}`, `tip:wing_f1b_${s}`, `tip:wing_f2b_${s}`]);
  WING_TRIS.push([`wing_hand_${s}`, `tip:wing_f2b_${s}`, `tip:wing_f3b_${s}`]);
  WING_TRIS.push([`wing_hand_${s}`, `tip:wing_f3b_${s}`, `tip:wing_f4b_${s}`]);
}

export class OcclusionRegion {
  /** 骨のワールド座標（前のコマの姿勢） */
  private points: Vector3[] = [];
  /** 竜へ光線を引く点：体の端（左右・前後・上）の骨 */
  readonly rayPoints: Vector3[] = [new Vector3(), new Vector3(), new Vector3(), new Vector3(), new Vector3()];
  readonly box: ScreenBox = { cx: 0, cy: 0, hx: 0, hy: 0, valid: false };
  /** r06-camera2：透かし方（調べもの用に camera.userData.occlusionStyle で差し替えられる）と、怪獣の形（outline で使う） */
  style: OcclusionStyle = O.style;
  readonly silhouette = new Float32Array(SIL_TEXELS * 4);
  private root: Object3D | null = null;
  private bones: Object3D[] = [];
  /** 骨ごとの親の骨の番号（無ければ -1）と太さの割合、翼の三角形（骨の番号。指の先は負の番号 −1−i で「骨 i の先」） */
  private parents: number[] = [];
  private shares: number[] = [];
  private tris: [number, number, number][] = [];
  private bodyRadius = 9;
  private readonly ndc: Float32Array[] = [];

  /** 骨のワールド座標と、体の端の点を集める（yaw は体の向き。前 = (sin yaw, 0, cos yaw)、bodyRadius は体の当たりの半径 m）。 */
  gather(root: Object3D, yaw: number, bodyRadius = 9): void {
    this.bodyRadius = bodyRadius;
    if (root !== this.root) {
      this.root = root;
      this.bones = [];
      root.traverse((o) => {
        if ((o as Object3D & { isBone?: boolean }).isBone) this.bones.push(o);
      });
      this.points = this.bones.map(() => new Vector3());
      this.parents = this.bones.map((b) => (b.parent ? this.bones.indexOf(b.parent) : -1));
      this.shares = this.bones.map((b) => boneShare(b.name));
      const byName = new Map(this.bones.map((b, i) => [b.name, i]));
      const ref = (n: string): number | null => {
        if (n.startsWith('tip:')) {
          const i = byName.get(n.slice(4));
          return i === undefined || this.parents[i] < 0 ? null : -1 - i;
        }
        return byName.get(n) ?? null;
      };
      this.tris = [];
      for (const t of WING_TRIS) {
        const r = t.map(ref);
        if (r.every((x) => x !== null)) this.tris.push(r as [number, number, number]);
      }
    }
    const n = this.bones.length;
    if (n === 0) return;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const ox = root.position.x;
    const oz = root.position.z;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let maxY = -Infinity;
    const pick = [0, 0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      const p = this.points[i].setFromMatrixPosition(this.bones[i].matrixWorld);
      const dx = p.x - ox;
      const dz = p.z - oz;
      // 体の右（-x）・左・前・後ろ（局所の x は左が正）
      const side = dx * fz - dz * fx;
      const fwd = dx * fx + dz * fz;
      if (side < minX) {
        minX = side;
        pick[0] = i;
      }
      if (side > maxX) {
        maxX = side;
        pick[1] = i;
      }
      if (fwd < minZ) {
        minZ = fwd;
        pick[2] = i;
      }
      if (fwd > maxZ) {
        maxZ = fwd;
        pick[3] = i;
      }
      if (p.y > maxY) {
        maxY = p.y;
        pick[4] = i;
      }
    }
    for (let k = 0; k < 5; k++) this.rayPoints[k].copy(this.points[pick[k]]);
  }

  /** 骨を画面に写し、外接矩形を体の厚みだけ広げる（大きさは上限で抑える）。前に1つも無ければ使わない。outline なら怪獣の形も作る。 */
  project(camera: PerspectiveCamera): void {
    const b = this.box;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let nearest = Infinity;
    const cam = camera.position;
    for (const p of this.points) {
      const d = p.distanceTo(cam);
      _v.copy(p).project(camera);
      if (_v.z > 1 || _v.z < -1) continue;
      nearest = Math.min(nearest, d);
      x0 = Math.min(x0, _v.x);
      x1 = Math.max(x1, _v.x);
      y0 = Math.min(y0, _v.y);
      y1 = Math.max(y1, _v.y);
    }
    const override = camera.userData.occlusionStyle as OcclusionStyle | undefined;
    this.style = override ?? O.style;
    if (!(x1 >= x0) || !Number.isFinite(nearest)) {
      b.valid = false;
      this.silhouette[0] = 0;
      this.silhouette[1] = 0;
      return;
    }
    // r06-camera2：外接矩形は画面の中（少し外まで）に切ってから中心を取る。焔角の寄せた構図では尾と脚が画面の下の外まで伸び、
    // 切らないと矩形の中心が画面の下の外（NDC の y −2.3）に出て、窓（window・spread）が写っている体にかからなかった
    x0 = Math.max(-SCREEN_CLIP, Math.min(SCREEN_CLIP, x0));
    x1 = Math.max(-SCREEN_CLIP, Math.min(SCREEN_CLIP, x1));
    y0 = Math.max(-SCREEN_CLIP, Math.min(SCREEN_CLIP, y0));
    y1 = Math.max(-SCREEN_CLIP, Math.min(SCREEN_CLIP, y1));
    // 体の厚み：いちばん近い骨の距離で、bodyRadius が画面の高さの半分を 1 とした単位でどれだけか
    const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
    const my = O.bodyRadius / Math.max(1, nearest) / tanHalf;
    const mx = my / camera.aspect;
    b.cx = (x0 + x1) / 2;
    b.cy = (y0 + y1) / 2;
    b.hx = Math.min(O.maxHalfX, (x1 - x0) / 2 + mx);
    b.hy = Math.min(O.maxHalfY, (y1 - y0) / 2 + my);
    b.valid = true;
    if (this.style === 'outline' || this.style === 'outlineSpread') this.buildSilhouette(camera, tanHalf);
    else {
      this.silhouette[0] = 0;
      this.silhouette[1] = 0;
    }
  }

  /**
   * r06-camera2：怪獣の形を画面の座標に写す。骨とその親をつないだ太さのある線（太さは骨の名前の割合 × 体の半径 ＋ 縁の余白、
   * 奥行きで画面の大きさに直す）と、翼の膜の三角形。座標は (NDC の x × 縦横比, NDC の y)、太さも同じ単位（画面の高さの半分が 1）。
   */
  private buildSilhouette(camera: PerspectiveCamera, tanHalf: number): void {
    const n = this.points.length;
    while (this.ndc.length < n) this.ndc.push(new Float32Array(3));
    camera.getWorldDirection(_f);
    const cam = camera.position;
    const aspect = camera.aspect;
    for (let i = 0; i < n; i++) {
      const p = this.points[i];
      const e = this.ndc[i];
      const depth = (p.x - cam.x) * _f.x + (p.y - cam.y) * _f.y + (p.z - cam.z) * _f.z;
      _v.copy(p).project(camera);
      e[0] = _v.x * aspect;
      e[1] = _v.y;
      e[2] = depth;
    }
    const s = this.silhouette;
    const unit = (depth: number): number => 1 / (Math.max(1, depth) * tanHalf);
    let bx0 = Infinity;
    let by0 = Infinity;
    let bx1 = -Infinity;
    let by1 = -Infinity;
    const grow = (x: number, y: number, r: number): void => {
      bx0 = Math.min(bx0, x - r);
      by0 = Math.min(by0, y - r);
      bx1 = Math.max(bx1, x + r);
      by1 = Math.max(by1, y + r);
    };
    let segs = 0;
    for (let i = 0; i < n && segs < SIL_MAX_SEGS; i++) {
      const j = this.parents[i];
      if (j === undefined || j < 0) continue;
      const a = this.ndc[i];
      const c = this.ndc[j];
      if (a[2] < 1 || c[2] < 1) continue;
      const r0 = (this.shares[i] * this.bodyRadius + O.silhouette.margin) * unit(a[2]);
      const r1 = (this.shares[j] * this.bodyRadius + O.silhouette.margin) * unit(c[2]);
      const o = (1 + segs * 2) * 4;
      s[o] = a[0];
      s[o + 1] = a[1];
      s[o + 2] = c[0];
      s[o + 3] = c[1];
      s[o + 4] = r0;
      s[o + 5] = r1;
      s[o + 6] = 0;
      s[o + 7] = 0;
      grow(a[0], a[1], r0);
      grow(c[0], c[1], r1);
      segs++;
    }
    let tris = 0;
    const at = (k: number, out: number[]): boolean => {
      if (k >= 0) {
        const e = this.ndc[k];
        if (e[2] < 1) return false;
        out[0] = e[0];
        out[1] = e[1];
        return true;
      }
      // 骨 i の先：骨の頭から、親の骨の頭からの向きへ同じ長さだけ延ばす（指の骨の長さの目安）
      const i = -1 - k;
      const pi = this.points[i];
      const pp = this.points[this.parents[i]];
      _v.set(pi.x * 2 - pp.x, pi.y * 2 - pp.y, pi.z * 2 - pp.z);
      const depth = (_v.x - cam.x) * _f.x + (_v.y - cam.y) * _f.y + (_v.z - cam.z) * _f.z;
      if (depth < 1) return false;
      _v.project(camera);
      out[0] = _v.x * aspect;
      out[1] = _v.y;
      return true;
    };
    const A = [0, 0];
    const B = [0, 0];
    const C = [0, 0];
    const base = (1 + SIL_MAX_SEGS * 2) * 4;
    for (const t of this.tris) {
      if (tris >= SIL_MAX_TRIS) break;
      if (!at(t[0], A) || !at(t[1], B) || !at(t[2], C)) continue;
      const o = base + tris * 8;
      s[o] = A[0];
      s[o + 1] = A[1];
      s[o + 2] = B[0];
      s[o + 3] = B[1];
      s[o + 4] = C[0];
      s[o + 5] = C[1];
      s[o + 6] = 0;
      s[o + 7] = 0;
      grow(A[0], A[1], 0);
      grow(B[0], B[1], 0);
      grow(C[0], C[1], 0);
      tris++;
    }
    s[0] = segs;
    s[1] = tris;
    s[2] = 0;
    s[3] = 0;
    // 形の外接矩形（形が無ければ画面のずっと外。シェーダーはここからの距離が輪郭の幅より遠い画素で、線と三角形の距離の計算を省く）
    const ob = SIL_BOX_TEXEL * 4;
    const empty = !(bx1 >= bx0);
    s[ob] = empty ? 1e3 : bx0;
    s[ob + 1] = empty ? 1e3 : by0;
    s[ob + 2] = empty ? 1e3 : bx1;
    s[ob + 3] = empty ? 1e3 : by1;
  }
}

/**
 * 網点を透かす度合い（0〜1）を、画面の点 (x, y)（NDC）で求める。外壁のシェーダー（city/damageGlsl.ts の dmgOccluderMask）と同じ式：
 * 体の外接矩形の中と照準の円（半径 aimRadius）の中は 1、外へ soft の幅でなだらかに 0 へ。距離は画面の高さの半分を 1 とする単位で、
 * 横は縦横比 aspect を掛ける。r06-camera2：spread（0〜1）は窓を壁全体へ広げる度合い（外接矩形からの距離 spreadSoft で spreadFloor まで下がる）。
 * テストと調べもの用（描画はシェーダーが同じ式で行う）。
 */
export function occlusionMask(x: number, y: number, box: ScreenBox, aspect: number, aimRadius = O.aimRadius, soft = O.soft, spread = 0): number {
  if (!box.valid) return 1;
  const qx = Math.max(0, (Math.abs(x - box.cx) - box.hx) * aspect);
  const qy = Math.max(0, Math.abs(y - box.cy) - box.hy);
  const dBox = Math.hypot(qx, qy);
  const dAim = Math.hypot(x * aspect, y) - aimRadius;
  const t = Math.min(1, Math.max(0, Math.min(dBox, dAim) / soft));
  const m = 1 - t * t * (3 - 2 * t);
  if (spread <= 0) return m;
  const k = Math.min(1, dBox / O.spreadSoft);
  const wide = O.spreadFloor + (1 - O.spreadFloor) * (1 - k * k * (3 - 2 * k));
  return Math.max(m, wide * Math.min(1, spread));
}

/** r06-camera2：太さのある線（a → b、太さ ra → rb）と点 p の距離（形の縁で 0、中で負）。シェーダーの occSegDist と同じ式。 */
export function capsuleDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number, ra: number, rb: number): number {
  const ex = bx - ax;
  const ey = by - ay;
  const len2 = ex * ex + ey * ey;
  const t = len2 > 1e-12 ? Math.min(1, Math.max(0, ((px - ax) * ex + (py - ay) * ey) / len2)) : 0;
  return Math.hypot(px - ax - ex * t, py - ay - ey * t) - (ra + (rb - ra) * t);
}
