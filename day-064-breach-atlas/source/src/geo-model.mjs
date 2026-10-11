import catalog from './geo-regions.json' with { type: 'json' };

export const LOCATIONS = Object.freeze(Object.fromEntries(catalog.map(location => [location.code, Object.freeze(location)])));
export { LOCATION_IDS } from './geo-keys.mjs';
export const GLOBE_COLORS = Object.freeze({ intrusion: '#69e2d0', ransomware: '#cd9af5', insider: '#ffac93', exposure: '#f1ce85', loss: '#8fc8ff', mistake: '#f69ccc', unknown: '#b4bfd5' });
export const GEO_BASIS = Object.freeze({
  'named-prefecture': '組織名に明記された都道府県',
  'reported-state': 'HHSへ報告された組織の州・地域',
  'notification-jurisdiction': 'Californiaの通知対象の州',
  'country-only': '資料に関連する国のみ・地域未特定',
});
const prefectures = catalog.filter(location => location.country === 'JP' && location.level === 'subdivision');
const prefectureNames = new RegExp(prefectures.map(location => location.label).join('|'), 'g');

export function locateRecord(record) {
  if (record.region === 'japan') {
    const name = String(record.company || '').normalize('NFKC');
    const names = new Set([...name.matchAll(prefectureNames)].map(match => match[0]));
    const matches = prefectures.filter(location => names.has(location.label));
    return matches.length === 1 ? { code: matches[0].code, basis: 'named-prefecture' } : { code: 'JP', basis: 'country-only' };
  }
  if (record.registry === 'california') return { code: 'US-CA', basis: 'notification-jurisdiction' };
  const state = String(record.registerDetails?.state || '').trim().toUpperCase();
  if (record.registry === 'hhs' && LOCATIONS[`US-${state}`]) return { code: `US-${state}`, basis: 'reported-state' };
  return { code: 'US', basis: 'country-only' };
}

export function groupLocations(records, indices) {
  const groups = new Map();
  for (const index of indices) {
    const record = records[index], code = LOCATIONS[record.geoCode] ? record.geoCode : record.region === 'japan' ? 'JP' : 'US';
    if (!groups.has(code)) groups.set(code, { ...LOCATIONS[code], count: 0, indices: [], causes: {}, bases: {} });
    const group = groups.get(code);
    group.count++; group.indices.push(index);
    group.causes[record.cause] = (group.causes[record.cause] || 0) + 1;
    group.bases[record.geoBasis || 'country-only'] = (group.bases[record.geoBasis || 'country-only'] || 0) + 1;
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

export function geographicPosition(lat, lon, radius = 100) {
  const phi = lat * Math.PI / 180, theta = lon * Math.PI / 180;
  return [radius * Math.cos(phi) * Math.cos(theta), radius * Math.sin(phi), -radius * Math.cos(phi) * Math.sin(theta)];
}

export function projectedPosition(lat, lon) { return [(lon + 180) / 360 * 1000, (90 - lat) / 180 * 500]; }
