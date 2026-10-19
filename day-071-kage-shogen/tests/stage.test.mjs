import assert from 'node:assert/strict';
import test from 'node:test';
import { CASES, stageOf } from '../lib/cases.js';
import { buildTarget, evaluate, solutionArrangement } from '../lib/score.js';
import { diagnose, sizeWord } from '../lib/diagnose.js';
import {
  HINT_END, confirmSolve, createSession, describeAssessment, lampReadout, movableIds, nudge, propReadout, reset, select,
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
    assert.deepEqual(session.shownHints, []);
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

test('reset は開始の配置に戻し、選択・ガイド・使用歴・出したヒントを保つ', () => {
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
  assert.equal(session.shownHints.length, 1);
  reset(session);
  assert.deepEqual(session.arrangement, startOf(stage));
  assert.equal(session.hintsUsed, 1);
});

test('夜1のガイドは練習用なので、何度出し入れしても使用を記録しない', () => {
  const session = createSession(CASES[0]);
  assert.equal(session.guideOn, true);
  assert.equal(session.usedGuide, false);
  for (const expected of [false, true, false, true]) {
    assert.equal(toggleGuide(session), expected);
    assert.equal(session.usedGuide, false);
  }
  reset(session);
  assert.equal(session.guideOn, true);
  assert.equal(session.usedGuide, false);
});

test('夜2はガイドを付けた時点で使用を記録する', () => {
  const session = createSession(CASES[1]);
  assert.equal(toggleGuide(session), true);
  assert.equal(session.usedGuide, true);
  assert.equal(toggleGuide(session), false);
  assert.equal(session.usedGuide, true);
});

test('ヒントは、まだ出していない文を1つずつ出し、同じ文を番号だけ変えて出さず、尽きたら「ここまで」と言う', () => {
  for (const caseDef of CASES) {
    const session = createSession(caseDef);
    const texts = [];
    for (let used = 0; used < caseDef.hints.length + 3; used += 1) {
      const hint = useHint(session);
      assert.equal(hint.index, used);
      assert.equal(session.hintsUsed, used + 1);
      texts.push(hint);
    }
    // 1回目はいまのずれの名指し、続けて、その夜の考え方を順に。
    assert.equal(texts[0].kind, 'diagnosis');
    assert.deepEqual(texts[0], { index: 0, kind: 'diagnosis', text: diagnose(session.stage, session.target, createSession(caseDef).assessment, createSession(caseDef).arrangement).text });
    caseDef.hints.forEach((text, i) => assert.deepEqual(texts[1 + i], { index: 1 + i, kind: 'principle', text }, `${caseDef.id} principle ${i}`));
    // 出し尽くしたあとは「ここまで」。同じ文を、新しい番号で出し直さない。
    const rest = texts.slice(1 + caseDef.hints.length);
    assert.ok(rest.every((hint) => hint.kind === 'end' && hint.text === HINT_END), caseDef.id);
    const shown = texts.filter((hint) => hint.kind !== 'end').map((hint) => hint.text);
    assert.equal(new Set(shown).size, shown.length, `${caseDef.id}: 同じ文が2回出た`);
  }
});

test('配置が変わって名指しの文が替わると、新しい名指しを先に出す', () => {
  const session = createSession(CASES[2]);
  const first = useHint(session);
  assert.equal(first.kind, 'diagnosis');
  assert.equal(useHint(session).kind, 'principle');
  setLamp(session, session.stage.lamp.solution + 1);
  setPropX(session, 'bag', session.stage.props.find((prop) => prop.id === 'bag').x.solution - 6);
  setPropX(session, 'hat', session.stage.props.find((prop) => prop.id === 'hat').x.solution);
  setPropX(session, 'coat', session.stage.props.find((prop) => prop.id === 'coat').x.solution);
  const again = useHint(session);
  assert.equal(again.kind, 'diagnosis');
  assert.notEqual(again.text, first.text);
  assert.equal(again.text, '鞄が、少し左にずれている。右へすべらせよう。');
  // 変えていなければ、同じ名指しは出さず、次の考え方へ進む。
  assert.equal(useHint(session).kind, 'principle');
});

test('ヒントの名指しは、押した時点の配置で変わる', () => {
  const session = createSession(CASES[0]);
  assert.match(useHint(session).text, /^灯りが、だいぶ高い。下げてみよう。$/);
  setLamp(session, session.stage.lamp.solution + 8);
  // 107cm（近さは「近い」）では、「だいぶ」とは言わない。
  assert.match(useHint(session).text, /^灯りが、少し高い。下げてみよう。$/);
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
  last.assessment = { success: false, iou: 0.79, decoysOk: false, band: 'near' };
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
  assert.equal(sizeWord(-2.9), 'ほんの少し');
  assert.equal(sizeWord(3), '少し');
  assert.equal(sizeWord(-9.9), '少し');
  assert.equal(sizeWord(10), 'だいぶ');
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

test('近いのに合格しないとき、近さの文は「灯りの高さ」か「道具の横位置」のどちらがずれているかを、答えを言わずに添える', () => {
  const detailOf = (session) => describeAssessment(session).detail;
  // 夜3：灯りが合っていて、道具がずれている → 道具の横位置。
  const bag = atSolution(CASES[2]);
  setPropX(bag, 'bag', bag.stage.props.find((prop) => prop.id === 'bag').x.solution + 7);
  setPropX(bag, 'coat', bag.stage.props.find((prop) => prop.id === 'coat').x.solution - 7);
  assert.equal(bag.assessment.success, false);
  assert.equal(describeAssessment(bag).label, '近い');
  assert.equal(detailOf(bag), '道具の横位置がずれている');
  // 灯りがずれているときは、灯りを先に言う（縦が合わないと、横も合わせようがない）。
  const lampOff = atSolution(CASES[2]);
  setLamp(lampOff, lampOff.stage.lamp.solution + 12);
  assert.equal(lampOff.assessment.success, false);
  assert.equal(describeAssessment(lampOff).label, '近い');
  assert.equal(detailOf(lampOff), '灯りの高さがずれている');
  // 灯りも道具も外れていれば、やはり灯りを先に言う。
  setPropX(lampOff, 'bag', lampOff.stage.props.find((prop) => prop.id === 'bag').x.solution + 4);
  assert.equal(detailOf(lampOff), '灯りの高さがずれている');
  // 夜1・夜2（道具が動かない夜）は、灯りしか動かさないので、わざわざ添えない。
  const rack = createSession(CASES[0]);
  setLamp(rack, rack.stage.lamp.solution + 8);
  assert.equal(describeAssessment(rack).label, '近い');
  assert.equal(detailOf(rack), '');
  // 邪魔な道具が残っていれば、それを言う。
  const umbrella = atSolution(CASES[4]);
  setPropX(umbrella, 'bowler', 140);
  assert.equal(describeAssessment(umbrella).detail, '関係ない道具の影が残っている');
});

test('成功の確定は、そろえたあとの配置も合格のままにする（許容ぎりぎりで合格した邪魔な道具は、同じ側の端へ寄せる）', () => {
  // 灯り109cmで、地球儀の影の面積が許容の上限に近い配置は、灯りを108cmへそろえると、影が大きくなって許容を超える。
  const session = createSession(CASES[4]);
  setLamp(session, 109);
  for (const [id, x] of [['umbrella', 120], ['coat', 120], ['boots', 120], ['bowler', 10], ['globe', 196]]) setPropX(session, id, x);
  assert.equal(session.assessment.success, true);
  assert.equal(confirmSolve(session), true);
  assert.equal(session.status, 'solved');
  assert.equal(session.assessment.success, true, 'そろえたあとも合格');
  assert.equal(session.assessment.decoysOk, true);
  assert.equal(session.arrangement.ly, 108);
  // 地球儀は右側にあったので、右の端へ。山高帽は、動かさない（左端のまま）。
  assert.equal(session.arrangement.xs.globe, 232);
  assert.equal(session.arrangement.xs.bowler, 10);
});

test('夜5：邪魔な道具の置き場所と灯りの高さをどう組み合わせても、合格した配置は、確定したあとも合格で、左右は入れ替わらない', () => {
  const caseDef = CASES[4];
  let confirmed = 0;
  for (const ly of [104, 106, 108, 110, 112]) {
    for (const bowler of [8, 10, 30, 50, 70]) {
      for (const globe of [130, 150, 170, 190, 200, 210, 220, 232]) {
        const session = createSession(caseDef);
        setLamp(session, ly);
        for (const id of ['umbrella', 'coat', 'boots']) setPropX(session, id, session.stage.props.find((prop) => prop.id === id).x.solution);
        setPropX(session, 'bowler', bowler);
        setPropX(session, 'globe', globe);
        if (!session.assessment.success) continue;
        const sideOf = (x, prop) => (x < (prop.x.min + prop.x.max) / 2 ? 'left' : 'right');
        const before = Object.fromEntries(session.stage.props.filter((prop) => prop.decoy).map((prop) => [prop.id, sideOf(session.arrangement.xs[prop.id], prop)]));
        assert.equal(confirmSolve(session), true);
        confirmed += 1;
        assert.equal(session.assessment.success, true, `lamp ${ly} bowler ${bowler} globe ${globe}`);
        for (const prop of session.stage.props.filter((entry) => entry.decoy)) {
          assert.equal(sideOf(session.arrangement.xs[prop.id], prop), before[prop.id], `${prop.id} 左右が入れ替わった`);
        }
      }
    }
  }
  assert.ok(confirmed >= 20, `確かめた配置が少なすぎる: ${confirmed}`);
});
