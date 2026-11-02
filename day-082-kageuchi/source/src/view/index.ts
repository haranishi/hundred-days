// OWNER: core（r01-integrate で art を足し、既定にした）
// 表示の選び方（?view=）。既定は art（世界・人物・後処理）。?view=greybox で仮の表示（箱と円柱）に戻す。
import type * as THREE from 'three';
import type { StageDef } from '../stage/types';
import { ArtView } from './artView';
import type { GameView } from './GameView';
import { GreyboxView } from './greybox';

export type ViewKind = 'art' | 'greybox';

export function createView(kind: string, canvas: HTMLCanvasElement, stage: StageDef, camera: THREE.PerspectiveCamera): GameView {
  switch (kind) {
    case 'greybox':
      return new GreyboxView(canvas, stage);
    case 'art':
    default:
      return new ArtView(canvas, stage, camera);
  }
}
