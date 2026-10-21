import { STORAGE_KEY, encodeSnapshot, decodeSnapshot } from './model.js';

export function readSaved(storage) {
  try {
    const text = storage.getItem(STORAGE_KEY);
    if (text === null) return { ok: true, state: null };
    const state = decodeSnapshot(text);
    return state ? { ok: true, state, text } : { ok: false, kind: 'corrupt' };
  } catch { return { ok: false, kind: 'unavailable' }; }
}

export function writeSaved(storage, state) {
  try { const text = encodeSnapshot(state); storage.setItem(STORAGE_KEY, text); return { ok: true, text }; }
  catch { return { ok: false, kind: 'unavailable' }; }
}

export function removeSaved(storage) {
  try { storage.removeItem(STORAGE_KEY); return { ok: true }; }
  catch { return { ok: false, kind: 'unavailable' }; }
}
