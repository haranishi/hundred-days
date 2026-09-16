/* プロモ動画の絵コンテ。ここの秒数が、画（render-promo.mjs）と音（promo-audio.mjs）の
   両方の土台になる。片方だけ動かすと合わなくなる。 */

export const DURATION_SECONDS = 35;
export const DEFAULT_FPS = 30;

export const ANSWER_START = 3.4;
export const UNUSABLE_START = 7.6;
export const SWITCH_START = 12.8;
export const PLACE_START = 18.2;
export const USABLE_START = 24.2;
export const SOURCE_START = 28.4;
export const END_START = 31.8;
/* 音側が「答えが出そろう山」に使う時刻。秋田の答えが読める位置に着くところ */
export const RESULT_START = ANSWER_START;
/* いちばんの山＝場所を高知に変えて、答えが「15か所が使えない」に入れ替わる瞬間 */
export const T_CONFIRM_TAP = PLACE_START + 1.4;

export const STORYBOARD = Object.freeze([
  { id: 'S0', name: 'フック（一覧から答えへ上る）', start: 0, end: ANSWER_START },
  { id: 'S1', name: '答え（秋田駅は170m先が使える）', start: ANSWER_START, end: UNUSABLE_START },
  { id: 'S2', name: '近いのに使えない場所', start: UNUSABLE_START, end: SWITCH_START },
  { id: 'S3', name: '津波に切り替える（答えが変わる）', start: SWITCH_START, end: PLACE_START },
  { id: 'S4', name: '場所を高知に変える（15か所が使えない）', start: PLACE_START, end: USABLE_START },
  { id: 'S5', name: '洪水で使えるのは470m先', start: USABLE_START, end: SOURCE_START },
  { id: 'S6', name: '出典と注意', start: SOURCE_START, end: END_START },
  { id: 'S7', name: 'エンド', start: END_START, end: DURATION_SECONDS },
]);

/* 1行16字・2行まで。10%のセーフエリアの内側に置く。
   数字は実際の画面から取る。render-promo.mjs が書き出し前に画面と突き合わせて、
   食い違っていたら止まる（Day 038 で字幕と答えが食い違った反省） */
export const CAPTIONS = Object.freeze([
  { start: 0, end: ANSWER_START, lines: ['いちばん近い避難場所、'] },
  { start: ANSWER_START, end: 5.6, lines: ['洪水でも使える？'] },
  { start: 5.6, end: UNUSABLE_START, lines: ['秋田駅は170m先が使える'] },
  { start: UNUSABLE_START, end: 10.2, lines: ['でも2番目に近い公園は'] },
  { start: 10.2, end: SWITCH_START, lines: ['洪水では使えない'] },
  { start: SWITCH_START, end: 15.5, lines: ['津波に切り替えると'] },
  { start: 15.5, end: PLACE_START, lines: ['使える場所が変わる'] },
  { start: PLACE_START, end: 21.2, lines: ['高知駅では、'] },
  { start: 21.2, end: USABLE_START, lines: ['近い15か所が使えない'] },
  { start: USABLE_START, end: 26.3, lines: ['洪水で使えるのは'] },
  { start: 26.3, end: SOURCE_START, lines: ['470m先の小学校'] },
  { start: SOURCE_START, end: END_START, lines: ['国土地理院の指定データ。', '市町村の情報で確かめて'] },
]);

/* 音の刻みに使う。画面を押す瞬間 */
export const TAPS = Object.freeze([
  { at: SWITCH_START + 0.4, target: 'switch', kind: 'hint' },
  { at: T_CONFIRM_TAP, target: 'place', kind: 'correct' },
  { at: USABLE_START + 0.3, target: 'usable', kind: 'hint' },
]);

export const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
