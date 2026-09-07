/* ベストの点数と、前回選んだ県だけを端末に残す。名前も回答履歴も残さない。
   保存できない環境（プライベートモード等）でも遊べるように、失敗は必ず値で返して例外にしない。 */

export const STORAGE_NAME = 'day031.best.v1';
const VERSION = 1;
const MAX_SCORE = 10;
const PREF_CODE = /^(0[1-9]|[1-3]\d|4[0-7])$/;

/** モードごとの記録の置き場所。県別の記録は 'town:05' の形にする */
export function bestSlot({ mode, prefCode = null } = {}) {
  if (mode === 'town') return prefCode ? `town:${prefCode}` : 'town';
  return mode === 'town-all' ? 'town-all' : 'pref';
}

const isSlot = (name) => name === 'pref' || name === 'town-all' || (name.startsWith('town:') && PREF_CODE.test(name.slice(5)));

export const isPrefCode = (code) => PREF_CODE.test(String(code ?? ''));

export function emptyRecord() {
  return { best: {}, lastPref: null };
}

function normalize(parsed) {
  const record = emptyRecord();
  const best = parsed?.best;
  if (best && typeof best === 'object') {
    for (const [name, value] of Object.entries(best)) {
      const score = Number(value?.score);
      if (!isSlot(name) || !Number.isFinite(score) || score < 0 || score > MAX_SCORE) continue;
      record.best[name] = { score, at: typeof value.at === 'string' ? value.at : '' };
    }
  }
  if (isPrefCode(parsed?.lastPref)) record.lastPref = parsed.lastPref;
  return record;
}

function canWrite(storage) {
  const probe = `${STORAGE_NAME}.probe`;
  try {
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/** 保存済みの記録を読む。壊れていれば黙って捨てて新しい記録にする */
export function load(storage) {
  if (!storage) return { record: emptyRecord(), canSave: false };
  let raw;
  try {
    raw = storage.getItem(STORAGE_NAME);
  } catch {
    return { record: emptyRecord(), canSave: false };
  }
  const canSave = canWrite(storage);
  if (raw === null || raw === undefined) return { record: emptyRecord(), canSave };
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.v !== VERSION) throw new Error('version');
    return { record: normalize(parsed), canSave };
  } catch {
    return { record: emptyRecord(), canSave };
  }
}

export function serialize(record) {
  return JSON.stringify({ v: VERSION, best: record.best, lastPref: record.lastPref });
}

function write(storage, record) {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_NAME, serialize(record));
    return true;
  } catch {
    return false;
  }
}

/** そのモードのベスト。まだ無ければ null */
export function bestOf(record, slot) {
  const value = record?.best?.[slot];
  return typeof value?.score === 'number' ? value.score : null;
}

/** ベストを更新する。同点では更新しない（「更新した」の言葉を安売りしないため） */
export function saveBest(storage, record, slot, score, now = new Date()) {
  const current = bestOf(record, slot);
  if (current !== null && score <= current) return { saved: false, improved: false };
  record.best[slot] = { score, at: now.toISOString() };
  return { saved: write(storage, record), improved: true };
}

/** 市区町村モードで遊び始めた県を覚えておく。次に開いたときの初期値になる */
export function saveLastPref(storage, record, prefCode) {
  if (!isPrefCode(prefCode) || record.lastPref === prefCode) return { saved: false };
  record.lastPref = prefCode;
  return { saved: write(storage, record) };
}
