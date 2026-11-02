// OWNER: chars-art
// 姿勢の入れ物：骨ごとの相対の回転（四元数）と位置。層ごとに1つ持ち、重みで混ぜてから骨へ書く。
// 計算はすべて base の座標（人物の根の中、見た目の向きの補正をかける前）で行う。毎コマ新しい物を作らない。
import { Euler, Quaternion, Vector3 } from 'three';
import { BONE_COUNT, PARENT } from '../rig';
import { DEG } from '../util/math';

export class Pose {
  readonly q: Quaternion[] = [];
  readonly p: Vector3[] = [];

  constructor(readonly rest: readonly Vector3[]) {
    for (let i = 0; i < BONE_COUNT; i++) {
      this.q.push(new Quaternion());
      this.p.push(rest[i].clone());
    }
  }

  reset(): this {
    for (let i = 0; i < BONE_COUNT; i++) {
      this.q[i].identity();
      this.p[i].copy(this.rest[i]);
    }
    return this;
  }

  copy(o: Pose): this {
    for (let i = 0; i < BONE_COUNT; i++) {
      this.q[i].copy(o.q[i]);
      this.p[i].copy(o.p[i]);
    }
    return this;
  }
}

const _e = new Euler();

/** 度で書いた回転を四元数に（順は骨の種類で使い分ける：手足は XZY、体幹と頭は YXZ）。 */
export function setDeg(q: Quaternion, x: number, y: number, z: number, order: 'XZY' | 'YXZ' | 'XYZ' = 'XZY'): Quaternion {
  _e.set(x * DEG, y * DEG, z * DEG, order);
  return q.setFromEuler(_e);
}

/** ラジアンで書いた回転を四元数に。 */
export function setRad(q: Quaternion, x: number, y: number, z: number, order: 'XZY' | 'YXZ' | 'XYZ' = 'XZY'): Quaternion {
  _e.set(x, y, z, order);
  return q.setFromEuler(_e);
}

/** 骨ごとの、base から見た回転と位置（順運動学の結果）。 */
export class Globals {
  readonly q: Quaternion[] = [];
  readonly p: Vector3[] = [];

  constructor() {
    for (let i = 0; i < BONE_COUNT; i++) {
      this.q.push(new Quaternion());
      this.p.push(new Vector3());
    }
  }

  /** 姿勢から全部の骨を計算する（親は必ず子より番号が小さい）。 */
  compute(pose: Pose): void {
    this.q[0].copy(pose.q[0]);
    this.p[0].copy(pose.p[0]);
    for (let i = 1; i < BONE_COUNT; i++) this.computeOne(pose, i);
  }

  /** 1本の骨だけを、親の結果から計算し直す。 */
  computeOne(pose: Pose, i: number): void {
    const pa = PARENT[i];
    this.p[i].copy(pose.p[i]).applyQuaternion(this.q[pa]).add(this.p[pa]);
    this.q[i].multiplyQuaternions(this.q[pa], pose.q[i]);
  }

  /** i とその子孫を計算し直す（IK で手足を変えた後）。 */
  computeFrom(pose: Pose, i: number): void {
    this.computeOne(pose, i);
    for (let k = i + 1; k < BONE_COUNT; k++) {
      // 子孫かどうかを親をたどって調べる（骨は 35 本なので十分速い）
      let a = PARENT[k];
      while (a > i) a = PARENT[a];
      if (a === i) this.computeOne(pose, k);
    }
  }
}

/** 層を重みで混ぜる。四元数は内積の符号で半球をそろえてから足し、最後に正規化する。mask は骨ごとの重みの倍率。 */
export function blendPoses(out: Pose, layers: readonly Pose[], weights: readonly number[], masks: readonly (Float32Array | null)[]): void {
  for (let i = 0; i < BONE_COUNT; i++) {
    let wsum = 0;
    let qx = 0;
    let qy = 0;
    let qz = 0;
    let qw = 0;
    let px = 0;
    let py = 0;
    let pz = 0;
    let first: Quaternion | null = null;
    for (let l = 0; l < layers.length; l++) {
      const m = masks[l];
      const w = weights[l] * (m ? m[i] : 1);
      if (w <= 1e-5) continue;
      const q = layers[l].q[i];
      if (!first) first = q;
      const s = first.x * q.x + first.y * q.y + first.z * q.z + first.w * q.w < 0 ? -w : w;
      qx += q.x * s;
      qy += q.y * s;
      qz += q.z * s;
      qw += q.w * s;
      const p = layers[l].p[i];
      px += p.x * w;
      py += p.y * w;
      pz += p.z * w;
      wsum += w;
    }
    if (wsum <= 1e-5) {
      out.q[i].identity();
      out.p[i].copy(out.rest[i]);
      continue;
    }
    out.q[i].set(qx, qy, qz, qw).normalize();
    out.p[i].set(px / wsum, py / wsum, pz / wsum);
  }
}
