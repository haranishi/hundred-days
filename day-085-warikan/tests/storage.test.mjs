import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY, loadState, saveState } from '../lib/storage.js';
import { emptyState, exampleState } from '../lib/model.js';

test('persistence round-trips confirmed state at the dedicated key', () => {
  const map = new Map(), storage = { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) };
  assert.deepEqual(loadState(storage).state, emptyState()); assert.equal(saveState(storage, exampleState()), true);
  assert.ok(map.has(STORAGE_KEY)); assert.deepEqual(loadState(storage), { state: exampleState(), error: '' });
});
test('corrupted and unavailable storage have explicit failure and retain the original', () => {
  for (const raw of ['{broken', '{"version":2}', 'null']) {
    const storage = { getItem: () => raw, setItem: () => assert.fail('must not overwrite corrupted input on load') };
    assert.ok(loadState(storage).error); assert.deepEqual(loadState(storage).state, emptyState());
  }
  const storage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  assert.ok(loadState(storage).error); assert.equal(saveState(storage, exampleState()), false); assert.equal(saveState(undefined, exampleState()), false);
});
