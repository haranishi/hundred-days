import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as wait } from 'node:timers/promises';
import { DEFAULTS, SAVE_NAME, SAVE_VERSION } from '../../lib/contract.js';
import { createStore } from '../../lib/store.js';
import { createTree, restoreTree } from '../../lib/tree.js';

const seedling = createTree({ seed: 9 });
const settings = { pot: DEFAULTS.pot, light: DEFAULTS.light, muted: false, tipsSeen: true };
const record = { v: SAVE_VERSION, tree: seedling.toJSON(), ...settings, savedAt: 123 };

function memory(raw = null) {
  const calls = { get: 0, set: 0, remove: 0 };
  const storage = {
    getItem(name) { assert.equal(name, SAVE_NAME); calls.get += 1; return raw; },
    setItem(name, value) { assert.equal(name, SAVE_NAME); calls.set += 1; raw = value; },
    removeItem(name) { assert.equal(name, SAVE_NAME); calls.remove += 1; raw = null; },
  };
  return { calls, storage: () => storage, value: () => raw };
}

test('保存を遅らせてまとめ、確定した最後の木と設定だけを復元する', async () => {
  const data = memory();
  const store = createStore({ restoreTree, storage: data.storage, delay: 15, now: () => 123 });
  const tree = seedling.clone();
  store.schedule({ tree, ...settings });
  tree.advance(7);
  store.schedule({ tree, ...settings, light: 'morning', muted: true, gfx: 'mid' });
  const expectedTree = tree.toJSON();
  tree.advance(7);
  assert.equal(data.calls.set, 0);
  await wait(35);
  assert.equal(data.calls.set, 1);
  assert.deepEqual(JSON.parse(data.value()), { ...record, tree: expectedTree, light: 'morning', muted: true, gfx: 'mid' });
  const { status, save: saved } = store.read();
  assert.equal(status, 'restored');
  assert.deepEqual(saved.tree.toJSON(), expectedTree);
  assert.equal(saved.muted, true);
  assert.equal(saved.gfx, 'mid');
  assert.equal(saved.tipsSeen, true);
  assert.equal(saved.pot, DEFAULTS.pot);
});

test('壊れたJSON・型・版・木の内部・容量を拒否し、利用者が選ぶまで元の値を保つ', () => {
  const serialize = (extra) => JSON.stringify({ ...record, ...extra });
  for (const text of [
    '{unfinished', 'null', '[]',
    serialize({ v: SAVE_VERSION - 1 }), serialize({ v: String(SAVE_VERSION) }),
    serialize({ pot: 'square' }), serialize({ light: 123 }), serialize({ muted: 'false' }),
    serialize({ tipsSeen: 1 }), serialize({ savedAt: -1 }), serialize({ savedAt: null }),
    serialize({ tree: [] }), serialize({ tree: { ...record.tree, v: SAVE_VERSION - 1 } }),
    serialize({ tree: { ...record.tree, nodes: [] } }),
    serialize({ extra: 'x'.repeat(400 * 1024) }), serialize({ extra: '盆'.repeat(130_000) }),
  ]) {
    const data = memory(text);
    const store = createStore({ restoreTree, storage: data.storage });
    assert.equal(store.read().status, 'unreadable', `受け入れてしまった保存 ${text.slice(0, 100)}`);
    store.schedule({ tree: seedling, ...settings });
    assert.equal(store.flush(), false);
    assert.equal(data.value(), text);
    assert.equal(data.calls.remove, 0);
  }
});

test('400KBちょうどを受け入れ、バイト数が1つ増えるとJSONの解析より前に拒否する', () => {
  const raw = JSON.stringify({ ...record, extra: '' });
  const prefix = 400 * 1024 - Buffer.byteLength(raw);
  const atLimit = JSON.stringify({ ...record, extra: 'x'.repeat(prefix) });
  const nearLimit = JSON.stringify({ ...record, extra: 'x'.repeat(prefix - 2) + '盆' });
  assert.equal(Buffer.byteLength(atLimit), 400 * 1024);
  assert.equal(Buffer.byteLength(nearLimit), 400 * 1024 + 1);
  assert.equal(createStore({ restoreTree, storage: memory(atLimit).storage }).read().status, 'restored');
  let restored = false;
  const storage = memory(nearLimit).storage;
  assert.equal(createStore({ restoreTree: () => { restored = true; }, storage }).read().status, 'unreadable');
  assert.equal(restored, false);
});

test('保存の消去は遅延中の書き込みも取り消し、新しい操作は再び保存できる', async () => {
  const data = memory(JSON.stringify(record));
  const store = createStore({ restoreTree, storage: data.storage, delay: 15 });
  assert.equal(store.read().status, 'restored');
  store.schedule({ tree: seedling, ...settings });
  assert.equal(store.clear(), true);
  assert.equal(store.flush(), false);
  await wait(30);
  assert.equal(data.calls.set, 0);
  assert.equal(data.calls.remove, 1);
  store.schedule({ tree: seedling, ...settings });
  assert.equal(store.flush(), true);
  assert.equal(data.calls.set, 1);
});

test('容量を超えた木や書き込みが失敗したときは直前の保存を上書きしない', () => {
  const previous = JSON.stringify(record);
  const data = memory(previous);
  const store = createStore({ restoreTree, storage: data.storage });
  store.schedule({ tree: { toJSON: () => ({ tooLarge: '木'.repeat(140_000) }) }, ...settings });
  assert.equal(store.flush(), false);
  assert.equal(data.value(), previous);
  assert.equal(data.calls.set, 0);
  const storage = { ...data.storage(), setItem() { throw new Error('QuotaExceededError'); } };
  const unable = createStore({ restoreTree, storage: () => storage });
  unable.schedule({ tree: seedling, ...settings });
  assert.equal(unable.flush(), false);
  assert.equal(data.value(), previous);
});

test('localStorageの取得・読み取り・削除・toJSONで例外が出ても継続できる', () => {
  const fail = () => { throw new Error('SecurityError'); };
  for (const storage of [fail, () => ({ getItem: fail, setItem: fail, removeItem: fail })]) {
    const store = createStore({ restoreTree, storage });
    assert.equal(store.read().status, 'unreadable');
    assert.equal(store.clear(), false);
    assert.doesNotThrow(() => store.schedule({ tree: { toJSON: fail }, ...settings }));
    assert.equal(store.flush(), false);
    store.schedule({ tree: seedling, ...settings });
    assert.equal(store.flush(), false);
  }
});

test('起動時の読み取りだけが失敗しても、案内や編集の保存で前の木を上書きしない', async () => {
  const advanced = createTree({ seed: 9, species: 'plum', day: 90 });
  const previous = JSON.stringify({ ...record, tree: advanced.toJSON() });
  const data = memory(previous);
  let first = true;
  const area = { ...data.storage(), getItem(name) {
    if (first) {
      first = false;
      throw new Error('SecurityError');
    }
    return data.storage().getItem(name);
  } };
  const store = createStore({ restoreTree, storage: () => area, delay: 5 });
  const result = store.read();
  store.schedule({ tree: seedling, ...settings });
  assert.equal(store.flush(), false);
  store.schedule({ tree: seedling, ...settings, muted: true });
  await wait(20);
  assert.equal(result?.status, 'unreadable');
  assert.equal(data.calls.remove, 0);
  assert.equal(data.value(), previous);
  store.schedule({ tree: seedling, ...settings }, { replace: true });
  assert.equal(store.flush(), true);
  assert.deepEqual(store.read().save.tree.toJSON(), seedling.toJSON());
});

test('保存なしと復元成功を分け、明示の消去で壊れた保存の書き込み保留を解除する', () => {
  const empty = createStore({ restoreTree, storage: memory().storage });
  assert.equal(empty.read()?.status, 'empty');
  const data = memory('{unfinished');
  const store = createStore({ restoreTree, storage: data.storage });
  assert.equal(store.read()?.status, 'unreadable');
  assert.equal(store.clear(), true);
  assert.equal(data.value(), null);
  store.schedule({ tree: seedling, ...settings });
  assert.equal(store.flush(), true);
  assert.equal(store.read().status, 'restored');
});

function sendStorage(target, key, storageArea) {
  target.dispatchEvent(Object.assign(new Event('storage'), { key, storageArea }));
}

test('別タブの消去で遅延保存を破棄し、通知前にページを閉じても木は復活しない', () => {
  for (const notified of [true, false]) {
    const data = memory(JSON.stringify(record));
    const tab = new EventTarget();
    const first = createStore({ restoreTree, storage: data.storage, eventTarget: tab });
    const second = createStore({ restoreTree, storage: data.storage });
    const tree = seedling.clone();
    tree.advance(7);
    first.schedule({ tree, ...settings });
    const deleted = second.clear();
    if (notified) sendStorage(tab, SAVE_NAME, data.storage());
    assert.equal(first.flush(), false);
    assert.equal(data.value(), null);
    assert.equal(deleted, true);
  }
});

test('別タブの同じキーへの保存または全消去で予約を失効させ、別名やsessionStorageの通知は無視する', () => {
  const original = JSON.stringify(record);
  const data = memory(original);
  const tab = new EventTarget();
  const first = createStore({ restoreTree, storage: data.storage, eventTarget: tab, now: () => record.savedAt });
  const second = createStore({ restoreTree, storage: data.storage, now: () => record.savedAt });

  first.schedule({ tree: seedling, ...settings, muted: true });
  sendStorage(tab, 'unrelated', data.storage());
  sendStorage(tab, SAVE_NAME, memory().storage());
  assert.equal(first.flush(), true);
  const scheduledFrom = data.value();

  first.schedule({ tree: seedling, ...settings, light: 'night' });
  second.schedule({ tree: seedling, ...settings, pot: 'round-blue' });
  assert.equal(second.flush(), true);
  sendStorage(tab, SAVE_NAME, data.storage());
  // 通知だけでも予約が消えたかを確かめるため、値は予約した時点に戻す。
  data.storage().setItem(SAVE_NAME, scheduledFrom);
  assert.equal(first.flush(), false);
  first.schedule({ tree: seedling, ...settings });
  sendStorage(tab, null, data.storage());
  assert.equal(first.flush(), false);
});

test('書込前の照合中に消去された予約も、世代が変われば書き込まない', () => {
  const data = memory(JSON.stringify(record));
  const tab = new EventTarget();
  const second = createStore({ restoreTree, storage: data.storage });
  let deleting = false;
  const area = { ...data.storage(), getItem(name) {
    const value = data.storage().getItem(name);
    if (deleting) {
      // 読み取りに続いて通知が割り込む場面を、2つのストアで同期的に再現する。
      second.clear();
      sendStorage(tab, SAVE_NAME, area);
    }
    return value;
  } };
  const first = createStore({ restoreTree, storage: () => area, eventTarget: tab });
  first.schedule({ tree: seedling, ...settings, muted: true });
  deleting = true;
  assert.equal(first.flush(), false);
  assert.equal(data.value(), null);
});

test('削除だけを端末が拒む場合、clearの失敗を返し、予約も取り消す', () => {
  const previous = JSON.stringify(record);
  const data = memory(previous);
  const area = { ...data.storage(), removeItem() { throw new Error('SecurityError'); } };
  const store = createStore({ restoreTree, storage: () => area });
  store.schedule({ tree: seedling, ...settings, muted: true });
  const removed = store.clear();
  assert.equal(store.flush(), false);
  assert.equal(removed, false);
  assert.equal(data.value(), previous);
});

test('freshでは保存を読み書きせず、既存の保存も消さない', () => {
  const data = memory(JSON.stringify(record));
  const store = createStore({ enabled: false, restoreTree, storage: data.storage });
  assert.equal(store.read()?.status, 'empty');
  store.schedule({ tree: { toJSON() { assert.fail('freshでシリアライズした'); } }, ...settings });
  assert.equal(store.flush(), false);
  store.clear();
  assert.deepEqual(data.calls, { get: 0, set: 0, remove: 0 });
  assert.deepEqual(JSON.parse(data.value()), record);
});

test('画質がない保存や未知の画質が入った保存を自動で復元する', () => {
  for (const gfx of [undefined, 'test', 'unknown']) {
    const data = memory(JSON.stringify({ ...record, gfx }));
    const store = createStore({ restoreTree, storage: data.storage });
    assert.equal(store.read().save.gfx, 'auto');
  }
});
