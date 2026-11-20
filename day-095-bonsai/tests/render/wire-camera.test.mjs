import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAMERA_DEFAULT, CAMERA_LIMITS } from '../../lib/contract.js';
import { cameraAxes, cameraOffset, clampCamera, frameDistance, lerpCamera, worldPerPixel, wrapAzimuth } from '../../lib/camera-math.js';
import { barkSample } from '../../lib/textures-tree.js';
import { WIRE_CLEARANCE, buildWireBuffers } from '../../lib/wire-mesh.js';
import { buildTreeBuffers } from '../../lib/tree-mesh.js';
import { makeSampleSkeleton } from '../fixtures/sample-skeleton.mjs';

test('針金: wires の本数だけあり、枝から clearance 分離れたらせん', () => {
  const skel = makeSampleSkeleton({ seed: 4 });
  const wires = buildWireBuffers(skel);
  assert.equal(wires.length, skel.wires.length);
  assert.equal(buildWireBuffers({ ...skel, wires: [] }).length, 0);
  const wire = wires[0];
  assert.ok(wire.vertexCount > 20);
  assert.equal(wire.index.length % 3, 0);
  for (let i = 0; i < wire.index.length; i += 1) assert.ok(wire.index[i] < wire.vertexCount);
  for (let i = 0; i < wire.position.length; i += 1) assert.ok(Number.isFinite(wire.position[i]));
  const tree = buildTreeBuffers(skel);
  const wired = new Set(skel.wires[0].nodes);
  let err = 0;
  let n = 0;
  for (let i = 0; i < wire.helixCount; i += 2) {
    const x = wire.helix[i * 3];
    const y = wire.helix[i * 3 + 1];
    const z = wire.helix[i * 3 + 2];
    // 幹や隣の枝ではなく、巻いている節の輪との距離。付け根は幹の中に入るので、全体の最近傍だと埋まったように見える。
    let best = Infinity;
    let index = -1;
    for (let r = 0; r < tree.ringCount; r += 1) {
      if (!wired.has(tree.ringNode[r])) continue;
      const dx = tree.ringCenter[r * 3] - x;
      const dy = tree.ringCenter[r * 3 + 1] - y;
      const dz = tree.ringCenter[r * 3 + 2] - z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < best) { best = d; index = r; }
    }
    const dist = Math.sqrt(best);
    const radius = tree.ringRadius[index];
    err += Math.abs(dist - (radius + WIRE_CLEARANCE));
    n += 1;
    assert.ok(dist > radius, '針金が枝の中に埋まった');
  }
  assert.ok(err / n < 0.02, `枝からの距離が一定でない ${err / n}`);
});

test('変異: 針金の本数を数えない実装は、空の wires と見本を区別できない', () => {
  const skel = makeSampleSkeleton({ seed: 1 });
  const one = buildWireBuffers(skel);
  const none = buildWireBuffers({ ...skel, wires: [] });
  assert.notEqual(one.length, none.length);
  assert.ok(one[0].helixCount > none.length);
});

test('針金: 幹の裾が広がった所でも一定の隙間を保つ', () => {
  const skel = makeSampleSkeleton({ trunkNodes: 1, primaries: 0, nodeLen: 0.5 });
  skel.wires = [{ nodes: Int32Array.of(0), age: 0 }];
  const [wire] = buildWireBuffers(skel);
  const [x, , z] = wire.helix;
  assert.ok(Math.abs(Math.hypot(x, z) - skel.r0[0] * 1.25 - WIRE_CLEARANCE) < 1e-6,
    '裾の広がりに追従せず、針金が幹に食い込む');
});

test('樹皮: 端がつながり、種で模様が違い、同じ座標は同じ色', () => {
  for (const species of ['maple', 'pine', 'plum']) {
    for (let i = 0; i < 12; i += 1) {
      const v = i / 12;
      const a = barkSample(species, 0, v, 3);
      const b = barkSample(species, 1, v, 3);
      assert.ok(Math.abs(a.r - b.r) < 2 && Math.abs(a.g - b.g) < 2, `${species} の横端が切れている`);
      const c = barkSample(species, v, 0, 3);
      const d = barkSample(species, v, 1, 3);
      assert.ok(Math.abs(c.r - d.r) < 2 && Math.abs(c.h - d.h) < 0.05, `${species} の縦端が切れている`);
      assert.deepEqual(barkSample(species, 0.3, 0.4, 9), barkSample(species, 0.3, 0.4, 9));
    }
  }
  const maple = barkSample('maple', 0.2, 0.4, 2);
  const pine = barkSample('pine', 0.2, 0.4, 2);
  assert.notEqual(maple.r, pine.r);
  let pineLow = 1;
  let mapleLow = 1;
  for (let y = 0; y < 24; y += 1) {
    for (let x = 0; x < 24; x += 1) {
      pineLow = Math.min(pineLow, barkSample('pine', x / 24, y / 24, 4).h);
      mapleLow = Math.min(mapleLow, barkSample('maple', x / 24, y / 24, 4).h);
    }
  }
  assert.ok(pineLow < mapleLow - 0.1, '黒松の割れ目が浅すぎる');
});

test('カメラ: 範囲・方位の短い補間・+Z 前方・画面の尺度', () => {
  const cam = clampCamera({ az: 400, pol: 2, dist: 100, target: [9, 9, 9] });
  assert.ok(cam.pol >= CAMERA_LIMITS.polMin && cam.pol <= CAMERA_LIMITS.polMax);
  assert.ok(cam.dist <= CAMERA_LIMITS.distMax && cam.dist >= CAMERA_LIMITS.distMin);
  const offset = cam.target.map((v, i) => v - CAMERA_DEFAULT.target[i]);
  assert.ok(Math.hypot(...offset) <= CAMERA_LIMITS.panMax + 1e-6);
  assert.ok(Math.abs(wrapAzimuth(190) - (-170)) < 1e-9);
  const mid = lerpCamera({ az: 350, pol: 70, dist: 8, target: [0, 1.5, 0] }, { az: 10, pol: 70, dist: 8, target: [0, 1.5, 0] }, 0.5);
  assert.ok(Math.abs(wrapAzimuth(mid.az)) < 30, `長い回り道 ${mid.az}`);
  const eye = cameraOffset(0, 72, 8);
  assert.ok(eye[2] > 0 && eye[1] > 0 && Math.abs(eye[0]) < 1e-9, 'az=0 が +Z の前でない');
  const axes = cameraAxes(0, 72);
  assert.ok(axes.right[0] > 0.9, '右が +X でない');
  const px = worldPerPixel(30, 800, 8);
  assert.ok(px > 0 && px < 0.02);
  const dist = frameDistance({ min: [0, 0, 0], max: [1, 2, 1] }, 30, 0.8, { usable: 0.8 });
  assert.ok(dist > frameDistance({ min: [0, 0, 0], max: [1, 2, 1] }, 30, 0.8, { usable: 1 }));
});
