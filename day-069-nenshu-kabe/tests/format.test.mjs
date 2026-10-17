import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { yen, man, hours, manExact } from '../lib/format.js';

describe('金額と時間の表示', () => {
  it('円は3桁で区切り、0と負の差額も表示する', () => {
    assert.equal(yen(0), '0円');
    assert.equal(yen(1_030_000), '1,030,000円');
    assert.equal(yen(-1), '-1円');
  });
  it('万円は小数1桁までで、不要な.0を付けない', () => {
    assert.equal(man(0), '0万円');
    assert.equal(man(1_190_000), '119万円');
    assert.equal(man(1_155_000), '115.5万円');
    assert.equal(man(1_155_555), '115.6万円');
  });
  it('時間は単位つきで、0も省かない', () => {
    assert.equal(hours(0), '0時間');
    assert.equal(hours(75), '75時間');
    assert.equal(hours(85.5), '85.5時間');
  });
  it('入力欄の「＝◯万円」は四捨五入せず、基準の1円上と1円下を区別する', () => {
    assert.equal(manExact(1_190_000), '119万円');
    assert.equal(manExact(1_189_999), '118万9,999円');
    assert.equal(manExact(1_190_001), '119万1円');
    assert.equal(manExact(1_150_000), '115万円');
    assert.equal(manExact(5_000), '5,000円');
    assert.equal(manExact(0), '0円');
  });
});
