/* 進み具合の保存（端末の中だけ）。形：{ muted, levels: { L1: { stars, best, tries, usedSample } } }
   定数名を「〜_KEY」にしない（gitleaks がAPIキーと誤検知してCIが落ちた前例が5回ある）。
   保存先は引数で受け取る。拒否・容量超過・プライベートモードで読み書きに失敗しても、記録なしとして遊べる。 */

export const STORAGE_NAME = 'teikokuGohan.v1';

export function emptyProgress() {
  return { muted: false, levels: {} };
}

export function emptyLevelRecord() {
  return { stars: 0, best: null, tries: 0, usedSample: false };
}

const isCount = (v) => Number.isInteger(v) && v >= 0;

// 読めた値を、知っている面と知っている項目だけに絞って整える（知らない面IDは捨てる）
export function sanitizeProgress(raw, levelIds) {
  const out = emptyProgress();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  if (typeof raw.muted === 'boolean') out.muted = raw.muted;
  const levels = raw.levels && typeof raw.levels === 'object' && !Array.isArray(raw.levels) ? raw.levels : {};
  for (const id of levelIds) {
    const r = levels[id];
    if (!r || typeof r !== 'object' || Array.isArray(r)) continue;
    out.levels[id] = {
      stars: Number.isInteger(r.stars) && r.stars >= 0 && r.stars <= 3 ? r.stars : 0,
      best: Number.isInteger(r.best) && r.best > 0 ? r.best : null,
      tries: isCount(r.tries) ? r.tries : 0,
      usedSample: r.usedSample === true,
    };
  }
  return out;
}

export function parseProgress(text, levelIds) {
  if (typeof text !== 'string' || text === '') return emptyProgress();
  try {
    return sanitizeProgress(JSON.parse(text), levelIds);
  } catch {
    return emptyProgress();
  }
}

export function loadProgress(storage, levelIds) {
  try {
    return parseProgress(storage ? storage.getItem(STORAGE_NAME) : null, levelIds);
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(storage, progress) {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_NAME, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}

export function levelRecord(progress, id) {
  return progress.levels[id] ? { ...progress.levels[id] } : emptyLevelRecord();
}

/* 発車1回ぶんを記録した新しい progress を返す（元は変えない）。
   tries は毎回+1。クリアなら stars は最大値、best は最短の完食時刻、usedSample は見本でクリアしたことがあるか */
export function recordRun(progress, id, { cleared, stars = 0, finish = null, usedSample = false }) {
  const prev = levelRecord(progress, id);
  const next = { ...prev, tries: prev.tries + 1 };
  if (cleared) {
    next.stars = Math.max(prev.stars, stars);
    next.best = prev.best === null ? finish : Math.min(prev.best, finish);
    next.usedSample = prev.usedSample || usedSample;
  }
  return { ...progress, levels: { ...progress.levels, [id]: next } };
}

export function withMuted(progress, muted) {
  return { ...progress, muted: Boolean(muted) };
}

// 最初に開く面：まだクリアしていない最初の面（全部クリア済みなら面1）
export function startIndex(levels, progress) {
  const i = levels.findIndex((L) => !(progress.levels[L.id]?.stars > 0));
  return i < 0 ? 0 : i;
}
