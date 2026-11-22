import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.js';
import { createPicker } from '../../lib/pick.js';

const domElement = { getBoundingClientRect: () => ({ left: 50, top: 30, width: 200, height: 100 }) };
const camera = () => new THREE.PerspectiveCamera(35, 2, 0.1, 100);

test('反転・姿勢・部品移動を含む盤から、部品の元のFLF座標を拾う', () => {
  const mirror = new THREE.Group(), scene = new THREE.Scene(), holder = new THREE.Group();
  const root = new THREE.Group(), part = new THREE.Group();
  mirror.add(scene); scene.add(holder); holder.add(root); root.add(part);
  holder.rotation.x = -Math.PI / 2; holder.position.set(0.6, 4, -2);
  root.rotation.y = 0.2; part.position.set(5.3, -1, 6); part.rotation.z = -0.7;
  root.userData.pieceId = 'bone'; part.userData.pieceId = 'head';
  const geometry = new THREE.BoxGeometry(2, 2, 2), material = new THREE.MeshStandardMaterial();
  const eye = new THREE.Mesh(geometry, material);
  eye.position.set(4, 2, 1); eye.userData.pieceId = 'head'; part.add(eye);
  const cam = camera(), pick = createPicker({ camera: cam, domElement, meshes: () => [root] });
  for (const sx of [1, -1]) {
    mirror.scale.x = sx;
    const local = new THREE.Vector3(0, 0, 1), world = eye.localToWorld(local.clone());
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(eye.matrixWorld);
    cam.position.copy(world).addScaledVector(normal, 12);
    cam.lookAt(world);
    const hit = pick(150, 80);
    assert.equal(hit.object, eye); assert.equal(hit.pieceId, 'head');
    assert.ok(new THREE.Vector3(...hit.point).distanceTo(new THREE.Vector3(4, 2, 2)) < 1e-8);
    assert.equal(material.side, THREE.FrontSide);
  }
  material.dispose(); geometry.dispose();
});

test('最も手前の見える部品を返し、非表示・透明・クリップ面外と領域外を除く', () => {
  const cam = camera();
  cam.position.set(0, 0, 10); cam.lookAt(0, 0, 0);
  const scene = new THREE.Scene(), front = new THREE.Group();
  const geo = new THREE.BoxGeometry(2, 2, 1);
  const back = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
  const skin = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true }));
  back.userData.pieceId = 'bone'; front.userData.pieceId = 'skin.L';
  front.position.z = 2; front.add(skin); scene.add(back, front);
  const { pick } = createPicker({ domElement, camera: cam, meshes: scene });
  assert.equal(pick(150, 80).pieceId, 'skin.L');
  front.visible = false; assert.equal(pick(150, 80).pieceId, 'bone');
  front.visible = true; skin.material.opacity = 0; assert.equal(pick(150, 80).pieceId, 'bone');
  cam.far = 8; cam.updateProjectionMatrix(); assert.equal(pick(150, 80), null);
  cam.far = 100; skin.material.opacity = 1; cam.near = 9; cam.updateProjectionMatrix();
  assert.equal(pick(150, 80).pieceId, 'bone');
  for (const [x, y] of [[49, 80], [251, 80], [150, 131], [NaN, 80], [60, 31]]) assert.equal(pick(x, y), null);
  assert.equal(createPicker({ domElement: { getBoundingClientRect: () => ({ width: 0, height: 2 }) },
    camera: cam, meshes: scene })(0, 1), null);
  geo.dispose(); skin.material.dispose(); back.material.dispose();
});
