const EARTH_RADIUS_METERS = 6_371_000;

const radians = (degrees) => (degrees * Math.PI) / 180;

export function haversineMeters(lat1, lon1, lat2, lon2) {
  const deltaLat = radians(lat2 - lat1);
  const deltaLon = radians(lon2 - lon1);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(deltaLon / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function bearingDeg(lat1, lon1, lat2, lon2) {
  if (lat1 === lat2 && lon1 === lon2) return 0;
  const startLat = radians(lat1);
  const endLat = radians(lat2);
  const deltaLon = radians(lon2 - lon1);
  const y = Math.sin(deltaLon) * Math.cos(endLat);
  const x = Math.cos(startLat) * Math.sin(endLat)
    - Math.sin(startLat) * Math.cos(endLat) * Math.cos(deltaLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export function compass8(degrees) {
  const labels = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"];
  const normalized = ((degrees % 360) + 360) % 360;
  return labels[Math.floor((normalized + 22.5) / 45) % 8];
}

export function formatDistance(meters) {
  if (meters < 1000) return `約${Math.round(meters / 10) * 10}m`;
  return `約${(Math.round(meters / 100) / 10).toFixed(1)}km`;
}

export function pickRange(distances) {
  if (distances.length === 0) return null;
  const sorted = [...distances].sort((a, b) => a - b);
  const target = sorted[Math.min(9, sorted.length - 1)];
  return [300, 600, 1000, 2000, 5000, 10000, 20000].find((range) => target <= range) ?? 20000;
}

export function nearestN(points, lat, lon, n) {
  return points
    .map(([pointLat, pointLon, typeCode], index) => ({
      lat: pointLat,
      lon: pointLon,
      typeCode,
      distance: haversineMeters(lat, lon, pointLat, pointLon),
      bearing: bearingDeg(lat, lon, pointLat, pointLon),
      index,
    }))
    .sort((a, b) => a.distance - b.distance || a.index - b.index)
    .slice(0, Math.max(0, n))
    .map(({ index, ...point }) => point);
}

export function typeLabel(code, types) {
  return Number.isInteger(code) && code >= 0 && code < types?.length ? types[code] : "不明";
}
