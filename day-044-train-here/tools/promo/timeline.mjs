/* プロモ動画の絵コンテ。ここの秒数が、画（render-promo.mjs）と音（promo-audio.mjs）の
   両方の土台になる。片方だけ動かすと合わなくなる。

   このDayは実データに未接続で、動いている48編成はすべて架空デモ。
   画にも字幕にも「実際の運行・ダイヤ」を名乗らせない（下の CAPTIONS の注記を参照）。 */

export const DURATION_SECONDS = 30;
export const DEFAULT_FPS = 30;

export const CITY_START = 3.2;     // 都心の全景へ引く
export const PICK_START = 7.4;     // 路線パネルを開いて1編成を選ぶ
export const FOLLOW_START = 11.0;  // 選んだ編成にカメラが追従している画
export const RIDE_START = 15.0;    // 「前方の風景」へ切り替える（いちばんの山）
export const PLACE_START = 19.2;   // 新宿のあたりへ寄る
export const DEMO_START = 23.0;    // 架空デモであることを明示する
export const END_START = 26.8;

/* 音側が「答えが出そろう山」に使う時刻。5路線48編成の全景が開けるところ */
export const RESULT_START = CITY_START;
/* いちばんの山＝視点が車内側へ入れ替わる瞬間 */
export const T_CONFIRM_TAP = RIDE_START;

export const STORYBOARD = Object.freeze([
  { id: 'S0', name: 'フック（東京駅のそばを走る編成の寄り）', start: 0, end: CITY_START },
  { id: 'S1', name: '都心の全景（5路線・48編成）', start: CITY_START, end: PICK_START },
  { id: 'S2', name: '一覧から1編成を選ぶ', start: PICK_START, end: FOLLOW_START },
  { id: 'S3', name: 'カメラが編成を追いかける', start: FOLLOW_START, end: RIDE_START },
  { id: 'S4', name: '前方の風景（視点が線路の高さへ）', start: RIDE_START, end: PLACE_START },
  { id: 'S5', name: '新宿のあたりへ寄る', start: PLACE_START, end: DEMO_START },
  { id: 'S6', name: '架空の運行デモであることを明示する', start: DEMO_START, end: END_START },
  { id: 'S7', name: 'エンド', start: END_START, end: DURATION_SECONDS },
]);

/* 1行16字・2行まで。10%のセーフエリアの内側に置く。
   数字は実際の画面から取る（render-promo.mjs が書き出し前に画面と突き合わせ、
   食い違っていたら止まる）。
   このアプリは実際の運行・ダイヤに未接続なので、字幕に「いま」「現在位置」
   「リアルタイム」「運行状況」「公開中」は書かない。 */
export const CAPTIONS = Object.freeze([
  { start: 0, end: CITY_START, lines: ['電車が走る東京を、眺める'] },
  { start: CITY_START, end: PICK_START, lines: ['5路線・48編成の3D'] },
  { start: PICK_START, end: FOLLOW_START, lines: ['一覧から、1編成を選ぶ'] },
  { start: FOLLOW_START, end: RIDE_START, lines: ['カメラが電車を追いかける'] },
  { start: RIDE_START, end: PLACE_START, lines: ['そのまま、前方の風景へ'] },
  { start: PLACE_START, end: DEMO_START, lines: ['新宿のあたりへ、寄る'] },
  { start: DEMO_START, end: END_START, lines: ['これは架空の運行デモ', '実際のダイヤではありません'] },
]);

/* 音の刻みに使う。画面を押す瞬間 */
export const TAPS = Object.freeze([
  { at: PICK_START, target: 'picker', kind: 'hint' },
  { at: RIDE_START, target: 'ride', kind: 'correct' },
  { at: PLACE_START, target: 'view', kind: 'hint' },
]);
