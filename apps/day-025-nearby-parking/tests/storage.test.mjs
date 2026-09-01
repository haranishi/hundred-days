import test from 'node:test';
import assert from 'node:assert/strict';
import { CACHE_TTL, cacheKey, isFresh, loadSettings, readCache, safeStorage, saveSettings, writeCache } from '../lib/storage.js';

const memory = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

test('キャッシュ: 座標を小数4桁に丸めてキー化', () => {
  assert.equal(cacheKey(35.123456, 139.987654, 400), 'ov:35.1235:139.9877:400');
  assert.equal(cacheKey(-0.00004, 0, 800), 'ov:-0.0000:0.0000:800');
});

test('キャッシュ: TTL 10分未満は有効', () => {
  assert.equal(CACHE_TTL, 600000);
  assert.equal(isFresh({ savedAt: 1000 }, 1000 + CACHE_TTL - 1), true);
});

test('キャッシュ: TTL境界以降と未来時刻は無効', () => {
  assert.equal(isFresh({ savedAt: 1000 }, 1000 + CACHE_TTL), false);
  assert.equal(isFresh({ savedAt: 2000 }, 1000), false);
});

test('キャッシュ: 読み書きできる', () => {
  const storage = memory();
  assert.equal(writeCache(storage, 'x', [1, 2], 100), true);
  assert.deepEqual(readCache(storage, 'x', 200), [1, 2]);
});

test('storage: 例外を外へ漏らさない', () => {
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(readCache(broken, 'x'), null);
  assert.equal(writeCache(broken, 'x', []), false);
  assert.deepEqual(loadSettings(broken), {});
  assert.equal(saveSettings(broken, {}), false);
});

test('storage: 参照自体が例外の環境でもnullを返し、その後の読み書きも壊れない', () => {
  const blocked = { get localStorage() { throw new Error('SecurityError'); } };
  const store = safeStorage('localStorage', blocked);
  assert.equal(store, null);
  assert.deepEqual(loadSettings(store), {});
  assert.equal(saveSettings(store, { theme: 'dark' }), false);
  assert.equal(readCache(store, 'x'), null);
  assert.equal(writeCache(store, 'x', []), false);
  assert.equal(safeStorage('sessionStorage', { sessionStorage: memory() }) === null, false);
});

test('storage: 設定をJSONで保存・復元する', () => {
  const storage = memory();
  assert.equal(saveSettings(storage, { theme: 'dark' }), true);
  assert.deepEqual(loadSettings(storage), { theme: 'dark' });
});
