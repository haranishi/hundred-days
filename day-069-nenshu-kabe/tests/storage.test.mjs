import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { KEY, load, save, clear } from '../lib/storage.js';
import { EXAMPLE, LIMITS } from '../lib/rules-2026.js';

function memory() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}

describe('任意の端末内保存', () => {
  it('空から保存・復元・削除し、他のアプリのキーを残す', () => {
    const storage = memory();
    storage.setItem('other', 'keep');
    assert.equal(KEY, 'day069-nenshu-kabe:v1');
    assert.deepEqual(load(storage), { ok: true, inputs: null });
    assert.deepEqual(save(storage, { ...EXAMPLE, result: '保存しない' }), { ok: true });
    const restored = load(storage);
    assert.equal(restored.ok, true);
    assert.deepEqual(restored.inputs, EXAMPLE);
    assert.ok(Number.isFinite(Date.parse(restored.savedAt)));
    assert.equal(JSON.parse(storage.getItem(KEY)).result, undefined);
    assert.deepEqual(clear(storage), { ok: true });
    assert.equal(load(storage).inputs, null);
    assert.equal(storage.getItem('other'), 'keep');
  });
  it('空欄のnullと入力の上下限を保存して復元する', () => {
    const storage = memory();
    for (const edge of ['min', 'max']) {
      const inputs = { ...EXAMPLE, ...Object.fromEntries(Object.entries(LIMITS).map(([field, limit]) => [field, limit[edge]])) };
      assert.equal(save(storage, inputs).ok, true);
      assert.deepEqual(load(storage).inputs, inputs);
    }
    const inputs = { ...EXAMPLE, hourlyWage: null, hoursPerPayday: null };
    assert.equal(save(storage, inputs).ok, true);
    assert.deepEqual(load(storage).inputs, inputs);
  });
  it('壊れたJSON・異なる形・範囲外・日時なしは削除する', () => {
    const savedAt = '2026-10-17T00:00:00.000Z';
    const bad = [null, [], {}, { ...EXAMPLE }, { ...EXAMPLE, savedAt: 'invalid' },
      { ...EXAMPLE, ageBand: 'unknown', savedAt }, { ...EXAMPLE, student: 'true', savedAt },
      { ...EXAMPLE, paidSoFar: -1, savedAt }, { ...EXAMPLE, hourlyWage: 0, savedAt },
      { ...EXAMPLE, remainingPaydays: 0.5, savedAt }, { ...EXAMPLE, hoursPerPayday: 0.01, savedAt },
      { ...EXAMPLE, hoursPerPayday: 401, savedAt }];
    for (const text of ['{', ...bad.map((value) => JSON.stringify(value))]) {
      const storage = memory();
      storage.setItem(KEY, text);
      const result = load(storage);
      assert.equal(result.ok, false, text);
      assert.ok(result.reason);
      assert.equal(storage.getItem(KEY), null);
    }
  });
  for (const method of ['getItem', 'setItem', 'removeItem']) {
    it(`${method}が例外を投げても失敗を返す`, () => {
      const storage = memory();
      storage[method] = () => { throw new Error('blocked'); };
      const result = method === 'getItem' ? load(storage) : method === 'setItem' ? save(storage, EXAMPLE) : clear(storage);
      assert.equal(result.ok, false);
      assert.ok(result.reason.length > 0);
    });
  }
  it('形の違う内容を削除できない場合と、Storage自体が無い場合も捕まえる', () => {
    const storage = memory();
    storage.setItem(KEY, '{}');
    storage.removeItem = () => { throw new Error('blocked'); };
    assert.equal(load(storage).ok, false);
    for (const operation of [() => load(undefined), () => save(undefined, EXAMPLE), () => clear(undefined)]) assert.equal(operation().ok, false);
  });
  it('不正な入力は保存せず、既存の値を上書きしない', () => {
    const storage = memory();
    save(storage, EXAMPLE);
    const before = storage.getItem(KEY);
    assert.equal(save(storage, { ...EXAMPLE, paidSoFar: -1 }).ok, false);
    assert.equal(storage.getItem(KEY), before);
  });
});
