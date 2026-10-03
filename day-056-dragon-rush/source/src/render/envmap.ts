// OWNER: render
// 環境マップ（ガラスの反射と空からの補助光）を焼く。空は大気の表から描くドームそのものなので、
// 空・霧・環境反射の色がそろう。2段で焼く：まず空だけ、次に街の中心の上から街ごと。
import {
  CubeCamera,
  HalfFloatType,
  PMREMGenerator,
  Scene,
  WebGLCubeRenderTarget,
  type Object3D,
  type Texture,
  type Vector3,
  type WebGLRenderer,
} from 'three';
import { AMBIENT } from '../config/render';
import type { SkyDome } from './sky';

function bakeCube(renderer: WebGLRenderer, scene: Scene, position: Vector3, size: number): Texture {
  const cubeTarget = new WebGLCubeRenderTarget(size, { type: HalfFloatType, generateMipmaps: false });
  const cubeCamera = new CubeCamera(1, 30000, cubeTarget);
  cubeCamera.position.copy(position);
  scene.add(cubeCamera);
  cubeCamera.update(renderer, scene);
  scene.remove(cubeCamera);
  const pmrem = new PMREMGenerator(renderer);
  const env = pmrem.fromCubemap(cubeTarget.texture).texture;
  pmrem.dispose();
  cubeTarget.dispose();
  return env;
}

export interface EnvBakeOptions {
  position: Vector3;
  size: number;
  /** 焼くときに隠す物（水面は主カメラの鏡像を使うので映さない） */
  hidden: Object3D[];
}

/** 空だけの環境マップ。街の材質を環境マップ付きでコンパイルさせるための1段目。 */
export function bakeSkyEnvironment(renderer: WebGLRenderer, sky: SkyDome, options: EnvBakeOptions): Texture {
  const skyScene = new Scene();
  const parent = sky.mesh.parent;
  skyScene.add(sky.mesh);
  sky.drawSun = false;
  const env = bakeCube(renderer, skyScene, options.position, options.size);
  sky.drawSun = true;
  skyScene.remove(sky.mesh);
  parent?.add(sky.mesh);
  return env;
}

/**
 * 街ごとの環境マップ（2段目）。補助光の強さ（AMBIENT.envIntensity）もここでシーンに入れる。
 * r05-dusk の落とし穴：three r186 は、材質が自分の envMap を持たず scene.environment を使うとき、材質の envMapIntensity を
 * 読まずに scene.environmentIntensity（既定 1）を使う。r00a からの envMapIntensity: AMBIENT.envIntensity（1.6）は一度も効いておらず、
 * 補助光はずっと 1 倍だった。焼く前に入れるので、環境マップに映る街も同じ強さの補助光で照らされる
 */
export function bakeCityEnvironment(renderer: WebGLRenderer, scene: Scene, sky: SkyDome, options: EnvBakeOptions): Texture {
  scene.environmentIntensity = AMBIENT.envIntensity;
  const visibility = options.hidden.map((o) => o.visible);
  options.hidden.forEach((o) => (o.visible = false));
  sky.drawSun = false;
  const env = bakeCube(renderer, scene, options.position, options.size);
  sky.drawSun = true;
  options.hidden.forEach((o, i) => (o.visible = visibility[i]));
  return env;
}
