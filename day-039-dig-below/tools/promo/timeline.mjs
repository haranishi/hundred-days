/* プロモ動画の絵コンテ。ここの秒数が、画（render-promo.mjs）と音（promo-audio.mjs）の
   両方の土台になる。片方だけ動かすと合わなくなる。 */

export const DURATION_SECONDS = 35;
export const DEFAULT_FPS = 30;

export const ANSWER_START = 3.4;
export const DOWN_START = 7.6;
export const OPEN_START = 12.8;
export const SWITCH_START = 18.2;
export const DEEP_START = 24.2;
export const SOURCE_START = 28.4;
export const END_START = 31.8;
/* 音側が「答えが出そろう山」に使う時刻。柱が立ち上がって年代が出るところ */
export const RESULT_START = ANSWER_START;
/* いちばんの山＝場所を変えて柱が入れ替わる瞬間 */
export const T_CONFIRM_TAP = SWITCH_START + 0.9;

export const STORYBOARD = Object.freeze([
  { id: 'S0', name: 'フック（柱が立ち上がる）', start: 0, end: ANSWER_START },
  { id: 'S1', name: '答え（何年前・どんな場所）', start: ANSWER_START, end: DOWN_START },
  { id: 'S2', name: '柱を下る（時代をさかのぼる）', start: DOWN_START, end: OPEN_START },
  { id: 'S3', name: '層を開く（何がいたか）', start: OPEN_START, end: SWITCH_START },
  { id: 'S4', name: '場所を変える（柱が一変）', start: SWITCH_START, end: DEEP_START },
  { id: 'S5', name: '柱の底（いちばん古い層）', start: DEEP_START, end: SOURCE_START },
  { id: 'S6', name: '出典（論文まで辿れる）', start: SOURCE_START, end: END_START },
  { id: 'S7', name: 'エンド', start: END_START, end: DURATION_SECONDS },
]);

/* 1行16字・2行まで。10%のセーフエリアの内側に置く。
   数字は実際の画面から取った。render-promo.mjs が書き出し前に画面と突き合わせて、
   食い違っていたら止まる（Day 038 で字幕と答えが食い違った反省） */
export const CAPTIONS = Object.freeze([
  { start: 0, end: ANSWER_START, lines: ['この地面の下に、'] },
  { start: ANSWER_START, end: 5.6, lines: ['1,598万年前の海がある'] },
  { start: 5.6, end: DOWN_START, lines: ['0.2km先で見つかった記録'] },
  { start: DOWN_START, end: 10.2, lines: ['下へ行くほど、古い'] },
  { start: 10.2, end: OPEN_START, lines: ['色は地質図と同じ'] },
  { start: OPEN_START, end: 15.5, lines: ['層を開くと、'] },
  { start: 15.5, end: SWITCH_START, lines: ['何がいたかが出る'] },
  { start: SWITCH_START, end: 21.2, lines: ['場所を変えると、'] },
  { start: 21.2, end: DEEP_START, lines: ['柱がまるごと変わる'] },
  { start: DEEP_START, end: 26.3, lines: ['高知の柱は9層。底は'] },
  { start: 26.3, end: SOURCE_START, lines: ['2億7,440万年前'] },
  { start: SOURCE_START, end: END_START, lines: ['ぜんぶ、誰かが', '論文に書いた記録です'] },
]);

/* 音の刻みに使う。画面を押す瞬間 */
export const TAPS = Object.freeze([
  { at: OPEN_START + 0.3, target: 'layer', kind: 'hint' },
  { at: T_CONFIRM_TAP, target: 'switch', kind: 'correct' },
  { at: DEEP_START + 0.3, target: 'deep', kind: 'hint' },
]);

export const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
