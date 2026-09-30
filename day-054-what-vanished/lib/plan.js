// 家の間取り。床・壁・窓・家具・小物の置き場所をすべてこの表から作る。
// 座標は m。x は東、z は南、y は上。見取り図では x が右、z が下になる。
// rot は家具の向き（度）。0＝正面が南（+z）、180＝北、90＝東、-90＝西。

export const HOUSE = {
  width: 12,
  depth: 9,
  wallHeight: 2.5,
  exterior: 0.2,
  interior: 0.12,
  eyeHeight: 1.5,
  start: { x: 6, z: 8.3, yaw: 0 }
};

/**
 * 部屋。rect は [x0, z0, x1, z1]（壁の中心線）。
 * stand は見取り図で部屋を押したときに歩いていく場所と、着いたあとに向く向き（部屋の家具が見渡せる向き）。
 * 評価の1周目で「着くと壁や窓を向いていて、見ている人が何を見ればよいか分からない」と指摘された。
 */
export const ROOMS = [
  // 廊下は南の端から奥（北）を見渡す。玄関は扉まで歩かず、廊下の南の端から扉の方を見る（評価の2周目：扉まで歩いて振り返るのに5〜6秒かかった）
  { id: 'hall', name: '廊下', rect: [5, 0, 7, 7.9], floor: 'oak-floor', wall: '#ece6da', map: '#d9cdb8', stand: { x: 6.0, z: 6.3, yaw: 0 } },
  { id: 'entrance', name: '玄関', rect: [5, 7.9, 7, 9], floor: 'stone-tile', wall: '#ece6da', map: '#bfb7aa', stand: { x: 6.0, z: 7.2, yaw: 180 } },
  { id: 'living', name: 'リビング', rect: [0, 4, 5, 9], floor: 'parquet', wall: '#f1e7d6', map: '#e8c99a', stand: { x: 4.2, z: 6.5, yaw: 88 } },
  { id: 'dining', name: '台所', rect: [7, 4, 12, 9], floor: 'checker-tile', wall: '#e3ead9', map: '#bcd4a8', stand: { x: 7.9, z: 6.5, yaw: -72 } },
  { id: 'bedroom', name: '寝室', rect: [0, 0, 5, 4], floor: 'oak-floor', wall: '#dde6ee', map: '#a9c3dc', stand: { x: 4.2, z: 2.1, yaw: 92 } },
  { id: 'study', name: '書斎', rect: [7, 0, 12, 4], floor: 'oak-floor', wall: '#efe4cf', map: '#d8bf94', stand: { x: 7.8, z: 2.1, yaw: -90 } }
];

/**
 * 壁。a→b は中心線。openings は壁に沿った座標（x か z の値）の区間。
 * kind: door＝床から2.1mの出入口、window＝腰高0.9〜2.1mの窓、front＝玄関の扉（閉じている）
 */
export const WALLS = [
  // 外壁
  { a: [0, 0], b: [12, 0], t: 0.2, openings: [{ from: 8.7, to: 10.7, kind: 'window' }] },
  { a: [0, 9], b: [12, 9], t: 0.2, openings: [
    { from: 1.3, to: 3.3, kind: 'window' },
    { from: 5.55, to: 6.45, kind: 'front' },
    { from: 8.3, to: 10.3, kind: 'window' }
  ] },
  { a: [0, 0], b: [0, 9], t: 0.2, openings: [
    { from: 1.4, to: 2.9, kind: 'window' },
    { from: 5.3, to: 7.3, kind: 'window' }
  ] },
  { a: [12, 0], b: [12, 9], t: 0.2, openings: [
    { from: 1.5, to: 2.9, kind: 'window' },
    { from: 5.2, to: 6.8, kind: 'window' }
  ] },
  // 間仕切り
  { a: [5, 0], b: [5, 9], t: 0.12, openings: [
    { from: 1.6, to: 2.6, kind: 'door' },
    { from: 5.9, to: 7.1, kind: 'door' }
  ] },
  { a: [7, 0], b: [7, 9], t: 0.12, openings: [
    { from: 1.6, to: 2.6, kind: 'door' },
    { from: 5.9, to: 7.1, kind: 'door' }
  ] },
  { a: [0, 4], b: [5, 4], t: 0.12, openings: [] },
  { a: [7, 4], b: [12, 4], t: 0.12, openings: [] }
];

export const OPENING_HEIGHTS = {
  door: { bottom: 0, top: 2.1 },
  front: { bottom: 0, top: 2.1 },
  window: { bottom: 0.9, top: 2.1 }
};

/** 動かない家具。y は置く高さ（床なら0）、ceiling は天井から吊るす物 */
export const FIXTURES = [
  // リビング
  { id: 'living-cabinet', model: 'tv-cabinet', x: 2.5, z: 4.35, rot: 0 },
  { id: 'living-sofa', model: 'sofa', x: 2.5, z: 7.55, rot: 180 },
  { id: 'living-table', model: 'coffee-table', x: 2.5, z: 6.15, rot: 0 },
  { id: 'living-side', model: 'side-table', x: 3.75, z: 7.55, rot: 180 },
  { id: 'living-shelf', model: 'cube-shelf', x: 4.2, z: 8.7, rot: 180 },
  { id: 'living-light', model: 'chandelier', x: 2.5, z: 6.2, rot: 0, ceiling: true },
  // 台所
  { id: 'kitchen-rack', model: 'kitchen-rack', x: 7.75, z: 4.31, rot: 0 },
  { id: 'kitchen-cabinet', model: 'kitchen-cabinet', x: 9.2, z: 4.37, rot: 0 },
  { id: 'kitchen-stove', model: 'stove', x: 10.45, z: 4.385, rot: 0 },
  { id: 'dining-table', model: 'dining-table', x: 9.6, z: 7.0, rot: 0 },
  { id: 'dining-chair-a', model: 'dining-chair', x: 9.1, z: 6.05, rot: 0 },
  { id: 'dining-chair-b', model: 'dining-chair', x: 10.1, z: 6.05, rot: 0 },
  { id: 'dining-chair-c', model: 'dining-chair', x: 9.6, z: 8.0, rot: 180 },
  { id: 'dining-light', model: 'ceiling-lamp', x: 9.6, z: 7.0, rot: 0, ceiling: true },
  // 寝室
  { id: 'bedroom-bed', model: 'bed', x: 2.3, z: 1.16, rot: 0 },
  { id: 'bedroom-nightstand', model: 'nightstand', x: 3.45, z: 0.33, rot: 0 },
  { id: 'bedroom-dresser', model: 'dresser', x: 2.4, z: 3.65, rot: 180 },
  // 書斎
  { id: 'study-desk', model: 'desk', x: 9.7, z: 0.35, rot: 0 },
  { id: 'study-bookshelf', model: 'bookshelf', x: 10.6, z: 3.65, rot: 180 },
  // 廊下
  { id: 'hall-bench', model: 'bench', x: 5.32, z: 4.1, rot: 90 }
];

/**
 * 小物の置き場所。kind: top＝天板の上、shelf＝棚の中（maxH まで）、floor＝床、wall＝壁掛け、
 * seat は背もたれや柱より低い座面（ソファ・ベッド・ベンチ）に置く場所の印。
 * その他（tv・sofa など）はその物専用の場所。y は置く面の高さ、wall は物の中心の高さ。
 * maxW・maxD は置ける物の幅と奥行き（向きをそろえたあと）の上限。
 */
export const SLOTS = [
  // リビング
  { id: 'L-tv', room: 'living', kind: 'tv', x: 2.5, y: 0.68, z: 4.33, rot: 0 },
  { id: 'L-cab-1', room: 'living', kind: 'top', x: 1.6, y: 0.68, z: 4.33, rot: 0, maxW: 0.7, maxD: 0.45 },
  { id: 'L-cab-2', room: 'living', kind: 'top', x: 3.4, y: 0.68, z: 4.33, rot: 0, maxW: 0.7, maxD: 0.45 },
  { id: 'L-table-1', room: 'living', kind: 'top', x: 2.15, y: 0.39, z: 6.15, rot: 180, maxW: 0.55, maxD: 0.5 },
  { id: 'L-table-2', room: 'living', kind: 'top', x: 2.85, y: 0.39, z: 6.15, rot: 180, maxW: 0.55, maxD: 0.5 },
  { id: 'L-side', room: 'living', kind: 'top', x: 3.75, y: 0.548, z: 7.55, rot: 180, maxW: 0.45, maxD: 0.4 },
  { id: 'L-shelf-top-1', room: 'living', kind: 'top', x: 3.95, y: 1.557, z: 8.72, rot: 180, maxW: 0.45, maxD: 0.33 },
  { id: 'L-shelf-top-2', room: 'living', kind: 'top', x: 4.45, y: 1.557, z: 8.72, rot: 180, maxW: 0.45, maxD: 0.33 },
  { id: 'L-cubby-1', room: 'living', kind: 'shelf', x: 3.84, y: 0.79, z: 8.72, rot: 180, maxW: 0.32, maxD: 0.32, maxH: 0.34 },
  { id: 'L-cubby-2', room: 'living', kind: 'shelf', x: 4.2, y: 0.79, z: 8.72, rot: 180, maxW: 0.32, maxD: 0.32, maxH: 0.34 },
  { id: 'L-cubby-3', room: 'living', kind: 'shelf', x: 4.56, y: 0.79, z: 8.72, rot: 180, maxW: 0.32, maxD: 0.32, maxH: 0.34 },
  { id: 'L-cubby-4', room: 'living', kind: 'shelf', x: 3.84, y: 1.17, z: 8.72, rot: 180, maxW: 0.32, maxD: 0.32, maxH: 0.34 },
  { id: 'L-cubby-5', room: 'living', kind: 'shelf', x: 4.56, y: 1.17, z: 8.72, rot: 180, maxW: 0.32, maxD: 0.32, maxH: 0.34 },
  { id: 'L-sofa', room: 'living', kind: 'sofa', x: 2.5, y: 0.38, z: 7.6, rot: 180, seat: true },
  { id: 'L-armchair', room: 'living', kind: 'armchair', x: 0.62, y: 0, z: 6.3, rot: 90 },
  { id: 'L-plant', room: 'living', kind: 'tall-plant', x: 0.48, y: 0, z: 8.45, rot: 30 },
  { id: 'L-floor-1', room: 'living', kind: 'floor', x: 4.5, y: 0, z: 5.0, rot: -90, maxW: 0.8, maxD: 0.7 },
  { id: 'L-floor-2', room: 'living', kind: 'floor', x: 0.5, y: 0, z: 4.55, rot: 90, maxW: 0.8, maxD: 0.7 },
  { id: 'L-wall-1', room: 'living', kind: 'wall', x: 1.0, y: 1.6, z: 4.06, rot: 0 },
  { id: 'L-wall-2', room: 'living', kind: 'wall', x: 4.94, y: 1.6, z: 4.9, rot: -90 },
  // 台所
  // 食卓の面は卓布の上（素材で測ると0.81m×縮尺0.85＝0.69m）。0.742m に置いたらティーセットが浮いて見えた（見た目の採点）
  { id: 'D-table-1', room: 'dining', kind: 'top', x: 9.1, y: 0.69, z: 6.75, rot: 0, maxW: 0.8, maxD: 0.45 },
  { id: 'D-table-2', room: 'dining', kind: 'top', x: 10.1, y: 0.69, z: 6.75, rot: 0, maxW: 0.8, maxD: 0.45 },
  { id: 'D-table-3', room: 'dining', kind: 'top', x: 9.1, y: 0.69, z: 7.25, rot: 180, maxW: 0.8, maxD: 0.45 },
  { id: 'D-table-4', room: 'dining', kind: 'top', x: 10.1, y: 0.69, z: 7.25, rot: 180, maxW: 0.8, maxD: 0.45 },
  { id: 'D-cabinet', room: 'dining', kind: 'top', x: 8.85, y: 1.181, z: 4.39, rot: 0, maxW: 0.5, maxD: 0.45 },
  { id: 'D-microwave', room: 'dining', kind: 'microwave', x: 9.45, y: 1.181, z: 4.39, rot: 0 },
  { id: 'D-stove', room: 'dining', kind: 'stove', x: 10.45, y: 0.859, z: 4.36, rot: 0, maxW: 0.45, maxD: 0.45 },
  { id: 'D-rack-1', room: 'dining', kind: 'shelf', x: 7.55, y: 1.45, z: 4.31, rot: 0, maxW: 0.5, maxD: 0.4, maxH: 0.28 },
  { id: 'D-rack-2', room: 'dining', kind: 'shelf', x: 7.95, y: 1.13, z: 4.31, rot: 0, maxW: 0.5, maxD: 0.4, maxH: 0.3 },
  { id: 'D-floor-1', room: 'dining', kind: 'floor', x: 11.45, y: 0, z: 8.4, rot: -135, maxW: 0.8, maxD: 0.7 },
  { id: 'D-floor-2', room: 'dining', kind: 'floor', x: 7.55, y: 0, z: 8.4, rot: 135, maxW: 0.8, maxD: 0.7 },
  { id: 'D-wall-1', room: 'dining', kind: 'wall', x: 7.06, y: 1.6, z: 4.9, rot: 90 },
  { id: 'D-wall-2', room: 'dining', kind: 'wall', x: 11.3, y: 1.6, z: 8.9, rot: 180 },
  // 寝室
  { id: 'B-nightstand', room: 'bedroom', kind: 'top', x: 3.45, y: 0.7, z: 0.33, rot: 0, maxW: 0.45, maxD: 0.36 },
  { id: 'B-dresser-1', room: 'bedroom', kind: 'top', x: 1.95, y: 0.83, z: 3.65, rot: 180, maxW: 0.45, maxD: 0.45 },
  { id: 'B-dresser-2', room: 'bedroom', kind: 'top', x: 2.4, y: 0.83, z: 3.65, rot: 180, maxW: 0.45, maxD: 0.45 },
  { id: 'B-dresser-3', room: 'bedroom', kind: 'top', x: 2.85, y: 0.83, z: 3.65, rot: 180, maxW: 0.45, maxD: 0.45 },
  { id: 'B-bed', room: 'bedroom', kind: 'bed', x: 2.0, y: 0.52, z: 1.75, rot: 20, maxW: 0.5, maxD: 0.5, seat: true },
  { id: 'B-rocking', room: 'bedroom', kind: 'rocking-chair', x: 0.75, y: 0, z: 3.25, rot: 135 },
  { id: 'B-suitcase', room: 'bedroom', kind: 'suitcase', x: 0.24, y: 0, z: 2.15, rot: 90 },
  { id: 'B-mirror', room: 'bedroom', kind: 'mirror', x: 2.4, y: 1.5, z: 3.94, rot: 180 },
  { id: 'B-floor-1', room: 'bedroom', kind: 'floor', x: 4.5, y: 0, z: 3.45, rot: -135, maxW: 0.8, maxD: 0.7 },
  { id: 'B-floor-2', room: 'bedroom', kind: 'floor', x: 4.45, y: 0, z: 0.55, rot: -45, maxW: 0.8, maxD: 0.7 },
  { id: 'B-wall-1', room: 'bedroom', kind: 'wall', x: 2.3, y: 1.75, z: 0.1, rot: 0 },
  { id: 'B-wall-2', room: 'bedroom', kind: 'wall', x: 4.94, y: 1.6, z: 0.8, rot: -90 },
  // 書斎
  { id: 'S-lamp', room: 'study', kind: 'desk-lamp', x: 9.45, y: 0.776, z: 0.3, rot: 20 },
  // 机は幅63cmしかない。右端寄りに置くとノートパソコンが13cmはみ出した（テストで発見）
  { id: 'S-desk', room: 'study', kind: 'top', x: 9.83, y: 0.776, z: 0.33, rot: 0, maxW: 0.34, maxD: 0.4 },
  { id: 'S-chair', room: 'study', kind: 'school-chair', x: 9.7, y: 0, z: 0.98, rot: 180 },
  { id: 'S-shelf-1', room: 'study', kind: 'shelf', x: 10.25, y: 0.67, z: 3.62, rot: 180, maxW: 0.55, maxD: 0.45, maxH: 0.27 },
  { id: 'S-shelf-2', room: 'study', kind: 'shelf', x: 10.95, y: 0.67, z: 3.62, rot: 180, maxW: 0.55, maxD: 0.45, maxH: 0.27 },
  { id: 'S-shelf-3', room: 'study', kind: 'shelf', x: 10.25, y: 0.96, z: 3.62, rot: 180, maxW: 0.55, maxD: 0.45, maxH: 0.3 },
  { id: 'S-shelf-4', room: 'study', kind: 'shelf', x: 10.95, y: 0.96, z: 3.62, rot: 180, maxW: 0.55, maxD: 0.45, maxH: 0.3 },
  { id: 'S-shelf-5', room: 'study', kind: 'shelf', x: 10.25, y: 1.28, z: 3.62, rot: 180, maxW: 0.55, maxD: 0.45, maxH: 0.36 },
  { id: 'S-shelf-6', room: 'study', kind: 'shelf', x: 10.95, y: 1.28, z: 3.62, rot: 180, maxW: 0.55, maxD: 0.45, maxH: 0.36 },
  { id: 'S-floor-1', room: 'study', kind: 'floor', x: 7.55, y: 0, z: 3.45, rot: 135, maxW: 0.8, maxD: 0.7 },
  { id: 'S-floor-2', room: 'study', kind: 'floor', x: 11.45, y: 0, z: 0.55, rot: -45, maxW: 0.8, maxD: 0.7 },
  { id: 'S-wall-1', room: 'study', kind: 'wall', x: 7.06, y: 1.6, z: 0.8, rot: 90 },
  { id: 'S-wall-2', room: 'study', kind: 'wall', x: 11.9, y: 1.6, z: 3.4, rot: -90 },
  // 廊下・玄関
  { id: 'H-clock', room: 'hall', kind: 'grandfather-clock', x: 6.0, y: 0, z: 0.32, rot: 0 },
  { id: 'H-bench-1', room: 'hall', kind: 'top', x: 5.32, y: 0.65, z: 3.8, rot: 90, maxW: 0.5, maxD: 0.45, seat: true },
  { id: 'H-bench-2', room: 'hall', kind: 'top', x: 5.32, y: 0.65, z: 4.4, rot: 90, maxW: 0.5, maxD: 0.45, seat: true },
  { id: 'H-bench-low', room: 'hall', kind: 'shelf', x: 5.32, y: 0.21, z: 4.1, rot: 90, maxW: 0.6, maxD: 0.45, maxH: 0.4 },
  /* 廊下の床は、ベンチの向かいに置くと通路が28cmまで狭まった（評価の1周目で止まる原因の1つ）。ベンチの南へずらし、小さな物だけにする */
  { id: 'H-floor-1', room: 'hall', kind: 'floor', x: 6.72, y: 0, z: 5.1, rot: -90, maxW: 0.45, maxD: 0.42 },
  { id: 'H-floor-2', room: 'entrance', kind: 'floor', x: 6.74, y: 0, z: 8.62, rot: -45, maxW: 0.42, maxD: 0.42 },
  { id: 'H-floor-3', room: 'entrance', kind: 'floor', x: 5.26, y: 0, z: 8.62, rot: 45, maxW: 0.42, maxD: 0.42 },
  { id: 'H-wall-1', room: 'hall', kind: 'wall', x: 6.94, y: 1.6, z: 4.2, rot: -90 },
  { id: 'H-wall-2', room: 'hall', kind: 'wall', x: 5.06, y: 1.65, z: 4.1, rot: 90 }
];

/** 小物ごとに、使える置き場所の種類と部屋 */
const ANY = ['living', 'dining', 'bedroom', 'study', 'hall', 'entrance'];
export const PLACEMENT = {
  armchair: { kinds: ['armchair'] },
  'rocking-chair': { kinds: ['rocking-chair'] },
  'tall-plant': { kinds: ['tall-plant'] },
  'leafy-plant': { kinds: ['floor'], rooms: ['living', 'study', 'bedroom', 'hall', 'dining'] },
  'grandfather-clock': { kinds: ['grandfather-clock'] },
  tv: { kinds: ['tv'] },
  'desk-lamp': { kinds: ['desk-lamp'] },
  'school-chair': { kinds: ['school-chair'] },
  suitcase: { kinds: ['suitcase'] },
  'oil-painting': { kinds: ['mirror'] },
  'wall-clock': { kinds: ['wall'], rooms: ANY },
  microwave: { kinds: ['microwave'] },
  pillows: { kinds: ['sofa'] },
  boombox: { kinds: ['top', 'floor'], rooms: ['living', 'study', 'bedroom'] },
  painting: { kinds: ['wall'], rooms: ANY },
  kettle: { kinds: ['stove', 'top'], rooms: ['dining'] },
  'tea-set': { kinds: ['top'], rooms: ['dining', 'living'] },
  'blue-vase': { kinds: ['top', 'floor'], rooms: ['living', 'bedroom', 'hall', 'study'] },
  laptop: { kinds: ['top'], rooms: ['study', 'living', 'bedroom'] },
  'wine-bottles': { kinds: ['top', 'shelf'], rooms: ['dining'] },
  'mantel-clock': { kinds: ['top', 'shelf'], rooms: ['living', 'bedroom', 'study', 'hall'] },
  'oil-lamp': { kinds: ['top'], rooms: ['bedroom', 'living', 'study', 'hall'] },
  chess: { kinds: ['top'], rooms: ['living', 'study'] },
  'cat-statue': { kinds: ['top', 'shelf', 'floor'], rooms: ANY },
  lantern: { kinds: ['top', 'floor'], rooms: ['hall', 'entrance', 'living', 'bedroom'] },
  'watering-can': { kinds: ['floor', 'top'], rooms: ['hall', 'entrance', 'dining', 'living'] },
  cake: { kinds: ['top'], rooms: ['dining', 'living'] },
  ukulele: { kinds: ['top', 'floor'], rooms: ['bedroom', 'study', 'living'] },
  basket: { kinds: ['floor', 'top', 'shelf'], rooms: ANY },
  bananas: { kinds: ['top', 'shelf'], rooms: ['dining'] },
  duck: { kinds: ['top', 'floor', 'shelf', 'bed'], rooms: ANY },
  'alarm-clock': { kinds: ['top', 'shelf'], rooms: ['bedroom', 'study', 'living'] },
  camera: { kinds: ['top', 'shelf'], rooms: ['study', 'living', 'bedroom', 'hall'] },
  cassette: { kinds: ['top', 'shelf'], rooms: ['living', 'study', 'bedroom'] },
  binoculars: { kinds: ['top', 'shelf'], rooms: ['study', 'hall', 'living'] },
  apple: { kinds: ['top', 'shelf'], rooms: ['dining', 'living', 'study'] },
  lemon: { kinds: ['top', 'shelf'], rooms: ['dining'] },
  horse: { kinds: ['top', 'shelf'], rooms: ['living', 'study', 'bedroom', 'hall'] },
  elephant: { kinds: ['top', 'shelf'], rooms: ['living', 'study', 'bedroom', 'hall'] },
  jug: { kinds: ['top', 'shelf'], rooms: ['dining', 'living'] },
  'photo-frame': { kinds: ['top', 'shelf'], rooms: ['bedroom', 'living', 'study', 'hall'] },
  succulent: { kinds: ['top', 'shelf'], rooms: ANY },
  'enamel-pot': { kinds: ['stove', 'top', 'shelf'], rooms: ['dining'] }
};

/** 置き場所の呼び名（答え合わせの「どこにあったか」に使う） */
const SLOT_LABELS = [
  [/^L-tv$/, 'テレビ台の上'], [/^L-cab-/, 'テレビ台の上'], [/^L-table-/, 'ローテーブルの上'], [/^L-side$/, 'ソファ横の小さな台の上'],
  [/^L-shelf-top-/, '四角い棚の上'], [/^L-cubby-/, '四角い棚の中'], [/^L-sofa$/, 'ソファの上'], [/^L-armchair$/, '窓の前'],
  [/^L-plant$/, '窓ぎわの角'], [/^L-floor-/, '隅の床'], [/^L-wall-/, '壁'],
  [/^D-table-/, 'テーブルの上'], [/^D-cabinet$/, '白い食器棚の上'], [/^D-microwave$/, '白い食器棚の上'], [/^D-stove$/, 'コンロの上'],
  [/^D-rack-/, '棚'], [/^D-floor-/, '隅の床'], [/^D-wall-/, '壁'],
  [/^B-nightstand$/, 'ベッドわきの台の上'], [/^B-dresser-/, 'たんすの上'], [/^B-bed$/, 'ベッドの上'], [/^B-rocking$/, '隅'],
  [/^B-suitcase$/, '窓の下'], [/^B-mirror$/, 'たんすの上の壁'], [/^B-floor-/, '隅の床'], [/^B-wall-/, '壁'],
  [/^S-lamp$/, '机の上'], [/^S-desk$/, '机の上'], [/^S-chair$/, '机の前'], [/^S-shelf-/, '本棚'], [/^S-floor-/, '隅の床'], [/^S-wall-/, '壁'],
  [/^H-clock$/, '突き当たり'], [/^H-bench-low$/, 'ベンチの下の段'], [/^H-bench-/, 'ベンチの上'], [/^H-floor-/, '床'], [/^H-wall-/, '壁']
];

export function slotLabel(slotId) {
  const hit = SLOT_LABELS.find(([re]) => re.test(slotId));
  return hit ? hit[1] : '';
}

/** 例: 「リビングのテレビ台の上」 */
export function describeSlot(slotId) {
  const slot = slotById(slotId);
  if (!slot) return '';
  return `${roomById(slot.room).name}の${slotLabel(slotId)}`;
}

export function roomAt(x, z) {
  // 玄関と廊下の境は玄関を優先する
  const hit = ROOMS.filter(r => x >= r.rect[0] && x <= r.rect[2] && z >= r.rect[1] && z <= r.rect[3]);
  return hit.find(r => r.id === 'entrance') || hit[0] || null;
}

export function roomById(id) {
  return ROOMS.find(r => r.id === id) || null;
}

export function slotById(id) {
  return SLOTS.find(s => s.id === id) || null;
}
