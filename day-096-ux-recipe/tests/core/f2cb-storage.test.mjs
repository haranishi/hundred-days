import assert from 'node:assert/strict';
import test from 'node:test';
import * as persist from '../../lib/persist.js';
import { MAX_SLOTS, STORAGE_PREFIX } from '../../lib/contract.js';
import { MINIMAL, RESERVE_SAMPLE } from '../fixtures/states.js';

const current = STORAGE_PREFIX + 'current';
const backup = current + '.damaged';
const collision = '保存の枠が別のタブで使われました。もう一度お試しください。';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

test('下書きの読み取りで空・正常・壊れたJSON・状態として不正な値を区別する', () => {
  const s = memoryStorage();
  assert.deepEqual(persist.readCurrent(s), { status: 'empty', state: null });
  for (const raw of ['', '{', 'null', '{}', '{"goal":"buy"}', JSON.stringify({ ...MINIMAL, v: 99 })]) {
    s.setItem(current, raw);
    assert.deepEqual(persist.readCurrent(s), { status: 'damaged', state: null });
    assert.equal(s.getItem(current), raw);
  }
  persist.saveCurrent(MINIMAL, s);
  assert.deepEqual(persist.readCurrent(s), { status: 'ok', state: MINIMAL });
});

test('読み取りで例外が出る端末も、保存先の取得自体が拒まれる端末も利用不可になる', t => {
  const denied = () => { throw new Error('読み取り不可'); };
  assert.deepEqual(persist.readCurrent({ getItem: denied }), { status: 'unavailable', state: null });
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: denied });
  assert.deepEqual(persist.readCurrent(), { status: 'unavailable', state: null });
});

test('壊れた下書きの原文を1件だけ退避し、途中で他のタブが直した本文と退避済みの値を守る', () => {
  const s = memoryStorage();
  for (const raw of [' {こわれた値\n', '{"goal":"buy"}', '']) {
    s.setItem(current, raw);
    assert.equal(persist.backupDamagedCurrent(s), true);
    assert.equal(s.getItem(backup), raw);
    assert.equal(s.getItem(current), raw);
  }
  const broken = '{書き込めない';
  s.setItem(current, broken);
  const full = { ...s, setItem() { throw new Error('容量不足'); } };
  assert.equal(persist.backupDamagedCurrent(full), false);
  assert.equal(s.getItem(current), broken);
  persist.saveCurrent(MINIMAL, s);
  assert.equal(persist.backupDamagedCurrent(s), false);
  assert.deepEqual(persist.loadCurrent(s), MINIMAL);
  s.removeItem(current);
  assert.equal(persist.backupDamagedCurrent(s), false);
  assert.equal(s.getItem(backup), '');
});

for (const action of ['削除', '名前変更']) {
  test('使い直された枠で古い一覧からの' + action + 'を拒み、最新の一覧からは操作できる', t => {
    t.mock.method(Date, 'now', () => 12345);
    const s = memoryStorage();
    const { id } = persist.saveSlot(MINIMAL, '前の案', s);
    const expect = { savedAt: persist.listSlots(s)[0].savedAt };
    const change = expected => action === '削除'
      ? persist.deleteSlot(id, s, expected) : persist.renameSlot(id, '確定した名前', s, expected);
    assert.ok(persist.deleteSlot(id, s, expect));
    assert.equal(change(expect), false);
    assert.equal(persist.saveSlot(RESERVE_SAMPLE, '別の作業', s).id, id);
    const before = persist.getSlotRecord(id, s);
    assert.equal(change(expect), false);
    assert.deepEqual(persist.getSlotRecord(id, s), before);
    assert.ok(change({ savedAt: before.savedAt }));
    if (action === '削除') assert.equal(persist.getSlotRecord(id, s), null);
    else assert.deepEqual(persist.getSlotRecord(id, s), { ...before, name: '確定した名前' });
  });
}

for (const field of ['savedAt', 'name', 'state']) {
  test('枠への書き込み直後に ' + field + ' が変わったら、その内容を保ち次の枠に保存する', () => {
    const s = memoryStorage();
    const first = STORAGE_PREFIX + 'slot.s1';
    let other;
    const racing = {
      ...s,
      setItem(key, value) {
        s.setItem(key, value);
        if (key !== first || other) return;
        const record = JSON.parse(value);
        other = { ...record, [field]: { savedAt: record.savedAt + 1, name: '別の案', state: RESERVE_SAMPLE }[field] };
        s.setItem(key, JSON.stringify(other));
      },
    };
    assert.deepEqual(persist.saveSlot(MINIMAL, 'このタブの案', racing), { ok: true, id: 's2' });
    assert.deepEqual(JSON.parse(s.getItem(first)), other);
    assert.deepEqual(persist.loadSlot('s2', s), MINIMAL);
    assert.equal(persist.getSlotRecord('s2', s).name, 'このタブの案');
  });
}

test('空き枠をすべて別のタブが先に使ったら6回で止まり、競合の理由を返す', () => {
  const s = memoryStorage();
  const attempts = [];
  const racing = {
    ...s,
    setItem(key, value) {
      if (!key.startsWith(STORAGE_PREFIX + 'slot.s')) return s.setItem(key, value);
      attempts.push(key);
      assert.ok(attempts.length <= MAX_SLOTS);
      s.setItem(key, JSON.stringify({ ...JSON.parse(value), name: '先に保存された案' }));
    },
  };
  assert.deepEqual(persist.saveSlot(MINIMAL, 'このタブの案', racing), { ok: false, reason: collision });
  assert.equal(new Set(attempts).size, MAX_SLOTS);
  assert.ok(persist.listSlots(s).every(row => row.name === '先に保存された案'));
});

test('書き込み中に先頭の枠だけが空いた場合も、読み直した一覧から保存先を選ぶ', () => {
  const s = memoryStorage();
  for (let i = 0; i < MAX_SLOTS; i++) persist.saveSlot(MINIMAL, '保存' + i, s);
  persist.deleteSlot('s2', s);
  const racing = {
    ...s,
    setItem(key, value) {
      s.setItem(key, value);
      if (key !== STORAGE_PREFIX + 'slot.s2') return;
      s.setItem(key, JSON.stringify({ ...JSON.parse(value), name: '別のタブの案' }));
      persist.deleteSlot('s1', s);
    },
  };
  assert.deepEqual(persist.saveSlot(RESERVE_SAMPLE, '自分の案', racing), { ok: true, id: 's1' });
  assert.deepEqual(persist.loadSlot('s1', s), RESERVE_SAMPLE);
  assert.equal(persist.getSlotRecord('s2', s).name, '別のタブの案');
});

for (const format of ['現在の枠', '旧一覧']) {
  test(format + 'を照合している間に差し替わった本文を、削除も名前変更も書き換えない', () => {
    for (const change of [
      (s, expect) => persist.deleteSlot('s1', s, expect),
      (s, expect) => persist.renameSlot('s1', '古い名前の案', s, expect),
    ]) {
      const s = memoryStorage();
      const legacy = format === '旧一覧';
      const key = STORAGE_PREFIX + (legacy ? 'slots' : 'slot.s1');
      const encode = row => JSON.stringify(legacy ? [row] : row);
      const old = encode({ id: 's1', name: '前の案', savedAt: 10, state: MINIMAL });
      const latest = encode({ id: 's1', name: '別の作業', savedAt: 20, state: RESERVE_SAMPLE });
      s.setItem(key, old);
      const racing = {
        ...s,
        getItem(k) {
          const value = s.getItem(k);
          if (k === key && value === old) s.setItem(key, latest);
          return value;
        },
      };
      assert.equal(change(racing, { savedAt: 10 }), false);
      assert.equal(s.getItem(key), latest);
    }
  });
}

test('取り消しで古い作業と名前を戻した後も、別の作業に使った時刻を再発行しない', t => {
  t.mock.method(Date, 'now', () => 5000);
  const s = memoryStorage();
  const { id } = persist.saveSlot(MINIMAL, '最初の作業', s);
  const first = persist.getSlotRecord(id, s);
  persist.deleteSlot(id, s);
  persist.saveSlot(MINIMAL, '次の作業', s);
  const second = persist.getSlotRecord(id, s);
  persist.deleteSlot(id, s);
  assert.ok(persist.restoreSlot(first, s));
  assert.deepEqual(persist.getSlotRecord(id, s), first);
  assert.ok(persist.renameSlot(id, '戻した作業', s, first));
  assert.ok(persist.deleteSlot(id, s, first));
  assert.equal(persist.saveSlot(RESERVE_SAMPLE, '残す作業', s).id, id);
  assert.equal(persist.deleteSlot(id, s, { savedAt: second.savedAt }), false);
  assert.deepEqual(persist.loadSlot(id, s), RESERVE_SAMPLE);
});

test('旧一覧の同じIDを片付ける間に入った新しい保存に、削除が及ばない', () => {
  const s = memoryStorage();
  const { id } = persist.saveSlot(MINIMAL, '以前の保存', s);
  const [before] = persist.listSlots(s);
  const legacyKey = STORAGE_PREFIX + 'slots';
  const modernKey = STORAGE_PREFIX + 'slot.' + id;
  s.setItem(legacyKey, JSON.stringify([{ id, savedAt: 1, state: MINIMAL }]));
  const latest = JSON.stringify({ name: '残す作業', savedAt: before.savedAt + 1, state: RESERVE_SAMPLE });
  const racing = {
    ...s,
    setItem(key, value) {
      s.setItem(key, value);
      if (key === legacyKey) s.setItem(modernKey, latest);
    },
  };
  assert.deepEqual(persist.tryDeleteSlot(id, racing, { savedAt: before.savedAt }), { ok: false, reason: 'changed' });
  assert.equal(s.getItem(modernKey), latest);
});
