import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import * as THREE from '../../vendor/three.js';
import { createStage, createStudioRoom } from '../../lib/stage.js';
import { loadPreviewModel, placePreview } from '../../tools/viewer.mjs';

test('まな板は42×28×2 cmで上面が盤の原点に合い、丸みのある閉じた立体になる', () => {
  const stage = createStage();
  const board = stage.group.getObjectByName('board'), p = board.geometry.attributes.position;
  const box = new THREE.Box3().setFromObject(board, true);
  assert.deepEqual(box.getSize(new THREE.Vector3()).toArray(), [42, 2, 28]);
  assert.equal(box.max.y, stage.boardTop); assert.equal(stage.boardTop, 0);
  assert.ok(board.material.isMeshStandardMaterial && board.geometry.parameters.radius > 0);
  for (const a of Object.values(board.geometry.attributes)) assert.ok(a.array.every(Number.isFinite));
  const edges = new Map(), cross = new THREE.Vector3();
  let volume = 0;
  for (let i = 0; i < p.count; i += 3) {
    const tri = [0, 1, 2].map((j) => new THREE.Vector3().fromBufferAttribute(p, i + j));
    volume += tri[0].dot(cross.crossVectors(tri[1], tri[2])) / 6;
    const ids = tri.map((v) => v.toArray().map((n) => Math.round(n * 1e4)).join(','));
    assert.equal(new Set(ids).size, 3);
    for (let j = 0; j < 3; j++) {
      const edge = [ids[j], ids[(j + 1) % 3]].sort().join('|');
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  }
  assert.ok([...edges.values()].every((n) => n === 2));
  assert.ok(volume > 42 * 28 * 2 * 0.95 && volume < 42 * 28 * 2);
  stage.dispose();
});

test('主光・補助・縁取りが盤を照らし、軽めではにじむ接地影だけが残る', () => {
  const stage = createStage({ quality: 'high' });
  const [key, fill, rim] = stage.lights;
  assert.equal(stage.lights.length, 3);
  assert.ok(key.position.x < 0 && key.position.y > 0 && fill.position.x > 0 && rim.position.z < 0);
  assert.ok(stage.lights.every((l) => l.target.parent === stage.group));
  assert.ok(key.castShadow && !fill.castShadow && !rim.castShadow);
  let released = 0;
  key.shadow.map = new THREE.WebGLRenderTarget(8, 8);
  key.shadow.map.addEventListener('dispose', () => released++);
  stage.setQuality('standard');
  assert.equal(released, 1); assert.equal(key.shadow.map, null); assert.equal(key.shadow.mapSize.x, 512);
  stage.setQuality('light');
  assert.equal(key.castShadow, false);
  const contact = stage.group.getObjectByName('fish-contact');
  assert.ok(contact.visible && contact.position.y > stage.boardTop);
  const image = contact.material.map.image;
  const alpha = (x, y) => image.data[(y * image.width + x) * 4 + 3];
  assert.ok(alpha(32, 32) > alpha(48, 32) && alpha(48, 32) > alpha(63, 32));
  assert.equal(alpha(0, 0), 0);
  const bg = stage.background.image.data;
  assert.ok(bg[0] < bg.at(-4));
  stage.setContactBounds({ min: [-9, 0, 1], max: [1, 5, 5] });
  assert.ok(Math.abs(contact.position.x + 4) + Math.abs(contact.position.z - 3) < 1e-9);
  stage.setContactBounds({ min: [-10, 0, -2], max: [44, 5, 2] });
  assert.ok(contact.position.x + contact.scale.x / 2 < 21 && contact.material.map.repeat.x < 1);
  stage.setContactBounds({ min: [44, 0, -2], max: [51, 5, 2] }); assert.equal(contact.visible, false);
  stage.setContactBounds(null); assert.equal(contact.visible, false);
  stage.setQuality('high'); assert.equal(key.castShadow, true);
  stage.dispose();
});

test('環境マップ用の発光板は中心を向き、異なる方向に明部を作る', () => {
  const room = createStudioRoom(), center = new THREE.Vector3();
  assert.ok(room.isScene && room.background.isColor);
  assert.equal(room.children.length, 3);
  for (const panel of room.children) {
    assert.ok(panel.geometry.isBufferGeometry && panel.material.isMeshBasicMaterial);
    assert.ok(Math.max(...panel.material.color.toArray()) > 1);
    const toward = center.clone().sub(panel.position).normalize();
    assert.ok(panel.getWorldDirection(new THREE.Vector3()).dot(toward) > 0.999);
    const opposite = new THREE.Vector3(-panel.position.x, panel.position.y, panel.position.z);
    const twin = room.children.find((other) => other.position.equals(opposite));
    assert.ok(twin && twin.material.color.equals(panel.material.color));
    assert.equal(twin.geometry.parameters.width, panel.geometry.parameters.width);
    panel.geometry.dispose(); panel.material.dispose();
  }
});

test('左右反転で主光の影の投影も左右対称になり、盤の表面は片面のまま描ける', () => {
  const stage = createStage({ quality: 'high' }), scene = new THREE.Scene(), mirror = new THREE.Group();
  mirror.add(scene); scene.add(stage.group);
  const key = stage.lights[0], board = stage.group.getObjectByName('board');
  function shadowPoint(sx) {
    mirror.scale.x = sx;
    mirror.updateMatrixWorld(true);
    key.shadow.updateMatrices(key);
    assert.equal(Math.sign(board.matrixWorld.determinant()), sx);
    return new THREE.Vector3(sx * 6, 1.6, 3).applyMatrix4(key.shadow.matrix);
  }
  const a = shadowPoint(1), b = shadowPoint(-1);
  assert.ok(a.toArray().every((n) => n > 0 && n < 1));
  assert.ok(Math.abs(a.x + b.x - 1) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) < 1e-9);
  assert.equal(board.material.side, THREE.FrontSide);
  stage.dispose();
});

test('r186のPMREMが木目とは別の更新でスタジオを6方向から描画し、出力先を復元する', () => {
  let target = null, roomPasses = 0, filterPasses = 0;
  // GPU への最後の描画呼び出しを数える。投影・粗さ別のパス・テクスチャの割り当ては同梱版を使う。
  const renderer = { shadowMap: {}, xr: { enabled: true }, state: { buffers: { depth: { getReversed: () => false } } },
    autoClear: true, toneMapping: THREE.ACESFilmicToneMapping, getClearColor: (color) => color.set(0),
    getRenderTarget: () => target, getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
    setRenderTarget(t) { target = t; }, render(root) { if (root.isScene) roomPasses++; else filterPasses++; } };
  const stage = createStage({ renderer, quality: 'light', defer: true, createCanvas: () => null });
  stage.update(0); assert.equal(stage.ready, false); assert.equal(roomPasses, 0);
  stage.update(0); assert.equal(stage.ready, true); assert.equal(roomPasses, 6);
  assert.ok(filterPasses > 6 && stage.envTexture.isTexture);
  assert.equal(stage.envTexture.image.width, 384); assert.equal(stage.envTexture.image.height, 512);
  assert.equal(stage.envTexture.mapping, THREE.CubeUVReflectionMapping);
  assert.equal(target, null); assert.equal(renderer.xr.enabled, true);
  assert.equal(renderer.autoClear, true); assert.equal(renderer.toneMapping, THREE.ACESFilmicToneMapping);
  const texture = stage.envTexture;
  stage.setQuality('high'); stage.update(0); assert.equal(stage.envTexture, texture);
  assert.equal(renderer.shadowMap.type, THREE.PCFShadowMap); assert.equal(renderer.shadowMap.enabled, true);
  stage.restoreEnvironment(); stage.update(0); assert.notEqual(stage.envTexture, texture);
  assert.equal(roomPasses, 12);
  stage.dispose();
});

// DOM がない Node では描線の座標を記録し、同じ手順を実物の CanvasTexture に渡す。
function recordingCanvas() {
  const strokes = [];
  const ctx = { scale() {}, fillRect() {}, beginPath() {}, stroke() {},
    createLinearGradient: () => ({ addColorStop() {} }),
    moveTo: (...args) => strokes.push(args), lineTo: (...args) => strokes.push(args),
    bezierCurveTo: (...args) => strokes.push(args) };
  return { getContext: () => ctx, strokes };
}

test('木目と傷は段を変えても同じ位置で、古いテクスチャとステージを一度ずつ解放する', () => {
  const stage = createStage({ quality: 'high', createCanvas: recordingCanvas, defer: true });
  const wood = stage.group.getObjectByName('board').material;
  assert.equal(wood.map, null); assert.equal(stage.ready, false);
  stage.update(0);
  const first = wood.map;
  assert.equal(stage.ready, true);
  assert.ok(first.isCanvasTexture && first.image.strokes.length > 100);
  assert.equal(first.image.width, 1024); assert.equal(first.colorSpace, THREE.SRGBColorSpace);
  let released = 0;
  first.addEventListener('dispose', () => released++);
  stage.setQuality('light'); stage.update(0);
  assert.equal(released, 1); assert.equal(wood.map.image.width, 512);
  assert.deepEqual(wood.map.image.strokes, first.image.strokes);
  const second = wood.map;
  second.addEventListener('dispose', () => released++);
  stage.setQuality('standard'); stage.update(0); assert.equal(wood.map, second);
  const scene = new THREE.Scene();
  scene.add(stage.group);
  stage.dispose(); stage.dispose();
  assert.equal(released, 2); assert.equal(scene.children.length, 0);
});

test('撮影用の仮の魚は盤の中央に載り、接写の焦点は魚の外接箱に入る', async () => {
  const { id, model } = await loadPreviewModel(null, 'standard');
  assert.equal(id, 'placeholder');
  const { holder, bounds, focus } = placePreview(model, 2);
  assert.ok(Math.abs(bounds.min.y - 2) < 1e-9);
  assert.ok(bounds.containsPoint(new THREE.Vector3(...focus)));
  const actual = new THREE.Box3().setFromObject(holder, true);
  assert.ok(actual.min.distanceTo(bounds.min) < 1e-9 && actual.max.distanceTo(bounds.max) < 1e-9);
  const center = bounds.getCenter(new THREE.Vector3());
  assert.ok(Math.abs(center.x) + Math.abs(center.z) < 1e-8);
  model.dispose();
});

test('アジを指定すると手元のモデルを読み、未配置の間も撮影用の形を返す', async () => {
  const present = ['pieces.js', 'species/aji.js', 'rng.js'].every((path) => existsSync(new URL('../../lib/' + path, import.meta.url)));
  const { id, model } = await loadPreviewModel('aji', 'standard', 97);
  if (present) assert.equal(id, 'aji');
  if (!existsSync(new URL('../../lib/pieces.js', import.meta.url))) assert.equal(id, 'placeholder');
  assert.ok(model.group.isGroup);
  const { bounds } = placePreview(model, 0);
  assert.ok(!bounds.isEmpty() && Math.abs(bounds.min.y) < 1e-8);
  model.dispose();
});
