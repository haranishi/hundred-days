const EARTH_RADIUS_M = 6371008.8;

const radians = (degrees) => degrees * Math.PI / 180;

export function haversineDistance(from, to) {
  const latDelta = radians(to.lat - from.lat);
  const lngDelta = radians(to.lng - from.lng);
  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(lngDelta / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(meters) {
  // 先に丸めてから単位を決める（999.6mを「1000m」と書かないため）
  const rounded = Math.round(meters);
  if (rounded < 1000) return `${rounded}m`;
  return `${(rounded / 1000).toFixed(1)}km`;
}

export function routeUrl(lat, lng) {
  const params = new URLSearchParams({ api: '1', destination: `${lat},${lng}` });
  return `https://www.google.com/maps/dir/?${params}`;
}

export function addDistances(items, center) {
  return items.map((item) => ({ ...item, distance: haversineDistance(center, item) }))
    .sort((a, b) => a.distance - b.distance);
}
