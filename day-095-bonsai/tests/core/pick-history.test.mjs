import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHistory } from '../../lib/history.js';
import { branchList, branchSegment, indexOfId, pickNode, subtreeIndices } from '../../lib/pick.js';
import { createTree } from '../../lib/tree.js';
import { makeSampleSkeleton } from '../fixtures/sample-skeleton.mjs';

function skelForRay(segments, pads = []) {
  return {
    count: segments.length,
    ids: Int32Array.from(segments.map((_, index) => 41 + index)),
    start: Float32Array.from(segments.flatMap(([start]) => start)),
    end: Float32Array.from(segments.flatMap(([, end]) => end)),
    r0: Float32Array.from(segments.map(([, , radius]) => radius ?? 0.03)),
    r1: Float32Array.from(segments.map(([, , radius]) => radius ?? 0.03)),
    pads: {
      count: pads.length, node: Int32Array.from(pads.map(([node]) => node)),
      center: Float32Array.from(pads.flatMap(([, center]) => center)),
      radius: Float32Array.from(pads.map(([, , radius]) => radius)),
    },
  };
}

const vertical = (z) => [[0, 0, z], [0, 2, z]];
const ray = (x = 0, y = 1, z = 4) => ({ origin: [x, y, z], dir: [0, 0, -2] });

test('光線と節の端までの最近接点、および指の幅で選べる範囲', () => {
  const skel = skelForRay([vertical(0)]);
  let sampled;
  const hit = pickNode(skel, ray(0.12), { pxToWorld: (distance) => { sampled = distance; return 0.01; } });
  assert.deepEqual(hit, { id: 41, index: 0, t: 4, point: [0.12, 1, 0], viaPad: false, distance: 0.12 });
  assert.equal(sampled, 4);
  assert.equal(pickNode(skel, ray(0.145), { pxToWorld: 0.01 }), null);
  assert.equal(pickNode(skel, ray(0.12), { pxToWorld: 0.01, tolerancePx: 8 }), null);
  assert.equal(pickNode(skel, ray(0.12), { tolerancePx: 0 }), null);
  assert.ok(pickNode(skel, ray(0.02), { pxToWorld: 0.0001, tolerancePx: 1 }));
  assert.ok(pickNode(skel, ray(0, 2.029), {}));
  assert.equal(pickNode(skel, ray(0, 2.031), {}), null);
  assert.equal(pickNode(skel, { origin: [0, 1, 4], dir: [0, 0, 0] }), null);
});

test('前後に枝が重なると手前を選び、枝より手前のパッドを優先する', () => {
  const overlap = [vertical(0), vertical(1)];
  assert.equal(pickNode(skelForRay(overlap), ray()).id, 42);
  assert.equal(pickNode(skelForRay(overlap, [[0, [0, 1, 0], 0.45]]), ray()).id, 42);

  const frontPad = skelForRay(overlap, [[0, [0.12, 1, 1.5], 0.35]]);
  const hit = pickNode(frontPad, ray());
  assert.equal(hit.id, 41);
  assert.equal(hit.viaPad, true);
  assert.deepEqual(hit.point, [0, 1, 1.5]);
  assert.equal(pickNode(frontPad, ray(), { padHit: false }).id, 42);

  const offAxisPad = skelForRay([vertical(0)], [[0, [0.22, 1, 1.5], 0.25]]);
  assert.equal(pickNode(offAxisPad, ray()).viaPad, false);
  assert.equal(pickNode(offAxisPad, ray(0.03)).viaPad, true);
});

test('根元からの半直線だけを拾い、枝と平行な光線も選べる', () => {
  assert.equal(pickNode(skelForRay([vertical(5)]), ray()), null);
  const parallel = skelForRay([[[0, 1, 1], [0, 1, 3]]]);
  assert.deepEqual(pickNode(parallel, ray()), { id: 41, index: 0, t: 1, point: [0, 1, 3], viaPad: false, distance: 0 });
  assert.equal(pickNode(parallel, ray(0, 1, 2)).t, 0);
  assert.equal(pickNode(parallel, ray(0.1)), null);
});

test('枝の続き、子孫、ID、キーボードの順序は絡み合う枝でも安定する', () => {
  const skel = makeSampleSkeleton({ seed: 4, primaries: 5 });
  const list = branchList(skel);
  assert.deepEqual(list, branchList(skel));
  assert.equal(list.length, 11);
  assert.equal(list[0].order, 0);
  const branch = list.find(({ order }) => order === 1);
  const path = branchSegment(skel, branch.first);
  assert.deepEqual(Array.from(path), Array.from(skel.chain.keys()).filter((i) => skel.chain[i] === branch.chain));
  assert.equal(path.at(-1), branch.tip);
  assert.deepEqual(branchSegment(skel, branch.tip), Int32Array.of(branch.tip));
  const descendants = subtreeIndices(skel, branch.first);
  assert.equal(descendants.length, path.length + 3);
  assert.equal(descendants[0], branch.first);
  assert.ok(descendants.every((i) => skel.chain[i] === branch.chain || skel.order[i] === 2));
  assert.deepEqual(subtreeIndices(skel, 0), Int32Array.from(skel.ids.keys()));
  assert.equal(indexOfId(skel, skel.ids[branch.tip]), branch.tip);
  assert.equal(indexOfId(skel, -999), -1);
  assert.equal(subtreeIndices(skel, -1).length, 0);
  assert.equal(branchSegment(skel, skel.count).length, 0);
  const heights = list.map(({ first }) => skel.start[first * 3 + 1]);
  assert.deepEqual(heights, [...heights].sort((a, b) => a - b));
});

test('同じ高さの枝は正面からの方位で並ぶ', () => {
  const skel = {
    count: 4, chain: Int32Array.of(0, 1, 2, 3), order: Uint8Array.of(0, 1, 1, 1),
    start: Float32Array.of(0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0),
    end: Float32Array.of(0, 1, 0, -1, 1, 0, 1, 1, 0, 0, 1, 1),
  };
  assert.deepEqual(branchList(skel).map(({ chain }) => chain), [0, 3, 2, 1]);
});

test('履歴は上限で古い木を捨て、復元は元の木や将来のやり直しと独立する', () => {
  const history = createHistory(2);
  let tree = createTree({ day: 213 });
  const before = tree.toJSON();
  assert.equal(history.undo(tree), null);
  assert.equal(history.redo(tree), null);
  for (let i = 0; i < 3; i += 1) {
    history.record(tree);
    tree.advance(7);
  }
  const latest = tree.toJSON();
  assert.equal(history.canUndo, true);
  assert.equal(history.canRedo, false);
  tree = history.undo(tree);
  assert.equal(tree.day, before.day + 14);
  const earliestAvailable = history.undo(tree);
  assert.equal(earliestAvailable.day, before.day + 7);
  assert.equal(history.canUndo, false);
  assert.equal(history.undo(earliestAvailable), null);
  assert.equal(history.canRedo, true);

  tree.advance(56);
  tree = history.redo(earliestAvailable);
  assert.equal(tree.day, before.day + 14);
  assert.deepEqual(history.redo(tree).toJSON(), latest);
  assert.equal(history.canRedo, false);
  tree = history.undo(tree);
  assert.equal(history.canRedo, true);
  history.record(tree);
  assert.equal(history.canRedo, false);
  history.clear();
  assert.equal(history.canUndo, false);
  assert.equal(history.undo(tree), null);
});
