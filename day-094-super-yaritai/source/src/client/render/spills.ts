/**
 * こぼれた飲み物の水たまり（round3 D4：荒らした跡が遠目でもわかるように）。描画だけで、当たり判定も点もない。
 * ボトル・紙パックが棚から床へ落ちたら、落ちた所に水たまりを1つ作り、1秒ほどで広げる。水たまりは試合の終わりまで残す
 * （その後に商品を蹴っても、こぼれた場所は動かない）。全部を InstancedMesh 1つで描く（描画は1回）。
 * 色は商品の見た目（productLook.ts の spill）から：水＝水色、牛乳＝白、いちご牛乳＝ピンク、ケチャップ＝赤、洗剤＝ボトルの色。
 */
import * as THREE from 'three';
import type { WorldStatic, WorldView } from '../../shared/view';
import { spillColorOf } from './productLook';

/** 一度に出せる水たまりの数 */
export const MAX_SPILLS = 64;
/** 広がりきるまでの秒数 */
const GROW_TIME = 1.1;

export interface SpillRule {
  /** 棚の上（家の高さがこれより上）に置かれていた物だけがこぼれる */
  shelfAbove: number;
  /** 床に落ちた：位置の高さがこれより下 */
  floorBelow: number;
  /** 家からこれだけ離れたら落ちた */
  moved: number;
}
export const SPILL_RULE: SpillRule = { shelfAbove: 0.25, floorBelow: 0.22, moved: 0.5 };

/** その商品が今、床にこぼれたか（試験できるよう、形を知らない純粋な関数にしておく） */
export function hasSpilled(home: { x: number; y: number; z: number }, pos: { x: number; y: number; z: number }, rule: SpillRule = SPILL_RULE): boolean {
  if (home.y < rule.shelfAbove) return false;
  if (pos.y > rule.floorBelow) return false;
  return Math.hypot(pos.x - home.x, pos.z - home.z) >= rule.moved;
}

/** 水たまりの大きさ（半径 m）。大きな入れ物ほど広い */
export function spillRadius(height: number): number {
  return Math.min(0.72, Math.max(0.38, 0.28 + height * 0.7));
}

/** でこぼこの丸（中心が明るく、縁が少し濃い。片側に白い照り）。半径1、床に寝かせた形 */
function blobGeometry(): THREE.BufferGeometry {
  const N = 28;
  const rad = (a: number): number => 1 + 0.16 * Math.sin(3 * a + 0.7) + 0.08 * Math.sin(5 * a + 2.1);
  const pos: number[] = [];
  const col: number[] = [];
  const push = (x: number, z: number, c: number): void => {
    pos.push(x, 0, z);
    col.push(c, c, c);
  };
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2;
    const a1 = ((i + 1) / N) * Math.PI * 2;
    const r0 = rad(a0);
    const r1 = rad(a1);
    // 中身（扇）
    push(0, 0, 1);
    push(Math.cos(a1) * r1 * 0.9, Math.sin(a1) * r1 * 0.9, 0.95);
    push(Math.cos(a0) * r0 * 0.9, Math.sin(a0) * r0 * 0.9, 0.95);
    // 縁（少し濃い帯）
    const ax = Math.cos(a0), az = Math.sin(a0), bx = Math.cos(a1), bz = Math.sin(a1);
    push(ax * r0 * 0.9, az * r0 * 0.9, 0.95);
    push(bx * r1 * 0.9, bz * r1 * 0.9, 0.95);
    push(bx * r1, bz * r1, 0.72);
    push(ax * r0 * 0.9, az * r0 * 0.9, 0.95);
    push(bx * r1, bz * r1, 0.72);
    push(ax * r0, az * r0, 0.72);
  }
  // 照り（白く見えるよう明るさを1より大きくする。色を掛けても白に近く出る）
  const hx = -0.32, hz = -0.28;
  for (let i = 0; i < 12; i++) {
    const a0 = (i / 12) * Math.PI * 2;
    const a1 = ((i + 1) / 12) * Math.PI * 2;
    pos.push(hx, 0.001, hz, hx + Math.cos(a1) * 0.22, 0.001, hz + Math.sin(a1) * 0.1, hx + Math.cos(a0) * 0.22, 0.001, hz + Math.sin(a0) * 0.1);
    col.push(1.7, 1.7, 1.7, 1.7, 1.7, 1.7, 1.7, 1.7, 1.7);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  // 三角形はどれも上から見て表（反時計回り）。法線は真上
  const n = new Float32Array(pos.length);
  for (let i = 1; i < n.length; i += 3) n[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  return g;
}

interface Spill {
  x: number;
  z: number;
  r: number;
  yaw: number;
  born: number;
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const p = new THREE.Vector3();
const s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class SpillsView {
  readonly mesh: THREE.InstancedMesh;
  private readonly candidates: { id: number; color: THREE.Color; r: number; home: { x: number; y: number; z: number } }[] = [];
  private readonly done = new Set<number>();
  private readonly spills: Spill[] = [];
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.MeshLambertMaterial;

  constructor(world: WorldStatic) {
    for (const prop of world.props) {
      const c = spillColorOf(prop, world.seed);
      if (!c) continue;
      this.candidates.push({ id: prop.id, color: new THREE.Color(c), r: spillRadius(prop.size.y), home: prop.home.pos });
    }
    this.geometry = blobGeometry();
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.86, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, MAX_SPILLS);
    this.mesh.name = 'spills';
    this.mesh.count = 0;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    // 床の印（renderOrder 1）より先に描く
    this.mesh.renderOrder = 0;
    // 色の入れ物を最初に作っておく（あとから作ると材質を作り直すことになる）
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  }

  update(view: WorldView): void {
    const now = view.phase === 'playing' ? view.duration - view.timeLeft : view.phase === 'ended' ? view.duration : 0;
    const tr = view.propTransforms;
    if (this.spills.length < MAX_SPILLS) {
      for (const c of this.candidates) {
        if (this.done.has(c.id) || view.propHidden[c.id]) continue;
        const o = c.id * 7;
        const at = { x: tr[o]!, y: tr[o + 1]!, z: tr[o + 2]! };
        if (!hasSpilled(c.home, at)) continue;
        this.done.add(c.id);
        // 入れ物が水たまりの縁に来るよう、少しずらす（向きは番号から決める＝主と参加者で同じ）
        const a = (c.id * 2.399) % (Math.PI * 2);
        this.spills.push({ x: at.x + Math.cos(a) * c.r * 0.35, z: at.z + Math.sin(a) * c.r * 0.35, r: c.r, yaw: a, born: now });
        this.mesh.setColorAt(this.spills.length - 1, c.color);
        if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
        if (this.spills.length >= MAX_SPILLS) break;
      }
    }
    this.spills.forEach((sp, i) => {
      const k = Math.min(1, Math.max(0, (now - sp.born) / GROW_TIME));
      // はじめは速く、最後はゆっくり広がる
      const r = sp.r * (0.25 + 0.75 * (1 - (1 - k) * (1 - k)));
      q.setFromAxisAngle(UP, sp.yaw);
      m4.compose(p.set(sp.x, 0.006, sp.z), q, s.set(r, 1, r));
      this.mesh.setMatrixAt(i, m4);
    });
    this.mesh.count = this.spills.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}
