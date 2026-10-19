import assert from 'node:assert/strict';
import test from 'node:test';
import { CASES } from '../lib/cases.js';
import {
  STORAGE_KEY, clearedCount, emptyProgress, isUnlocked, loadProgress, mergeProgress, nextIndex, recordClear, saveProgress, starsFor, totalStars,
} from '../lib/game.js';

function memoryStorage() {
  const data = new Map();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

test('emptyProgress は毎回、独立した空の進行を返す', () => {
  const first = emptyProgress();
  const second = emptyProgress();
  assert.deepEqual(first, { v: 1, cleared: {}, last: null });
  assert.notStrictEqual(first, second);
  assert.notStrictEqual(first.cleared, second.cleared);
  first.cleared.rack = { stars: 3 };
  first.last = 'rack';
  assert.deepEqual(second, { v: 1, cleared: {}, last: null });
});

for (const usedGuide of [false, true]) {
  for (const hintsUsed of [0, 1]) {
    for (const wrongAnswers of [0, 1]) {
      test(`星は使用した種類で決まる: ガイド${usedGuide}・ヒント${hintsUsed}・誤答${wrongAnswers}`, () => {
        const kinds = Number(usedGuide) + hintsUsed + wrongAnswers;
        assert.equal(starsFor({ usedGuide, hintsUsed, wrongAnswers }), 3 - Math.min(2, kinds));
        assert.equal(starsFor({ usedGuide, hintsUsed: hintsUsed * 20, wrongAnswers: wrongAnswers * 10 }), 3 - Math.min(2, kinds));
      });
    }
  }
}

test('夜は直前の解決で順に開き、解決数・合計・次の夜が更新される', () => {
  let progress = emptyProgress();
  assert.equal(totalStars(progress), 0);
  assert.equal(clearedCount(progress), 0);
  assert.equal(nextIndex(progress), 0);
  assert.equal(isUnlocked(progress, 0), true);
  for (let index = 1; index < CASES.length; index += 1) assert.equal(isUnlocked(progress, index), false);
  for (let index = 0; index < CASES.length; index += 1) {
    progress = recordClear(progress, CASES[index].id, 3);
    assert.equal(nextIndex(progress), index + 1);
    assert.equal(clearedCount(progress), index + 1);
    assert.equal(totalStars(progress), (index + 1) * 3);
    for (let next = 0; next < CASES.length; next += 1) {
      assert.equal(isUnlocked(progress, next), next <= index + 1);
    }
  }
  for (const index of [-1, CASES.length, 1.5, NaN, Infinity, '0', null, undefined]) {
    assert.equal(isUnlocked(progress, index), false);
  }
});

test('nextIndex は途中に穴があれば最初の未解決を返す', () => {
  const progress = recordClear(emptyProgress(), CASES[1].id, 2);
  assert.equal(nextIndex(progress), 0);
  assert.equal(isUnlocked(progress, 1), false);
  assert.equal(isUnlocked(progress, 2), true);
  assert.equal(clearedCount(progress), 1);
  assert.equal(totalStars(progress), 2);
});

test('recordClear は元を変えず、最高星を保って last を更新する', () => {
  const original = freeze({ v: 1, cleared: { rack: { stars: 2 }, hat: { stars: 1 } }, last: 'hat' });
  const before = structuredClone(original);
  const improved = recordClear(original, 'rack', 3);
  assert.deepEqual(original, before);
  assert.notStrictEqual(improved, original);
  assert.notStrictEqual(improved.cleared, original.cleared);
  assert.deepEqual(improved, { v: 1, cleared: { rack: { stars: 3 }, hat: { stars: 1 } }, last: 'rack' });
  freeze(improved);
  const replayed = recordClear(improved, 'rack', 1);
  assert.equal(replayed.cleared.rack.stars, 3);
  assert.equal(replayed.last, 'rack');
  assert.equal(recordClear(replayed, 'hat', 2).last, 'hat');
  assert.equal(totalStars(replayed), 4);
});

test('recordClear は未知の夜と不正な星を RangeError にする', () => {
  const progress = freeze(emptyProgress());
  for (const caseId of ['unknown', '__proto__', 'toString', '', null, undefined]) {
    assert.throws(() => recordClear(progress, caseId, 3), RangeError);
  }
  for (const stars of [0, 4, -1, 1.5, NaN, Infinity, -Infinity, '3', true, null, undefined]) {
    assert.throws(() => recordClear(progress, 'rack', stars), RangeError);
  }
  assert.deepEqual(progress, { v: 1, cleared: {}, last: null });
});

test('Map の storage で保存と復元を往復し、保存形式を固定する', () => {
  const storage = memoryStorage();
  const progress = freeze(recordClear(emptyProgress(), 'rack', 3));
  assert.equal(STORAGE_KEY, 'kage-shogen:v1');
  assert.equal(saveProgress(storage, progress), true);
  assert.equal(storage.data.get(STORAGE_KEY), '{"v":1,"cleared":{"rack":{"stars":3}},"last":"rack"}');
  const restored = loadProgress(storage);
  assert.deepEqual(restored, progress);
  assert.notStrictEqual(restored, progress);
  restored.cleared.rack.stars = 1;
  assert.equal(loadProgress(storage).cleared.rack.stars, 3);
  assert.equal(progress.cleared.rack.stars, 3);
});

test('storage が無い・読み書きが例外・空の保存でも例外を外へ出さない', () => {
  for (const storage of [undefined, null, {}, memoryStorage(), { getItem() { throw new Error('unavailable'); } }]) {
    assert.deepEqual(loadProgress(storage), emptyProgress());
  }
  const progress = freeze(recordClear(emptyProgress(), 'rack', 3));
  for (const storage of [undefined, null, {}, { setItem() { throw new Error('quota'); } }]) {
    assert.equal(saveProgress(storage, progress), false);
  }
  assert.equal(progress.cleared.rack.stars, 3);
});

test('壊れた JSON・違う版・不正な cleared は空として読む', () => {
  const storage = memoryStorage();
  const invalid = [
    '', '{', 'undefined', 'null', '[]', '42', '"text"',
    JSON.stringify({ v: 2, cleared: { rack: { stars: 3 } }, last: 'rack' }),
    JSON.stringify({ v: '1', cleared: {}, last: null }),
    JSON.stringify({ cleared: {}, last: null }),
    ...[undefined, null, [], true, 3, 'rack'].map((cleared) => JSON.stringify({ v: 1, cleared, last: null })),
  ];
  for (const raw of invalid) {
    storage.data.set(STORAGE_KEY, raw);
    assert.deepEqual(loadProgress(storage), emptyProgress(), raw);
  }
});

test('不正な星の項目だけを捨て、有効な夜の記録を残す', () => {
  const storage = memoryStorage();
  const invalidEntries = [
    null, [], '3', 3, {},
    ...[0, 4, -1, 1.5, NaN, Infinity, '3', true, null, undefined, {}, []].map((stars) => ({ stars })),
  ];
  for (const entry of invalidEntries) {
    storage.data.set(STORAGE_KEY, JSON.stringify({ v: 1, cleared: { rack: entry, hat: { stars: 2 } }, last: 'hat' }));
    assert.deepEqual(loadProgress(storage), { v: 1, cleared: { hat: { stars: 2 } }, last: 'hat' });
  }
  for (const stars of [1, 2, 3]) {
    storage.data.set(STORAGE_KEY, JSON.stringify({ v: 1, cleared: { rack: { stars } }, last: 'rack' }));
    assert.equal(loadProgress(storage).cleared.rack.stars, stars);
  }
});

test('未知の夜・余分な保存データは捨て、last も既知の夜だけを読む', () => {
  const storage = memoryStorage();
  storage.data.set(STORAGE_KEY, '{"v":1,"cleared":{"rack":{"stars":3,"extra":7},"unknown":{"stars":3},"__proto__":{"stars":3}},"last":"unknown","extra":8}');
  assert.deepEqual(loadProgress(storage), { v: 1, cleared: { rack: { stars: 3 } }, last: null });
  for (const last of [null, 1, [], {}, 'unknown']) {
    storage.data.set(STORAGE_KEY, JSON.stringify({ v: 1, cleared: {}, last }));
    assert.deepEqual(loadProgress(storage), emptyProgress());
  }
  storage.data.set(STORAGE_KEY, JSON.stringify({ v: 1, cleared: {}, last: 'hat' }));
  assert.deepEqual(loadProgress(storage), { v: 1, cleared: {}, last: 'hat' });
});

test('mergeProgress は、解決した夜を両方の和にし、星は夜ごとに高いほうを残し、last は新しいほうを優先する', () => {
  const stored = recordClear(recordClear(emptyProgress(), 'rack', 3), 'hat', 2);
  const current = recordClear(emptyProgress(), 'hat', 3);
  const merged = mergeProgress(stored, current);
  assert.deepEqual(merged, { v: 1, cleared: { rack: { stars: 3 }, hat: { stars: 3 } }, last: 'hat' });
  assert.deepEqual(mergeProgress(stored, emptyProgress()).last, stored.last);
  assert.deepEqual(mergeProgress(emptyProgress(), emptyProgress()), emptyProgress());
  // 元の2つは変えない。
  assert.deepEqual(stored.cleared.hat, { stars: 2 });
});

test('別のタブで解決した夜と星を、古い進行の保存で消さない（リセットだけが消す）', () => {
  const storage = memoryStorage();
  // タブA：夜1を星3で解決して保存。
  assert.equal(saveProgress(storage, recordClear(emptyProgress(), 'rack', 3)), true);
  // タブB：まだ空の進行のまま、夜1を開いて last を保存する。夜1の記録は消えない。
  const stale = emptyProgress();
  assert.equal(saveProgress(storage, { ...stale, last: 'rack' }), true);
  assert.deepEqual(loadProgress(storage).cleared, { rack: { stars: 3 } });
  // タブBが夜1を星1で解いても、最高の星は下がらない。
  assert.equal(saveProgress(storage, recordClear(stale, 'rack', 1)), true);
  assert.deepEqual(loadProgress(storage).cleared, { rack: { stars: 3 } });
  // 別の夜は、足される。
  assert.equal(saveProgress(storage, recordClear(stale, 'hat', 2)), true);
  assert.deepEqual(loadProgress(storage).cleared, { rack: { stars: 3 }, hat: { stars: 2 } });
  // 進行のリセットは、統合せずに置き換える。
  assert.equal(saveProgress(storage, emptyProgress(), { replace: true }), true);
  assert.deepEqual(loadProgress(storage), emptyProgress());
});

test('保存先が壊れた値でも、統合の保存は新しい進行を書き、保存できないときは false を返す', () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, '{broken');
  assert.equal(saveProgress(storage, recordClear(emptyProgress(), 'rack', 2)), true);
  assert.deepEqual(loadProgress(storage).cleared, { rack: { stars: 2 } });
  assert.equal(saveProgress({ getItem: () => null, setItem() { throw new Error('quota'); } }, emptyProgress()), false);
  assert.equal(saveProgress(null, emptyProgress()), false);
});
