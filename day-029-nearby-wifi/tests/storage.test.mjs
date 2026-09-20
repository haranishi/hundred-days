import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSettings, safeStorage, saveSettings, SETTINGS_SLOT } from '../lib/storage.js';

const memory = () => {
  const values = new Map();
  return { getItem: (name) => values.get(name) ?? null, setItem: (name, value) => values.set(name, value) };
};

test('storage: 指定スロットに小数3桁の地点と絞り込みを保存', () => {
  const storage = memory();
  assert.equal(SETTINGS_SLOT, 'day029.wifi.v1');
  assert.equal(saveSettings(storage, { last: { lat: 39.71761, lng: 140.13055, label: '秋田駅周辺', radius: 3200 }, onlyFree: true, layers: { municipal: false, osm: true, chain: false } }, 123), true);
  assert.deepEqual(loadSettings(storage), { v: 1, last: { lat: 39.718, lng: 140.131, label: '秋田駅周辺', radius: 3200 }, onlyFree: true, layers: { municipal: false, osm: true, chain: false }, updatedAt: 123 });
});

test('storage: 壊れた値は既定値へ戻す', () => {
  const storage = memory();
  storage.setItem(SETTINGS_SLOT, '{bad');
  assert.deepEqual(loadSettings(storage), { v: 1, last: null, onlyFree: false, layers: { municipal: true, osm: true, chain: true }, updatedAt: 0 });
});

test('storage: 参照・読み書きの例外を外へ漏らさない', () => {
  const scope = { get localStorage() { throw new Error('blocked'); } };
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(safeStorage(scope), null);
  assert.deepEqual(loadSettings(broken), { v: 1, last: null, onlyFree: false, layers: { municipal: true, osm: true, chain: true }, updatedAt: 0 });
  assert.equal(saveSettings(broken, {}), false);
});
