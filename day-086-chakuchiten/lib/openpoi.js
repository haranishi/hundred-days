import { MOODS, walkRange, completeAnswers } from './choices.js';
import { point } from './recommend.js';

const BASE = 'https://api.openpoiapi.com';
export class PoiError extends Error {
  constructor(code) { super(code); this.name = 'PoiError'; this.code = code; }
}

async function request(path, params, { signal, fetcher = fetch, timeout = 10000 } = {}) {
  if (signal?.aborted) throw new PoiError('aborted');
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeout);
  try {
    const url = new URL(path, BASE);
    url.search = new URLSearchParams(params).toString();
    const response = await fetcher(url, {
      signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error',
    });
    if (!response.ok) throw new PoiError(response.status === 429 ? 'busy' : 'http');
    const body = await response.json();
    if (!body || typeof body !== 'object') throw new PoiError('invalid');
    return body;
  } catch (error) {
    if (timedOut) throw new PoiError('timeout');
    if (signal?.aborted) throw new PoiError('aborted');
    if (error instanceof PoiError) throw error;
    throw new PoiError(error instanceof SyntaxError ? 'invalid' : 'network');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

export async function searchNearby(center, answers, options) {
  const position = point(center);
  if (!position || !completeAnswers(answers)) throw new PoiError('input');
  const body = await request('/v1/search', {
    q: MOODS[answers.mood].query, center: `${position.lng},${position.lat}`,
    radius: String(walkRange(answers.walk).radius), limit: '100',
  }, options);
  if (!Array.isArray(body.results)) throw new PoiError('invalid');
  return body.results.slice(0, 200);
}

export async function searchPlaces(query, options) {
  const q = typeof query === 'string' ? query.trim() : '';
  if (q.length < 2 || q.length > 80) throw new PoiError('input');
  const body = await request('/v1/suggest', { q, limit: '5' }, options);
  if (!Array.isArray(body.suggestions)) throw new PoiError('invalid');
  return body.suggestions.slice(0, 5).filter((place) => point(place)
    && typeof place.name === 'string' && place.name.trim());
}
