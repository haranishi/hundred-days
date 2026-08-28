import { haversine } from './geo.js';

export const MIRRORS = [
  'https://de1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
  'https://at1.api.radio-browser.info',
];

export const RADII_KM = [25, 100, 300, 1000];

export function buildSearchUrl(baseUrl, { lat, lon, radiusKm }) {
  const url = new URL('/json/stations/search', baseUrl);
  url.searchParams.set('geo_lat', String(lat));
  url.searchParams.set('geo_long', String(lon));
  url.searchParams.set('geo_distance', String(radiusKm * 1000));
  url.searchParams.set('hidebroken', 'true');
  // 公開ページはHTTPSなので、http配信の局は混在コンテンツとしてブラウザに止められる。
  // 鳴らない局を並べても仕方がないため、APIの段階でhttps配信の局に絞る
  url.searchParams.set('is_https', 'true');
  url.searchParams.set('limit', '120');
  return url.toString();
}

export function normalizeStations(rows, origin, limit = 50) {
  const seen = new Set();

  return rows
    .filter((row) => {
      const lat = Number(row.geo_lat);
      const lon = Number(row.geo_long);
      return row.name && String(row.url_resolved || '').startsWith('https://')
        && row.geo_lat !== null && row.geo_long !== null
        && Number.isFinite(lat) && Number.isFinite(lon);
    })
    .map((row) => {
      const tags = String(row.tags || '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 3);
      return {
        name: String(row.name).trim(),
        url: String(row.url_resolved).trim(),
        stationuuid: String(row.stationuuid || ''),
        favicon: String(row.favicon || ''),
        tags,
        codec: String(row.codec || '').trim(),
        bitrate: Number(row.bitrate) || 0,
        lat: Number(row.geo_lat),
        lon: Number(row.geo_long),
        countrycode: String(row.countrycode || ''),
        homepage: String(row.homepage || ''),
        distanceKm: haversine(origin.lat, origin.lon, row.geo_lat, row.geo_long),
      };
    })
    .filter((station) => {
      const key = `${station.name.toLocaleLowerCase()}\u0000${station.url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.distanceKm - b.distanceKm || a.name.localeCompare(b.name, 'ja'))
    .slice(0, limit);
}

export function nextRadius(currentRadius) {
  const index = RADII_KM.indexOf(Number(currentRadius));
  return index >= 0 && index < RADII_KM.length - 1 ? RADII_KM[index + 1] : null;
}

/** fetchImplを注入できるミラーfallback付き検索。 */
export async function searchStations({ lat, lon, radiusKm }, fetchImpl = fetch, mirrors = MIRRORS) {
  let lastError;

  for (const baseUrl of mirrors) {
    try {
      const response = await fetchImpl(buildSearchUrl(baseUrl, { lat, lon, radiusKm }));
      if (response.status >= 500) {
        lastError = new Error(`${baseUrl}: HTTP ${response.status}`);
        continue;
      }
      if (!response.ok) throw new Error(`${baseUrl}: HTTP ${response.status}`);
      const rows = await response.json();
      return { stations: normalizeStations(rows, { lat, lon }), baseUrl };
    } catch (error) {
      // 4xxはリクエスト自体の問題なので別ミラーでも繰り返さない。
      if (/HTTP 4\d\d/.test(String(error?.message))) throw error;
      lastError = error;
    }
  }

  throw new AggregateError([lastError].filter(Boolean), 'Radio Browser APIの全ミラーに接続できませんでした');
}

export async function searchWithExpansion(
  { lat, lon, radiusKm, onExpand = () => {} },
  fetchImpl = fetch,
  mirrors = MIRRORS,
) {
  let radius = Number(radiusKm);

  while (true) {
    const result = await searchStations({ lat, lon, radiusKm: radius }, fetchImpl, mirrors);
    if (result.stations.length > 0) return { ...result, radiusKm: radius };
    const expanded = nextRadius(radius);
    if (expanded === null) return { ...result, radiusKm: radius };
    onExpand(radius, expanded);
    radius = expanded;
  }
}
