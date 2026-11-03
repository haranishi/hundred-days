// OWNER: world-art
// 後処理：HDR（半精度）で描いたシーン → N8AO（接地の暗がり）→ 炎の段（r03-fix-visual）→ 光のにじみ＋色の仕上げ → SMAA。
// 組み立ては本人の dragon-rampage（src/render/post.ts）から写した。
import { N8AOPostPass } from 'n8ao';
import { BloomEffect, BlendFunction, EdgeDetectionMode, EffectComposer, EffectPass, Pass, RenderPass, SMAAEffect, SMAAPreset } from 'postprocessing';
import {
  Color,
  CustomBlending,
  HalfFloatType,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PerspectiveCamera,
  ShaderMaterial,
  WebGLRenderTarget,
  ZeroFactor,
  type Scene,
  type Texture,
  type TextureDataType,
  type WebGLRenderer,
} from 'three';
import type { ArtPost } from '../../contract/art';
import { AO, BLOOM } from './config';
import { GradeEffect } from './grade';
import { FIRE_LAYER, SOFT_UNIFORMS } from './softDepth';

/**
 * 炎の段（r03-fix-visual）：炎・煙・火の粉（FIRE_LAYER）だけを、場面の深さと比べながら透明な画に描き、場面に重ねる。
 * 炎の材質は前乗算の重ね（ONE, ONE_MINUS_SRC_ALPHA）なので、透明な画へ同じ式で描いて同じ式で重ねれば、場面へ直に描いたのと同じ色になる。
 * N8AO の後に置く（炎が接地の暗がりで暗くならない）。光のにじみの前に置く（炎がにじむ）。
 */
class KgFirePass extends Pass {
  private readonly target = new WebGLRenderTarget(1, 1, { depthBuffer: false, stencilBuffer: false });
  private readonly view = new PerspectiveCamera();
  private readonly composite: ShaderMaterial;
  private readonly clearColor = new Color();

  constructor(
    private readonly world: Scene,
    private readonly viewCamera: PerspectiveCamera,
  ) {
    super('KgFirePass');
    this.needsSwap = false;
    this.needsDepthTexture = true;
    this.composite = new ShaderMaterial({
      name: 'kg-fire-composite',
      uniforms: { tFire: { value: this.target.texture } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 1.0, 1.0); }',
      fragmentShader: 'uniform sampler2D tFire; varying vec2 vUv; void main() { gl_FragColor = texture2D(tFire, vUv); }',
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      blendSrcAlpha: ZeroFactor,
      blendDstAlpha: OneFactor,
    });
    this.fullscreenMaterial = this.composite;
  }

  override setDepthTexture(depthTexture: Texture): void {
    SOFT_UNIFORMS.uKgDepth.value = depthTexture;
  }

  override initialize(_renderer: WebGLRenderer, _alpha: boolean, frameBufferType: number): void {
    if (frameBufferType !== undefined) this.target.texture.type = frameBufferType as TextureDataType;
  }

  override setSize(width: number, height: number): void {
    this.target.setSize(width, height);
    SOFT_UNIFORMS.uKgDepthInfo.value.x = 1 / Math.max(1, width);
    SOFT_UNIFORMS.uKgDepthInfo.value.y = 1 / Math.max(1, height);
  }

  override render(renderer: WebGLRenderer, inputBuffer: WebGLRenderTarget): void {
    const v = this.view;
    v.copy(this.viewCamera, false);
    v.layers.set(FIRE_LAYER);
    SOFT_UNIFORMS.uKgDepthInfo.value.z = this.viewCamera.near;
    SOFT_UNIFORMS.uKgDepthInfo.value.w = this.viewCamera.far;
    renderer.getClearColor(this.clearColor);
    const clearAlpha = renderer.getClearAlpha();
    const autoUpdate = this.world.matrixWorldAutoUpdate;
    // 行列は本体の描画で更新済み。炎の層だけを描く（灯りも影も層 0 なので、影の描き直しは起きない）
    this.world.matrixWorldAutoUpdate = false;
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
    renderer.render(this.world, v);
    this.world.matrixWorldAutoUpdate = autoUpdate;
    renderer.setClearColor(this.clearColor, clearAlpha);
    renderer.setRenderTarget(this.renderToScreen ? null : inputBuffer);
    renderer.render(this.scene, this.camera);
  }

  override dispose(): void {
    super.dispose();
    this.target.dispose();
  }
}

/** 契約の ArtPost に、撮影と計測のための口を足したもの（統合の側は ArtPost の口だけ使えばよい）。 */
export interface KgPost extends ArtPost {
  readonly composer: EffectComposer;
  readonly grade: GradeEffect;
  /** N8AO の段（確認ページの ?ao=0 で切る。r03-fix-visual 追加） */
  readonly ao: N8AOPostPass;
  /** 描画の段階：AO の描画だけを止め、炎に渡す深度と最後の仕上げは残す。 */
  setAoEnabled(on: boolean): void;
  /** 撮影：AO を何コマも積算してノイズを消し、粒の種を固定する。 */
  setShotMode(on: boolean): void;
  /** 0→1：捕まったときの色抜き（r01-integrate。契約の外の口）。 */
  setDrain(k: number): void;
}

export function createPostChain(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera): KgPost {
  const composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType, multisampling: 0 });
  composer.addPass(new RenderPass(scene, camera));

  const ao = new N8AOPostPass(scene, camera, 16, 16);
  ao.configuration.aoRadius = AO.radius;
  ao.configuration.distanceFalloff = AO.distanceFalloff;
  ao.configuration.intensity = AO.intensity;
  ao.configuration.aoSamples = AO.samples;
  ao.configuration.denoiseSamples = AO.denoiseSamples;
  ao.configuration.halfRes = AO.halfRes;
  ao.configuration.gammaCorrection = false;
  ao.configuration.color = new Color(0.0, 0.0, 0.0);
  // 炎・煙・火の粉（透明）を足すと、N8AO が透明物を毎コマ描き直す重い道へ自動で切り替わるので止める（dragon-rampage の落とし穴）
  ao.autoDetectTransparency = false;
  composer.addPass(ao);
  composer.addPass(new KgFirePass(scene, camera));

  const grade = new GradeEffect();
  const bloom = new BloomEffect({
    blendFunction: BlendFunction.ADD,
    mipmapBlur: true,
    luminanceThreshold: BLOOM.threshold,
    luminanceSmoothing: BLOOM.smoothing,
    intensity: BLOOM.intensity,
    radius: BLOOM.radius,
    levels: BLOOM.levels,
  });
  composer.addPass(new EffectPass(camera, bloom, grade));
  const smaa = new SMAAEffect({ preset: SMAAPreset.MEDIUM, edgeDetectionMode: EdgeDetectionMode.COLOR });
  composer.addPass(new EffectPass(camera, smaa));

  let shot = false;
  let frame = 0;
  return {
    composer,
    grade,
    ao,
    setAoEnabled(on: boolean): void {
      ao.enabled = on;
    },
    render(dt: number): void {
      renderer.info.reset();
      if (!shot) grade.grainSeed = (frame++ % 97) + 1;
      composer.render(dt);
    },
    setSize(width: number, height: number): void {
      composer.setSize(width, height);
    },
    setAlert(k: number): void {
      grade.alert = k;
    },
    setFinale(k: number): void {
      grade.finale = k;
    },
    setDrain(k: number): void {
      grade.drain = k;
    },
    setShotMode(on: boolean): void {
      shot = on;
      ao.configuration.accumulate = on;
      if (on) grade.grainSeed = 0;
    },
    dispose(): void {
      composer.dispose();
    },
  };
}
