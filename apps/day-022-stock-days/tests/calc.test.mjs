import assert from 'node:assert/strict';
import test from 'node:test';
import { calculate, daysFor, requiredPerDay, shortageFor, truncateOne, validateNumber } from '../lib/calc.js';

const base = (changes = {}) => ({
  people: 4,
  targetDays: 7,
  rows: {
    water: { stock: 24 },
    food: { stock: 20 },
    toilet: { stock: 30 }
  },
  custom: [],
  ...changes
});

test('必要量/日は1人量×人数', () => assert.equal(requiredPerDay(3, 4), 12));
test('日数は小数1桁で切り捨てる', () => assert.equal(daysFor(24.7, 10), 2.4));
test('2.47を小数1桁で切り捨てる', () => assert.equal(truncateOne(2.47), 2.4));
test('手持ち0は0.0日として計算できる', () => assert.equal(daysFor(0, 12), 0));
test('必要量0の日数は計算しない', () => assert.equal(daysFor(10, 0), null));

test('4人の水・食料・トイレの日数と全体日数を計算する', () => {
  const result = calculate(base());
  assert.deepEqual(result.rows.slice(0, 3).map(({ days }) => days), [2, 1.6, 1.5]);
  assert.equal(result.overallDays, 1.5);
  assert.equal(result.bottleneck.id, 'toilet');
});

test('同点では水が最初になる', () => {
  const result = calculate(base({ rows: { water: { stock: 12 }, food: { stock: 12 }, toilet: { stock: 20 } } }));
  assert.equal(result.bottleneck.id, 'water');
});

test('同点で水が無ければ食料がトイレより先になる', () => {
  const result = calculate(base({ rows: { water: { stock: '' }, food: { stock: 12 }, toilet: { stock: 20 } } }));
  assert.equal(result.bottleneck.id, 'food');
});

test('同点で必須行が無ければ自由行の追加順を使う', () => {
  const result = calculate(base({
    rows: { water: { stock: '' }, food: { stock: '' }, toilet: { stock: '' } },
    custom: [
      { id: 'a', name: 'A', unit: '個', stock: 4, perDay: 2 },
      { id: 'b', name: 'B', unit: '個', stock: 6, perDay: 3 }
    ]
  }));
  assert.equal(result.bottleneck.id, 'a');
});

test('7日・4人・水24Lなら不足60Lで2Lペット30本', () => {
  assert.deepEqual(shortageFor(24, 12, 7, { water: true }), { amount: 60, bottles: 30 });
});

test('不足する水が1Lなら2Lペットは1本に切り上げる', () => {
  assert.deepEqual(shortageFor(20, 3, 7, { water: true }), { amount: 1, bottles: 1 });
});

test('目標を7日から3日にすると不足量が変わる', () => {
  assert.equal(shortageFor(24, 12, 7).amount, 60);
  assert.equal(shortageFor(24, 12, 3).amount, 12);
});

test('目標以上なら不足は0', () => assert.equal(shortageFor(100, 12, 7).amount, 0));

test('自由行の1日量が空なら計算から除外する', () => {
  const result = calculate(base({ custom: [{ id: 'gas', name: 'カセットボンベ', unit: '本', stock: 3, perDay: '' }] }));
  const row = result.rows.at(-1);
  assert.equal(row.included, false);
  assert.equal(row.needsPerDay, true);
});

test('自由行の1日量が0なら計算から除外する', () => {
  const result = calculate(base({ custom: [{ id: 'gas', name: 'カセットボンベ', unit: '本', stock: 3, perDay: 0 }] }));
  assert.equal(result.rows.at(-1).included, false);
});

test('自由行は世帯合計の1日量で計算する', () => {
  const result = calculate(base({ custom: [{ id: 'gas', name: 'カセットボンベ', unit: '本', stock: 3, perDay: 1 }] }));
  assert.equal(result.rows.at(-1).days, 3);
});

test('負数は不正', () => assert.equal(validateNumber(-1).valid, false));
test('数値でない値は不正', () => assert.equal(validateNumber('abc').valid, false));
test('100000超は不正', () => assert.equal(validateNumber(100001).valid, false));
test('100000ちょうどは有効', () => assert.equal(validateNumber(100000).valid, true));
test('人数の小数は不正', () => assert.equal(validateNumber(2.5, { integer: true, min: 1, max: 20 }).valid, false));
test('不正な行は全体日数から除外しつつエラーを返す', () => {
  const result = calculate(base({ rows: { water: { stock: -1 }, food: { stock: 20 }, toilet: { stock: 30 } } }));
  assert.equal(result.bottleneck.id, 'toilet');
  assert.deepEqual(result.errors[0], { id: 'water', field: 'stock' });
});

