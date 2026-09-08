/* 最後の場所だけを覚える。座標や地震の一覧は残さない。 */
const STORAGE_NAME = 'day-033-did-it-shake';

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

export const DEFAULTS = { code: null, mode: 'picked' };

function sanitize(value) {
  const valid = typeof value?.code === 'string' && /^\d{5}$/.test(value.code) && ['picked', 'current'].includes(value?.mode);
  return valid ? { code: value.code, mode: value.mode } : { ...DEFAULTS };
}
export function load(storage = safeStorage()) {
  try { return sanitize(JSON.parse(storage?.getItem(STORAGE_NAME) || '{}')); }
  catch { return { ...DEFAULTS }; }
}
export function save(value, storage = safeStorage()) {
  if (!storage) return false;
  try {
    const saved = sanitize(value);
    if (saved.code) storage.setItem(STORAGE_NAME, JSON.stringify(saved));
    else storage.removeItem(STORAGE_NAME);
    return true;
  } catch { return false; }
}
