import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.js';
import { CAMERA_PRESETS } from '../../lib/contract.js';
import { boundingSphere, distanceForSphere, MAX_PITCH, MIN_PITCH, orbitToPosition, positionToOrbit,
  presetOrbit, RAD, shortestAngle, springStep, wrapAngle } from '../../lib/camera-math.js';
import { createCameraRig } from '../../lib/camera.js';

const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} と ${b} の差`);
const sphere = { center: [2, 2.5, -1], radius: 12 };
const options = { bounds: sphere, fov: 35, aspect: 1.4 };

test('ばねは大小・正負の初速と不規則な刻みで解析解に一致して収束する', () => {
  for (const start of [-1200, -0.001, 0, 9, 1850]) {
    for (const v of [-1000, 0, 500]) {
      for (const ticks of [[1 / 30], [1 / 60], [1 / 120], [1 / 42, 1 / 120, 1 / 30, 1 / 85]]) {
        let state = { value: start, velocity: v }, time = 0;
        for (let i = 0; time < 3; i++) {
          const dt = ticks[i % ticks.length];
          state = springStep(state.value, state.velocity, 3.7, dt);
          time += dt;
          const exact = springStep(start, v, 3.7, time);
          near(state.value, exact.value);
          near(state.velocity, exact.velocity, 1e-7);
        }
        near(state.value, 3.7);
        near(state.velocity, 0);
      }
    }
  }
  assert.deepEqual(springStep(2, -1, 5, 0), { value: 2, velocity: -1 });
  assert.deepEqual(springStep(2, -1, 5, 1e5), { value: 5, velocity: 0 });
});

test('軌道と盤の位置が往復し、±πをまたぐ補間は短い弧を通る', () => {
  for (const yaw of [-6.1, -2, 0, 1.5, 3.6]) {
    for (const pitch of [MIN_PITCH, 42 * RAD, MAX_PITCH]) {
      const orbit = { yaw, pitch, distance: 37, target: sphere.center };
      const restored = positionToOrbit(orbitToPosition(orbit), sphere.center);
      near(restored.distance, 37); near(restored.pitch, pitch); near(restored.yaw, wrapAngle(yaw));
    }
  }
  near(shortestAngle(179 * RAD, -179 * RAD), 2 * RAD);
  const rig = createCameraRig(options);
  rig.applyPreset('cook', { yaw: 179 * RAD }, { immediate: true });
  rig.applyPreset('cook', { yaw: -179 * RAD });
  for (let i = 0; i < 140; i++) {
    rig.update(1 / 60);
    assert.ok(Math.abs(rig.serialize().yaw) >= 179 * RAD - 1e-8);
  }
  near(rig.serialize().yaw, -179 * RAD);
});

test('縦長・横長・正方形の全視点で、外接球は投影した6面の内側に入る', () => {
  for (const aspect of [0.38, 0.78, 1, 1.85, 3.2]) {
    for (const fov of [28, 35, 58]) {
      const rig = createCameraRig({ ...options, fov, aspect });
      for (const name of CAMERA_PRESETS) {
        rig.applyPreset(name, {}, { immediate: true });
        const { camera } = rig;
        const matrix = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        const frustum = new THREE.Frustum().setFromProjectionMatrix(matrix);
        for (const plane of frustum.planes) {
          assert.ok(plane.distanceToPoint(new THREE.Vector3(...sphere.center)) >= sphere.radius,
            `${name}・縦横比${aspect}・画角${fov}度で外接球が切れます`);
        }
      }
    }
  }
  near(distanceForSphere(9, 60, 2), 18);
  assert.ok(distanceForSphere(9, 60, 0.5) > 18);
  assert.deepEqual(boundingSphere(new THREE.Box3(new THREE.Vector3(-3, -4, -1), new THREE.Vector3(3, 4, -1))),
    { center: [0, 0, -1], radius: 5 });
});

test('料理する人から見た方位、頭側、注視点、接写距離、ズーム倍率が合う', () => {
  const cook = presetOrbit('cook', sphere);
  near(cook.pitch / RAD, 42); near(cook.yaw, 0); near(cook.fov, 35);
  assert.deepEqual(cook.target, sphere.center);
  assert.ok(orbitToPosition(cook)[2] > sphere.center[2]);
  near(presetOrbit('side', sphere).pitch / RAD, 10);
  near(presetOrbit('top', sphere).pitch / RAD, 88);
  near(presetOrbit('front', sphere).yaw, -Math.PI / 2);
  near(presetOrbit('front', sphere, { headDirection: [1, 0, 0] }).yaw, Math.PI / 2);
  const focus = [-7, 3, -2];
  const close = presetOrbit('closeup', sphere, { focus });
  near(close.distance, cook.distance * 0.72); near(close.fov, 35);
  near(presetOrbit('closeup', sphere, { focus, zoom: 2 }).distance, close.distance / 2);
  const rig = createCameraRig(options);
  rig.applyPreset('closeup', { focus, zoom: 1.5 }, { immediate: true });
  const center = new THREE.Vector3(...focus).project(rig.camera);
  near(center.x, 0); near(center.y, 0);
});

test('手動操作中は次の手順を覚え、リセットでその手順に復帰する', () => {
  const rig = createCameraRig({ ...options, reducedMotion: true });
  rig.orbit(0.25, 0.1);
  const manual = rig.serialize(), focus = [-4, 2, 1];
  assert.equal(rig.userTouched, true);
  assert.equal(rig.applyPreset('top', { focus }, { immediate: true }), false);
  focus[0] = 9;
  assert.deepEqual(rig.serialize(), manual);
  rig.reset();
  assert.equal(rig.userTouched, false);
  near(rig.serialize().pitch, MAX_PITCH);
  assert.deepEqual(rig.serialize().target, [-4, 2, 1]);
  rig.orbit(0.1, 0);
  assert.equal(rig.applyPreset('side', {}, { force: true }), true);
  near(rig.serialize().pitch, 10 * RAD);
  const detached = rig.serialize();
  detached.target[0] = 99;
  assert.deepEqual(rig.serialize().target, sphere.center);
});

test('手で回す・寄る・平行移動する範囲と、画面の縦横切替を保つ', () => {
  const rig = createCameraRig({ ...options, reducedMotion: true });
  rig.setAspect(0.6);
  const fitted = rig.serialize().distance;
  assert.ok(fitted > presetOrbit('cook', sphere, { aspect: 1.4 }).distance);
  rig.orbit(120, 418);
  near(rig.serialize().pitch, MAX_PITCH);
  assert.ok(Math.abs(rig.serialize().yaw) <= Math.PI);
  rig.orbit(0, -1e5);
  near(rig.serialize().pitch, MIN_PITCH);
  rig.zoomBy(1e15); const closest = rig.serialize().distance;
  assert.ok(closest > 0 && closest < fitted);
  rig.zoomBy(1e15); near(rig.serialize().distance, closest);
  rig.zoomBy(1e-15); const furthest = rig.serialize().distance;
  rig.zoomBy(1e-15); near(rig.serialize().distance, furthest);
  rig.pan(2e6, -3e6);
  const offset = rig.serialize().target.map((v, i) => v - sphere.center[i]);
  near(Math.hypot(...offset), sphere.radius * 1.25);
  const manual = rig.serialize();
  rig.setAspect(2); rig.zoomBy(NaN); rig.pan(Infinity, 0);
  assert.deepEqual(rig.serialize(), manual);
});

test('左右反転すると任意の方位・焦点の投影が左右対称になり、高さと奥行きがそろう', () => {
  const rig = createCameraRig(options);
  rig.applyPreset('cook', { yaw: 0.7, focus: [4, 2, -3] }, { immediate: true });
  const v = new THREE.Vector3(-3, 5, 2);
  const before = v.clone().project(rig.camera);
  rig.setMirror(true);
  v.x *= -1;
  const after = v.project(rig.camera);
  near(after.x, -before.x); near(after.y, before.y); near(after.z, before.z);
});
