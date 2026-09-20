import assert from 'node:assert/strict';
import test from 'node:test';
import { STORAGE_NAME, clear, initialState, load, save, serialize } from '../lib/store.js';

function memory(value = null) {
  let stored = value;
  return {
    getItem: () => stored,
    setItem: (_key, next) => { stored = next; },
    removeItem: () => { stored = null; },
    value: () => stored
  };
}

test('保存が無ければ初期状態を返す', () => {
  const result = load(memory());
  assert.equal(result.state.people, 2);
  assert.equal(result.state.targetDays, 7);
  assert.equal(result.canSave, true);
});

test('壊れたJSONは無視して初期状態を返す', () => {
  const result = load(memory('{broken'));
  assert.deepEqual(result.state, initialState());
  assert.equal(result.canSave, true);
});

test('未知バージョンは無視して初期状態を返す', () => {
  const result = load(memory(JSON.stringify({ v: 99, people: 10 })));
  assert.deepEqual(result.state, initialState());
});

test('正しい保存データを復元する', () => {
  const state = initialState();
  state.people = 4;
  state.rows.water.stock = '24';
  state.custom.push({ id: 'gas', name: 'カセットボンベ', unit: '本', stock: '3', perDay: '1', expiry: '' });
  const result = load(memory(serialize(state, new Date('2026-08-29T00:00:00.000Z'))));
  assert.equal(result.state.people, 4);
  assert.equal(result.state.rows.water.stock, '24');
  assert.equal(result.state.custom[0].name, 'カセットボンベ');
});

test('保存スキーマにvとupdatedAtが入る', () => {
  const data = JSON.parse(serialize(initialState(), new Date('2026-08-29T00:00:00.000Z')));
  assert.equal(data.v, 1);
  assert.equal(data.updatedAt, '2026-08-29T00:00:00.000Z');
});

test('保存できたらsaved true', () => {
  const storage = memory();
  assert.equal(save(storage, initialState()).saved, true);
  assert.equal(JSON.parse(storage.value()).v, 1);
});

test('getItem例外でも落ちず保存不可を返す', () => {
  const result = load({ getItem: () => { throw new Error('blocked'); } });
  assert.deepEqual(result.state, initialState());
  assert.equal(result.canSave, false);
});

test('setItem例外でも落ちずsaved false', () => {
  const result = save({ setItem: () => { throw new Error('blocked'); } }, initialState());
  assert.equal(result.saved, false);
});

test('removeItem例外でも落ちずcleared false', () => {
  const result = clear({ removeItem: () => { throw new Error('blocked'); } });
  assert.equal(result.cleared, false);
});

test('自由行は最大4行だけ復元する', () => {
  const state = initialState();
  state.custom = Array.from({ length: 6 }, (_, index) => ({ id: String(index), name: `行${index}`, unit: '個' }));
  assert.equal(load(memory(serialize(state))).state.custom.length, 4);
});

test('自由行の名前と単位は保存上限に切り詰める', () => {
  const raw = JSON.stringify({
    ...initialState(),
    custom: [{ id: 'a', name: 'あ'.repeat(30), unit: 'ABCDE', stock: '', perDay: '', expiry: '' }]
  });
  const row = load(memory(raw)).state.custom[0];
  assert.equal(row.name.length, 20);
  assert.equal(row.unit.length, 4);
});

test('範囲外の人数と目標は初期値へ戻す', () => {
  const raw = JSON.stringify({ ...initialState(), people: 100, targetDays: 5 });
  const state = load(memory(raw)).state;
  assert.equal(state.people, 2);
  assert.equal(state.targetDays, 7);
});

test('消去でキーを削除する', () => {
  const storage = memory('saved');
  assert.equal(clear(storage).cleared, true);
  assert.equal(storage.value(), null);
});
