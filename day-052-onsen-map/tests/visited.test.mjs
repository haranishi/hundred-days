import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STORE_NAME, isVisited, loadVisited, removeVisited, safeStorage, sanitizeVisited, saveVisited, summaryText, toggleVisited, visitedSummary,
} from '../lib/visited.js';

const CODES = Array.from({ length: 47 }, (_, index) => String(index + 1).padStart(2, '0'));
const memory = () => {
  const values = new Map();
  return {
    getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => values.set(name, String(value)),
    removeItem: (name) => values.delete(name),
    values,
  };
};
const onsen = { id: 'n1', pref: '05', name: '乳頭温泉' };
const sento = { id: 'w2', pref: '13', name: '' };

test('toggleVisited: 押すたびに入れる・外す', () => {
  let items = toggleVisited([], onsen, 100);
  assert.deepEqual(items, [{ id: 'n1', pref: '05', name: '乳頭温泉', at: 100 }]);
  assert.equal(isVisited(items, 'n1'), true);
  items = toggleVisited(items, sento, 200);
  assert.deepEqual(visitedSummary(items), { baths: 2, prefs: 2 });
  assert.equal(summaryText(visitedSummary(items)), '行った 2か所・2都道府県');
  items = toggleVisited(items, onsen, 300);
  assert.deepEqual(items.map((item) => item.id), ['w2']);
  assert.deepEqual(removeVisited(items, 'w2'), []);
  assert.equal(summaryText(visitedSummary([])), '行った 0か所・0都道府県');
});

test('visitedSummary: 同じ県の2か所は1都道府県と数える', () => {
  const items = [{ id: 'n1', pref: '05' }, { id: 'n2', pref: '05' }, { id: 'n3', pref: '44' }];
  assert.deepEqual(visitedSummary(items), { baths: 3, prefs: 2 });
});

test('saveVisited / loadVisited: 決まった名前で往復する', () => {
  const storage = memory();
  const items = toggleVisited(toggleVisited([], onsen, 1), sento, 2);
  assert.equal(STORE_NAME, 'day052.visited.v1');
  assert.equal(saveVisited(storage, items), true);
  assert.deepEqual(JSON.parse(storage.values.get(STORE_NAME)), { v: 1, items });
  assert.deepEqual(loadVisited(storage, CODES), items);
});

test('loadVisited: 壊れた値・版の違い・変な中身は捨てる', () => {
  const storage = memory();
  storage.setItem(STORE_NAME, '{bad');
  assert.deepEqual(loadVisited(storage, CODES), []);
  storage.setItem(STORE_NAME, JSON.stringify({ v: 2, items: [onsen] }));
  assert.deepEqual(loadVisited(storage, CODES), []);
  storage.setItem(STORE_NAME, JSON.stringify({ v: 1, items: [onsen, onsen, { id: 'bad', pref: '05' }, { id: 'n9', pref: '99' }, null, { id: 'r3', pref: '47', name: 'あ'.repeat(90), at: 'x' }] }));
  assert.deepEqual(loadVisited(storage, CODES), [
    { id: 'n1', pref: '05', name: '乳頭温泉', at: 0 },
    { id: 'r3', pref: '47', name: 'あ'.repeat(80), at: 0 },
  ]);
  assert.deepEqual(loadVisited(memory(), CODES), []);
  assert.deepEqual(sanitizeVisited('x', CODES), []);
});

test('localStorage が使えない環境でも例外を外へ漏らさない', () => {
  const blocked = { get localStorage() { throw new Error('SecurityError'); } };
  assert.equal(safeStorage(blocked), null);
  assert.equal(safeStorage({}), null);
  const full = { localStorage: { setItem() { throw new Error('QuotaExceededError'); }, removeItem() {}, getItem() { return null; } } };
  assert.equal(safeStorage(full), null);
  const ok = memory();
  assert.equal(safeStorage({ localStorage: ok }), ok);
  assert.equal(ok.values.size, 0, '確かめ用の値を残さない');

  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(loadVisited(broken, CODES), []);
  assert.equal(saveVisited(broken, [onsen]), false);
  assert.equal(saveVisited(null, [onsen]), false);
  assert.deepEqual(loadVisited(null, CODES), []);
});
