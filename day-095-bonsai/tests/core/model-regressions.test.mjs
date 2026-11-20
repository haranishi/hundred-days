import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_NODES, NODE_FLAG, validateSkeleton } from '../../lib/contract.js';
import { branchList, indexOfId } from '../../lib/pick.js';
import { createTree, restoreTree } from '../../lib/tree.js';

const pointAt = (values, i) => Array.from(values.subarray(3 * i, 3 * i + 3));
const childrenOf = (skel, index) => Array.from(skel.parent.keys()).filter((i) => skel.parent[i] === index);
const trunkOf = (skel) => branchList(skel).find(({ order }) => order === 0);
const padOf = (skel, node) => skel.pads.node.indexOf(node);
const heightOf = (skel) => skel.bounds.max[1] - skel.bounds.min[1];

test('紅葉・模様木・seed 51 は364日後も高さ+25%を超えない', (t) => {
  const tree = createTree({ species: 'maple', style: 'moyogi', seed: 51 });
  const height = heightOf(tree.snapshot());
  tree.advance(364);
  const grown = heightOf(tree.snapshot());
  t.diagnostic(`高さ ${height.toFixed(4)} → ${grown.toFixed(4)}（+${((grown / height - 1) * 100).toFixed(2)}%）`);
  assert.ok(grown <= height * 1.25, `年間の高さ上限 ${height * 1.25} を超えた（${grown}）`);
});

test('seed 11 に毎週水やりしても364日後に節数+90%を超えない', (t) => {
  const tree = createTree({ seed: 11 });
  const count = tree.nodeCount;
  for (let week = 0; week < 52; week += 1) {
    tree.water(1);
    tree.advance(7);
  }
  t.diagnostic(`節数 ${count} → ${tree.nodeCount}（+${((tree.nodeCount / count - 1) * 100).toFixed(2)}%）`);
  assert.ok(tree.nodeCount <= count * 1.9, `年間の節数上限 ${Math.floor(count * 1.9)} を超えた（${tree.nodeCount}）`);
});

test('短い幹を復元しても、52週の残り高さが新芽の長さに反映される', (t) => {
  const saved = createTree({ style: 'chokkan', day: 210, seed: 51 }).toJSON();
  // 幹だけの小さな木で、年間の高さ制限に先に届く条件をつくる。
  saved.nodes = saved.nodes.filter((node) => node[2] === 0);
  for (const node of saved.nodes) node[4] = 2_000_000;
  const tree = restoreTree(saved);
  const start = heightOf(tree.snapshot());
  for (let week = 0; week < 52; week += 1) {
    tree.water(1);
    tree.advance(7);
  }
  const ratio = heightOf(tree.snapshot()) / start;
  t.diagnostic(`短い幹の高さ +${((ratio - 1) * 100).toFixed(3)}%`);
  assert.ok(ratio > 1.23 && ratio <= 1.25, `短い幹の高さ比 ${ratio}`);
  const added = tree.toJSON().nodes.slice(saved.nodes.length);
  assert.ok(added.some((node) => node[2] === 0 && node[4] < 3_700_000), '伸長量が高さの残りに合わせて短くなった節がない');
});

test('芽摘み・剪定・曲げ・保存を挟んでも、連続する52週の成長倍率は上限内', () => {
  let tree = createTree({ day: 210, seed: 11 });
  let savedCopy;
  const growth = [];
  for (let week = 0; week < 79; week += 1) {
    const skel = tree.snapshot();
    if (week === 19) {
      const { first } = branchList(skel).find(({ order }) => order === 1);
      assert.ok(tree.cut(skel.ids[first]).ok);
    }
    if (week === 32) {
      const tip = trunkOf(skel).tip;
      const grab = pointAt(skel.end, tip);
      const bend = tree.beginBend(skel.ids[tip]);
      bend.update(grab, [grab[0] + 0.19, grab[1], grab[2] - 0.1]);
      assert.ok(bend.commit().changed);
    }
    if (week < 8) {
      for (const i of skel.pads.node) {
        if (tree.canPinch(skel.ids[i]).ok) assert.ok(tree.pinch(skel.ids[i]).ok);
      }
    }
    tree.water(1);
    if (week === 39) {
      savedCopy = tree.clone();
      tree = restoreTree(JSON.parse(JSON.stringify(tree.toJSON())));
    }
    if (savedCopy && week !== 39) savedCopy.water(1);
    const before = tree.snapshot();
    tree.advance(7);
    savedCopy?.advance(7);
    const after = tree.snapshot();
    growth.push({ height: Math.max(1, heightOf(after) / heightOf(before)), count: after.count / before.count });
    const window = growth.slice(-52);
    assert.ok(window.reduce((product, entry) => product * entry.height, 1) <= 1.25, `第${week + 1}週の高さ`);
    assert.ok(window.reduce((product, entry) => product * entry.count, 1) <= 1.9 + 1e-10, `第${week + 1}週の節数`);
  }
  assert.deepEqual(tree.toJSON(), savedCopy.toJSON());
  assert.deepEqual(validateSkeleton(tree.snapshot()), []);
});

test('唯一の子が小枝の先なら、chainが変わっていても一つ手前から芽摘みできる', () => {
  const seedling = createTree({ seed: 11 });
  const original = seedling.snapshot();
  const tip = original.pads.node.find((i) => original.order[i] === 2 && childrenOf(original, original.parent[i]).length === 1);
  const saved = seedling.toJSON();
  // 以前の苗は、副枝の最後の節だけ別のchainになることがあった。
  saved.nodes[tip][2] = 3;
  saved.nodes[tip][3] = saved.nextChain++;
  const tree = restoreTree(saved);
  const skel = tree.snapshot();
  const parent = skel.parent[tip];
  const id = skel.ids[parent];
  assert.deepEqual(childrenOf(skel, parent), [tip]);
  assert.deepEqual(childrenOf(skel, tip), []);
  assert.notEqual(skel.chain[parent], skel.chain[tip]);
  assert.deepEqual(tree.canPinch(id), { ok: true });
  assert.deepEqual(tree.pinch(id), { ok: true, capped: false });
  const after = tree.snapshot();
  assert.equal(after.flags[parent] & NODE_FLAG.PINCHED, 0);
  assert.ok(after.flags[tip] & NODE_FLAG.PINCHED);
  assert.ok(after.pads.radius[padOf(after, tip)] < skel.pads.radius[padOf(skel, tip)]);
});

test('最大3度まで曲げられない成熟枝はcanBendとbeginBendで拒む', () => {
  const tree = createTree({ seed: 11 });
  tree.advance(50_000);
  const skel = tree.snapshot();
  const [thickest] = branchList(skel).filter(({ order }) => order === 1).sort((a, b) => skel.r0[b.first] - skel.r0[a.first]);
  const id = skel.ids[thickest.first];
  const result = tree.canBend(id);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'trunk-thick');
  assert.match(result.message, /^[^\n]*曲げられません[^\n]*$/);
  assert.deepEqual(tree.beginBend(id), result);
  assert.strictEqual(tree.snapshot(), skel);
});

test('芽摘みは上限の6節手前からcappedを返し、剪定で空きを作ると2本出る', () => {
  const full = createTree({ seed: 11 });
  full.advance(364 * 22);
  assert.equal(full.nodeCount, MAX_NODES);
  const saved = full.toJSON();
  for (const [space, capped] of [[7, false], [6, true], [0, true]]) {
    const tree = restoreTree({ ...saved, nodes: saved.nodes.slice(0, MAX_NODES - space) });
    const before = tree.snapshot();
    const { first } = branchList(before).find(({ order }) => order === 1);
    const downFirst = (index) => {
      for (let i = index; i >= 0; i = before.parent[i]) if (i === first) return true;
      return false;
    };
    const tip = before.pads.node.find((i) => before.order[i] > 0 && !downFirst(i));
    const id = before.ids[tip];
    assert.deepEqual(tree.pinch(id), { ok: true, capped });
    if (space) continue;
    assert.equal(tree.advance(364).born, 0);
    assert.ok(tree.snapshot().flags[tip] & NODE_FLAG.PINCHED);
    assert.ok(tree.cut(before.ids[first]).ok);
    tree.advance(364);
    const grown = tree.snapshot();
    const i = indexOfId(grown, id);
    assert.equal(childrenOf(grown, i).length, 2);
    assert.equal(grown.flags[i] & NODE_FLAG.PINCHED, 0);
  }
});

test('冬の日付と水分だけが変わる操作は同じsnapshotを返す', () => {
  const tree = createTree({ day: 91 });
  const before = tree.snapshot();
  assert.deepEqual(tree.advance(7), { ticks: 1, born: 0, day: 98, changed: false });
  assert.ok(tree.moisture < 0.6);
  assert.strictEqual(tree.snapshot(), before);
  tree.water(1);
  assert.equal(tree.moisture, 1);
  assert.strictEqual(tree.snapshot(), before);
  assert.deepEqual(tree.advance(1), { ticks: 0, born: 0, day: 99, changed: false });
  assert.strictEqual(tree.snapshot(), before);
});

test('内部の針金の週数だけが進み、経路の表示が同じならsnapshotを再利用する', () => {
  const tree = createTree({ day: 91 });
  const skel = tree.snapshot();
  const { first } = branchList(skel).find(({ order }) => order === 1);
  const grab = pointAt(skel.end, first);
  const bend = tree.beginBend(skel.ids[first]);
  bend.update(grab, [grab[0] + 0.17, grab[1] + 0.12, grab[2] - 0.08]);
  assert.ok(bend.commit().changed);
  const wire = tree.snapshot().wires[0];
  assert.ok(wire.nodes.length > 1);
  const saved = tree.toJSON();
  for (const i of wire.nodes) saved.nodes[i][16] = 65_534;
  saved.nodes[wire.nodes[0]][16] = 65_535;
  const restored = restoreTree(saved);
  const before = restored.snapshot();
  const result = restored.advance(7);
  assert.ok(restored.snapshot() === before, '表示が同じ針金の週送りでsnapshotが作り直された');
  assert.equal(result.changed, false);
  assert.equal(restored.toJSON().nodes[wire.nodes[1]][16], 65_535);
});

test('週をまたがずに時間を進めても、曲げのプレビューを戻したときはchangedになる', () => {
  const tree = createTree({ day: 91 });
  const before = tree.snapshot();
  const { first } = branchList(before).find(({ order }) => order === 1);
  const grab = pointAt(before.end, first);
  const bend = tree.beginBend(before.ids[first]);
  bend.update(grab, [grab[0] + 0.17, grab[1] + 0.12, grab[2] - 0.08]);
  assert.notStrictEqual(tree.snapshot(), before);
  assert.deepEqual(tree.advance(1), { ticks: 0, born: 0, day: 92, changed: true });
  assert.strictEqual(tree.snapshot(), before);
});

test('頂きを切ると横枝があっても新しい頂きにパッドが移る', () => {
  const tree = createTree({ seed: 11 });
  const before = tree.snapshot();
  const oldTip = trunkOf(before).tip;
  assert.ok(padOf(before, oldTip) >= 0);
  const branchBase = before.parent[branchList(before).filter(({ order }) => order === 1).at(-1).first];
  const upperTrunk = childrenOf(before, branchBase).find((i) => before.order[i] === 0);
  const result = tree.cut(before.ids[upperTrunk]);
  assert.ok(result.ok);
  const after = tree.snapshot();
  const newTip = trunkOf(after).tip;
  const pad = padOf(after, newTip);
  assert.equal(after.ids[newTip], before.ids[branchBase]);
  assert.ok(childrenOf(after, newTip).length > 0);
  assert.ok(pad >= 0);
  assert.equal(after.pads.seed[pad], before.pads.seed[padOf(before, oldTip)]);
  assert.ok(after.pads.density[pad] < before.pads.density[padOf(before, oldTip)]);
  assert.deepEqual(validateSkeleton(after), []);
});

test('頂きを芽摘みすると葉が小さくなり、保存を挟んで新しい頂きと横枝に分かれる', () => {
  const tree = createTree({ day: 213 });
  const before = tree.snapshot();
  const tip = trunkOf(before).tip;
  const pad = padOf(before, tip);
  assert.ok(pad >= 0);
  assert.deepEqual(tree.pinch(before.ids[tip]), { ok: true, capped: false });
  const pinched = tree.snapshot();
  assert.ok(pinched.pads.radius[pad] < before.pads.radius[pad] && pinched.pads.density[pad] < before.pads.density[pad]);
  const restored = restoreTree(JSON.parse(JSON.stringify(tree.toJSON())));
  assert.deepEqual(restored.snapshot(), pinched);
  assert.ok(restored.advance(7).changed);
  const grown = restored.snapshot();
  const children = childrenOf(grown, tip);
  assert.deepEqual(children.map((i) => grown.order[i]), [0, 1]);
  assert.ok(children.every((i) => padOf(grown, i) >= 0));
  assert.equal(grown.pads.seed[padOf(grown, children[0])], before.pads.seed[pad]);
  assert.deepEqual(validateSkeleton(grown), []);
});
