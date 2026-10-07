/* プロモ動画の絵コンテ。ここの秒数が、画（render-promo.mjs）と音（promo-audio.mjs）の
   両方の土台になる。片方だけ動かすと合わなくなる。
   音の生成器は Day 042 から中身を変えずに複製したもので、S0〜S7 と T_CONFIRM_TAP・TAPS・RESULT_START を読む。
   場面の長さは Day 059 までと同じ（S0 3.2秒・S1〜S3 4.4秒・S4〜S5 5.6秒・S6 3.8秒・エンド）。 */

export const DURATION_SECONDS = 34.5;
export const DEFAULT_FPS = 30;
/* 一覧用の demo.mp4（無音・字幕なし）は、この秒数で切る。S4 の出典へ飛んだあとまで */
export const DEMO_SECONDS = 19.5;

export const CARD_START = 3.2;     // 先頭の解説カード（化学賞）の「何をした人か」
export const SPLIT_START = 7.6;    // 確かめられた事実と、これからの期待を分ける
export const YEARS_START = 12.0;   // 発見から受賞まで（40年・31年）
export const SOURCE_START = 16.4;  // 文ごとの出典の番号
export const WEEK_START = 22.0;    // 医学賞・物理学賞の解説（今週の発表）
export const AGE_START = 27.6;     // 年齢を入れる
export const END_START = 31.4;
/* 音側が「答えが出そろう山」に使う時刻 */
export const RESULT_START = CARD_START;
/* いちばんの山＝出典の番号を押して、出典の一覧へ飛ぶ瞬間 */
export const T_CONFIRM_TAP = SOURCE_START + 1.0;
/* 飛んだあとに、字幕を入れ替える */
export const SOURCE_JUMPED = 18.0;

export const STORYBOARD = Object.freeze([
  { id: 'S0', name: 'フック（今年の受賞者は、何をした人？）', start: 0, end: CARD_START },
  { id: 'S1', name: '先頭の解説カード（化学賞）', start: CARD_START, end: SPLIT_START },
  { id: 'S2', name: '事実の欄と、期待の欄', start: SPLIT_START, end: YEARS_START },
  { id: 'S3', name: '発見から受賞まで（40年・31年）', start: YEARS_START, end: SOURCE_START },
  { id: 'S4', name: '出典の番号を押して、出典の一覧へ', start: SOURCE_START, end: WEEK_START },
  { id: 'S5', name: '医学賞・物理学賞の解説', start: WEEK_START, end: AGE_START },
  { id: 'S6', name: '年齢を入れる（26歳は、まだ0人）', start: AGE_START, end: END_START },
  { id: 'S7', name: 'エンド', start: END_START, end: DURATION_SECONDS },
]);

/* 1行13字・2行まで。10%のセーフエリアの内側に置く。
   数字と固有名詞は実際の画面から取る。render-promo.mjs が書き出し前に画面と突き合わせて、食い違っていたら止まる。
   「ノーベル」は字幕にも出さない（API規約の商標の項は題名とロゴだが、題名に近い所は避ける）。
   評価の言葉（「天才」「偉大」など）は書かない。「やさしい」とも書かない（化学賞の文は、まだ読みにくい） */
export const CAPTIONS = Object.freeze([
  { start: 0, end: CARD_START, lines: ['今年の受賞者は、', '何をした人？'] },
  { start: CARD_START, end: SPLIT_START, lines: ['10月7日発表の化学賞も、', '出典つきで解説'] },
  { start: SPLIT_START, end: YEARS_START, lines: ['確かめられた事実と、', 'これからの期待は別の欄'] },
  { start: YEARS_START, end: SOURCE_START, lines: ['発見から受賞まで、', '40年と31年'] },
  { start: SOURCE_START, end: SOURCE_JUMPED, lines: ['文ごとに、', '出典の番号'] },
  { start: SOURCE_JUMPED, end: WEEK_START, lines: ['押すと、', '出典の一覧へ'] },
  { start: WEEK_START, end: AGE_START, lines: ['医学賞・物理学賞も、', '同じ形で読めます'] },
  { start: AGE_START, end: END_START, lines: ['26歳で受賞した人は、', 'まだ0人'] },
]);

/* 音の刻みに使う。出典の番号に指が近づく瞬間と、押す瞬間 */
export const TAPS = Object.freeze([
  { at: SOURCE_START, target: 'ref', kind: 'hint' },
  { at: T_CONFIRM_TAP, target: 'confirm', kind: 'correct' },
]);
