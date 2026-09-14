/* プロモ動画の絵コンテ。ここの秒数が、画（render-promo.mjs）と音（promo-audio.mjs）の
   両方の土台になる。片方だけ動かすと合わなくなる。 */

export const DURATION_SECONDS = 35;
export const DEFAULT_FPS = 30;

export const ANSWER_START = 3.4;
export const COINS_START = 7.6;
export const NEAR_START = 13.0;
export const CHART_START = 18.4;
export const FACTS_START = 23.4;
export const CAVEAT_START = 28.4;
export const END_START = 31.8;
/* 音側が「答えが出そろう山」に使う時刻。1960年の6,222円が出るところ */
export const RESULT_START = ANSWER_START;
export const T_CONFIRM_TAP = NEAR_START + 0.9;

export const STORYBOARD = Object.freeze([
  { id: 'S0', name: 'フック（年を送る）', start: 0, end: ANSWER_START },
  { id: 'S1', name: '答え', start: ANSWER_START, end: COINS_START },
  { id: 'S2', name: '丸の大きさ比べ', start: COINS_START, end: NEAR_START },
  { id: 'S3', name: '近い年（1995年）', start: NEAR_START, end: CHART_START },
  { id: 'S4', name: '折れ線', start: CHART_START, end: FACTS_START },
  { id: 'S5', name: '分かったこと', start: FACTS_START, end: CAVEAT_START },
  { id: 'S6', name: 'ことわり', start: CAVEAT_START, end: END_START },
  { id: 'S7', name: 'エンド', start: END_START, end: DURATION_SECONDS },
]);

/* 1行16字・2行まで。10%のセーフエリアの内側に置く */
export const CAPTIONS = Object.freeze([
  { start: 0, end: ANSWER_START, lines: ['1960年の1,000円は、'] },
  { start: ANSWER_START, end: 5.6, lines: ['いまの6,222円'] },
  { start: 5.6, end: COINS_START, lines: ['6.22倍になりました'] },
  { start: COINS_START, end: 10.4, lines: ['同じ「1,000円」でも、'] },
  { start: 10.4, end: NEAR_START, lines: ['中身はこれだけ違う'] },
  { start: NEAR_START, end: 15.8, lines: ['では、2000年は？'] },
  { start: 15.8, end: CHART_START, lines: ['1,150円。25年で15%'] },
  { start: CHART_START, end: FACTS_START, lines: ['止まっていた25年が、', 'そのまま線に出る'] },
  { start: FACTS_START, end: 26.0, lines: ['動かなかった年が13年'] },
  { start: 26.0, end: CAVEAT_START, lines: ['同じ期間、米国は1.8倍'] },
  { start: CAVEAT_START, end: END_START, lines: ['給料の話ではありません', '出典は世界銀行'] },
]);

/* 音の刻みに使う。画面を押す瞬間 */
export const TAPS = Object.freeze([
  { at: COINS_START + 0.3, target: 'coins', kind: 'hint' },
  { at: T_CONFIRM_TAP, target: 'near', kind: 'correct' },
  { at: FACTS_START + 0.3, target: 'facts', kind: 'hint' },
]);

export const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
