import { emptyState, validateState } from './model.js';
export const STORAGE_KEY = 'day085-warikan-v1';
export function loadState(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return { state: raw ? validateState(JSON.parse(raw)) : emptyState(), error: '' };
  } catch {
    return { state: emptyState(), error: '保存データを読み込めませんでした。新しく入力できます。元のデータは変更していません。' };
  }
}
export function saveState(storage, state) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(validateState(state))); return true; }
  catch { return false; }
}
