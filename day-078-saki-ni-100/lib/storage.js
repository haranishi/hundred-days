export const STORAGE = 'saki-ni-100.v1';
const fresh = () => ({ cleared: [], noHint: [], sound: false });
const validIds = value => Array.isArray(value) && value.length <= 12 && value.every(n => Number.isInteger(n) && n >= 1 && n <= 12) && new Set(value).size === value.length;
export function validateProgress(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== 'cleared,noHint,sound' ||
      !validIds(value.cleared) || !validIds(value.noHint) || typeof value.sound !== 'boolean' ||
      value.noHint.some(n => !value.cleared.includes(n))) return fresh();
  return { cleared: [...value.cleared].sort((a, b) => a - b), noHint: [...value.noHint].sort((a, b) => a - b), sound: value.sound };
}
export function loadProgress(storage) {
  try {
    const raw = (storage ?? globalThis.localStorage).getItem(STORAGE);
    if (typeof raw !== 'string' || raw.length > 1024) return fresh();
    return validateProgress(JSON.parse(raw));
  } catch { return fresh(); }
}
export function saveProgress(value, storage) {
  try { (storage ?? globalThis.localStorage).setItem(STORAGE, JSON.stringify(validateProgress(value))); return true; }
  catch { return false; }
}
