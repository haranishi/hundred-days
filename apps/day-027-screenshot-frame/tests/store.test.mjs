import assert from 'node:assert/strict';
import test from 'node:test';
import { STORAGE_NAME, initialState, load, save, serialize } from '../lib/store.js';

function memory(value = null) {
  let stored = value;
  return { getItem: (name) => name === STORAGE_NAME ? stored : null, setItem: (_name, next) => { stored = next; }, value: () => stored };
}

test('正しい設定を保存して復元する', () => {
  const storage = memory();
  const state = { ...initialState(), bg: 'ocean', aspect: '4:5', padding: 12, radius: 20, shadow: 80, frame: true };
  assert.equal(save(storage, state, new Date('2026-09-03T00:00:00Z')).saved, true);
  assert.deepEqual(load(storage).state, { ...state, updatedAt: '2026-09-03T00:00:00.000Z' });
});
test('壊れたJSONは全項目が既定値', () => assert.deepEqual(load(memory('{bad')).state, initialState()));
test('型違いはその項目だけ既定値', () => {
  const raw = JSON.stringify({ v: 1, bg: 'forest', aspect: '4:5', padding: '20', radius: 22, shadow: 55, frame: 'yes' });
  assert.deepEqual(load(memory(raw)).state, { ...initialState(), bg: 'forest', aspect: '4:5', radius: 22, shadow: 55 });
});
test('保存データに画像や余計な項目を含めない', () => {
  const data = JSON.parse(serialize({ ...initialState(), image: 'secret pixels', fileName: 'private.png' }));
  assert.equal('image' in data, false);
  assert.equal('fileName' in data, false);
  assert.deepEqual(Object.keys(data).sort(), ['aspect', 'bg', 'frame', 'padding', 'radius', 'shadow', 'updatedAt', 'v']);
});
test('localStorageの例外を保存不可として返す', () => {
  assert.equal(load({ getItem() { throw new Error('blocked'); } }).canSave, false);
  assert.equal(save({ setItem() { throw new Error('blocked'); } }, initialState()).saved, false);
});
