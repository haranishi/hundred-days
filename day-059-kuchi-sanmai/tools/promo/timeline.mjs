/* プロモ動画の絵コンテ。ここの秒数が、画（render-promo.mjs）と音（promo-audio.mjs）の両方の土台になる。
   音の生成器は Day 042 から中身を変えずに複製したもので、S0〜S7 と T_CONFIRM_TAP・TAPS・RESULT_START を読む。 */

export const DURATION_SECONDS = 34.0;
export const DEFAULT_FPS = 30;

export const TALK_START = 3.0;      // ロボットが声にあわせて口パクする
export const PARTS_START = 8.0;     // 口の絵3枚（＋まばたき）
export const GREEN_START = 12.5;    // 背景をグリーンに
export const SQUARE_START = 17.5;   // 正方形の画角に
export const RECORD_START = 22.5;   // 録画して保存
export const NOTICE_START = 28.0;   // 人の声や絵は許可の範囲で
export const END_START = 31.0;
/* 音側が「答えが出そろう山」に使う時刻＝ロボットが話し始めるところ */
export const RESULT_START = TALK_START;
/* いちばんの山＝録画を始める瞬間 */
export const T_CONFIRM_TAP = RECORD_START + 0.4;

export const STORYBOARD = Object.freeze([
  { id: 'S0', name: 'フック（サンプルで試す）', start: 0, end: TALK_START },
  { id: 'S1', name: '声にあわせて口が開く', start: TALK_START, end: PARTS_START },
  { id: 'S2', name: '口の絵3枚を入れるだけ', start: PARTS_START, end: GREEN_START },
  { id: 'S3', name: '背景をグリーンに', start: GREEN_START, end: SQUARE_START },
  { id: 'S4', name: '縦・横・正方形', start: SQUARE_START, end: RECORD_START },
  { id: 'S5', name: '録画して保存', start: RECORD_START, end: NOTICE_START },
  { id: 'S6', name: '人の声や絵は許可の範囲で', start: NOTICE_START, end: END_START },
  { id: 'S7', name: 'エンド', start: END_START, end: DURATION_SECONDS },
]);

/* 1行16字・2行まで。10%のセーフエリアの内側に置く。
   画面の状態は render-promo.mjs が書き出し前に照合し、食い違っていたら止まる。
   有名キャラや有名人を喋らせる誘い文句は書かない（権利の調べ 2・3） */
export const CAPTIONS = Object.freeze([
  { start: 0, end: TALK_START, lines: ['口の絵3枚と声で、', 'しゃべる動画に'] },
  { start: TALK_START, end: PARTS_START, lines: ['声の大きさで、', '口が開く'] },
  { start: PARTS_START, end: GREEN_START, lines: ['閉じ・小・大の3枚を', '入れるだけ'] },
  { start: GREEN_START, end: SQUARE_START, lines: ['背景はグリーンも', '透明も選べる'] },
  { start: SQUARE_START, end: RECORD_START, lines: ['縦・横・正方形で', '書き出せる'] },
  { start: RECORD_START, end: NOTICE_START, lines: ['録画して、', 'そのまま保存'] },
  { start: NOTICE_START, end: END_START, lines: ['人の声や絵は、', '許可の範囲で'] },
]);

/* 音の刻みに使う。押す瞬間 */
export const TAPS = Object.freeze([
  { at: 0.4, target: 'sample', kind: 'hint' },
  { at: T_CONFIRM_TAP, target: 'record', kind: 'correct' },
]);
