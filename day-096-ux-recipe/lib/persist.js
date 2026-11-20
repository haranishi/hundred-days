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

function parse(value) {
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function read(storage, key, snapshot) {
  const raw = storage.getItem(STORAGE_PREFIX + key);
  const value = parse(raw);
  snapshot?.set(key, { raw, value });
  return value;
}

function write(storage, key, value) {
  storage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  return true;
}

function classifyCurrent(raw) {
  if (raw === null) return { status: 'empty', state: null };
  const parsed = parse(raw);
  const state = validateState(parsed).length ? null : restoreState(parsed);
  return { status: state ? 'ok' : 'damaged', state };
}

export function readCurrent(storage) {
  return withStorage(storage, { status: 'unavailable', state: null }, s =>
    classifyCurrent(s.getItem(STORAGE_PREFIX + 'current')));
}

export function backupDamagedCurrent(storage) {
  return withStorage(storage, false, s => {
    const key = STORAGE_PREFIX + 'current';
    const raw = s.getItem(key);
    // 案内を出した後で、別のタブが正しい下書きを保存した可能性がある。
    if (classifyCurrent(raw).status !== 'damaged') return false;
    const backup = key + '.damaged';
    s.setItem(backup, raw);
    return s.getItem(backup) === raw && s.getItem(key) === raw;
  });
}

export function loadCurrent(storage) {
  // 旧版の呼び出し元には、補正して開けた保存も引き続き返す。
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

function lastSlotTime(raw) {
  return Math.max(
    validSavedAt(raw?.savedAt) ? raw.savedAt : -1,
    validSavedAt(raw?.lastSavedAt) ? raw.lastSavedAt : -1,
  );
}

function keepSlotTime(record, previous) {
  // 取り消しで表示上の日時を戻しても、その間に別の作業へ割り当てた日時は再利用しない。
  const lastSavedAt = lastSlotTime(previous);
  return lastSavedAt > record.savedAt ? { ...record, lastSavedAt } : record;
}

function nextSlotTime(slots, previous) {
  let next = Date.now();
  for (const time of [lastSlotTime(previous), ...Array.from(slots.values(), slot => slot.savedAt)]) {
    if (validSavedAt(time + 1)) next = Math.max(next, time + 1);
  }
  return next;
}

// 固定の6枠なら、本文と別に目次を書かずに済む。容量不足でも片方だけが残らない。
function readSlots(storage, snapshot) {
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
  for (const id of slotIds) collect(id, read(storage, slotKey(id), snapshot));
  // 見本の版で保存した端末では、本文も旧一覧の中にある。
  const legacy = read(storage, 'slots', snapshot);
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
    let slots = readSlots(s);
    if (slots.size >= MAX_SLOTS) return { ok: false, reason: '保存は' + MAX_SLOTS + '件までです。不要な保存を消してください。' };
    const title = slotName(name, clean.site.name);
    const tried = new Set();
    while (tried.size < MAX_SLOTS && slots.size < MAX_SLOTS) {
      const id = slotIds.find(key => !slots.has(key) && !tried.has(key));
      if (!id) break;
      tried.add(id);
      const key = slotKey(id);
      const previous = read(s, key);
      if (!validSavedAt(previous?.savedAt) || !restoreState(previous.state)) {
        const savedAt = nextSlotTime(slots, previous);
        const value = JSON.stringify({ name: title, savedAt, state: clean });
        const fullKey = STORAGE_PREFIX + key;
        s.setItem(fullKey, value);
        if (s.getItem(fullKey) === value) return { ok: true, id };
      }
      // 読み戻しが違えばその枠は相手に残し、旧形式も含めて空きを調べ直す。
      slots = readSlots(s);
    }
    return { ok: false, reason: '保存の枠が別のタブで使われました。もう一度お試しください。' };
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
    if (legacyIndex === undefined) {
      const previous = read(s, slotKey(id));
      if (validSavedAt(previous?.savedAt) && restoreState(previous.state)) return false;
      return write(s, slotKey(id), keepSlotTime(saved, previous));
    }
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

function changeSlot(id, storage, expect, editsFor) {
  return withStorage(storage, { ok: false }, s => {
    const snapshot = new Map();
    const slot = readSlots(s, snapshot).get(id);
    const conflict = { ok: false, reason: 'changed' };
    if (!slot) return expect === undefined ? { ok: false } : conflict;
    if (expect !== undefined && slot.savedAt !== expect?.savedAt) return conflict;
    const key = slotKey(id);
    const edits = editsFor(slot, snapshot.get('slots').value, snapshot.get(key)?.value);
    const changed = key => snapshot.has(key) && s.getItem(STORAGE_PREFIX + key) !== snapshot.get(key).raw;
    // 旧一覧と個別枠のどちらにある作業かを、最初に両方の鍵で確かめる。
    if (expect !== undefined && (changed('slots') || changed(key))) return conflict;
    for (const [target, value] of edits) {
      // 二つの鍵を更新する場合、先の書き込み中に交代した枠には触れない。
      if (expect !== undefined && changed(target)) return conflict;
      write(s, target, value);
    }
    return { ok: true, record: slot };
  });
}

export function tryDeleteSlot(id, storage, expect) {
  return changeSlot(id, storage, expect, (slot, rows, previous) => {
    const edits = [];
    // 本文を消しても時刻だけは枠に残し、別のタブでも再利用を見分けられるようにする。
    const markFree = [slotKey(id), { savedAt: Math.max(slot.savedAt, lastSlotTime(previous)) }];
    if (slot.legacyIndex !== undefined && slotIds.includes(id)) edits.push(markFree);
    // 旧一覧を先に更新すれば、書き戻しに失敗しても現在の版から削除をやり直せる。
    if (Array.isArray(rows)) {
      const remaining = rows.filter(row => row?.id !== id);
      if (remaining.length < rows.length) edits.push(['slots', remaining]);
    }
    if (slot.legacyIndex === undefined) edits.push(markFree);
    return edits;
  });
}

export function deleteSlot(id, storage, expect) {
  return tryDeleteSlot(id, storage, expect).ok;
}

export function tryRenameSlot(id, name, storage, expect) {
  return changeSlot(id, storage, expect, (slot, rows, previous) => {
    const record = { name: slotName(name, slot.name), state: slot.state, savedAt: slot.savedAt };
    if (slot.legacyIndex === undefined) return [[slotKey(id), keepSlotTime(record, previous)]];
    return [['slots', rows.map(row => row?.id === id ? { ...row, ...record } : row)]];
  });
}

export function renameSlot(id, name, storage, expect) {
  return tryRenameSlot(id, name, storage, expect).ok;
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
