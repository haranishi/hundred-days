import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.js';
import { DIRS, posesPerpendicular, poseTransform } from '../../lib/contract.js';
import { buildFishModel, visitPieceMeshes } from '../../lib/pieces.js';
import { composePieceMatrix, groundPoseMatrix, hingePoint, slitMatrix } from '../../lib/pose-compose.js';
import { createFishDisplay } from '../../lib/scene-fish.js';
import { stateAt } from '../../lib/timeline.js';
import { measurePolyline, pointOnPath } from '../../lib/easing.js';
import aji from '../../lib/procedures/aji.js';
import { getProcedure } from '../../lib/procedures/index.js';

const vector = a => new THREE.Vector3().fromArray(a);
const matrix = () => new THREE.Matrix4();
const close = (a, b, eps = 1e-8) => assert.ok(Math.abs(a - b) < eps, a + ' と ' + b);
function sameMatrix(a, b) { a.elements.forEach((n, i) => close(n, b.elements[i])); }
const shift = p => matrix().makeTranslation(...p);

test('盤での移動・支点まわりの回転を、平行移動を含む置き方で共役し、親を一度だけ掛けます', () => {
  const pose = poseTransform({ head: 'F', dorsal: 'R', p: [7, 3, -4] });
  const p = matrix().compose(vector(pose.p), new THREE.Quaternion().fromArray(pose.q), vector([1, 1, 1]));
  const parent = shift([4, 2, -1]).multiply(matrix().makeRotationY(0.62));
  const move = [3, 4, -2], ownPivot = [4, 0.8, -0.3], otherPivot = [1, -0.5, 2];
  for (const about of ['pivot', otherPivot, 'dorsalHinge', 'ventralHinge']) {
    const hinges = { dorsalHinge: [7, 0.9, 0], ventralHinge: [7, -1.3, 0] };
    const c = Array.isArray(about) ? about : hinges[about] ?? ownPivot;
    const world = vector(c).applyMatrix4(p);
    const a = shift(move).multiply(shift(world.toArray())).multiply(matrix().makeRotationZ(Math.PI / 3))
      .multiply(shift(world.clone().negate().toArray()));
    const own = { move, rot: { axis: [0, 0, 1], deg: 60, pivot: about } };
    const result = composePieceMatrix(pose, own, ownPivot, parent, matrix(), hinges);
    sameMatrix(result, parent.clone().multiply(p.clone().invert()).multiply(a).multiply(p));
    const local = composePieceMatrix(p, own, ownPivot, null, matrix(), hinges);
    close(vector(c).applyMatrix4(local).applyMatrix4(p).distanceTo(world.add(vector(move))), 0);
  }
});

test('24通りの置き方とその途中で箱の最下点が盤に接し、中心が盤の指定位置に来ます', () => {
  const bounds = { min: [1, -3, -1.5], max: [26, 4.5, 2] }, boardTop = 1.75;
  let count = 0;
  for (const head of DIRS) for (const dorsal of DIRS) {
    if (!posesPerpendicular({ head, dorsal })) continue;
    const pose = poseTransform({ head, dorsal, p: [-2, 3, 4] });
    for (const u of [0.37, 1]) {
      const q = new THREE.Quaternion().slerp(new THREE.Quaternion().fromArray(pose.q), u).toArray();
      const transform = groundPoseMatrix({ ...pose, q }, bounds, boardTop);
      const corners = [];
      for (const x of [1, 26]) for (const y of [-3, 4.5]) for (const z of [-1.5, 2]) {
        corners.push(vector([x, y, z]).applyMatrix4(transform));
      }
      const box = new THREE.Box3().setFromPoints(corners), center = box.getCenter(new THREE.Vector3());
      close(box.min.y, boardTop); close(center.x, -2); close(center.z, 4);
    }
    count++;
  }
  assert.equal(count, 24);
});

test('背の蝶番を固定し、下側の身が左右の外へ最大7度、進み具合に比例して開きます', () => {
  const c = hingePoint([[1, 2, 0], [5, 3, 0], [9, 2, 0]], 6);
  assert.deepEqual(c, [6, 2.75, 0]);
  for (const [id, side] of [['L.dorsal', 1], ['R.dorsal', -1]]) {
    for (const amount of [0, 0.5, 1]) {
      const m = slitMatrix(id, amount, c);
      close(vector(c).applyMatrix4(m).distanceTo(vector(c)), 0);
      close(vector(c).add(vector([5, 0, 0])).applyMatrix4(m).x, 11);
      const opening = vector(c).add(vector([0, -2, 0])).applyMatrix4(m).sub(vector(c));
      close(Math.atan2(opening.z * side, -opening.y) * 180 / Math.PI, 7 * amount);
    }
  }
});

test('手開き・背開きの rot.about は、実際の部品の中ほどで背または腹の輪郭を支点にします', () => {
  const raw = structuredClone(aji), choices = [['dorsalHinge', 'dorsalMidline'], ['ventralHinge', 'ventralMidline']];
  for (const [i, [about]] of choices.entries()) {
    raw.steps[i].moves = [{ piece: 'R.dorsal', rot: { axis: 'x', deg: 68, about }, window: [0, 0.2] }];
  }
  const d = createFishDisplay(buildFishModel('aji', { quality: 'light' }), raw);
  try {
    const piece = d.model.pieces['R.dorsal'], bounds = new THREE.Box3();
    visitPieceMeshes(piece.object, m => { m.geometry.computeBoundingBox(); bounds.union(m.geometry.boundingBox); });
    const x = (bounds.min.x + bounds.max.x) / 2;
    for (const [i, [, midline]] of choices.entries()) {
      const hinge = vector(hingePoint(d.model.anatomy.curve(midline).points, x));
      const s = stateAt(d.proc, i, 1);
      d.apply(s, d.proc.steps[i], false, null);
      const moved = d.pose.matrixFor('R.dorsal'), rest = d.pose.matrixFor(null);
      close(hinge.clone().applyMatrix4(moved).distanceTo(hinge.clone().applyMatrix4(rest)), 0);
      assert.ok(vector(piece.pivot).applyMatrix4(moved).distanceTo(vector(piece.pivot).applyMatrix4(rest)) > 0.2);
    }
  } finally { d.dispose(); }
});

test('実モデルの三世代が親の行列と visible を継ぎ、透明度は各部品から読みます', () => {
  const model = buildFishModel('aji', { quality: 'light' }), d = createFishDisplay(model, aji);
  try {
    const s = stateAt(d.proc, 0, 0.4);
    s.uniforms.slitOpen = 0.6;
    const change = (id, move, deg, opacity) => Object.assign(s.pieces[id],
      { move, rot: { axis: [0, 1, 0], deg, pivot: 'pivot' }, opacity });
    change('L.dorsal', [3, 2, 4], 35, 0.2);
    change('L.ventral', [1, -2, 0], -15, 0.7);
    change('L.strip', [-2, 1, 3], 20, 1);
    const mirror = new THREE.Group(); mirror.scale.x = -1; mirror.add(d.group);
    d.apply(s, d.proc.steps[0], false, null); mirror.updateMatrixWorld(true);
    let expected = model.group.matrix.clone();
    for (const id of ['L.dorsal', 'L.ventral', 'L.strip']) {
      const { object, pivot } = model.pieces[id];
      if (id === 'L.dorsal') {
        const own = composePieceMatrix(s.pose, s.pieces[id], pivot);
        const book = own.invert().multiply(object.matrix);
        close(Math.atan2(book.elements[6], book.elements[5]) * 180 / Math.PI, -4.2);
      } else sameMatrix(object.matrix, composePieceMatrix(s.pose, s.pieces[id], pivot));
      expected.multiply(object.matrix);
      sameMatrix(d.pose.matrixFor(id), expected);
      sameMatrix(object.matrixWorld, mirror.matrix.clone().multiply(expected));
      visitPieceMeshes(object, m => { for (const mat of [m.material].flat()) close(mat.opacity, s.pieces[id].opacity); });
    }
    s.pieces['L.ventral'].visible = false;
    d.apply(s, d.proc.steps[0], true, null);
    assert.equal(d.pose.visible('L.strip'), false);
    assert.equal(d.pose.visible('skin.L'), true);
    assert.equal(model.pieces['L.strip'].object.visible, true);
    const drawn = []; model.group.traverseVisible(o => drawn.push(o));
    assert.ok(!drawn.includes(model.pieces['L.strip'].object));
    for (const id of ['skin.L', 'skin.R', 'R.dorsal', 'bone', 'viscera']) {
      visitPieceMeshes(model.pieces[id].object, mesh => {
        for (const mat of [mesh.material].flat()) {
          if (['皮', '身', '切り口'].includes(mat.name)) assert.ok(mat.transparent && !mat.depthWrite && mat.opacity < 0.3);
          if (['骨', '腸'].includes(mat.name)) assert.equal(mat.opacity, 1);
        }
      });
    }
    d.apply(s, d.proc.steps[0], false, null);
    visitPieceMeshes(model.pieces['skin.L'].object, m => {
      assert.equal(m.material.opacity, 1); assert.equal(m.material.transparent, false);
      assert.equal(m.material.side, THREE.DoubleSide);
    });
  } finally { d.dispose(); }
});

test('登録手順とアジの実手順を逆順・両利きで評価しても有限で、刃の接点と向きが持ち主に追従します', () => {
  function finite(value) {
    if (typeof value === 'number') assert.ok(Number.isFinite(value));
    else if (value && typeof value === 'object') Object.values(value).forEach(finite);
  }
  for (const raw of new Set([getProcedure('aji'), aji])) {
    const d = createFishDisplay(buildFishModel('aji', { quality: 'light' }), raw);
    try {
      const steps = d.proc.steps;
      for (let i = steps.length - 1; i >= 0; i--) {
        const step = steps[i], cuts = step.cuts ?? [];
        const samples = new Set([1, 0.5, 0.125, 0, ...cuts.map(c => (c.window[0] + c.window[1]) / 2)]);
        for (const u of samples) for (const leftHanded of [true, false]) {
          const s = stateAt(d.proc, i, u, { leftHanded });
          finite(s); d.apply(s, step, false, null); d.group.updateMatrixWorld(true);
          d.group.traverseVisible(o => finite(o.matrixWorld.elements));
          const cut = cuts.find(c => u >= c.window[0] && u <= c.window[1]);
          if (!cut) continue;
          assert.ok(d.knife.visible);
          const points = d.model.anatomy.curve(cut.curve, cut.side).points;
          const path = measurePolyline(cut.reverse ? points.slice().reverse() : points);
          const contact = pointOnPath(path, (u - cut.window[0]) / (cut.window[1] - cut.window[0]));
          const owner = d.model.pieces[s.knife.owner]?.object ?? d.model.group;
          const expected = owner.matrixWorld.clone().multiply(shift(contact))
            .multiply(matrix().makeRotationFromQuaternion(new THREE.Quaternion().fromArray(s.knife.quat)));
          sameMatrix(d.knife.matrixWorld, expected);
        }
      }
    } finally { d.dispose(); }
  }
});
