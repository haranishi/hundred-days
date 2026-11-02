// OWNER: core
// 重ねの表示の入口。表示の実装（greybox／art）に依存しない：根（parent）と写し（snap）だけを使う。
//   const ov = new Overlays(view.overlayRoot);  毎コマ ov.update(dt, snap, camera)  演出や撮影で隠すなら ov.setVisible(false)
import type * as THREE from 'three';
import type { SimSnapshot } from '../../contract/snapshot';
import { ConeLayer } from './cones';
import { MarkLayer } from './marks';
import { AimLayer, NoiseLayer } from './rings';

export class Overlays {
  private readonly cones: ConeLayer;
  private readonly marks: MarkLayer;
  private readonly noise: NoiseLayer;
  private readonly aim: AimLayer;
  private time = 0;

  constructor(parent: THREE.Object3D) {
    this.cones = new ConeLayer(parent);
    this.noise = new NoiseLayer(parent);
    this.aim = new AimLayer(parent);
    this.marks = new MarkLayer(parent);
  }

  /** camera を渡すと、遠すぎる頭上の印を隠す。 */
  update(dt: number, snap: SimSnapshot, camera?: THREE.Camera): void {
    this.time += dt;
    // 平常の扇はプレイヤーから扇までの距離で濃さを変える（r03-fix-play）
    const pl = snap.characters.find((c) => c.kind === 'player');
    this.cones.update(snap.cones, pl ? { x: pl.x, z: pl.z } : null);
    this.noise.update(snap.noises);
    this.aim.update(snap);
    this.marks.update(snap.marks, this.time, camera);
  }

  setVisible(on: boolean): void {
    this.cones.setVisible(on);
    this.noise.setVisible(on);
    this.aim.setVisible(on);
    this.marks.setVisible(on);
  }

  dispose(): void {
    this.cones.dispose();
    this.noise.dispose();
    this.aim.dispose();
    this.marks.dispose();
  }
}
