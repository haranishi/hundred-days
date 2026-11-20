import { LIGHT_IDS, POT_IDS, SAVE_NAME, SAVE_VERSION } from './contract.js';

const MAX_SAVE_BYTES = 400 * 1024;
const encoder = new TextEncoder();

function fits(raw) {
  return typeof raw === 'string' && raw.length <= MAX_SAVE_BYTES && encoder.encode(raw).length <= MAX_SAVE_BYTES;
}

function isSave(value) {
  return value?.v === SAVE_VERSION
    && value.tree !== null && typeof value.tree === 'object' && !Array.isArray(value.tree)
    && POT_IDS.includes(value.pot) && LIGHT_IDS.includes(value.light)
    && typeof value.muted === 'boolean' && typeof value.tipsSeen === 'boolean'
    && Number.isSafeInteger(value.savedAt) && value.savedAt >= 0;
}

export function createStore({
  restoreTree,
  enabled = true,
  storage = () => globalThis.localStorage,
  eventTarget = globalThis.window,
  delay = 350,
  now = () => Date.now(),
} = {}) {
  let pending = null;
  let timer = null;
  let generation = 0;
  let writeHeld = false;

  function invalidatePending() {
    generation += 1;
    clearTimeout(timer);
    timer = null;
    pending = null;
  }

  function read() {
    if (!enabled) return { status: 'empty' };
    try {
      const raw = storage().getItem(SAVE_NAME);
      if (raw === null) {
        writeHeld = false;
        return { status: 'empty' };
      }
      if (!fits(raw)) throw new Error('保存の容量が上限を超えています');
      const record = JSON.parse(raw);
      if (!isSave(record)) throw new Error('保存の形式が合いません');
      // 節の上限や内部の値は、復元の入口でも検査する。
      const tree = restoreTree(record.tree);
      if (!tree) throw new Error('盆栽を復元できません');
      writeHeld = false;
      return { status: 'restored', save: { ...record, tree } };
    } catch {
      // 一時的な端末エラーでも既存の盆栽を守れるよう、利用者が選ぶまで保留する。
      writeHeld = true;
      invalidatePending();
      return { status: 'unreadable' };
    }
  }

  function flush() {
    clearTimeout(timer);
    timer = null;
    const job = pending;
    pending = null;
    if (!job || writeHeld) return false;
    try {
      const raw = JSON.stringify(job.record);
      if (!fits(raw)) return false;
      const area = storage();
      // 別タブからの通知が届く前にページを閉じても、予約後の変更を守る。
      if (job.previous !== undefined && area.getItem(SAVE_NAME) !== job.previous) return false;
      if (job.generation !== generation) return false;
      area.setItem(SAVE_NAME, raw);
      return true;
    } catch {
      return false;
    }
  }

  function schedule({ tree, pot, light, muted, tipsSeen }, { replace = false } = {}) {
    if (!enabled || (writeHeld && !replace)) return;
    const scheduledGeneration = generation;
    try {
      // 離した時点の状態を取ると、待ち時間に次の曲げを始めても途中の形を保存しない。
      const record = { v: SAVE_VERSION, tree: tree.toJSON(), pot, light, muted, tipsSeen, savedAt: now() };
      if (!isSave(record)) return;
      let previous;
      try {
        previous = storage().getItem(SAVE_NAME);
      } catch {
        // 読み取りだけを拒む端末でも、利用者が苗の入れ替えを選んだときは書き込める。
        if (!replace) return;
      }
      if (scheduledGeneration !== generation) return;
      pending = { record, generation: scheduledGeneration, previous };
      writeHeld = false;
      clearTimeout(timer);
      timer = setTimeout(flush, delay);
    } catch {
      // 次の操作の保存を試せるように、シリアライズの失敗を外へ出さない。
    }
  }

  function clear() {
    invalidatePending();
    if (!enabled) return false;
    try {
      storage().removeItem(SAVE_NAME);
      writeHeld = false;
      return true;
    } catch {
      // 消去の失敗後も通常の手入れで元の保存を上書きしない。
      writeHeld = true;
      return false;
    }
  }

  if (enabled) eventTarget?.addEventListener('storage', (event) => {
    if (event.key !== SAVE_NAME && event.key !== null) return;
    try {
      if (event.storageArea && event.storageArea !== storage()) return;
    } catch {
      // 保存領域を確かめられないときも、古い予約を残さないようにする。
    }
    invalidatePending();
  });

  return { read, schedule, flush, clear };
}
