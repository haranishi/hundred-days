/* 進み具合の保存（端末の中だけ）。形：{ muted, letterKeys, levels: { L1: { stars, best } } }
   stars は大きい方、best（最少の手数）は小さい方で上書きする。お手本の再生では保存しない。
   保存の名前の定数は、名前の末尾を KEY にしない（gitleaks がAPIキーと誤検知する前例がある）。
   保存先は引数で受け取る。壊れた JSON・使えない保存先・知らない面ID・容量超過でも落ちず、記録なしの既定値で遊べる。 */
import { LEVELS } from './levels-data.js';

export const STORAGE_NAME = 'hakokageKaito.v1';

const LEVEL_IDS = LEVELS.map((L) => L.id);

export function emptyProgress() {
  return { muted: false, letterKeys: true, levels: {} };
}

const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// 読めた値を、知っている面と知っている項目だけに絞って整える（知らない面IDは捨てる）
export function sanitizeProgress(raw) {
  const out = emptyProgress();
  if (!isPlain(raw)) return out;
  if (typeof raw.muted === 'boolean') out.muted = raw.muted;
  if (typeof raw.letterKeys === 'boolean') out.letterKeys = raw.letterKeys;
  const levels = isPlain(raw.levels) ? raw.levels : {};
  for (const id of LEVEL_IDS) {
    const r = levels[id];
    if (!isPlain(r)) continue;
    const stars = Number.isInteger(r.stars) && r.stars >= 1 && r.stars <= 3 ? r.stars : 0;
    const best = Number.isInteger(r.best) && r.best >= 1 ? r.best : null;
    if (stars > 0 && best !== null) out.levels[id] = { stars, best };
  }
  return out;
}

export function parseProgress(text) {
  if (typeof text !== 'string' || text === '') return emptyProgress();
  try {
    return sanitizeProgress(JSON.parse(text));
  } catch {
    return emptyProgress();
  }
}

export function loadProgress(storage) {
  try {
    return parseProgress(storage ? storage.getItem(STORAGE_NAME) : null);
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(storage, data) {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_NAME, JSON.stringify(sanitizeProgress(data)));
    return true;
  } catch {
    return false;
  }
}

// 面の記録。まだなら { stars: 0, best: null }
export function levelRecord(data, id) {
  const r = data.levels[id];
  return r ? { stars: r.stars, best: r.best } : { stars: 0, best: null };
}

/* 成功を記録した新しいデータを返す（元は変えない）。stars は大きい方、best は小さい方。
   お手本で出口に着いたとき（demo: true）は何も記録しない。知らない面ID・不正な値も記録しない。 */
export function recordClear(data, id, stars, steps, { demo = false } = {}) {
  if (demo) return data;
  if (!LEVEL_IDS.includes(id)) return data;
  if (!Number.isInteger(stars) || stars < 1 || stars > 3) return data;
  if (!Number.isInteger(steps) || steps < 1) return data;
  const prev = levelRecord(data, id);
  const next = { stars: Math.max(prev.stars, stars), best: prev.best === null ? steps : Math.min(prev.best, steps) };
  return { ...data, levels: { ...data.levels, [id]: next } };
}

export function withMuted(data, muted) {
  return { ...data, muted: Boolean(muted) };
}

export function withLetterKeys(data, on) {
  return { ...data, letterKeys: Boolean(on) };
}

// 最初に開く面（0から数える）：星の無い面のうち一番若い面。全部に星があれば面1
export function firstOpenIndex(data) {
  const i = LEVEL_IDS.findIndex((id) => !(data.levels[id]?.stars > 0));
  return i < 0 ? 0 : i;
}

export function allCleared(data) {
  return LEVEL_IDS.every((id) => data.levels[id]?.stars > 0);
}

// 星の合計（全面★3なら 面の数×3）
export function totalStars(data) {
  return LEVEL_IDS.reduce((sum, id) => sum + (data.levels[id]?.stars ?? 0), 0);
}
