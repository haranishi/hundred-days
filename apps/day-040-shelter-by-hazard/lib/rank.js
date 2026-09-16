import { distanceM } from './geo.js';

/* 同じ場所が8種類のタイルに別々に載る。名前と座標（小数5桁）で同じものとみなし、
   「どのタイルに載っていたか」と properties の disaster1〜8 を足し合わせて持つ。
   キーが欠けている災害は、その場所では指定されていないという意味 */
export const placeId = (name, lng, lat) => JSON.stringify([name, lng.toFixed(5), lat.toFixed(5)]);

export function mergeTiles(entries) {
  const places = new Map();
  for (const entry of entries) {
    for (const feature of entry?.features ?? []) {
      const coordinates = feature?.geometry?.coordinates;
      if (!Array.isArray(coordinates)) continue;
      const lng = Number(coordinates[0]), lat = Number(coordinates[1]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      const source = feature.properties ?? {};
      const name = typeof source.name === 'string' ? source.name : '';
      const id = placeId(name, lng, lat);
      if (!places.has(id)) {
        places.set(id, {
          id, name, lng, lat,
          // 名前・住所・備考は原文のまま持つ。言い換えも整形もしない
          address: typeof source.address === 'string' ? source.address : '',
          remarks: typeof source.remarks === 'string' ? source.remarks : '',
          hazards: new Set(),
        });
      }
      const place = places.get(id);
      if (Number.isInteger(entry.hazard)) place.hazards.add(entry.hazard);
      for (let n = 1; n <= 8; n += 1) if (source[`disaster${n}`] === 1) place.hazards.add(n);
    }
  }
  return [...places.values()];
}

export const hazardsOf = (place, exclude) => [...place.hazards].filter((n) => n !== exclude).sort((a, b) => a - b);

/* 使える場所は近い順に5件。
   n = いちばん近い「使える場所」より近い、使えない場所の数。
   使えない一覧 = 使える一覧の最後より近い、使えない場所（近い順に8件＋「ほか◯か所」） */
export function rankPlaces(places, point, hazard, options = {}) {
  const usableLimit = options.usableLimit ?? 5;
  const unusableLimit = options.unusableLimit ?? 8;
  const sorted = places
    .map((place) => ({ ...place, distance: distanceM(point, place) }))
    .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name, 'ja'));
  const everyUsable = sorted.filter((place) => place.hazards.has(hazard));
  if (!everyUsable.length) return { usable: [], nearerUnusable: 0, unusable: [], unusableMore: 0 };
  const usable = everyUsable.slice(0, usableLimit);
  const nearerUnusable = sorted.filter((p) => !p.hazards.has(hazard) && p.distance < everyUsable[0].distance).length;
  const reach = usable[usable.length - 1].distance;
  const within = sorted.filter((p) => !p.hazards.has(hazard) && p.distance < reach);
  return {
    usable,
    nearerUnusable,
    unusable: within.slice(0, unusableLimit),
    unusableMore: Math.max(0, within.length - unusableLimit),
  };
}
