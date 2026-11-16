// Day093 "find" promo storyboard. Both the video renderer (render-promo.mjs) and BGM synthesizer (promo-audio.mjs) read this table.
// Vertical 1080x1920, 30 fps, 32 s. 96 BPM: 1 beat = 0.625 s, 1 bar = 2.500 s, so the S1 build starts on 2.5 s (bar 1),
// the drop lands on 5.0 s (bar 2), onboarding starts on 7.5 s (bar 3), and the end card lands on 27.5 s (bar 11).
// Every app screen is the local Day093 build (served under https://day93.rairakku.com via Playwright route) backed by
// an isolated local SQLite/libSQL database with 32 demo items using the app's own 16 look photographs.
export const DURATION_SECONDS = 32;
export const BPM = 96;
export const BEAT = 60 / BPM;     // 0.625 s
export const BAR = 4 * BEAT;      // 2.500 s
export const BARS = Math.ceil(DURATION_SECONDS / BAR);
const r3 = (x) => Math.round(x * 1000) / 1000;
export const beat = (n) => r3(n * BEAT);
export const bar = (n) => r3(n * BAR);

export const APP_ORIGIN = 'https://day93.rairakku.com';
export const API_ORIGIN = 'https://find-day93-api.haranishi.workers.dev';

// Storyboard scenes. Captions are two lines max and reflect only observed screen state or verified app facts.
export const STORYBOARD = [
  { id: 'S0', name: 'フック', start: 0, end: bar(1), lines: ['服さがし、', 'スクロールに疲れてない？'], music: 'intro' },
  { id: 'S1', name: 'あるある', start: bar(1), end: bar(2), lines: [], overlayOnly: true, music: 'build' },
  { id: 'S2', name: '腑に落ちる', start: bar(2), end: bar(3), lines: ['好きか、ちがうか。', '左右にスワイプ。'], music: 'drop' },
  { id: 'S3', name: '自分の使い方', start: bar(3), end: bar(5), lines: ['3つの質問と、', '好きな雰囲気の写真選び。'], music: 'groove' },
  { id: 'S4', name: '触る', start: bar(5), end: bar(7), lines: ['右で好き、左でちがう。', 'まずは8枚、お試し。'], music: 'lift' },
  { id: 'S5', name: '結果', start: bar(7), end: bar(8), lines: ['写真選びと8枚から、', '好みの傾向をチェック。'], music: 'bridge' },
  { id: 'S6a', name: '幅（並び）', start: bar(8), end: bar(9), lines: ['選んだ好みを、', '服の並びに反映。'], music: 'chorus' },
  { id: 'S6b', name: '幅（もどす）', start: bar(9), end: bar(10), lines: ['ひとつ前のスワイプも、', 'もどせる。'], music: 'chorus' },
  { id: 'S7', name: 'ごほうび（お気に入り）', start: bar(10), end: bar(11), lines: ['好きな服は、', 'お気に入りに。'], music: 'preend' },
  { id: 'S8', name: '行動', start: bar(11), end: DURATION_SECONDS, lines: [], music: 'resolve' },
];
export const scene = (id) => STORYBOARD.find((s) => s.id === id);

// S1: relatable search fatigue cards, one per beat (beats 4, 5, 6), holding on beat 7 until the bar 2 drop.
export const ARUARU = [
  '何て検索しよう…',
  'また同じ服を見てる気がする',
  '見てるうちに、ちょっと疲れた',
];
export const CARD_TIMES = ARUARU.map((_, i) => beat(4 + i));

// Video cues (seconds from start of video) shared between action planning and audio ticks.
export const PLAN = {
  // S3 onboarding (C-1 -> C-2 -> C-3 -> C-4)
  genderTap: 7.90,
  ageTap: 8.60,
  budgetTap: 9.30,
  looksView2At: 10.05,
  lookTaps: [9.65, 10.35, 10.70, 11.05, 11.40],
  looksNextTap: 12.40,               // opens C-5 just before S4 (12.500 s)
  // S6b undo tap (restored card shown for ~1.0s before S7 at 25.00s)
  undoTap: 24.00,
  // S7 favorites tab (switched right on bar 10 = 25.000 s)
  favTabTap: bar(10),                // 25.000 s (S7 start)
};

export const TAP_CUES = [
  PLAN.genderTap,
  PLAN.ageTap,
  PLAN.budgetTap,
  ...PLAN.lookTaps,
  PLAN.looksNextTap,
  PLAN.undoTap,
  PLAN.favTabTap,
];

// Music cues read by promo-audio.mjs (all aligned to bar boundaries).
export const MUSIC_CUES = {
  buildAt: bar(1),       // 2.500 s
  dropAt: bar(2),        // 5.000 s
  liftAt: bar(5),        // 12.500 s
  chorusAt: bar(8),      // 20.000 s
  preendAt: bar(10),     // 25.000 s
  endChordAt: bar(11),   // 27.500 s
  fadeSeconds: 1.6,
};

// End card & disclaimer text (follows brief and storyboard-critique).
export const DISCLAIMER_TEXT = '画面の商品はイメージです';
export const END_CARD = {
  title: 'find',
  badges: ['登録なし・無料', 'ブラウザから試せる'],
  url: 'day93.rairakku.com',
  day: 'DAY 093 / 100',
  note: DISCLAIMER_TEXT,
};

// Selectors hidden via CSS injection during capture so shop/mall names never appear on screen.
export const HIDDEN_SELECTORS = [
  '.card .shop-row',
  '#sheet-shop',
  '#sheet-go',
  '#sheet-disclosure',
  '#fav-grid .fav-btn',
  '#tab-settings .set-card:has(> .set-links) > p.muted',
  '#tab-settings .set-card:has(> .set-links) > span',
];
