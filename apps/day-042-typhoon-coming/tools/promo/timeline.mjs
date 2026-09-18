/* プロモ動画の絵コンテ。ここの秒数が、画（render-promo.mjs）と音（promo-audio.mjs）の
   両方の土台になる。片方だけ動かすと合わなくなる。 */

export const DURATION_SECONDS = 35;
export const DEFAULT_FPS = 30;

export const ANSWER_START = 3.4;
export const PEAK_START = 8.0;
export const BAND_START = 12.5;
export const MAP_START = 17.0;
export const PLACE_START = 22.0;
export const SOURCE_START = 28.0;
export const END_START = 31.8;
/* 音側が「答えが出そろう山」に使う時刻。千代田区の答えが読める位置に着くところ */
export const RESULT_START = ANSWER_START;
/* いちばんの山＝街を八丈町に変えて、答えが 30% から 78% に入れ替わる瞬間。
   「八丈」は同梱の1805件で八丈町だけに当たるので、候補は出ず「探す」を押した時点で決まる */
export const T_CONFIRM_TAP = PLACE_START + 1.4;
/* 八丈町の答えが画面に出そろってから字幕を出す時刻 */
export const HACHIJO_ANSWER = 24.6;
/* 街を変えにいく（S4 の終わりから picker へ戻る）。字幕もここで先に切り替える */
export const PLACE_LEAD = 21.4;

export const STORYBOARD = Object.freeze([
  { id: 'S0', name: 'フック（地図から答えへ上る）', start: 0, end: ANSWER_START },
  { id: 'S1', name: '答え（千代田区は5日以内に30%）', start: ANSWER_START, end: PEAK_START },
  { id: 'S2', name: '山（21日9時〜12時の22%）', start: PEAK_START, end: BAND_START },
  { id: 'S3', name: '3時間ごとの帯（5日ぶん40本）', start: BAND_START, end: MAP_START },
  { id: 'S4', name: '地図（千代田区の印と予報円）', start: MAP_START, end: PLACE_START },
  { id: 'S5', name: '街を八丈町に変える（答えが78%に入れ替わる）', start: PLACE_START, end: SOURCE_START },
  { id: 'S6', name: '気象庁の発表そのままで、判断はしないこと', start: SOURCE_START, end: END_START },
  { id: 'S7', name: 'エンド', start: END_START, end: DURATION_SECONDS },
]);

/* 1行16字・2行まで。10%のセーフエリアの内側に置く。
   数字は実際の画面から取る。render-promo.mjs が書き出し前に画面と突き合わせて、
   食い違っていたら止まる（Day 038・040・041 で実際に食い違いを止めた仕組み）。
   このアプリは気象庁の発表を並べ替えて出すだけで判断はしないので、
   字幕にも「危険」「安全」「大丈夫」「避難」は書かない（気象業務法17条と同じ線引き） */
export const CAPTIONS = Object.freeze([
  { start: 0, end: ANSWER_START, lines: ['予報円の絵だけでは、'] },
  { start: ANSWER_START, end: PEAK_START, lines: ['千代田区は5日以内に30%'] },
  { start: PEAK_START, end: BAND_START, lines: ['山は21日9時〜12時、22%'] },
  { start: BAND_START, end: MAP_START, lines: ['3時間ごとに、5日ぶん'] },
  { start: MAP_START, end: PLACE_LEAD, lines: ['予報円と、自分の街の位置'] },
  { start: PLACE_LEAD, end: HACHIJO_ANSWER, lines: ['街を八丈町に変えると'] },
  { start: HACHIJO_ANSWER, end: SOURCE_START, lines: ['八丈町は78%'] },
  { start: SOURCE_START, end: END_START, lines: ['気象庁の発表そのまま。', '判断はしません'] },
]);

/* 音の刻みに使う。画面を押す瞬間 */
export const TAPS = Object.freeze([
  { at: PLACE_START, target: 'search', kind: 'hint' },
  { at: T_CONFIRM_TAP, target: 'place', kind: 'correct' },
]);
