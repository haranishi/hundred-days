import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../../vendor/three.js';
import { PAD_FLAT } from '../../lib/foliage.js';
import { createView3D } from '../../lib/view3d.js';
import { makeSampleSkeleton } from '../fixtures/sample-skeleton.mjs';

function startView(t, { trackResources = false, ...options } = {}) {
  const frames = new Map();
  let serial = 0;
  let now = 100;
  let scene;
  let view;
  const raf = {
    requestAnimationFrame(callback) {
      frames.set(++serial, callback);
      return serial;
    },
    cancelAnimationFrame(id) { frames.delete(id); },
  };
  const descriptors = Object.keys(raf).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  t.after(() => {
    try {
      view?.dispose();
    } finally {
      for (const [key, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    }
  });
  for (const [key, value] of Object.entries(raf)) {
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  }

  class RendererProbe {
    shadowMap = {};
    info = { render: { triangles: 0, calls: 0 } };
    setPixelRatio() {}
    setSize() {}
    dispose() {}
    render(next) { scene = next; }
  }
  // GPUの代わりに、描画へ渡された本物のメッシュとその生成・解放を調べる。
  const tracked = {};
  const resources = [];
  if (trackResources) {
    for (const type of ['BufferGeometry', 'SphereGeometry', 'MeshStandardMaterial', 'MeshBasicMaterial', 'CanvasTexture', 'DataTexture', 'InstancedMesh']) {
      tracked[type] = class extends THREE[type] {
        constructor(...args) {
          super(...args);
          const lifetime = { object: this, disposals: 0 };
          resources.push(lifetime);
          this.addEventListener('dispose', () => { lifetime.disposals += 1; });
        }
      };
    }
  }
  const canvas = { addEventListener() {} };
  view = createView3D({ ...THREE, ...tracked, WebGLRenderer: RendererProbe, PMREMGenerator: undefined }, canvas, {
    gfx: 'low', createCanvas: () => null, ...options,
  });
  view.resize(390, 600);
  return {
    view, resources,
    pending: () => frames.size,
    find: (name) => scene?.getObjectByName(name),
    draw(ms = 50) {
      now += ms;
      const batch = [...frames.values()];
      frames.clear();
      for (const frame of batch) frame(now);
    },
  };
}

function near(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message}（${actual} / ${expected}）`);
}

test('候補の管は4色の不透明な面で、選んだ節だけ半径1.25倍または0.03になる', (t) => {
  const { view, draw, find } = startView(t, { gfx: 'test' });
  const skel = makeSampleSkeleton({ trunkNodes: 5, primaries: 0 });
  for (let i = 0; i < skel.count; i += 1) {
    skel.start.set([0, i * 0.4, 0], i * 3);
    skel.end.set([0, (i + 1) * 0.4, 0], i * 3);
    skel.quat.set([0, 0, 0, 1], i * 4);
    skel.r0[i] = skel.r1[i] = i < 3 ? 0.08 : 0.018;
  }
  view.setSkeleton(skel);
  view.setLook({ coverage: 0, season: 'winter' });
  for (const [tone, hex] of Object.entries({ cut: 0xe0482f, bend: 0x2f6fa3, pinch: 0xe8b030, select: 0xfff2c0 })) {
    // 同じ枝の離れた二節と重複を渡しても、隙間や未選択の根まで色をつけない。
    view.setHighlight({ nodes: Int32Array.of(1, 4, 1), tone });
    draw();
    const mesh = find('highlight-branch');
    assert.ok(mesh.visible);
    const { material, geometry } = mesh;
    assert.equal(material.color.getHex(), hex, `${tone}の色`);
    assert.ok(material.emissive.r + material.emissive.g + material.emissive.b > 0, '照明が消えると面の色が消える');
    assert.equal(material.transparent, false);
    assert.equal(material.opacity, 1);
    assert.equal(material.depthWrite, true);
    const indices = geometry.index.array.subarray(0, geometry.drawRange.count);
    const points = [...new Set(indices)].map((i) => [
      geometry.attributes.position.getX(i), geometry.attributes.position.getY(i), geometry.attributes.position.getZ(i),
    ]);
    assert.ok(points.every(([, y]) => (y >= 0.4 - 1e-6 && y <= 0.8 + 1e-6) || y >= 1.6 - 1e-6), '未選択の節にも面がある');
    assert.ok(points.some(([, y]) => y > 2), '先端の丸い面が選択されていない');
    for (const [level, radius] of [[0.6, 0.10], [2, 0.03]]) {
      const ring = points.filter(([, y]) => Math.abs(y - level) < 1e-6);
      assert.equal(ring.length, 8, `高さ${level}の断面がない`);
      for (const [x, , z] of ring) near(Math.hypot(x, z), radius, '候補の管の半径');
    }
  }
});

test('樹冠の殻は選んだパッドだけを覆い、芽摘みは1個、冬と候補解除で消える', (t) => {
  const { view, find, draw } = startView(t, { gfx: 'test' });
  const skel = makeSampleSkeleton();
  const { pads } = skel;
  const chosen = [1, 4];
  pads.density[6] = 0;
  const nodes = Int32Array.of(pads.node[4], 0, pads.node[1], pads.node[4], pads.node[6], -1, skel.count);
  view.setSkeleton(skel);
  view.setLook({ coverage: 1, season: 'autumn' });
  view.setHighlight({ nodes, tone: 'cut' });
  draw();
  const shells = find('highlight-pads');
  assert.equal(shells.visible, true);
  assert.equal(shells.count, 2);
  // 殻は、赤い葉・緑の葉のどちらの上でも見えるよう、淡い色を足し合わせる（朱だと赤い葉に埋もれる）
  assert.equal(shells.material.color.getHex(), 0xfff0c0);
  assert.equal(shells.material.transparent, true);
  assert.equal(shells.material.blending, THREE.AdditiveBlending);
  assert.equal(shells.material.opacity, 0.6);
  assert.equal(shells.material.depthWrite, false);
  assert.equal(shells.material.depthTest, true);
  assert.equal(shells.castShadow, false);
  assert.equal(shells.receiveShadow, false);
  const matrices = chosen.map(() => new THREE.Matrix4());
  matrices.forEach((matrix, i) => {
    shells.getMatrixAt(i, matrix);
    const center = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    matrix.decompose(center, rotation, scale);
    const p = chosen[i];
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation);
    assert.ok(center.distanceTo(new THREE.Vector3().fromArray(pads.center, p * 3)) < 1e-6);
    assert.ok(up.distanceTo(new THREE.Vector3().fromArray(pads.normal, p * 3)) < 1e-6);
    const radius = pads.radius[p] * 1.18;
    near(scale.x, radius, '殻の幅');
    near(scale.y, radius * PAD_FLAT, '殻の厚み');
    near(scale.z, radius, '殻の奥行き');
  });

  view.setHighlight({ nodes, tone: 'pinch' });
  draw();
  assert.equal(shells.count, 1);
  assert.equal(shells.material.color.getHex(), 0xffe070);
  const pinched = new THREE.Matrix4();
  shells.getMatrixAt(0, pinched);
  assert.ok(matrices.some((matrix) => matrix.equals(pinched)), '選んでいない先端が色づく');

  view.setLook({ coverage: 0, season: 'winter' });
  draw();
  assert.equal(shells.count, 0);
  assert.equal(shells.visible, false);
  assert.equal(find('highlight-branch').visible, true);
  view.setLook({ coverage: 1, season: 'autumn' });
  draw();
  assert.equal(shells.count, 1);
  view.setHighlight(null);
  draw();
  assert.equal(shells.count, 0);
  assert.equal(shells.visible, false);
  assert.equal(find('highlight-branch').visible, false);
});

test('脈動は実時間0.9秒で発光だけを変え、候補を外すと描画予約が止まる', (t) => {
  const { view, draw, find, pending } = startView(t);
  const skel = makeSampleSkeleton();
  view.setSkeleton(skel);
  view.setLook({ coverage: 0, season: 'winter' });
  draw();
  assert.equal(pending(), 0);
  view.setHighlight({ nodes: [skel.pads.node[0]], tone: 'bend' });
  for (const [ms, intensity] of [[50, 0.825], [225, 1], [450, 0.65], [225, 0.825]]) {
    draw(ms);
    const { material } = find('highlight-branch');
    near(material.emissiveIntensity, intensity, '0.9秒の正弦波');
    assert.equal(material.opacity, 1);
    assert.equal(pending(), 1);
  }
  view.setHighlight(null);
  draw();
  assert.equal(pending(), 0);
  view.setHighlight({ nodes: [-1, skel.count, 1.5], tone: 'cut' });
  draw();
  assert.equal(pending(), 0, '見える節がないのに脈動を続けている');
});

for (const options of [{ reducedMotion: true }, { gfx: 'test' }]) {
  test(`候補が静止する（${options.gfx ?? '動きの軽減'}）`, (t) => {
    const { view, draw, find, pending } = startView(t, options);
    const skel = makeSampleSkeleton();
    view.setSkeleton(skel);
    view.setHighlight({ nodes: [skel.pads.node[0]], tone: 'cut' });
    draw();
    const material = find('highlight-branch').material;
    assert.equal(material.emissiveIntensity, 1);
    assert.equal(pending(), 0);
    view.requestRender();
    draw(225);
    assert.equal(material.emissiveIntensity, 1);
    assert.equal(pending(), 0);
  });
}

test('候補を連打しても描画資源の生成数は一定で、描画を終了するとそれぞれ1回解放する', (t) => {
  const { view, draw, find, resources } = startView(t, { gfx: 'test', trackResources: true });
  const skel = makeSampleSkeleton();
  const candidate = { nodes: [skel.pads.node[0]], tone: 'cut' };
  view.setSkeleton(skel);
  view.setHighlight(candidate);
  draw();
  const branch = find('highlight-branch');
  const shells = find('highlight-pads');
  const count = resources.length;
  for (let i = 0; i < 32; i += 1) {
    view.setHighlight(null);
    draw();
    view.setHighlight({ nodes: [skel.pads.node[i % skel.pads.count]], tone: i % 2 ? 'bend' : 'cut' });
    draw();
    assert.equal(find('highlight-branch'), branch);
    assert.equal(find('highlight-pads'), shells);
    assert.equal(resources.length, count, '継続する操作でgeometry・material・textureが増えた');
  }

  const disposals = (object) => resources.find((resource) => resource.object === object).disposals;
  view.setSkeleton(makeSampleSkeleton({ seed: 2 }));
  view.setHighlight(candidate);
  draw();
  assert.equal(disposals(branch.geometry), 1, '交換した骨格の候補ジオメトリが残っている');
  const next = find('highlight-branch');
  assert.notEqual(next.geometry, branch.geometry);
  assert.equal(next.material, branch.material);
  assert.equal(find('highlight-pads'), shells);
  view.dispose();
  for (const object of [branch.geometry, next.geometry, next.material, shells, shells.geometry, shells.material]) {
    assert.equal(disposals(object), 1);
  }
});
