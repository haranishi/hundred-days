import { MAX_SLOTS, SITE_NAME_MAX, STORAGE_PREFIX, clampText } from './contract.js';
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

// 固定の6枠なら、本文と別に目次を書かずに済む。容量不足でも片方だけが残らない。
function readSlots(storage) {
  const slots = new Map();
  function collect(id, raw, legacy) {
    if (typeof id !== 'string' || !id || slots.has(id) || slots.size >= MAX_SLOTS) return;
    if (!Number.isSafeInteger(raw?.savedAt) || raw.savedAt < 0 || !Number.isFinite(new Date(raw.savedAt).getTime())) return;
    const state = restoreState(raw.state);
    if (state) slots.set(id, { id, name: slotName(raw.name, state.site.name), savedAt: raw.savedAt, state, legacy });
  }
  for (const id of slotIds) collect(id, read(storage, slotKey(id)), false);
  // 見本の版で保存した端末では、本文も旧一覧の中にある。
  const legacy = read(storage, 'slots');
  if (Array.isArray(legacy)) {
    for (const row of legacy) {
      if (slots.size === MAX_SLOTS) break;
      collect(row?.id, row, true);
    }
  }
  return slots;
}

export function listSlots(storage) {
  return withStorage(storage, [], s => Array.from(readSlots(s).values())
    .sort((a, b) => b.savedAt - a.savedAt)
    .map(({ id, name, savedAt, state }) => ({ id, name, goal: state.goal, savedAt, blocks: state.blocks.length })));
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

export function loadSlot(id, storage) {
  return withStorage(storage, null, s => readSlots(s).get(id)?.state ?? null);
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
    if (!slot.legacy) s.removeItem(STORAGE_PREFIX + slotKey(id));
    return true;
  });
}

export function renameSlot(id, name, storage) {
  return withStorage(storage, false, s => {
    const slot = readSlots(s).get(id);
    if (!slot) return false;
    const record = { name: slotName(name, slot.name), state: slot.state, savedAt: slot.savedAt };
    if (!slot.legacy) return write(s, slotKey(id), record);
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
