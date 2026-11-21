import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.js';
import { SPECIES_IDS, curveOwner } from '../../lib/contract.js';
import { buildFishModel, visitPieceMeshes } from '../../lib/pieces.js';
import { createFishDisplay } from '../../lib/scene-fish.js';
import { createStage } from '../../lib/stage.js';
import { createCameraRig } from '../../lib/camera.js';
import { boardSizeFor, stateAt } from '../../lib/timeline.js';
import { getProcedure } from '../../lib/procedures/index.js';

// 描画用の材質統合前に、子部品を除いた各メッシュの箱を魚の座標で控えます。
function pieceBoxes(model) {
  const boxes = new Map();
  for (const piece of Object.values(model.pieces)) {
    const box = new THREE.Box3();
    visitPieceMeshes(piece.object, mesh => {
      const shape = mesh.isInstancedMesh ? mesh : mesh.geometry;
      shape.computeBoundingBox();
      box.union(shape.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
    });
    assert.equal(box.isEmpty(), piece.triangles === 0, piece.id);
    boxes.set(piece.id, box);
  }
  return boxes;
}

test('8種116手順の中間と終端で、見える部品が実際のまな板の四辺から1cm以上内側にあります', () => {
  const stage = createStage({ quality: 'light' }), board = stage.group.getObjectByName('board');
  let samples = 0;
  try {
    for (const id of SPECIES_IDS) {
      const model = buildFishModel(id, { quality: 'light' }), boxes = pieceBoxes(model);
      const d = createFishDisplay(model, getProcedure(id));
      try {
        const length = model.anatomy.TL, { width, depth } = boardSizeFor(length);
        stage.setBoardSize(width, depth);
        const boardBox = new THREE.Box3().setFromObject(board);
        assert.equal(boardBox.max.y, stage.boardTop);
        assert.ok(Math.abs(boardBox.max.x * 2 - Math.min(67.2, Math.max(42, 2 * length))) < 1e-8);
        assert.ok(Math.abs(boardBox.max.z * 2 - Math.min(44.8, Math.max(28, 1.25 * length))) < 1e-8);
        for (const [i, step] of d.proc.steps.entries()) for (const u of [0.55, 1]) {
          const s = stateAt(d.proc, i, u);
          d.apply(s, step, false, null);
          d.group.updateMatrixWorld(true);
          for (const [piece, box] of boxes) {
            if (box.isEmpty() || !d.pose.visible(piece) || s.pieces[piece].opacity <= 0) continue;
            const world = box.clone().applyMatrix4(model.pieces[piece].object.matrixWorld);
            const margin = Math.min(world.min.x - boardBox.min.x, boardBox.max.x - world.max.x,
              world.min.z - boardBox.min.z, boardBox.max.z - world.max.z);
            assert.ok(margin >= 1 - 1e-8, [id, step.id, u, piece, margin + 'cm'].join('/'));
          }
          samples++;
        }
      } finally { d.dispose(); }
    }
    assert.equal(samples, 232);
  } finally { stage.dispose(); }
});

test('カメラは表示中の刃の接点の周囲4.5cmと魚を囲み、練習中は魚の範囲へ戻ります', () => {
  const d = createFishDisplay(buildFishModel('aji', { quality: 'light' }), getProcedure('aji'));
  try {
    for (const [i, step] of d.proc.steps.entries()) for (const cut of step.cuts ?? []) {
      const s = stateAt(d.proc, i, (cut.window[0] + cut.window[1]) / 2);
      d.apply(s, step, false, cut);
      assert.equal(d.knife.visible, false);
      const fish = d.bounds.clone();
      d.apply(s, step, false, null);
      assert.ok(d.knife.visible);
      const contact = new THREE.Vector3(...s.knife.pos).applyMatrix4(d.pose.matrixFor(s.knife.owner));
      // 盤の面では前後左右に4.5cm、上下は刃の接点から下0.5・上1.5cm（上下に広げると外接球が膨らんで魚が小さくなる）。
      const work = new THREE.Box3(new THREE.Vector3(contact.x - 4.5, contact.y - 0.5, contact.z - 4.5),
        new THREE.Vector3(contact.x + 4.5, contact.y + 1.5, contact.z + 4.5));
      const expected = fish.clone().union(work);
      assert.ok(expected.min.distanceTo(d.bounds.min) + expected.max.distanceTo(d.bounds.max) < 1e-8);
      for (const preset of ['cook', 'top']) {
        const rig = createCameraRig({ aspect: 390 / 350, bounds: d.bounds, reducedMotion: true });
        rig.applyPreset(preset, { focus: d.focus, headDirection: d.head, zoom: s.camera.zoom });
        for (const [axis, delta] of [['x', -4.5], ['x', 4.5], ['z', -4.5], ['z', 4.5], ['y', -0.5], ['y', 1.5]]) {
          const p = contact.clone();
          p[axis] += delta;
          p.project(rig.camera);
          assert.ok(Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)) <= 1, step.id + '/' + preset);
        }
      }
      d.apply(s, step, false, cut);
      assert.ok(d.bounds.equals(fish));
    }
  } finally { d.dispose(); }
});

test('ヒラメ手順15の点線と刃は固定した側の背身に付き、背びれの根元をたどり、真上の視点で頭を横切りません', () => {
  const model = buildFishModel('hirame', { quality: 'light' }), boxes = pieceBoxes(model);
  const d = createFishDisplay(model, getProcedure('hirame')), step = d.proc.steps[14];
  try {
    assert.equal(step.id, 'engawa');
    for (const cut of step.cuts) {
      const owner = curveOwner(cut.curve, cut.side);
      assert.equal(owner, cut.side + '.dorsal');
      const s = stateAt(d.proc, 14, (cut.window[0] + cut.window[1]) / 2);
      d.apply(s, step, false, null); d.group.updateMatrixWorld(true);
      assert.ok(s.pieces[owner].poseLock);
      const ribbon = d.guides.group.getObjectByName('engawaCut/' + cut.side);
      const actualOwner = model.pieces[owner].object.matrixWorld;
      assert.ok(ribbon.visible && ribbon.matrixWorld.elements.every((n, i) => Math.abs(n - actualOwner.elements[i]) < 1e-8));
      const worldBox = boxes.get(owner).clone().applyMatrix4(actualOwner);
      const rig = createCameraRig({ bounds: d.bounds, aspect: 1.25, reducedMotion: true });
      rig.applyPreset('top', { focus: d.focus, zoom: s.camera.zoom });
      const ray = new THREE.Raycaster(), pos = ribbon.geometry.attributes.position;
      const points = d.guides.curvePoints(cut);
      assert.ok(Math.abs(points[0][0] - model.anatomy.point('headCutTop')[0]) < 1e-6);
      for (const [i, p] of points.entries()) {
        const section = model.anatomy.profile(p[0] / model.anatomy.SL);
        assert.ok((p[1] - section.axisY) / section.top > 0.94);
        const drawn = new THREE.Vector3().fromBufferAttribute(pos, 2 * i).applyMatrix4(ribbon.matrixWorld);
        assert.ok(worldBox.distanceToPoint(drawn) < 0.15);
        const screen = drawn.project(rig.camera);
        ray.setFromCamera(screen, rig.camera);
        assert.equal(ray.intersectObject(model.pieces.head.object).length, 0, cut.side + '/' + i);
      }
      const knife = new THREE.Vector3().setFromMatrixPosition(d.knife.matrixWorld);
      assert.ok(worldBox.distanceToPoint(knife) < 0.15);
    }
  } finally { d.dispose(); }
});

test('カツオの両肩のうろこは胸びれから背びれの始まりまで、同じ線を刃・点線・うろこの粒に使います', () => {
  const d = createFishDisplay(buildFishModel('katsuo', { quality: 'light' }), getProcedure('katsuo'));
  try {
    const x = key => d.model.anatomy.point(key)[0];
    for (const i of [1, 2]) {
      const step = d.proc.steps[i], cut = step.cuts[0], points = d.guides.curvePoints(cut);
      const s = stateAt(d.proc, i, (cut.window[0] + cut.window[1]) / 2);
      assert.equal(cut.curve, 'scaleSweep');
      assert.equal(cut.side, i === 1 ? 'L' : 'R');
      assert.equal(s.knife.curve, cut.curve);
      assert.ok(s.effects.some(e => e.curve === cut.curve && e.side === cut.side));
      assert.ok(s.highlights.some(h => h.curve === cut.curve && h.side === cut.side));
      assert.ok(points.length >= 2 && points.every(p => p[0] >= x('pectoralBase') - 1e-8 && p[0] <= x('dorsalFinStart') + 1e-8));
      for (const end of [0, 1]) {
        const knife = stateAt(d.proc, i, cut.window[end]).knife;
        assert.ok(new THREE.Vector3(...knife.pos).distanceTo(new THREE.Vector3(...(end ? points.at(-1) : points[0]))) < 1e-8);
      }
    }
  } finally { d.dispose(); }
});
