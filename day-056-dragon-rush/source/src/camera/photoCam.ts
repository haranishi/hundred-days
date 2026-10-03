// OWNER: camera
// 撮影モードの自由視点：時間を止めたまま、WASD・Q/E で動き、マウスで向きを変える（Shift で速く）。
import { Euler, MathUtils, Vector3, type PerspectiveCamera } from 'three';
import type { InputState } from '../core/input';

export class PhotoCamera {
  private readonly euler = new Euler(0, 0, 0, 'YXZ');
  private readonly move = new Vector3();

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly input: InputState,
  ) {}

  /** 今のカメラの向きから始める。 */
  begin(): void {
    this.euler.setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.euler.z = 0;
    this.input.consumeMotion();
  }

  update(dt: number): void {
    const m = this.input.consumeMotion();
    this.euler.y -= m.dx * 0.002;
    this.euler.x = MathUtils.clamp(this.euler.x - m.dy * 0.002, -1.5, 1.5);
    this.camera.quaternion.setFromEuler(this.euler);
    const fast = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
    const key = (c: string): number => (this.input.isDown(c) ? 1 : 0);
    this.move.set(key('KeyD') - key('KeyA'), key('KeyE') - key('KeyQ'), key('KeyS') - key('KeyW'));
    if (this.move.lengthSq() > 0) {
      this.move.normalize().multiplyScalar((fast ? 180 : 45) * dt).applyQuaternion(this.camera.quaternion);
      this.camera.position.add(this.move);
      this.camera.position.y = Math.max(1.5, this.camera.position.y);
    }
    this.camera.updateMatrixWorld();
  }
}
