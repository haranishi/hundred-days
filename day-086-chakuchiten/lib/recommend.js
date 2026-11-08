import { walkRange, completeAnswers, MAX_SEARCH_RADIUS } from './choices.js';
import { selectedDish, selectedGroup, dishMatchScore } from './food.js';

function coordinate(value) {
  if (!['string', 'number'].includes(typeof value) || String(value).trim() === '') return NaN;
  return Number(value);
}

export function point(value) {
  const lat = coordinate(value?.lat);
  const lng = coordinate(value?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { lat, lng } : null;
}

export function distanceMeters(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function walkMinutes(meters) {
  return Math.max(1, Math.ceil(meters * 1.3 / 80));
}

const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const list = (value) => Array.isArray(value) ? value.filter((item) => typeof item === 'string').slice(0, 30) : [];
export function facility(value) {
  const position = point(value);
  const name = text(value?.name, 180);
  // Town-level geocodes cannot support a 3-minute walking suggestion.
  if (!position || !name || (Number(value.level) > 0 && Number(value.level) <= 3)) return null;
  return {
    ...position, name, address: text(value.address, 360), category: text(value.category, 60), brand: text(value.brand, 180),
    licenses: list(value.licenses), attributions: list(value.attributions),
  };
}

function matches(place) {
  return ['tourism', 'public_facility', 'unknown', ''].includes(place.category)
    && /公園|緑地|庭園|\bpark\b|\bgarden\b/i.test(place.name)
    && !/駅|公園前|駐車|管理|事務|売店|営業所|ショップ|ホテル|旅館|不動産/.test(place.name);
}

function preferencePenalty(place, answers, companion) {
  let penalty = 0;
  if (answers.space === 'quiet') {
    if (place.category === 'fast_food' || place.category === 'bakery') penalty += 25;
  } else if (answers.mood === 'cafe' && place.category === 'bakery') penalty -= 10;
  if (['family', 'partner'].includes(companion) && place.category === 'fast_food') penalty += 10;
  return penalty;
}

const nameKey = (value) => value.normalize('NFKC').toLowerCase().replace(/[\s・･.,、。ー‐-]/g, '');
function matchScore(place, answers, scope) {
  if (answers.mood === 'outside') return matches(place) ? 1 : 0;
  if (scope !== 'genre') return dishMatchScore(place, answers);
  return Math.max(...selectedGroup(answers).dishes.map((dish) => dishMatchScore(place, { ...answers, dish: dish.id })));
}

export function recommend(values, center, answers, companion, options = {}) {
  if (!point(center) || !completeAnswers(answers) || !Array.isArray(values)) return [];
  const radius = options.radius ?? walkRange(answers.walk).radius;
  const scope = options.scope ?? 'dish';
  if (!Number.isFinite(radius) || radius <= 0 || radius > MAX_SEARCH_RADIUS || !['dish', 'genre'].includes(scope)
    || (scope === 'genre' && answers.mood === 'outside')) return [];
  const candidates = values.map(facility).filter(Boolean)
    .map((place) => ({ ...place, matchScore: matchScore(place, answers, scope), distance: distanceMeters(center, place) }))
    .filter((place) => place.matchScore > 0)
    .filter((place) => place.distance <= radius)
    .sort((a, b) => (b.matchScore - a.matchScore)
      || (a.distance + preferencePenalty(a, answers, companion))
      - (b.distance + preferencePenalty(b, answers, companion)) || a.distance - b.distance);
  const unique = [];
  for (const place of candidates) {
    if (unique.some((prior) => nameKey(prior.name) === nameKey(place.name) && distanceMeters(prior, place) < 50)) continue;
    unique.push({ ...place, minutes: walkMinutes(place.distance) });
    if (unique.length === 3) break;
  }
  return unique;
}

export function categoryLabel(place, mood) {
  return ({ restaurant: '飲食店', cafe: 'カフェ', fast_food: 'ファストフード', bakery: 'ベーカリー',
    bar_izakaya: '居酒屋・バー', grocery: '食品店', retail_other: '物販店',
    tourism: '公園・観光施設', public_facility: '公共施設' })[place.category] || '種類不明';
}

export function mapsUrl(place) {
  const position = point(place);
  if (!position) throw new TypeError('Invalid destination');
  return `https://www.google.com/maps/dir/?${new URLSearchParams({
    api: '1', destination: `${position.lat},${position.lng}`, travelmode: 'walking',
  })}`;
}

export function mapsSearchUrl(center, answers) {
  const position = point(center);
  const query = selectedDish(answers)?.label || (answers.mood === 'outside' ? '公園' : '');
  if (!position || !query) throw new TypeError('Invalid search');
  return `https://www.google.com/maps/search/?${new URLSearchParams({
    api: '1', query: `${query} near ${position.lat},${position.lng}`,
  })}`;
}
