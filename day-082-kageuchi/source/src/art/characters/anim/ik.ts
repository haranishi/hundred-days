// OWNER: chars-art
// 2関節の IK（腿と脛、上腕と前腕）。重み1で解いてから、呼ぶ側が関節の回転を重みで球面補間する
// （目標の位置を途中に置く方式だと、伸び切る付近で肘や膝の曲がる面が裏返るため）。
// 骨は休みの姿勢で -Y の向きに伸びている。曲がる面は「根元→目標」と「ポール（膝や肘を向けたい向き）」で決める。
import { Matrix4, Quaternion, Vector3 } from 'three';

const _d = new Vector3();
const _pole = new Vector3();
const _end = new Vector3();
const _dir = new Vector3();
const _front = new Vector3();
const _bx = new Vector3();
const _by = new Vector3();
const _bz = new Vector3();
const _m = new Matrix4();
const _inv = new Quaternion();

export interface TwoBoneOut {
  /** 1本目（腿・上腕）の base から見た回転。 */
  gA: Quaternion;
  /** 2本目（脛・前腕）の base から見た回転。 */
  gB: Quaternion;
  /** 関節（膝・肘）の位置。 */
  joint: Vector3;
  /** 届いた割合（距離 ÷ 長さの和）。1 に近いほど伸び切っている。 */
  reach: number;
}

/** -Y が骨の向き（dir）、+Z が front の向きになる回転を作る（X ＝ Y × Z）。dir と front は書き換えない。 */
export function basisQuat(dir: Vector3, front: Vector3, out: Quaternion): Quaternion {
  _by.copy(dir).normalize().multiplyScalar(-1);
  _bz.copy(front).addScaledVector(_by, -front.dot(_by));
  if (_bz.lengthSq() < 1e-8) _bz.set(0, 0, 1).addScaledVector(_by, -_by.z);
  _bz.normalize();
  _bx.crossVectors(_by, _bz).normalize();
  _m.makeBasis(_bx, _by, _bz);
  return out.setFromRotationMatrix(_m);
}

/**
 * root から target へ、長さ a と b の2本で届かせる。pole は関節を出したい向き。
 * poleIsFront=true（脚）：骨の +Z をポールの側にする（膝は前へ出て、脛は後ろへ曲がる）。
 * poleIsFront=false（腕）：骨の +Z をポールの反対にする（肘は後ろへ出て、前腕は前へ曲がる）。
 */
export function solveTwoBone(root: Vector3, a: number, b: number, target: Vector3, pole: Vector3, poleIsFront: boolean, out: TwoBoneOut, maxReach = 0.999): void {
  _d.subVectors(target, root);
  let dist = _d.length();
  out.reach = dist / (a + b);
  if (dist < 1e-6) _d.set(0, -1, 0);
  else _d.multiplyScalar(1 / dist);
  dist = Math.min((a + b) * maxReach, Math.max(Math.abs(a - b) + 1e-4, dist));
  // 曲がる面の中で、根元→目標に直交するポールの成分
  _pole.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_pole.lengthSq() < 1e-8) _pole.set(0, 0, poleIsFront ? 1 : -1).addScaledVector(_d, -_d.z * (poleIsFront ? 1 : -1));
  _pole.normalize();
  const cosA = Math.min(1, Math.max(-1, (a * a + dist * dist - b * b) / (2 * a * dist)));
  const sinA = Math.sqrt(1 - cosA * cosA);
  out.joint.copy(root).addScaledVector(_d, a * cosA).addScaledVector(_pole, a * sinA);
  _end.copy(root).addScaledVector(_d, dist);
  _front.copy(_pole).multiplyScalar(poleIsFront ? 1 : -1);
  _dir.subVectors(out.joint, root);
  basisQuat(_dir, _front, out.gA);
  _dir.subVectors(_end, out.joint);
  basisQuat(_dir, _front, out.gB);
}

/** 親の base から見た回転 parentG のもとで、base から見た回転 g を相対の回転にする。 */
export function toLocal(parentG: Quaternion, g: Quaternion, out: Quaternion): Quaternion {
  _inv.copy(parentG).invert();
  return out.multiplyQuaternions(_inv, g);
}

export function newTwoBoneOut(): TwoBoneOut {
  return { gA: new Quaternion(), gB: new Quaternion(), joint: new Vector3(), reach: 0 };
}
