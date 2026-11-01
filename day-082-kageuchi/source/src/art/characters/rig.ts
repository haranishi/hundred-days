// OWNER: chars-art
// 骨組み。5種の人物は同じ骨の並びを使い、長さ（Dims）と付属品の付け根だけが違う。
// 座標：モデルの正面は +Z、上は +Y、人物の左手は +X（右手は -X）。骨の休みの回転はすべて単位（回転なし）で、
// 位置だけで並べる。だから各骨の回転は、そのまま「休みの姿勢からどれだけ曲げたか」になる。
import { Bone, Vector3 } from 'three';

export const B = {
  base: 0,
  hips: 1,
  spine: 2,
  chest: 3,
  neck: 4,
  head: 5,
  shoulderL: 6,
  upperArmL: 7,
  foreArmL: 8,
  handL: 9,
  shoulderR: 10,
  upperArmR: 11,
  foreArmR: 12,
  handR: 13,
  thighL: 14,
  shinL: 15,
  footL: 16,
  thighR: 17,
  shinR: 18,
  footR: 19,
  /** 槍。根元（石突）が原点で、+Y が穂先の向き。腰や手ではなく base の子にして、毎コマ置き直す。 */
  spear: 20,
  /** 腰の鞘（腰の子）。 */
  sheath: 21,
  /** 鞘に納まった柄。抜いている間は大きさ0で隠す。 */
  hilt: 22,
  /** 抜いた刀身（右手の子）。+Z が切っ先の向き、-Z が柄頭。 */
  blade: 23,
  /** 提灯の竿（右手の子）。+Z が竿の先。 */
  lanternPole: 24,
  /** 提灯（base の子）。竿の先から吊るし、振り子で揺らす。 */
  lantern: 25,
  /** 信長の床几（base の子）。 */
  stool: 26,
  sleeveL: 27,
  sleeveR: 28,
  /** 頭巾の垂れ・茶筅髷・髪の束など、頭から下がる物（2節）。 */
  tailA: 29,
  tailB: 30,
  /** 羽織（胸の子）。 */
  cape: 31,
  /** 投げる小石（右手の子）。 */
  pebble: 32,
  sodeL: 33,
  sodeR: 34,
  /** 陣笠（頭の子）。倒れると頭から外れて地面に落ちる。 */
  hat: 35,
} as const;

export type BoneId = (typeof B)[keyof typeof B];
export const BONE_COUNT = 36;

export const PARENT: readonly number[] = [
  -1, // base
  B.base, // hips
  B.hips, // spine
  B.spine, // chest
  B.chest, // neck
  B.neck, // head
  B.chest, // shoulderL
  B.shoulderL,
  B.upperArmL,
  B.foreArmL,
  B.chest, // shoulderR
  B.shoulderR,
  B.upperArmR,
  B.foreArmR,
  B.hips, // thighL
  B.thighL,
  B.shinL,
  B.hips, // thighR
  B.thighR,
  B.shinR,
  B.base, // spear
  B.hips, // sheath
  B.sheath, // hilt
  B.handR, // blade
  B.handR, // lanternPole
  B.base, // lantern
  B.base, // stool
  B.foreArmL, // sleeveL
  B.foreArmR, // sleeveR
  B.head, // tailA
  B.tailA, // tailB
  B.chest, // cape
  B.handR, // pebble
  B.shoulderL, // sodeL
  B.shoulderR, // sodeR
  B.head, // hat
];

export const BONE_NAMES: readonly string[] = Object.keys(B);

/** 体の寸法（m）。骨の長さと付け根の位置だけを決める。太さは見た目の側（mesh/）が持つ。 */
export interface Dims {
  /** 足首の高さ（足の裏から）。 */
  ankleY: number;
  shin: number;
  thigh: number;
  /** 骨盤の中心から股関節までの横幅と下がり。 */
  hipX: number;
  hipDrop: number;
  /** 腰→腹、腹→胸、胸→首の付け根、首→頭の回転点。 */
  spine: number;
  chest: number;
  neck: number;
  head: number;
  /** 頭の回転点から頭の中心まで（上・前）。 */
  headCenterUp: number;
  headCenterFwd: number;
  /** 胸から鎖骨の付け根（横・上・前）と、鎖骨の付け根から肩の関節（横）。 */
  clavX: number;
  clavY: number;
  clavZ: number;
  armX: number;
  upperArm: number;
  foreArm: number;
  /** 手首から握りの中心まで（指の向き）と、掌の向きへのずれ。 */
  gripDown: number;
  gripIn: number;
  /** 足：足首の真下の点（足の裏の基準）から、かかとまでと、つま先まで。 */
  heel: number;
  toe: number;
}

export interface Attach {
  /** 鞘の口の位置（腰からの相対）。 */
  sheath: Vector3;
  /** 床几の位置（base からの相対）。 */
  stool: Vector3;
  /** 頭から垂れる物の付け根（頭からの相対）と、1節の長さ。 */
  tailA: Vector3;
  tailLen: number;
  /** 羽織の付け根（胸からの相対）。 */
  cape: Vector3;
  /** 長い袖の袋の付け根（前腕からの相対）。 */
  sleeve: Vector3;
  /** 袖（肩の板）の付け根（鎖骨からの相対、左。右は x を反転）。 */
  sode: Vector3;
  /** 提灯の竿の長さ（握りから竿の先まで）。 */
  poleLen: number;
}

/** 骨ごとの休みの位置（親からの相対）。 */
export function restOffsets(d: Dims, a: Attach): Vector3[] {
  const o: Vector3[] = [];
  for (let i = 0; i < BONE_COUNT; i++) o.push(new Vector3());
  const hipJointY = d.ankleY + d.shin + d.thigh;
  o[B.hips].set(0, hipJointY + d.hipDrop, 0);
  o[B.spine].set(0, d.spine, -0.004);
  o[B.chest].set(0, d.chest, 0);
  o[B.neck].set(0, d.neck, -0.006);
  o[B.head].set(0, d.head, 0.012);
  for (const side of [1, -1]) {
    const L = side > 0;
    o[L ? B.shoulderL : B.shoulderR].set(side * d.clavX, d.clavY, d.clavZ);
    o[L ? B.upperArmL : B.upperArmR].set(side * d.armX, -0.006, -0.004);
    o[L ? B.foreArmL : B.foreArmR].set(0, -d.upperArm, 0);
    o[L ? B.handL : B.handR].set(0, -d.foreArm, 0);
    o[L ? B.thighL : B.thighR].set(side * d.hipX, -d.hipDrop, 0);
    o[L ? B.shinL : B.shinR].set(0, -d.thigh, 0);
    o[L ? B.footL : B.footR].set(0, -d.shin, 0);
    o[L ? B.sleeveL : B.sleeveR].set(side * a.sleeve.x, a.sleeve.y, a.sleeve.z);
    o[L ? B.sodeL : B.sodeR].set(side * a.sode.x, a.sode.y, a.sode.z);
  }
  o[B.sheath].copy(a.sheath);
  o[B.hilt].set(0, 0, 0);
  // 握りの点：右手の掌の内側（右手では +X が体の中心側）へ少し、指の向き（-Y）へ gripDown
  o[B.blade].set(d.gripIn, -d.gripDown, 0);
  o[B.lanternPole].set(d.gripIn, -d.gripDown, 0);
  o[B.pebble].set(d.gripIn, -d.gripDown, 0.01);
  o[B.stool].copy(a.stool);
  o[B.tailA].copy(a.tailA);
  o[B.tailB].set(0, -a.tailLen, 0);
  o[B.cape].copy(a.cape);
  // 笠の骨は頭の頂の少し上（笠の中心）
  o[B.hat].set(0, d.headCenterUp + 0.04, d.headCenterFwd);
  // 提灯は base の子。休みの姿勢では、右手の握りから竿を前（+Z）へ水平に出した先に吊るす
  const tip = new Vector3();
  for (let i: number = B.lanternPole; i >= 0; i = PARENT[i]) tip.add(o[i]);
  o[B.lantern].copy(tip).add(new Vector3(0, 0, a.poleLen));
  return o;
}

/** 休みの姿勢での、base から見た各骨の位置（回転が全部単位なので、位置の足し算だけで決まる）。 */
export function restWorld(offsets: readonly Vector3[]): Vector3[] {
  const w: Vector3[] = [];
  for (let i = 0; i < BONE_COUNT; i++) {
    const p = PARENT[i];
    w.push(p < 0 ? offsets[i].clone() : w[p].clone().add(offsets[i]));
  }
  return w;
}

/** three の骨を親子に組んで返す。休みの位置は offsets。 */
export function createBones(offsets: readonly Vector3[]): Bone[] {
  const bones: Bone[] = [];
  for (let i = 0; i < BONE_COUNT; i++) {
    const b = new Bone();
    b.name = BONE_NAMES[i];
    b.position.copy(offsets[i]);
    bones.push(b);
  }
  for (let i = 1; i < BONE_COUNT; i++) bones[PARENT[i]].add(bones[i]);
  return bones;
}
