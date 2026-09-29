// 地図の計算。柱の形・距離・県のお風呂の範囲。

const EARTH_KM = 6371.0088;
const toRadians = (degrees) => (degrees * Math.PI) / 180;
const round6 = (value) => Math.round(value * 1e6) / 1e6;

// 県庁所在地の点に立てる柱の断面。半径 radiusKm の steps 角形（閉じた輪）
export function circleRing(lng, lat, radiusKm = 14, steps = 32) {
  const latStep = radiusKm / 110.574;
  const lngStep = radiusKm / (111.32 * Math.cos(toRadians(lat)));
  const ring = [];
  for (let index = 0; index < steps; index += 1) {
    const angle = (index / steps) * 2 * Math.PI;
    ring.push([round6(lng + lngStep * Math.cos(angle)), round6(lat + latStep * Math.sin(angle))]);
  }
  ring.push([...ring[0]]);
  return ring;
}

export function haversineKm(from, to) {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

// 日本のだいたいの範囲を四角の和で持つ（[西, 南, 東, 北]）。四角1つだと韓国・ロシア沿海地方まで入るので分ける。
// 「日本の外」と知らせるためだけに使う。境界の精密な判定ではない
export const JAPAN_BOXES = [
  [129.5, 30.9, 137.5, 36.4], // 九州・中国・四国・近畿（隠岐まで）。南端は南西諸島の四角と隙間なくつなぐ（佐多岬は北緯30.99度）
  [135.0, 33.4, 142.2, 41.6], // 中部・関東・東北（伊豆大島・佐渡まで）
  [139.3, 41.3, 146.0, 45.6], // 北海道
  [128.5, 32.5, 129.8, 34.8], // 対馬・壱岐・五島
  [122.9, 24.0, 131.4, 30.9], // 南西諸島（屋久島〜与那国島・大東諸島）
  [138.8, 24.0, 142.4, 34.8], // 伊豆諸島・小笠原諸島
  [153.9, 24.2, 154.1, 24.4], // 南鳥島
];

export function inJapan(point) {
  if (!Number.isFinite(point?.lat) || !Number.isFinite(point?.lng)) return false;
  return JAPAN_BOXES.some(([west, south, east, north]) => point.lng >= west && point.lng <= east && point.lat >= south && point.lat <= north);
}

// 全国を見せるときの範囲（沖縄本島〜北海道の東端）。構図の計算ができないときの予備
export const JAPAN_VIEW = [[127.3, 25.9], [145.9, 45.6]];

// 主な4島（北海道・本州・四国・九州）の外形の目印（岬など）。全国の構図はこの点が枠に収まるように決める。
// 沖縄は入れない（入れると本土が小さくなる。画面の端に入れば足りる）
export const MAIN_ISLAND_EDGES = [
  // 北海道：宗谷岬・知床岬・納沙布岬・襟裳岬・白神岬・神威岬
  [141.94, 45.52], [145.34, 44.35], [145.82, 43.38], [143.25, 41.92], [140.2, 41.4], [140.35, 43.33],
  // 本州：大間崎・龍飛崎・魹ヶ崎・犬吠埼・野島崎・石廊崎・潮岬・禄剛崎・男鹿半島・角島
  [140.91, 41.55], [140.35, 41.25], [142.07, 39.55], [140.87, 35.71], [139.89, 34.9], [138.85, 34.6],
  [135.76, 33.43], [137.33, 37.53], [139.7, 39.95], [130.85, 34.35],
  // 四国：足摺岬・室戸岬
  [132.97, 32.72], [134.18, 33.25],
  // 九州：佐多岬・野母崎・平戸・門司・都井岬・野間岬
  [130.66, 30.99], [129.75, 32.58], [129.5, 33.35], [130.95, 33.95], [131.33, 31.37], [130.15, 31.4],
].map(([lng, lat]) => ({ lng, lat }));

// 県のお風呂が収まる範囲。離島まで入れると本土が小さくなる（東京都は小笠原まで点がある）ので、
// 20件以上あるときは緯度・経度それぞれ両端の trim ずつを外す
export function robustBounds(points, trim = 0.03) {
  const usable = (points ?? []).filter((point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lng));
  if (!usable.length) return null;
  const lats = usable.map((point) => point.lat).sort((a, b) => a - b);
  const lngs = usable.map((point) => point.lng).sort((a, b) => a - b);
  const cut = usable.length >= 20 ? trim : 0;
  const low = Math.floor(cut * (usable.length - 1));
  const high = Math.ceil((1 - cut) * (usable.length - 1));
  let [west, east, south, north] = [lngs[low], lngs[high], lats[low], lats[high]];
  // 1点だけ・同じ場所だけのときは、少し広げて地図が寄りすぎないようにする
  const pad = 0.02;
  if (east - west < pad) [west, east] = [west - pad, east + pad];
  if (north - south < pad) [south, north] = [south - pad, north + pad];
  return [[west, south], [east, north]];
}
