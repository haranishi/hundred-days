// Day089 "FROSTLINE" promo storyboard. The video (render-promo.mjs) and the music (promo-audio.mjs) both read this one table.
// Vertical 1080x1920, 30 fps, 30 s. 96 BPM: 1 beat = 0.625 s, 1 bar (4 beats) = 2.5 s (75 frames), 12 bars = exactly 30 s.
// The story is a feeling, not a feature list:
//   a question over a rider flying off a snow ledge (frame 1 already moving) -> "but the mountains are far, the season is short"
//   (overlay only, no game) -> the drop: the game's own title, one press and you are sliding -> carve (cut the snow) and
//   scrape it to brake (spray) -> the kicker: a tail-grab 360 in slow motion, landed on the beat, the game names the trick
//   -> range: skis too, the map of the whole mountain, the views -> free, no login, in the browser + the address.
// Every game picture is the real game (the built dist, served locally, stepped frame by frame through its own debug API).
// Only captions, tap rings, flashes, the S1 card and the end card are drawn on top.
export const DURATION_SECONDS = 30;
export const FPS = 30;
export const BPM = 96;
export const BEAT = 60 / BPM;
export const BAR = BEAT * 4;
export const BARS = 12;
export const bar = (n) => Math.round(n * BAR * 1000) / 1000;
export const beat = (n) => Math.round(n * BEAT * 1000) / 1000;
export const frameAt = (seconds) => Math.round(seconds * FPS);

// The game's fixed physics step (1/120 s). Inputs change only on this grid, so the physics is the same however the frames are cut.
export const STEP = 1 / 120;
const alt = (t, period, amount) => (Math.sin(t * Math.PI / period) >= 0 ? amount : -amount);

// Takes: one continuous recording each. `from`/`to` = video seconds; `game` = game seconds since the teleport for `from`
// (normal speed: 1 video second = 1 game second, unless the take has a time warp). Inputs are functions of game seconds.
export const TAKES = {
  // S0. Off the big snow ledge (大ジャンプ台) at about 50 km/h: frame 1 is the board leaving the lip (already moving); within 0.2 s the
  // game's camera tips over the edge and the forest and the lake open below, the board grabbed (the game names it インディ). Played at 0.88x (barely slower than real) so the whole bar stays in the air: cut before the
  // landing (game 4.567 s; the last frame is game 4.50 s). The hook's frame 10 (the lake below) is the blurred background of S1.
  hook: { gear: 'board', spawn: 'big-air', from: bar(0), to: bar(1), game: 2.33, rate: 0.88, s1Frame: 10, input: (t) => ({ jump: t >= 0.5 && t < 6.5 }) },
  // S2. The game's own title screen (the forest trail behind it). A press on 滑りはじめる (mouse down 9 frames before the click) and the
  // ride starts where the title shows it. The title comes in with the drop (bar 2); the click is one beat later.
  title: { gear: 'board', from: bar(2), to: bar(3), pressAt: bar(2) + beat(1), downFrames: 9, input: () => ({}) },
  // S3 + S3b, one run on the east ridge (東の尾根): a short tuck, hard edge-to-edge turns, then the brake on an edge change (held
  // with the last turn's steer): the board turns across and scrapes the snow, the biggest spray of the game, from about 70 km/h down
  // to about 20 (this slope is steep: a full stop takes about 3 s, longer than the bar, so the caption says ブレーキ, not 止まる).
  carve: { gear: 'board', spawn: 'east-ridge', from: bar(3), to: bar(5), brakeAt: bar(4), brakeGame: 6.0,
    input: (t) => (t < 1.5 ? { tuck: 1 } : t < 6.0 ? { steer: alt(t - 1.5, 0.9, 1) } : { brake: 1, steer: alt(6.0 - 1.5 - STEP, 0.9, 1) }) },
  // S4. The small kicker of the park (パークの小さい台): jump held over the lip, steer for 1.05 s -> a tail grab and a 360, landed
  // clean (checked by the physics before the take is shot). The take is time-warped: real speed up to the take-off on bar 6,
  // slow motion through the spin, real speed again for the landing, which lands on beat 2 of bar 7 (the music's impact).
  jump: { gear: 'board', spawn: 'jump-valley', from: bar(5), to: bar(8), takeoffAt: bar(6), landAt: bar(7) + beat(1),
    slow: { afterTakeoff: 0.2, beforeLanding: 0.5, ramp: 0.35 },
    input: (t) => ({ jump: t >= 5.0 && t < 8.6, steer: t >= 6.0 && t < 7.05 ? 1 : 0 }),
    expect: { trick: 'テール 360', quality: 'clean' } },
  // S5a. Skis (the same mountain, the valley piste 谷のゲレンデ with the lake below), long carved turns.
  ski: { gear: 'ski', spawn: 'first-snow', from: bar(8), to: bar(9), game: 3.0, input: (t) => ({ steer: t < 1.5 ? 0 : alt(t - 1.5, 1.0, 0.9) }) },
  // S5b. The map of the whole mountain (opened with the map key before the take). A press on the start point 山頂 (summit).
  map: { gear: 'board', from: bar(9), to: bar(10), pressAt: bar(9) + beat(1), downFrames: 5, pick: 'summit', input: () => ({}) },
  // S5c. The views (景色を見る): 東の斜面から (5/9), then a press on 次へ -> 南の岸から (6/9).
  vista: { gear: 'board', from: bar(10), to: bar(11), view: 4, pressAt: bar(10) + beat(2), downFrames: 5, input: () => ({}) },
};

// The carve take starts so that its brake (game seconds) falls on brakeAt (video seconds).
TAKES.carve.game = Math.round((TAKES.carve.brakeGame - (TAKES.carve.brakeAt - TAKES.carve.from)) * 1e6) / 1e6;

// Scenes. One caption per scene. `lines` state only what the screen shows (or a fact of the game).
// `take` = which recording fills the frame; `card` = drawn by the overlay page (no game). Captions change with the picture.
export const STORYBOARD = [
  { id: 'S0', name: 'フック', start: bar(0), end: bar(1), take: 'hook', lines: ['今すぐ、雪山を', '滑りたくない？'], music: 'intro' },
  { id: 'S1', name: 'あるある', start: bar(1), end: bar(2), card: 'doubts', lines: ['でも雪山は遠いし、', '滑れる時間も短い。'], music: 'build' },
  // The game's title (FROSTLINE / 雪山フリーライド) ends at CSS y 118: this caption sits under it.
  { id: 'S2', name: 'すぐ滑れる', start: bar(2), end: bar(3), take: 'title', lines: ['ブラウザなら、', '押してすぐ滑れる。'], captionTop: 132, music: 'drop' },
  { id: 'S3', name: '切る', start: bar(3), end: TAKES.carve.brakeAt, take: 'carve', lines: ['エッジを立てて、', '雪を切って曲がる。'], music: 'groove' },
  { id: 'S3b', name: '削る', start: TAKES.carve.brakeAt, end: bar(5), take: 'carve', lines: ['板を横に向けて、', '雪を削ってブレーキ。'], music: 'groove' },
  { id: 'S4', name: '飛ぶ', start: bar(5), end: bar(7) + beat(1), take: 'jump', lines: ['ジャンプ台で、', '回って、板をつかむ。'], music: 'air' },
  { id: 'S4b', name: '技', start: bar(7) + beat(1), end: bar(8), take: 'jump', lines: ['テール 360。', '技の名前と点が出る。'], music: 'chorus' },
  { id: 'S5a', name: 'スキー', start: bar(8), end: bar(9), take: 'ski', lines: ['スキーも選べる。'], music: 'chorus' },
  // The map fills the top half (the pressed start point 山頂 is near its top edge), so this caption sits lower, over the list of
  // names, on a dark plate (the list's own small labels would show through the letters).
  { id: 'S5b', name: '地図', start: bar(9), end: bar(10), take: 'map', lines: ['一辺4km・標高差約1,600m。', '地図で出発地点を選べる。'], captionTop: 532, plate: true, music: 'chorus' },
  { id: 'S5c', name: '景色', start: bar(10), end: bar(11), take: 'vista', lines: ['氷河も、湖も。', '景色を見る視点は9つ。'], music: 'chorus' },
  { id: 'S6', name: 'エンド', start: bar(11), end: bar(12), card: 'end', lines: [], music: 'resolve' },
];

// S1 (overlay only): what keeps people off the snow, one every half beat, as pills over a blurred frame of the hook (TAKES.hook.s1Frame).
export const DOUBTS = ['遠い…', '朝が早い…', '道具が重い…', 'リフト待ち…', '混んでる…', '冬だけ…'];

// Short white flashes on the cuts (seconds, strength). No flash inside a take (S3 -> S3b, S4 -> S4b are the same run).
export const FLASHES = [[bar(1), 0.35], [bar(2), 0.6], [bar(3), 0.3], [bar(5), 0.3], [bar(8), 0.3], [bar(9), 0.25], [bar(10), 0.25], [bar(11), 0.4]];

// Presses shown with a ring (the element is really pressed: mouse down, then up = the click).
export const PRESSES = ['title', 'map', 'vista'].map((take) => ({ take, at: TAKES[take].pressAt, downFrames: TAKES[take].downFrames }));

// Music cues read by promo-audio.mjs (seconds). hush = drums out while the rider is in the air; impact = the landing.
export const MUSIC_CUES = {
  buildAt: bar(1),
  dropAt: bar(2),
  brakeAt: TAKES.carve.brakeAt,
  approachAt: bar(5),
  takeoffAt: TAKES.jump.takeoffAt,
  impactAt: TAKES.jump.landAt,
  endChordAt: bar(11),
  fadeSeconds: 1.6,
};
export const TAP_CUES = PRESSES.map((p) => p.at);

// End card. The address is the public one (meta.json publicUrl), never the local server the game is shot from.
export const END_CARD = {
  title: 'FROSTLINE',
  sub: 'ブラウザで、雪山を滑る。',
  badges: ['無料', 'ログイン不要', 'ブラウザですぐ', 'スマホは指で操作'],
  url: 'rairakku.com/100days/day-089-frostline/',
  day: 'DAY 089 / 100',
  note: 'はじめに山のデータ（約36MB）を読み込みます',
};
export const PUBLIC_URL = 'https://rairakku.com/100days/day-089-frostline/';
