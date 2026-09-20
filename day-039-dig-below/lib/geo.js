const rad = (n) => n * Math.PI / 180;
export function distanceKm(a, b) {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
export const inJapan = (p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng))
  && p.lat >= 20 && p.lat <= 46.5 && p.lng >= 122 && p.lng <= 154;
export function nearest(records, point) {
  return [...new Map(records.filter(inJapan).map((r) => [r.oid, r])).values()]
    .map((r) => ({ ...r, distance: distanceKm(point, r) }))
    .sort((a, b) => a.distance - b.distance).slice(0, 40);
}
export const formatDistance = (km) => km < 0.1 ? '0.1km未満' : `${km.toFixed(1)}km`;
export function bounds(point, half) {
  // 正確な座標を復元できないよう、中心も範囲も小数1桁に丸める。
  const lat = Math.round(point.lat * 10) / 10, lng = Math.round(point.lng * 10) / 10;
  return Object.fromEntries(Object.entries({ lngmin: lng - half, lngmax: lng + half,
    latmin: lat - half, latmax: lat + half }).map(([key, value]) => [key, value.toFixed(1)]));
}
