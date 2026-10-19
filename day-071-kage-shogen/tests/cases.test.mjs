import assert from 'node:assert/strict';
import test from 'node:test';
import { CASES, EPILOGUE, PEOPLE, stageOf } from '../lib/cases.js';
import { SHAPES } from '../lib/shapes.js';
import { WALL } from '../lib/geometry.js';
import { buildTarget, evaluate, solutionArrangement } from '../lib/score.js';
import {
  candidatesAfterReproduction, candidatesBeforeReproduction, heightFromLamp, judge, lampHeightOf, readingOf, suspectsOf, witnessOf,
} from '../lib/deduction.js';

const text = (value) => typeof value === 'string' && value.trim().length > 0 && !/undefined|NaN|\[object/.test(value);
const startOf = (stage) => ({ ly: stage.lamp.start, xs: Object.fromEntries(stage.props.map((prop) => [prop.id, prop.x.start])) });
const shifted = (stage, arrangement, { ly = 0, id = null, dx = 0 }) => ({
  ly: arrangement.ly + ly,
  xs: { ...arrangement.xs, ...(id ? { [id]: arrangement.xs[id] + dx } : {}) },
});
const movable = (stage) => stage.props.filter((prop) => prop.x.min !== prop.x.max && !prop.decoy);

test('事件簿の文章と数値が欠けず、足跡の説明が場面の数値と一致する', () => {
  assert.equal(CASES.length, 5);
  assert.deepEqual(CASES.map((item) => item.no), [1, 2, 3, 4, 5]);
  assert.equal(new Set(CASES.map((item) => item.id)).size, CASES.length);
  for (const item of CASES) {
    for (const key of ['title', 'place', 'summary', 'intro', 'sceneNote', 'footprint', 'coach', 'reveal', 'closing', 'deductionHint']) {
      assert.ok(text(item[key]), `${item.id}.${key}`);
    }
    assert.ok(text(item.witness.quote));
    assert.ok(PEOPLE[item.witness.person], `${item.id} witness`);
    assert.equal(item.hints.length, 2);
    item.hints.forEach((hint) => assert.ok(text(hint)));
    assert.ok(['on', 'off'].includes(item.guide));
    assert.ok(text(witnessOf(item).name));
    // 足跡の文は、壁からの距離と灯りの横位置を数値どおりに言う（文章と場面のずれを防ぐ）。
    assert.ok(item.footprint.includes(`壁から${item.stage.distance}cm`), `${item.id} distance`);
    assert.ok(item.footprint.includes(`左端から${item.stage.lamp.x}cm`) || !item.footprint.includes('左端'), `${item.id} lamp x`);
    if (item.footprint.includes('左端')) assert.ok(item.footprint.includes(`壁の左端から${item.stage.lamp.x}cm`), `${item.id} lamp x text`);
    // 灯りの高さは、再現成功の文にも出る。
    assert.ok(item.reveal.includes(`${item.stage.lamp.solution}cm`), `${item.id} reveal height`);
    if (item.stool > 0) assert.ok(item.footprint.includes(`${item.stool}cm`), `${item.id} stool in footprint`);
  }
  assert.ok(text(EPILOGUE.title) && text(EPILOGUE.text));
});

test('場面の数値が範囲内で、形が存在し、固定の道具は動かない', () => {
  for (const item of CASES) {
    const stage = stageOf(item);
    assert.ok(stage.lamp.min < stage.lamp.max && stage.lamp.min >= 0 && stage.lamp.max <= WALL.height);
    assert.ok(stage.lamp.solution >= stage.lamp.min && stage.lamp.solution <= stage.lamp.max);
    assert.ok(stage.lamp.start >= stage.lamp.min && stage.lamp.start <= stage.lamp.max);
    assert.ok(Math.abs(stage.lamp.start - stage.lamp.solution) >= 30, `${item.id}: 開始の灯りは正解から30cm以上離す`);
    assert.ok(stage.lamp.x > 0 && stage.lamp.x < WALL.width);
    assert.equal(new Set(stage.props.map((prop) => prop.id)).size, stage.props.length);
    for (const prop of stage.props) {
      assert.ok(SHAPES[prop.shape], `${item.id}.${prop.id} shape`);
      assert.ok(text(prop.label));
      assert.ok(prop.z >= 0 && prop.z <= stage.distance - 20, `${item.id}.${prop.id} z`);
      assert.ok(prop.y > 0 && prop.y < WALL.height);
      assert.ok(prop.scale > 0.2 && prop.scale < 1.5);
      const { min, max, start, solution } = prop.x;
      assert.ok(min <= start && start <= max && min <= solution && solution <= max, `${item.id}.${prop.id} x range`);
      if (min === max) assert.ok(start === solution, 'fixed prop');
      else assert.ok(min >= 8 && max <= 232, 'slide range stays on the shelf');
    }
    const rails = stage.props.map((prop) => prop.y).sort((a, b) => a - b);
    rails.slice(1).forEach((y, i) => assert.ok(y - rails[i] >= 8, `${item.id}: 棚の高さは8cm以上離す`));
    assert.ok(stage.props.some((prop) => !prop.decoy));
    assert.ok(stage.props.every((prop) => !prop.decoy || prop.x.min !== prop.x.max));
  }
});

test('正解は合格し、開始の配置は不合格で、灯りも道具も許容の内では合格する', () => {
  for (const item of CASES) {
    const stage = stageOf(item);
    const target = buildTarget(stage);
    const solution = solutionArrangement(stage);
    assert.equal(evaluate(stage, target, solution).success, true, `${item.id} solution`);
    const start = evaluate(stage, target, startOf(stage));
    assert.equal(start.success, false, `${item.id} start`);
    assert.ok(start.iou < 0.55, `${item.id} start iou ${start.iou}`);
    for (const dy of [-3, 3]) assert.equal(evaluate(stage, target, shifted(stage, solution, { ly: dy })).success, true, `${item.id} lamp ${dy}`);
    for (const prop of movable(stage)) {
      for (const dx of [-3, 3]) assert.equal(evaluate(stage, target, shifted(stage, solution, { id: prop.id, dx })).success, true, `${item.id}.${prop.id} ${dx}`);
    }
  }
});

test('灯りが12cm、道具が12cm外れる、邪魔な道具が壁に残る、のどれでも合格しない', () => {
  for (const item of CASES) {
    const stage = stageOf(item);
    const target = buildTarget(stage);
    const solution = solutionArrangement(stage);
    for (const dy of [-12, 12]) assert.equal(evaluate(stage, target, shifted(stage, solution, { ly: dy })).success, false, `${item.id} lamp ${dy}`);
    for (const prop of movable(stage)) {
      for (const dx of [-12, 12]) assert.equal(evaluate(stage, target, shifted(stage, solution, { id: prop.id, dx })).success, false, `${item.id}.${prop.id} ${dx}`);
    }
    for (const prop of stage.props.filter((entry) => entry.decoy)) {
      const onWall = shifted(stage, solution, { id: prop.id, dx: prop.x.start - prop.x.solution });
      const result = evaluate(stage, target, onWall);
      assert.equal(result.success, false, `${item.id}.${prop.id} decoy on the wall`);
      assert.equal(result.decoysOk, false);
    }
  }
});

test('灯りの高さは一意：横を最適にそろえても、正解から12cm以上離れた高さでは合格しない', () => {
  for (const item of CASES) {
    const stage = stageOf(item);
    const target = buildTarget(stage);
    const solution = solutionArrangement(stage);
    const free = movable(stage);
    for (const dy of [-30, -18, -12, 12, 18, 30]) {
      const ly = solution.ly + dy;
      if (ly < stage.lamp.min || ly > stage.lamp.max) continue;
      const arrangement = { ly, xs: { ...solution.xs } };
      let passed = evaluate(stage, target, arrangement).success;
      for (let sweep = 0; sweep < 2 && !passed; sweep += 1) {
        for (const prop of free) {
          let best = -1;
          let bestX = arrangement.xs[prop.id];
          for (let x = prop.x.min; x <= prop.x.max; x += 4) {
            const score = evaluate(stage, target, { ly, xs: { ...arrangement.xs, [prop.id]: x } }).iou;
            if (score > best) { best = score; bestX = x; }
          }
          arrangement.xs[prop.id] = bestX;
        }
        passed = evaluate(stage, target, arrangement).success;
      }
      assert.equal(passed, false, `${item.id}: 灯り${ly}cmでも合格してしまう`);
    }
  }
});

test('推理：影を再現する前は2人以上残り、再現すると犯人だけが残る', () => {
  const culprits = new Set();
  for (const item of CASES) {
    const before = candidatesBeforeReproduction(item);
    assert.ok(before.length >= 2, `${item.id}: 再現しなくても決まってしまう`);
    assert.ok(before.some((suspect) => suspect.id === item.culprit));
    const after = candidatesAfterReproduction(item);
    assert.deepEqual(after.map((suspect) => suspect.id), [item.culprit], `${item.id}`);
    culprits.add(item.culprit);

    const suspects = suspectsOf(item);
    assert.equal(suspects.length, 3);
    assert.equal(new Set(suspects.map((suspect) => suspect.id)).size, 3);
    assert.ok(suspects.every((suspect) => text(suspect.statement) && suspect.height > 100));
    assert.equal(item.suspects.some((suspect) => suspect.id === item.witness.person), false, `${item.id}: 目撃者は容疑者にならない`);
    const culprit = suspects.find((suspect) => suspect.id === item.culprit);
    // アリバイで外れず残る人は、犯人と灯りの高さが4.5cm以上違う。成功後は灯りの読みを正解にそろえて整数cmで見せるので、
    // これだけ離れていれば取り違えない（5件目の「5cmの差が決め手」が最小）。
    for (const other of before.filter((suspect) => suspect.id !== item.culprit)) {
      assert.ok(Math.abs(other.lampHeight - culprit.lampHeight) >= 4.5, `${item.id}: ${other.name}と犯人の灯りの高さが近すぎる`);
    }
    assert.equal(culprit.lampHeight, item.stage.lamp.solution, `${item.id}: 犯人の灯りの高さが正解と一致`);
    assert.equal(heightFromLamp(item.stage.lamp.solution, item.stool), culprit.height);
    assert.equal(lampHeightOf(culprit.height, item.stool), item.stage.lamp.solution);
    // 手がかりが外す容疑者は、犯人ではなく、容疑者の中にいる。
    for (const clue of item.clues) {
      for (const id of clue.rulesOut ?? []) {
        assert.notEqual(id, item.culprit);
        assert.ok(suspects.some((suspect) => suspect.id === id));
        assert.ok(clue.text.includes(PEOPLE[id].name.split(' ')[0]), `${item.id}: アリバイの文に名前`);
      }
    }
    assert.equal(item.clues.filter((clue) => clue.kind === 'rule').length, 1);
    assert.equal(item.clues.filter((clue) => clue.kind === 'stool').length, item.stool > 0 ? 1 : 0);
    assert.ok(text(readingOf(item)));
    assert.ok(readingOf(item).includes(`${culprit.height}cm`), `${item.id}: 読みの文に身長`);
  }
  assert.equal(culprits.size, CASES.length, '犯人は5件とも別人');
});

test('踏み台の事件では、踏み台を無視して選ぶと別の人に見える（踏み台の手がかりが必要）', () => {
  const item = CASES.find((entry) => entry.stool > 0);
  assert.ok(item);
  const naive = candidatesBeforeReproduction(item)
    .map((suspect) => ({ id: suspect.id, gap: Math.abs(suspect.height * 0.6 - item.stage.lamp.solution) }))
    .sort((a, b) => a.gap - b.gap)[0];
  assert.notEqual(naive.id, item.culprit, '踏み台を見落とすと、犯人でない人が一番近く見える');
});

test('判定：犯人は正解、ほかの人はどの手がかりと合わないかを返す', () => {
  for (const item of CASES) {
    for (const suspect of suspectsOf(item)) {
      const result = judge(item, suspect.id);
      assert.equal(result.correct, suspect.id === item.culprit);
      assert.ok(text(result.message));
      if (!result.correct) assert.ok(result.message.includes(suspect.name.split(' ')[0]));
    }
    assert.throws(() => judge(item, 'nobody'), RangeError);
  }
});
