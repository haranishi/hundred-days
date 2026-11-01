// OWNER: core（r01-integrate で update の simDt・whenReady・setShotMode を足した）
// 表示の口。遊びの側（main・game）は、この形だけを通して3Dを描く。既定は art の実装（artView.ts）、?view=greybox で仮の表示。
// 重ねの表示（扇・印・物音の輪・小石）は src/view/overlays が overlayRoot へ足す。表示の実装には依存しない。
import type * as THREE from 'three';
import type { SimSnapshot } from '../contract/snapshot';

export interface GameView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  /** 重ねの表示を足す場所。 */
  readonly overlayRoot: THREE.Object3D;
  /**
   * 毎コマ、描く前に1回。dt は実時間のコマの秒、simDt はこのコマで sim が進んだ秒（止まっていれば 0。スローや倍速も込み）。
   * 人物の動きは simDt で、炎や揺らぎなどの飾りは実時間で進める。snap は sim の写し、camera はカメラの係が動かしたもの。
   */
  update(dt: number, snap: SimSnapshot, camera: THREE.PerspectiveCamera, simDt: number): void;
  render(dt: number): void;
  resize(width: number, height: number): void;
  /** 描画の命令数・三角形数・作ったシェーダーの数（撮影と計測の記録用。シェーダーの数が遊びの途中で増えたら、先作りの漏れ）。 */
  stats(): { calls: number; triangles: number; programs: number };
  /** 描く準備（シェーダーの先作り）が終わったら解決する。撮影はこれを待ってから数える。 */
  whenReady(): Promise<void>;
  /** 撮影：粒を止め、AO を積算して絵を落ち着かせる。戻り値は、準備のあと待つコマ数。 */
  setShotMode(on: boolean): number;
  dispose(): void;
}
