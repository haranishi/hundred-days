/* 外部APIはここだけ。Open-Meteo の `current`（いまの観測値）だけを読む。

   `hourly` も `daily` も読まない。将来の時刻の気象の値を取りに行かないのがこのアプリの前提で、
   理由は README「なぜ『いま』だけなのか」に書いた（気象業務法17条の予報業務にしないため）。
   取りに行かなければ、うっかり画面に出すこともできない。

   ⚠️ `current` の積算値は「1時間あたり」ではない。
   実測（2026-09-13・秋田/東京/札幌/那覇/シドニー/マドリード）では `interval` は常に 900 秒で、
   返る値は直前15分ぶんの積算だった。同じ時刻の `minutely_15` と完全に一致し、
   `hourly` とは一致しない（秋田 22:45 の雨: current 0.9 = minutely_15 0.9 ≠ hourly 0.2）。
   そのまま mm/h として扱うと4分の1に見積もることになるので、必ず perHour() を通す。 */

export const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';

const CURRENT = [
  'temperature_2m',
  'relative_humidity_2m',
  'precipitation',
  'cloud_cover',
  'wind_speed_10m',
  'shortwave_radiation',
  'et0_fao_evapotranspiration',
  'is_day'
];

/** 座標は小数3桁（約100m）に丸めてから送る。現在地の精度をそのまま外へ出さない */
export const round3 = (n) => Math.round(n * 1000) / 1000;

export function buildUrl({ lat, lon }) {
  const params = new URLSearchParams({
    latitude: String(round3(lat)),
    longitude: String(round3(lon)),
    current: CURRENT.join(','),
    timezone: 'Asia/Tokyo'
  });
  return `${ENDPOINT}?${params}`;
}

/** interval が取れなかったときの既定。実測ではどの地点でも 900 だった */
export const DEFAULT_INTERVAL_SEC = 900;

/** interval 秒ぶんの積算値を「1時間あたり」に直す */
export function perHour(value, intervalSec = DEFAULT_INTERVAL_SEC) {
  const seconds = Number.isFinite(intervalSec) && intervalSec > 0 ? intervalSec : DEFAULT_INTERVAL_SEC;
  return Math.round((value ?? 0) * (3600 / seconds) * 10000) / 10000;
}

/** 応答から「いまの1時点」だけを取り出す。時刻は timezone で指定した日本時間の壁掛け時計 */
export function parseCurrent(json) {
  const current = json?.current;
  if (!current || typeof current.time !== 'string') throw new Error('いまの天気が空');
  const num = (key) => (typeof current[key] === 'number' ? current[key] : null);
  const intervalSec = num('interval') ?? DEFAULT_INTERVAL_SEC;
  return {
    time: current.time,
    intervalSec,
    temp: num('temperature_2m'),
    humidity: num('relative_humidity_2m'),
    cloud: num('cloud_cover'),
    wind: num('wind_speed_10m'),
    radiation: num('shortwave_radiation'),
    isDay: (num('is_day') ?? 1) === 1,
    et0PerHour: perHour(num('et0_fao_evapotranspiration') ?? 0, intervalSec),
    precipPerHour: perHour(num('precipitation') ?? 0, intervalSec)
  };
}

/* 干し場所を切り替えても通信しないための持ち回り。
   `current` は15分ごとに更新されるので、10分持っても古い値を見せることにはならない */
const cache = new Map();
const CACHE_MS = 10 * 60 * 1000;

export function cacheId({ lat, lon }) {
  return `${round3(lat)},${round3(lon)}`;
}

export function readCache(id, now = Date.now()) {
  const hit = cache.get(id);
  if (!hit || now - hit.at > CACHE_MS) return null;
  return hit.value;
}

export function writeCache(id, value, now = Date.now()) {
  cache.set(id, { at: now, value });
}

export function clearCache() {
  cache.clear();
}

export async function fetchCurrent({ lat, lon, signal, fetchImpl = globalThis.fetch, timeoutMs = 8000 }) {
  const id = cacheId({ lat, lon });
  const cached = readCache(id);
  if (cached) return cached;

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetchImpl(buildUrl({ lat, lon }), {
      signal: signal ?? controller?.signal,
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`天気の取得に失敗しました (${response.status})`);
    const parsed = parseCurrent(await response.json());
    writeCache(id, parsed);
    return parsed;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
