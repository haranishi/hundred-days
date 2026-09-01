export const CACHE_TTL = 10 * 60 * 1000;
// 名前に KEY を使わない。gitleaks が「名前にKEYを含む定数への文字列代入」を汎用APIキーと誤検知する
const SETTINGS_SLOT = 'nearby-parking.v1';

// storageの「参照」自体が SecurityError を投げる環境（Cookie遮断など）があるため取得も包む
export function safeStorage(kind, scope = globalThis) {
  try { return scope[kind] || null; } catch { return null; }
}

export function cacheKey(lat, lng, radius) {
  return `ov:${Number(lat).toFixed(4)}:${Number(lng).toFixed(4)}:${radius}`;
}

export function isFresh(entry, now = Date.now(), ttl = CACHE_TTL) {
  return Boolean(entry && Number.isFinite(entry.savedAt) && now - entry.savedAt < ttl && now >= entry.savedAt);
}

export function readCache(storage, key, now = Date.now()) {
  try {
    const entry = JSON.parse(storage.getItem(key));
    return isFresh(entry, now) ? entry.value : null;
  } catch { return null; }
}

export function writeCache(storage, key, value, now = Date.now()) {
  try { storage.setItem(key, JSON.stringify({ savedAt: now, value })); return true; }
  catch { return false; }
}

export function loadSettings(storage) {
  try { return JSON.parse(storage.getItem(SETTINGS_SLOT)) || {}; }
  catch { return {}; }
}

export function saveSettings(storage, settings) {
  try { storage.setItem(SETTINGS_SLOT, JSON.stringify(settings)); return true; }
  catch { return false; }
}
