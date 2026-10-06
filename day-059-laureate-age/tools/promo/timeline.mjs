/* プロモ動画の絵コンテ。ここの秒数が、画（render-promo.mjs）と音（promo-audio.mjs）の
   両方の土台になる。片方だけ動かすと合わなくなる。
   音の生成器は Day 042 から中身を変えずに複製したもので、S0〜S7 と T_CONFIRM_TAP・TAPS・RESULT_START を読む。 */

export const DURATION_SECONDS = 34.5;
export const DEFAULT_FPS = 30;

export const ANSWER_START = 3.2;   // 26歳の答え（0人）が出そろう
export const YOUNGER_START = 7.6;  // 自分より若く受賞したのは、のべ999回のうち3回
export const BAND_START = 12.0;    // 帯の図（最年少17歳・最年長97歳）
export const RETYPE_START = 16.4;  // 82歳に打ち直す
export const LIST_START = 22.0;    // 一覧の先頭に今年の物理学賞
export const YEAR_START = 27.6;    // 今年の受賞者の欄
export const END_START = 31.4;
/* 音側が「答えが出そろう山」に使う時刻 */
export const RESULT_START = ANSWER_START;
/* いちばんの山＝82歳を打ち終えて、答えが 0人 から 9人 に入れ替わる瞬間 */
export const T_CONFIRM_TAP = RETYPE_START + 1.0;
/* 打ち直しの字幕は、答えが入れ替わってから出す */
export const RETYPE_ANSWER = 18.0;

export const STORYBOARD = Object.freeze([
  { id: 'S0', name: 'フック（年齢を打つ）', start: 0, end: ANSWER_START },
  { id: 'S1', name: '答え（26歳は0人）', start: ANSWER_START, end: YOUNGER_START },
  { id: 'S2', name: '自分より若い受賞は999回のうち3回', start: YOUNGER_START, end: BAND_START },
  { id: 'S3', name: '帯の図（最年少17歳・最年長97歳）', start: BAND_START, end: RETYPE_START },
  { id: 'S4', name: '82歳に打ち直す（9人）', start: RETYPE_START, end: LIST_START },
  { id: 'S5', name: '一覧の先頭は今年の物理学賞', start: LIST_START, end: YEAR_START },
  { id: 'S6', name: '今年の発表が入る欄', start: YEAR_START, end: END_START },
  { id: 'S7', name: 'エンド', start: END_START, end: DURATION_SECONDS },
]);

/* 1行16字・2行まで。10%のセーフエリアの内側に置く。
   数字は実際の画面から取る。render-promo.mjs が書き出し前に画面と突き合わせて、食い違っていたら止まる。
   字幕で賞の名前を出すのは話題としての言及で、題名やロゴには使わない（API規約の商標の項）。
   評価の言葉（「遅咲き」「天才」など）は書かない */
export const CAPTIONS = Object.freeze([
  { start: 0, end: ANSWER_START, lines: ['26歳でノーベル賞を', '受けた人は？'] },
  { start: ANSWER_START, end: YOUNGER_START, lines: ['1901年から、', 'まだ0人'] },
  { start: YOUNGER_START, end: BAND_START, lines: ['26歳より若い受賞は', '999回のうち3回だけ'] },
  { start: BAND_START, end: RETYPE_START, lines: ['最年少は17歳、', '最年長は97歳'] },
  { start: RETYPE_START, end: RETYPE_ANSWER, lines: ['82歳に変えると'] },
  { start: RETYPE_ANSWER, end: LIST_START, lines: ['82歳なら、9人'] },
  { start: LIST_START, end: YEAR_START, lines: ['今年の物理学賞も', '82歳での受賞'] },
  { start: YEAR_START, end: END_START, lines: ['今年の発表も、', 'そのつど入ります'] },
]);

/* 音の刻みに使う。数字を打つ瞬間 */
export const TAPS = Object.freeze([
  { at: RETYPE_START, target: 'age', kind: 'hint' },
  { at: T_CONFIRM_TAP, target: 'age', kind: 'correct' },
]);
