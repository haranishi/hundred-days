import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NODE_FLAG, validateSkeleton } from '../../lib/contract.js';
import { branchList, branchSegment, indexOfId } from '../../lib/pick.js';
import { createTree, restoreTree } from '../../lib/tree.js';

const DEG = Math.PI / 180;
const at = (values, i) => Array.from(values.subarray(i * 3, i * 3 + 3));
const minus = (a, b) => a.map((value, i) => value - b[i]);
const plus = (a, b) => a.map((value, i) => value + b[i]);
const scale = (v, factor) => v.map((value) => value * factor);
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const unit = (v) => scale(v, 1 / Math.hypot(...v));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const near = (a, b, tolerance = 1e-6) => Math.hypot(...minus(a, b)) <= tolerance;
const atParents = (skel, index) => Array.from(skel.parent.keys()).filter((i) => skel.parent[i] === index);
const primary = (skel) => branchList(skel).find(({ order }) => order === 1);

function descendants(skel, anchor) {
  return Array.from(skel.ids.keys()).filter((i) => {
    for (let ancestor = i; ancestor >= anchor; ancestor = skel.parent[ancestor]) {
      if (ancestor === anchor) return true;
    }
    return false;
  });
}

function makeTurn(pivot, grab, angle) {
  const vector = minus(grab, pivot);
  const heading = unit(vector);
  const basis = Math.abs(heading[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const axis = unit(cross(heading, basis));
  const c = Math.cos(angle * DEG);
  const s = Math.sin(angle * DEG);
  const rotate = (v) => plus(plus(scale(v, c), scale(cross(axis, v), s)), scale(axis, dot(axis, v) * (1 - c)));
  return { rotate, target: plus(pivot, rotate(vector)) };
}

function assertLengths(before, after) {
  const length = (skel, i) => Math.hypot(...minus(at(skel.end, i), at(skel.start, i)));
  for (let i = 0; i < before.count; i += 1) {
    assert.ok(Math.abs(length(before, i) - length(after, i)) <= 1e-6, `節${i}の長さが変わった`);
  }
}

function assertScar(skel, parentId) {
  const parent = indexOfId(skel, parentId);
  assert.ok(skel.flags[parent] & NODE_FLAG.CUT, '親にCUTがない');
  assert.equal(skel.scarAge[parent], 0);
}

function assertLimit(before, after, index, maxAngleDeg) {
  const initial = unit(minus(at(before.end, index), at(before.start, index)));
  const next = unit(minus(at(after.end, index), at(after.start, index)));
  const angle = Math.atan2(Math.hypot(...cross(initial, next)), dot(initial, next)) / DEG;
  assert.ok(angle <= maxAngleDeg + 1e-3, `太さによる上限 ${maxAngleDeg}° を超えた`);
  return angle;
}

test('剪定は指定した節と子孫を落とし、親に切り口を残す', () => {
  const original = createTree({ seed: 11 });
  const saved = original.toJSON();
  const tree = original.clone();
  const before = tree.snapshot();
  const index = primary(before).first;
  const dropped = descendants(before, index);
  const parentId = before.ids[before.parent[index]];
  const expected = { ok: true, parentId, removedIds: dropped.map((i) => before.ids[i]) };
  assert.ok(dropped.length > 25);
  assert.deepEqual(tree.canCut(before.ids[index]), expected);
  assert.strictEqual(tree.snapshot(), before);
  assert.deepEqual(tree.cut(before.ids[index]), expected);
  const after = tree.snapshot();
  assert.ok(after.count < before.count);
  assertScar(after, parentId);
  assert.deepEqual(validateSkeleton(after), []);
  assert.deepEqual(Array.from(after.ids), Array.from(before.ids).filter((id) => !expected.removedIds.includes(id)));
  for (const [i, id] of after.ids.entries()) {
    const old = indexOfId(before, id);
    assert.deepEqual(at(after.start, i), at(before.start, old));
    assert.deepEqual(at(after.end, i), at(before.end, old));
    assert.equal(after.r0[i], before.r0[old]);
    assert.equal(after.r1[i], before.r1[old]);
  }
  assert.deepEqual(original.toJSON(), saved);
  for (const id of expected.removedIds) assert.equal(tree.canCut(id).ok, false);
  tree.advance(14);
  assert.equal(tree.snapshot().scarAge[indexOfId(tree.snapshot(), parentId)], 2);
  assert.ok(tree.snapshot().r0[0] >= before.r0[0]);
});

test('幹の下部の剪定を日本語の理由で拒み、幹の先は剪定できる', () => {
  const tree = createTree();
  const before = tree.snapshot();
  const tip = branchList(before).find(({ order }) => order === 0).tip;
  const height = before.end[tip * 3 + 1];
  for (const [i, order] of before.order.entries()) {
    if (order !== 0 || before.start[i * 3 + 1] > height * 0.55) continue;
    const result = tree.cut(before.ids[i]);
    assert.equal(result.ok, false);
    assert.equal(typeof result.reason, 'string');
    assert.match(result.message, /幹.*切れません/);
    assert.ok(!result.message.includes('\n'));
  }
  assert.strictEqual(tree.snapshot(), before);
  const result = tree.cut(before.ids[tip]);
  assert.deepEqual(result.removedIds, [before.ids[tip]]);
  assertScar(tree.snapshot(), result.parentId);
  assert.deepEqual(validateSkeleton(tree.snapshot()), []);
});

test('切り残した枝先のパッドは小さく、切り口から3節以内に胴吹きする', () => {
  let backBuds = 0;
  for (const seed of [1, 7, 11, 29, 42]) {
    const tree = createTree({ day: 213, seed });
    const original = tree.snapshot();
    const tip = original.pads.node.find((i) => original.chain[i] === original.chain[original.parent[i]] && atParents(original, original.parent[i]).length === 1);
    const pad = original.pads.node.indexOf(tip);
    const removedPadRadius = original.pads.radius[pad];
    const cut = tree.cut(original.ids[tip]);
    const cutSkel = tree.snapshot();
    assertScar(cutSkel, cut.parentId);
    const scar = indexOfId(cutSkel, cut.parentId);
    const replacement = cutSkel.pads.node.indexOf(scar);
    assert.ok(replacement >= 0);
    assert.ok(cutSkel.pads.radius[replacement] < removedPadRadius);
    assert.ok(cutSkel.pads.density[replacement] < original.pads.density[pad]);
    const nearby = new Set();
    let ancestor = scar;
    for (let i = 0; i < 3 && ancestor >= 0; i += 1) {
      nearby.add(cutSkel.ids[ancestor]);
      ancestor = cutSkel.parent[ancestor];
    }
    tree.advance(84);
    const after = tree.snapshot();
    for (const [i, id] of after.ids.entries()) {
      if (indexOfId(cutSkel, id) < 0 && nearby.has(after.ids[after.parent[i]]) && after.chain[i] !== after.chain[after.parent[i]]) backBuds += 1;
    }
  }
  assert.ok(backBuds > 0, '固定seedの切り口の近くに胴吹きがない');
});

test('曲げられた先は剛体のように回り、手前・他の枝・長さを保つ', () => {
  const tree = createTree();
  const before = tree.snapshot();
  const index = primary(before).first;
  const affected = new Set(descendants(before, index));
  const pivot = at(before.start, index);
  const grab = at(before.end, index);
  const angle = 17;
  const { target, rotate } = makeTurn(pivot, grab, angle);
  const session = tree.beginBend(before.ids[index]);
  const result = session.update(grab, target);
  assert.ok(Math.abs(result.angleDeg - angle) < 1e-4);
  assert.equal(result.clamped, false);
  const preview = tree.snapshot();

  assertLengths(before, preview);
  for (let i = 0; i < before.count; i += 1) {
    for (const field of ['start', 'end']) {
      const initial = at(before[field], i);
      const expected = affected.has(i) ? plus(pivot, rotate(minus(initial, pivot))) : initial;
      assert.ok(near(at(preview[field], i), expected), `${field} 節${i}の位置`);
    }
  }
  for (const [i, node] of before.pads.node.entries()) {
    if (affected.has(node)) assert.ok(near(at(preview.pads.normal, i), rotate(at(before.pads.normal, i))));
  }

  assert.deepEqual(session.update(grab, target), result);
  assert.strictEqual(tree.snapshot(), preview);
  session.update(grab, makeTurn(pivot, grab, 9).target);
  assert.deepEqual(session.update(grab, target), result);
  assert.deepEqual(tree.snapshot(), preview);
  assert.deepEqual(session.commit(), { ok: true, changed: true });
  const after = tree.snapshot();
  assert.deepEqual(after.end, preview.end);
  const path = branchSegment(before, index);
  assert.deepEqual(after.wires, [{ nodes: path, age: 0 }]);
  assert.deepEqual(Array.from(after.flags.keys()).filter((i) => after.flags[i] & NODE_FLAG.WIRED), Array.from(path));
  assert.deepEqual(validateSkeleton(after), []);
});

test('太さによる上限、180度を指した時の上限、キャンセルと3度未満を区別する', () => {
  const tree = createTree({ species: 'pine' });
  const before = tree.snapshot();
  const saved = tree.toJSON();
  assert.deepEqual(tree.beginBend(before.ids[0]), {
    ok: false, reason: 'trunk-thick', message: '太い幹は曲げられません。細い枝を選びましょう',
  });
  const branch = primary(before).first;
  const twig = before.pads.node.find((i) => before.order[i] >= 3);
  const small = tree.canBend(before.ids[twig]).maxAngleDeg;
  const big = tree.canBend(before.ids[branch]).maxAngleDeg;
  assert.ok(small > 95 && big < 75 && small > big);

  for (const [index, cap] of [[branch, big], [twig, small]]) {
    const pivot = at(before.start, index);
    const grab = at(before.end, index);
    const session = tree.beginBend(before.ids[index]);
    const result = session.update(grab, minus(scale(pivot, 2), grab));
    assert.ok(result.clamped);
    assert.equal(result.angleDeg, cap);
    const turned = tree.snapshot();
    assert.ok(Math.abs(assertLimit(before, turned, index, cap) - cap) < 1e-3);
    assertLengths(before, turned);
    assert.deepEqual(tree.toJSON(), saved);
    session.cancel();
    assert.strictEqual(tree.snapshot(), before);
  }

  const pivot = at(before.start, branch);
  const grab = at(before.end, branch);
  const session = tree.beginBend(before.ids[branch]);
  session.update(grab, makeTurn(pivot, grab, 2).target);
  assert.notStrictEqual(tree.snapshot(), before);
  assert.deepEqual(session.commit(), { ok: true, changed: false });
  assert.strictEqual(tree.snapshot(), before);
  assert.deepEqual(tree.toJSON(), saved);
});

test('針金の年齢が進み、外しても曲がった姿勢は保たれる', () => {
  const tree = createTree({ day: 70 });
  const s = tree.snapshot();
  const index = primary(s).first;
  const pivot = at(s.start, index);
  const grab = at(s.end, index);
  const session = tree.beginBend(s.ids[index]);
  session.update(grab, makeTurn(pivot, grab, 18).target);
  assert.equal(session.commit().changed, true);
  const bent = tree.snapshot();
  tree.advance(21);
  const winter = tree.snapshot();
  assert.deepEqual(winter.end, bent.end);
  assert.equal(winter.wires[0].age, 3);
  const wireNode = winter.wires[0].nodes.at(-1);
  assert.deepEqual(tree.unwire(winter.ids[wireNode]), { ok: true });
  assert.equal(tree.snapshot().wires.length, 0);
  assert.ok(tree.snapshot().flags.every((flag) => !(flag & NODE_FLAG.WIRED)));
  assert.deepEqual(tree.snapshot().quat, bent.quat);
  assert.deepEqual(tree.unwire(winter.ids[wireNode]), { ok: false });
});

test('芽摘みは枝先とその一つ手前に効き、次の成長で2本に分かれる', () => {
  const tree = createTree({ day: 213 });
  const before = tree.snapshot();
  const i = primary(before).first;
  assert.equal(tree.canPinch(before.ids[i]).reason, 'not-tip');
  assert.equal(tree.pinch(before.ids[0]).reason, 'trunk-thick');
  assert.strictEqual(tree.snapshot(), before);

  const tip = before.pads.node.find((index) => before.order[index] > 0 && before.chain[index] === before.chain[before.parent[index]]);
  const pad = before.pads.node.indexOf(tip);
  assert.deepEqual(tree.canPinch(before.ids[tip]), { ok: true });
  assert.deepEqual(tree.pinch(before.ids[before.parent[tip]]), { ok: true, capped: false });
  const pinched = tree.snapshot();
  assert.ok(pinched.flags[tip] & NODE_FLAG.PINCHED);
  assert.ok(pinched.pads.radius[pad] < before.pads.radius[pad]);
  assert.ok(pinched.pads.density[pad] < before.pads.density[pad]);
  assert.equal(tree.pinch(before.ids[tip]).reason, 'already-pinched');
  const { born } = tree.advance(7);
  assert.ok(born >= 2);
  const branched = tree.snapshot();
  const children = atParents(branched, tip);
  assert.equal(children.length, 2);
  assert.ok(children.every((child) => branched.chain[child] !== branched.chain[tip] && (branched.flags[child] & NODE_FLAG.FRESH)));
  assert.notEqual(branched.chain[children[0]], branched.chain[children[1]]);
  assert.deepEqual(validateSkeleton(branched), []);
});

test('剪定が途中の曲げを閉じ、古いセッションで剪定前へ戻らない', () => {
  const tree = createTree();
  const before = tree.snapshot();
  const index = primary(before).first;
  const pivot = at(before.start, index);
  const grab = at(before.end, index);
  const session = tree.beginBend(before.ids[index]);
  session.update(grab, makeTurn(pivot, grab, 15).target);
  tree.cut(before.ids[index]);
  const after = tree.snapshot();
  session.cancel();
  assert.deepEqual(session.commit(), { ok: false, changed: false });
  assert.strictEqual(tree.snapshot(), after);
  assert.equal(indexOfId(after, before.ids[index]), -1);
});

test('変異で伸びる曲げ、切り口の欠落、上限超過、乱数の状態の欠落を検出する', () => {
  const tree = createTree();
  const before = tree.snapshot();
  const index = primary(before).first;
  const id = before.ids[index];
  const max = tree.canBend(id).maxAngleDeg;
  const pivot = at(before.start, index);
  const grab = at(before.end, index);

  const bendWithoutLength = tree.clone().snapshot();
  bendWithoutLength.end[index * 3] += 0.08;
  assert.throws(() => assertLengths(before, bendWithoutLength), /長さが変わった/);

  const cutTree = tree.clone();
  const { parentId } = cutTree.cut(id);
  const cutWithoutScar = cutTree.snapshot();
  cutWithoutScar.flags[indexOfId(cutWithoutScar, parentId)] &= ~NODE_FLAG.CUT;
  assert.throws(() => assertScar(cutWithoutScar, parentId), /親にCUTがない/);

  const bendWithoutCap = tree.clone().snapshot();
  bendWithoutCap.end.set(makeTurn(pivot, grab, max + 25).target, index * 3);
  assert.throws(() => assertLimit(before, bendWithoutCap, index, max), /上限.*超えた/);

  tree.advance(210);
  const withoutState = tree.toJSON();
  withoutState.rngState = withoutState.seed;
  const mutant = restoreTree(withoutState);
  const control = tree.clone();
  mutant.advance(56);
  control.advance(56);
  const identical = JSON.stringify(mutant.toJSON()) === JSON.stringify(control.toJSON());
  assert.throws(() => assert.ok(identical, '復元時の乱数の状態が違う'), /乱数の状態が違う/);
});
