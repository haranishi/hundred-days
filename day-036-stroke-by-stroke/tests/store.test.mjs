import test from 'node:test';
import assert from 'node:assert/strict';
import { load, save, remember, MAX_RECENT } from '../lib/store.js';

const fakeStorage = (initial) => {
  const map = new Map(Object.entries(initial || {}));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
    dump: () => Object.fromEntries(map),
  };
};

test('remember: 新しい言葉が先頭に来る', () => {
  assert.deepEqual(remember('山', ['川']), ['山', '川']);
});

test('remember: 同じ言葉は重ねず、先頭へ動かす', () => {
  assert.deepEqual(remember('川', ['山', '川', '空']), ['川', '山', '空']);
});

test(`remember: ${MAX_RECENT}件を超えたら古いものから落ちる`, () => {
  const list = ['1', '2', '3', '4', '5'];
  assert.deepEqual(remember('6', list), ['6', '1', '2', '3', '4']);
});

test('remember: 空の言葉は足さない', () => {
  assert.deepEqual(remember('', ['山']), ['山']);
  assert.deepEqual(remember(null, ['山']), ['山']);
});

test('save と load が往復する', () => {
  const storage = fakeStorage();
  save(['秋', '田'], storage);
  assert.deepEqual(load(storage), ['秋', '田']);
});

test('load: 壊れた中身なら空で始める', () => {
  assert.deepEqual(load(fakeStorage({ 'day-036-stroke-by-stroke': '{' })), []);
  assert.deepEqual(load(fakeStorage({ 'day-036-stroke-by-stroke': '{"a":1}' })), []);
  assert.deepEqual(load(fakeStorage({ 'day-036-stroke-by-stroke': '[1,"山",null]' })), ['山']);
});

test('load: localStorage が使えなくても落ちない', () => {
  const broken = {
    getItem: () => {
      throw new Error('拒否');
    },
    setItem: () => {
      throw new Error('拒否');
    },
  };
  assert.deepEqual(load(broken), []);
  assert.equal(save(['山'], broken), false);
  assert.deepEqual(load(undefined), []);
});
