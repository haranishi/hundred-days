/* プロモ動画の絵コンテ。ここの秒数が、画（render-promo.mjs）と音（promo-audio.mjs）の
   両方の土台になる。片方だけ動かすと合わなくなる。秒は t0（動画の0秒）からの秒数。 */

export const DURATION_SECONDS = 35;
export const DEFAULT_FPS = 30;
export const BPM = 84;

export const ANSWER_START = 3.2;
export const SENTO_START = 7.4;
export const TREND_START = 12.4;
export const PREF_START = 16.4;
export const BATH_START = 22.4;
export const VISIT_START = 27.4;
export const END_START = 30.6;

/* 1コマ目を「柱が伸びている途中」にするため、t0 のこの秒数前に「源泉の数」を押し直して柱を伸ばし始める。
   柱は1.2秒の ease-out で伸び切る（lib/pillars.js の GROW_MS）ので、0.15秒前なら1コマ目は約3割の高さ。
   撮影の外で「温泉地の数」にしておき、そこから戻す */
export const GROW_LEAD = 0.15;

/* 画面を押す瞬間。字幕はこの時刻とは別に、場面の頭で切り替える */
export const T_SENTO = SENTO_START + 0.1;     // 「銭湯の数」
export const T_TOP3 = SENTO_START + 1.6;      // 順位の表を送って、上位3県を見せる（押さない）
export const T_SOURCES = PREF_START + 0.15;   // 「源泉の数」に戻す
export const T_OITA = PREF_START + 1.35;      // 順位の「大分県」（柱が伸び切ってから）
export const T_CHIP = BATH_START + 0.1;       // 「温泉」のチップ
export const T_MORE = BATH_START + 1.0;       // 「もっと見る」（竹瓦温泉は温泉93件の58番目で、最初の50件に無い）
export const T_BATH = BATH_START + 1.7;       // 「竹瓦温泉」
export const T_VISIT = VISIT_START + 0.6;     // 「行った」

/* 竹瓦温泉（別府の共同浴場）。id は OpenStreetMap の way。カードの Googleマップの座標と突き合わせる */
export const BATH_ID = 'w338231731';
export const BATH_NAME = '竹瓦温泉';

export const STORYBOARD = Object.freeze([
  { id: 'S0', name: 'フック（開いた直後、柱が地面から伸びる）', start: 0, end: ANSWER_START },
  { id: 'S1', name: '見出し（源泉の数、1位は大分県。5,094か所）', start: ANSWER_START, end: SENTO_START },
  { id: 'S2', name: '銭湯の数に切り替える（東京・大阪・青森）', start: SENTO_START, end: TREND_START },
  { id: 'S3', name: '推移の1行（4年で501軒減）', start: TREND_START, end: PREF_START },
  { id: 'S4', name: '源泉の数に戻して大分県を押す（お風呂の点が出る）', start: PREF_START, end: BATH_START },
  { id: 'S5', name: '温泉に絞って竹瓦温泉のカードを開く', start: BATH_START, end: VISIT_START },
  { id: 'S6', name: '「行った」を押す', start: VISIT_START, end: END_START },
  { id: 'S7', name: 'エンド', start: END_START, end: DURATION_SECONDS },
]);

/* 1行16字・2行まで。上下左右10%の安全域の内側に置く（render-promo.mjs が書き出しの前後に測る）。
   数字は実際の画面から取る。render-promo.mjs の expect() が画面の文字と突き合わせ、食い違ったら止まる。
   tone は2行目の色（onsen＝柱の橙、sento＝銭湯の柱の水色）。字幕の置き場所は描画側が画面の形から決める */
export const CAPTIONS = Object.freeze([
  { start: 0, end: ANSWER_START, lines: ['日本でいちばん', '温泉が湧く県は？'], tone: 'onsen' },
  { start: ANSWER_START, end: SENTO_START, lines: ['源泉の数、1位は大分県', '5,094か所'], tone: 'onsen' },
  { start: SENTO_START, end: TREND_START, lines: ['銭湯の数だと', '東京・大阪・青森'], tone: 'sento' },
  { start: TREND_START, end: PREF_START, lines: ['銭湯は4年で', '501軒減った'], tone: 'sento' },
  { start: PREF_START, end: BATH_START, lines: ['県を押すと', 'その県のお風呂が地図に'], tone: 'onsen' },
  { start: BATH_START, end: VISIT_START, lines: ['Googleマップで', 'すぐ開ける'], tone: 'onsen' },
  { start: VISIT_START, end: END_START, lines: ['行ったお風呂に', '印をつけて'], tone: 'onsen' },
]);

/* 字幕が指しているものを枠で囲む時間。target は描画側が画面の要素に引き直す */
export const FOCUS = Object.freeze([
  { start: ANSWER_START + 0.3, end: SENTO_START - 0.15, target: 'headline' },
  { start: T_TOP3 + 0.75, end: TREND_START - 0.15, target: 'top3' },
  { start: TREND_START + 0.25, end: PREF_START - 0.1, target: 'trend' },
  { start: T_BATH + 1.0, end: VISIT_START - 0.1, target: 'maps' },
  { start: T_VISIT + 0.4, end: END_START - 0.15, target: 'visit' },
]);

/* 音の刻みに使う。correct は「当たった」の音（県に寄る・行ったを付ける） */
export const TAPS = Object.freeze([
  { at: T_SENTO, target: 'sento', kind: 'switch' },
  { at: T_SOURCES, target: 'sources', kind: 'switch' },
  { at: T_OITA, target: 'oita', kind: 'correct' },
  { at: T_CHIP, target: 'chip', kind: 'tap' },
  { at: T_MORE, target: 'more', kind: 'tap' },
  { at: T_BATH, target: 'bath', kind: 'tap' },
  { at: T_VISIT, target: 'visit', kind: 'correct' },
]);

export const sceneStart = (id) => STORYBOARD.find((scene) => scene.id === id)?.start ?? 0;
export const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
