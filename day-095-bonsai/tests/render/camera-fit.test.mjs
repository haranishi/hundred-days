import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PerspectiveCamera, Vector3 } from '../../vendor/three.js';
import { CAMERA_DEFAULT, CAMERA_LIMITS } from '../../lib/contract.js';
import { FRAME_FILL, fitCamera, skeletonBounds } from '../../lib/camera-math.js';
import { bandMetrics, photoFrame } from '../../lib/capture.js';

const FOV = 30;
const MARGIN_NDC = FRAME_FILL;
const tree = { min: [-2.3, -0.2, -1.4], max: [1.7, 3.5, 2.1] };

function projectCorners(box, pose, aspect) {
  const camera = new PerspectiveCamera(FOV, aspect, 0.08, 100);
  camera.position.setFromSphericalCoords(pose.dist, pose.pol * Math.PI / 180, pose.az * Math.PI / 180);
  camera.position.add(new Vector3(...pose.target));
  camera.lookAt(...pose.target);
  camera.updateMatrixWorld();
  const points = [];
  for (const x of [box.min[0], box.max[0]]) {
    for (const y of [box.min[1], box.max[1]]) {
      for (const z of [box.min[2], box.max[2]]) points.push(new Vector3(x, y, z).project(camera));
    }
  }
  return points;
}

test('画角: 縦長では幅、横長では高さを使い、正方形でも奥行きのある箱の8角を収める', () => {
  const pose = { ...CAMERA_DEFAULT, az: 31, pol: 72 };
  for (const aspect of [0.46, 1, 1.6]) {
    const fit = fitCamera(tree, pose, FOV, aspect);
    const points = projectCorners(tree, fit, aspect);
    assert.equal(points.length, 8);
    assert.ok(points.every(({ x, y, z }) => (
      Math.abs(x) <= MARGIN_NDC + 1e-7 && Math.abs(y) <= MARGIN_NDC + 1e-7 && Math.abs(z) < 1
    )), `8角と余白が画角に入らない (aspect=${aspect})`);
    const width = Math.max(...points.map(({ x }) => x)) - Math.min(...points.map(({ x }) => x));
    const height = Math.max(...points.map(({ y }) => y)) - Math.min(...points.map(({ y }) => y));
    assert.ok(Math.max(width, height) > 2 * MARGIN_NDC - 1e-7, '必要以上に引いている');
    if (aspect === 0.46) {
      assert.ok(width > height);
      assert.ok(fit.dist > CAMERA_LIMITS.distMax, '既定の距離上限より狭い場面を試験していない');
    }
    if (aspect === 1.6) assert.ok(height > width);
  }
});

test('画角: 空・点・巨大な箱でも、距離と注視点は有限', () => {
  for (const bounds of [
    null, [], { min: [Infinity, 0, 0], max: [-Infinity, 0, 0] },
    { min: [0, 0, 0], max: [0, 0, 0] },
    { min: [-1e7, 0, -1e8], max: [2e7, 4e8, 3e7] },
    { min: [-Number.MAX_VALUE, 0, 0], max: [Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE] },
  ]) {
    const fit = fitCamera(bounds, CAMERA_DEFAULT, FOV, 0.46);
    assert.ok(fit.dist > 0 && Number.isFinite(fit.dist));
    assert.ok(fit.target.every(Number.isFinite));
  }
});

test('画角: パッドの半径が骨格の箱からはみ出す分を含める', () => {
  const bounds = { min: [-1, 0, -2], max: [1, 2, 1] };
  const skel = {
    bounds,
    pads: { count: 2, center: new Float32Array([1, 2, 1, -1, 0.5, -2]), radius: new Float32Array([0.5, 0.25]) },
  };
  assert.deepEqual(skeletonBounds(skel), { min: [-1.25, 0, -2.25], max: [1.5, 2.5, 1.5] });
  assert.deepEqual(bounds, { min: [-1, 0, -2], max: [1, 2, 1] });
});

test('写真: 4:5 で手前の鉢まで和紙の帯より上に収める', () => {
  const pot = { min: [-1.35, -0.7, -1.1], max: [1.55, 0.03, 1.15] };
  const aspect = 1080 / 1350;
  const available = bandMetrics(1080, 1350).y / 1350;
  const fit = photoFrame([tree, pot], { ...CAMERA_DEFAULT, az: -33, pol: 65 }, FOV, aspect);
  const yMid = 1 - available;
  for (const box of [tree, pot]) {
    const points = projectCorners(box, fit, aspect);
    assert.ok(points.every(({ x, y, z }) => (
      Math.abs(x) <= MARGIN_NDC + 1e-7
      && Math.abs(y - yMid) <= available * MARGIN_NDC + 1e-7
      && Math.abs(z) < 1
    )), '木か鉢が欠けるか、和紙の帯に隠れる');
  }
});
