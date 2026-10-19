// 星・解放・端末への保存。保存先は呼び出し側から受け取る。
import { CASES } from './cases.js';
import { MAX_STARS } from './config.js';

export const STORAGE_KEY = 'kage-shogen:v1';

const caseIds = new Set(CASES.map((caseDef) => caseDef.id));
const validStars = (stars) => Number.isInteger(stars) && stars >= 1 && stars <= MAX_STARS;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function emptyProgress() {
  return { v: 1, cleared: {}, last: null };
}

function cleanProgress(value) {
  const progress = emptyProgress();
  if (!isObject(value) || value.v !== 1 || !isObject(value.cleared)) return progress;
  for (const id of caseIds) {
    const entry = Object.hasOwn(value.cleared, id) ? value.cleared[id] : null;
    if (isObject(entry) && validStars(entry.stars)) progress.cleared[id] = { stars: entry.stars };
  }
  if (caseIds.has(value.last)) progress.last = value.last;
  return progress;
}

export function loadProgress(storage) {
  try {
    return cleanProgress(JSON.parse(storage.getItem(STORAGE_KEY)));
  } catch {
    return emptyProgress();
  }
}

// 2つの進行を統合する：解決した夜は両方の和、星は夜ごとに高いほう、last は current を優先する。
export function mergeProgress(stored, current) {
  const merged = emptyProgress();
  for (const id of caseIds) {
    const stars = Math.max(stored.cleared[id]?.stars ?? 0, current.cleared[id]?.stars ?? 0);
    if (stars > 0) merged.cleared[id] = { stars };
  }
  merged.last = current.last ?? stored.last;
  return merged;
}

// 通常は、保存済みの進行と統合して書く。別のタブで解決した夜と最高の星を、このタブの古い進行で上書きして消さないため。
// 進行のリセットだけは、統合せずに置き換える（{ replace: true }）。
export function saveProgress(storage, progress, { replace = false } = {}) {
  try {
    const next = replace ? cleanProgress(progress) : mergeProgress(loadProgress(storage), cleanProgress(progress));
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

export function isUnlocked(progress, index) {
  if (!Number.isInteger(index) || index < 0 || index >= CASES.length) return false;
  return index === 0 || Object.hasOwn(progress.cleared, CASES[index - 1].id);
}

export function starsFor({ usedGuide, hintsUsed, wrongAnswers }) {
  const kinds = Number(Boolean(usedGuide)) + Number(hintsUsed > 0) + Number(wrongAnswers > 0);
  return MAX_STARS - Math.min(2, kinds);
}

export function recordClear(progress, caseId, stars) {
  if (!caseIds.has(caseId) || !validStars(stars)) throw new RangeError('unknown case or invalid stars');
  const next = cleanProgress(progress);
  next.cleared[caseId] = { stars: Math.max(stars, next.cleared[caseId]?.stars ?? 0) };
  next.last = caseId;
  return next;
}

export function totalStars(progress) {
  return CASES.reduce((total, caseDef) => total + (progress.cleared[caseDef.id]?.stars ?? 0), 0);
}

export function clearedCount(progress) {
  return CASES.filter((caseDef) => Object.hasOwn(progress.cleared, caseDef.id)).length;
}

export function nextIndex(progress) {
  const index = CASES.findIndex((caseDef) => !Object.hasOwn(progress.cleared, caseDef.id));
  return index < 0 ? CASES.length : index;
}
