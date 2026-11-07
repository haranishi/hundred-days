// Day087 "OriCube" promo storyboard. The video (render-promo.mjs) and the music (promo-audio.mjs) both read this one table.
// Vertical 1080x1920, 30 fps, 32 s. 90 BPM: 1 beat = 0.667 s, 1 bar (4 beats) = 2.667 s, 12 bars = exactly 32 s.
// The story is a feeling, not a feature list: a question -> "a folding diagram does not move" -> the same fold moves
// in 3D (the drop) -> stop / turn / spread it -> one step at a time with your own paper -> 10 works -> the crane -> try it.
export const DURATION_SECONDS = 32;
export const BPM = 90;
export const BEAT = 60 / BPM;
export const BAR = BEAT * 4;
export const BARS = 12;
export const bar = (n) => Math.round(n * BAR * 1000) / 1000;
export const beat = (n) => Math.round(n * BEAT * 1000) / 1000;

// Scenes, one caption per scene, every change on a bar line. `lines` state only what the screen shows
// (or a fact of the app). The first frame is already moving (the crane collapsing), never a title card.
export const STORYBOARD = [
  { id: 'S0', name: 'フック', start: bar(0), end: bar(1), lines: ['鶴の折り図、', '読める？'], inline: true, music: 'intro' },
  { id: 'S1', name: 'あるある', start: bar(1), end: bar(2), lines: ['矢印だけだと、', 'どう動くか分かりにくい。'], music: 'build' },
  { id: 'S2', name: '腑に落ちる', start: bar(2), end: bar(3), lines: ['OriCubeなら、', '紙が動く。'], music: 'drop' },
  { id: 'S3', name: '止めて回す', start: bar(3), end: bar(4), lines: ['止めて、回して、', '裏まで見える。'], music: 'groove' },
  { id: 'S4', name: 'のぞく', start: bar(4), end: bar(5), lines: ['重なりの中まで、', 'のぞける。'], music: 'lift' },
  { id: 'S5', name: '自分の紙で', start: bar(5), end: bar(6), lines: ['手元の紙と、', '1手順ずつ。'], music: 'chorus' },
  { id: 'S6', name: '10作品', start: bar(6), end: bar(9), lines: ['紙飛行機から鶴まで、', '10作品。'], music: 'chorus' },
  { id: 'S7', name: '鶴', start: bar(9), end: bar(11), lines: ['最後は、鶴。', '完成まで、ぜんぶ3D。'], music: 'chorus2' },
  { id: 'S8', name: 'エンド', start: bar(11), end: bar(12), lines: [], music: 'resolve' },
];

// Hook: the crane collapsing into the square base, already moving on frame 0 (speed 2, the same setting as the story).
// Step 3 lands on beat 3 (2.0 s), then step 4's fold lines and arrows show until the cut; the petal fold has not started.
export const HOOK = { query: 'm=crane&s=3&t=0.3846', speed: 2, play: true };

// Story: one page from bar 1 to bar 6.5, the same petal fold (crane step 4) all the way.
// It opens like a folding diagram: from straight above, stopped, only the lines and arrows (view=top).
// Speed 2 (the app's own speed button, set before the take) so the fold fits the drop bar.
export const STORY = { query: 'm=crane&s=4&t=0&paused=1&view=top', speed: 2,
  drag: { from: bar(3) + beat(0.5), to: bar(3) + beat(2.5), dx: 280 } };
// Taps (the ring is drawn where the real element is; the element is really pressed).
export const TAPS = [
  { at: bar(2), target: '#play', label: '再生' },                                  // the drop: the paper moves
  { at: bar(2) + beat(0.5), target: 'button.tool[data-view="reset"]', label: '戻す' }, // camera: above -> the step's view
  { at: bar(3), target: '#play', label: '一時停止' },
  { at: bar(4), target: '#explode', label: '重なりを広げる' },
  { at: bar(5), target: '#step-stop', label: '手順ごとに止める' },
  { at: bar(5) + beat(1), target: '#play', label: '再生' },                         // plays on and stops at the end of the step
  { at: bar(6), target: '#pick-open', label: '作品を選ぶ' },
];
export const STORY_END = bar(6.5);

// Montage: each shot opens the model on its last step so that the last fold lands MONTAGE_LAND seconds into the shot.
export const MONTAGE_SHOT = beat(2);
export const MONTAGE_LAND = 1.0;   // lands 1.0 s in; with the 0.35 s rest the app's done card never shows inside a 1.333 s shot
export const MONTAGE = ['plane', 'yacht', 'kimono', 'swan', 'tray'].map((model, i) => ({ model, at: STORY_END + i * MONTAGE_SHOT }));
// Crane: last step (the wings open), seen from the view the app recommends for it (no view= in the URL).
// t is chosen so the app's completion card appears on bar 10; its own slow turn runs until the end card.
export const CRANE = { at: bar(9), query: 'm=crane&s=10&t=0.537', play: true, finishAt: bar(10) };

// Moments when a fold lands (the paper sound "pasa"). Measured from the capture (capture-report.json
// lists the frames where the app's step progress reaches 1); render-promo.mjs warns when they drift.
export const PAPER_CUES = [1.967, 15.1, 18.3, 19.633, 20.967, 22.3, 23.633, 26.3];
// A soft tick on every tap.
export const TAP_CUES = TAPS.map((tap) => tap.at);

// Music cues read by promo-audio.mjs.
export const MUSIC_CUES = {
  buildAt: bar(1),
  dropAt: bar(2),
  liftAt: bar(4),
  chorusAt: bar(5),
  craneAt: bar(9),
  endChordAt: bar(11),
  fadeSeconds: 1.6,
};

// End card. The URL matches meta.json publicUrl.
export const END_CARD = {
  title: 'OriCube',
  sub: '折り図が、動く。',
  badges: ['無料', 'ログイン不要', 'ブラウザですぐ', 'スマホは指で回せる'],
  url: 'rairakku.com/100days/day-087-oricube',
  day: 'DAY 087 / 100',
};
