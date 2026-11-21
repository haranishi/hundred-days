import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.js';
import { LOCK_MIN_MOVE_CM, POSE_LOCK_ROOTS, SPECIES_IDS, poseTransform } from '../../lib/contract.js';
import { buildFishModel } from '../../lib/pieces.js';
import { createFishDisplay } from '../../lib/scene-fish.js';
import { composePieceMatrix, groundPoseMatrix } from '../../lib/pose-compose.js';
import { createProcedure, stateAt } from '../../lib/timeline.js';
import { getProcedure } from '../../lib/procedures/index.js';
import { fakeAnatomy } from '../fixtures/fake-anatomy.js';

const lockedPose = pose => ({ head: pose.head, dorsal: pose.dorsal, ...poseTransform(pose) });
function same(a, b) {
  a.elements.forEach((n, i) => assert.ok(Math.abs(n - b.elements[i]) < 1e-8, n + ' と ' + b.elements[i]));
}
function apply(d, i, u) {
  const state = stateAt(d.proc, i, u);
  d.apply(state, d.proc.steps[i], false, null);
  d.group.updateMatrixWorld(true);
  return state;
}

test('アジの頭は切る前には胴と回り、切ったあとには鼻先と三軸が盤に残ります', () => {
  const d = createFishDisplay(buildFishModel('aji', { quality: 'light' }), getProcedure('aji'), { boardTop: 2 });
  try {
    const head = d.model.pieces.head.object.matrixWorld, bone = d.model.pieces.bone.object.matrixWorld;
    apply(d, 1, 1);
    const initial = head.clone();
    assert.equal(apply(d, 2, 1).pieces.head.poseLock, null);
    same(head, bone);
    assert.ok(new THREE.Vector3(0, 1, 0).transformDirection(initial).dot(new THREE.Vector3(0, 1, 0).transformDirection(head)) < -0.99);
    const i = d.proc.steps.findIndex(s => s.moves?.some(m => m.piece === 'head' && m.move));
    const detached = apply(d, i, 1), pose = lockedPose(d.proc.steps[i].pose);
    assert.deepEqual(detached.pieces.head.poseLock, pose);
    const ground = groundPoseMatrix(pose, d.model.anatomy.bounds, 2);
    const expected = ground.clone().multiply(composePieceMatrix(ground, detached.pieces.head, d.model.pieces.head.pivot));
    const initialBone = bone.clone();
    for (const u of [0, 0.1, 0.2, 0.25, 0.55, 1, 0.125]) {
      apply(d, i + 1, u);
      same(head, expected);
      same(d.pose.matrixFor('head'), expected);
    }
    apply(d, i + 1, 1);
    assert.ok(new THREE.Vector3(-1, 0, 0).transformDirection(bone).dot(new THREE.Vector3(-1, 0, 0).transformDirection(initialBone)) < -0.99);
    assert.equal(apply(d, i - 1, 1).pieces.head.poseLock, null);
  } finally { d.dispose(); }
});

test('2cmちょうどで固定し、同一手順で戻した場合も、重なる移動窓で到達前に折り返す場合も再現します', () => {
  const raw = structuredClone(getProcedure('aji')), step = raw.steps[0];
  step.moves = [
    { piece: 'head', move: [4, 0, 0], window: [0.25, 0.75] },
    { piece: 'head', move: [0, 0, 0], window: [0.5, 1] },
    { piece: 'viscera', move: [4, 0, 0], window: [0.25, 1] },
    { piece: 'viscera', move: [0, 0, 0], window: [0.4, 0.8] },
    { piece: 'R.dorsal', rot: { axis: 'x', deg: 85, about: 'dorsalHinge' }, window: [0, 1] },
    { piece: 'bone', move: [5, 0, 0], window: [0, 1] },
  ];
  const p = createProcedure(raw, fakeAnatomy);
  const at = u => stateAt(p, 0, u).pieces;
  assert.equal(at(0.49999).head.poseLock, null);
  assert.equal(Math.hypot(...at(0.5).head.move), LOCK_MIN_MOVE_CM);
  const lock = lockedPose(step.pose);
  for (const u of [0.5, 0.75, 1]) {
    const pieces = at(u);
    assert.deepEqual(pieces.head.poseLock, lock);
    for (const id of ['viscera', 'R.dorsal', 'bone']) assert.equal(pieces[id].poseLock, null);
  }
  assert.deepEqual(at(1).head.move, [0, 0, 0]);
  at(1).head.poseLock.q.fill(123);
  assert.deepEqual(stateAt(p, 1, 0).pieces.head.poseLock, lock);
});

test('固定した身の子と孫は、固定した向きで盤上の移動と支点まわりの回転を合成します', () => {
  const raw = structuredClone(getProcedure('aji'));
  raw.steps[1].moves = [{ piece: 'R.dorsal', move: [0, 0, 4], window: [0.5, 1] }];
  raw.steps[2].moves = ['R.ventral', 'R.strip'].map(piece => ({
    piece, move: [2, 0, 1], rot: { axis: 'z', deg: 21 }, window: [0.3, 0.8],
  }));
  const d = createFishDisplay(buildFishModel('aji', { quality: 'light' }), raw);
  try {
    const state = apply(d, 2, 0.63);
    const ground = groundPoseMatrix(lockedPose(raw.steps[1].pose), d.model.anatomy.bounds, 0);
    let world = ground.clone();
    for (const id of ['R.dorsal', 'R.ventral', 'R.strip']) {
      const own = state.pieces[id], piece = d.model.pieces[id];
      if (id !== 'R.dorsal') assert.equal(own.poseLock, null);
      world.multiply(composePieceMatrix(ground, own, piece.pivot));
      same(piece.object.matrixWorld, world);
      same(d.pose.matrixFor(id), world);
    }
    for (const id of ['skin.R', 'pinbones.R']) same(d.pose.matrixFor(id), d.pose.matrixFor('R.dorsal'));
  } finally { d.dispose(); }
});

test('8種の全手順で部品の行列は有限で、一度固定された根は同じ姿勢を引き継ぎます', () => {
  for (const id of SPECIES_IDS) {
    const d = createFishDisplay(buildFishModel(id, { quality: 'light' }), getProcedure(id)), locks = new Map();
    try {
      for (const [i, step] of d.proc.steps.entries()) {
        for (const u of [0, 0.125, 0.25, 0.55, 0.85, 1]) {
          const state = apply(d, i, u);
          for (const [key, own] of Object.entries(state.pieces)) {
            if (locks.has(key)) assert.deepEqual(own.poseLock, locks.get(key));
            else if (POSE_LOCK_ROOTS.includes(key) && Math.hypot(...own.move) >= LOCK_MIN_MOVE_CM) {
              assert.deepEqual(own.poseLock, lockedPose(step.pose));
              locks.set(key, own.poseLock);
            } else assert.equal(own.poseLock, null);
            const piece = d.model.pieces[key];
            if (piece) assert.ok(piece.object.matrixWorld.elements.every(Number.isFinite), [id, step.id, u, key].join('/'));
          }
        }
      }
      assert.ok(locks.has('head'));
    } finally { d.dispose(); }
  }
});
