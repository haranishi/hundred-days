import test from 'node:test';
import assert from 'node:assert/strict';
import { load, save, clear, MAX_ARTICLES } from '../lib/store.js';

const fakeStorage = () => {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
    size: () => map.size
  };
};

test('save と load で往復する', () => {
  const storage = fakeStorage();
  save([{ url: 'https://example.com/', headline: 'あ' }], storage);
  assert.deepEqual(load(storage), [{ url: 'https://example.com/', headline: 'あ' }]);
});

test('load: 空なら空配列', () => assert.deepEqual(load(fakeStorage()), []));

test('load: 壊れた中身でも落ちない', () => {
  const storage = fakeStorage();
  storage.setItem('day-035-front-page', '{壊れている');
  assert.deepEqual(load(storage), []);
});

test('load: URLの無い項目は捨てる', () => {
  const storage = fakeStorage();
  storage.setItem('day-035-front-page', JSON.stringify([{ headline: 'URLなし' }, { url: 'https://example.com/' }]));
  assert.equal(load(storage).length, 1);
});

test('save: 3本を超えて保存しない', () => {
  const storage = fakeStorage();
  save(Array.from({ length: 5 }, (_, i) => ({ url: `https://example.com/${i}` })), storage);
  assert.equal(load(storage).length, MAX_ARTICLES);
});

test('clear: 消える', () => {
  const storage = fakeStorage();
  save([{ url: 'https://example.com/' }], storage);
  clear(storage);
  assert.deepEqual(load(storage), []);
});

test('保存できない端末でも落ちない', () => {
  const broken = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); }, removeItem: () => { throw new Error('no'); } };
  assert.deepEqual(load(broken), []);
  assert.equal(save([{ url: 'https://example.com/' }], broken), false);
  assert.doesNotThrow(() => clear(broken));
});
