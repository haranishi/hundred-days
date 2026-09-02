import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_STAMPS, STORAGE_NAME, addStamp, clear, initialState, load,
  save, serialize, setPlace
} from '../lib/store.js';

function memory(value = null) {
  let stored = value;
  return {
    getItem: (key) => key === STORAGE_NAME ? stored : null,
    setItem: (_key, next) => { stored = next; },
    removeItem: () => { stored = null; },
    value: () => stored
  };
}

const stamp = (date = '2026-09-02') => ({ date, age: 20.4, illum: .74, waxing: false });

test('保存が無ければ東京の初期状態', () => assert.equal(load(memory()).state.place.id, 'tokyo'));
test('壊れたJSONは初期状態', () => assert.deepEqual(load(memory('{bad')).state, initialState()));
test('未知バージョンは初期状態', () => assert.deepEqual(load(memory('{"v":99}')).state, initialState()));
test('正しい状態を直列化・復元する', () => {
  let state = setPlace(initialState(), { id: 'osaka', label: '大阪', lat: 34.69, lon: 135.5 });
  state = addStamp(state, stamp()).state;
  const restored = load(memory(serialize(state, new Date('2026-09-02T00:00:00Z')))).state;
  assert.equal(restored.place.id, 'osaka');
  assert.equal(restored.stamps.length, 1);
  assert.equal(restored.updatedAt, '2026-09-02T00:00:00.000Z');
});
test('同じ日は1回だけ追加する', () => {
  const once = addStamp(initialState(), stamp());
  const twice = addStamp(once.state, stamp());
  assert.equal(once.added, true);
  assert.equal(twice.added, false);
  assert.equal(twice.state.stamps.length, 1);
});
test('スタンプは新しい追加を先頭にする', () => {
  let state = addStamp(initialState(), stamp('2026-09-01')).state;
  state = addStamp(state, stamp('2026-09-02')).state;
  assert.equal(state.stamps[0].date, '2026-09-02');
});
test('スタンプは最大60件', () => {
  let state = initialState();
  for (let day = 1; day <= 61; day += 1) state = addStamp(state, stamp(`2026-${day <= 30 ? '08' : '09'}-${String(day <= 30 ? day : day - 30).padStart(2, '0')}`)).state;
  assert.equal(state.stamps.length, MAX_STAMPS);
});
test('現在地は小数2桁にした値を保存できる', () => {
  const state = setPlace(initialState(), { id: 'geo', label: '現在地', lat: 39.72, lon: 140.1 });
  assert.deepEqual(state.place, { id: 'geo', label: '現在地', lat: 39.72, lon: 140.1 });
});
test('getItem例外なら保存不可', () => assert.equal(load({ getItem() { throw new Error('blocked'); } }).canSave, false));
test('setItem例外でも落ちない', () => assert.equal(save({ setItem() { throw new Error('blocked'); } }, initialState()).saved, false));
test('removeItem例外でも落ちない', () => assert.equal(clear({ removeItem() { throw new Error('blocked'); } }).cleared, false));
test('保存と消去を行える', () => {
  const storage = memory();
  assert.equal(save(storage, initialState()).saved, true);
  assert.equal(JSON.parse(storage.value()).v, 1);
  assert.equal(clear(storage).cleared, true);
  assert.equal(storage.value(), null);
});

