// OWNER: render
// 粒子（煙・炎・火の粉）・窓の炎・雷の帯を、不透明な物の後に別のパス（FxPass）で描く。r04-fx2（引き継ぎ）。
// 指摘「breath の壁の炎は、板が壁と交わる所に四角い直線の縁が出る」。粒子の四角が壁・床の割れ目・地面と交わる所は、
// 深さの比べで切れて直線になっていた。不透明な物だけの深さを粒子のシェーダーが読み、奥の物に近い所ほど透かす（柔らかい粒子）。
// 深さは、後処理（EffectComposer）が RenderPass の直後に写す「安定した深さ」を読む。描いている最中の深さは読めない
// （描く先に付いた深さを読むと WebGL が止める）ので、粒子は RenderPass と分けて描く。
// 粒子の物体は層 FX_LAYER にだけ置く。カメラは既定で層 0 しか見ないので RenderPass は粒子を描かず、FxPass が層 FX_LAYER だけを描く。
import { Pass } from 'postprocessing';
import { Vector4, type Light, type Object3D, type PerspectiveCamera, type Scene, type Texture, type WebGLRenderer, type WebGLRenderTarget } from 'three';

/** 粒子と窓の炎と雷の帯を置く層（それ以外の物は層 0 のまま）。水面の鏡像のカメラもこの層を見る */
export const FX_LAYER = 2;

/** 柔らかい粒子の uniform。粒子と窓の炎の材質が同じものを共有し、FxPass が毎コマ書く */
export const SOFT_UNIFORMS = {
  uSceneDepth: { value: null as Texture | null },
  /** (1/幅, 1/高さ, near, far)。幅と高さは描く先の画素数 */
  uSoftView: { value: new Vector4(1, 1, 0.1, 1000) },
  /** 1 のときだけ深さを読む。FxPass の外（水面の鏡像など）では 0（別の視点の深さを読まない） */
  uSoftOn: { value: 0 },
};

/**
 * 画素の視線の奥行き viewZ（m、正）が、奥の不透明な物から range（m）以内なら透かす（0〜1）。
 * 深さは 0〜1 の透視の値なので、near と far から視線の奥行きへ戻して比べる。
 */
export const SOFT_GLSL = /* glsl */ `
uniform sampler2D uSceneDepth;
uniform vec4 uSoftView;
uniform float uSoftOn;
float softFade(float viewZ, float range) {
  if (uSoftOn < 0.5) return 1.0;
  float d = texture2D(uSceneDepth, gl_FragCoord.xy * uSoftView.xy).r;
  float n = uSoftView.z;
  float f = uSoftView.w;
  float sceneZ = n * f / (f - d * (f - n));
  return clamp((sceneZ - viewZ) / max(range, 1e-3), 0.0, 1.0);
}
`;

function enableFxLayerOnLight(o: Object3D): void {
  if ((o as Light).isLight) o.layers.enable(FX_LAYER);
}

/** RenderPass の直後に置く：層 FX_LAYER の物だけを、同じ描く先へ重ねて描く（消さない・影を作り直さない）。 */
export class FxPass extends Pass {
  constructor(
    private readonly fxScene: Scene,
    private readonly fxCamera: PerspectiveCamera,
  ) {
    super('FxPass', fxScene, fxCamera);
    this.needsSwap = false;
    this.needsDepthTexture = true;
  }

  override setDepthTexture(depthTexture: Texture): void {
    SOFT_UNIFORMS.uSceneDepth.value = depthTexture;
  }

  override render(renderer: WebGLRenderer, inputBuffer: WebGLRenderTarget | null): void {
    const scene = this.fxScene;
    const camera = this.fxCamera;
    // 光は両方の描画で同じものを見せる。光の組み合わせが描画ごとに変わると、three は光の状態の版を上げ、
    // 次の RenderPass で光を使う材質を全部組み直す（性能の計測で p50 が +3ms、p95 が +11ms 以上重くなった）
    scene.traverse(enableFxLayerOnLight);
    const mask = camera.layers.mask;
    const autoClear = renderer.autoClear;
    const shadows = renderer.shadowMap.autoUpdate;
    const matrices = scene.matrixWorldAutoUpdate;
    camera.layers.set(FX_LAYER);
    renderer.autoClear = false;
    // 影と行列は RenderPass で作り直してあるので、2回目はしない
    renderer.shadowMap.autoUpdate = false;
    scene.matrixWorldAutoUpdate = false;
    const w = inputBuffer ? inputBuffer.width : renderer.domElement.width;
    const h = inputBuffer ? inputBuffer.height : renderer.domElement.height;
    SOFT_UNIFORMS.uSoftView.value.set(1 / Math.max(1, w), 1 / Math.max(1, h), camera.near, camera.far);
    SOFT_UNIFORMS.uSoftOn.value = SOFT_UNIFORMS.uSceneDepth.value ? 1 : 0;
    try {
      renderer.setRenderTarget(this.renderToScreen ? null : inputBuffer);
      renderer.render(scene, camera);
    } finally {
      SOFT_UNIFORMS.uSoftOn.value = 0;
      camera.layers.mask = mask;
      renderer.autoClear = autoClear;
      renderer.shadowMap.autoUpdate = shadows;
      scene.matrixWorldAutoUpdate = matrices;
    }
  }
}
