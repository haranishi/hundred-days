import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../../vendor/three.js';
import { worldPerPixel } from '../../lib/camera-math.js';
import { buildTreeBuffers } from '../../lib/tree-mesh.js';
import { buildWireBuffers } from '../../lib/wire-mesh.js';
import { makeSampleSkeleton } from '../fixtures/sample-skeleton.mjs';

function straightBranch(r0, r1 = r0) {
  const skel = makeSampleSkeleton({ trunkNodes: 2, primaries: 0 });
  skel.r0.fill(r0);
  skel.r1.set([r0, r1]);
  skel.start.set([0, 0.4, 0], 3);
  skel.end.set([0, 0.4, 0, 0, 1.2, 0]);
  skel.quat.set([0, 0, 0, 1], 4);
  skel.wires = [{ nodes: Int32Array.of(1), age: 0 }];
  return skel;
}

test('針金の管は全断面で直径0.024あり、両端の穴を閉じる', () => {
  const [wire] = buildWireBuffers(straightBranch(0.08, 0.018));
  assert.ok(wire.helixCount > 10);
  const sides = wire.vertexCount / wire.helixCount;
  assert.ok(Number.isInteger(sides) && sides >= 3);
  let diameter;
  for (let h = 0; h < wire.helixCount; h += 1) {
    const center = new THREE.Vector3().fromArray(wire.helix, h * 3);
    for (let k = 0; k < sides; k += 1) {
      const point = new THREE.Vector3().fromArray(wire.position, (h * sides + k) * 3);
      diameter = 2 * point.distanceTo(center);
      assert.ok(Math.abs(diameter - 0.024) < 1e-6, `断面 ${h} の直径が ${diameter}`);
    }
  }
  assert.ok(diameter / worldPerPixel(30, 600, 8.5) > 3, '390px幅の既定視点で線が細すぎる');

  const edges = new Map();
  for (let i = 0; i < wire.index.length; i += 3) {
    const triangle = wire.index.subarray(i, i + 3);
    for (let k = 0; k < 3; k += 1) {
      const a = triangle[k];
      const b = triangle[(k + 1) % 3];
      const edge = `${Math.min(a, b)}:${Math.max(a, b)}`;
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  }
  assert.ok([...edges.values()].every((n) => n === 2), '針金の端が開いている');
});

function measuredPitch(wire, from, to) {
  const angle = (i) => Math.atan2(wire.helix[3 * i], wire.helix[3 * i + 2]);
  let rotation = 0;
  for (let i = from + 1; i <= to; i += 1) {
    const diff = angle(i) - angle(i - 1);
    const step = Math.atan2(Math.sin(diff), Math.cos(diff));
    assert.ok(step > 0, '巻く方向が途中で逆になった');
    rotation += step;
  }
  return (wire.helix[3 * to + 1] - wire.helix[3 * from + 1]) * Math.PI * 2 / rotation;
}

test('巻きのピッチは枝の半径の3.2倍を追い、細い枝でも0.07を下回らない', () => {
  for (const [radius, expected] of [[0.065, 0.208], [0.018, 0.07]]) {
    const [wire] = buildWireBuffers(straightBranch(radius));
    const result = measuredPitch(wire, 0, wire.helixCount - 1);
    assert.ok(Math.abs(result - expected) < 1e-6, `半径 ${radius} のピッチが ${result}`);
  }
  const [wire] = buildWireBuffers(straightBranch(0.09, 0.018));
  const n = wire.helixCount - 1;
  assert.ok(measuredPitch(wire, 0, 8) > 0.25);
  assert.ok(measuredPitch(wire, n - 4, n) < 0.08);
});

test('針金の両端の内側にある頂点は、枝の実際の樹皮面まで届く', () => {
  const skel = straightBranch(0.09, 0.035);
  const [wire] = buildWireBuffers(skel);
  const tree = buildTreeBuffers(skel, { nebari: false });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(tree.position, 3));
  geometry.setIndex(new THREE.BufferAttribute(tree.index, 1));
  const material = new THREE.MeshBasicMaterial();
  const bark = new THREE.Mesh(geometry, material);
  try {
    const sides = wire.vertexCount / wire.helixCount;
    for (const h of [0, wire.helixCount - 1]) {
      const center = new THREE.Vector3().fromArray(wire.helix, h * 3);
      const direction = new THREE.Vector3(-center.x, 0, -center.z).normalize();
      const [hit] = new THREE.Raycaster(center, direction).intersectObject(bark);
      assert.ok(hit, '針金の端から枝に向けて樹皮に当たらない');
      let reach = 0;
      for (let k = 0; k < sides; k += 1) {
        const tip = new THREE.Vector3().fromArray(wire.position, (h * sides + k) * 3);
        reach = Math.max(reach, tip.sub(center).dot(direction));
      }
      assert.ok(hit.distance > 0.005 && hit.distance <= reach + 1e-6, `端が樹皮の外に浮いている（距離 ${hit.distance}、管は ${reach} まで）`);
    }
  } finally {
    geometry.dispose();
    material.dispose();
  }
});
