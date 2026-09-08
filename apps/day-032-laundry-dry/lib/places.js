/* 干す場所の候補（1,741市区町村）。地名から座標を引く外部サービスを使わずに済ませるために同梱する。
   Day 31からの解禁は「外部API1個」なので、その1個は天気に使い切っている。 */

/** 都道府県ごとにまとめる。並びはコード順＝北から南 */
export function groupByPref(places) {
  const groups = [];
  const index = new Map();
  for (const place of places) {
    let group = index.get(place.p);
    if (!group) {
      group = { pref: place.p, places: [] };
      index.set(place.p, group);
      groups.push(group);
    }
    group.places.push(place);
  }
  return groups;
}

export const findByCode = (places, code) => places.find((place) => place.c === code) || null;

/** 2点の距離（km）。並べ替えに使うだけなので球面の近似で足りる */
export function distanceKm(a, b) {
  const toRad = Math.PI / 180;
  const meanLat = ((a.lat + b.lat) / 2) * toRad;
  const dx = (a.lon - b.lon) * toRad * Math.cos(meanLat);
  const dy = (a.lat - b.lat) * toRad;
  return Math.sqrt(dx * dx + dy * dy) * 6371;
}

/** 現在地にいちばん近い市区町村。「現在地（秋田市あたり）」と画面に出すために使う */
export function nearest(places, point) {
  let best = null;
  let bestDistance = Infinity;
  for (const place of places) {
    const distance = distanceKm(place, point);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = place;
    }
  }
  return best ? { place: best, km: bestDistance } : null;
}

/** 「秋田県 秋田市」。政令市の区は持っていないので市までで足りる */
export const fullName = (place) => (place.p === place.n ? place.n : `${place.p}${place.n}`);
