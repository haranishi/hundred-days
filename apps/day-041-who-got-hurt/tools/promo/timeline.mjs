/* プロモ動画の絵コンテ。ここの秒数が、画（render-promo.mjs）と音（promo-audio.mjs）の
   両方の土台になる。片方だけ動かすと合わなくなる。 */

export const DURATION_SECONDS = 35;
export const DEFAULT_FPS = 30;

export const ANSWER_START = 3.4;
export const BREAKDOWN_START = 7.6;
export const SPOTS_START = 12.0;
export const HOURS_START = 17.0;
export const PLACE_START = 22.0;
export const SOURCE_START = 28.0;
export const END_START = 31.8;
/* 音側が「答えが出そろう山」に使う時刻。東京駅の答えが読める位置に着くところ */
export const RESULT_START = ANSWER_START;
/* いちばんの山＝場所を高知駅に変えて、答えが「132件」に入れ替わる瞬間。
   候補を押してから答えが書き換わるまでの間があるので、字幕はこれより後に出す */
export const T_CONFIRM_TAP = PLACE_START + 1.4;
/* 高知の答えが画面に出そろってから字幕を出す時刻 */
export const KOCHI_ANSWER = 23.8;
export const KOCHI_BIKE = 26.0;
/* 場所を変えにいく（S4 の終わりから picker へ戻る）。字幕もここで先に切り替える */
export const PLACE_LEAD = 21.4;

export const STORYBOARD = Object.freeze([
  { id: 'S0', name: 'フック（地図から答えへ上る）', start: 0, end: ANSWER_START },
  { id: 'S1', name: '答え（東京駅は6年間に351件）', start: ANSWER_START, end: BREAKDOWN_START },
  { id: 'S2', name: '内訳（歩行者78件・自転車76件）', start: BREAKDOWN_START, end: SPOTS_START },
  { id: 'S3', name: '事故が集まっている地点の1位', start: SPOTS_START, end: HOURS_START },
  { id: 'S4', name: '何時に起きているか（18時台）', start: HOURS_START, end: PLACE_START },
  { id: 'S5', name: '場所を高知駅に変える（答えが入れ替わる）', start: PLACE_START, end: SOURCE_START },
  { id: 'S6', name: '出典と、この数字で分からないこと', start: SOURCE_START, end: END_START },
  { id: 'S7', name: 'エンド', start: END_START, end: DURATION_SECONDS },
]);

/* 1行16字・2行まで。10%のセーフエリアの内側に置く。
   数字は実際の画面から取る。render-promo.mjs が書き出し前に画面と突き合わせて、
   食い違っていたら止まる（Day 038・040 で実際に食い違いを止めた仕組み）。
   このアプリは記録を出すだけで評価しないので、字幕にも「危ない」「気をつけよう」は書かない */
export const CAPTIONS = Object.freeze([
  { start: 0, end: ANSWER_START, lines: ['毎日通る道で、'] },
  { start: ANSWER_START, end: BREAKDOWN_START, lines: ['6年間に351件'] },
  { start: BREAKDOWN_START, end: SPOTS_START, lines: ['歩行者78件、自転車76件'] },
  { start: SPOTS_START, end: HOURS_START, lines: ['北東440mの交差点に16件'] },
  { start: HOURS_START, end: PLACE_LEAD, lines: ['いちばん多いのは18時台'] },
  { start: PLACE_LEAD, end: KOCHI_ANSWER, lines: ['場所を高知駅に変えると'] },
  { start: KOCHI_ANSWER, end: KOCHI_BIKE, lines: ['高知駅は132件。'] },
  { start: KOCHI_BIKE, end: SOURCE_START, lines: ['でも61件が自転車'] },
  { start: SOURCE_START, end: END_START, lines: ['件数は交通量で', '割っていません'] },
]);

/* 音の刻みに使う。画面を押す瞬間 */
export const TAPS = Object.freeze([
  { at: PLACE_START, target: 'search', kind: 'hint' },
  { at: T_CONFIRM_TAP, target: 'place', kind: 'correct' },
]);
