import * as THREE from '../vendor/three.js';

const one = new THREE.Vector3(1, 1, 1);
const position = new THREE.Vector3(), center = new THREE.Vector3(), axis = new THREE.Vector3();
const translation = new THREE.Vector3(), rotation = new THREE.Quaternion(), inverse = new THREE.Quaternion();
const axes = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

/** 魚の箱の中心を盤の中央に置き、傾けた箱の一番低い角を盤面に合わせます。 */
export function groundPoseMatrix(pose, bounds, boardTop, out = new THREE.Matrix4()) {
  out.makeRotationFromQuaternion(rotation.fromArray(pose.q));
  const { min, max } = bounds, e = out.elements;
  center.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2).applyMatrix4(out);
  const halfHeight = (Math.abs(e[1]) * (max[0] - min[0]) + Math.abs(e[5]) * (max[1] - min[1])
    + Math.abs(e[9]) * (max[2] - min[2])) / 2;
  return out.setPosition(pose.p[0] - center.x, boardTop + halfHeight - center.y, pose.p[2] - center.z);
}

/** 背または腹の輪郭を部品の長さの中点で補間します。蝶番はここを通り、魚の x 軸に平行です。 */
export function hingePoint(points, x) {
  const last = points.at(-1);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (x <= b[0]) {
      const t = THREE.MathUtils.clamp((x - a[0]) / (b[0] - a[0] || 1), 0, 1);
      return [x, THREE.MathUtils.lerp(a[1], b[1], t), 0];
    }
  }
  return [x, last[1], 0];
}

// 平行移動と回転の順は T(move) T(center) R T(-center) です。
function aroundPoint(out, pivot, move) {
  center.fromArray(pivot);
  position.copy(center).applyMatrix4(out).negate().add(center);
  if (move) position.add(move);
  return out.setPosition(position);
}

/** P⁻¹ A P。盤の移動量と回転軸を魚に戻すと、FLF で与えられた支点をそのまま使えます。 */
export function composePieceMatrix(pose, own, pivotFLF, parentMatrix = null, out = new THREE.Matrix4(), hinges) {
  if (pose.isMatrix4) inverse.setFromRotationMatrix(pose).invert();
  else inverse.fromArray(pose.q).invert();
  translation.fromArray(own.move).applyQuaternion(inverse);
  const rot = own.rot;
  if (rot?.deg) {
    const about = rot.pivot ?? rot.about ?? 'pivot';
    const pivot = Array.isArray(about) ? about : hinges?.[about] ?? pivotFLF;
    axis.fromArray(axes[rot.axis] ?? rot.axis).normalize().applyQuaternion(inverse);
    aroundPoint(out.makeRotationAxis(axis, THREE.MathUtils.degToRad(rot.deg)), pivot, translation);
  } else {
    out.makeTranslation(translation);
  }
  return parentMatrix ? out.premultiply(parentMatrix) : out;
}

/** +z が魚の左側。背より下の身は、左が負、右が正の角度で外へ開きます。 */
export function slitMatrix(id, amount, dorsalHinge, out = new THREE.Matrix4()) {
  const sign = id === 'L.dorsal' ? -1 : id === 'R.dorsal' ? 1 : 0;
  const angle = sign * THREE.MathUtils.clamp(amount, 0, 1) * THREE.MathUtils.degToRad(7);
  return aroundPoint(out.makeRotationX(angle), dorsalHinge);
}

export function knifeMatrix(knife, ownerMatrix, out = new THREE.Matrix4()) {
  return out.compose(position.fromArray(knife.pos), rotation.fromArray(knife.quat), one).premultiply(ownerMatrix);
}
