import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, load, save, isAvailable } from '../lib/store.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (name) => (map.has(name) ? map.get(name) : null),
    setItem: (name, value) => map.set(name, String(value)),
    removeItem: (name) => map.delete(name)
  };
}

const brokenStorage = {
  getItem: () => { throw new Error('denied'); },
  setItem: () => { throw new Error('denied'); },
  removeItem: () => { throw new Error('denied'); }
};

test('store: 何も入っていなければ既定値', () => {
  assert.deepEqual(load(fakeStorage()), DEFAULTS);
});

test('store: 保存して読み戻せる', () => {
  const storage = fakeStorage();
  assert.equal(save({ code: '05201', fabric: 'thick' }, storage), true);
  assert.deepEqual(load(storage), { code: '05201', fabric: 'thick', place: 'sun' });
  save({ place: 'shade' }, storage);
  assert.deepEqual(load(storage), { code: '05201', fabric: 'thick', place: 'shade' }, '一部だけ更新できる');
});

test('store: 知らない値は既定値に落とす', () => {
  const storage = fakeStorage({
    'day-032-laundry-dry': JSON.stringify({ code: 'あきた', fabric: 'silk', place: 'moon' })
  });
  assert.deepEqual(load(storage), DEFAULTS);
});

test('store: 壊れた保存データは黙って捨てる', () => {
  const storage = fakeStorage({ 'day-032-laundry-dry': '{壊れている' });
  assert.deepEqual(load(storage), DEFAULTS);
});

test('store: 使えない環境でも例外を投げない', () => {
  assert.deepEqual(load(brokenStorage), DEFAULTS);
  assert.equal(save({ code: '05201' }, brokenStorage), false);
  assert.equal(isAvailable(brokenStorage), false);
  assert.equal(isAvailable(null), false);
  assert.equal(isAvailable(fakeStorage()), true);
});
