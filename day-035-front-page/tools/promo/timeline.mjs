/* プロモ動画の絵コンテ。ここの秒数が、画（render-promo.mjs）と音（promo-audio.mjs）の
   両方の土台になる。片方だけ動かすと合わなくなる。 */

export const DURATION_SECONDS = 34;
export const DEFAULT_FPS = 30;

export const TITLE_START = 3.2;
export const SECOND_START = 6.2;
export const THIRD_START = 13.0;
export const DETAIL_START = 19.4;
export const SAVE_START = 24.4;
export const PROMISE_START = 28.6;
export const END_START = 31.4;
/* 音側が「答えが出そろう山」に使う時刻。紙面が3本になるところ */
export const RESULT_START = DETAIL_START;
export const T_CONFIRM_TAP = SAVE_START + 0.6;

export const STORYBOARD = Object.freeze([
  { id: 'S0', name: 'フック', start: 0, end: TITLE_START },
  { id: 'S1', name: 'タイトル', start: TITLE_START, end: SECOND_START },
  { id: 'S2', name: '二本目', start: SECOND_START, end: THIRD_START },
  { id: 'S3', name: '三本目', start: THIRD_START, end: DETAIL_START },
  { id: 'S4', name: '紙面の細部', start: DETAIL_START, end: SAVE_START },
  { id: 'S5', name: '保存', start: SAVE_START, end: PROMISE_START },
  { id: 'S6', name: '約束', start: PROMISE_START, end: END_START },
  { id: 'S7', name: 'エンド', start: END_START, end: DURATION_SECONDS }
]);

/* 1行16字・2行まで。10%のセーフエリアの内側に置く */
export const CAPTIONS = Object.freeze([
  { start: 0, end: TITLE_START, lines: ['読んだ記事、', 'リンクのままですか'] },
  { start: TITLE_START, end: SECOND_START, lines: ['貼ると、新聞の', '一面になります'] },
  { start: SECOND_START, end: 9.6, lines: ['二本目を足すと'] },
  { start: 9.6, end: THIRD_START, lines: ['二番手が左に入る'] },
  { start: THIRD_START, end: 16.4, lines: ['三本まで'] },
  { start: 16.4, end: DETAIL_START, lines: ['右にあるほど、大きい'] },
  { start: DETAIL_START, end: 21.9, lines: ['写真は新聞の網点'] },
  { start: 21.9, end: SAVE_START, lines: ['日付は漢数字で'] },
  { start: SAVE_START, end: PROMISE_START, lines: ['そのまま画像で', '保存できます'] },
  { start: PROMISE_START, end: END_START, lines: ['本文は取りません', '出所は紙面に残ります'] }
]);

/* 音の刻みに使う。画面を押す瞬間 */
export const TAPS = Object.freeze([
  { at: SECOND_START + 0.3, target: 'more', kind: 'hint' },
  { at: THIRD_START + 0.3, target: 'more', kind: 'hint' },
  { at: T_CONFIRM_TAP, target: 'save', kind: 'correct' }
]);

export const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
export const captionAt = (t) => CAPTIONS.find(({ start, end }) => t >= start && t < end) ?? null;
