/* 距離と、日本の範囲の判定。距離は直線距離で、経路ではない（画面にもそう書いてある） */
const rad = (n) => n * Math.PI / 180;

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

// 徒歩の目安は80m/分。切り上げるので、10mでも「1分」になる
export const walkMinutes = (m) => Math.ceil(m / 80);
export const walkText = (m) => `徒歩およそ${walkMinutes(m)}分`;
