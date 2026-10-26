export const STORAGE_KEY = 'hoan_swiper_record';

export const DEFAULT_RECORD = Object.freeze({
  bestRushScore: 0,
  bestRushCombo: 0,
  bestTrainingCorrect: 0,
  totalInspected: 0,
  soundEnabled: false
});

function clampInt(val, min, max, fallback = 0) {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(num)));
}

/**
 * 生の文字列またはオブジェクトから安全な記録オブジェクトへ正規化する純関数
 * @param {unknown} raw
 */
export function normalizeRecord(raw) {
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ...DEFAULT_RECORD };
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ...DEFAULT_RECORD };
  }
  return {
    bestRushScore: clampInt(parsed.bestRushScore, 0, 999999, 0),
    bestRushCombo: clampInt(parsed.bestRushCombo, 0, 9999, 0),
    bestTrainingCorrect: clampInt(parsed.bestTrainingCorrect, 0, 10, 0),
    totalInspected: clampInt(parsed.totalInspected, 0, 999999, 0),
    soundEnabled: Boolean(parsed.soundEnabled)
  };
}

/**
 * localStorageから記録を読み込む
 * @param {Storage | null} [storage]
 */
export function loadRecord(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  if (!storage || typeof storage.getItem !== 'function') {
    return { ...DEFAULT_RECORD };
  }
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_RECORD };
    return normalizeRecord(raw);
  } catch {
    return { ...DEFAULT_RECORD };
  }
}

/**
 * localStorageへ記録を保存する
 * @param {object} record
 * @param {Storage | null} [storage]
 */
export function saveRecord(record, storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  const safe = normalizeRecord(record);
  if (!storage || typeof storage.setItem !== 'function') {
    return safe;
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(safe));
  } catch {
    // プライベートブラウジング等の書き込み制限時は握りつぶす
  }
  return safe;
}

/**
 * ゲーム終了時の結果で記録を更新する純関数
 * @param {object} currentRecord
 * @param {object} finishedState
 */
export function mergeSessionIntoRecord(currentRecord, finishedState) {
  const base = normalizeRecord(currentRecord);
  if (!finishedState) return base;

  const isRush = finishedState.mode === 'rush';
  const nextRushScore = isRush
    ? Math.max(base.bestRushScore, clampInt(finishedState.score, 0, 999999, 0))
    : base.bestRushScore;
  const nextRushCombo = isRush
    ? Math.max(base.bestRushCombo, clampInt(finishedState.maxCombo, 0, 9999, 0))
    : base.bestRushCombo;
  const nextTrainingCorrect = !isRush
    ? Math.max(base.bestTrainingCorrect, clampInt(finishedState.correctCount, 0, 10, 0))
    : base.bestTrainingCorrect;
  const addedCount = clampInt(finishedState.totalAnswered, 0, 9999, 0);

  return normalizeRecord({
    ...base,
    bestRushScore: nextRushScore,
    bestRushCombo: nextRushCombo,
    bestTrainingCorrect: nextTrainingCorrect,
    totalInspected: base.totalInspected + addedCount
  });
}
