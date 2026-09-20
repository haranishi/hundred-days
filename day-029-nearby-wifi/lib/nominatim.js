export const ENDPOINT = '/api/day-029/place';

export function buildRequestUrl(query) {
  return `${ENDPOINT}?q=${encodeURIComponent(query)}`;
}

export function shortPlaceName(name) {
  return String(name || '').split(',').map((part) => part.trim()).filter(Boolean).slice(0, 3).join('、');
}

export function placeLabel(name) {
  return String(name || '').split(',').map((part) => part.trim()).find(Boolean) || '地名検索';
}

export async function searchPlaces(query, fetchFn = fetch) {
  const response = await fetchFn(buildRequestUrl(query), { headers: { Accept: 'application/json' } });
  if (response.status === 429 || response.status === 503) {
    const error = new Error('upstream busy');
    error.rateLimited = true;
    throw error;
  }
  if (!response.ok) throw new Error(`place ${response.status}`);
  const body = await response.json();
  if (!Array.isArray(body?.places)) return [];
  return body.places.filter((place) => place && typeof place.name === 'string'
    && Number.isFinite(place.lat) && Number.isFinite(place.lng));
}
