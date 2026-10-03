// OWNER: render
// n8ao（ISC）は型定義を同梱していないので、使う分だけ宣言する。
declare module 'n8ao' {
  import type { Pass } from 'postprocessing';
  import type { Camera, Color, Scene } from 'three';

  export interface N8AOConfiguration {
    aoRadius: number;
    distanceFalloff: number;
    intensity: number;
    aoSamples: number;
    denoiseSamples: number;
    denoiseRadius: number;
    halfRes: boolean;
    gammaCorrection: boolean;
    color: Color;
    accumulate: boolean;
    screenSpaceRadius: boolean;
    depthAwareUpsampling: boolean;
    transparencyAware: boolean;
    renderMode: number;
  }

  export class N8AOPostPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    configuration: N8AOConfiguration;
    /** 透明な材質を見つけると、透明物を毎コマ2回描き直す重い道を自動で有効にする。粒子を足すので切る */
    autoDetectTransparency: boolean;
    setSize(width: number, height: number): void;
  }
}
