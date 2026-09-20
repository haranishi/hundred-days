/* 距離・方角と、その書き方。距離は直線距離で、道のりではない（画面にもそう書いてある） */
const rad = (n) => n * Math.PI / 180;
const deg = (n) => n * 180 / Math.PI;

export function distanceM(a, b) {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export const inJapan = (p) => Boolean(p) && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng))
  && p.lat >= 20 && p.lat <= 46.5 && p.lng >= 122 && p.lng <= 154;

/* 1km未満は10m単位。四捨五入で1000mに届いたらkmに繰り上げる（「1000m」と出さない） */
export function formatDistance(m) {
  const tens = Math.round(m / 10) * 10;
  return tens < 1000 ? `${tens}m` : `${(m / 1000).toFixed(1)}km`;
}

/* 北を0度として東回りの方位角 */
export function bearingDeg(from, to) {
  const lat1 = rad(from.lat), lat2 = rad(to.lat), dLng = rad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/* 8方位。真北は 337.5°以上〜22.5°未満で、境目は次の方位に渡す（22.5°は北東） */
export const DIRECTIONS = ['真北', '北東', '真東', '南東', '真南', '南西', '真西', '北西'];
export function directionName(bearing) {
  const turn = ((Number(bearing) % 360) + 360) % 360;
  return DIRECTIONS[Math.floor(((turn + 22.5) % 360) / 45)];
}

// 半径を線で描くための多角形。地図に出すのは「半径◯m」を目で確かめられるようにするため
export function circleRing(point, radiusM, steps = 96) {
  const ring = [];
  for (let i = 0; i <= steps; i += 1) {
    const angle = rad(i * 360 / steps);
    const lat = point.lat + (radiusM / 111320) * Math.cos(angle);
    const lng = point.lng + (radiusM / (111320 * Math.cos(rad(point.lat)))) * Math.sin(angle);
    ring.push([lng, lat]);
  }
  return ring;
}
