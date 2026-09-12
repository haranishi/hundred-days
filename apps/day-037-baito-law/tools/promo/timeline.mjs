/* プロモ動画の絵コンテ。ここの秒数が、画（render-promo.mjs）と音（promo-audio.mjs）の
   両方の土台になる。片方だけ動かすと合わなくなる。 */

export const DURATION_SECONDS = 34;
export const DEFAULT_FPS = 30;

export const TITLE_START = 3.2;
export const RUBY_START = 6.2;
export const ACTOR_START = 13.0;
export const OTHER_LAW_START = 19.4;
export const SOURCE_START = 24.4;
export const PROMISE_START = 28.6;
export const END_START = 31.4;
/* 音側が「答えが出そろう山」に使う時刻。主語の色分けが見えるところ */
export const RESULT_START = ACTOR_START;
export const T_CONFIRM_TAP = OTHER_LAW_START + 0.8;

export const STORYBOARD = Object.freeze([
  { id: 'S0', name: 'フック', start: 0, end: TITLE_START },
  { id: 'S1', name: 'タイトル', start: TITLE_START, end: RUBY_START },
  { id: 'S2', name: 'ルビ', start: RUBY_START, end: ACTOR_START },
  { id: 'S3', name: '主語', start: ACTOR_START, end: OTHER_LAW_START },
  { id: 'S4', name: '別の法令', start: OTHER_LAW_START, end: SOURCE_START },
  { id: 'S5', name: '施行日と原典', start: SOURCE_START, end: PROMISE_START },
  { id: 'S6', name: '約束', start: PROMISE_START, end: END_START },
  { id: 'S7', name: 'エンド', start: END_START, end: DURATION_SECONDS },
]);

/* 1行16字・2行まで。10%のセーフエリアの内側に置く */
export const CAPTIONS = Object.freeze([
  { start: 0, end: TITLE_START, lines: ['バイト先の決まり、', '原文を読めますか'] },
  { start: TITLE_START, end: RUBY_START, lines: ['選ぶと、根拠の条文が', 'そのまま出ます'] },
  { start: RUBY_START, end: 9.8, lines: ['六箇月。八割。', '十労働日。'] },
  { start: 9.8, end: ACTOR_START, lines: ['漢数字に、読みがつく'] },
  { start: ACTOR_START, end: 16.4, lines: ['「使用者」は雇う側'] },
  { start: 16.4, end: OTHER_LAW_START, lines: ['「労働者」は、あなた'] },
  { start: OTHER_LAW_START, end: 22.2, lines: ['辞めたいときは民法'] },
  { start: 22.2, end: SOURCE_START, lines: ['同じ形で出ます'] },
  { start: SOURCE_START, end: PROMISE_START, lines: ['いつ時点の条文かと、', '原典へのリンクつき'] },
  { start: PROMISE_START, end: END_START, lines: ['判断はしません。', '困ったら相談窓口へ'] },
]);

/* 音の刻みに使う。画面を押す瞬間 */
export const TAPS = Object.freeze([
  { at: RUBY_START + 0.3, target: 'ruby', kind: 'hint' },
  { at: ACTOR_START + 0.3, target: 'actor', kind: 'hint' },
  { at: T_CONFIRM_TAP, target: 'other-law', kind: 'correct' },
]);

export const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
export const captionAt = (t) => CAPTIONS.find(({ start, end }) => t >= start && t < end) ?? null;
