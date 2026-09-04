import assert from 'node:assert/strict';
import test from 'node:test';
import { generatePlant } from '../lib/plant.js';

const withoutWidth = (segments) => segments.map(({ width: _width, ...segment }) => segment);

test('同じ種と回数なら同じ木になる', () => assert.deepEqual(generatePlant(28471, 100), generatePlant(28471, 100)));

test('nの要素はn+1のprefixになる', () => {
  for (const seed of [1, 28471, 2147483647]) {
    for (let steps = 0; steps <= 120; steps += 1) {
      const before = generatePlant(seed, steps);
      const after = generatePlant(seed, steps + 1);
      assert.deepEqual(withoutWidth(after.segments.slice(0, before.segments.length)), withoutWidth(before.segments));
      assert.deepEqual(after.leaves.slice(0, before.leaves.length), before.leaves);
      assert.deepEqual(after.flowers.slice(0, before.flowers.length), before.flowers);
    }
  }
});

test('毎ステップ枝・葉・花のいずれかが増える', () => {
  let previous = generatePlant(9031, 0);
  for (let steps = 1; steps <= 400; steps += 1) {
    const current = generatePlant(9031, steps);
    const before = previous.segments.length + previous.leaves.length + previous.flowers.length;
    const after = current.segments.length + current.leaves.length + current.flowers.length;
    assert.ok(after > before, `step ${steps}`);
    previous = current;
  }
});

test('steps 0は空の木', () => {
  const plant = generatePlant(42, 0);
  assert.deepEqual([plant.segments, plant.leaves, plant.flowers], [[], [], []]);
});

test('400ステップまで枝の座標が範囲内', () => {
  for (const seed of [1, 19, 28471, 998244353, 2147483647]) {
    for (const steps of [1, 30, 100, 400]) {
      const plant = generatePlant(seed, steps);
      for (const segment of plant.segments) {
        for (const x of [segment.x1, segment.x2]) assert.ok(x >= 0.06 && x <= 0.94, `${seed}/${steps} x=${x}`);
        for (const y of [segment.y1, segment.y2]) assert.ok(y >= 0.06 && y <= 0.80, `${seed}/${steps} y=${y}`);
      }
    }
  }
});

test('枝はすべて樹冠の楕円（中心0.5,0.45・半径0.36,0.38）の内側に収まる', () => {
  for (const seed of [1, 19, 28471, 998244353, 2147483647]) {
    for (const steps of [1, 14, 30, 60, 100, 400]) {
      for (const segment of generatePlant(seed, steps).segments) {
        for (const [x, y] of [[segment.x1, segment.y1], [segment.x2, segment.y2]]) {
          const inside = ((x - 0.5) / 0.36) ** 2 + ((y - 0.45) / 0.38) ** 2;
          assert.ok(inside <= 1, `${seed}/${steps} ${inside}`);
        }
      }
    }
  }
});

test('steps 1は双葉の芽', () => {
  const plant = generatePlant(42, 1);
  assert.equal(plant.segments.length, 1);
  assert.equal(plant.segments[0].x1, 0.5);
  assert.equal(plant.segments[0].y1, 0.80);
  assert.equal(plant.leaves.length, 2);
  assert.deepEqual(plant.leaves.map((leaf) => leaf.side), [-1, 1]);
  /* 双葉は1枚が鉢の幅(0.26)の1/4ほど。 */
  for (const leaf of plant.leaves) assert.ok(leaf.size >= 0.05 && leaf.size <= 0.065, String(leaf.size));
});

test('葉の大きさは0.027〜0.063に収まる', () => {
  for (const seed of [7, 28471, 123456789]) {
    for (const leaf of generatePlant(seed, 400).leaves) {
      assert.ok(leaf.size >= 0.027 && leaf.size <= 0.063, String(leaf.size));
    }
  }
});

test('花はstep20から4ステップに1つ・30個で打ち止め', () => {
  const counts = [19, 20, 23, 24, 30, 60, 100, 136, 400].map((steps) => generatePlant(555, steps).flowers.length);
  assert.deepEqual(counts, [0, 1, 1, 2, 3, 11, 21, 30, 30]);
  for (const flower of generatePlant(555, 400).flowers) {
    assert.ok(flower.size >= 0.012 && flower.size <= 0.016, String(flower.size));
  }
});

test('幹は根元がいちばん太く、先へ行くほど細い', () => {
  const plant = generatePlant(28471, 60);
  const trunk = plant.segments.filter((segment) => segment.kind === 'leader');
  for (let index = 1; index < trunk.length; index += 1) {
    assert.ok(trunk[index].width <= trunk[index - 1].width, `節${index}`);
  }
  /* steps 60 の根元は鉢の幅(0.26)の1/8ほど。 */
  assert.ok(trunk[0].width > 0.028 && trunk[0].width < 0.038, String(trunk[0].width));
  for (const segment of plant.segments) {
    if (segment.parent === null) continue;
    assert.ok(segment.width <= plant.segments[segment.parent].width, `枝${segment.id}`);
  }
});

test('statsは配列の長さと一致する', () => {
  const plant = generatePlant(75, 400);
  assert.deepEqual(plant.stats, { branches: plant.segments.length, leaves: plant.leaves.length, flowers: plant.flowers.length });
});
