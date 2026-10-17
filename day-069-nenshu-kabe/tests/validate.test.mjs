import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseYen, validateInputs } from '../lib/validate.js';
import { EXAMPLE, LIMITS } from '../lib/rules-2026.js';

describe('入力の解釈', () => {
  it('全角数字・カンマ・前後の空白を円の整数にする', () => {
    for (const value of [' １，０３０，０００ ', '1,030,000', 1_030_000]) assert.deepEqual(parseYen(value), { ok: true, value: 1_030_000 });
    assert.deepEqual(parseYen('0'), { ok: true, value: 0 });
  });
  it('空・数字でない・負の数・小数・有限でない値を理由つきで落とす', () => {
    for (const value of ['', '円', '1e3', '0x10', '-1', '－１', '-0', '－０', '1.1', '12万', Infinity, NaN, {}, null, '9'.repeat(400)]) {
      const result = parseYen(value);
      assert.equal(result.ok, false, String(value));
      assert.ok(result.message.length > 0);
    }
  });
});

describe('欄ごとの検証', () => {
  it('例を検証し、全角の小数は第1位まで受け付ける', () => {
    assert.deepEqual(validateInputs(EXAMPLE), { ok: true, inputs: EXAMPLE });
    assert.equal(validateInputs({ ...EXAMPLE, hoursPerPayday: '８５．５' }).inputs.hoursPerPayday, 85.5);
  });
  for (const [field, { min, max }] of Object.entries(LIMITS)) {
    it(`${field}の下限・上限を通し、その外と文字を欄の理由つきで落とす`, () => {
      for (const value of [min, max]) assert.equal(validateInputs({ ...EXAMPLE, [field]: value }).ok, true);
      for (const value of [min - 1, max + 1, 'abc']) {
        const result = validateInputs({ ...EXAMPLE, [field]: value });
        assert.equal(result.ok, false);
        assert.deepEqual(Object.keys(result.errors), [field]);
        assert.ok(result.errors[field].includes('：'));
      }
    });
  }
  it('金額・時給・回数は整数、時間だけ小数第1位を許す', () => {
    for (const field of ['paidSoFar', 'hourlyWage', 'remainingPaydays']) {
      assert.match(validateInputs({ ...EXAMPLE, [field]: '1.1' }).errors[field], /整数/);
    }
    for (const value of ['0.01', '1.11', '1.00']) assert.match(validateInputs({ ...EXAMPLE, hoursPerPayday: value }).errors.hoursPerPayday, /第1位/);
    assert.match(validateInputs({ ...EXAMPLE, hourlyWage: '0' }).errors.hourlyWage, /1円以上/);
  });
  it('時給と時間は空欄可、給料と回数は必須', () => {
    for (const field of ['hourlyWage', 'hoursPerPayday']) {
      for (const value of ['', ' ', null, undefined]) assert.equal(validateInputs({ ...EXAMPLE, [field]: value }).inputs[field], null);
    }
    for (const field of ['paidSoFar', 'remainingPaydays']) assert.ok(validateInputs({ ...EXAMPLE, [field]: '' }).errors[field]);
  });
  it('未知の年齢・真偽値でない学生・欠けた入力は落とす', () => {
    assert.ok(validateInputs({ ...EXAMPLE, ageBand: 'unknown' }).errors.ageBand);
    assert.ok(validateInputs({ ...EXAMPLE, student: 'false' }).errors.student);
    assert.equal(validateInputs(null).ok, false);
  });
});

describe('細かい書き方の境界', () => {
  it('時間の欄ではカンマを受け付けない（「8,5」を85時間にしない）', () => {
    const result = validateInputs({ ...EXAMPLE, hoursPerPayday: '8,5' });
    assert.equal(result.ok, false);
    assert.ok(result.errors.hoursPerPayday);
    assert.equal(validateInputs({ ...EXAMPLE, hoursPerPayday: '８．５' }).inputs.hoursPerPayday, 8.5);
  });
  it('金額の欄は3桁区切りのカンマを読み飛ばし、誤りには入力例を添える', () => {
    assert.equal(validateInputs({ ...EXAMPLE, paidSoFar: '1,150,000' }).inputs.paidSoFar, 1_150_000);
    const result = validateInputs({ ...EXAMPLE, paidSoFar: '12万' });
    assert.match(result.errors.paidSoFar, /例：120000/);
  });
  it('「-0」は負の数として落とす', () => {
    assert.match(validateInputs({ ...EXAMPLE, paidSoFar: '-0' }).errors.paidSoFar, /負の数/);
  });
});
