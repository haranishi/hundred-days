import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_SLOTS, STORAGE_PREFIX, sanitizeState, validateState } from '../../lib/contract.js';
import {
  clearCurrent, deleteSlot, hasSeen, listSlots, loadCurrent, loadSlot,
  markSeen, renameSlot, saveCurrent, saveSlot,
} from '../../lib/persist.js';
import { MINIMAL, RESERVE_SAMPLE, STRESS } from '../fixtures/states.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.get(key) ?? null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
  };
}

test('新旧両方にある枠を消すと旧版も消え、他の保存は残る', () => {
  const s = memoryStorage();
  const { id } = saveSlot(MINIMAL, '新しい版', s);
  const old = { id, name: '古い版', savedAt: 1, state: RESERVE_SAMPLE };
  const other = { ...old, id: '別の枠' };
  s.setItem(STORAGE_PREFIX + 'slots', JSON.stringify([old, other, old]));
  assert.deepEqual(loadSlot(id, s), MINIMAL);
  assert.equal(deleteSlot(id, s), true);
  assert.deepEqual(listSlots(s).map(row => row.id), [other.id]);
  assert.equal(loadSlot(id, s), null);
  assert.deepEqual(loadSlot(other.id, s), RESERVE_SAMPLE);
  assert.equal(saveSlot(MINIMAL, '使い直す', s).id, id);
});

test('旧一覧を書き戻せないときは新しい版を残し、削除をやり直せる', () => {
  const s = memoryStorage();
  const { id } = saveSlot(MINIMAL, '編集中の版', s);
  s.setItem(STORAGE_PREFIX + 'slots', JSON.stringify([{ id, savedAt: 1, state: RESERVE_SAMPLE }]));
  const full = { ...s, setItem() { throw new DOMException('容量不足', 'QuotaExceededError'); } };
  assert.equal(deleteSlot(id, full), false);
  assert.deepEqual(loadSlot(id, s), MINIMAL);
  assert.equal(deleteSlot(id, s), true);
  assert.equal(loadSlot(id, s), null);
});

test('空白だけの保存名は既定名に戻り、前後の空白は24字に数えない', () => {
  const s = memoryStorage();
  const { id } = saveSlot({ ...MINIMAL, site: { name: '　 ' } }, '　 ', s);
  assert.equal(listSlots(s)[0].name, '無題');
  saveSlot(MINIMAL, '　 ', s);
  assert.equal(listSlots(s)[0].name, MINIMAL.site.name);
  renameSlot(id, ' '.repeat(25) + '🌷'.repeat(25) + '　', s);
  renameSlot(id, '　', s);
  assert.equal(listSlots(s).find(row => row.id === id).name, '🌷'.repeat(24));
});

test('現在の作業を保存して開き、消せる', () => {
  const storage = memoryStorage();
  for (const state of [MINIMAL, RESERVE_SAMPLE, STRESS]) {
    assert.equal(saveCurrent(state, storage), true);
    assert.deepEqual(JSON.parse(storage.getItem(STORAGE_PREFIX + 'current')), state);
    assert.deepEqual(loadCurrent(storage), state);
  }
  clearCurrent(storage);
  assert.equal(loadCurrent(storage), null);
});

test('同時刻に6件保存してもidが重ならず新しい順に並び、消した後はまた保存できる', t => {
  t.mock.method(Date, 'now', () => 12345);
  const storage = memoryStorage();
  const ids = [];
  for (let i = 0; i < MAX_SLOTS; i++) {
    const result = saveSlot(MINIMAL, '店舗' + i, storage);
    assert.equal(result.ok, true);
    assert.deepEqual(Object.keys(result).sort(), ['id', 'ok']);
    assert.ok(storage.getItem(STORAGE_PREFIX + 'slot.' + result.id));
    ids.push(result.id);
    assert.deepEqual(loadSlot(result.id, storage), MINIMAL);
  }
  assert.equal(new Set(ids).size, MAX_SLOTS);
  const full = listSlots(storage);
  assert.deepEqual(full.map(slot => slot.id), ids.toReversed());
  for (const row of full) {
    assert.deepEqual(Object.keys(row).sort(), ['blocks', 'goal', 'id', 'name', 'savedAt']);
    assert.equal(row.blocks, MINIMAL.blocks.length);
    assert.equal(row.goal, MINIMAL.goal);
    assert.equal(row.name, '店舗' + ids.indexOf(row.id));
    assert.ok(Number.isFinite(row.savedAt));
  }
  const overflow = saveSlot(STRESS, '上限を超える', storage);
  assert.equal(overflow.ok, false);
  assert.match(overflow.reason, /6件/);
  assert.deepEqual(listSlots(storage), full);
  assert.equal(renameSlot(ids[2], '😀'.repeat(25), storage), true);
  assert.equal(listSlots(storage).find(row => row.id === ids[2]).name, '😀'.repeat(24));
  assert.deepEqual(listSlots(storage).map(row => row.savedAt), full.map(row => row.savedAt));
  assert.equal(deleteSlot(ids[2], storage), true);
  assert.equal(loadSlot(ids[2], storage), null);
  const added = saveSlot(RESERVE_SAMPLE, '', storage);
  assert.equal(added.ok, true);
  assert.equal(listSlots(storage)[0].name, RESERVE_SAMPLE.site.name);
  assert.deepEqual(loadSlot(added.id, storage), RESERVE_SAMPLE);
});

test('見本の版の一覧からも復元し、表示用の目的と件数は復元した本文から取る', () => {
  const s = memoryStorage();
  const dirty = { goal: 'visit', site: { name: '店\u0000名' }, theme: { preset: '古い' },
    blocks: [{ id: 'b1', type: 'hero', props: { title: '文\u202e' } }, { type: '未登録' }] };
  const expected = sanitizeState(dirty);
  const old = { id: 's1', name: '店\n名', savedAt: 123, state: dirty, goal: '買う', blocks: 99 };
  s.setItem(STORAGE_PREFIX + 'slots', JSON.stringify([null, { id: 'broken' }, old]));
  s.setItem(STORAGE_PREFIX + 'current', JSON.stringify(dirty));
  assert.deepEqual(loadCurrent(s), expected);
  assert.deepEqual(loadSlot(old.id, s), expected);
  assert.deepEqual(listSlots(s), [{ id: old.id, name: '店 名', goal: 'visit', savedAt: 123, blocks: 1 }]);
  const fresh = saveSlot(MINIMAL, '新', s);
  assert.equal(fresh.ok, true);
  assert.notEqual(fresh.id, old.id);
  assert.equal(renameSlot(old.id, '保存名', s), true);
  assert.equal(listSlots(s)[1].name, '保存名');
  assert.equal(deleteSlot(old.id, s), true);
  assert.deepEqual(listSlots(s).map(r => r.id), [fresh.id]);
  assert.deepEqual(loadCurrent(s), expected);
});

test('保存前後に状態を整え、読み出した値を編集しても保存先の値は変わらない', () => {
  const s = memoryStorage();
  const dirty = { goal: 'buy', blocks: [{ id: '??', type: 'hero', variant: 99, props: { title: '文'.repeat(99), unknown: 2 } }] };
  const expected = sanitizeState(dirty);
  assert.equal(saveCurrent(dirty, s), true);
  const slot = saveSlot(dirty, '', s);
  assert.equal(slot.ok, true);
  assert.equal(listSlots(s)[0].name, '無題');
  const copy = loadSlot(slot.id, s);
  assert.deepEqual(copy, expected);
  assert.deepEqual(validateState(copy), []);
  copy.blocks[0].props.title = '別の文';
  assert.deepEqual(loadSlot(slot.id, s), expected);
  assert.deepEqual(loadCurrent(s), expected);
  const key = STORAGE_PREFIX + 'slot.' + slot.id;
  s.setItem(key, JSON.stringify({ savedAt: 100, name: '長'.repeat(80), state: { ...dirty, goal: 'apply' } }));
  assert.equal(loadSlot(slot.id, s).goal, 'apply');
  assert.equal(listSlots(s)[0].name, '長'.repeat(24));
  for (const bad of [null, [], { goal: 'なし' }, { goal: 'constructor' }]) {
    assert.equal(saveCurrent(bad, s), false);
    assert.deepEqual(loadCurrent(s), expected);
    assert.equal(saveSlot(bad, '', s).ok, false);
  }
});

test('現在の作業・保存枠・初回ヒントを独立して扱い、初回の記録は端末内だけに残す', () => {
  const s = memoryStorage();
  assert.equal(hasSeen('編集', s), false);
  for (const key of ['編集', '共有']) assert.equal(markSeen(key, s), true);
  assert.equal(hasSeen('編集', s), true);
  assert.equal(hasSeen('共有', s), true);
  assert.equal(hasSeen('共有', memoryStorage()), false);
  assert.equal(hasSeen('toString', s), false);
  assert.equal(hasSeen({}, s), false);
  assert.equal(markSeen('', s), false);
  assert.equal(saveCurrent(MINIMAL, s), true);
  const slot = saveSlot(RESERVE_SAMPLE, '一件', s);
  clearCurrent(s);
  assert.equal(hasSeen('編集', s), true);
  assert.deepEqual(loadSlot(slot.id, s), RESERVE_SAMPLE);
  assert.equal(deleteSlot('知らないid', s), false);
  assert.equal(renameSlot('知らないid', '新', s), false);
  assert.equal(deleteSlot(slot.id, s), true);
  assert.equal(hasSeen('共有', s), true);
});

function unavailable(s) {
  assert.equal(loadCurrent(s), null);
  assert.equal(saveCurrent(MINIMAL, s), false);
  assert.doesNotThrow(() => clearCurrent(s));
  assert.deepEqual(listSlots(s), []);
  assert.equal(loadSlot('s1', s), null);
  const result = saveSlot(MINIMAL, '試験', s);
  assert.equal(result.ok, false);
  assert.match(result.reason, /保存/);
  assert.equal(deleteSlot('s1', s), false);
  assert.equal(renameSlot('s1', '文', s), false);
  assert.equal(hasSeen('a', s), false);
  assert.equal(markSeen('a', s), false);
}

test('保存先が未定義・null・アクセス禁止のどの場合も例外を出さない', t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  });
  delete globalThis.localStorage;
  unavailable(undefined);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memoryStorage() });
  assert.equal(saveCurrent(MINIMAL), true);
  assert.deepEqual(loadCurrent(), MINIMAL);
  const slot = saveSlot(MINIMAL, '端末の既定');
  assert.deepEqual(loadSlot(slot.id), MINIMAL);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new DOMException('権限', 'SecurityError'); } });
  unavailable(undefined);
  unavailable(null);
  unavailable({});
});

test('壊れたJSONや別の型を読み飛ばし、次の通常保存で復旧する', () => {
  for (const raw of ['{', 'null', 'true', '12', '"文字列"', '{}', '[]', '[null,3,{}]']) {
    const s = memoryStorage();
    for (const key of ['current', 'slots', 'slot.s1', 'seen']) s.setItem(STORAGE_PREFIX + key, raw);
    assert.equal(loadCurrent(s), null);
    assert.deepEqual(listSlots(s), []);
    assert.equal(loadSlot('s1', s), null);
    assert.equal(renameSlot('s1', '改名', s), false);
    assert.equal(deleteSlot('s1', s), false);
    assert.equal(hasSeen('a', s), false);
    assert.equal(saveCurrent(MINIMAL, s), true);
    const result = saveSlot(MINIMAL, '', s);
    assert.equal(result.ok, true);
    assert.deepEqual(loadSlot(result.id, s), MINIMAL);
    assert.equal(markSeen('a', s), true);
    assert.equal(hasSeen('a', s), true);
  }
});

test('getItemの例外で一覧を空と誤認して既存の保存を潰さない', () => {
  const s = memoryStorage();
  saveCurrent(MINIMAL, s);
  const original = saveSlot(MINIMAL, '元の保存', s);
  const broken = { ...s, getItem() { throw new DOMException('読み取り不可', 'SecurityError'); } };
  assert.equal(loadCurrent(broken), null);
  assert.deepEqual(listSlots(broken), []);
  assert.equal(loadSlot(original.id, broken), null);
  assert.equal(saveSlot(RESERVE_SAMPLE, '', broken).ok, false);
  assert.equal(renameSlot(original.id, '別名', broken), false);
  assert.equal(deleteSlot(original.id, broken), false);
  assert.equal(hasSeen('a', broken), false);
  assert.equal(markSeen('a', broken), false);
  assert.deepEqual(listSlots(s).map(r => r.name), ['元の保存']);
});

test('保存日時が範囲外の枠があっても、新しく保存した本文を読み出せる', () => {
  const s = memoryStorage();
  const key = STORAGE_PREFIX + 'slot.s1';
  s.setItem(key, JSON.stringify({ savedAt: Number.MAX_SAFE_INTEGER, state: MINIMAL }));
  assert.deepEqual(listSlots(s), []);
  s.setItem(key, JSON.stringify({ savedAt: 8_640_000_000_000_000, state: MINIMAL }));
  const slot = saveSlot(STRESS, '新しい保存', s);
  assert.equal(slot.ok, true);
  assert.deepEqual(loadSlot(slot.id, s), STRESS);
});

test('容量超過や削除失敗では以前の内容を保ち、保存が使えるようになれば再試行できる', () => {
  const s = memoryStorage();
  saveCurrent(MINIMAL, s);
  const original = saveSlot(MINIMAL, '元の保存', s);
  const broken = { ...s,
    setItem() { throw new DOMException('容量超過', 'QuotaExceededError'); },
    removeItem() { throw new DOMException('削除不可', 'SecurityError'); },
  };
  assert.equal(saveCurrent(STRESS, broken), false);
  assert.equal(saveSlot(STRESS, '新しい保存', broken).ok, false);
  assert.equal(renameSlot(original.id, '別名', broken), false);
  assert.equal(deleteSlot(original.id, broken), false);
  assert.equal(markSeen('a', broken), false);
  assert.doesNotThrow(() => clearCurrent(broken));
  assert.deepEqual(loadCurrent(s), MINIMAL);
  assert.deepEqual(loadSlot(original.id, s), MINIMAL);
  assert.deepEqual(listSlots(s).map(r => r.name), ['元の保存']);
  assert.equal(saveSlot(STRESS, '再試行', s).ok, true);
  assert.deepEqual(listSlots(s).map(r => r.name), ['再試行', '元の保存']);
});
