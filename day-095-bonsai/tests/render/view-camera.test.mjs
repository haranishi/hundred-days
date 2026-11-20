import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../../vendor/three.js';
import { CAMERA_DEFAULT, CAMERA_LIMITS } from '../../lib/contract.js';
import { FRAME_FILL, skeletonBounds } from '../../lib/camera-math.js';
import { createView3D } from '../../lib/view3d.js';
import { makeSampleSkeleton } from '../fixtures/sample-skeleton.mjs';

function startView(t, options = {}) {
  const frames = new Map();
  let serial = 0;
  let time = 100;
  let view;
  const globals = new Map();
  t.after(() => {
    try {
      view?.dispose();
    } finally {
      for (const [name, before] of globals) {
        if (before) Object.defineProperty(globalThis, name, before);
        else delete globalThis[name];
      }
    }
  });
  function replace(name, value) {
    globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  replace('requestAnimationFrame', (callback) => {
    frames.set(++serial, callback);
    return serial;
  });
  replace('cancelAnimationFrame', (id) => frames.delete(id));

  let renderer;
  class RendererProbe {
    constructor() {
      renderer = this;
      this.shadowMap = {};
      this.info = { render: { triangles: 0, calls: 0 } };
      this.target = null;
      this.draws = 0;
    }

    setPixelRatio() {}
    setSize() {}
    dispose() {}
    getRenderTarget() { return this.target; }
    setRenderTarget(target) { this.target = target; }
    render(scene, camera) {
      this.draws += 1;
      scene.updateMatrixWorld();
      this.scene = scene;
      this.camera = camera;
      if (this.target) {
        const highlights = [];
        scene.traverseVisible((obj) => { if (obj.name.startsWith('highlight-')) highlights.push(obj.name); });
        this.photo = { camera: camera.clone(), size: [this.target.width, this.target.height], highlights };
      }
    }

    readRenderTargetPixels() {
      if (this.readError) throw this.readError;
    }
  }

  let width = 390;
  let height = 600;
  const canvas = {
    addEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
  };
  const band = [];
  const createCanvas = (w, h) => w === 1080 && h === 1350 ? {
    getContext: () => ({
      createImageData: () => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData() {},
      fillRect: (...rect) => band.push(rect),
      fillText() {},
    }),
    toBlob: (done, type) => done(new Blob(['photo'], { type })),
  } : null;
  // 投影・ジオメトリは three.js 本体を使い、GPU を呼ぶ部分だけを差し替える。
  view = createView3D({ ...THREE, WebGLRenderer: RendererProbe, PMREMGenerator: undefined }, canvas, {
    gfx: 'test', createCanvas, ...options,
  });
  return {
    view, renderer, band,
    size(w, h) {
      width = w;
      height = h;
      view.resize(w, h);
    },
    draw(count = 1, frameMs = 50) {
      for (let i = 0; i < count; i += 1) {
        time += frameMs;
        const batch = [...frames.values()];
        frames.clear();
        for (const callback of batch) callback(time);
      }
    },
  };
}

function assertInFrame(bounds, camera, { bottom = -FRAME_FILL, top = FRAME_FILL } = {}) {
  const { min, max } = bounds;
  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) {
      for (const z of [min[2], max[2]]) {
        const p = new THREE.Vector3(x, y, z).project(camera);
        assert.ok(Math.abs(p.x) <= FRAME_FILL + 1e-6 && p.y >= bottom - 1e-6 && p.y <= top + 1e-6 && Math.abs(p.z) <= 1,
          `点 (${x}, ${y}, ${z}) が余白の外へ出た: ${p.toArray()}`);
      }
    }
  }
}

function potBounds(renderer) {
  const pot = new THREE.Box3().setFromObject(renderer.scene.getObjectByName('pot'));
  return { min: pot.min.toArray(), max: pot.max.toArray() };
}

test('既定の視点: 縦横のキャンバスで木・鉢・卓の手前を描画し、reset で各画角に戻る', (t) => {
  const probe = startView(t);
  const { view, renderer } = probe;
  const skel = makeSampleSkeleton({ seed: 11 });
  probe.size(390, 600);
  view.setSkeleton(skel);
  probe.draw();
  const narrow = view.camera.get();
  const verifyStage = () => {
    assertInFrame(skeletonBounds(skel), renderer.camera);
    const pot = potBounds(renderer);
    assertInFrame(pot, renderer.camera);
    const table = renderer.scene.getObjectByName('table');
    const z = new THREE.Box3().setFromObject(table).max.z;
    assertInFrame({
      min: [pot.min[0], table.position.y - 0.25, z],
      max: [pot.max[0], table.position.y, z],
    }, renderer.camera);
  };
  verifyStage();
  view.setPot('round-blue');
  probe.size(1440, 641);
  probe.draw();
  const wide = view.camera.get();
  verifyStage();
  assert.ok(narrow.dist > wide.dist + 1);

  view.camera.set({ az: -35, pol: 74, dist: 4.2 });
  view.camera.reset({ animate: false });
  probe.draw();
  assert.deepEqual(view.camera.get(), wide);
  verifyStage();
});

test('起動時に app が cam を指定すると、その視点で開き、reset で現在の木に合わせる', (t) => {
  const probe = startView(t);
  const { view, renderer } = probe;
  const skel = makeSampleSkeleton({ seed: 5 });
  probe.size(390, 600);
  view.setSkeleton(skel);
  const url = { az: -30, pol: 76, dist: 6.5 };
  view.camera.set(url, { animate: false });
  probe.draw();
  assert.deepEqual(view.camera.get(), { ...url, target: CAMERA_DEFAULT.target });
  view.camera.reset();
  probe.draw();
  assert.equal(view.camera.get().az, CAMERA_DEFAULT.az);
  assertInFrame(skeletonBounds(skel), renderer.camera);
});

test('成長: 収まる間は視点を保ち、はみ出すと約0.9秒で引く。手動操作後は reset まで停止', (t) => {
  const probe = startView(t, { gfx: 'low' });
  const { view, renderer } = probe;
  const sample = () => makeSampleSkeleton({ seed: 11 });
  probe.size(390, 600);
  view.setSkeleton(sample());
  probe.draw();
  const before = view.camera.get();
  view.setSkeleton(sample());
  probe.draw(20);
  assert.deepEqual(view.camera.get(), before);

  const grown = sample();
  grown.pads.center[0] += 6;
  view.setSkeleton(grown);
  assert.deepEqual(view.camera.get(), before);
  probe.draw(7);
  const midway = view.camera.get();
  assert.ok(midway.dist > before.dist);
  probe.draw(13);
  assert.ok(view.camera.get().dist > midway.dist);
  assertInFrame(skeletonBounds(grown), renderer.camera);

  grown.pads.center[0] += 4;
  view.setSkeleton(grown);
  probe.draw(3);
  const during = view.camera.get();
  view.camera.set({ az: during.az - 20, pol: during.pol });
  const manual = view.camera.get();
  assert.equal(manual.dist, during.dist);
  assert.deepEqual(manual.target, during.target);
  grown.pads.center[0] += 3;
  view.setSkeleton(grown);
  probe.draw(20);
  assert.deepEqual(view.camera.get(), manual);
  // 一度手で回したあとも、無操作の自動回転（方位だけ・補間なし）は受け付ける（要件1.4。レビューの指摘）。
  // ただし、距離と注視点は動かさない（手で寄せた構図を、自動の収まりで壊さない）
  view.camera.set({ az: manual.az + 1 }, { animate: false });
  probe.draw();
  const rotated = view.camera.get();
  assert.equal(rotated.az, manual.az + 1, '手で回したあと、自動回転が再開しない');
  assert.equal(rotated.dist, manual.dist);
  assert.deepEqual(rotated.target, manual.target);

  view.camera.reset({ animate: true });
  probe.draw(12);
  assertInFrame(skeletonBounds(grown), renderer.camera);
  const afterReset = view.camera.get();
  grown.pads.center[0] += 5;
  view.setSkeleton(grown);
  probe.draw(20);
  assert.ok(view.camera.get().dist > afterReset.dist, 'reset の後も自動の収まりが停止している');
  assertInFrame(skeletonBounds(grown), renderer.camera);
});

test('動きの軽減では成長に即時追従し、fit に必要なときだけ距離の上限を広げる', (t) => {
  const { view, size, draw } = startView(t, { gfx: 'low', reducedMotion: true });
  size(800, 600);
  const skel = makeSampleSkeleton({ trunkNodes: 4, primaries: 0 });
  view.setSkeleton(skel);
  draw();
  assert.deepEqual(view.camera.distanceLimits(), {
    distMin: CAMERA_LIMITS.distMin, distMax: CAMERA_LIMITS.distMax,
  });
  const before = view.camera.get();
  skel.bounds.max[0] += 9;
  view.setSkeleton(skel, { animate: true });
  const fit = view.camera.get();
  assert.ok(fit.dist > Math.max(before.dist, CAMERA_LIMITS.distMax));
  assert.equal(view.camera.distanceLimits().distMax, fit.dist * 1.35);
  view.camera.set({ dist: fit.dist * 2 });
  assert.equal(view.camera.get().dist, fit.dist * 1.35);
  view.camera.reset({ animate: true });
  assert.deepEqual(view.camera.get(), fit);
});

test('camera.fit: 指定した箱に現在の向きで合わせ、その構図を reset に使う', (t) => {
  const { view, renderer, size, draw } = startView(t);
  size(390, 600);
  view.setSkeleton(makeSampleSkeleton({ seed: 2 }));
  view.camera.set({ az: 47, pol: 61, dist: 3.2 });
  draw();
  const box = { min: [-4, -0.8, -2], max: [0.5, 3.8, 2.2] };
  view.camera.fit(box, { animate: true });
  draw();
  const fit = view.camera.get();
  assert.equal(fit.az, 47);
  assert.equal(fit.pol, 61);
  assertInFrame(box, renderer.camera);
  view.camera.set({ az: 25, pol: 80, dist: 7 });
  view.camera.reset();
  assert.deepEqual(view.camera.get(), fit);
});

test('針金: 明るい銅のまま、視点を引くと同じジオメトリの断面だけが広がる', (t) => {
  const { view, renderer, size, draw } = startView(t, { gfx: 'low' });
  size(390, 600);
  view.setSkeleton(makeSampleSkeleton());
  view.camera.set({ dist: 8.5 });
  draw();
  const wire = renderer.scene.getObjectByName('branch-wire');
  const { geometry, material } = wire;
  assert.equal(material.color.getHex(), 0xd98c4a);
  assert.equal(material.emissive.getHex(), 0x3a1c08);
  assert.equal(material.metalness, 0.8);
  assert.equal(material.roughness, 0.35);
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, uniforms: {} };
  material.onBeforeCompile(shader, renderer);
  assert.match(shader.vertexShader, /uniform float wireExpansion;/);
  assert.match(shader.vertexShader, /#include <begin_vertex>\s+transformed \+= normal \* wireExpansion;/);
  const expansion = shader.uniforms.wireExpansion;
  assert.equal(expansion.value, 0);

  function assertExpansion(diameter) {
    assert.ok(Math.abs(0.024 + 2 * expansion.value - diameter) < 1e-9);
    assert.equal(renderer.scene.getObjectByName('branch-wire').geometry, geometry);
    assert.equal(geometry.attributes.position.version, 0);
  }
  view.camera.set({ dist: 13 }, { animate: true, ms: 200 });
  draw(2);
  const midway = view.camera.get().dist;
  assert.ok(midway > 8.5 && midway < 13);
  assertExpansion(0.024 * midway / 8.5);
  draw(4);
  assertExpansion(0.024 * 13 / 8.5);

  view.camera.fit({ min: [-16, 0, -1], max: [16, 3, 1] });
  draw();
  assert.ok(view.camera.get().dist > 8.5 * 2.2);
  assertExpansion(0.024 * 2.2);
  view.camera.set({ dist: 4 });
  draw();
  assertExpansion(0.024);
});

test('写真: 1080×1350の構図と帯を描き、候補を写さず閲覧中の視点と候補を復元する', async (t) => {
  const { view, renderer, band, size, draw } = startView(t);
  size(390, 600);
  const skel = makeSampleSkeleton({ seed: 11 });
  view.setSkeleton(skel);
  view.camera.set({ az: -37, pol: 69, dist: 4.2 });
  view.setHighlight({ nodes: Int32Array.of(skel.pads.node[0]), tone: 'cut' });
  draw();
  const overlay = renderer.scene.getObjectByName('highlight-branch').parent;
  assert.equal(overlay.visible, true);
  const camera = view.camera.get();
  const point = [0, 0.5, 0];
  const before = view.camera.project(point);
  const png = await view.capturePhoto();
  assert.equal(png.type, 'image/png');
  assert.deepEqual(renderer.photo.size, [1080, 1350]);
  assert.deepEqual(renderer.photo.highlights, []);
  assert.deepEqual(band[0], [0, 1134, 1080, 216]);
  const available = 1134 / 1350;
  const crop = { bottom: 1 - available - FRAME_FILL * available, top: 1 - available + FRAME_FILL * available };
  assertInFrame(skeletonBounds(skel), renderer.photo.camera, crop);
  assertInFrame(potBounds(renderer), renderer.photo.camera, crop);
  assert.deepEqual(view.camera.get(), camera);
  assert.deepEqual(view.camera.project(point), before);
  assert.equal(overlay.visible, true);

  renderer.readError = new Error('読み出し失敗');
  await assert.rejects(view.capturePhoto(), /読み出し失敗/);
  assert.equal(renderer.getRenderTarget(), null);
  assert.deepEqual(view.camera.project(point), before);
  assert.equal(overlay.visible, true);
});

test('作り直し前のカメラは既定の範囲外の引きと注視点も保つ', (t) => {
  const { view, draw, size } = startView(t);
  size(160, 600);
  view.setSkeleton(makeSampleSkeleton());
  const beforeRestart = { az: -32, pol: 74, dist: 22, target: [0, 3.2, 0] };
  view.camera.set(beforeRestart, { animate: false, restore: true });
  draw();
  assert.deepEqual(view.camera.get(), beforeRestart);
});

for (const manual of [undefined, true]) {
  test(`復元した${manual ? '手動視点は幅の変化や成長で動かない' : '自動視点は幅の変化と成長に合わせて収まる'}`, (t) => {
    const { view, renderer, size, draw } = startView(t);
    const skel = makeSampleSkeleton({ seed: 11 });
    size(960, 600);
    view.setSkeleton(skel);
    const pose = { ...CAMERA_DEFAULT, dist: 7 };
    view.camera.set(pose, { restore: true, ...(manual ? { manual } : {}) });
    draw();
    assert.equal(view.camera.isManual(), !!manual);
    assert.deepEqual(view.camera.get(), pose);

    size(220, 600);
    draw();
    const narrow = view.camera.get();
    if (manual) assert.deepEqual(narrow, pose);
    else {
      assert.ok(narrow.dist > pose.dist);
      assertInFrame(skeletonBounds(skel), renderer.camera);
      assertInFrame(potBounds(renderer), renderer.camera);
    }

    const grown = makeSampleSkeleton({ seed: 11 });
    grown.pads.center[0] += 12;
    view.setSkeleton(grown);
    draw();
    if (manual) assert.deepEqual(view.camera.get(), pose);
    else {
      assert.ok(view.camera.get().dist > narrow.dist);
      assertInFrame(skeletonBounds(grown), renderer.camera);
    }
  });
}

test('遅延準備は質感ごとに処理を返し、コンパイルのあとで最初のフレームを描く', async (t) => {
  const canvases = [];
  const { view, renderer, draw } = startView(t, {
    gfx: 'mid', deferTextures: true, createCanvas(w, h) { canvases.push([w, h]); return null; },
  });
  view.setSkeleton(makeSampleSkeleton());
  draw();
  assert.equal(renderer.draws, 0);
  assert.deepEqual(canvases.splice(0), [[8, 64]], '背景の小さな勾配だけは先に用意する');

  const stages = [];
  let finishCompile;
  renderer.compileAsync = (scene, camera) => {
    assert.ok(scene.getObjectByName('bonsai'));
    assert.ok(camera.isPerspectiveCamera);
    return new Promise((resolve) => { finishCompile = resolve; });
  };
  let finished = false;
  const prepared = view.prepare({ yieldToMain: async () => { stages.push(canvases.splice(0)); } });
  void prepared.then(() => { finished = true; });
  await new Promise(setImmediate);
  assert.deepEqual(stages, [
    [],
    ...Array.from({ length: 5 }, () => [[512, 512]]),
    [[256, 256], [256, 256]], [[208, 208]], [],
  ]);
  assert.equal(finished, false);
  draw();
  assert.equal(renderer.draws, 0);
  finishCompile();
  await prepared;
  draw();
  assert.equal(renderer.draws, 1);

  view.setPot('round-blue');
  assert.equal(canvases.length, 0);
  await new Promise(setImmediate);
  assert.deepEqual(stages.at(-1), []);
  assert.deepEqual(canvases, [[512, 512]]);
  draw();
  assert.equal(renderer.draws, 2);
});

test('遅延準備中に破棄すると、待機後に次の質感もコンパイルも始めない', async (t) => {
  const canvases = [];
  const { view, renderer, draw } = startView(t, {
    gfx: 'mid', deferTextures: true, createCanvas(w, h) { canvases.push([w, h]); return null; },
  });
  const yields = [];
  let compileCount = 0;
  renderer.compileAsync = async () => { compileCount += 1; };
  const preparing = view.prepare({ yieldToMain: () => new Promise((resolve) => yields.push(resolve)) });
  yields.shift()();
  await new Promise(setImmediate);
  assert.equal(yields.length, 1);
  assert.deepEqual(canvases, [[8, 64], [512, 512]]);
  view.dispose();
  yields.shift()();
  await preparing;
  assert.deepEqual(canvases, [[8, 64], [512, 512]]);
  assert.equal(compileCount, 0);
  draw();
  assert.equal(renderer.draws, 0);
});

test('試験用の画質は同期の質感生成を保ち、準備を呼んでもコンパイルや待機をしない', async (t) => {
  const widths = [];
  const { view, renderer, draw } = startView(t, {
    gfx: 'test', deferTextures: true, createCanvas(w) { widths.push(w); return null; },
  });
  renderer.compileAsync = async () => assert.fail('試験の初回描画はコンパイルを待たない');
  view.setSkeleton(makeSampleSkeleton());
  assert.deepEqual(widths, [128, 128, 128, 128, 128, 8, 64, 64, 64]);
  await view.prepare({ yieldToMain: () => assert.fail('試験は同期で準備する') });
  draw();
  assert.equal(renderer.draws, 1);
});

test('実行時の描画間隔は動いている間の生の値だけを送り、静止時に描き続けない', (t) => {
  const intervals = [];
  const { view, renderer, draw } = startView(t, { gfx: 'mid', onFrame: (ms) => intervals.push(ms) });
  view.setSkeleton(makeSampleSkeleton());
  draw(3);
  for (const az of [24, 28, 32]) {
    view.camera.set({ az }, { animate: false });
    draw(1, 80);
  }
  assert.deepEqual(intervals, [80, 80]);
  const count = renderer.draws;
  draw(5, 80);
  assert.equal(renderer.draws, count);
  view.camera.set({ az: 36 }, { animate: true, ms: 400 });
  draw(2, 90);
  assert.deepEqual(intervals, [80, 80, 90]);
});

test('コンパイル待ちに樹種が変わったときも、現在の樹種の質感を準備する', async (t) => {
  const widths = [];
  const { view, renderer, draw } = startView(t, {
    gfx: 'mid', deferTextures: true, createCanvas(w) { widths.push(w); return null; },
  });
  view.setSkeleton(makeSampleSkeleton());
  const compiles = [];
  renderer.compileAsync = () => new Promise((resolve) => compiles.push(resolve));
  const preparing = view.prepare({ yieldToMain: async () => {} });
  await new Promise(setImmediate);
  assert.equal(compiles.length, 1);
  assert.deepEqual(widths.splice(-3), [256, 256, 208]);

  view.setSpecies('plum');
  compiles.shift()();
  await new Promise(setImmediate);
  assert.equal(compiles.length, 1);
  assert.deepEqual(widths.slice(-4), [256, 256, 208, 208]);
  draw();
  assert.equal(renderer.draws, 0);
  compiles.shift()();
  await preparing;
  draw();
  assert.equal(renderer.draws, 1);
});

test('コンパイルや鉢の質感を待つ途中で鉢が替わっても、最後の鉢の質感を最初の描画に使う', async (t) => {
  let scene;
  let finishCompile;
  let finishPotYield;
  let waitForPot = false;
  const { view, renderer, draw } = startView(t, {
    gfx: 'low', deferTextures: true,
    createCanvas(w) {
      return waitForPot && w === 256 ? {
        getContext: () => ({
          createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
          putImageData() {},
        }),
      } : null;
    },
  });
  view.setSkeleton(makeSampleSkeleton());
  renderer.compileAsync = (next) => {
    scene = next;
    if (!finishCompile) return new Promise((resolve) => { finishCompile = resolve; });
  };
  let prepared = false;
  const preparing = view.prepare({ yieldToMain: () => {
    if (waitForPot && !finishPotYield) return new Promise((resolve) => { finishPotYield = resolve; });
  } }).then(() => { prepared = true; });
  await new Promise(setImmediate);

  view.setPot('round-blue');
  waitForPot = true;
  finishCompile();
  await new Promise(setImmediate);
  assert.equal(prepared, false);
  draw();
  assert.equal(renderer.draws, 0);

  view.setPot('rect-grey');
  const lastPot = scene.getObjectByName('pot');
  assert.equal(lastPot.material.map, null);
  finishPotYield();
  await preparing;
  assert.ok(lastPot.material.map?.isTexture);
  draw();
  assert.equal(renderer.draws, 1);
  assert.equal(renderer.scene.getObjectByName('pot'), lastPot);
});
