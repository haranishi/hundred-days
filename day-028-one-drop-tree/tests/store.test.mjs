import assert from 'node:assert/strict';
import test from 'node:test';
import { STORAGE_NAME, load, save, serialize } from '../lib/store.js';

function memory(value = null) {
  let stored = value;
  return { getItem: (name) => name === STORAGE_NAME ? stored : null, setItem: (_name, next) => { stored = next; }, value: () => stored };
}

test('保存した木を復元する', () => {
  const storage = memory();
  const record = { seed: 21, plantedOn: '2026-09-03', wateredDays: ['2026-09-03', '2026-09-04'] };
  assert.equal(save(storage, record, new Date('2026-09-04T00:00:00Z')).saved, true);
  assert.deepEqual(load(storage, () => 99).record, record);
});

test('壊れたJSONは新しい種でrecovered', () => {
  const result = load(memory('{bad'), () => 77);
  assert.deepEqual(result, { record: { seed: 77, plantedOn: null, wateredDays: [] }, canSave: true, recovered: true });
});

test('不正な日付を捨てて重複を除き昇順にする', () => {
  const raw = JSON.stringify({ v: 1, seed: 5, plantedOn: 'no', wateredDays: ['2026-09-04', '2026-02-30', '2026-09-02', '2026-09-04'] });
  assert.deepEqual(load(memory(raw)).record.wateredDays, ['2026-09-02', '2026-09-04']);
});

test('plantedOnが不正なら最初の水やり日で補完する', () => {
  const raw = JSON.stringify({ v: 1, seed: 5, plantedOn: null, wateredDays: ['2026-09-04', '2026-09-02'] });
  assert.equal(load(memory(raw)).record.plantedOn, '2026-09-02');
});

test('serializeは既知の項目だけを書く', () => {
  const data = JSON.parse(serialize({ seed: 8, plantedOn: null, wateredDays: [], coordinates: [1], note: 'private' }, new Date('2026-09-04T00:00:00Z')));
  assert.deepEqual(Object.keys(data).sort(), ['plantedOn', 'seed', 'updatedAt', 'v', 'wateredDays']);
});

test('storageの例外を保存不可として返す', () => {
  assert.equal(load({ getItem() { throw new Error('blocked'); } }, () => 9).canSave, false);
  assert.equal(save({ setItem() { throw new Error('blocked'); } }, { seed: 9, plantedOn: null, wateredDays: [] }).saved, false);
});
