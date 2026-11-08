// Day088 "Bouquet Studio" promo storyboard. The video (render-promo.mjs) and the music (promo-audio.mjs) both read this one table.
// Vertical 1080x1920, 30 fps, 32 s. 90 BPM: 1 beat = 0.667 s, 1 bar (4 beats) = 2.667 s, 12 bars = exactly 32 s.
// The story is a feeling, not a feature list (same shape as Day087):
//   question + "hard to say" (hook: the bouquet made later in the video, opening) -> "arranging a bouquet is a chore" (the doubts
//   pile up; overlay only, no app) -> pick a mood and the bouquet appears (the drop) -> drag it, a color, your own photo behind it
//   -> write a name and a line, send a link -> on the receiving side the wrapped bouquet opens, and the message comes with it
//   -> free, no login.
// Every app screen is the real app (the built dist, served locally under the production address). Only captions, the window,
// the question cards of S1 and the end card are drawn on top.
export const DURATION_SECONDS = 32;
export const BPM = 90;
export const BEAT = 60 / BPM;
export const BAR = BEAT * 4;
export const BARS = 12;
export const bar = (n) => Math.round(n * BAR * 1000) / 1000;
export const beat = (n) => Math.round(n * BEAT * 1000) / 1000;

// Times used by both the captions and the takes (defined first: the storyboard refers to them).
// The Studio window appears 0.25 s before bar 2 (a white flash from the S1 overlay), so the empty wrap is seen for a moment.
export const STUDIO_START = Math.round((bar(2) - 0.25) * 1000) / 1000;
// Take 2: the receiving side. A NEW browser context opens the link made in take 1. The finished screen ("the link is made") stays
// up 1.4 s, then the video cuts to the closed gift (19.3 s). A real finger presses 押して開く; the frame the opening starts is
// put on bar(8) (21.333 s, the bloom of the music). The page clock is controlled, so the app's own 1.8 s auto-open timer is
// started only 1.0 s before the press (it never fires first).
export const GIFT = {
  openAt: bar(8),                 // the press of 押して開く = the first frame of the opening
  cutInAt: bar(7) + beat(0.95),   // 19.300 s: cut from the Studio's finished screen to the closed gift
  showBeforePressSeconds: 1.0,    // the page becomes visible this long before the press (auto-open would be 1.8 s)
  pressHoldFrames: 4,             // finger down this many frames before it lifts (the app opens on the tap = the lift)
  revealEnd: bar(11),             // end card starts
  // The camera pivots on the window's BOTTOM edge while the bouquet is closed (the app name at the top may leave the frame, as a
  // camera moving in would): 1.00 -> closedZoom. Once the message card has been seen whole (holdSeconds after it appears) the camera
  // reads it: in moveSeconds it moves to the card's left side at `zoom` (the window's left edge; the visible bottom edge rises to
  // aboveButtonsCss above the action buttons, so no button or note is half visible), so "はなこさんへ / いつもありがとう。" is large.
  // The card is as wide as the window, so a centred push-in cannot enlarge it without cutting its edges; here the right part (the
  // sender line) leaves the frame, as it does for a camera reading a card. Then it keeps pushing in slowly up to zoomEnd.
  closedZoom: 1.015,
  read: { holdSeconds: 0.4, moveSeconds: 0.7, zoom: 1.5, zoomEnd: 1.62, aboveButtonsCss: 4 },   // the view ends 4 CSS px above the action buttons
};

// Scenes. One caption per scene, the music changes on bar lines. `lines` state only what the screen shows (or a fact of the app).
// `captionAt`: the caption changes with the picture, not on the bar line (S2: the frame the Studio window appears; S6: the frame
// of the cut to the receiving side). A scene with the same lines as the one before keeps its caption (S3 + S4 are one caption).
// `note`: a small grey line under the caption, from `at` to the end of the scene.
// The first frame is already moving (the gift opening), never a title card. `overlayOnly`: no app window in that scene.
const MAKE_IT_YOURS = ['ドラッグ、色、写真で、', '自分好みに。'];
export const STORYBOARD = [
  { id: 'S0', name: 'フック', start: bar(0), end: bar(1), lines: ['言いにくい「ありがとう」、', '花束にしてみない？'], music: 'intro' },
  { id: 'S1', name: 'あるある', start: bar(1), end: bar(2), lines: ['でも花束って、', '選ぶのも並べるのも大変。'], music: 'build', overlayOnly: true },
  { id: 'S2', name: '気分', start: bar(2), end: bar(3), captionAt: STUDIO_START, lines: ['気分を選ぶだけで、', '花束ができる。'], music: 'drop' },
  { id: 'S3', name: '動かす・色', start: bar(3), end: bar(4), lines: MAKE_IT_YOURS, music: 'groove' },
  { id: 'S4', name: '写真', start: bar(4), end: bar(5), lines: MAKE_IT_YOURS, music: 'lift',
    note: { at: bar(4) + beat(1.25), text: '背景の写真は、受け取る人にはぼかした色合いで届く。' } },
  { id: 'S5', name: '贈る', start: bar(5), end: bar(7), lines: ['名前とひとことを書いて、', 'リンクで贈る。'], music: 'chorus' },
  { id: 'S6', name: '開く前', start: bar(7), end: bar(8), captionAt: GIFT.cutInAt, lines: ['リンクを開くと——'], music: 'hush' },
  { id: 'S7', name: 'ひらく', start: bar(8), end: bar(9), lines: ['花束が、ひらく。'], music: 'bloom' },
  { id: 'S7b', name: 'ひとこと', start: bar(9), end: bar(11), lines: ['ひとことも、', 'いっしょに届く。'], music: 'bloom' },
  { id: 'S8', name: 'エンド', start: bar(11), end: bar(12), lines: [], music: 'resolve' },
];

// S1 (overlay only): the doubts pile up, one every half beat, as white pills (text and simple shapes only), until the screen is full.
export const DOUBTS = ['どの花にする？', '何本いるかな…', '色は合う？', '包み方は？', '花屋まで行く？', '予算は…', 'いつ届く？', '言葉は何て？'];

// ---------------------------------------------------------------------------------------------
// Take 1: the Studio, one continuous session at CSS 540x825 (DPR 2 -> 1080x1650, shown 0.8x = the 864x1320 window), touch.
// Start state (set before the first captured frame, not shown): an EMPTY bouquet (no flowers), background さくら, with the
// 見本 tab already open and the mood buttons in view (STUDIO_PRESET_TAB).
// Each action is a real interaction (the element is really pressed / the pointer really dragged); the tap ring is drawn where the real
// element is. `at` = when the press happens (seconds from the start of the whole video).
export const STUDIO_PRESET_TAB = '見本';
export const STUDIO_ACTIONS = [
  // S2: the drop.
  { at: bar(2), kind: 'tap', intent: '気分「かわいい」を押す → 花束が一度にできる（音のドロップ。花が揃って現れる瞬間を、ここに合わせる）', label: 'かわいい' },
  // S3: drag a flower far to one side, then shake it fast so the 3D petals fall; then a wrap color, in one bar.
  { at: bar(3) + beat(0.25), kind: 'drag', intent: '花束の中ほどの大きな花を、指で大きく動かし（CSS 120px以上）、後半で速く揺らして花びらを散らす', durationSeconds: beat(2.25) },
  { at: bar(3) + beat(2.75), kind: 'tap', intent: '「包み紙」のタブ', label: '包み紙' },
  { at: bar(3) + beat(3.5), kind: 'tap', intent: '包み紙の色を1つ選ぶ（見て変わりが分かる色）', label: '色' },
  // S4: the photo as the background (the file picker itself is not shown: the chosen file is applied the moment the tile is pressed).
  { at: bar(4) + beat(0.25), kind: 'tap', intent: '「背景」のタブ', label: '背景' },
  { at: bar(4) + beat(1), kind: 'tap', intent: '先頭の「写真」のタイルを押す（ファイル選択は映さず、選んだ写真をすぐ背景に入れる）', label: '写真' },
  // S5: send. Type with a natural rhythm (about 0.07 s per character).
  { at: bar(5), kind: 'tap', intent: '右上の「贈る」', label: '贈る' },
  { at: bar(5) + beat(1), kind: 'type', intent: '宛名に「はなこ」', text: 'はなこ' },
  { at: bar(5) + beat(2.25), kind: 'type', intent: '差出人に「たろう」', text: 'たろう' },
  { at: bar(5) + beat(3.25), kind: 'type', intent: 'メッセージに「いつもありがとう。」', text: 'いつもありがとう。' },
  { at: bar(6) + beat(1), kind: 'tap', intent: '「プレビュー」（受け取る人の画面のプレビューが出る）', label: 'プレビュー' },
  { at: bar(7) - beat(1.2), kind: 'tap', intent: '「リンクを作る」→ 完成の画面（本番の住所のリンクと共有ボタン）を1.4秒見せて受け取り画面へ。hush の小節より前に押してタップ音を hush に入れない', label: 'リンクを作る' },
];

// A soft tick on every Studio tap (read by promo-audio.mjs). The press on the receiving side is not a tick: the bloom is its sound.
export const TAP_CUES = STUDIO_ACTIONS.filter((action) => action.kind === 'tap').map((action) => action.at);

// The camera on the Studio window (the pixels of the real screen, cropped and scaled; nothing is drawn into the app):
// - the drag: in to dragZoom around the bouquet stage's centre just before the finger goes down, out again before the next tap;
// - every tap: a short "pop" (1.00 -> popZoom -> 1.00 in popSeconds) around the pressed point.
// Tap rings live ringSeconds (they never stay on a screen that has changed).
export const STUDIO_CAMERA = { dragZoom: 1.25, dragInSeconds: 0.4, dragOutSeconds: 0.35, popZoom: 1.08, popSeconds: 0.15, ringSeconds: 0.27 };

// The hook is the same receiving take (the bouquet made in the video), from just after its opening starts (the fading 押して開く has
// gone, the stems are already rising), with a slow push-in pivoting on the window's top edge (the small app name stays whole).
export const HOOK = {
  sliceFromOpen: 0.4,
  zoom: [1.0, 1.05],
};

// Music cues read by promo-audio.mjs. (hush = the drums drop out and a soft pad holds; bloom = the full swell when the bouquet opens.)
export const MUSIC_CUES = {
  buildAt: bar(1),
  dropAt: bar(2),
  liftAt: bar(4),
  chorusAt: bar(5),
  hushAt: bar(7),
  bloomAt: bar(8),
  endChordAt: bar(11),
  fadeSeconds: 1.6,
};

// End card. The URL matches meta.json publicUrl (https://day88.rairakku.com/).
export const END_CARD = {
  title: 'Bouquet Studio',
  sub: '花束を、リンクで贈る。',
  badges: ['無料', 'ログイン不要', 'ブラウザですぐ', 'スマホも指だけ'],
  url: 'day88.rairakku.com',
  day: 'DAY 088 / 100',
};
// The app is shot under its production address (requests are answered from the local build; nothing goes to the network),
// so the link in the finished screen is the real one.
export const APP_ORIGIN = 'https://day88.rairakku.com';

// The "your photo" of S4: a CC0 photograph (no people, no logos), passed with --photo / PROMO_PHOTO.
export const PHOTO = { source: 'Poly Haven「Qwantani Dusk 2」(https://polyhaven.com/a/qwantani_dusk_2)・CC0・5:6 に切り出し' };
