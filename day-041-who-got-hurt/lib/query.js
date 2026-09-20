/* 半径で切り、「誰が」で絞り、数え、地点にまとめる。
   ここは画面を知らない純粋な計算だけ（テストはここに厚く置いてある） */
import { bearingDeg, distanceM } from './geo.js';
import { F_BIKE, F_CROSS, F_DEATH, F_ELDER, F_WALKER } from './pack.js';

export const RADII = [300, 500, 1000];
export const radiusLabel = (m) => (m >= 1000 ? `${m / 1000}km` : `${m}m`);

/* 「誰が」の選択肢。年齢は階級値なので、いちばん若い区分が0〜24歳になる。
   「子ども」で絞れない理由は REQUIREMENTS.md に書いた */
export const WHO = [
  { id: 'all', label: 'すべて', mask: 0 },
  { id: 'walker', label: '歩行者', mask: F_WALKER },
  { id: 'bike', label: '自転車', mask: F_BIKE },
  { id: 'elder', label: '65歳以上', mask: F_ELDER },
];
export const whoMask = (id) => WHO.find((w) => w.id === id)?.mask ?? 0;

const hasFlag = (record, flag) => (record.flags & flag) === flag;
export const countFlag = (records, flag) => records.reduce((sum, r) => sum + (hasFlag(r, flag) ? 1 : 0), 0);

/* 半径の内側。境界ちょうど（距離＝半径）は内側に入れる */
export function withinRadius(records, point, radiusM) {
  const out = [];
  for (const record of records) {
    const distance = distanceM(point, record);
    if (distance <= radiusM) out.push({ ...record, distance });
  }
  return out;
}

export function filterWho(records, who) {
  const mask = whoMask(who);
  return mask ? records.filter((record) => hasFlag(record, mask)) : records;
}

export const summarize = (records) => ({
  total: records.length,
  walker: countFlag(records, F_WALKER),
  bike: countFlag(records, F_BIKE),
  elder: countFlag(records, F_ELDER),
  death: countFlag(records, F_DEATH),
});

/* 0〜23時の帯。時刻が記録されていない件（24）は帯に混ぜず、別に数える */
export function hourBand(records) {
  const hours = new Array(24).fill(0);
  let unknown = 0;
  for (const record of records) {
    if (Number.isInteger(record.hour) && record.hour >= 0 && record.hour <= 23) hours[record.hour] += 1;
    else unknown += 1;
  }
  const max = Math.max(...hours);
  return { hours, unknown, max, peak: max > 0 ? hours.indexOf(max) : -1, known: records.length - unknown };
}

/* 近い事故を約40mでまとめる。種（さいしょの1件）から40m以内を同じ地点とみなす。
   総当たりだと1,700件で百万回の距離計算になるので、40m四方の桝に入れて周り9桝だけ見る */
export const CLUSTER_M = 40;

export function clusterSpots(records, point, options = {}) {
  const reach = options.reachM ?? CLUSTER_M;
  const limit = options.limit ?? 5;
  if (!records.length) return [];
  const stepLat = reach / 111320;
  const stepLng = reach / (111320 * Math.cos(point.lat * Math.PI / 180));
  const bins = new Map();
  const spots = [];
  // 並びで結果が変わらないよう、緯度・経度の順に並べてから種を決める
  for (const record of [...records].sort((a, b) => a.lat - b.lat || a.lng - b.lng)) {
    const row = Math.floor(record.lat / stepLat);
    const column = Math.floor(record.lng / stepLng);
    let found = null;
    for (let dr = -1; dr <= 1 && !found; dr += 1) {
      for (let dc = -1; dc <= 1 && !found; dc += 1) {
        for (const spot of bins.get(`${row + dr}:${column + dc}`) ?? []) {
          if (distanceM(spot.seed, record) <= reach) { found = spot; break; }
        }
      }
    }
    if (found) { found.members.push(record); continue; }
    const spot = { seed: { lat: record.lat, lng: record.lng }, members: [record] };
    spots.push(spot);
    const key = `${row}:${column}`;
    if (!bins.has(key)) bins.set(key, []);
    bins.get(key).push(spot);
  }
  return spots.map((spot) => {
    const lat = spot.members.reduce((sum, r) => sum + r.lat, 0) / spot.members.length;
    const lng = spot.members.reduce((sum, r) => sum + r.lng, 0) / spot.members.length;
    const at = { lat, lng };
    return {
      lat,
      lng,
      count: spot.members.length,
      distance: distanceM(point, at),
      bearing: bearingDeg(point, at),
      // 半数以上が交差点かその付近なら「交差点」と添える（交差点名は持っていない）
      crossing: countFlag(spot.members, F_CROSS) * 2 >= spot.members.length,
      walker: countFlag(spot.members, F_WALKER),
      bike: countFlag(spot.members, F_BIKE),
      death: countFlag(spot.members, F_DEATH),
    };
  }).sort((a, b) => b.count - a.count || a.distance - b.distance).slice(0, limit);
}

/* 地図に出す形。歩行者＝丸／自転車＝ひし形／その他＝小さな点。死亡は縁取りを足す。
   歩行者と自転車の両方が関わった事故は歩行者の形にする（人が歩いていたことを優先して見せる） */
export const shapeOf = (record) => (hasFlag(record, F_WALKER) ? 'walker' : hasFlag(record, F_BIKE) ? 'bike' : 'other');
export const iconOf = (record) => `${shapeOf(record)}${hasFlag(record, F_DEATH) ? '-death' : ''}`;
