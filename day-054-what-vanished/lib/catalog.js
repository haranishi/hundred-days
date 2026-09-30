// 家に置く物の一覧。file は assets/models/<file>.glb。
// size は消える物の大きさの組（L=かんたん・M=ふつう・S=むずかしい）。家具（size なし）は消えない。
// scale は素材の寸法を実物らしく直す倍率、front は正面を +Z に向けるための回転（度）。
// 寸法（m）は data/models.json の値に scale を掛けたもの。

/** 動かない家具 */
export const FURNITURE = {
  sofa: { file: 'sofa' },
  'coffee-table': { file: 'coffee-table', front: 90 },
  'tv-cabinet': { file: 'tv-cabinet' },
  'cube-shelf': { file: 'cube-shelf', front: -90 },
  'side-table': { file: 'side-table' },
  'dining-table': { file: 'dining-table', scale: 0.85 },
  'dining-chair': { file: 'dining-chair' },
  stove: { file: 'stove' },
  'kitchen-cabinet': { file: 'kitchen-cabinet' },
  'kitchen-rack': { file: 'kitchen-rack' },
  bed: { file: 'bed' },
  nightstand: { file: 'nightstand' },
  dresser: { file: 'dresser' },
  desk: { file: 'desk', scale: 0.88 },
  bookshelf: { file: 'bookshelf' },
  bench: { file: 'bench' },
  chandelier: { file: 'chandelier', scale: 0.72 },
  'ceiling-lamp': { file: 'ceiling-lamp', scale: 0.85 }
};

/** 消えるかもしれない物。name は答えの札に出す名前 */
export const PROPS = {
  // L：かんたん（遠くからでも目に入る大きさ）
  armchair: { file: 'armchair', name: 'ひじかけ椅子', size: 'L' },
  'rocking-chair': { file: 'rocking-chair', name: 'ゆり椅子', size: 'L' },
  'tall-plant': { file: 'tall-plant', name: '背の高い観葉植物', size: 'L' },
  'leafy-plant': { file: 'leafy-plant', name: '葉の大きい観葉植物', size: 'L' },
  'grandfather-clock': { file: 'grandfather-clock', name: '大きな振り子時計', size: 'L' },
  tv: { file: 'tv', name: 'テレビ', size: 'L' },
  'desk-lamp': { file: 'desk-lamp', name: 'オレンジの電気スタンド', size: 'L' },
  'school-chair': { file: 'school-chair', name: '青い椅子', size: 'L' },
  suitcase: { file: 'suitcase', name: '旅行かばん', size: 'L' },
  'oil-painting': { file: 'oil-painting', name: '金の額の風景画', size: 'L' },
  'wall-clock': { file: 'wall-clock', name: '壁の丸い時計', size: 'L' },
  microwave: { file: 'microwave', name: '電子レンジ', size: 'L', scale: 0.55 },
  pillows: { file: 'pillows', name: 'ジグザグ柄のクッション', size: 'L' },
  boombox: { file: 'boombox', name: 'ラジカセ', size: 'L', scale: 0.8 },
  painting: { file: 'painting', name: '額に入った絵', size: 'L' },
  // M：ふつう
  kettle: { file: 'kettle', name: 'やかん', size: 'M' },
  'tea-set': { file: 'tea-set', name: 'ティーセット', size: 'M', scale: 0.8 },
  'blue-vase': { file: 'blue-vase', name: '青い花がらの花びん', size: 'M' },
  laptop: { file: 'laptop', name: 'ノートパソコン', size: 'M', scale: 0.6 },
  'wine-bottles': { file: 'wine-bottles', name: 'ワインのびん', size: 'M' },
  'mantel-clock': { file: 'mantel-clock', name: '木の置き時計', size: 'M', scale: 1.3 },
  'oil-lamp': { file: 'oil-lamp', name: '石油ランプ', size: 'M', scale: 0.7 },
  chess: { file: 'chess', name: 'チェス盤', size: 'M', scale: 0.8 },
  'cat-statue': { file: 'cat-statue', name: '猫の置物', size: 'M' },
  lantern: { file: 'lantern', name: '木のランタン', size: 'M', scale: 0.8 },
  'watering-can': { file: 'watering-can', name: 'じょうろ', size: 'M' },
  cake: { file: 'cake', name: 'いちごのケーキ', size: 'M' },
  ukulele: { file: 'ukulele', name: 'ウクレレ', size: 'M' },
  basket: { file: 'basket', name: 'かご', size: 'M' },
  bananas: { file: 'bananas', name: 'バナナ', size: 'M', scale: 0.7 },
  duck: { file: 'duck', name: 'アヒルのおもちゃ', size: 'M', scale: 0.7 },
  // S：むずかしい（近づかないと見えない）
  'alarm-clock': { file: 'alarm-clock', name: '目覚まし時計', size: 'S', scale: 1.2 },
  camera: { file: 'camera', name: 'カメラ', size: 'S' },
  cassette: { file: 'cassette', name: 'カセットプレーヤー', size: 'S' },
  binoculars: { file: 'binoculars', name: '双眼鏡', size: 'S' },
  apple: { file: 'apple', name: 'りんご', size: 'S' },
  lemon: { file: 'lemon', name: 'レモン', size: 'S' },
  horse: { file: 'horse', name: '白い馬の置物', size: 'S' },
  elephant: { file: 'elephant', name: '木彫りのゾウ', size: 'S', scale: 1.4 },
  jug: { file: 'jug', name: '花がらの水差し', size: 'S' },
  'photo-frame': { file: 'photo-frame', name: '写真立て', size: 'S' },
  succulent: { file: 'succulent', name: '小さな鉢植え', size: 'S' },
  'enamel-pot': { file: 'enamel-pot', name: 'ホーロー鍋', size: 'S' }
};

export const SIZE_NAMES = { L: '大きな物', M: '中くらいの物', S: '小さな物' };

/**
 * むずかしさ。pool は消える物の組、choices は問ごとの候補の数、searchSeconds は探す時間。
 * 1ゲームの中でも歯応えが増すよう、候補の数を問ごとに増やす（評価の1周目「3問とも同じ難しさ」への対応）。
 */
export const LEVELS = {
  easy: { id: 'easy', name: 'かんたん', pool: ['L'], choices: [4, 4, 5], searchSeconds: 60, next: 'normal' },
  normal: { id: 'normal', name: 'ふつう', pool: ['M'], choices: [4, 6, 8], searchSeconds: 60, next: 'hard' },
  hard: { id: 'hard', name: 'むずかしい', pool: ['S'], choices: [6, 8, 8], searchSeconds: 60, next: null }
};

export const MEMORIZE_SECONDS = 60;
export const ROUNDS = 3;

export function propIds() {
  return Object.keys(PROPS);
}
