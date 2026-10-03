// OWNER: render
// 後処理の組み立て：HDR（半精度）で描いたシーン → 粒子と窓の炎（FxPass、r04-fx2）→ N8AO → ブルーム＋色の仕上げ → SMAA。
import { N8AOPostPass } from 'n8ao';
import {
  BloomEffect,
  BlendFunction,
  EdgeDetectionMode,
  EffectComposer,
  EffectPass,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
} from 'postprocessing';
import { Color, HalfFloatType, type PerspectiveCamera, type Scene, type WebGLRenderer } from 'three';
import type { QualityPreset } from '../config/quality';
import { AO, BLOOM } from '../config/render';
import { GradeEffect } from './gradeEffect';
import { FxPass } from './softParticles';

export class PostChain {
  readonly composer: EffectComposer;
  readonly grade = new GradeEffect();
  readonly ao: N8AOPostPass | null;
  private readonly smaa: SMAAEffect | null;

  constructor(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, quality: QualityPreset) {
    this.composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType, multisampling: 0 });
    this.composer.addPass(new RenderPass(scene, camera));
    // r04-fx2（引き継ぎ）：粒子と窓の炎は不透明な物の深さを読んで、壁や地面と交わる所を透かす（render/softParticles.ts）
    this.composer.addPass(new FxPass(scene, camera));

    // 大きさは setSize で合わせる（composer が全パスに配る）
    if (quality.ao.enabled) {
      const ao = new N8AOPostPass(scene, camera, 16, 16);
      ao.configuration.aoRadius = AO.radius;
      ao.configuration.distanceFalloff = AO.distanceFalloff;
      ao.configuration.intensity = AO.intensity;
      ao.configuration.aoSamples = quality.ao.samples;
      ao.configuration.denoiseSamples = quality.ao.denoiseSamples;
      ao.configuration.halfRes = quality.ao.halfRes;
      ao.configuration.gammaCorrection = false;
      ao.configuration.color = new Color(0.04, 0.03, 0.025);
      // 煙や炎の粒子（透明）を足すと、N8AO が透明物を毎コマ描き直す道へ自動で切り替わり重くなるので止める（r00b）
      ao.autoDetectTransparency = false;
      this.composer.addPass(ao);
      this.ao = ao;
    } else {
      this.ao = null;
    }

    const effects = [];
    if (quality.bloom.enabled) {
      effects.push(
        new BloomEffect({
          blendFunction: BlendFunction.ADD,
          mipmapBlur: true,
          luminanceThreshold: BLOOM.threshold,
          luminanceSmoothing: BLOOM.smoothing,
          intensity: BLOOM.intensity,
          radius: BLOOM.radius,
          levels: quality.bloom.levels,
        }),
      );
    }
    effects.push(this.grade);
    this.composer.addPass(new EffectPass(camera, ...effects));

    if (quality.smaa !== 'off') {
      const preset = { high: SMAAPreset.HIGH, medium: SMAAPreset.MEDIUM, low: SMAAPreset.LOW }[quality.smaa];
      this.smaa = new SMAAEffect({ preset, edgeDetectionMode: EdgeDetectionMode.COLOR });
      this.composer.addPass(new EffectPass(camera, this.smaa));
    } else {
      this.smaa = null;
    }
  }

  /** 撮影では AO を何コマも積算して、ノイズの無い状態にする。 */
  setAccumulate(on: boolean): void {
    if (this.ao) this.ao.configuration.accumulate = on;
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  render(dt: number): void {
    this.composer.render(dt);
  }
}
