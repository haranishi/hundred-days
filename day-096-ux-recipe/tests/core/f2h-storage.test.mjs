import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_SLOTS, STORAGE_PREFIX } from '../../lib/contract.js';
import { deleteSlot, listSlots, loadSlot, renameSlot, saveSlot } from '../../lib/persist.js';
import { MINIMAL, RESERVE_SAMPLE } from '../fixtures/states.js';

const slotKey = n => STORAGE_PREFIX + 'slot.s' + n;
const full = { ok: false, reason: '保存は6件までです。不要な保存を消してください。' };

function memory() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

test('枠は同じ作業の改名後も開け、再利用されたら以前の時刻では開けない', () => {
  const s = memory();
  const { id } = saveSlot(MINIMAL, '旧稿', s);
  const [row] = listSlots(s);
  const expect = { savedAt: row.savedAt };
  assert.ok(renameSlot(id, '改名した旧稿', s, expect));
  assert.deepEqual(loadSlot(id, s, expect), MINIMAL);
  assert.ok(deleteSlot(id, s, expect));
  assert.equal(loadSlot(id, s, expect), null);
  assert.equal(saveSlot(RESERVE_SAMPLE, '新稿', s).id, id);
  assert.equal(loadSlot(id, s, expect), null);
  assert.deepEqual(loadSlot(id, s, { savedAt: listSlots(s)[0].savedAt }), RESERVE_SAMPLE);
  assert.deepEqual(loadSlot(id, s), RESERVE_SAMPLE);
});

test('読めない保存の原文を残し、実際に空いている枠へ書く', () => {
  const s = memory();
  const damaged = [
    '{', 'null', JSON.stringify({ savedAt: -1, state: MINIMAL }),
    JSON.stringify({ savedAt: 10, state: null }), JSON.stringify({ savedAt: 20, name: '本文のない案' }),
  ];
  damaged.forEach((raw, i) => s.setItem(slotKey(i + 1), raw));
  assert.deepEqual(saveSlot(MINIMAL, '新稿', s), { ok: true, id: 's6' });
  assert.deepEqual(loadSlot('s6', s), MINIMAL);
  assert.deepEqual(saveSlot(RESERVE_SAMPLE, '満杯', s), full);
  damaged.forEach((raw, i) => assert.equal(s.getItem(slotKey(i + 1)), raw));
});

test('壊れた個別枠と旧形式の保存を合わせて6件なら、満杯として原文を保つ', () => {
  const s = memory();
  const rows = Array.from({ length: MAX_SLOTS - 1 }, (_, i) => ({
    id: 'legacy-' + i, name: '以前の案', savedAt: i, state: MINIMAL,
  }));
  const raw = JSON.stringify(rows);
  s.setItem(STORAGE_PREFIX + 'slots', raw);
  s.setItem(slotKey(1), '');
  assert.deepEqual(saveSlot(RESERVE_SAMPLE, '新しい案', s), full);
  assert.equal(s.getItem(slotKey(1)), '');
  assert.equal(s.getItem(slotKey(2)), null);
  assert.equal(s.getItem(STORAGE_PREFIX + 'slots'), raw);
});
