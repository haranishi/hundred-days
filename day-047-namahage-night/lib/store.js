export const KEY = 'namahage.v1';
export const defaults = () => ({ unlockedWorld: 1, bestMs: {}, muted: false });
// 保存値は既知の範囲だけ採用し、破損時は初期値へ戻す。
export function sanitize(value) {
  const result = defaults();
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return result;
  }
  if (
    Number.isInteger(value.unlockedWorld) &&
    value.unlockedWorld >= 1 &&
    value.unlockedWorld <= 4
  ) {
    result.unlockedWorld = value.unlockedWorld;
  }
  if (
    value.bestMs &&
    typeof value.bestMs === 'object' &&
    !Array.isArray(value.bestMs)
  ) {
    for (const [id, ms] of Object.entries(value.bestMs)) {
      if (/^[1-4]-[1-5]$/.test(id) && Number.isSafeInteger(ms) && ms > 0) {
        result.bestMs[id] = ms;
      }
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
export function recordClear(saved, id, ms) {
  const next = sanitize(saved);
  next.bestMs[id] = Math.min(
    next.bestMs[id] ?? Infinity,
    Math.max(1, Math.round(ms)),
  );
  if (id[2] === '5') {
    next.unlockedWorld = Math.max(
      next.unlockedWorld,
      Math.min(4, Number(id[0]) + 1),
    );
  }
  return next;
}
