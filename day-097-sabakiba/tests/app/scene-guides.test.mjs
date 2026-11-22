import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.js';
import { createAnatomy } from '../../lib/anatomy.js';
import { getSpecies } from '../../lib/species/index.js';
import { createRng } from '../../lib/rng.js';
import { createGuides, pointAtCutDepth, screenDistanceToCurve } from '../../lib/guides.js';
import { addSample, createSession, finish, PRACTICE_REACH_PX } from '../../lib/practice.js';
import { measurePolyline, pointOnPath } from '../../lib/easing.js';
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

test('魚を外れた指も線から28 CSS pxまで拾い、横のずれはcmに比例して採点に残ります', () => {
  const camera = new THREE.OrthographicCamera(-10, 10, 5, -5, 0.1, 30);
  camera.position.z = 10; camera.updateMatrixWorld();
  const rect = { left: 37, top: 81, width: 400, height: 200 }, owner = new THREE.Matrix4();
  const points = [[-4, 0, 0], [-2, 0, 0], [4, 0, 0]];
  const cx = rect.left + 200, cy = rect.top + 100;
  const distance = (x, y) => screenDistanceToCurve(camera, owner, rect, x, y, points);
  const pick = (x, y) => pointAtCutDepth(camera, owner, rect, x, y, points, PRACTICE_REACH_PX);
  assert.deepEqual(distance(cx, cy), { distancePx: 0, t: 0.5 });
  for (const px of [0, 7, 14, 28]) {
    assert.equal(distance(cx, cy + px).distancePx, px);
    const point = pick(cx, cy + px);
    assert.ok(point && Math.abs(point[1] + px / 20) < 1e-10);
  }
  assert.equal(distance(cx, cy + 30).distancePx, 30);
  assert.equal(pick(cx, cy + 30), null);
  for (const wiggle of [0, 0.25]) {
    const session = createSession({ curvePoints: points, tolerance: 0.5 });
    for (let i = 0; i <= 40; i++) {
      const y = cy + 20 * wiggle * Math.sin(i * Math.PI / 8);
      addSample(session, pick(cx - 80 + i * 4, y), i * 30);
    }
    const result = finish(session);
    if (wiggle === 0) {
      assert.ok(result.score >= 95); assert.equal(result.grade, 'S');
    } else {
      assert.ok(result.score >= 65 && result.accuracy < 1);
      assert.ok(Math.abs(result.maxDist - wiggle) < 1e-10);
    }
  }
});

test('斜めの遠近投影でも t は魚の弧長に一致し、反転とカメラ移動後も同じ点に戻ります', () => {
  const points = [[-2, 0, -4], [0, 1, 1], [0, 1, 1], [3, -1, 2]], path = measurePolyline(points);
  const rect = { left: 17, top: 52, width: 390, height: 404 };
  const camera = new THREE.PerspectiveCamera(35, rect.width / rect.height, 0.5, 100);
  for (const z of [15, 32]) for (const sign of [1, -1]) {
    camera.position.set(1, 4, z); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    const owner = new THREE.Matrix4().makeScale(sign, 1, 1).setPosition(0.4, 0.7, 1);
    for (const t of [0, 0.25, 0.66, 0.89, 1]) {
      const local = new THREE.Vector3(...pointOnPath(path, t)), q = local.clone().applyMatrix4(owner).project(camera);
      const x = rect.left + (1 + q.x) * rect.width / 2, y = rect.top + (1 - q.y) * rect.height / 2;
      const nearest = screenDistanceToCurve(camera, owner, rect, x, y, points);
      assert.ok(nearest.distancePx < 1e-9 && Math.abs(nearest.t - t) < 1e-9);
      assert.ok(new THREE.Vector3(...pointAtCutDepth(camera, owner, rect, x, y, points)).distanceTo(local) < 1e-8);
    }
  }
  const behind = [[0, 0, 60], [0, 0, 70]], identity = new THREE.Matrix4();
  assert.equal(pointAtCutDepth(camera, identity, rect, 190, 220, behind), null);
  assert.equal(screenDistanceToCurve(camera, identity, rect, 190, 220, behind).distancePx, Infinity);
});

test('練習のときだけ逆向きの始点に32pxの濃い紺の輪（白い縁つき）を置き、終点の矢じりを24pxにします', () => {
  const g = createGuides(anatomy, createRng(4));
  const cut = { curve: 'headCut', side: 'L', reverse: true }, step = { cuts: [cut] };
  const update = (practice, placement = pose) => g.update(empty, step, placement, 0, practice, 0);
  try {
    update(null);
    const mesh = g.group.getObjectByName('headCut/L/r');
    const offsets = mesh.geometry.attributes.aOffset;
    const length = offsets.getX(offsets.count - 1) - offsets.getX(offsets.count - 2);
    assert.equal(length * mesh.material.uniforms.uArrowScale.value, 11);
    assert.equal(g.group.getObjectByName('practice-start'), undefined);
    update(cut);
    const ring = g.group.getObjectByName('practice-start');
    assert.ok(ring.visible && !ring.material.depthTest && ring.renderOrder > mesh.renderOrder);
    assert.equal(ring.material.uniforms.uColor.value.getHexString(), '1c2b33');
    assert.equal(ring.children[0].material.uniforms.uColor.value.getHexString(), 'ffffff');
    assert.equal(ring.geometry.parameters.outerRadius * 2, 32);
    const start = new THREE.Vector3(...g.curvePoints(cut)[0]).applyMatrix4(matrix);
    assert.ok(new THREE.Vector3().setFromMatrixPosition(ring.matrix).distanceTo(start) < 1e-9);
    assert.equal(length * mesh.material.uniforms.uArrowScale.value, 24);
    for (const [w, h] of [[390, 404], [800, 600]]) {
      g.setViewport(w, h);
      assert.deepEqual(ring.material.uniforms.uViewport.value.toArray(), [w, h]);
    }
    update(cut, { ...pose, visible: () => false });
    assert.ok(!ring.visible && !mesh.visible);
    update(null);
    assert.ok(!ring.visible && mesh.visible);
    assert.equal(mesh.material.uniforms.uArrowScale.value, 1);
  } finally { g.dispose(); }
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
