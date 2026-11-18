/**
 * スイカの狙いの線（round2 の3）。スイカを持っている間だけ、転がる向きに床へ点線を引く。
 * 線が立っているピンに届くなら赤、届かないなら灰色。線は棚・台・壁で止める（その先へは転がらないので）。
 * 判定は描画と切り離した aimPath（試験できる純粋な関数）。転がし方は systems/bowling.ts の roll と同じ前提
 * （足元から0.75m前に置いて、向いている方へまっすぐ）。
 */
import * as THREE from 'three';
import type { StoreLayout } from '../../shared/layout/store';
import { BOWLING, FALL } from '../../shared/rules/tuning';
import type { WorldStatic, WorldView } from '../../shared/view';
import { PALETTE } from './palette';

export interface AimBox {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface AimInput {
  from: { x: number; z: number };
  yaw: number;
  /** 転がるスイカを止める物（床から低い所にある当たり判定）の平面の外形 */
  boxes: readonly AimBox[];
  /** 立っているピンの位置 */
  pins: readonly { x: number; z: number }[];
  /** スイカの半径＋ピンの半径。線とピンの中心がこれより近ければ当たる */
  hitRadius: number;
  maxLen: number;
}

export interface AimResult {
  /** 線の長さ（物に当たって止まるまで） */
  len: number;
  /** まっすぐ当たるピンの数 */
  pins: number;
  /** 最初に当たるピンまでの距離（当たらなければ Infinity） */
  firstHit: number;
  /** いちばん奥で当たるピンまでの距離（当たらなければ -Infinity） */
  lastHit: number;
}

/** 向き yaw の線が箱に入る距離（入らなければ Infinity）。始めから中にいれば 0 */
function rayBox(fx: number, fz: number, dx: number, dz: number, b: AimBox): number {
  let t0 = 0;
  let t1 = Infinity;
  for (const [o, d, lo, hi] of [
    [fx, dx, b.x0, b.x1],
    [fz, dz, b.z0, b.z1],
  ] as const) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return Infinity;
      continue;
    }
    let a = (lo - o) / d;
    let c = (hi - o) / d;
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, c);
    if (t0 > t1) return Infinity;
  }
  return t0;
}

export function aimPath(a: AimInput): AimResult {
  const dx = Math.sin(a.yaw);
  const dz = Math.cos(a.yaw);
  let len = a.maxLen;
  for (const b of a.boxes) len = Math.min(len, rayBox(a.from.x, a.from.z, dx, dz, b));
  let pins = 0;
  let firstHit = Infinity;
  let lastHit = -Infinity;
  for (const p of a.pins) {
    const rx = p.x - a.from.x;
    const rz = p.z - a.from.z;
    const along = rx * dx + rz * dz;
    if (along < 0 || along > len + a.hitRadius) continue;
    if (Math.abs(rx * dz - rz * dx) >= a.hitRadius) continue;
    pins++;
    firstHit = Math.min(firstHit, along);
    lastHit = Math.max(lastHit, along);
  }
  return { len, pins, firstHit, lastHit };
}

/**
 * 線を止める物は、棚と壁（壁ぎわのケース）だけ（round3 の C10）。
 * 台・札・ワゴンなど小さな物や、床に落ちた商品・倒れたピンで線を切ると「当たらない」と出たのに倒れる、が起きる
 */
const AIM_BLOCKERS = new Set(['shelf', 'shelf-end', 'wall', 'freezer', 'freezer-standing', 'bottle-return']);

/** スイカを止める物：棚と壁のうち、床から0.45mより低い所まである当たり判定（スイカの直径は約0.53m） */
export function aimBoxes(layout: StoreLayout): AimBox[] {
  const out: AimBox[] = [];
  for (const f of layout.fixtures) {
    if (!AIM_BLOCKERS.has(f.kind)) continue;
    for (const c of f.colliders) {
      if (c.min.y > 0.45) continue;
      out.push({ x0: c.min.x, z0: c.min.z, x1: c.max.x, z1: c.max.z });
    }
  }
  const b = layout.bounds;
  const T = 1;
  out.push({ x0: b.x0 - T, z0: b.z0 - T, x1: b.x1 + T, z1: b.z0 }, { x0: b.x0 - T, z0: b.z1, x1: b.x1 + T, z1: b.z1 + T });
  out.push({ x0: b.x0 - T, z0: b.z0, x1: b.x0, z1: b.z1 }, { x0: b.x1, z0: b.z0, x1: b.x1 + T, z1: b.z1 });
  return out;
}

const COS_TILT = Math.cos((FALL.tiltDegrees * Math.PI) / 180);

/** ピンがまだ立っている（シミュレーションで「動いた」＝倒れた、になっていない）か */
export function pinStanding(tr: ArrayLike<number>, o: number, home: { x: number; y: number; z: number } | undefined): boolean {
  const qx = tr[o + 3]!;
  const qz = tr[o + 5]!;
  if (1 - 2 * (qx * qx + qz * qz) < COS_TILT) return false;
  if (!home) return true;
  return Math.hypot(tr[o]! - home.x, tr[o + 1]! - home.y, tr[o + 2]! - home.z) < FALL.moveDistance;
}

const DASH = 0.26;
const GAP = 0.24;
const MAX_LEN = 11;
const RELEASE_AHEAD = 0.75;
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);
const one = new THREE.Vector3(1, 1, 1);
const p3 = new THREE.Vector3();

export class AimView {
  readonly mesh: THREE.InstancedMesh;
  private readonly mat: THREE.MeshBasicMaterial;
  private readonly boxes: AimBox[];
  private readonly pinIds: number[];
  private readonly pinHomes: Map<number, { x: number; y: number; z: number }>;
  private readonly melonIds: Set<number>;
  private readonly hitRadius: number;
  private flow = 0;
  /** 試験・確かめ用：いまの線（出していなければ null） */
  last: (AimResult & { hit: boolean }) | null = null;

  constructor(layout: StoreLayout, world: WorldStatic) {
    this.boxes = aimBoxes(layout);
    this.pinIds = world.props.filter((p) => p.kind === 'pin').map((p) => p.id);
    this.pinHomes = new Map(world.props.filter((p) => p.kind === 'pin').map((p) => [p.id, p.home.pos]));
    this.melonIds = new Set(world.props.filter((p) => p.kind === 'watermelon').map((p) => p.id));
    const melon = world.props.find((p) => p.kind === 'watermelon');
    const pin = world.props.find((p) => p.kind === 'pin');
    this.hitRadius = (melon ? melon.size.x / 2 : 0.27) + (pin ? pin.size.x / 2 : 0.1);
    const geo = new THREE.PlaneGeometry(0.13, DASH);
    geo.rotateX(-Math.PI / 2);
    this.mat = new THREE.MeshBasicMaterial({ color: PALETTE.ink, transparent: true, opacity: 0.55, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, Math.ceil(MAX_LEN / (DASH + GAP)) + 1);
    this.mesh.name = 'aim';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.count = 0;
  }

  update(view: WorldView, mySlot: number, dt: number): void {
    const me = view.avatars.find((a) => a.slot === mySlot);
    if (!me || me.holding === null || !this.melonIds.has(me.holding) || me.ridingCart !== null || view.phase !== 'playing') {
      this.mesh.count = 0;
      this.last = null;
      return;
    }
    const tr = view.propTransforms;
    const pins: { x: number; z: number }[] = [];
    for (const id of this.pinIds) {
      if (view.propHidden[id]) continue;
      const o = id * 7;
      // 立っているピンだけ。数え方はシミュレーションの「動いた」と同じ（定位置から moveDistance 以上・tiltDegrees 以上の傾きは倒れた）
      if (!pinStanding(tr, o, this.pinHomes.get(id))) continue;
      pins.push({ x: tr[o]!, z: tr[o + 2]! });
    }
    const dx = Math.sin(me.yaw);
    const dz = Math.cos(me.yaw);
    const from = { x: me.pos.x + dx * RELEASE_AHEAD, z: me.pos.z + dz * RELEASE_AHEAD };
    const r = aimPath({ from, yaw: me.yaw, boxes: this.boxes, pins, hitRadius: this.hitRadius, maxLen: MAX_LEN });
    const hit = r.pins > 0;
    this.last = { ...r, hit };
    this.mat.color.set(hit ? PALETTE.red : PALETTE.ink);
    this.mat.opacity = hit ? 0.95 : 0.55;
    // 点線は転がる向きへ流す（どちらへ転がるかが一目で分かる）
    this.flow = (this.flow + dt * BOWLING.rollSpeed * 0.18) % (DASH + GAP);
    q.setFromAxisAngle(up, me.yaw);
    // 当たるなら、線はいちばん奥で当たるピンの少し先まで（転がしたスイカは、ピンの間をまっすぐ押し通る。round4 の F4）
    const end = hit ? Math.min(r.len, r.lastHit + 0.35) : r.len;
    let n = 0;
    for (let s = this.flow; s + DASH * 0.5 < end && n < this.mesh.instanceMatrix.count; s += DASH + GAP) {
      p3.set(from.x + dx * (s + DASH / 2), 0.03, from.z + dz * (s + DASH / 2));
      m4.compose(p3, q, one);
      this.mesh.setMatrixAt(n++, m4);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
