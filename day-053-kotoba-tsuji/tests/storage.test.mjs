import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, KEYS, LEGACY_KEYS, DEFAULT_SETTINGS } from '../lib/storage.js';

// localStorage と同じ口を持つ偽物
function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

// 読み書きのたびに例外を投げる（容量切れ・拒否された端末）
const throwingStorage = {
  getItem() { throw new Error('denied'); },
  setItem() { throw new Error('denied'); },
  removeItem() { throw new Error('denied'); },
};

test('storage（v2）：記録と途中の一局は .v2 の鍵に書き、v1 の2つは読み込み時に消す。settings は v1 の鍵のまま引き継ぐ', () => {
  assert.deepEqual({ ...KEYS }, {
    settings: 'kotoba-tsuji.settings.v1',
    records: 'kotoba-tsuji.records.v2',
    current: 'kotoba-tsuji.current.v2',
    recent: 'kotoba-tsuji.recent.v1',
  });
  const mem = memoryStorage({
    [KEYS.settings]: JSON.stringify({ sound: false, motion: 'reduce' }),
    [LEGACY_KEYS.records]: JSON.stringify({ levels: { 1: { solved: 9, bestSec: 12, bestRank: 'yokozuna' } }, total: 9 }),
    [LEGACY_KEYS.current]: JSON.stringify({ level: 1, seed: 'abcd12', game: { v: 1 } }),
  });
  const store = createStore(mem);
  assert.equal(mem.map.has(LEGACY_KEYS.records), false);
  assert.equal(mem.map.has(LEGACY_KEYS.current), false);
  assert.deepEqual(store.getRecords().levels[1], { solved: 0, bestSec: null, bestRank: null }); // v1 の記録は数えない
  assert.equal(store.getCurrent(), null); // v1 の途中の一局も続けない
  assert.equal(store.getSettings().sound, false); // しつらえは引き継ぐ
  store.recordResult({ levelId: 1, seconds: 20, rankKey: 'yokozuna' });
  store.saveCurrent({ level: 1, seed: 'abcd12', game: { v: 2 } });
  assert.deepEqual([...mem.map.keys()].sort(), [KEYS.current, KEYS.records, KEYS.settings].sort());
  assert.equal(JSON.parse(mem.map.get(KEYS.records)).levels[1].bestSec, 20);
});

test('storage：settings は既定値から始まり、知っている値だけ残す', () => {
  const mem = memoryStorage();
  const store = createStore(mem);
  assert.deepEqual(store.getSettings(), { sound: true, autoCheck: true, motion: 'auto', seenCoach: false });
  assert.deepEqual(store.saveSettings({ sound: false, motion: 'reduce', bogus: 1 }), { ...DEFAULT_SETTINGS, sound: false, motion: 'reduce' });
  assert.deepEqual(JSON.parse(mem.map.get(KEYS.settings)), { ...DEFAULT_SETTINGS, sound: false, motion: 'reduce' });
  store.saveSettings({ motion: 'fast', autoCheck: 'no' }); // 形の違う値は無視
  assert.deepEqual(store.getSettings(), { ...DEFAULT_SETTINGS, sound: false, motion: 'reduce' });

  const broken = createStore(memoryStorage({ [KEYS.settings]: '{not json' }));
  assert.deepEqual(broken.getSettings(), { ...DEFAULT_SETTINGS });
});

test('storage：records は降参を solved に数えず、最速と最高位は降参以外で更新する', () => {
  const store = createStore(memoryStorage());
  assert.deepEqual(store.getRecords().levels[1], { solved: 0, bestSec: null, bestRank: null });

  let r = store.recordResult({ levelId: 1, seconds: 200, rankKey: 'ozeki' });
  assert.equal(r.newBest, true);
  assert.deepEqual(r.records.levels[1], { solved: 1, bestSec: 200, bestRank: 'ozeki' });

  r = store.recordResult({ levelId: 1, seconds: 300, rankKey: 'sekiwake' }); // 遅くて位も下
  assert.equal(r.newBest, false);

  r = store.recordResult({ levelId: 1, seconds: 50, rankKey: 'maegashira', gaveUp: true }); // 降参
  assert.equal(r.newBest, false);
  assert.deepEqual(r.records.levels[1], { solved: 2, bestSec: 200, bestRank: 'ozeki' });
  assert.equal(r.records.total, 3);

  r = store.recordResult({ levelId: 1, seconds: 150, rankKey: 'sekiwake' }); // 速いが位は下
  assert.deepEqual([r.newBest, r.newBestSec, r.newBestRank], [true, true, false]);
  r = store.recordResult({ levelId: 1, seconds: 170, rankKey: 'yokozuna' }); // 遅いが位は上
  assert.deepEqual([r.newBest, r.newBestSec, r.newBestRank], [true, false, true]);
  assert.deepEqual(store.getRecords().levels[1], { solved: 4, bestSec: 150, bestRank: 'yokozuna' });
  assert.deepEqual(store.getRecords().levels[2], { solved: 0, bestSec: null, bestRank: null });
});

test('storage：current の保存と読み出し、resetRecords は records だけ消す', () => {
  const mem = memoryStorage();
  const store = createStore(mem);
  store.saveSettings({ sound: false });
  store.recordResult({ levelId: 2, seconds: 400, rankKey: 'yokozuna' });
  const cur = { level: 2, seed: 'abc123', game: { v: 2, entries: '..' } };
  assert.equal(store.saveCurrent(cur), true);
  assert.deepEqual(store.getCurrent(), cur);

  store.resetRecords();
  assert.equal(store.getRecords().total, 0);
  assert.equal(store.getSettings().sound, false);
  assert.deepEqual(store.getCurrent(), cur);

  store.clearCurrent();
  assert.equal(store.getCurrent(), null);
  mem.setItem(KEYS.current, JSON.stringify({ level: 9, seed: 'abc123', game: {} }));
  assert.equal(store.getCurrent(), null); // 無い腕前は捨てる
});

test('storage：読み書きで例外を投げる storage でも既定値で動き、例外を外へ出さない', () => {
  for (const storage of [throwingStorage, null]) {
    const store = createStore(storage);
    assert.deepEqual(store.getSettings(), { ...DEFAULT_SETTINGS });
    assert.deepEqual(store.saveSettings({ sound: false }), { ...DEFAULT_SETTINGS, sound: false });
    assert.equal(store.recordResult({ levelId: 1, seconds: 100, rankKey: 'ozeki' }).newBest, true);
    assert.equal(store.getRecords().total, 0); // 書けないので残らない
    assert.equal(store.saveCurrent({ level: 1, seed: 'abcd', game: {} }), false);
    assert.equal(store.getCurrent(), null);
    assert.doesNotThrow(() => { store.resetRecords(); store.clearCurrent(); });
    assert.equal(store.canPersist(), false);
  }
});

test('storage：localStorage に触っただけで例外が出る環境（サンドボックスの iframe など）でも作れる', () => {
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
  try {
    const store = createStore();
    assert.deepEqual(store.getSettings(), { ...DEFAULT_SETTINGS });
    assert.equal(store.canPersist(), false);
  } finally {
    if (desc) Object.defineProperty(globalThis, 'localStorage', desc);
    else delete globalThis.localStorage;
  }
});
