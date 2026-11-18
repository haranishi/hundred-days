// キャラの顔の画像を作る（開発用。tools/ui-faces.mjs が確認用ページから呼ぶ。本番では読み込まない）。
// Kenney の Previews は 64px しかなく、スマホの高精細な画面では顔がぼやける。
// 同じ素材（public/models/ch の GLB・CC0）を three.js で胸から上だけ撮り、192px の PNG にする。

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** 胸から上を、少し斜め・少し上から撮る */
export async function renderFace(file: string, size = 192): Promise<{ dataUrl: string; animations: string[] }> {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe9e2d2, 2.4));
  const key = new THREE.DirectionalLight(0xfff6e8, 2.2);
  key.position.set(-2.5, 4, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.8);
  rim.position.set(3, 2, -4);
  scene.add(rim);

  const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/ch/${file}.glb`);
  const model = gltf.scene;
  scene.add(model);
  // 立ち姿（idle）の最初のこまで撮る。無ければ素のまま
  const idle = gltf.animations.find((a) => /idle/i.test(a.name)) ?? null;
  if (idle) {
    const mixer = new THREE.AnimationMixer(model);
    mixer.clipAction(idle).play();
    mixer.update(0.2);
  }
  model.rotation.y = -0.38;
  model.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model);
  const height = box.max.y - box.min.y;
  const center = new THREE.Vector3();
  box.getCenter(center);
  // 頭の大きいキャラなので、胸から上（高さの3割〜頭の上の少しの余白）を映す。頭が枠の6割くらいになる
  const target = new THREE.Vector3(center.x, box.min.y + height * 0.67, center.z);
  const camera = new THREE.PerspectiveCamera(24, 1, 0.01, 100);
  const visible = height * 0.76;
  const dist = visible / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.position.set(target.x, target.y + height * 0.05, target.z + dist);
  camera.lookAt(target);

  renderer.render(scene, camera);
  const dataUrl = renderer.domElement.toDataURL('image/png');
  renderer.dispose();
  return { dataUrl, animations: gltf.animations.map((a) => a.name) };
}
