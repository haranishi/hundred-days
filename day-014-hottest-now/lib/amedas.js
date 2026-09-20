/* 気象庁アメダスの配信データを、画面に出せる形へ変える計算だけを置く。
   通信もDOMもここには入れない（テストから直接呼べるようにするため）。 */

/* 地点番号の上2桁は気象庁の府県ブロック。表そのものに都道府県名は入っていないので、
   ここで対応づける。県庁所在地47地点と全国の著名地点45地点で照合し、不一致0を確認した。 */
export const PREFECTURE_BLOCKS = {
  11: '北海道', 12: '北海道', 13: '北海道', 14: '北海道', 15: '北海道', 16: '北海道', 17: '北海道',
  18: '北海道', 19: '北海道', 20: '北海道', 21: '北海道', 22: '北海道', 23: '北海道', 24: '北海道',
  31: '青森県', 32: '秋田県', 33: '岩手県', 34: '宮城県', 35: '山形県', 36: '福島県',
  40: '茨城県', 41: '栃木県', 42: '群馬県', 43: '埼玉県', 44: '東京都', 45: '千葉県', 46: '神奈川県',
  48: '長野県', 49: '山梨県',
  50: '静岡県', 51: '愛知県', 52: '岐阜県', 53: '三重県',
  54: '新潟県', 55: '富山県', 56: '石川県', 57: '福井県',
  60: '滋賀県', 61: '京都府', 62: '大阪府', 63: '兵庫県', 64: '奈良県', 65: '和歌山県',
  66: '岡山県', 67: '広島県', 68: '島根県', 69: '鳥取県',
  71: '徳島県', 72: '香川県', 73: '愛媛県', 74: '高知県',
  81: '山口県', 82: '福岡県', 83: '大分県', 84: '長崎県', 85: '佐賀県', 86: '熊本県',
  87: '宮崎県', 88: '鹿児島県',
  91: '沖縄県', 92: '沖縄県', 93: '沖縄県', 94: '沖縄県',
};

/** 緯度経度は [度, 分] で配信される（分は小数）。 */
export function toDegrees(pair) {
  if (!Array.isArray(pair) || pair.length < 2) return NaN;
  const [degree, minute] = pair;
  if (!Number.isFinite(degree) || !Number.isFinite(minute)) return NaN;
  return degree + minute / 60;
}

export function prefectureOf(id) {
  return PREFECTURE_BLOCKS[String(id).slice(0, 2)] ?? '';
}

/* elems の1桁目が気温の観測有無。全1,286地点のうち370地点は雨量しか測っていない。
   これは故障や欠測ではなく、最初から温度計が無い。 */
export function observesTemperature(entry) {
  return typeof entry?.elems === 'string' && entry.elems[0] === '1';
}

/* 値は [観測値, 品質フラグ] で来る。フラグ0以外は正常に観測できていないので採らない。 */
export function readTemperature(record) {
  const temp = record?.temp;
  if (!Array.isArray(temp) || temp.length < 2) return null;
  const [value, flag] = temp;
  return flag === 0 && Number.isFinite(value) ? value : null;
}

export function buildStations(table, observations = {}) {
  return Object.entries(table ?? {})
    .map(([id, entry]) => ({
      id,
      name: entry.kjName ?? '',
      kana: entry.knName ?? '',
      prefecture: prefectureOf(id),
      latitude: toDegrees(entry.lat),
      longitude: toDegrees(entry.lon),
      altitude: Number.isFinite(entry.alt) ? entry.alt : null,
      hasThermometer: observesTemperature(entry),
      temperature: readTemperature(observations?.[id]),
    }))
    .filter((station) => station.name && Number.isFinite(station.latitude) && Number.isFinite(station.longitude));
}

/* 同じ気温が並ぶので順位は競技方式（1, 2, 2, 4）にする。
   0.1℃刻みで900地点以上あるため、同率はほぼ必ず起きる。 */
export function rankByTemperature(stations) {
  const measured = stations
    .filter((station) => station.temperature !== null)
    .sort(
      (a, b) =>
        b.temperature - a.temperature ||
        a.kana.localeCompare(b.kana, 'ja') ||
        a.id.localeCompare(b.id),
    );

  let rank = 0;
  let previous = null;
  return measured.map((station, index) => {
    if (previous === null || station.temperature !== previous) rank = index + 1;
    previous = station.temperature;
    return { ...station, rank };
  });
}

export function rankSummary(ranked, id) {
  const found = ranked.find((station) => station.id === id);
  if (!found) return null;
  const tied = ranked.filter((station) => station.temperature === found.temperature).length;
  return { ...found, tied, total: ranked.length };
}

export function extremes(ranked) {
  if (!ranked.length) return null;
  const hottest = ranked[0];
  const coldest = ranked[ranked.length - 1];
  return { hottest, coldest, gap: Math.round((hottest.temperature - coldest.temperature) * 10) / 10 };
}

/* 最下位はほぼ毎回、標高の高い山の観測所になる。「山だから」を切り分けて見せるために
   標高を区切った寒い地点も出す。 */
export function coldestBelow(ranked, maxAltitude) {
  for (let index = ranked.length - 1; index >= 0; index -= 1) {
    const station = ranked[index];
    if (Number.isFinite(station.altitude) && station.altitude < maxAltitude) return station;
  }
  return null;
}

export function distanceKm(from, to) {
  const radius = 6371;
  const toRadian = (degree) => (degree * Math.PI) / 180;
  const deltaLat = toRadian(to.latitude - from.latitude);
  const deltaLon = toRadian(to.longitude - from.longitude);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadian(from.latitude)) * Math.cos(toRadian(to.latitude)) * Math.sin(deltaLon / 2) ** 2;
  return radius * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function nearestStation(stations, point, { requireTemperature = false } = {}) {
  const pool = requireTemperature ? stations.filter((station) => station.temperature !== null) : stations;
  let best = null;
  for (const station of pool) {
    const distance = distanceKm(point, station);
    if (!best || distance < best.distance) best = { station, distance };
  }
  return best;
}

/* 「あきた」と打っても片仮名の読みに当たるようにする。 */
export function normalizeQuery(input) {
  return String(input ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/[ぁ-ゖ]/g, (character) => String.fromCharCode(character.charCodeAt(0) + 0x60));
}

const BY_PREFECTURE = 3;

export function searchStations(stations, query, limit = 8) {
  const needle = normalizeQuery(query);
  if (!needle) return [];
  const scored = [];
  for (const station of stations) {
    let score = null;
    if (station.name === needle) score = 0;
    else if (station.name.startsWith(needle) || station.kana.startsWith(needle)) score = 1;
    else if (station.name.includes(needle) || station.kana.includes(needle)) score = 2;
    else if (`${station.prefecture}${station.name}`.includes(needle)) score = BY_PREFECTURE;
    if (score !== null) scored.push({ station, score });
  }
  /* 「秋田」は地点名であり県名でもある。県名で拾うと秋田県の全地点が並んでしまうので、
     地点名で当たったものが1つでもあれば、県名だけで当たったものは落とす。
     さらに地点名そのものを打たれたときは、それだけを返す（読みの別名に引っぱられないように）。 */
  const exact = scored.filter((entry) => entry.score === 0);
  const byName = scored.filter((entry) => entry.score < BY_PREFECTURE);
  const pool = exact.length ? exact : byName.length ? byName : scored;
  return pool
    .sort((a, b) => a.score - b.score || a.station.name.length - b.station.name.length)
    .slice(0, limit)
    .map((entry) => entry.station);
}

/* 読みの欄には「ユウワ：秋田空港」のように別名が入っていることがある。
   同じ名前の地点を見分けるときに、この別名が手がかりになる。 */
export function aliasOf(station) {
  const [, alias] = String(station?.kana ?? '').split('：');
  return alias ? alias.trim() : '';
}

/* ── ここから地図 ──
   海岸線のデータは持たない。観測点を緯度経度どおりに置くと、それだけで日本列島の形になる。
   地図そのものが観測網の姿なので、線を引くより点を置くほうが正しい。 */

export const REGIONS = [
  { label: '日本ぜんぶ', home: true },
  { label: '北海道', prefectures: ['北海道'] },
  { label: '東北', prefectures: ['青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県'] },
  { label: '関東', prefectures: ['茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県'] },
  { label: '中部', prefectures: ['新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県'] },
  { label: '近畿', prefectures: ['三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県'] },
  { label: '中国', prefectures: ['鳥取県', '島根県', '岡山県', '広島県', '山口県'] },
  { label: '四国', prefectures: ['徳島県', '香川県', '愛媛県', '高知県'] },
  { label: '九州', prefectures: ['福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県'] },
  { label: '南西諸島', bounds: { west: 122.4, east: 131.4, south: 23.8, north: 30.2 }, apart: true },
];

/* 南西諸島は本土から遠い。全体を1枚に収めると本土がつぶれるので、
   全体表示のときだけ別枠に出す。寄ったときは本物の位置で描く（＝海を越えて行ける）。 */
export const APART = REGIONS[REGIONS.length - 1].bounds;

export function belongsApart(station) {
  return station.latitude < APART.north && station.longitude <= APART.east;
}

export function boundsOf(stations, margin = 0.3) {
  if (!stations.length) return null;
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
  for (const station of stations) {
    west = Math.min(west, station.longitude);
    east = Math.max(east, station.longitude);
    south = Math.min(south, station.latitude);
    north = Math.max(north, station.latitude);
  }
  return { west: west - margin, east: east + margin, south: south - margin, north: north + margin };
}

export function regionBounds(stations, region, margin = 0.4) {
  if (region.bounds) return region.bounds;
  if (region.home) return boundsOf(stations.filter((station) => !belongsApart(station)), 0.3);
  return boundsOf(stations.filter((station) => region.prefectures.includes(station.prefecture)), margin);
}

/* 緯度が上がるほど経度1度は短くなる。日本の真ん中の緯度で横を縮めておくと、
   地図として素直な形になる。 */
export const LONGITUDE_SQUEEZE = Math.cos((37.5 * Math.PI) / 180);

export function fitScale(bounds, width, height, padding = 20) {
  const spanX = (bounds.east - bounds.west) * LONGITUDE_SQUEEZE;
  const spanY = bounds.north - bounds.south;
  if (spanX <= 0 || spanY <= 0) return 1;
  return Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);
}

export function toScreen(station, view, size) {
  return {
    x: size.width / 2 + (station.longitude - view.longitude) * LONGITUDE_SQUEEZE * view.scale,
    y: size.height / 2 - (station.latitude - view.latitude) * view.scale,
  };
}

/* 画面のどこを押したかから、いちばん近い地点を返す。指の太さぶんは許す。 */
export function pickAt(drawn, point, reach = 16) {
  let best = null;
  for (const item of drawn) {
    const distance = Math.hypot(item.x - point.x, item.y - point.y);
    if (distance <= reach && (!best || distance < best.distance)) best = { ...item, distance };
  }
  return best;
}

/* 配信ファイル名は日本時間の壁時計そのもの。端末のタイムゾーンに左右されないよう
   文字列のまま扱う。 */
export function stampFromIso(iso) {
  return String(iso ?? '').replace(/[-:]/g, '').replace('T', '').slice(0, 14);
}

export function shiftStamp(stamp, minutes) {
  const text = String(stamp ?? '');
  if (!/^\d{14}$/.test(text)) return '';
  const parts = [0, 4, 6, 8, 10, 12].map((start, index) => Number(text.slice(start, start + (index === 0 ? 4 : 2))));
  const [year, month, day, hour, minute, second] = parts;
  const shifted = new Date(Date.UTC(year, month - 1, day, hour, minute + minutes, second));
  const pad = (value, size = 2) => String(value).padStart(size, '0');
  return [
    pad(shifted.getUTCFullYear(), 4),
    pad(shifted.getUTCMonth() + 1),
    pad(shifted.getUTCDate()),
    pad(shifted.getUTCHours()),
    pad(shifted.getUTCMinutes()),
    pad(shifted.getUTCSeconds()),
  ].join('');
}

export function formatClock(stamp) {
  const text = String(stamp ?? '');
  if (!/^\d{14}$/.test(text)) return '';
  return `${Number(text.slice(4, 6))}月${Number(text.slice(6, 8))}日 ${text.slice(8, 10)}:${text.slice(10, 12)}`;
}
