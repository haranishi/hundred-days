import assert from 'node:assert/strict';
import test from 'node:test';
import { CASES, stageOf } from '../lib/cases.js';
import { buildTarget, evaluate, solutionArrangement } from '../lib/score.js';
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
        assert.equal(confirmSolve(session), true, `${id} ${delta}`);
        assert.equal(session.status, 'solved');
        assert.deepEqual(session.arrangement, solutionArrangement(session.stage));
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
  assert.equal(session.hintIndex, 1);
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

test('ヒントは順に巡り、表示するたびに使用数を増やす', () => {
  const session = createSession(CASES[0]);
  for (let used = 0; used < 5; used += 1) {
    const index = used % 2;
    assert.deepEqual(useHint(session), { index, text: CASES[0].hints[index] });
    assert.equal(session.hintsUsed, used + 1);
    assert.equal(session.hintIndex, (index + 1) % 2);
  }
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
    assert.deepEqual(describeAssessment(session), expected);
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
