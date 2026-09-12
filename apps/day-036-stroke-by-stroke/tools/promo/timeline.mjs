/* プロモ動画の絵コンテ。ここの秒数が、画（render-promo.mjs）と音（promo-audio.mjs）の
   両方の土台になる。片方だけ動かすと合わなくなる。 */

export const DURATION_SECONDS = 34;
export const DEFAULT_FPS = 30;

export const TITLE_START = 3.2;
export const SLOW_START = 6.2;
export const BRUSH_START = 13.0;
export const GUIDE_START = 19.4;
export const SAVE_START = 24.4;
export const PROMISE_START = 28.6;
export const END_START = 31.4;
/* 音側が「答えが出そろう山」に使う時刻。3つ目の言葉が書き上がるところ */
export const RESULT_START = GUIDE_START;
export const T_CONFIRM_TAP = SAVE_START + 0.8;

export const STORYBOARD = Object.freeze([
  { id: 'S0', name: 'フック', start: 0, end: TITLE_START },
  { id: 'S1', name: 'タイトル', start: TITLE_START, end: SLOW_START },
  { id: 'S2', name: 'ゆっくり', start: SLOW_START, end: BRUSH_START },
  { id: 'S3', name: '筆づかい', start: BRUSH_START, end: GUIDE_START },
  { id: 'S4', name: '番号と下書き', start: GUIDE_START, end: SAVE_START },
  { id: 'S5', name: '保存', start: SAVE_START, end: PROMISE_START },
  { id: 'S6', name: '約束', start: PROMISE_START, end: END_START },
  { id: 'S7', name: 'エンド', start: END_START, end: DURATION_SECONDS },
]);

/* 1行16字・2行まで。10%のセーフエリアの内側に置く */
export const CAPTIONS = Object.freeze([
  { start: 0, end: TITLE_START, lines: ['その字の書き順、', '自信ありますか'] },
  { start: TITLE_START, end: SLOW_START, lines: ['打つと、一画ずつ', '書かれていきます'] },
  { start: SLOW_START, end: 9.8, lines: ['速さは3段'] },
  { start: 9.8, end: BRUSH_START, lines: ['ゆっくりにすると', '筆の運びが見える'] },
  { start: BRUSH_START, end: 16.4, lines: ['入りは細く、', '終わりは払う'] },
  { start: 16.4, end: GUIDE_START, lines: ['名前も、続けて'] },
  { start: GUIDE_START, end: 22.2, lines: ['薄い下書きは'] },
  { start: 22.2, end: SAVE_START, lines: ['これから書く画'] },
  { start: SAVE_START, end: PROMISE_START, lines: ['そのまま画像で', '保存できます'] },
  { start: PROMISE_START, end: END_START, lines: ['入れた言葉は', '端末から出ません'] },
]);

/* 音の刻みに使う。画面を押す瞬間 */
export const TAPS = Object.freeze([
  { at: SLOW_START + 0.3, target: 'slow', kind: 'hint' },
  { at: 15.0, target: 'fast', kind: 'hint' },
  { at: T_CONFIRM_TAP, target: 'save', kind: 'correct' },
]);

export const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
export const captionAt = (t) => CAPTIONS.find(({ start, end }) => t >= start && t < end) ?? null;
