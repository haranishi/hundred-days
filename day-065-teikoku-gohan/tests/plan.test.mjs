// プレイヤーの状態：分岐の切り替え・出発順の入れ替え・見本の反映・同じ計画かどうか。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../lib/levels-data.js';
import {
  initialPlan, samplePlan, cycleChoice, moveTrain, samePlan, pathOf, branchesOnPath, branchNodes,
  stepsOfPath, currentExit, simInput,
} from '../lib/plan.js';

const L = Object.fromEntries(LEVELS.map((x) => [x.id, x]));

describe('分岐の切り替え', () => {
  it('タップごとに edges の順で出口が進み、最後の次は先頭に戻る', () => {
    let p = initialPlan(L.L4);
    const seen = [];
    for (let i = 0; i < 4; i++) {
      seen.push(currentExit(L.L4, p, 't1', 'J1'));
      p = cycleChoice(L.L4, p, 't1', 'J1');
    }
    assert.deepStrictEqual(seen, ['G1', 'G2', 'M', 'G1']);
  });

  it('面1：分岐を1回切り替えると、切る駅を通らない進路になる', () => {
    const p0 = initialPlan(L.L1);
    assert.deepStrictEqual(pathOf(L.L1, p0, 't1'), ['Y', 'J1', 'C', 'J2', 'G', 'S']);
    assert.deepStrictEqual(stepsOfPath(L.L1, pathOf(L.L1, p0, 't1')), ['cut', 'grill']);
    const p1 = cycleChoice(L.L1, p0, 't1', 'J1');
    assert.deepStrictEqual(pathOf(L.L1, p1, 't1'), ['Y', 'J1', 'J2', 'G', 'S']);
    assert.deepStrictEqual(stepsOfPath(L.L1, pathOf(L.L1, p1, 't1')), ['grill']);
    assert.deepStrictEqual(p0.choices, {}, '元の plan は変えない');
  });

  it('分岐は出口が2本以上の junction だけで、経路の上の分岐は上流から並ぶ', () => {
    assert.deepStrictEqual(branchNodes(L.L1), ['J1']);
    assert.deepStrictEqual(branchNodes(L.L3), ['J1', 'J2', 'J3']);
    assert.deepStrictEqual(branchesOnPath(L.L3, pathOf(L.L3, initialPlan(L.L3), 't1')), ['J1', 'J2', 'J3']);
    const sashimi = { order: ['t1'], choices: { t1: { J2: 'S' } } };
    assert.deepStrictEqual(branchesOnPath(L.L3, pathOf(L.L3, sashimi, 't1')), ['J1', 'J2']);
  });

  it('合流（出口1本）を切り替えようとしても変わらない', () => {
    const p = initialPlan(L.L1);
    assert.equal(cycleChoice(L.L1, p, 't1', 'J2'), p);
  });
});

describe('出発順', () => {
  it('▲▼で隣と入れ替わり、端では変わらない', () => {
    const p = initialPlan(L.L3);
    assert.deepStrictEqual(moveTrain(p, 't3', -1).order, ['t1', 't3', 't2', 't4']);
    assert.deepStrictEqual(moveTrain(p, 't3', 1).order, ['t1', 't2', 't4', 't3']);
    assert.equal(moveTrain(p, 't1', -1), p);
    assert.equal(moveTrain(p, 't4', 1), p);
    assert.deepStrictEqual(p.order, ['t1', 't2', 't3', 't4'], '元の plan は変えない');
  });
});

describe('見本と、同じ計画かどうか', () => {
  it('見本は solution の写し（書き換えても面データは変わらない）', () => {
    const p = samplePlan(L.L3);
    assert.deepStrictEqual(p.order, L.L3.solution.order);
    p.order.reverse();
    p.choices.t1.J1 = 'J2';
    assert.deepStrictEqual(L.L3.solution.order, ['t2', 't3', 't1', 't4']);
    assert.equal(L.L3.solution.choices.t1.J1, 'C');
  });

  it('通らない分岐の選択や無効な選択の違いは「同じ計画」とみなす', () => {
    const a = samplePlan(L.L3);
    const b = samplePlan(L.L3);
    b.choices.t1.J3 = 'G2'; // 魚は J2 から配膳へ行くので J3 を通らない
    assert.equal(samePlan(L.L3, a, b), true);
    b.choices.t2.J3 = 'G2'; // 牛肉は J3 を通るので経路が変わる
    assert.equal(samePlan(L.L3, a, b), false);
    assert.equal(samePlan(L.L3, a, moveTrain(a, 't1', 1)), false);
  });

  it('sim に渡す形は、全列車の経路を持つ', () => {
    const input = simInput(L.L2, initialPlan(L.L2));
    assert.deepStrictEqual(input.order, ['t1', 't2']);
    assert.deepStrictEqual(Object.keys(input.paths).sort(), ['t1', 't2']);
  });
});
