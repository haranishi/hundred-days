import assert from 'node:assert/strict';
import test from 'node:test';
import { CASES, stageOf } from '../lib/cases.js';
import { flattenShape } from '../lib/geometry.js';
import { DEFAULT_THRESHOLD, buildTarget, evaluate, solutionArrangement } from '../lib/score.js';

function box(id, width, height, x, y, decoy = false) {
  return {
    id, polygons: flattenShape([['rect', 0, 0, width, height]]), z: 0, y, decoy,
    x: { min: 0, max: 320, start: 0, solution: x },
  };
}

function scene(props) {
  return { distance: 300, lamp: { x: 120, min: 30, max: 165, start: 150, solution: 99 }, props, threshold: DEFAULT_THRESHOLD };
}

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

for (const caseDef of CASES) {
  test(`${caseDef.id}: 正解のねらいは完全一致し、部品の被覆も1になる`, () => {
    const stage = stageOf(caseDef);
    const arrangement = solutionArrangement(stage);
    assert.deepEqual(arrangement, {
      ly: caseDef.stage.lamp.solution,
      xs: Object.fromEntries(caseDef.stage.props.map((prop) => [prop.id, prop.x.solution])),
    });
    const target = buildTarget(stage);
    const result = evaluate(stage, target, arrangement);
    assert.equal(result.success, true);
    assert.equal(result.iou, 1);
    assert.equal(result.band, 'match');
    assert.equal(result.partsOk, true);
    assert.equal(result.decoysOk, true);
    for (const prop of stage.props) {
      if (prop.decoy) assert.equal(result.parts[prop.id].area, 0);
      else assert.equal(result.parts[prop.id].coverage, 1);
    }
  });
}

test('IoU 0.8 の直前は不合格、境界と直後は合格になる', () => {
  const stage = scene([box('left', 100, 20, 60, 60), box('right', 100, 20, 140, 60)]);
  const target = buildTarget(stage);
  const results = [22, 20, 18].map((dx) => evaluate(stage, target, { ly: 99, xs: { left: 60 + dx, right: 140 + dx } }));
  assert.equal(results[0].iou, 158 / 202);
  assert.equal(results[0].partsOk, true);
  assert.equal(results[0].success, false);
  assert.equal(results[1].iou, 0.8);
  assert.equal(results[1].success, true);
  assert.equal(results[2].iou, 162 / 198);
  assert.equal(results[2].success, true);
});

test('小さい部品を外すと、全体のIoUが合格でも部品の被覆で不合格になる', () => {
  const stage = scene([box('large', 100, 100, 60, 60), box('small', 10, 10, 180, 120)]);
  const target = buildTarget(stage);
  const result = evaluate(stage, target, { ly: 99, xs: { large: 60, small: 300 } });
  assert.equal(result.iou, 2500 / 2525);
  assert.ok(result.iou >= stage.threshold.union);
  assert.equal(result.parts.large.coverage, 1);
  assert.equal(result.parts.small.coverage, 0);
  assert.equal(result.partsOk, false);
  assert.equal(result.success, false);
});

test('邪魔な道具は他の影と重なっても壁に残ると不合格、壁外なら合格になる', () => {
  const stage = scene([box('large', 100, 100, 60, 60), box('decoy', 30, 30, 300, 60, true)]);
  const target = buildTarget(stage);
  const onWall = evaluate(stage, target, { ly: 99, xs: { large: 60, decoy: 60 } });
  assert.equal(onWall.iou, 1);
  assert.equal(onWall.partsOk, true);
  assert.deepEqual(onWall.parts.decoy, { decoy: true, area: 225 });
  assert.equal(onWall.decoysOk, false);
  assert.equal(onWall.success, false);
  const outside = evaluate(stage, target, solutionArrangement(stage));
  assert.equal(outside.parts.decoy.area, 0);
  assert.equal(outside.decoysOk, true);
  assert.equal(outside.success, true);
});

test('band は 0.7 と 0.5 を含む側で near と warm に切り替わる', () => {
  const grid = { cell: 2, cols: 10, rows: 1 };
  const stage = scene([box('large', 20, 2, 10, 1), box('small', 4, 2, 18, 1)]);
  const target = buildTarget(stage, grid);
  const threshold = { ...DEFAULT_THRESHOLD, union: 0.95 };
  for (const [dx, expected, band] of [[4, 0.8, 'near'], [6, 0.7, 'near'], [8, 0.6, 'warm'], [10, 0.5, 'warm'], [12, 0.4, 'far']]) {
    const result = evaluate(stage, target, { ly: 99, xs: { large: 10 + dx, small: 18 + dx } }, threshold, grid);
    assert.equal(result.iou, expected);
    assert.equal(result.success, false);
    assert.equal(result.band, band);
  }
});

test('evaluate は凍結した stage・target・arrangement を変更しない', () => {
  const stage = freeze(structuredClone(stageOf(CASES[4])));
  const built = buildTarget(stage);
  // 要素を持つ TypedArray は freeze できないため、同じ値の凍結配列を渡す。
  const target = freeze({
    pieces: Object.fromEntries(Object.entries(built.pieces).map(([id, mask]) => [id, [...mask]])),
    union: [...built.union],
  });
  const arrangement = freeze(solutionArrangement(stage));
  const before = structuredClone({ stage, target, arrangement });
  assert.equal(evaluate(stage, target, arrangement).success, true);
  assert.deepEqual({ stage, target, arrangement }, before);
});

test('arrangement.xs に無い道具は正解の横位置を使う', () => {
  const stage = stageOf(CASES[4]);
  const target = buildTarget(stage);
  const complete = evaluate(stage, target, solutionArrangement(stage));
  assert.deepEqual(evaluate(stage, target, { ly: stage.lamp.solution, xs: {} }), complete);
  assert.deepEqual(evaluate(stage, target, { ly: stage.lamp.solution, xs: { coat: 120 } }), complete);
});
