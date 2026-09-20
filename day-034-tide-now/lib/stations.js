/* 地点は海岸沿いの掲載順なので、都道府県は標準の北からの順に並べ直す。 */
const PREFS = '北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 静岡県 愛知県 三重県 京都府 大阪府 兵庫県 和歌山県 鳥取県 島根県 岡山県 広島県 山口県 徳島県 香川県 愛媛県 高知県 福岡県 佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県'.split(' ');
export const groupByPref = (stations) => PREFS.map((pref) => ({ pref, stations: stations.filter((station) => station.pref === pref) })).filter((group) => group.stations.length);
export const findByCode = (stations, code) => stations.find((station) => station.code === code) ?? null;
export function distanceKm(a, b) {
  const toRad = Math.PI / 180;
  const meanLat = ((a.lat + b.lat) / 2) * toRad;
  const dx = (a.lon - b.lon) * toRad * Math.cos(meanLat);
  const dy = (a.lat - b.lat) * toRad;
  return Math.sqrt(dx * dx + dy * dy) * 6371;
}
export function nearest(stations, point) {
  let best = null;
  for (const station of stations) {
    const km = distanceKm(station, point);
    if (!best || km < best.km) best = { station, km };
  }
  return best;
}
