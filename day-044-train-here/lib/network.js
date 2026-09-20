import { STATION_COORDINATES } from './station-coordinates.js';
// 駅の位置を結ぶ概略図。線路の形状や駅構内の乗車位置を示すものではない。
// 順序は外回り（東京→品川→渋谷→新宿→池袋→上野→東京）。
const rows = [
  ['Tokyo', '東京', '01'],
  ['Yurakucho', '有楽町', '30'],
  ['Shimbashi', '新橋', '29'],
  ['Hamamatsucho', '浜松町', '28'],
  ['Tamachi', '田町', '27'],
  ['TakanawaGateway', '高輪ゲートウェイ', '26'],
  ['Shinagawa', '品川', '25'],
  ['Osaki', '大崎', '24'],
  ['Gotanda', '五反田', '23'],
  ['Meguro', '目黒', '22'],
  ['Ebisu', '恵比寿', '21'],
  ['Shibuya', '渋谷', '20'],
  ['Harajuku', '原宿', '19'],
  ['Yoyogi', '代々木', '18'],
  ['Shinjuku', '新宿', '17'],
  ['ShinOkubo', '新大久保', '16'],
  ['Takadanobaba', '高田馬場', '15'],
  ['Mejiro', '目白', '14'],
  ['Ikebukuro', '池袋', '13'],
  ['Otsuka', '大塚', '12'],
  ['Sugamo', '巣鴨', '11'],
  ['Komagome', '駒込', '10'],
  ['Tabata', '田端', '09'],
  ['NishiNippori', '西日暮里', '08'],
  ['Nippori', '日暮里', '07'],
  ['Uguisudani', '鶯谷', '06'],
  ['Ueno', '上野', '05'],
  ['Okachimachi', '御徒町', '04'],
  ['Akihabara', '秋葉原', '03'],
  ['Kanda', '神田', '02'],
];
export const STATIONS = rows.map(([id, name, number], index) => ({ ...STATION_COORDINATES.get(id), id, name, number, index }));
export const STATION_BY_ID = new Map(STATIONS.map(s => [s.id, s]));
export const DIRECTIONS = { outer: { name: '外回り', step: 1 }, inner: { name: '内回り', step: -1 } };
export const RAILWAY = 'odpt.Railway:JR-East.Yamanote';
export const mod = n => ((n % STATIONS.length) + STATIONS.length) % STATIONS.length;
export function station(id) { return STATION_BY_ID.get(id) ?? null; }
export function stopsBetween(from, to, direction) {
  if (!station(from) || !station(to) || !DIRECTIONS[direction]) return null;
  return mod((station(to).index - station(from).index) * DIRECTIONS[direction].step);
}
export function routeStations(from, to, direction) {
  const count = stopsBetween(from, to, direction);
  if (count === null || count === 0) return [];
  return Array.from({ length: count + 1 }, (_, i) => STATIONS[mod(station(from).index + i * DIRECTIONS[direction].step)]);
}
export function shortestDirection(from, to) {
  return stopsBetween(from, to, 'outer') <= stopsBetween(from, to, 'inner') ? 'outer' : 'inner';
}
export function directionVia(from, direction) {
  const i = station(from)?.index;
  return i === undefined ? '' : STATIONS[mod(i + DIRECTIONS[direction].step)].name;
}
export function project(lng, lat) { return { x: 170 + (lng - 139.7) * 4450, y: 78 + (35.739 - lat) * 4450 }; }
export function pointAt(position) {
  const index = Math.floor(mod(position));
  const f = mod(position) - index;
  const a = project(STATIONS[index].lng, STATIONS[index].lat);
  const b = project(STATIONS[mod(index + 1)].lng, STATIONS[mod(index + 1)].lat);
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}
