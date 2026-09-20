/* 地図まわりの純関数。DOMに触らない（ユニットテスト対象）。
   投影は正距円筒＋緯度の中央でcos補正（Day014と同じ考え方）。地図データは持たず、
   1,741市区町村の人口加重重心を置くと点だけで日本列島の形になる。 */

/* 点集合をキャンバスに収める投影を作る。points = {code: [lon, lat]} */
export function fitProjection(points, width, height, pad = 14) {
  const lons = [];
  const lats = [];
  for (const [lon, lat] of Object.values(points)) { lons.push(lon); lats.push(lat); }
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const kx = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);   // 経度の縮み補正
  const spanX = (maxLon - minLon) * kx;
  const spanY = maxLat - minLat;
  const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;
  const toXY = (lon, lat) => [
    offsetX + (lon - minLon) * kx * scale,
    offsetY + (maxLat - lat) * scale,
  ];
  return { toXY, scale, aspect: spanX / spanY };
}

/* 「ランキングごとのヒートマップ」: 順位を0〜1に直す。1位=1、最下位=0。
   実値でなく順位で塗るので、人口のような裾の長い分布でも階調が死なない */
export function rankRatio(rank, of) {
  if (!rank || !of) return null;
  if (of <= 1) return 1;
  return 1 - (rank - 1) / (of - 1);
}

/* 単一色相のシーケンシャル（うすい→こい）。3停で線形補間。
   煽り色（赤・金）は使わない。データなしは呼び出し側でグレーにする */
const STOPS = [
  [207, 224, 214],   // 最淡（採点指摘で背景の生成りと確実に分かれる明度へ）
  [78, 138, 118],    // アクセントの緑
  [18, 53, 44],      // 深い緑（上位側）
];
export function rampColor(t) {
  if (t === null || Number.isNaN(t)) return null;
  const clamped = Math.max(0, Math.min(1, t));
  const pos = clamped * (STOPS.length - 1);
  const i = Math.min(Math.floor(pos), STOPS.length - 2);
  const f = pos - i;
  const mix = STOPS[i].map((a, ch) => Math.round(a + (STOPS[i + 1][ch] - a) * f));
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
}
/* 「データなし」は順位最下位より目立ってはいけない（見え方の逆転を防ぐ）ので半透明で後退させる */
export const MISSING_COLOR = 'rgba(205, 201, 193, 0.55)';

/* 画面座標での最近傍探し（タップ判定）。xy = Map(code → [x, y]) */
export function nearestCode(xy, x, y, maxDistance = 12) {
  let best = null;
  let bestD = maxDistance * maxDistance;
  for (const [code, [px, py]] of xy) {
    const d = (px - x) * (px - x) + (py - y) * (py - y);
    if (d < bestD) { bestD = d; best = code; }
  }
  return best;
}
