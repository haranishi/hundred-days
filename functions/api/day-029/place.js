/* Nominatim用中継。識別可能なUser-Agentを付け、結果を7日キャッシュする。 */
const UPSTREAM = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'hundred-days-day029 (+https://hundred-days.pages.dev/day-029-nearby-wifi/)';
export const TIMEOUT_MS = 15_000;
const LIMIT = 5;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

export function normalizeQuery(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.normalize('NFKC').replace(CONTROL_CHARS, '').trim();
  return normalized.length >= 2 && normalized.length <= 40 ? normalized : null;
}

export function trimPlaces(items = []) {
  return items.map((item) => ({
    name: String(item?.display_name ?? ''), lat: Number(item?.lat), lng: Number(item?.lon),
    type: String(item?.addresstype ?? item?.type ?? ''),
  })).filter((place) => place.name && Number.isFinite(place.lat) && Number.isFinite(place.lng)).slice(0, LIMIT);
}

export function upstreamQuery(query) {
  return query.endsWith('駅') && query.length > 1 && !/\s/.test(query.at(-2))
    ? `${query.slice(0, -1)} 駅`
    : query;
}

const json = (body, status, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': status === 200 ? 'public, max-age=3600, s-maxage=604800' : 'no-store',
    ...extra,
  },
});

export async function onRequestGet(context, { fetchImpl = fetch } = {}) {
  const url = new URL(context.request.url);
  const query = normalizeQuery(url.searchParams.get('q'));
  if (!query) return json({ error: 'invalid_query' }, 400);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheUrl = new URL(url.origin + url.pathname);
  cacheUrl.search = `?q=${encodeURIComponent(query)}`;
  const cacheRequest = new Request(cacheUrl.toString(), { method: 'GET' });
  if (cache) {
    const hit = await cache.match(cacheRequest);
    if (hit) return hit;
  }
  const target = new URL(UPSTREAM);
  target.search = new URLSearchParams({
    q: upstreamQuery(query), format: 'jsonv2', limit: String(LIMIT), 'accept-language': 'ja', countrycodes: 'jp',
  }).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const upstream = await fetchImpl(target.toString(), {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: controller.signal,
    });
    if ([403, 429, 503].includes(upstream.status)) return json({ error: 'rate_limited' }, 429, { 'Retry-After': '30' });
    if (!upstream.ok) return json({ error: 'upstream_unavailable' }, 502);
    const response = json({
      places: trimPlaces(await upstream.json()),
      source: { name: 'Nominatim / OpenStreetMap contributors', license: 'ODbL 1.0', url: 'https://www.openstreetmap.org/copyright' },
    }, 200);
    if (cache) await cache.put(cacheRequest, response.clone());
    return response;
  } catch {
    return json({ error: 'upstream_unavailable' }, 502);
  } finally {
    clearTimeout(timer);
  }
}
