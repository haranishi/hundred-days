/* ことば辻のプロモ動画の絵コンテ。ここの秒が、画（render-promo.mjs）と音（promo-audio.mjs）の両方の土台になる。
   片方だけ動かすと合わなくなる。秒はすべて「動画の秒」（t0＝動画の0秒から）。
   幕（CUTS）で場面を切り替える所は、撮影中に盤を組み替える時間（gap）を取り、書き出しで切り落とす。
   その時間はここの秒に含まない（描画側がページの時計と動画の秒を換算する）。 */

export const DURATION_SECONDS = 34;
export const DEFAULT_FPS = 30;
export const BPM = 90;
export const BEAT = 60 / BPM;              // 0.667秒。場面の頭と押す時刻は拍に乗せる
export const DEFAULT_DAY = 53;             // エンドの「Day 53 / 100」。公開時に --day で差し替える

const beat = (n) => Number((n * BEAT).toFixed(4));

/* 盤は種（seed）だけで決まる。選んだ理由は README の「盤の種」 */
export const SEEDS = Object.freeze({
  tenarai: 'edo01p',      // 手習い：空き辻は1つ。縦「ひよ□」横「□たつ」→「こ」
  ichininmae: 'edo0d3',   // 一人前：た・な・さ・い の4字で、ゆかた・たなばた…が1語ずつ解ける
  menkyo: 'edo042',       // 免許皆伝：9×9・辻15がすべて空き。みの・まとい・いんろう…
});
export const DUEL_SECONDS = 312;           // 果たし状の差出人の時間（画面は「5分12秒」）

// 場面の頭（拍の番号）。90 BPM なので 3拍＝2秒
export const ANSWER_START = beat(5);       // 3.333  五十音盤の「こ」を押す
export const SEAL_START = beat(8);         // 5.333  結果の朱印「天晴」
export const LEVELS_START = beat(12);      // 8.000  腕前選び
export const ICHI_START = beat(20);        // 13.333 一人前
export const FILL_START = beat(26);        // 17.333 一人前の後半（縦横2段の問）
export const MENKYO_START = beat(32);      // 21.333 免許皆伝（幕で切り替える）
export const DUEL_START = beat(40);        // 26.667 果たし状（幕で切り替える）
export const END_START = beat(46);         // 30.667 エンド

/* 画面を押す瞬間 */
export const T_KANA = ANSWER_START;                              // 五十音盤の「こ」
export const T_CHANGE = LEVELS_START;                            // 結果の「腕前を変える」
export const T_ICHI = ICHI_START;                                // 腕前選びの「一人前」
export const T_FILLS = Object.freeze([beat(22), beat(24), beat(26), beat(28)]);   // 14.667〜18.667 の4字（大太鼓の拍に合わせる）
export const T_AKI = beat(35);                                   // 23.333 免許皆伝の盤で空き辻を1つ押す

/* 幕：藍の暖簾が閉じて（WIPE_IN 秒）、閉じている間に盤を組み替え、開く（WIPE_OUT 秒）。
   gap は撮影中に取る組み替えの時間（ページの秒）で、書き出しで切り落とす */
export const WIPE_IN = 0.3;
export const WIPE_OUT = 0.34;
export const CUTS = Object.freeze([
  { at: MENKYO_START, gap: 2.6, name: '免許皆伝へ' },
  { at: DUEL_START, gap: 2.0, name: '果たし状へ' },
]);

export const STORYBOARD = Object.freeze([
  { id: 'S0', name: 'フック（手習いの盤。空き辻が光る）', start: 0, end: ANSWER_START },
  { id: 'S1', name: '答え（「こ」で縦横2語が藍に→朱印「天晴」）', start: ANSWER_START, end: LEVELS_START },
  { id: 'S2', name: '腕前（埋める字 1・7・15）', start: LEVELS_START, end: ICHI_START },
  { id: 'S3', name: '一人前（4字を続けて埋め、残りが7→3）', start: ICHI_START, end: MENKYO_START },
  { id: 'S4', name: '免許皆伝（辻がすべて空き）', start: MENKYO_START, end: DUEL_START },
  { id: 'S5', name: '果たし状（同じ盤を友に）', start: DUEL_START, end: END_START },
  { id: 'S6', name: 'エンド', start: END_START, end: DURATION_SECONDS },
]);

/* 字幕。1行16字・2行まで。tone は2行目の色（shu＝朱、ai＝藍）。
   数字と言葉は画面と突き合わせる（render-promo.mjs の SCREEN）。食い違ったら字幕を画面に合わせる */
export const CAPTIONS = Object.freeze([
  { start: 0, end: ANSWER_START, lines: ['縦にも横にも合う', '□に入る一字は？'], tone: 'shu' },
  { start: ANSWER_START, end: SEAL_START, lines: ['1字で', '縦も横も解ける'], tone: 'ai' },
  { start: SEAL_START, end: LEVELS_START, lines: ['解けたら', '「天晴」の朱印'], tone: 'shu' },
  { start: LEVELS_START, end: ICHI_START, lines: ['腕前が上がるほど', '埋める字 1・7・15'], tone: 'ai' },
  { start: ICHI_START, end: FILL_START, lines: ['一人前は', '埋める字が7つ'], tone: 'ai' },
  { start: FILL_START, end: MENKYO_START, lines: ['縦と横、2つの問を', '手がかりに埋める'], tone: 'ai' },
  { start: MENKYO_START, end: DUEL_START, lines: ['免許皆伝は', '辻がすべて空き'], tone: 'shu' },
  { start: DUEL_START, end: END_START, lines: ['同じ盤を', '果たし状で友に送れる'], tone: 'shu' },
]);

/* 注目の印。glow は空き辻の光（1コマ目を動かす）、ring は朱の枠。target は描画側が画面の要素に引き直す。
   光の脈は1秒周期で、-0.75秒に点けると1コマ目が周期の75%（縮みながら薄れる、いちばん速い所）に来る。
   -0.45秒に点けたら1コマ目が脈の山で止まって見え、0.1秒後との差が 2.2 と小さかった */
export const GLOW_PERIOD = 1.0;
export const FOCUS = Object.freeze([
  { start: -0.75 * GLOW_PERIOD, end: ANSWER_START, target: 'aki', style: 'glow' },
  { start: SEAL_START + 0.45, end: LEVELS_START - 0.15, target: 'seal', style: 'ring' },
  { start: LEVELS_START + 0.9, end: ICHI_START - 0.2, target: 'levels', style: 'ring' },
  { start: ICHI_START + 0.75, end: FILL_START - 0.1, target: 'prog', style: 'ring' },
  { start: FILL_START + 0.15, end: MENKYO_START - WIPE_IN - 0.05, target: 'clue', style: 'ring' },
  { start: MENKYO_START + WIPE_OUT + 0.3, end: T_AKI - 0.1, target: 'board', style: 'ring' },
  { start: DUEL_START + WIPE_OUT + 0.3, end: END_START - 0.15, target: 'letter', style: 'ring' },
]);

/* 音の刻み。answer＝いちばんの正解（S1）、word＝言葉が1つ解ける、tap＝押すだけ、wipe＝幕 */
export const TAPS = Object.freeze([
  { at: T_KANA, kind: 'answer', target: 'kana' },
  { at: T_CHANGE, kind: 'tap', target: 'change' },
  { at: T_ICHI, kind: 'tap', target: 'ichi' },
  ...T_FILLS.map((at, index) => ({ at, kind: 'word', target: `fill${index + 1}` })),
  { at: MENKYO_START, kind: 'wipe', target: 'menkyo' },
  { at: T_AKI, kind: 'tap', target: 'aki' },
  { at: DUEL_START, kind: 'wipe', target: 'duel' },
]);

export const sceneStart = (id) => STORYBOARD.find((scene) => scene.id === id)?.start ?? 0;
