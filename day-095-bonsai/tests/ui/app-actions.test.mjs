import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createActions, pointOnBendPlane } from '../../lib/app-actions.js';
import { daysToAdvance } from '../../lib/app-state.js';
import { createTree } from '../../lib/tree.js';
import { createHistory } from '../../lib/history.js';
import { branchList, subtreeIndices } from '../../lib/pick.js';
import { NODE_FLAG } from '../../lib/contract.js';
import { makeSampleSkeleton } from '../fixtures/sample-skeleton.mjs';

const xyz = (array, index) => Array.from(array.subarray(3 * index, 3 * index + 3));

function harness({ animate = true, initialTree = createTree({ seed: 11 }) } = {}) {
  const history = createHistory();
  const calls = [];
  const record = (name) => (...args) => calls.push([name, ...args]);
  const view = {
    camera: {
      get: () => ({ az: 0, pol: 90 }),
      project: ([x, y]) => ({ x, y, visible: true }),
      pickRay: (x, y) => ({ origin: [x, y, 8], dir: [0, 0, -1] }),
      pxToWorld: () => 0.01,
    },
    setSpecies: record('species'), setMoisture: record('moisture'), setSkeleton: record('skeleton'),
    setLook: record('look'), setHighlight: record('highlight'), dropBranch: record('drop'), burst: record('burst'),
  };
  const actions = createActions({
    initialTree, history, getView: () => view, canvasRect: () => ({ left: -100, right: 100, top: -100, bottom: 100 }),
    animate: () => animate, notify: record('notice'), announce: record('speak'), changed: record('change'), play: record('sound'),
  });
  actions.repaint();
  return { initialTree, actions, history, calls, view };
}

function hitAt(skel, index) {
  return { id: skel.ids[index], index, point: xyz(skel.end, index) };
}

function winterTree(skel = makeSampleSkeleton(), day = 90, moisture = 0.3, copySkeleton = (value) => value) {
  return {
    species: 'maple', day, moisture,
    snapshot: () => skel,
    clone() { return winterTree(copySkeleton(skel), this.day, this.moisture, copySkeleton); },
    water(amount) { this.moisture += amount; },
    advance(days) {
      this.day += days;
      return { day: this.day, ticks: 1, born: 0, changed: false };
    },
  };
}

test('キーボードで主枝を選び、先を落としてから骨格を更新し、元に戻す・やり直すができる', () => {
  const { initialTree, actions, history, calls } = harness();
  const skel = initialTree.snapshot();
  const branches = branchList(skel);
  const index = branches.findIndex(({ order }) => order === 1);
  const branch = branches[index];
  const removed = subtreeIndices(skel, branch.first);
  const start = initialTree.toJSON();
  const count = actions.branches;
  for (let i = 0; i <= index; i += 1) actions.selectBranch(1);
  assert.match(calls.at(-1)[1], /主枝を選びました/);
  actions.highlight(hitAt(skel, branch.first), 'cut');
  assert.deepEqual(calls.at(-1)[1], { nodes: removed, tone: 'cut' });
  calls.length = 0;
  actions.applySelected('cut');
  assert.equal(actions.branches, count - 1);
  assert.equal(actions.tree.nodeCount, skel.count - removed.length);
  assert.equal(history.canUndo, true);
  const drop = calls.findIndex(([name]) => name === 'drop');
  const redraw = calls.findIndex(([name]) => name === 'skeleton');
  assert.ok(drop >= 0 && drop < redraw);
  assert.deepEqual(calls[drop], ['drop', skel, removed]);
  assert.deepEqual(calls.at(-1), ['notice', '枝を切りました。', { undo: true }]);
  const after = actions.tree.toJSON();
  actions.restore('undo');
  assert.deepEqual(actions.tree.toJSON(), start);
  assert.equal(history.canRedo, true);
  actions.restore('redo');
  assert.deepEqual(actions.tree.toJSON(), after);
});

test('根元を切る、幹の途中で芽を摘む、太い幹を曲げるとモデルの理由を表示し履歴を変えない', () => {
  const { initialTree, actions, history, calls } = harness();
  const root = hitAt(initialTree.snapshot(), 0);
  actions.advance(7);
  actions.restore('undo');
  actions.cut(root);
  assert.deepEqual(calls.at(-1), ['notice', initialTree.canCut(root.id).message]);
  actions.pinch(root);
  assert.deepEqual(calls.at(-1), ['notice', initialTree.canPinch(root.id).message]);
  assert.equal(actions.beginBend(root), null);
  assert.deepEqual(calls.at(-1), ['notice', initialTree.canBend(root.id).message]);
  assert.equal(history.canRedo, true, 'できない手入れでやり直しを失った');
  assert.equal(history.canUndo, false);
  assert.deepEqual(actions.tree.toJSON(), initialTree.toJSON());
});

test('芽摘みは選んだ枝の先だけ変え、元に戻すとその芽が戻る', () => {
  const { initialTree, actions, history, calls } = harness();
  const skel = initialTree.snapshot();
  const branches = branchList(skel);
  const index = branches.findIndex(({ order, tip }) => order >= 1 && initialTree.canPinch(skel.ids[tip]).ok);
  assert.ok(index >= 0, 'まだ摘んでいない枝先が見つかる');
  const { tip } = branches[index];
  for (let i = 0; i <= index; i += 1) actions.selectBranch(1);
  actions.applySelected('pinch');
  assert.equal(actions.tree.nodeCount, skel.count);
  assert.ok(actions.tree.snapshot().flags[tip] & NODE_FLAG.PINCHED);
  assert.deepEqual(calls.find(([name]) => name === 'burst'), ['burst', 'pinch', xyz(skel.end, tip)]);
  assert.equal(history.canUndo, true);
  actions.restore('undo');
  assert.deepEqual(actions.tree.snapshot().flags, skel.flags);
});

test('節数上限での芽摘みでは、成功の通知を剪定の案内に替える', () => {
  const initialTree = winterTree();
  initialTree.clone = () => ({
    ...winterTree(initialTree.snapshot()),
    pinch: () => ({ ok: true, capped: true }),
  });
  const { actions, calls, history } = harness({ initialTree, animate: false });
  actions.pinch(hitAt(initialTree.snapshot(), 21));
  assert.deepEqual(calls.at(-1), ['notice', 'いまは枝がいっぱいです。先に剪定すると新芽が出ます', { undo: true }]);
  assert.equal(history.canUndo, true);
});

test('変更途中でモデルが例外を起こしても、現在の木とやり直しを残す', () => {
  const { actions, history, calls } = harness();
  actions.advance(7);
  actions.restore('undo');
  const current = actions.tree;
  const clone = current.clone.bind(current);
  current.clone = () => {
    const copy = clone();
    const advance = copy.advance.bind(copy);
    copy.advance = (days) => { advance(days); throw new Error('モデルの例外'); };
    return copy;
  };
  assert.equal(actions.advance(30), null);
  assert.equal(actions.tree.day, 0);
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, true);
  assert.match(calls.at(-1)[1], /操作を取り消しました/);
  actions.restore('redo');
  assert.equal(actions.tree.day, 7);
});

test('曲げはプレビュー中に保存せず、確定時のUndoは押す前の枝と針金に戻す', () => {
  const { initialTree, actions, history, calls } = harness();
  const original = initialTree.toJSON();
  const skel = initialTree.snapshot();
  const branch = branchList(skel).find(({ order }) => order === 1);
  const hit = hitAt(skel, branch.first);
  const bend = actions.beginBend(hit);
  assert.ok(bend);
  actions.moveBend(bend, { x: hit.point[0] + 0.35, y: hit.point[1] + 0.32 });
  assert.notDeepEqual(actions.tree.snapshot().end, skel.end);
  assert.deepEqual(actions.tree.toJSON(), original);
  assert.equal(history.canUndo, false);
  assert.ok(!calls.some(([name]) => name === 'change'));
  actions.finishBend(bend, true);
  assert.ok(actions.tree.snapshot().flags[hit.index] & NODE_FLAG.WIRED);
  assert.equal(history.canUndo, true);
  assert.equal(calls.filter(([name]) => name === 'change').length, 1);
  actions.restore('undo');
  assert.deepEqual(actions.tree.toJSON(), original);
});

test('曲げを取り消すか角度を変えずに離したときは骨格を戻して履歴に書かない', () => {
  const { initialTree, actions, history } = harness();
  const skel = initialTree.snapshot();
  const hit = hitAt(skel, branchList(skel).find(({ order }) => order === 1).first);
  const preview = actions.beginBend(hit);
  actions.moveBend(preview, { x: hit.point[0] + 0.4, y: hit.point[1] + 0.35 });
  assert.notDeepEqual(actions.tree.snapshot().end, skel.end);
  actions.finishBend(preview, false);
  assert.deepEqual(actions.tree.snapshot().end, skel.end);
  actions.finishBend(actions.beginBend(hit), true);
  assert.equal(history.canUndo, false);
  assert.equal(actions.tree.snapshot().wires.length, 0);
});

test('キーの枝選択は循環し、Enterと矢印で曲げの確定・取り消しができる', () => {
  const { initialTree, actions, history, calls } = harness();
  const skel = initialTree.snapshot();
  const list = branchList(skel);
  const branchIndex = list.findIndex(({ order }) => order === 1);
  actions.selectBranch(-1);
  assert.match(calls.at(-1)[1], new RegExp(`${list.length}番目`));
  for (let i = 0; i <= branchIndex; i += 1) actions.selectBranch(1);
  actions.applySelected('bend');
  assert.match(calls.at(-1)[1], /Enter.*確定/);
  assert.equal(actions.keyboardArrow('bend', 1, 0), true);
  assert.ok(actions.cancelKeyboardBend());
  assert.deepEqual(actions.tree.snapshot().end, skel.end);
  assert.equal(history.canUndo, false);
  actions.keyboardArrow('bend', 0, -1);
  actions.applySelected('bend');
  assert.equal(history.canUndo, true);
  assert.ok(actions.tree.snapshot().wires.length > 0);
});

test('次の季節へ進むと暦・骨格・季節色を更新し、動きの軽減では即時反映する', () => {
  for (const animate of [true, false]) {
    const { actions, history, calls } = harness({ animate });
    calls.length = 0;
    const day = actions.tree.day;
    assert.equal(actions.advance(daysToAdvance('season', day)).day, 106);
    assert.equal(actions.tree.date().label, '冬・1月3週');
    assert.equal(history.canUndo, true);
    for (const name of ['skeleton', 'look']) assert.equal(calls.find(([key]) => key === name)[2].animate, animate);
    assert.equal(calls.find(([key]) => key === 'look')[1].coverage, 0);
    assert.deepEqual(calls.at(-1), ['notice', '冬・1月3週になりました。', { undo: true }]);
  }
});

test('同一の骨格は再送せず、Undo・Redoと木の入れ替え後は同じ骨格でも送る', () => {
  const initialTree = winterTree();
  const { actions, calls } = harness({ initialTree });
  const skel = initialTree.snapshot();
  const skeletons = () => calls.filter(([name]) => name === 'skeleton').map(([, value]) => value);
  assert.deepEqual(skeletons(), [skel]);
  actions.repaint();
  actions.advance(7);
  actions.water(0.2);
  assert.deepEqual(skeletons(), [skel]);
  assert.equal(actions.tree.day, 97);
  assert.equal(actions.tree.moisture, 0.5);
  assert.equal(calls.filter(([name]) => name === 'look').length, 3);
  assert.equal(calls.filter(([name]) => name === 'change').length, 2);
  assert.deepEqual(calls.filter(([name]) => name === 'moisture').at(-1), ['moisture', 0.5]);
  actions.restore('undo');
  actions.restore('redo');
  actions.replace(initialTree.clone());
  actions.repaint();
  assert.equal(skeletons().length, 4);
  for (const value of skeletons()) assert.equal(value, skel);
});

test('変更なしの時間送りと水やりは、複製で骨格の参照が変わっても描き直さない', () => {
  const initialTree = winterTree(undefined, 90, 0.3, (skel) => ({ ...skel }));
  const { actions, calls } = harness({ initialTree });
  actions.advance(7);
  actions.water(0.2);
  assert.notEqual(actions.tree.snapshot(), initialTree.snapshot());
  assert.equal(calls.filter(([name]) => name === 'skeleton').length, 1);
  assert.equal(calls.filter(([name]) => name === 'change').length, 2);
});

test('曲げのプレビューでも、骨格が同じときは描き直さない', () => {
  const initialTree = winterTree();
  const { actions, calls } = harness({ initialTree });
  const hit = hitAt(initialTree.snapshot(), 21);
  actions.moveBend({
    active: true, hit, normal: [0, 0, 1], session: { update: () => ({ clamped: true }) },
  }, { x: hit.point[0] + 1, y: hit.point[1] });
  assert.equal(calls.filter(([name]) => name === 'skeleton').length, 1);
  assert.equal(calls.at(-1)[1].tone, 'bend');
});

test('曲げの目標は押した深さの面上に置き、後方や平行のレイでは更新しない', () => {
  assert.deepEqual(pointOnBendPlane({ origin: [2, 5, 8], dir: [0, 0, -1] }, [1, 3, 2], [0, 0, 1]), [2, 5, 2]);
  assert.equal(pointOnBendPlane({ origin: [2, 5, 8], dir: [0, 0, 1] }, [1, 3, 2], [0, 0, 1]), null);
  assert.equal(pointOnBendPlane({ origin: [2, 5, 8], dir: [1, 0, 0] }, [1, 3, 2], [0, 0, 1]), null);
});

test('同じ枝からの横ずれを、指は14px、マウスは8pxまで当たり判定に含める', () => {
  const skel = {
    count: 1, ids: Int32Array.of(42), start: Float32Array.of(0, 0, 0), end: Float32Array.of(0, 1, 0),
    r0: Float32Array.of(0.025), r1: Float32Array.of(0.025), pads: { count: 0 },
  };
  const { actions } = harness({ initialTree: { species: 'maple', day: 0, moisture: 0.6, snapshot: () => skel } });
  const pick = (x, kind) => actions.pick({ x, y: 0.5, kind }, 'cut');
  assert.equal(pick(0.079, 'mouse')?.id, 42);
  assert.equal(pick(0.081, 'mouse'), null);
  assert.equal(pick(0.139, 'touch')?.id, 42);
  assert.equal(pick(0.141, 'touch'), null);
});
