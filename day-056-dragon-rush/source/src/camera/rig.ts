// OWNER: camera
// カメラの置き方。撮影では決め打ちの位置と注視点、開発中は自由に飛べるカメラ。
// 遊びのカメラ（ばねで竜を追う）は r00b で足す。
import { Euler, MathUtils, Vector3, type PerspectiveCamera } from 'three';
import type { InputState } from '../core/input';

export function placeCamera(camera: PerspectiveCamera, position: Vector3, target: Vector3, fov: number): void {
  camera.position.copy(position);
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  if (camera.fov !== fov) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  camera.updateMatrixWorld(true);
}

/** 方位角（北=0、東=90、度）と俯仰角（上が正、度）から視線の向き。 */
export function directionFromAngles(azimuthDeg: number, pitchDeg: number): Vector3 {
  const az = MathUtils.degToRad(azimuthDeg);
  const p = MathUtils.degToRad(pitchDeg);
  return new Vector3(Math.sin(az) * Math.cos(p), Math.sin(p), -Math.cos(az) * Math.cos(p));
}

/** 開発用の自由飛行カメラ：WASD で移動、Q/E で上下、右ドラッグで向き、Shift で速く。 */
export class DevFlyCamera {
  private readonly euler = new Euler(0, 0, 0, 'YXZ');
  private readonly move = new Vector3();

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly input: InputState,
  ) {
    this.euler.setFromQuaternion(camera.quaternion);
  }

  update(dt: number): void {
    const motion = this.input.consumeMotion();
    if (this.input.isButtonDown(2) || this.input.isButtonDown(0)) {
      this.euler.y -= motion.dx * 0.0022;
      this.euler.x = MathUtils.clamp(this.euler.x - motion.dy * 0.0022, -1.5, 1.5);
      this.camera.quaternion.setFromEuler(this.euler);
    }
    const speed = (this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight') ? 260 : 60) * dt;
    this.move.set(
      (this.input.isDown('KeyD') ? 1 : 0) - (this.input.isDown('KeyA') ? 1 : 0),
      (this.input.isDown('KeyE') ? 1 : 0) - (this.input.isDown('KeyQ') ? 1 : 0),
      (this.input.isDown('KeyS') ? 1 : 0) - (this.input.isDown('KeyW') ? 1 : 0),
    );
    if (this.move.lengthSq() > 0) {
      this.move.normalize().multiplyScalar(speed).applyQuaternion(this.camera.quaternion);
      this.camera.position.add(this.move);
      this.camera.position.y = Math.max(1.2, this.camera.position.y);
    }
    this.camera.updateMatrixWorld();
  }
}
