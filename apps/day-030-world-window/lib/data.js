import { zoneLabel } from './zones.js';

const EARTH_RADIUS_KM = 6371.0088;
const FIELDS = {
  i: 'id', a: 'lat', o: 'lon', k: 'kind', n: 'name', u: 'url', c: 'country',
  p: 'operator', d: 'direction', z: 'zone', s: 'description', r: 'ref', w: 'website', t: 'checkDate',
};

const radians = (degrees) => degrees * Math.PI / 180;

function distanceKm(camera, center) {
  const latitude = radians(camera.lat - center.lat);
  const longitude = radians(camera.lon - center.lon);
  const value = Math.sin(latitude / 2) ** 2
    + Math.cos(radians(center.lat)) * Math.cos(radians(camera.lat)) * Math.sin(longitude / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function parseCameras(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  const cameras = (data?.cameras || []).map((compact) => {
    const camera = {};
    for (const [short, long] of Object.entries(FIELDS)) camera[long] = compact[short] ?? null;
    return camera;
  });
  return {
    meta: {
      generatedAt: data?.generatedAt ?? null,
      osmTimestamp: data?.osmTimestamp ?? null,
      count: data?.count ?? cameras.length,
      kinds: data?.kinds ?? {},
    },
    cameras,
  };
}

export function filterByKinds(cameras, kindsSet) {
  return cameras.filter((camera) => kindsSet.has(camera.kind));
}

export function inBounds(cameras, { north, south, east, west }) {
  return cameras.filter(({ lat, lon }) => lat >= south && lat <= north
    && (east >= west ? lon >= west && lon <= east : lon >= west || lon <= east));
}

/* 一覧は「その場で見られるもの」を先に見せたい。データの3分の2は page（提供元へのリンクだけ）で、
   距離だけで並べると初見の50件が全部リンクになってしまう。種別を先に、その中で近い順に並べる。 */
const KIND_ORDER = { yt: 0, hls: 0, img: 1, windy: 1, page: 2 };
const kindOrder = (kind) => KIND_ORDER[kind] ?? 3;

export function rankForList(cameras, center, limit) {
  const sorted = cameras
    .map((camera, order) => ({ camera, order, kind: kindOrder(camera.kind), distance: distanceKm(camera, center) }))
    .sort((left, right) => left.kind - right.kind || left.distance - right.distance || left.order - right.order);
  const count = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : sorted.length;
  return { items: sorted.slice(0, count).map(({ camera }) => camera), total: sorted.length };
}

/* 名前の無いカメラが5千件あり、そのまま出すと一覧が「名前のないカメラ」だらけになる。
   ref → 区分＋国 → 国 の順に、手元の情報で見分けのつく名前を組み立てる。 */
export function displayName(camera, countryNames) {
  if (camera?.name) return camera.name;
  if (camera?.ref) return `カメラ ${camera.ref}`;
  const country = (countryNames || {})[camera?.country]?.ja || camera?.country || '';
  if (!country) return '名前のないカメラ';
  return camera?.zone ? `${zoneLabel(camera.zone)}カメラ（${country}）` : `カメラ（${country}）`;
}

export function pickRandom(cameras, kindsSet, rng = Math.random) {
  const enabled = filterByKinds(cameras, kindsSet);
  const rich = enabled.filter(({ kind }) => ['yt', 'img', 'hls'].includes(kind));
  const pool = rich.length ? rich : enabled.filter(({ kind }) => kind === 'page');
  if (!pool.length) return null;
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(rng() * pool.length)));
  return pool[index];
}

export function normalizeText(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().trim();
}

/* 「Madrid」で名前に Madrid の無い候補が並ぶ（運営者名で当たっている）と、なぜ出たのか分からない。
   どの項目で当たったかを一緒に返し、候補の2段目に理由を出せるようにする。
   優先は 名前 → 運営者 → ref → 国。 */
export function searchCameras(cameras, query, countryNames, limit = 20) {
  const needle = normalizeText(query);
  if (!needle) return [];
  const names = countryNames || {};
  const hit = (value) => normalizeText(value).includes(needle);
  const found = [];
  const max = Math.max(0, limit);
  for (const camera of cameras) {
    if (found.length >= max) break;
    const country = names[camera.country] || {};
    const matched = hit(camera.name) ? 'name'
      : hit(camera.operator) ? 'operator'
        : hit(camera.ref) ? 'ref'
          : (hit(country.ja) || hit(country.en)) ? 'country' : null;
    if (matched) found.push({ camera, matched });
  }
  return found;
}
