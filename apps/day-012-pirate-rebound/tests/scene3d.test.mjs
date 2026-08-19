import test from 'node:test';
import assert from 'node:assert/strict';
import { NEAR, createCamera, createViewport, faceDepth, faceLight, fogAmount, placeModel, project, toFill } from '../lib/scene3d.js';
import { makeSphere } from '../lib/models.js';

const viewport = createViewport(800, 600);
const camera = createCamera();

test('目の高さの真正面は水平線の上に来る', () => {
  const point = project({ x: 0, y: camera.y, z: 20 }, camera, viewport);
  assert.equal(point.x, 400);
  assert.equal(point.y, viewport.horizon);
});

test('遠いほど中心に寄る', () => {
  const near = project({ x: 2, y: camera.y, z: 5 }, camera, viewport);
  const far = project({ x: 2, y: camera.y, z: 50 }, camera, viewport);
  assert.ok(near.x - 400 > far.x - 400, '同じ横位置でも遠いほど中央へ寄る');
  assert.ok(near.scale > far.scale);
});

test('カメラより手前の点は描かない', () => {
  assert.equal(project({ x: 0, y: 0, z: NEAR }, camera, viewport).visible, false);
  assert.equal(project({ x: 0, y: 0, z: -10 }, camera, viewport).visible, false);
});

test('霧は近くで0、遠くで1に飽和する', () => {
  assert.equal(fogAmount(1), 0);
  assert.equal(fogAmount(1000), 1);
  assert.ok(fogAmount(50) > 0 && fogAmount(50) < 1);
});

test('モデルを置くと拡大・回転・移動がその順で効く', () => {
  const model = { vertices: [[1, 0, 0]], faces: [] };
  const placed = placeModel(model, { position: [0, 0, 10], scale: 2, yaw: Math.PI / 2 });
  const [x, y, z] = placed.vertices[0];
  assert.ok(Math.abs(x) < 1e-9, '90度回すと横向きの点は正面を向く');
  assert.equal(y, 0);
  assert.ok(Math.abs(z - (10 - 2)) < 1e-9);
});

test('面の奥行きは頂点の平均', () => {
  const vertices = [[0, 0, 1], [0, 0, 3], [0, 0, 5]];
  assert.equal(faceDepth(vertices, { v: [0, 1, 2] }), 3);
});

test('光の当たり方で明るさが変わる', () => {
  const sphere = makeSphere(1, 1);
  const values = sphere.faces.map((face) => faceLight(sphere.vertices, face));
  assert.ok(Math.min(...values) >= 0.55 && Math.max(...values) <= 1.15);
  assert.ok(Math.max(...values) - Math.min(...values) > 0.1, '全部同じ明るさでは立体に見えない');
});

test('霧が濃いほど空の色に溶ける', () => {
  const sky = [200, 210, 230];
  assert.equal(toFill([0, 0, 0], 1, 1, sky), 'rgb(200 210 230)');
  assert.equal(toFill([100, 100, 100], 1, 0, sky), 'rgb(100 100 100)');
});
