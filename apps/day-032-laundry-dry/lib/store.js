/* 最後に選んだ場所と、干し方・干し場所を覚える。
   位置情報を断った人が毎回市区町村を選び直すのは苦痛なので、そこだけ残す。
   localStorage が使えない環境（プライベートウィンドウ等）でもアプリは動く。 */

const STORAGE_NAME = 'day-032-laundry-dry';

export function isAvailable(storage = safeStorage()) {
  if (!storage) return false;
  try {
    const probe = `${STORAGE_NAME}:probe`;
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function safeStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export const DEFAULTS = { code: null, fabric: 'normal', place: 'sun' };

export function load(storage = safeStorage()) {
  if (!storage) return { ...DEFAULTS };
  try {
    const saved = JSON.parse(storage.getItem(STORAGE_NAME) || '{}');
    return {
      code: typeof saved.code === 'string' && /^\d{5}$/.test(saved.code) ? saved.code : null,
      fabric: ['thin', 'normal', 'thick'].includes(saved.fabric) ? saved.fabric : DEFAULTS.fabric,
      place: ['sun', 'shade'].includes(saved.place) ? saved.place : DEFAULTS.place
    };
  } catch {
    // 壊れていたら黙って捨てる。ここで止まる意味はない
    return { ...DEFAULTS };
  }
}

export function save(patch, storage = safeStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_NAME, JSON.stringify({ ...load(storage), ...patch }));
    return true;
  } catch {
    return false;
  }
}
