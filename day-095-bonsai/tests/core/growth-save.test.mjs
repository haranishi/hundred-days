import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_NODES, MAX_PADS, NODE_FLAG, SAVE_VERSION, SPECIES_IDS, STYLE_IDS, validateSkeleton } from '../../lib/contract.js';
import { branchList, indexOfId } from '../../lib/pick.js';
import { createTree, restoreTree } from '../../lib/tree.js';

const SEEDS = [0, 1, 2, 3, 7, 11, 29, 42, 51, 0xffffffff,
  ...Array.from({ length: 40 }, (_, i) => Math.imul(i + 1, 0x9e3779b1) >>> 0)];
const height = ({ bounds }) => bounds.max[1] - bounds.min[1];
const fresh = (skel) => Array.from(skel.ids).filter((_, i) => skel.flags[i] & NODE_FLAG.FRESH);
const at = (values, i) => Array.from(values.subarray(i * 3, i * 3 + 3));
const SAVE_INDEX = { id: 0, parent: 1, order: 2, chain: 3, length: 4, qx: 5, r0: 12, r1: 13, flags: 14, age: 15 };

for (const species of SPECIES_IDS) {
  for (const mode of ['無操作', '毎週水やり', '毎週芽摘み']) {
    test(`${species} は${mode}で52週進めても50 seedで節数+90%・高さ+25%の範囲を保つ`, (t) => {
      let maxCountRatio = 0;
      let maxHeightRatio = 0;
      let minCountRatio = Infinity;
      for (const [sample, seed] of SEEDS.entries()) {
        const style = STYLE_IDS[sample % STYLE_IDS.length];
        const tree = createTree({ species, style, seed });
        const before = tree.snapshot();
        let born = 0;
        let ticks = 0;
        let pinches = 0;
        if (mode === '無操作') {
          ({ born, ticks } = tree.advance(364));
        } else {
          for (let week = 0; week < 52; week += 1) {
            if (mode === '毎週水やり') tree.water(1);
            if (mode === '毎週芽摘み') {
              const skel = tree.snapshot();
              for (let offset = 0; offset < skel.pads.count; offset += 1) {
                const i = skel.pads.node[(week * 13 + offset) % skel.pads.count];
                if (tree.pinch(skel.ids[i]).ok) { pinches += 1; break; }
              }
            }
            const result = tree.advance(7);
            born += result.born;
            ticks += result.ticks;
          }
        }
        const grown = tree.snapshot();
        const label = `${species}/${style}/${seed}`;
        const countRatio = grown.count / before.count;
        const heightRatio = height(grown) / height(before);
        assert.deepEqual({ ticks, born, day: tree.day }, { ticks: 52, born: grown.count - before.count, day: 364 }, label);
        assert.ok(countRatio > 1 && countRatio <= 1.9, `${label} 節数比 ${countRatio}`);
        assert.ok(heightRatio <= 1.25, `${label} 高さ比 ${heightRatio}`);
        if (species === 'maple' && mode === '無操作') assert.ok(countRatio >= 1.2, `${label} 節数比 ${countRatio}`);
        if (mode === '毎週芽摘み') assert.equal(pinches, 52, `${label} 芽摘み`);
        assert.ok(grown.r0[0] > before.r0[0], `${label} 太さ`);
        assert.deepEqual(validateSkeleton(grown), [], label);
        maxCountRatio = Math.max(maxCountRatio, countRatio);
        maxHeightRatio = Math.max(maxHeightRatio, heightRatio);
        minCountRatio = Math.min(minCountRatio, countRatio);
      }
      t.diagnostic(`年間最大 ${species} ${mode} 高さ+${((maxHeightRatio - 1) * 100).toFixed(3)}% 節数+${((maxCountRatio - 1) * 100).toFixed(3)}%`);
      if (species === 'maple' && mode === '無操作') {
        t.diagnostic(`年間最小 ${species} ${mode} 節数+${((minCountRatio - 1) * 100).toFixed(3)}%`);
      }
    });
  }
}

test('成長は7日の境界ごとで、FRESHは直近に増えた節だけに付く', () => {
  const tree = createTree({ day: 213 });
  const before = tree.snapshot();
  assert.deepEqual(tree.advance(3), { ticks: 0, born: 0, day: 216, changed: false });
  assert.strictEqual(tree.snapshot(), before);
  const week = tree.advance(1);
  assert.equal(week.ticks, 1);
  assert.ok(week.born > 0);
  assert.equal(week.changed, true);
  const grown = tree.snapshot();
  const first = fresh(grown);
  assert.deepEqual(first, Array.from(grown.ids.slice(before.count)));
  assert.ok(first.every((id) => grown.fresh[indexOfId(grown, id)] > 0));
  for (const id of first) {
    const tip = indexOfId(grown, id);
    const parent = grown.parent[tip];
    const oldPad = before.pads.node.indexOf(parent);
    const newPad = grown.pads.node.indexOf(tip);
    assert.ok(oldPad >= 0 && newPad >= 0);
    assert.equal(grown.pads.seed[newPad], before.pads.seed[oldPad]);
    assert.equal(grown.pads.node.indexOf(parent), -1);
  }
  const second = tree.advance(7);
  const after = tree.snapshot();
  assert.equal(second.born, fresh(after).length);
  for (const id of first) {
    const index = indexOfId(after, id);
    assert.equal(after.flags[index] & NODE_FLAG.FRESH, 0);
    assert.equal(after.fresh[index], 0);
  }
  assert.deepEqual(tree.date(), { day: 224, year: 2, month: 5, dom: 13, doy: 132, week: 2, season: 'spring', seasonLabel: '春', label: '春・5月2週' });
});

test('冬の成長は0で、時を進めると水分が減り、水やりの効果には上限がある', () => {
  for (const species of SPECIES_IDS) {
    const tree = createTree({ species, day: 61 });
    const before = tree.snapshot();
    assert.deepEqual(tree.advance(89), { ticks: 13, born: 0, day: 150, changed: false });
    assert.strictEqual(tree.snapshot(), before);
    assert.ok(tree.moisture < 0.6);
    tree.water(0.23);
    assert.ok(tree.moisture > 0.6);
    tree.water(10);
    assert.equal(tree.moisture, 1);
    tree.water(-1);
    assert.equal(tree.moisture, 1);
  }
  const dry = createTree({ day: 213, seed: 11 });
  dry.advance(364);
  const watered = dry.clone();
  watered.water(1);
  assert.ok(watered.advance(140).born > dry.advance(140).born);
});

test('一の枝の剪定跡から下幹に胴吹きしない', () => {
  for (const species of SPECIES_IDS) {
    for (const style of STYLE_IDS) {
      for (const seed of SEEDS.slice(0, 10)) {
        const tree = createTree({ species, style, seed, day: 213 });
        const initial = tree.snapshot();
        const primaries = branchList(initial).filter(({ order }) => order === 1);
        const nextBase = initial.ids[initial.parent[primaries[1].first]];
        assert.ok(tree.cut(initial.ids[primaries[0].first]).ok);
        const trimmed = tree.snapshot();
        const firstBase = indexOfId(trimmed, nextBase);
        const lowerTrunk = new Set(Array.from(trimmed.ids.slice(0, firstBase)).filter((_, i) => trimmed.order[i] === 0));
        assert.ok(lowerTrunk.size > 0 && trimmed.flags.some((flag, i) => flag & NODE_FLAG.CUT && lowerTrunk.has(trimmed.ids[i])));
        tree.water(1);
        assert.ok(tree.advance(112).born > 0);
        const grown = tree.snapshot();
        for (let i = trimmed.count; i < grown.count; i += 1) {
          assert.ok(grown.order[i] === 0 || !lowerTrunk.has(grown.ids[grown.parent[i]]), `${species}/${style}/${seed} 下幹に胴吹きした`);
        }
        assert.deepEqual(validateSkeleton(grown), []);
      }
    }
  }
});

test('繰り返した針金の局所姿勢は成長後も同じで、新しく伸びた先は針金なし', () => {
  const tree = createTree({ day: 212, seed: 11 });
  const before = tree.snapshot();
  const { first } = branchList(before).find(({ order }) => order === 1);
  const [px, py, pz] = at(before.start, first);
  const [gx, gy, gz] = at(before.end, first);
  const session = tree.beginBend(before.ids[first]);
  session.update([gx, gy, gz], [px + (gx - px) + (gz - pz) * 0.23, gy, pz + (gz - pz) - (gx - px) * 0.23]);
  assert.equal(session.commit().changed, true);
  const bent = tree.snapshot();
  const nodes = Array.from(bent.wires[0].nodes);
  const wrapped = tree.toJSON();
  tree.advance(140);
  const grown = tree.snapshot();
  const current = tree.toJSON();
  assert.ok(grown.count > bent.count && grown.wires[0].age > 0);
  for (const i of nodes) {
    assert.equal(grown.flags[i] & NODE_FLAG.WIRED, NODE_FLAG.WIRED);
    assert.deepEqual(current.nodes[i].slice(5, 9), wrapped.nodes[i].slice(5, 9));
    assert.deepEqual(at(grown.start, i), at(bent.start, i));
    assert.deepEqual(at(grown.end, i), at(bent.end, i));
  }
  assert.ok(grown.flags.slice(bent.count).every((flag) => !(flag & NODE_FLAG.WIRED)));
  assert.deepEqual(validateSkeleton(grown), []);
});

test('cloneとJSON往復は姿・剪定跡・針金・時刻・成長乱数をそのまま引き継ぐ', () => {
  const tree = createTree({ species: 'plum', style: 'shakan', day: 215, seed: 717 });
  let skel = tree.snapshot();
  const main = branchList(skel).filter(({ order }) => order === 1);
  const { first } = main[0];
  const grab = at(skel.end, first);
  const session = tree.beginBend(skel.ids[first]);
  session.update(grab, [grab[0] + 0.07, grab[1] - 0.08, grab[2] + 0.09]);
  assert.ok(session.commit().changed);
  assert.equal(tree.cut(skel.ids[main[2].first]).ok, true);
  tree.water(0.24);
  tree.advance(37);
  skel = tree.snapshot();
  assert.ok(skel.flags.some((flag) => flag & NODE_FLAG.CUT));
  assert.ok(skel.wires.length > 0);

  const saved = tree.toJSON();
  assert.equal(saved.v, SAVE_VERSION);
  const serialized = JSON.stringify(saved);
  assert.ok(Buffer.byteLength(serialized) < 400_000);
  const copy = tree.clone();
  const restored = restoreTree(JSON.parse(serialized));
  assert.deepEqual(restored.toJSON(), saved);
  assert.deepEqual(restored.snapshot(), skel);
  assert.notStrictEqual(restored.snapshot(), skel);
  assert.deepEqual(validateSkeleton(restored.snapshot()), []);
  const legacy = { ...saved };
  delete legacy.growth;
  assert.deepEqual(restoreTree(legacy).snapshot(), skel);

  tree.advance(109);
  for (const days of [1, 6, 53, 0, 49]) copy.advance(days);
  restored.advance(109);
  assert.deepEqual(copy.toJSON(), tree.toJSON());
  assert.deepEqual(restored.toJSON(), tree.toJSON());
  assert.deepEqual(copy.snapshot(), restored.snapshot());
  saved.nodes[0][0] = 99999;
  copy.water(1);
  assert.equal(tree.snapshot().ids[0], skel.ids[0]);
  assert.notEqual(copy.moisture, tree.moisture);
});

test('復元は数字の型・範囲、親子の破損、循環、節数超過を拒む', () => {
  const tree = createTree();
  const change = (edit) => { const saved = tree.toJSON(); edit(saved); return saved; };
  const bad = [
    [null, /形式/],
    [change((saved) => { saved.v += 1; }), /版/],
    [change((saved) => { saved.species = 'other'; }), /樹種/],
    [change((saved) => { saved.day = -1; }), /日付/],
    [change((saved) => { saved.moisture = '0.5'; }), /水分/],
    [change((saved) => { saved.rngState = -1; }), /乱数/],
    [change((saved) => { saved.growth = [[1, 1.01, 1]]; }), /成長の履歴/],
    [change((saved) => { saved.day = 70; saved.growth = [[4, 1.01, 1], [4, 1.01, 1]]; }), /成長の履歴/],
    [change((saved) => { saved.nodes = new Array(MAX_NODES + 1); }), /節数/],
    [change((saved) => { saved.nodes = []; }), /節数/],
    [change((saved) => { saved.nodes[4][SAVE_INDEX.parent] = 4; }), /親/],
    [change((saved) => { saved.nodes[4][SAVE_INDEX.parent] = 5; saved.nodes[5][SAVE_INDEX.parent] = 4; }), /親/],
    [change((saved) => { saved.nodes[0][SAVE_INDEX.parent] = 1; }), /親/],
    [change((saved) => { saved.nodes[5][SAVE_INDEX.id] = saved.nodes[4][SAVE_INDEX.id]; }), /ID/],
    [change((saved) => { saved.nodes[5][SAVE_INDEX.order] = 7; }), /枝/],
    [change((saved) => { saved.nodes[5][SAVE_INDEX.parent] = 2; }), /枝の続き/],
    [change((saved) => { saved.nodes[5][SAVE_INDEX.length] = 5e8; }), /姿勢/],
    [change((saved) => { saved.nodes[5][SAVE_INDEX.qx] = 1e11; }), /姿勢/],
    [change((saved) => { saved.nodes[5][SAVE_INDEX.r1] = saved.nodes[5][SAVE_INDEX.r0] + 100; }), /太さ/],
    [change((saved) => { saved.nodes[5][SAVE_INDEX.r1] = 1_800_001; }), /親子の太さ/],
    [change((saved) => { saved.nodes[5][SAVE_INDEX.flags] = 32; }), /印/],
    [change((saved) => { saved.nodes[5][SAVE_INDEX.age] = 1; }), /週数/],
  ];
  for (const [value, field] of bad) assert.throws(() => restoreTree(value), field);
});

test('140パッドを超えた時は頂きと、半径の大きな枝先を残す', () => {
  const tree = createTree({ day: 213 });
  function sideTips(skel) {
    const parents = new Set(skel.parent);
    return Array.from(skel.ids.keys()).filter((i) => skel.order[i] > 0 && !parents.has(i));
  }
  for (let round = 0; round < 5; round += 1) {
    const skel = tree.snapshot();
    const tips = sideTips(skel);
    if (tips.length > MAX_PADS) break;
    for (const i of tips) {
      if (!(skel.flags[i] & NODE_FLAG.PINCHED)) assert.ok(tree.pinch(skel.ids[i]).ok);
    }
    tree.advance(7);
  }
  const skel = tree.snapshot();
  const tips = sideTips(skel);
  assert.ok(tips.length > MAX_PADS);
  assert.equal(skel.pads.count, MAX_PADS);
  const visible = new Set(skel.pads.node);
  const apex = branchList(skel).find(({ order }) => order === 0).tip;
  assert.ok(visible.has(apex));
  const omitted = tips.filter((i) => !visible.has(i));
  assert.deepEqual(validateSkeleton(skel), []);
  const limit = Math.min(...skel.pads.radius.filter((_, i) => skel.pads.node[i] !== apex));
  const trimmed = tree.clone();
  for (const i of tips) {
    if (visible.has(i)) trimmed.cut(skel.ids[i]);
  }
  const after = trimmed.snapshot();
  for (const i of omitted) {
    const pad = after.pads.node.indexOf(indexOfId(after, skel.ids[i]));
    assert.ok(pad >= 0 && after.pads.radius[pad] <= limit);
  }
});

test('2000節のsnapshotと52週の成長は時間予算内で、上限の木も400KBに収まる', (t) => {
  const old = createTree({ seed: 11 });
  old.advance(364 * 22);
  assert.equal(old.nodeCount, MAX_NODES);
  const full = old.toJSON();
  const bytes = Buffer.byteLength(JSON.stringify(full));
  assert.ok(bytes < 400_000, `保存の容量 ${bytes} バイト`);
  const fullTree = restoreTree(JSON.parse(JSON.stringify(full)));
  assert.deepEqual(fullTree.snapshot(), old.snapshot());
  const originalRadius = fullTree.snapshot().r0[0];
  assert.equal(fullTree.advance(364).born, 0);
  assert.equal(fullTree.nodeCount, MAX_NODES);
  assert.ok(fullTree.snapshot().r0[0] > originalRadius);

  const data = { ...full, nodes: full.nodes.slice(0, 2000) };
  restoreTree(data).snapshot();
  const samples = [];
  let cachedTotal = 0;
  for (let sample = 0; sample < 9; sample += 1) {
    const tree = restoreTree(data);
    const start = performance.now();
    const skel = tree.snapshot();
    samples.push(performance.now() - start);
    const cacheStart = performance.now();
    for (let i = 0; i < 200; i += 1) assert.strictEqual(tree.snapshot(), skel);
    cachedTotal += performance.now() - cacheStart;
    assert.equal(skel.count, 2000);
  }
  const median = samples.sort((a, b) => a - b)[4];
  const cached = cachedTotal / 1800;
  const tree = restoreTree(data);
  const start = performance.now();
  assert.equal(tree.advance(364).ticks, 52);
  const growth = performance.now() - start;
  // 手元の実測は snapshot 約1ms・キャッシュ約0.0001ms・52週 約160ms。上限は、混んだCIの機械でも落ちないよう、
  // 実測の10倍以上に取る（計算量が悪化する種類の退行だけを見張る。Day087 の鶴の時間の試験が、CIで偶発的に落ちた前例）
  assert.ok(median < 50, `snapshot中央値 ${median.toFixed(3)}ms`);
  assert.ok(cached < 2, `キャッシュ平均 ${cached.toFixed(4)}ms`);
  assert.ok(growth < 4000, `52週の成長 ${growth.toFixed(3)}ms`);
  assert.deepEqual(validateSkeleton(tree.snapshot()), []);
  t.diagnostic(`2000節 snapshot中央値 ${median.toFixed(3)}ms、キャッシュ平均 ${cached.toFixed(4)}ms、52週 ${growth.toFixed(3)}ms、2600節の保存 ${bytes}バイト`);
});
