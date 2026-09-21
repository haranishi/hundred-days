export const BEST_STORAGE_NAME = 'day045.best.v1', MUTE_STORAGE_NAME = 'day045.mute.v1';
export function load(storage) {
  try {
    const v = JSON.parse(storage.getItem(BEST_STORAGE_NAME) || 'null');
    const best = v && Number.isInteger(v.score) && v.score >= 0 && Number.isInteger(v.wave) && v.wave > 0 && typeof v.date === 'string' ? { score: v.score, wave: v.wave, date: v.date } : null;
    return { best, mute: storage.getItem(MUTE_STORAGE_NAME) === 'true', available: true };
  } catch { return { best: null, mute: false, available: false }; }
}
export function saveBest(storage, best, score, wave, date = new Date().toISOString().slice(0, 10)) {
  if (best && (score < best.score || (score === best.score && wave <= best.wave))) return { best, saved: true, improved: false };
  const next = { score, wave, date };
  try { storage.setItem(BEST_STORAGE_NAME, JSON.stringify(next)); return { best: next, saved: true, improved: true }; }
  catch { return { best: next, saved: false, improved: true }; }
}
export function saveMute(storage, mute) {
  try { storage.setItem(MUTE_STORAGE_NAME, JSON.stringify(Boolean(mute))); return true; } catch { return false; }
}
