/* 外部APIはここだけ。Day 31から解禁の「外部API1個」が Open-Meteo の予報。
   鍵は要らない。返ってくる時刻は timezone で指定した日本時間の壁掛け時計。 */

export const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';

const HOURLY = [
  'temperature_2m',
  'relative_humidity_2m',
  'precipitation_probability',
  'precipitation',
  'cloud_cover',
  'wind_speed_10m',
  'shortwave_radiation',
  'et0_fao_evapotranspiration',
  'is_day'
];

/** 座標は小数3桁（約100m）に丸めてから送る。現在地の精度をそのまま外へ出さない */
export const round3 = (n) => Math.round(n * 1000) / 1000;

export function buildUrl({ lat, lon, days = 3 }) {
  const params = new URLSearchParams({
    latitude: String(round3(lat)),
    longitude: String(round3(lon)),
    hourly: HOURLY.join(','),
    daily: 'sunrise,sunset',
    timezone: 'Asia/Tokyo',
    forecast_days: String(days)
  });
  return `${ENDPOINT}?${params}`;
}

/** APIの「列ごとの配列」を、1時間1件の行に組み替える */
export function parseForecast(json) {
  const hourly = json?.hourly;
  if (!hourly || !Array.isArray(hourly.time) || hourly.time.length === 0) {
    throw new Error('予報の中身が空');
  }
  const at = (key, index) => {
    const value = hourly[key]?.[index];
    return typeof value === 'number' ? value : null;
  };
  const hours = hourly.time.map((time, index) => ({
    time,
    temp: at('temperature_2m', index),
    humidity: at('relative_humidity_2m', index),
    precipProb: at('precipitation_probability', index) ?? 0,
    precip: at('precipitation', index) ?? 0,
    cloud: at('cloud_cover', index),
    wind: at('wind_speed_10m', index),
    radiation: at('shortwave_radiation', index),
    et0: at('et0_fao_evapotranspiration', index) ?? 0,
    isDay: at('is_day', index) ?? 1
  }));
  return {
    hours,
    sunrises: json?.daily?.sunrise ?? [],
    sunsets: json?.daily?.sunset ?? []
  };
}

/** 同じ座標を短時間に何度も叩かない。切り替えのたびに通信しないための持ち回り */
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

export async function fetchForecast({ lat, lon, days = 3, signal, fetchImpl = globalThis.fetch, timeoutMs = 8000 }) {
  const id = cacheId({ lat, lon });
  const cached = readCache(id);
  if (cached) return cached;

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetchImpl(buildUrl({ lat, lon, days }), {
      signal: signal ?? controller?.signal,
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`天気の取得に失敗しました (${response.status})`);
    const parsed = parseForecast(await response.json());
    writeCache(id, parsed);
    return parsed;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
