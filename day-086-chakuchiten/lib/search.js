import { completeAnswers, walkRange, MAX_SEARCH_RADIUS } from './choices.js';
import { point, recommend } from './recommend.js';
import { PoiError, searchNearby } from './openpoi.js';

// Only a successful empty response advances the search. Network failures stay errors.
export async function findRecommendations(center, answers, companion, { signal, fetcher, onProgress, now = Date.now } = {}) {
  if (!point(center) || !completeAnswers(answers)) throw new PoiError('input');
  const preferredRadius = walkRange(answers.walk).radius;
  const steps = [preferredRadius, 1500, MAX_SEARCH_RADIUS].map((radius) => ({ radius, scope: 'dish' }));
  if (answers.mood !== 'outside') steps.push({ radius: MAX_SEARCH_RADIUS, scope: 'genre' });
  const deadline = now() + 12000;
  for (const step of steps) {
    if (signal?.aborted) throw new PoiError('aborted');
    const remaining = deadline - now();
    if (remaining <= 0) throw new PoiError('timeout');
    onProgress?.(step);
    const values = await searchNearby(center, answers, { ...step, signal, fetcher, timeout: Math.min(10000, remaining) });
    if (signal?.aborted) throw new PoiError('aborted');
    if (now() >= deadline) throw new PoiError('timeout');
    const places = recommend(values, center, answers, companion, step);
    if (places.length) return { places, preferredRadius, ...step };
  }
  return { places: [], preferredRadius, radius: MAX_SEARCH_RADIUS, scope: answers.mood === 'outside' ? 'dish' : 'genre' };
}
