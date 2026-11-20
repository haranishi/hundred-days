import { MAX_SLOTS, SITE_NAME_MAX, STORAGE_PREFIX, clampText, validateState } from './contract.js';
import { restoreState } from './state.js';

const slotIds = Array.from({ length: MAX_SLOTS }, (_, i) => 's' + (i + 1));
const slotKey = id => 'slot.' + id;

function withStorage(storage, fallback, operation) {
  try {
    // localStorage はプロパティを読むだけで例外になる環境がある。
    const target = storage === undefined ? globalThis.localStorage : storage;
    return target ? operation(target) : fallback;
  } catch {
    return fallback;
  }
}

function read(storage, key) {
  const value = storage.getItem(STORAGE_PREFIX + key);
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function write(storage, key, value) {
  storage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  return true;
}

export function loadCurrent(storage) {
  return withStorage(storage, null, s => restoreState(read(s, 'current')));
}

export function saveCurrent(state, storage) {
  return withStorage(storage, false, s => {
    const clean = restoreState(state);
    return clean !== null && write(s, 'current', clean);
  });
}

export function clearCurrent(storage) {
  withStorage(storage, undefined, s => s.removeItem(STORAGE_PREFIX + 'current'));
}

function slotName(name, fallback) {
  const trimmed = typeof name === 'string' ? name.trim() : name;
  return clampText(trimmed, SITE_NAME_MAX).trim() || fallback.trim() || '無題';
}

function validSavedAt(value) {
  return Number.isSafeInteger(value) && value >= 0 && Number.isFinite(new Date(value).getTime());
}

// 固定の6枠なら、本文と別に目次を書かずに済む。容量不足でも片方だけが残らない。
function readSlots(storage) {
  const slots = new Map();
  function collect(id, raw) {
    if (typeof id !== 'string' || !id || slots.has(id) || slots.size >= MAX_SLOTS) return;
    if (!validSavedAt(raw?.savedAt)) return;
    const state = restoreState(raw.state);
    if (!state) return;
    const record = {
      id, name: slotName(raw.name, state.site.name), savedAt: raw.savedAt,
      goal: state.goal, blocks: state.blocks.length, state,
    };
    slots.set(id, record);
    return record;
  }
  for (const id of slotIds) collect(id, read(storage, slotKey(id)));
  // 見本の版で保存した端末では、本文も旧一覧の中にある。
  const legacy = read(storage, 'slots');
  if (Array.isArray(legacy)) {
    for (const [index, row] of legacy.entries()) {
      if (slots.size === MAX_SLOTS) break;
      const record = collect(row?.id, row);
      if (record) {
        // 削除時には同じIDの壊れた行も消えるため、戻す位置にはほかのIDの行だけを数える。
        record.legacyIndex = legacy.slice(0, index).filter(earlier => earlier?.id !== record.id).length;
      }
    }
  }
  return slots;
}

export function listSlots(storage) {
  return withStorage(storage, [], s => Array.from(readSlots(s).values())
    .sort((a, b) => b.savedAt - a.savedAt)
    .map(({ id, name, goal, savedAt, blocks }) => ({ id, name, goal, savedAt, blocks })));
}

export function saveSlot(state, name, storage) {
  const failed = { ok: false, reason: 'この端末には保存できませんでした。' };
  return withStorage(storage, failed, s => {
    const clean = restoreState(state);
    if (!clean) return failed;
    const slots = readSlots(s);
    if (slots.size >= MAX_SLOTS) return { ok: false, reason: '保存は' + MAX_SLOTS + '件までです。不要な保存を消してください。' };
    const id = slotIds.find(key => !slots.has(key));
    // 同じミリ秒に続けて保存しても、新しく追加したものを先頭に出す。
    const now = Date.now();
    const nextTime = Math.max(now, ...Array.from(slots.values(), slot => slot.savedAt + 1));
    const savedAt = Number.isFinite(new Date(nextTime).getTime()) ? nextTime : now;
    write(s, slotKey(id), { name: slotName(name, clean.site.name), savedAt, state: clean });
    return { ok: true, id };
  });
}

export function getSlotRecord(id, storage) {
  return withStorage(storage, null, s => readSlots(s).get(id) ?? null);
}

function validSlotRecord(record) {
  if (!record || typeof record.id !== 'string' || !record.id || !validSavedAt(record.savedAt)) return false;
  if (typeof record.name !== 'string' || slotName(record.name, '') !== record.name) return false;
  const { legacyIndex, state } = record;
  const validPosition = legacyIndex === undefined
    ? slotIds.includes(record.id)
    : Number.isSafeInteger(legacyIndex) && legacyIndex >= 0;
  // 削除を取り消すときは、不足した本文を空のページに補って成功扱いにしない。
  return validPosition && validateState(state).length === 0 && record.goal === state.goal && record.blocks === state.blocks.length;
}

export function restoreSlot(record, storage) {
  return withStorage(storage, false, s => {
    if (!validSlotRecord(record)) return false;
    const slots = readSlots(s);
    const { id, name, savedAt, state, legacyIndex } = record;
    if (slots.has(id) || slots.size >= MAX_SLOTS) return false;
    const saved = { name, savedAt, state };
    if (legacyIndex === undefined) return write(s, slotKey(id), saved);
    const rows = read(s, 'slots') ?? [];
    if (!Array.isArray(rows)) return false;
    // 旧一覧は保存時刻が同じなら行順で表示するため、消す前の位置へ戻す。
    rows.splice(legacyIndex, 0, { id, ...saved });
    return write(s, 'slots', rows);
  });
}

export function loadSlot(id, storage) {
  return getSlotRecord(id, storage)?.state ?? null;
}

export function deleteSlot(id, storage) {
  return withStorage(storage, false, s => {
    const slot = readSlots(s).get(id);
    if (!slot) return false;
    // 旧一覧を先に更新すれば、書き戻しに失敗しても現在の版から削除をやり直せる。
    const rows = read(s, 'slots');
    if (Array.isArray(rows)) {
      const remaining = rows.filter(row => row?.id !== id);
      if (remaining.length < rows.length) write(s, 'slots', remaining);
    }
    if (slot.legacyIndex === undefined) s.removeItem(STORAGE_PREFIX + slotKey(id));
    return true;
  });
}

export function renameSlot(id, name, storage) {
  return withStorage(storage, false, s => {
    const slot = readSlots(s).get(id);
    if (!slot) return false;
    const record = { name: slotName(name, slot.name), state: slot.state, savedAt: slot.savedAt };
    if (slot.legacyIndex === undefined) return write(s, slotKey(id), record);
    const rows = read(s, 'slots');
    return Array.isArray(rows) && write(s, 'slots', rows.map(row => row?.id === id ? { ...row, ...record } : row));
  });
}

function seenFlags(storage) {
  const flags = read(storage, 'seen');
  return flags !== null && typeof flags === 'object' && !Array.isArray(flags) ? flags : {};
}

export function hasSeen(key, storage) {
  return withStorage(storage, false, s => {
    const flags = seenFlags(s);
    return typeof key === 'string' && key.length > 0 && Object.hasOwn(flags, key) && flags[key] === true;
  });
}

export function markSeen(key, storage) {
  return withStorage(storage, false, s => typeof key === 'string' && key.length > 0 && write(s, 'seen', { ...seenFlags(s), [key]: true }));
}
