import { STATION_COORDINATES } from './station-coordinates.js';
import { STATIONS } from './network.js';

// 独自の概略モデル用の代表座標。線路形状・停車駅・高架高さの実測データではない。
const extra = [
  ['Ochanomizu', '御茶ノ水'], ['Yotsuya', '四ツ谷'],
  ['Nakano', '中野'], ['Koenji', '高円寺'],
  ['Asagaya', '阿佐ケ谷'], ['Ogikubo', '荻窪'],
  ['NishiOgikubo', '西荻窪'], ['Kichijoji', '吉祥寺'],
  ['Mitaka', '三鷹'], ['HigashiNakano', '東中野'],
  ['Okubo', '大久保'], ['Sendagaya', '千駄ケ谷'],
  ['Shinanomachi', '信濃町'], ['Ichigaya', '市ケ谷'],
  ['Iidabashi', '飯田橋'], ['Suidobashi', '水道橋'],
  ['Asakusabashi', '浅草橋'], ['Ryogoku', '両国'],
  ['Kinshicho', '錦糸町'], ['Kameido', '亀戸'],
  ['Akabane', '赤羽'], ['HigashiJujo', '東十条'],
  ['Oji', '王子'], ['KamiNakazato', '上中里'],
  ['Oimachi', '大井町'], ['Omori', '大森'],
  ['Kamata', '蒲田'], ['Jujo', '十条'],
  ['Itabashi', '板橋'],
];
export const PLACES = new Map([...STATIONS, ...extra.map(([id, name]) => ({ ...STATION_COORDINATES.get(id), id, name }))].map(s => [s.id, s]));
const stops = ids => ids.split(' ').map(id => PLACES.get(id));
export const RAILWAYS = [
  { id: 'yamanote', code: 'JY', name: '山手線', english: 'Yamanote', color: '#7dac45', closed: true, height: 1.25, demoCount: 16, span: '都心をひとまわり', stations: STATIONS },
  { id: 'chuo', code: 'JC', name: '中央線', english: 'Chuo', color: '#e57943', height: 2.55, demoCount: 8, span: '東京 — 三鷹', stations: stops('Tokyo Kanda Ochanomizu Yotsuya Shinjuku Nakano Koenji Asagaya Ogikubo NishiOgikubo Kichijoji Mitaka') },
  { id: 'sobu', code: 'JB', name: '総武線', english: 'Chuo-Sobu', color: '#d5b448', height: 1.75, demoCount: 8, span: '中野 — 亀戸', stations: stops('Nakano HigashiNakano Okubo Shinjuku Yoyogi Sendagaya Shinanomachi Yotsuya Ichigaya Iidabashi Suidobashi Ochanomizu Akihabara Asakusabashi Ryogoku Kinshicho Kameido') },
  { id: 'keihin', code: 'JK', name: '京浜東北線', english: 'Keihin-Tohoku', color: '#4da0c4', height: .8, demoCount: 10, span: '赤羽 — 蒲田', stations: stops('Akabane HigashiJujo Oji KamiNakazato Tabata NishiNippori Nippori Uguisudani Ueno Okachimachi Akihabara Kanda Tokyo Yurakucho Shimbashi Hamamatsucho Tamachi TakanawaGateway Shinagawa Oimachi Omori Kamata') },
  { id: 'saikyo', code: 'JA', name: '埼京線', english: 'Saikyo', color: '#3f9584', height: 2.05, demoCount: 6, span: '赤羽 — 大崎', stations: stops('Akabane Jujo Itabashi Ikebukuro Shinjuku Shibuya Ebisu Osaki') },
];
// 併走区間で車体が重ならないための概略配置。実際の線路間隔ではない。
for (const route of RAILWAYS) route.offset = { keihin: -2.8, sobu: 2.6, saikyo: 3.2 }[route.id] || 0;
export const RAILWAY_BY_ID = new Map(RAILWAYS.map(route => [route.id, route]));
export const geo = (lng, lat) => ({ x: (lng - 139.74) * 900, z: (35.695 - lat) * 1110 });
export const VIEWS = [
  { id: 'city', label: '都心の全景', target: [-4, 0, 10], offset: [112, 146, 165] },
  { id: 'tokyo', label: '東京駅', place: 'Tokyo', offset: [16, 18, 24] },
  { id: 'shinjuku', label: '新宿', place: 'Shinjuku', offset: [-18, 19, 24] },
  { id: 'shibuya', label: '渋谷', place: 'Shibuya', offset: [17, 16, 24] },
  { id: 'ueno', label: '上野', place: 'Ueno', offset: [18, 19, 25] },
];
