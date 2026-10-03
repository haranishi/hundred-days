// OWNER: render
// 太陽の光と、段の分かれた影（three の CSM、MIT）。光の色は大気の透過率から取る。
import { BufferGeometry, DirectionalLight, Mesh, MeshBasicMaterial, type Camera, type Object3D, type PerspectiveCamera, Vector3 } from 'three';
import { CSM } from 'three/examples/jsm/csm/CSM.js';
import type { QualityPreset } from '../config/quality';
import type { Atmosphere } from './atmosphereGpu';
import { installCsmLightsBegin } from './csmChunk';

/**
 * いま描いている影の段（r01-city）。影の段のカメラごとに、その段が受け持つ視線の奥行きの手前の端（m）を持つ。
 * 距離の帯で描く小物（lodPool.ts）は、手前の端が自分の届く距離より遠い段では描かない。
 * three の CSM は影の4段すべてに全物体を描くので、街路樹・車・人・小物（320m まで）が、1km 先から受け持つ段にも描かれていた。
 * 見張りの仕組み：影の描画の最初に通る空の物（sentinel）が、その段のカメラを current に書く。毎コマの始め（update）に空に戻す
 * （主カメラの描画は、影より先に物を選ぶので、そのときは current が空）。
 */
export const shadowScope: { current: Camera | null; nearDepth: Map<Camera, number> } = { current: null, nearDepth: new Map() };

export class SunLight {
  readonly csm: CSM | null;
  private readonly plain: DirectionalLight | null;
  private readonly lightDir = new Vector3();

  constructor(
    parent: Object3D,
    private readonly camera: PerspectiveCamera,
    private readonly atmosphere: Atmosphere,
    quality: QualityPreset,
  ) {
    this.lightDir.copy(atmosphere.sunDir).negate();
    if (quality.shadow.enabled) {
      this.csm = new CSM({
        camera,
        parent,
        cascades: quality.shadow.cascades,
        maxFar: quality.shadow.maxFar,
        mode: 'practical',
        shadowMapSize: quality.shadow.mapSize,
        shadowBias: -0.00012,
        lightDirection: this.lightDir,
        lightIntensity: atmosphere.sunIlluminance,
        lightNear: 1,
        lightFar: 9000,
        // 低い太陽では、遠くの高い建物が影を落とす。光の側に余白を大きく取る
        lightMargin: 2600,
      });
      // CSM が差し替えた塊は r186 の本体より古いので、本体を土台に組み直す（csmChunk.ts）
      installCsmLightsBegin();
      this.csm.fade = quality.shadow.fade;
      for (const light of this.csm.lights) {
        light.shadow.normalBias = 0.04;
        light.shadow.radius = 1.6;
      }
      this.csm.updateFrustums();
      this.plain = null;
      // 影の描画の最初に通る空の物（CSM の光のすぐ後、街より前に置く）
      const sentinel = new Mesh(new BufferGeometry(), new MeshBasicMaterial());
      sentinel.name = 'shadowScope';
      sentinel.castShadow = true;
      sentinel.frustumCulled = false;
      sentinel.onBeforeShadow = (_r, _o, _c, shadowCamera): void => {
        shadowScope.current = shadowCamera;
      };
      parent.add(sentinel);
      this.syncShadowScope();
    } else {
      this.csm = null;
      this.plain = new DirectionalLight(0xffffff, atmosphere.sunIlluminance);
      parent.add(this.plain, this.plain.target);
      // r01-city：影が無い画質でも、材質が読む csmSunIn（影を受けた後の太陽の光）を宣言しておく
      installCsmLightsBegin();
    }
    this.syncColor();
  }

  /** 大気（太陽の向きと色）が変わったら呼ぶ。 */
  syncColor(): void {
    this.lightDir.copy(this.atmosphere.sunDir).negate();
    const lights = this.csm ? this.csm.lights : [this.plain!];
    for (const light of lights) {
      light.color.copy(this.atmosphere.sunColor);
      light.intensity = this.atmosphere.sunIlluminance;
    }
    if (this.plain) {
      this.plain.position.copy(this.atmosphere.sunDir).multiplyScalar(1000);
      this.plain.target.position.set(0, 0, 0);
    }
  }

  /** 毎コマ、描画の前に呼ぶ（影の段をカメラに合わせる）。 */
  update(): void {
    shadowScope.current = null;
    this.csm?.update();
  }

  /** 影の段ごとの手前の端（CSM の区切り × 最遠距離）。段の境目を混ぜる分だけ手前へ余裕を取る。 */
  private syncShadowScope(): void {
    if (!this.csm) return;
    shadowScope.nearDepth.clear();
    const far = Math.min(this.camera.far, this.csm.maxFar);
    this.csm.lights.forEach((light, k) => {
      const near = k === 0 ? 0 : this.csm!.breaks[k - 1] * far * 0.8;
      shadowScope.nearDepth.set(light.shadow.camera, near);
    });
  }

  /** カメラの画角や縦横比が変わったら呼ぶ。 */
  updateFrustums(): void {
    this.csm?.updateFrustums();
    this.syncShadowScope();
  }
}
