import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.js';
import { createAnatomy } from '../../lib/anatomy.js';
import { getSpecies } from '../../lib/species/index.js';
import { createRng } from '../../lib/rng.js';
import { createGuides, pointAtCutDepth } from '../../lib/guides.js';
import { placeCaption } from '../../lib/scene-overlay.js';
import { buildFishModel, visitPieceMeshes } from '../../lib/pieces.js';
import { makeBasicMaterials } from '../../lib/materials-basic.js';
import { createFishDisplay } from '../../lib/scene-fish.js';
import { createStage } from '../../lib/stage.js';
import { stateAt } from '../../lib/timeline.js';
import aji from '../../lib/procedures/aji.js';

const anatomy = createAnatomy(getSpecies('aji'), { segments: 32 });
const matrix = new THREE.Matrix4().makeTranslation(-6, 3, 1);
const pose = { matrixFor: () => matrix, visible: () => true };
const empty = { highlights: [], effects: [], incisions: [] };

test('内側の線の深度・逆向きの矢印・完了と巻き戻し・練習での再表示を切り替えます', () => {
  const g = createGuides(anatomy, createRng(4));
  try {
    const cut = { curve: 'boneCut', side: 'R', reverse: true }, step = { cuts: [cut] };
    const forward = anatomy.curve(cut.curve, cut.side).points;
    assert.deepEqual(g.curvePoints(cut), forward.slice().reverse());
    function update(xray, incisions = [], practice = null) { g.update({ ...empty, incisions }, step, pose, xray, practice, 0); }
    update(0.3);
    const mesh = g.group.children[0];
    assert.equal(mesh.material.depthTest, true);
    assert.deepEqual(mesh.matrix.elements, matrix.elements);
    const { position, aArc, aTangent } = mesh.geometry.attributes;
    const v = new THREE.Vector3(), tangent = new THREE.Vector3().fromArray(forward[0]).sub(new THREE.Vector3().fromArray(forward[1]));
    assert.ok(v.fromBufferAttribute(position, 0).distanceTo(new THREE.Vector3().fromArray(forward.at(-1))) < 1e-5);
    assert.ok(aArc.getX(aArc.count - 1) < 0);
    assert.ok(v.fromBufferAttribute(aTangent, aTangent.count - 1).dot(tangent.normalize()) > 0.9999);
    update(0.31); assert.equal(mesh.material.depthTest, false);
    cut.through = true; update(0); assert.equal(mesh.material.depthTest, false);
    update(0, [{ ...cut, progress: 0.55 }]); assert.ok(mesh.visible && mesh.material.uniforms.uStart.value > 0);
    update(0, [{ ...cut, progress: 1 }]); assert.equal(mesh.visible, false);
    update(0, [{ ...cut, progress: 1 }], cut); assert.ok(mesh.visible); assert.equal(mesh.material.uniforms.uStart.value, 0);
    update(0); assert.ok(mesh.visible);
    g.update({ ...empty, highlights: [{ curve: cut.curve, side: cut.side, opacity: 1 }],
      incisions: [{ ...cut, progress: 1 }] }, {}, pose, 1, null, 0);
    assert.ok(g.group.children.every(o => !o.visible));
  } finally { g.dispose(); }
});

test('うろこ・水は魚から盤上に飛び、同じ種と時刻なら巻き戻し後も各粒の行列が一致します', () => {
  const a = createGuides(anatomy, createRng(97)), b = createGuides(anatomy, createRng(97));
  const other = createGuides(anatomy, createRng(98));
  try {
    function positions(g, t, kind, origin = matrix) {
      g.update({ ...empty, effects: [{ kind, t, curve: 'scaleSweep', side: 'L' }] }, {}, { ...pose, matrixFor: () => origin }, 0, null, 0);
      const mesh = g.group.children.find(o => o.name.startsWith(kind));
      assert.ok(mesh.isInstancedMesh && mesh.count > 0);
      if (kind === 'scales') assert.ok(mesh.instanceMatrix.count >= 200);
      return mesh.instanceMatrix.array.slice(0, mesh.count * 16);
    }
    for (const kind of ['scales', 'water']) {
      const expected = positions(a, 0.46, kind);
      assert.ok(expected.every(Number.isFinite));
      assert.notDeepEqual(positions(a, 0.7, kind), expected);
      assert.deepEqual(positions(a, 0.46, kind), expected);
      assert.deepEqual(positions(b, 0.46, kind), expected);
      assert.notDeepEqual(positions(other, 0.46, kind), expected);
      const shifted = positions(b, 0.46, kind, new THREE.Matrix4().makeTranslation(-1, 3, 1));
      for (let i = 0; i < expected.length; i += 16) {
        assert.ok(Math.abs(shifted[i + 12] - expected[i + 12] - 5) < 1e-5);
        assert.ok(expected[i + 13] >= 0);
      }
    }
  } finally { a.dispose(); b.dispose(); other.dispose(); }
});

test('練習の軌跡は一筆を伸ばしても1回の描画で、色を保ち、魚の外を横切る所で途切れます', () => {
  const g = createGuides(anatomy, createRng(1)), colors = new THREE.Color();
  try {
    for (let i = 0; i < 180; i++) g.trace.add([i * 0.02, 1, 0], i < 60, matrix);
    let mesh = g.group.children[0];
    assert.equal(g.group.children.length, 1);
    assert.equal(mesh.count, 179);
    mesh.getColorAt(0, colors); assert.equal(colors.getHexString(), '2f8f5b');
    mesh.getColorAt(178, colors); assert.equal(colors.getHexString(), 'c9852a');
    g.trace.lift(); g.trace.add([5, 0, 0], false, matrix);
    assert.equal(mesh.count, 179);
    g.trace.clear(); assert.equal(mesh.count, 0);
  } finally { g.dispose(); }
});

test('透視の入力は反転・遠近投影の後もカーブの深さに戻り、指の横ずれも残ります', () => {
  const camera = new THREE.PerspectiveCamera(35, 1.5, 0.1, 150);
  camera.position.set(3, 8, 18); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const owner = new THREE.Matrix4().makeRotationY(0.35).premultiply(new THREE.Matrix4().makeScale(-1, 1, 1));
  const rect = { left: 29, top: 18, width: 600, height: 400 };
  const points = [[-3, 1, -2], [0, -1, 0], [4, 1, 2]];
  const actual = new THREE.Vector3(2, 0, 1);
  const projected = actual.clone().applyMatrix4(owner).project(camera);
  const x = rect.left + (projected.x + 1) * rect.width / 2, y = rect.top + (1 - projected.y) * rect.height / 2;
  const point = (xx, yy) => new THREE.Vector3().fromArray(pointAtCutDepth(camera, owner, rect, xx, yy, points));
  assert.ok(point(x, y).distanceTo(actual) < 1e-8);
  const off = point(x, y + 18);
  assert.ok(off.distanceTo(actual) > 0.3);
  assert.ok(Math.abs(off.applyMatrix4(owner).project(camera).y - (projected.y - 36 / rect.height)) < 1e-8);
});

test('狭い盤面の端でも、同じ位置の札を上下に分けて枠内と操作ボタンの外に置きます', () => {
  const area = { left: 5, top: 54, right: 315, bottom: 232 };
  const occupied = [{ left: 263, top: 180, right: 307, bottom: 224 }];
  for (let i = 0; i < 4; i++) {
    const r = placeCaption(313, 220, 115 + i, 25, area, occupied);
    assert.ok(r && r.right <= area.right && r.left >= area.left && r.bottom <= area.bottom && r.top >= area.top);
    assert.ok(occupied.every(p => r.right <= p.left || r.left >= p.right || r.bottom <= p.top || r.top >= p.bottom));
    occupied.push(r);
  }
});

test('切り込み対応の材質にはFLFの点列・方向・進度を渡し、巻き戻すとうろこと切り込みが戻ります', () => {
  const raw = structuredClone(aji), cut = raw.steps[1].cuts[0], received = {};
  cut.reverse = true;
  const model = buildFishModel('aji', { quality: 'light', materialFactory(species) {
    return Object.assign(makeBasicMaterials(species), {
      setScale: v => { received.scale = v; }, setScutes: v => { received.scutes = v; },
      setXray: v => { received.xray = v; }, setSlitOpen: v => { received.slitOpen = v; },
      setIncisions: list => { received.incisions = list; },
    });
  } });
  const d = createFishDisplay(model, raw);
  try {
    const middle = (cut.window[0] + cut.window[1]) / 2;
    const s = stateAt(d.proc, 1, middle);
    d.apply(s, d.proc.steps[1], true, null);
    const incision = s.incisions.find(c => c.curve === cut.curve);
    assert.deepEqual(received.incisions, [{ points: model.anatomy.curve(cut.curve, cut.side).points.reverse(),
      progress: incision.progress, through: incision.through }]);
    assert.deepEqual([received.scale, received.scutes, received.slitOpen, received.xray],
      [s.uniforms.scale, s.uniforms.scutes, s.uniforms.slitOpen, 1]);
    d.apply(stateAt(d.proc, 0, 0), d.proc.steps[0], false, null);
    assert.deepEqual(received.incisions, []);
    assert.equal(received.scale, 1); assert.equal(received.xray, 0);
  } finally { d.dispose(); }
});

// 画面外への除外に頼らず、影・両面・背景・板も含む提出回数の上限を数えます。
function drawBound(group, shadow) {
  let n = 0;
  group.traverseVisible(o => {
    if (!o.isMesh || (o.isInstancedMesh && !o.count)) return;
    const mats = Array.isArray(o.material) ? o.geometry.groups.map(g => o.material[g.materialIndex]) : [o.material];
    for (const m of mats) if (m.visible) {
      n += m.transparent && m.side === THREE.DoubleSide && !m.forceSinglePass ? 2 : 1;
      if (shadow && o.castShadow) n++;
    }
  });
  return n;
}

test('アジ全手順で影・板・道具・切り線を含む描画回数の上限が、各画質で60以内です', () => {
  for (const quality of ['high', 'standard', 'light']) {
    const d = createFishDisplay(buildFishModel('aji', { quality }), aji);
    const stage = createStage({ quality, createCanvas: () => null }), shadow = quality !== 'light';
    try {
      for (const piece of Object.values(d.model.pieces)) {
        let triangles = 0;
        visitPieceMeshes(piece.object, o => {
          triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
          for (const attr of Object.values(o.geometry.attributes)) assert.ok(attr.array.every(Number.isFinite));
        });
        assert.equal(triangles, piece.triangles);
      }
      const stageCalls = 1 + drawBound(stage.group, shadow);
      for (const [i, step] of d.proc.steps.entries()) {
        const samples = [0, 0.125, 0.5, 1, ...(step.cuts ?? []).map(c => (c.window[0] + c.window[1]) / 2)];
        for (const u of samples) for (const xray of [true, false]) {
          d.apply(stateAt(d.proc, i, u), step, xray, null);
          const calls = stageCalls + drawBound(d.group, shadow);
          assert.ok(calls <= 60, [quality, step.id, u, xray, calls].join(' '));
        }
      }
    } finally { d.dispose(); stage.dispose(); }
  }
});
