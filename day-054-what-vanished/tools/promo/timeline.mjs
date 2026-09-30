/* プロモ動画の絵コンテ。ここの秒数が、画（render-promo.mjs）と音（promo-audio.mjs）の両方の土台になる。
   家は「かんたん・家の番号6」。1問目で廊下の突き当たりの大きな振り子時計が消える。
   S3 で目を開けた瞬間が、見ている人への問題になる（時計のあった場所を、同じ位置から見せる）。 */

export const DURATION_SECONDS = 34;
export const DEFAULT_FPS = 30;

export const LOOK_START = 4.2;      // リビングをのぞく
export const CLOSE_START = 8.8;     // 「覚えた！」を押して目を閉じる
export const OPEN_START = 12.6;     // 目を開けると、時計が無い
export const ANSWER_START = 17.2;   // 候補から選ぶ
export const REVEAL_START = 21.4;   // 決めると、消えた場所へ視点が飛ぶ
export const NEXT_START = 26.8;     // 2問目へ
export const END_START = 30.4;

/* 音側が「山」に使う時刻。目を開けて、時計が消えているのが見えた瞬間 */
export const RESULT_START = OPEN_START;
/* いちばんの山＝正解を決めた瞬間 */
export const T_CONFIRM_TAP = REVEAL_START;

export const STORYBOARD = Object.freeze([
  { id: 'S0', name: 'フック（廊下を歩き、奥に大きな振り子時計）', start: 0, end: LOOK_START },
  { id: 'S1', name: 'リビングをのぞく（本物そっくりの家具）', start: LOOK_START, end: CLOSE_START },
  { id: 'S2', name: '目を閉じる・何かが1つ消える', start: CLOSE_START, end: OPEN_START },
  { id: 'S3', name: '目を開けると時計が無い（見ている人への問題）', start: OPEN_START, end: ANSWER_START },
  { id: 'S4', name: '候補から選ぶ', start: ANSWER_START, end: REVEAL_START },
  { id: 'S5', name: '消えた場所へ視点が飛び、時計が戻る', start: REVEAL_START, end: NEXT_START },
  { id: 'S6', name: '2問目へ（3問で1ゲーム）', start: NEXT_START, end: END_START },
  { id: 'S7', name: 'エンド', start: END_START, end: DURATION_SECONDS }
]);

/* 1行16字・2行まで。10%のセーフエリアの内側に置く。
   数字は実際の画面から取る（render-promo.mjs が書き出し前に画面と突き合わせ、食い違っていたら止まる）。 */
export const CAPTIONS = Object.freeze([
  { start: 0, end: LOOK_START, lines: ['この家を、60秒で覚えて'] },
  { start: LOOK_START, end: CLOSE_START, lines: ['家具は、本物そっくりの3D'] },
  { start: CLOSE_START, end: OPEN_START, lines: ['目を閉じると…'] },
  { start: OPEN_START, end: ANSWER_START, lines: ['…どれが、消えた？'] },
  { start: ANSWER_START, end: REVEAL_START, lines: ['みんなで相談して、選ぶ'] },
  { start: REVEAL_START, end: NEXT_START, lines: ['消えた場所へ、視点が飛ぶ'] },
  { start: NEXT_START, end: END_START, lines: ['3問で1ゲーム', 'むずかしさは3段'] }
]);

/* 音の刻みに使う。画面を押す瞬間 */
export const TAPS = Object.freeze([
  { at: CLOSE_START, target: 'memorized', kind: 'hint' },
  { at: REVEAL_START - 1.2, target: 'choice', kind: 'hint' },
  { at: REVEAL_START, target: 'confirm', kind: 'correct' }
]);
