import { bearing, haversineDistance } from './geo.js';

export function feeClass(tags = {}) {
  if (tags.internet_access === 'no') return null;
  const fee = tags['internet_access:fee'];
  if (fee === 'no' || tags.wifi === 'free') return 'free';
  if (fee === 'customers') return 'customers';
  if (fee === 'yes') return 'paid';
  return 'unknown';
}

export function categoryOf(tags = {}) {
  if (tags.amenity === 'cafe') return 'カフェ';
  if (tags.shop === 'convenience') return 'コンビニ';
  if (tags.railway === 'station' || tags.public_transport === 'station') return '駅';
  if (tags.amenity === 'library') return '図書館';
  if (['hotel', 'hostel', 'guest_house'].includes(tags.tourism)) return '宿';
  if (tags.amenity === 'restaurant') return '飲食店';
  if (tags.amenity === 'fast_food') return 'ファストフード';
  if (['townhall', 'community_centre', 'public_building'].includes(tags.amenity)) return '公共施設';
  if (tags.amenity === 'bank') return '銀行';
  if (tags.shop) return '店';
  if (tags.office) return 'オフィス';
  return 'その他';
}

export function displayName(tags = {}) {
  if (tags['name:ja']) return tags['name:ja'];
  if (tags.name) return tags.name;
  if (tags.brand) return tags.brand;
  const category = categoryOf(tags);
  return category === 'その他' ? '名前なし' : category;
}

export function toSpot(element) {
  const tags = element?.tags || {};
  const fee = feeClass(tags);
  if (!fee) return null;
  const lat = element?.type === 'node' ? element.lat : element?.center?.lat;
  const lng = element?.type === 'node' ? element.lon : element?.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    id: `${element.type}/${element.id}`,
    name: displayName(tags),
    category: categoryOf(tags),
    fee,
    ssid: tags['internet_access:ssid'] || null,
    lat,
    lng,
    hours: tags.opening_hours || null,
  };
}

export function normalizeElements(elements = []) {
  return elements.map(toSpot).filter(Boolean);
}

export function sortByDistance(spots, origin) {
  return spots.map((spot) => ({
    ...spot,
    distance: haversineDistance(origin, spot),
    bearing: bearing(origin, spot),
  }))
    .sort((a, b) => a.distance - b.distance);
}

export function mapsUrl(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;
}

export function summarize(spots = []) {
  const summary = { total: spots.length, municipal: 0, osm: 0, chain: 0 };
  for (const spot of spots) if (Object.hasOwn(summary, spot.layer)) summary[spot.layer] += 1;
  return summary;
}

export function chainMessage(chain) {
  if (!chain) return '';
  const scope = chain.tier === 'partial' ? '一部店舗で無料Wi-Fiを' : '無料Wi-Fiを';
  return `${chain.label}は公式サイトで${scope}案内しています（${chain.checkedAt}時点）。${chain.condition}。ただし、この地点で実際に使えるかは確認していません`;
}

export function chainStatus(chain) {
  return chain?.tier === 'all' ? '公式に全店規模で案内' : '一部店舗・条件つき';
}
