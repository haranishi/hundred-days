// OWNER: render
// 水平な鏡（水面）の鏡像を別のカメラで描く。three の Reflector（MIT）と同じ考え方：
// 視点を面で折り返したカメラで描き、面より手前を斜めの近接面で切る（Lengyel の方法）。
import {
  HalfFloatType,
  Matrix4,
  PerspectiveCamera,
  Plane,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { FX_LAYER } from './softParticles';

const _mirrorPos = new Vector3();
const _cameraPos = new Vector3();
const _rotation = new Matrix4();
const _lookAt = new Vector3();
const _target = new Vector3();
const _view = new Vector3();
const _normal = new Vector3(0, 1, 0);
const _plane = new Plane();
const _clip = new Vector4();
const _q = new Vector4();

export class PlanarMirror {
  readonly target: WebGLRenderTarget;
  readonly textureMatrix = new Matrix4();
  readonly camera = new PerspectiveCamera();

  constructor(
    private readonly height: number,
    private readonly scale: number,
    samples = 0,
  ) {
    // r01-city：採点「水面に映る山の縁が階段状」。半分の解像度で描いた鏡像の、ほぼ水平な稜線のジャギーだったので、
    // 鏡像を多重サンプリング（MSAA）で描く（samples 0→4）
    this.target = new WebGLRenderTarget(16, 16, { type: HalfFloatType, depthBuffer: true, samples });
    this.target.texture.generateMipmaps = false;
    // r04-fx2（引き継ぎ）：炎・火の粉・雷の帯は層 FX_LAYER に移した（render/softParticles.ts）。鏡像には今までどおり映す
    this.camera.layers.enable(FX_LAYER);
  }

  setSize(width: number, height: number): void {
    this.target.setSize(Math.max(16, Math.floor(width * this.scale)), Math.max(16, Math.floor(height * this.scale)));
  }

  /** 鏡像を描く。hidden に渡した物（水面そのもの）は描かない。 */
  render(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, hidden: Object3D[]): void {
    _mirrorPos.set(camera.position.x, this.height, camera.position.z);
    _cameraPos.setFromMatrixPosition(camera.matrixWorld);
    _rotation.extractRotation(camera.matrixWorld);
    _lookAt.set(0, 0, -1).applyMatrix4(_rotation).add(_cameraPos);

    // 視点が水面より下なら描かない
    if (_cameraPos.y <= this.height) return;

    _view.subVectors(_mirrorPos, _cameraPos).reflect(_normal).negate().add(_mirrorPos);
    _target.subVectors(_mirrorPos, _lookAt).reflect(_normal).negate().add(_mirrorPos);

    const mc = this.camera;
    mc.position.copy(_view);
    mc.up.set(0, 1, 0).applyMatrix4(_rotation).reflect(_normal);
    mc.lookAt(_target);
    mc.far = camera.far;
    mc.near = camera.near;
    mc.fov = camera.fov;
    mc.aspect = camera.aspect;
    mc.updateMatrixWorld();
    mc.projectionMatrix.copy(camera.projectionMatrix);

    // 鏡像のテクスチャを引く行列（ワールド → 鏡像の画面 uv）
    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(mc.projectionMatrix).multiply(mc.matrixWorldInverse);

    // 斜めの近接面：水面より下（鏡像の側から見て手前）を切る
    _plane.setFromNormalAndCoplanarPoint(_normal, _mirrorPos).applyMatrix4(mc.matrixWorldInverse);
    _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
    const pm = mc.projectionMatrix.elements;
    _q.x = (Math.sign(_clip.x) + pm[8]) / pm[0];
    _q.y = (Math.sign(_clip.y) + pm[9]) / pm[5];
    _q.z = -1.0;
    _q.w = (1.0 + pm[10]) / pm[14];
    _clip.multiplyScalar(2.0 / _clip.dot(_q));
    pm[2] = _clip.x;
    pm[6] = _clip.y;
    pm[10] = _clip.z + 1.0;
    pm[14] = _clip.w;

    const visibility = hidden.map((o) => o.visible);
    hidden.forEach((o) => (o.visible = false));
    const prevTarget = renderer.getRenderTarget();
    const prevShadowAuto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false; // 影マップは主カメラのものを使い回す
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, mc);
    renderer.setRenderTarget(prevTarget);
    renderer.shadowMap.autoUpdate = prevShadowAuto;
    hidden.forEach((o, i) => (o.visible = visibility[i]));
  }
}
