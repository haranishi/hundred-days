import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_RECORD,
  STORAGE_KEY,
  loadRecord,
  mergeSessionIntoRecord,
  normalizeRecord,
  saveRecord
} from '../lib/storage.js';

function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(k, String(v));
    }
  };
}

test('normalizeRecord: 破損したJSONや範囲外の数値を安全にクランプすること', () => {
  assert.deepEqual(normalizeRecord('invalid json{{{'), DEFAULT_RECORD);
  assert.deepEqual(normalizeRecord(null), DEFAULT_RECORD);
  assert.deepEqual(normalizeRecord([]), DEFAULT_RECORD);

  const clamped = normalizeRecord({
    bestRushScore: -500,
    bestRushCombo: 9999999,
    bestTrainingCorrect: 42,
    totalInspected: '15.8',
    soundEnabled: 1
  });

  assert.equal(clamped.bestRushScore, 0);
  assert.equal(clamped.bestRushCombo, 9999);
  assert.equal(clamped.bestTrainingCorrect, 10);
  assert.equal(clamped.totalInspected, 15);
  assert.equal(clamped.soundEnabled, true);
});

test('loadRecord / saveRecord / mergeSessionIntoRecord が正しく連携すること', () => {
  const mem = createMemoryStorage();
  const initial = loadRecord(mem);
  assert.deepEqual(initial, DEFAULT_RECORD);

  const updated = mergeSessionIntoRecord(initial, {
    mode: 'rush',
    score: 2150,
    maxCombo: 9,
    correctCount: 14,
    totalAnswered: 16
  });

  saveRecord(updated, mem);
  const reloaded = loadRecord(mem);
  assert.equal(reloaded.bestRushScore, 2150);
  assert.equal(reloaded.bestRushCombo, 9);
  assert.equal(reloaded.totalInspected, 16);
  assert.ok(mem.getItem(STORAGE_KEY).includes('2150'));
});
