import { MOODS, walkRange, completeAnswers } from './choices.js';

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
    ...position, name, address: text(value.address, 360), category: text(value.category, 60),
    licenses: list(value.licenses), attributions: list(value.attributions),
  };
}

const cafeName = /カフェ|珈琲|コーヒー|喫茶|茶房|ベーカリー|cafe|coffee|bakery/i;
// Bar-like syllables inside hamburger or a family restaurant name are not drinking venues.
const drinkName = /居酒屋|酒場|立呑|立ち飲み|ビアホール|ビアガーデン|ワインバー|ダイニングバー|ショットバー|ビアバー|(?:^|[\s・「『])バー(?!ガー|グ|ミヤン|ベキュー|ム|コード|ゲン)|バー(?:$|[\s・」』])|(?:^|[\s・「『])バル(?:$|[\s・」』])|(?:^|[\s・])パブ|\bbar\b|\bpub\b/i;
const mealName = /レストラン|食堂|定食|ラーメン|らーめん|蕎麦|そば|うどん|寿司|鮨|焼肉|焼き肉|中華|カレー|ダイニング|restaurant/i;
const outsideName = /公園|緑地|庭園|\bpark\b|\bgarden\b/i;

function matches(place, mood) {
  const category = place.category;
  if (mood === 'outside') {
    return ['tourism', 'public_facility', 'unknown', ''].includes(category) && outsideName.test(place.name)
      && !/駅|公園前|駐車|管理|事務|売店|営業所|ショップ|ホテル|旅館|不動産/.test(place.name);
  }
  if (mood === 'cafe') return ['cafe', 'bakery'].includes(category)
    || (['restaurant', 'unknown', ''].includes(category) && cafeName.test(place.name));
  if (mood === 'drink') return category === 'bar_izakaya'
    || (['restaurant', 'unknown', ''].includes(category) && drinkName.test(place.name));
  return ['restaurant', 'fast_food'].includes(category) && !drinkName.test(place.name)
    || (['unknown', ''].includes(category) && mealName.test(place.name));
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
export function recommend(values, center, answers, companion) {
  if (!point(center) || !completeAnswers(answers) || !Array.isArray(values)) return [];
  const radius = walkRange(answers.walk).radius;
  const candidates = values.map(facility).filter(Boolean)
    .filter((place) => matches(place, answers.mood))
    .map((place) => ({ ...place, distance: distanceMeters(center, place) }))
    .filter((place) => place.distance <= radius)
    .sort((a, b) => (a.distance + preferencePenalty(a, answers, companion))
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
    bar_izakaya: '居酒屋・バー' })[place.category] || MOODS[mood]?.label || '施設';
}

export function mapsUrl(place) {
  const position = point(place);
  if (!position) throw new TypeError('Invalid destination');
  return `https://www.google.com/maps/dir/?${new URLSearchParams({
    api: '1', destination: `${position.lat},${position.lng}`, travelmode: 'walking',
  })}`;
}
