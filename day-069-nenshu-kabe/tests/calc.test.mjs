import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { salaryIncome, wallsFor, evaluate, parentDeduction, healthRule } from '../lib/calc.js';
import { EXAMPLE, AGE_BANDS, TAX_WALLS, PARENT_DEDUCTION, HEALTH } from '../lib/rules-2026.js';

const input = (extra = {}) => ({ ...EXAMPLE, ...extra });
const result = (inputs, id) => evaluate(inputs).walls.find(({ wall }) => wall.id === id);

describe('給与所得と対象の壁', () => {
  it('給与所得の境界と、壁で使う所得への換算', () => {
    for (const [R, expected] of [[0, 0], [740_999, 0], [741_000, 1_000], [1_360_000, 620_000]]) {
      assert.equal(salaryIncome(R), expected);
    }
    for (const wall of TAX_WALLS) assert.equal(salaryIncome(wall.threshold), wall.incomeLimit);
  });
  for (const { id: ageBand } of AGE_BANDS) {
    for (const student of [false, true]) {
      it(`${ageBand}・学生${student}の壁を小さい順に絞る`, () => {
        const walls = wallsFor({ ageBand, student });
        const ids = walls.map(({ id }) => id);
        assert.deepEqual(walls.map(({ threshold }) => threshold), walls.map(({ threshold }) => threshold).sort((a, b) => a - b));
        assert.equal(ids.includes('resident-minor'), ageBand === 'u18');
        assert.equal(ids.includes('resident-flat'), ageBand !== 'u18');
        for (const id of ['resident-income-student', 'work-student-limit']) assert.equal(ids.includes(id), student && ageBand !== 'u18');
        for (const id of ['parent-income-tax-full', 'parent-resident-full', 'parent-zero']) assert.equal(ids.includes(id), ageBand === 'a19_22');
        const parent = walls.find(({ id }) => id === 'parent-dependent');
        assert.equal(parent.kind, ageBand === 'a19_22' ? 'switch' : 'cliff');
        assert.match(parent.effect, ageBand === 'a19_22' ? /控除額は変わりません/ : /受けられなく/);
        for (const wall of walls) {
          assert.equal(wall.variants, undefined);
          assert.equal(wall.applies, undefined);
        }
        if (ageBand !== 'u18') assert.equal(walls[0].title, student ? '本人に住民税の均等割がかかり始める' : '本人に住民税がかかり始める');
        assert.equal(parent.title, ageBand === 'a19_22' ? '親の控除の種類が切り替わる' : '親の扶養控除がなくなる');
      });
    }
  }
  it('年齢ごとの上書きは基準データを変更しない', () => {
    const before = JSON.stringify(TAX_WALLS);
    wallsFor(input());
    wallsFor(input({ ageBand: 'a18', student: false }));
    assert.equal(JSON.stringify(TAX_WALLS), before);
  });
});

describe('残り・予定・最も近い壁', () => {
  for (const wall of TAX_WALLS) {
    it(`${wall.id}は基準ちょうどと1円超過を区別する`, () => {
      const profile = { ageBand: wall.applies.ageBands[0], student: true, remainingPaydays: 0 };
      const at = result(input({ ...profile, paidSoFar: wall.threshold }), wall.id);
      assert.equal(at.status, 'clear');
      assert.equal(at.remaining, 0);
      assert.equal(at.remainingHours, 0);
      const over = result(input({ ...profile, paidSoFar: wall.threshold + 1 }), wall.id);
      assert.equal(over.status, 'crossed');
      assert.equal(over.overBy, 1);
      for (const key of ['remaining', 'remainingHours', 'perPaydayCap', 'perPaydayHours', 'crossAtPayday']) assert.equal(over[key], null);
    });
  }
  it('例では両端をそれぞれ評価し、越える最初の給料日と見込み額を出す', () => {
    const evaluation = evaluate(input());
    assert.equal(evaluation.perPaydayPlanned, 102_000);
    assert.equal(evaluation.projected, 1_336_000);
    const flat = evaluation.walls[0];
    assert.equal(flat.status, 'will-cross');
    assert.equal(flat.crossAtPayday, 2);
    assert.equal(flat.overBy, 146_000);
    assert.equal(flat.low.status, 'will-cross');
    assert.equal(flat.low.crossAtPayday, 1);
    assert.equal(flat.low.overBy, 216_000);
    assert.equal(evaluation.nearest, flat);
    assert.equal(flat.low.remaining, 90_000);
  });
  it('均等割の下端も基準ちょうどと1円超過を区別する', () => {
    const threshold = TAX_WALLS.find(({ id }) => id === 'resident-flat').rangeLow.threshold;
    assert.equal(result(input({ paidSoFar: threshold, remainingPaydays: 0 }), 'resident-flat').low.remaining, 0);
    const over = result(input({ paidSoFar: threshold + 1, remainingPaydays: 0 }), 'resident-flat');
    assert.equal(over.low.status, 'crossed');
    assert.equal(over.low.overBy, 1);
    assert.equal(over.status, 'clear');
  });
  it('1回分がちょうどなら越えず、その次の回で越える', () => {
    const r = result(input({ paidSoFar: 1_780_000 - 2_400, remainingPaydays: 3, hoursPerPayday: 1 }), 'self-income-tax');
    assert.equal(r.crossAtPayday, 3);
    assert.equal(r.overBy, 1_200);
    assert.equal(result(input({ paidSoFar: 1_780_000 - 2_400, remainingPaydays: 2, hoursPerPayday: 1 }), 'self-income-tax').status, 'clear');
  });
  it('時間・1回あたりの上限は切り捨てる', () => {
    const r = result(input({ paidSoFar: 1_780_000 - 10_001, remainingPaydays: 3, hourlyWage: 1_200, hoursPerPayday: null }), 'self-income-tax');
    assert.equal(r.remainingHours, 8);
    assert.equal(r.perPaydayCap, 3_333);
    assert.equal(r.perPaydayHours, 2);
  });
  it('小数の時間でも円は整数で、2進浮動小数の端数を切り捨てない', () => {
    assert.equal(evaluate(input({ hourlyWage: 1_001, hoursPerPayday: 0.1 })).perPaydayPlanned, 100);
    assert.equal(evaluate(input({ hourlyWage: 10, hoursPerPayday: 0.7 })).perPaydayPlanned, 7);
    assert.ok(Number.isInteger(evaluate(input({ hourlyWage: 1_001, hoursPerPayday: 0.1 })).projected));
  });
  it('時給なしは金額だけ、予定と健康保険の差は出さない', () => {
    const e = evaluate(input({ hourlyWage: null }));
    assert.equal(e.projected, EXAMPLE.paidSoFar);
    assert.equal(e.perPaydayPlanned, null);
    assert.equal(e.health.diff, null);
    for (const r of e.walls) {
      assert.equal(r.remainingHours, null);
      assert.equal(r.perPaydayHours, null);
      assert.equal(r.crossAtPayday, null);
    }
  });
  it('予定時間なし・0時間・残り0回は越える回を出さない', () => {
    for (const extra of [{ hoursPerPayday: null }, { hoursPerPayday: 0 }, { remainingPaydays: 0 }]) {
      const e = evaluate(input(extra));
      assert.equal(e.projected, EXAMPLE.paidSoFar);
      assert.ok(e.walls.every((r) => r.crossAtPayday === null));
      if (extra.remainingPaydays === 0) assert.ok(e.walls.every((r) => r.perPaydayCap === null && r.perPaydayHours === null));
    }
  });
  it('住民税の範囲の下端だけ越えたときは、上端でnearestに残る', () => {
    const evaluation = evaluate(input({ paidSoFar: 1_150_000 }));
    assert.equal(evaluation.nearest.wall.id, 'resident-flat');
    assert.equal(evaluation.nearest.low.status, 'crossed');
    assert.equal(evaluation.nearest.remaining, 40_000);
  });
  it('切り替えだけの壁はnearestから除き、すべて越えたらnull', () => {
    assert.equal(evaluate(input({ paidSoFar: 1_350_000 })).nearest.wall.id, 'resident-income-student');
    assert.equal(evaluate(input({ paidSoFar: 3_000_000 })).nearest, null);
  });
});

describe('親の控除と健康保険', () => {
  for (const kind of ['incomeTax', 'residentTax']) {
    it(`19〜22歳の${kind}のすべての段を1円差で確かめる`, () => {
      const steps = PARENT_DEDUCTION.a19_22[kind];
      for (let i = 0; i < steps.length; i += 1) {
        assert.equal(parentDeduction(steps[i].upTo, 'a19_22')[kind], steps[i].amount);
        assert.equal(parentDeduction(steps[i].upTo + 1, 'a19_22')[kind], steps[i + 1]?.amount ?? 0);
      }
    });
  }
  it('19〜22歳以外は136万円の1円超過で控除がなくなる', () => {
    for (const ageBand of ['u18', 'a18', 'a23p']) {
      assert.deepEqual(parentDeduction(1_360_000, ageBand), { incomeTax: 380_000, residentTax: 330_000 });
      assert.deepEqual(parentDeduction(1_360_001, ageBand), { incomeTax: 0, residentTax: 0 });
    }
  });
  it('年齢別の健康保険は未満の基準を持ち、月額との差は1円で符号が変わる', () => {
    const plans = {
      general: [{ hourlyWage: 9_339, hoursPerPayday: 11.6 }, { hourlyWage: 9_587, hoursPerPayday: 11.3 }, { hourlyWage: 9_503, hoursPerPayday: 11.4 }],
      a19_22: [{ hourlyWage: 9_124, hoursPerPayday: 13.7 }, { hourlyWage: 7_716, hoursPerPayday: 16.2 }, { hourlyWage: 10_000, hoursPerPayday: 12.5 }],
    };
    for (const { id: ageBand } of AGE_BANDS) {
      const rule = healthRule(ageBand);
      assert.deepEqual(rule, HEALTH.bands[ageBand === 'a19_22' ? 'a19_22' : 'general']);
      assert.equal(rule.boundary, 'lt');
      const nearLimit = plans[ageBand === 'a19_22' ? 'a19_22' : 'general'];
      for (const [index, plan] of nearLimit.entries()) {
        const e = evaluate(input({ ageBand, ...plan }));
        assert.equal(e.perPaydayPlanned, rule.monthlyMax + index - 1);
        assert.equal(e.health.diff, 1 - index);
      }
    }
    assert.equal(healthRule('a18').monthlyMax, 108_333);
    assert.equal(healthRule('a19_22').monthlyMax, 124_999);
    assert.ok(evaluate(input({ hourlyWage: 1_000, hoursPerPayday: 125 })).health.diff < 0);
    assert.ok(evaluate(input({ hourlyWage: 1_000, hoursPerPayday: 124.9 })).health.diff > 0);
  });
});
