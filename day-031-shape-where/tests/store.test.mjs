import assert from 'node:assert/strict';
import { test } from 'node:test';

import { STORAGE_NAME, bestOf, bestSlot, emptyRecord, isPrefCode, load, saveBest, saveLastPref } from '../lib/store.js';

/** localStorage の代わり。読み書きで例外を出す設定もできる */
function fakeStorage({ data = {}, failWrite = false, failRead = false } = {}) {
  return {
    data,
    getItem(name) {
      if (failRead) throw new Error('blocked');
      return Object.prototype.hasOwnProperty.call(data, name) ? data[name] : null;
    },
    setItem(name, value) {
      if (failWrite) throw new Error('quota');
      data[name] = String(value);
    },
    removeItem(name) {
      if (failWrite) throw new Error('quota');
      delete data[name];
    }
  };
}

const AT = new Date('2026-09-07T00:00:00.000Z');

test('モードごとの置き場所', () => {
  assert.equal(bestSlot({ mode: 'pref' }), 'pref');
  assert.equal(bestSlot({ mode: 'town', prefCode: '05' }), 'town:05');
  assert.equal(bestSlot({ mode: 'town-all' }), 'town-all');
});

test('保存して読み直すと同じ記録になる', () => {
  const storage = fakeStorage();
  const first = load(storage);
  assert.equal(first.canSave, true);
  assert.equal(bestOf(first.record, 'pref'), null);

  assert.deepEqual(saveBest(storage, first.record, 'pref', 8.5, AT), { saved: true, improved: true });
  saveLastPref(storage, first.record, '05');

  const again = load(storage);
  assert.equal(bestOf(again.record, 'pref'), 8.5);
  assert.equal(again.record.best.pref.at, AT.toISOString());
  assert.equal(again.record.lastPref, '05');
});

test('同点では更新しない・低い点でも更新しない', () => {
  const storage = fakeStorage();
  const { record } = load(storage);
  saveBest(storage, record, 'town:05', 7, AT);
  assert.deepEqual(saveBest(storage, record, 'town:05', 7, AT), { saved: false, improved: false });
  assert.deepEqual(saveBest(storage, record, 'town:05', 6.5, AT), { saved: false, improved: false });
  assert.deepEqual(saveBest(storage, record, 'town:05', 7.5, AT), { saved: true, improved: true });
  assert.equal(bestOf(load(storage).record, 'town:05'), 7.5);
});

test('壊れた保存データは黙って捨てて新しく始める', () => {
  for (const broken of ['{壊れている', '[]', 'null', JSON.stringify({ v: 99, best: { pref: { score: 10 } } })]) {
    const storage = fakeStorage({ data: { [STORAGE_NAME]: broken } });
    const { record, canSave } = load(storage);
    assert.deepEqual(record, emptyRecord());
    assert.equal(canSave, true);
  }
});

test('知らない置き場所やありえない点数は読み捨てる', () => {
  const storage = fakeStorage({
    data: {
      [STORAGE_NAME]: JSON.stringify({
        v: 1,
        best: { pref: { score: 9 }, 'town:99': { score: 9 }, にせもの: { score: 9 }, 'town-all': { score: 42 } },
        lastPref: '99'
      })
    }
  });
  const { record } = load(storage);
  assert.deepEqual(Object.keys(record.best), ['pref']);
  assert.equal(record.lastPref, null);
});

test('読めない環境は canSave が false になる', () => {
  const { record, canSave } = load(fakeStorage({ failRead: true }));
  assert.equal(canSave, false);
  assert.deepEqual(record, emptyRecord());
  assert.deepEqual(load(null), { record: emptyRecord(), canSave: false });
});

test('書けない環境でも記録は画面用に残り、保存だけ失敗する', () => {
  const storage = fakeStorage({ failWrite: true });
  const { record, canSave } = load(storage);
  assert.equal(canSave, false);
  assert.deepEqual(saveBest(storage, record, 'pref', 5, AT), { saved: false, improved: true });
  assert.equal(bestOf(record, 'pref'), 5);
});

test('前回の県は同じ値なら書き直さない', () => {
  const storage = fakeStorage();
  const { record } = load(storage);
  assert.deepEqual(saveLastPref(storage, record, '05'), { saved: true });
  assert.deepEqual(saveLastPref(storage, record, '05'), { saved: false });
  assert.deepEqual(saveLastPref(storage, record, '99'), { saved: false });
  assert.equal(record.lastPref, '05');
});

test('県コードの形', () => {
  assert.equal(isPrefCode('01'), true);
  assert.equal(isPrefCode('47'), true);
  assert.equal(isPrefCode('00'), false);
  assert.equal(isPrefCode('48'), false);
  assert.equal(isPrefCode('5'), false);
  assert.equal(isPrefCode(null), false);
});
