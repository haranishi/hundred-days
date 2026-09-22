export const KEY = 'namahage.v1';
// v2 でお札・面内得点・tick のベストを持つようになった。保存キーは変えない。
export const RULES_VERSION = 2;
// お札はビット和。早駆け1・福集め2・無傷4。
export const SEAL = Object.freeze({ dash: 1, fortune: 2, unhurt: 4 });
export const SEAL_NAMES = Object.freeze(['早駆け', '福集め', '無傷']);
export const sealCount = seals =>
  Number.isInteger(seals) ? [1, 2, 4].filter(bit => seals & bit).length : 0;
export const defaults = () => ({
  unlockedWorld: 1,
  rulesVersion: RULES_VERSION,
  // 旧版の秒記録。面を作り直したのでベスト表示には使わない（消さずに残すだけ）。
  bestMs: {},
  recordsV2: {},
  muted: false,
});
const isId = id => /^[1-4]-[1-5]$/.test(id);
const plain = value =>
  value && typeof value === 'object' && !Array.isArray(value);
// 保存値は既知の範囲だけ採用し、破損時は初期値へ戻す。
export function sanitize(value) {
  const result = defaults();
  if (!plain(value)) {
    return result;
  }
  if (
    Number.isInteger(value.unlockedWorld) &&
    value.unlockedWorld >= 1 &&
    value.unlockedWorld <= 4
  ) {
    result.unlockedWorld = value.unlockedWorld;
  }
  if (plain(value.bestMs)) {
    for (const [id, ms] of Object.entries(value.bestMs)) {
      if (isId(id) && Number.isSafeInteger(ms) && ms > 0) {
        result.bestMs[id] = ms;
      }
    }
  }
  if (plain(value.recordsV2)) {
    for (const [id, record] of Object.entries(value.recordsV2)) {
      if (!isId(id) || !plain(record)) {
        continue;
      }
      const { bestTicks, bestScore, seals } = record;
      if (
        !Number.isSafeInteger(bestTicks) ||
        bestTicks <= 0 ||
        !Number.isSafeInteger(bestScore) ||
        bestScore < 0 ||
        !Number.isInteger(seals) ||
        seals < 0 ||
        seals > 7
      ) {
        continue;
      }
      result.recordsV2[id] = { bestTicks, bestScore, seals };
    }
  }
  if (typeof value.muted === 'boolean') {
    result.muted = value.muted;
  }
  return result;
}
export function readStore(storage) {
  try {
    return sanitize(JSON.parse(storage.getItem(KEY)));
  } catch {
    return defaults();
  }
}
export function writeStore(storage, value) {
  try {
    storage.setItem(KEY, JSON.stringify(sanitize(value)));
    return true;
  } catch {
    return false;
  }
}
// 戸口に着いたときの記録。時間は短いほう、得点は高いほう、お札は積み上げ。
export function recordClear(saved, id, result = {}) {
  const next = sanitize(saved);
  if (!isId(id)) {
    return next;
  }
  const ticks = Math.max(1, Math.round(Number(result.ticks) || 1));
  const score = Math.max(0, Math.round(Number(result.score) || 0));
  const seals = Number.isInteger(result.seals)
    ? Math.max(0, Math.min(7, result.seals))
    : 0;
  const before = next.recordsV2[id];
  next.recordsV2[id] = {
    bestTicks: Math.min(before?.bestTicks ?? Infinity, ticks),
    bestScore: Math.max(before?.bestScore ?? 0, score),
    seals: (before?.seals ?? 0) | seals,
  };
  if (id[2] === '5') {
    next.unlockedWorld = Math.max(
      next.unlockedWorld,
      Math.min(4, Number(id[0]) + 1),
    );
  }
  return next;
}
