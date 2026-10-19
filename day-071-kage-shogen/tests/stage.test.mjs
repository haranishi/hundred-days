import assert from 'node:assert/strict';
import test from 'node:test';
import { CASES, stageOf } from '../lib/cases.js';
import { buildTarget, evaluate, solutionArrangement } from '../lib/score.js';
import { diagnose, sizeWord } from '../lib/diagnose.js';
import {
  confirmSolve, createSession, describeAssessment, lampReadout, movableIds, nudge, propReadout, reset, select,
  setLamp, setPropX, toggleGuide, useHint,
} from '../lib/stage.js';

const startOf = (stage) => ({ ly: stage.lamp.start, xs: Object.fromEntries(stage.props.map((prop) => [prop.id, prop.x.start])) });

function atSolution(caseDef) {
  const session = createSession(caseDef);
  setLamp(session, session.stage.lamp.solution);
  for (const prop of session.stage.props) setPropX(session, prop.id, prop.x.solution);
  return session;
}

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

for (const caseDef of CASES) {
  test(`${caseDef.id}: セッションは開始の配置と不合格の評価を持つ`, () => {
    const session = createSession(caseDef);
    const stage = stageOf(caseDef);
    assert.equal(session.caseId, caseDef.id);
    assert.strictEqual(session.caseDef, caseDef);
    assert.deepEqual(session.stage, stage);
    assert.deepEqual(session.target, buildTarget(stage));
    assert.deepEqual(session.arrangement, startOf(stage));
    assert.deepEqual(session.assessment, evaluate(stage, session.target, session.arrangement));
    assert.equal(session.assessment.success, false);
    assert.equal(session.selected, 'lamp');
    assert.equal(session.status, 'playing');
    assert.equal(session.guideOn, caseDef.guide === 'on');
    assert.equal(session.usedGuide, false);
    assert.equal(session.hintsUsed, 0);
    assert.equal(session.hintIndex, 0);
    const movable = caseDef.stage.props.filter((prop) => prop.x.min < prop.x.max).map((prop) => prop.id);
    assert.deepEqual(movableIds(session), ['lamp', ...movable]);
  });

  test(`${caseDef.id}: 正解の±2cmから確定すると、正解の配置へそろう`, () => {
    const movable = caseDef.stage.props.filter((prop) => prop.x.min < prop.x.max);
    for (const id of ['lamp', ...movable.map((prop) => prop.id)]) {
      for (const delta of [-2, 2]) {
        const session = atSolution(caseDef);
        if (id === 'lamp') setLamp(session, session.stage.lamp.solution + delta);
        else setPropX(session, id, session.arrangement.xs[id] + delta);
        assert.equal(session.assessment.success, true, `${id} ${delta}`);
        const placed = { ...session.arrangement.xs };
        assert.equal(confirmSolve(session), true, `${id} ${delta}`);
        assert.equal(session.status, 'solved');
        // 灯りと必要な道具は正解へそろう。邪魔な道具は、置いた位置のまま残る。
        const expected = solutionArrangement(session.stage);
        for (const prop of session.stage.props) if (prop.decoy) expected.xs[prop.id] = placed[prop.id];
        assert.deepEqual(session.arrangement, expected);
        assert.equal(session.assessment.iou, 1);
        assert.equal(session.assessment.band, 'match');
      }
    }
  });

  test(`${caseDef.id}: 灯りや必要な道具が±12cm外れると確定せず、状態を変えない`, () => {
    const movable = caseDef.stage.props.filter((prop) => prop.x.min < prop.x.max && !prop.decoy);
    for (const id of ['lamp', ...movable.map((prop) => prop.id)]) {
      for (const delta of [-12, 12]) {
        const session = atSolution(caseDef);
        if (id === 'lamp') setLamp(session, session.stage.lamp.solution + delta);
        else setPropX(session, id, session.arrangement.xs[id] + delta);
        const before = structuredClone(session);
        const assessment = session.assessment;
        assert.equal(confirmSolve(session), false, `${id} ${delta}`);
        assert.deepEqual(session, before);
        assert.strictEqual(session.assessment, assessment);
      }
    }
  });
}

test('セッション間で配置・ねらい・ヒントの状態を共有せず、事件簿も変更しない', () => {
  const caseDef = freeze(structuredClone(CASES[2]));
  const before = structuredClone(caseDef);
  const first = createSession(caseDef);
  const second = createSession(caseDef);
  const otherStart = structuredClone(second);
  setLamp(first, 90);
  setPropX(first, 'hat', 150);
  useHint(first);
  toggleGuide(first);
  assert.notStrictEqual(first.arrangement.xs, second.arrangement.xs);
  assert.notStrictEqual(first.target.union, second.target.union);
  assert.deepEqual(second, otherStart);
  assert.deepEqual(caseDef, before);
});

test('選べるのは灯りとすべれる道具だけで、邪魔な道具も含む', () => {
  const fixed = createSession(CASES[0]);
  assert.equal(select(fixed, 'rack'), false);
  assert.equal(fixed.selected, 'lamp');
  const session = createSession(CASES[4]);
  for (const id of ['lamp', 'umbrella', 'coat', 'boots', 'bowler', 'globe']) {
    assert.equal(select(session, id), true);
    assert.equal(session.selected, id);
  }
  for (const id of ['unknown', '__proto__', null, undefined]) {
    assert.equal(select(session, id), false);
    assert.equal(session.selected, 'globe');
  }
  assert.deepEqual(movableIds(session), ['lamp', 'umbrella', 'coat', 'boots', 'bowler', 'globe']);
});

test('灯りと道具は範囲に収まり、変化のたびに評価が更新される', () => {
  const session = createSession(CASES[2]);
  const { lamp } = session.stage;
  const prop = session.stage.props[0];
  for (const [value, expected] of [[-1000, lamp.min], [1000, lamp.max], [99.25, 99.25]]) {
    const previous = session.assessment;
    assert.equal(setLamp(session, value), true);
    assert.equal(session.arrangement.ly, expected);
    assert.notStrictEqual(session.assessment, previous);
    assert.deepEqual(session.assessment, evaluate(session.stage, session.target, session.arrangement));
  }
  const ly = session.arrangement.ly;
  for (const [value, expected] of [[-1000, prop.x.min], [1000, prop.x.max], [100.25, 100.25]]) {
    assert.equal(setPropX(session, prop.id, value), true);
    assert.equal(session.arrangement.xs[prop.id], expected);
    assert.equal(session.arrangement.ly, ly);
    assert.deepEqual(session.assessment, evaluate(session.stage, session.target, session.arrangement));
  }
});

test('非有限・固定・未知・変わらない値は無視し、評価も変えない', () => {
  const session = createSession(CASES[0]);
  const before = structuredClone(session);
  const assessment = session.assessment;
  for (const value of [NaN, Infinity, -Infinity, '99', null, undefined, {}, 1n]) {
    assert.equal(setLamp(session, value), false);
    assert.equal(setPropX(session, 'rack', value), false);
  }
  assert.equal(setLamp(session, session.arrangement.ly), false);
  assert.equal(setPropX(session, 'rack', 100), false);
  assert.equal(setPropX(session, 'unknown', 100), false);
  assert.equal(setPropX(session, '__proto__', 100), false);
  assert.deepEqual(session, before);
  assert.strictEqual(session.assessment, assessment);
  const movable = createSession(CASES[2]);
  for (const value of [NaN, Infinity, -Infinity, '99', null, undefined, {}, 1n]) {
    assert.equal(setPropX(movable, 'hat', value), false);
  }
  assert.equal(setPropX(movable, 'hat', movable.arrangement.xs.hat), false);
});

test('nudge は選択中の軸だけを動かし、端では false を返す', () => {
  const session = createSession(CASES[2]);
  const xs = { ...session.arrangement.xs };
  assert.equal(nudge(session, -1, 5), true);
  assert.equal(session.arrangement.ly, 145);
  assert.deepEqual(session.arrangement.xs, xs);
  assert.equal(nudge(session, 1, 1), true);
  assert.equal(session.arrangement.ly, 146);
  select(session, 'hat');
  assert.equal(nudge(session, 1, 5), true);
  assert.equal(session.arrangement.xs.hat, 35);
  assert.equal(session.arrangement.ly, 146);
  setPropX(session, 'hat', 10000);
  assert.equal(nudge(session, 1, 1), false);
  setPropX(session, 'hat', -10000);
  assert.equal(nudge(session, -1, 1), false);
  select(session, 'lamp');
  setLamp(session, 10000);
  assert.equal(nudge(session, 1, 1), false);
  setLamp(session, -10000);
  assert.equal(nudge(session, -1, 1), false);
});

test('nudge は不正な向きを RangeError にし、不正な step を無視する', () => {
  const session = createSession(CASES[2]);
  const before = structuredClone(session);
  for (const direction of [0, 2, -2, NaN, Infinity, '1', null, undefined]) {
    assert.throws(() => nudge(session, direction, 1), RangeError);
  }
  for (const step of [0, -1, NaN, Infinity, -Infinity, '1', null, {}, 1n]) {
    assert.equal(nudge(session, 1, step), false);
  }
  assert.deepEqual(session, before);
});

test('成功の確定後は配置の操作を無視する', () => {
  const session = atSolution(CASES[2]);
  assert.equal(confirmSolve(session), true);
  const before = structuredClone(session);
  Object.freeze(session.arrangement.xs);
  Object.freeze(session.arrangement);
  Object.freeze(session);
  assert.equal(setLamp(session, 50), false);
  assert.equal(setPropX(session, 'hat', 50), false);
  assert.equal(nudge(session, -1, 5), false);
  assert.deepEqual(session, before);
});

test('reset は開始の配置に戻し、選択・ガイド・使用歴・ヒント順を保つ', () => {
  const session = atSolution(CASES[2]);
  select(session, 'hat');
  toggleGuide(session);
  useHint(session);
  const target = session.target;
  const stage = session.stage;
  assert.equal(confirmSolve(session), true);
  reset(session);
  assert.deepEqual(session.arrangement, startOf(stage));
  assert.equal(session.status, 'playing');
  assert.equal(session.assessment.success, false);
  assert.deepEqual(session.assessment, evaluate(stage, target, session.arrangement));
  assert.strictEqual(session.target, target);
  assert.strictEqual(session.stage, stage);
  assert.equal(session.selected, 'hat');
  assert.equal(session.guideOn, true);
  assert.equal(session.usedGuide, true);
  assert.equal(session.hintsUsed, 1);
  assert.equal(session.hintIndex, 0);
  reset(session);
  assert.deepEqual(session.arrangement, startOf(stage));
  assert.equal(session.hintsUsed, 1);
});

test('夜1の初期ガイドは数えず、消して付け直したときに使用を記録する', () => {
  const session = createSession(CASES[0]);
  assert.equal(session.guideOn, true);
  assert.equal(session.usedGuide, false);
  assert.equal(toggleGuide(session), false);
  assert.equal(session.usedGuide, false);
  assert.equal(toggleGuide(session), true);
  assert.equal(session.usedGuide, true);
  assert.equal(toggleGuide(session), false);
  assert.equal(session.usedGuide, true);
  reset(session);
  assert.equal(session.guideOn, false);
  assert.equal(session.usedGuide, true);
});

test('夜2はガイドを付けた時点で使用を記録する', () => {
  const session = createSession(CASES[1]);
  assert.equal(toggleGuide(session), true);
  assert.equal(session.usedGuide, true);
  assert.equal(toggleGuide(session), false);
  assert.equal(session.usedGuide, true);
});

test('ヒントは、ずれの名指しと考え方を交互に出し、表示するたびに使用数を増やす', () => {
  const session = createSession(CASES[0]);
  for (let used = 0; used < 6; used += 1) {
    const hint = useHint(session);
    assert.equal(hint.index, used);
    assert.equal(session.hintsUsed, used + 1);
    if (used % 2 === 0) {
      assert.equal(hint.kind, 'diagnosis');
      assert.deepEqual(hint, { index: used, kind: 'diagnosis', text: diagnose(session.stage, session.target, session.assessment, session.arrangement).text });
    } else {
      const principle = Math.floor(used / 2) % 2;
      assert.deepEqual(hint, { index: used, kind: 'principle', text: CASES[0].hints[principle] });
      assert.equal(session.hintIndex, (principle + 1) % 2);
    }
  }
});

test('ヒントの名指しは、押した時点の配置で変わる', () => {
  const session = createSession(CASES[0]);
  assert.match(useHint(session).text, /^灯りが、だいぶ高い。下げてみよう。$/);
  useHint(session);
  setLamp(session, session.stage.lamp.solution - 4);
  assert.match(useHint(session).text, /^灯りが、少し低い。上げてみよう。$/);
});

test('describeAssessment は成功・不足の理由・近さの全分岐を返す', () => {
  const session = createSession(CASES[0]);
  const checks = [
    [{ success: true, iou: 1, decoysOk: true, band: 'match' }, { step: 4, label: '再現できた', detail: '' }],
    [{ success: false, iou: 0.8, decoysOk: false, band: 'near' }, { step: 3, label: 'あと少し', detail: '関係ない道具の影が残っている' }],
    [{ success: false, iou: 0.8, decoysOk: true, band: 'near' }, { step: 3, label: 'あと少し', detail: 'ずれている道具がある' }],
    [{ success: false, iou: 0.79, decoysOk: true, band: 'near' }, { step: 3, label: '近い', detail: '' }],
    [{ success: false, iou: 0.6, decoysOk: true, band: 'warm' }, { step: 2, label: 'すこし似ている', detail: '' }],
    [{ success: false, iou: 0.2, decoysOk: true, band: 'far' }, { step: 1, label: '遠い', detail: '' }],
  ];
  for (const [assessment, expected] of checks) {
    session.assessment = assessment;
    const { fills, ...rest } = describeAssessment(session);
    assert.deepEqual(rest, expected);
    assert.equal(fills.length, 4);
    assert.strictEqual(session.assessment, assessment);
  }
  const last = createSession(CASES[4]);
  last.assessment = { success: false, iou: 0.83, decoysOk: false, band: 'near' };
  assert.equal(describeAssessment(last).label, '近い');
});

test('読み出しは灯りの高さと道具の横位置を整数cmへ丸める', () => {
  const session = createSession(CASES[2]);
  setLamp(session, 98.49);
  setPropX(session, 'bag', 92.49);
  assert.equal(lampReadout(session), 98);
  assert.equal(propReadout(session, 'bag'), 92);
  setLamp(session, 98.5);
  setPropX(session, 'bag', 92.5);
  assert.equal(lampReadout(session), 99);
  assert.equal(propReadout(session, 'bag'), 93);
});

test('近さのメーターは、IoUが各段の範囲のどこにあるかで連続して伸び、成功のときだけ4つ目まで満ちる', () => {
  const session = createSession(CASES[0]);
  const fillsFor = (assessment) => {
    session.assessment = assessment;
    return describeAssessment(session).fills;
  };
  const near = (value) => assert.ok(Math.abs(value) < 1e-9, String(value));
  const far = fillsFor({ success: false, iou: 0.25, decoysOk: true, band: 'far' });
  near(far[0] - 0.5);
  assert.deepEqual(far.slice(1), [0, 0, 0]);
  const warm = fillsFor({ success: false, iou: 0.6, decoysOk: true, band: 'warm' });
  assert.deepEqual(warm.slice(0, 1), [1]);
  near(warm[1] - 0.5);
  assert.deepEqual(warm.slice(2), [0, 0]);
  const close = fillsFor({ success: false, iou: 0.75, decoysOk: true, band: 'near' });
  assert.deepEqual(close.slice(0, 2), [1, 1]);
  near(close[2] - 0.5);
  assert.equal(close[3], 0);
  assert.deepEqual(fillsFor({ success: false, iou: 0.81, decoysOk: false, band: 'near' }), [1, 1, 1, 0]);
  assert.deepEqual(fillsFor({ success: true, iou: 1, decoysOk: true, band: 'match' }), [1, 1, 1, 1]);
  // 実際の評価でも、灯りを正解へ近づけるほど満ち具合の合計は増える。
  const live = createSession(CASES[1]);
  let previous = -1;
  for (const ly of [45, 60, 75, 90]) {
    setLamp(live, ly);
    const total = describeAssessment(live).fills.reduce((sum, value) => sum + value, 0);
    assert.ok(total > previous, `ly ${ly}: ${total} <= ${previous}`);
    previous = total;
  }
});

test('成功の確定は、邪魔な道具を置いた位置のまま残す（左右を入れ替えない）', () => {
  const caseDef = CASES[4];
  for (const [bowler, globe] of [[10, 230], [232, 8], [8, 8], [232, 232]]) {
    const session = atSolution(caseDef);
    setPropX(session, 'bowler', bowler);
    setPropX(session, 'globe', globe);
    assert.equal(session.assessment.success, true, `${bowler} ${globe}`);
    assert.equal(confirmSolve(session), true);
    assert.equal(session.arrangement.xs.bowler, bowler);
    assert.equal(session.arrangement.xs.globe, globe);
    const solution = solutionArrangement(session.stage);
    assert.equal(session.arrangement.ly, solution.ly);
    for (const id of ['umbrella', 'coat', 'boots']) assert.equal(session.arrangement.xs[id], solution.xs[id], id);
    assert.equal(session.assessment.success, true);
    assert.equal(session.assessment.decoysOk, true);
  }
});

test('diagnose は、灯り・道具・邪魔な道具のうち、いちばんずれているものを向きつきで名指しする', () => {
  const lampCase = createSession(CASES[1]);
  assert.equal(diagnose(lampCase.stage, lampCase.target, lampCase.assessment, lampCase.arrangement).kind, 'lamp');
  assert.match(diagnose(lampCase.stage, lampCase.target, lampCase.assessment, lampCase.arrangement).text, /^灯りが、だいぶ低い。上げてみよう。$/);

  const bag = atSolution(CASES[2]);
  setPropX(bag, 'bag', bag.stage.props.find((prop) => prop.id === 'bag').x.solution + 4);
  let result = diagnose(bag.stage, bag.target, bag.assessment, bag.arrangement);
  assert.deepEqual(result, { kind: 'prop', id: 'bag', text: '鞄が、少し右にずれている。左へすべらせよう。' });
  setPropX(bag, 'bag', bag.stage.props.find((prop) => prop.id === 'bag').x.solution - 10);
  result = diagnose(bag.stage, bag.target, bag.assessment, bag.arrangement);
  assert.equal(result.text, '鞄が、だいぶ左にずれている。右へすべらせよう。');

  // 外套が最大のずれのとき、灯りではなく外套を言う。
  const chair = atSolution(CASES[3]);
  setPropX(chair, 'coat', chair.stage.props.find((prop) => prop.id === 'coat').x.solution + 3);
  setLamp(chair, chair.stage.lamp.solution + 1);
  result = diagnose(chair.stage, chair.target, chair.assessment, chair.arrangement);
  assert.equal(result.id, 'coat');

  // 邪魔な道具の影が壁に残っていれば、ほかが少しずれていても先に名指しする。
  const umbrella = atSolution(CASES[4]);
  setPropX(umbrella, 'bowler', 140);
  setPropX(umbrella, 'umbrella', umbrella.stage.props.find((prop) => prop.id === 'umbrella').x.solution + 2);
  result = diagnose(umbrella.stage, umbrella.target, umbrella.assessment, umbrella.arrangement);
  assert.deepEqual(result, { kind: 'decoy', id: 'bowler', text: '山高帽の影が、壁に残っている。壁の右の端へすべらせよう。' });
  setPropX(umbrella, 'bowler', 70);
  assert.equal(diagnose(umbrella.stage, umbrella.target, umbrella.assessment, umbrella.arrangement).text.includes('壁の左の端'), true);
  // 壁の外へ出ていれば、邪魔な道具は名指しされない。
  setPropX(umbrella, 'bowler', 10);
  assert.notEqual(diagnose(umbrella.stage, umbrella.target, umbrella.assessment, umbrella.arrangement).kind, 'decoy');

  // ずれが無ければ、無いと言う。
  const done = atSolution(CASES[2]);
  assert.equal(diagnose(done.stage, done.target, done.assessment, done.arrangement).kind, 'none');
});

test('sizeWord は、ずれの大きさを3段の言葉にする', () => {
  assert.equal(sizeWord(1), 'ほんの少し');
  assert.equal(sizeWord(-2.4), 'ほんの少し');
  assert.equal(sizeWord(2.5), '少し');
  assert.equal(sizeWord(-6.9), '少し');
  assert.equal(sizeWord(7), 'だいぶ');
  assert.equal(sizeWord(-40), 'だいぶ');
});

test('どの夜でも、開始の配置の名指しは、ガイドなしで次の一手になる', () => {
  for (const caseDef of CASES) {
    const session = createSession(caseDef);
    const result = diagnose(session.stage, session.target, session.assessment, session.arrangement);
    assert.ok(['lamp', 'prop', 'decoy'].includes(result.kind), caseDef.id);
    assert.ok(result.text.length > 10 && !/undefined|NaN/.test(result.text), caseDef.id);
    // 名指しに従って動かすと、ずれが小さくなる（向きが正しい）。
    const before = Math.abs(result.kind === 'lamp'
      ? session.arrangement.ly - session.stage.lamp.solution
      : session.arrangement.xs[result.id] - session.stage.props.find((prop) => prop.id === result.id).x.solution);
    if (result.kind === 'decoy') continue;
    const step = result.text.includes('上げ') || result.text.includes('右へ') ? 5 : -5;
    if (result.kind === 'lamp') setLamp(session, session.arrangement.ly + step);
    else setPropX(session, result.id, session.arrangement.xs[result.id] + step);
    const after = Math.abs(result.kind === 'lamp'
      ? session.arrangement.ly - session.stage.lamp.solution
      : session.arrangement.xs[result.id] - session.stage.props.find((prop) => prop.id === result.id).x.solution);
    assert.ok(after < before, `${caseDef.id}: ${result.text}`);
  }
});
