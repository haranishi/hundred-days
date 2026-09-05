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
  const rounded = Math.round(meters);
  return rounded < 1000 ? `${rounded}m` : `${(rounded / 1000).toFixed(1)}km`;
}

export function bearing(from, to) {
  const fromLat = radians(from.lat);
  const toLat = radians(to.lat);
  const lngDelta = radians(to.lng - from.lng);
  const y = Math.sin(lngDelta) * Math.cos(toLat);
  const x = Math.cos(fromLat) * Math.sin(toLat)
    - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(lngDelta);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export function directionLabel(degrees) {
  if (!Number.isFinite(degrees)) return '';
  const labels = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
  return labels[Math.round(((degrees % 360) + 360) % 360 / 45) % labels.length];
}
