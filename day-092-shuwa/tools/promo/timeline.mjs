// Day092 "てことば" promo storyboard. The video (render-promo.mjs) and the music (promo-audio.mjs) both read this one table.
// Vertical 1080x1920, 30 fps, 32 s. 90 BPM: 1 beat = 0.667 s, 1 bar (4 beats) = 2.667 s, 12 bars = exactly 32 s.
// The story is a feeling, not a feature list: a question ("are you copying the chart as it is?") -> the chart is the other
// person's view (shown with marks on the real screen) -> one tap shows your own view (the drop; it holds 2 s) -> turn it
// with a finger and put it back -> moving signs, slowly -> a short daily lesson -> your own name -> how much is in it ->
// the streak grows to 2 days -> try it.
// Round 3: the switched view holds before the turn; the turn is a close-up whose edge hides where the 3D view cuts the
// sleeve; every scene starts from the same record (a 1-day streak from yesterday, lesson 2 today).
export const DURATION_SECONDS = 32;
export const BPM = 90;
export const BEAT = 60 / BPM;
export const BAR = BEAT * 4;
export const BARS = 12;
export const bar = (n) => Math.round(n * BAR * 1000) / 1000;
export const beat = (n) => Math.round(n * BEAT * 1000) / 1000;

// Layout of the final frame (overlay CSS px, 540x960 at DPR 2): captions live in a band above the app, the app window
// (CSS 540x760 at DPR 2) fills the rest. Captions never cover the app, and stay out of the top 8% / bottom 20% (y 77..768).
export const APP = { width: 540, height: 760, top: 200 };

// Scenes = captions. `lines` state only what the screen shows (or a fact of the app). The first frame is already moving.
export const STORYBOARD = [
  { id: 'S0', name: 'フック', start: 0, end: bar(1), lines: ['指文字の表、', 'そのまま真似してない？'], big: true, music: 'intro' },
  { id: 'S1', name: 'あるある', start: bar(1), end: bar(2), lines: ['表は、相手から見た形。', '自分から見ると、左右が逆。'], music: 'build' },
  { id: 'S2', name: '腑に落ちる', start: bar(2), end: beat(11), lines: ['てことばなら、', '自分から見た形に切り替わる。'], music: 'drop' },
  { id: 'S3', name: '触る', start: beat(11), end: beat(15.5), lines: ['指で回して、', '横からも見られる。'], music: 'groove' },
  { id: 'S4', name: '動き', start: beat(15.5), end: beat(20), lines: ['動く手話も、', 'ゆっくり再生。'], music: 'lift' },
  { id: 'S5', name: '自分の使い方', start: beat(20), end: beat(24), lines: ['1日5分、', '4択とペア合わせで。'], music: 'chorus' },
  { id: 'S6', name: '自分ごと', start: beat(24), end: beat(31.5), lines: ['自分の名前も、', '指文字で。'], music: 'chorus' },
  { id: 'S7', name: '幅', start: beat(31.5), end: beat(36), lines: ['指文字・数字・あいさつ。', '図鑑で、いつでも。'], music: 'chorus' },
  { id: 'S8', name: 'ごほうび', start: beat(36), end: beat(42), lines: ['毎日1レッスンで、', '連続記録がのびる。'], music: 'chorus2' },
  { id: 'S9', name: 'エンド', start: beat(42), end: beat(48), lines: [], music: 'resolve' },
];

// Takes: each is a page of the real app, opened in a fresh browser context with a seeded local state, shot for [from, to).
// Every take starts from the same record: lesson 1 finished yesterday (a 1-day streak), nothing yet today.
export const TAKES = {
  sign: { from: 0, to: beat(15.5) },              // the dictionary page of "あ": forming, the chart's view, the switch, turning
  word: { from: beat(15.5), to: beat(20) },       // the dictionary page of "ありがとう": "ゆっくり" pressed on the first frame
  quiz: { from: beat(20), to: beat(21.5) },       // lesson 2, question 5 of 10 (4 choices): the right hand is chosen
  pairs: { from: beat(21.5), to: beat(24) },      // lesson 2, question 7 of 10 (pairs): the last two pairs are matched
  spell: { from: beat(24), to: beat(31.5) },      // "ことばを指文字で再生" with a name
  dict: { from: beat(31.5), to: beat(36) },       // the dictionary list: 指文字 -> 数字 -> あいさつ, then a finger scrolls
  result: { from: beat(36), to: beat(42) },       // lesson 2 finished: "2日連続", then つづける -> the path screen
};

// sign: scrolled so the letter sits 16 px under the window's top. "ゆっくり" is pressed before frame 0 (no ring), so the
// hand is forming the shape on frame 0 and lands at slowLandsAt. (Earlier in the formation the open hand is taller than the
// frame the app sets for "あ", and its fingertips are cut off at the top of the 3D view.) The turn is to the left only:
// then the sleeve leaves the 3D view through its bottom edge (turning right, it is cut by the side edge).
export const SIGN = { hash: '#/dict/kana-a', anchor: '.sign-label', anchorTop: 16, slowLandsAt: 0.8,
  drags: [{ from: beat(11.25), to: beat(13), dx: -70 }], fingerStart: [130, 20], resetAt: beat(13.5) };   // finger on the fist's right side, away from the thumb
// Camera on the sign take (cropping and scaling of the shot frames only). Bars 1-3: the window is shown down to just
// above the description card (its heading "相手から見た説明" never shows while the hand is seen from yourself). The turn
// (S3, from its cut): a close-up whose bottom edge sits just above the 3D view's bottom edge, so the sleeve runs off the
// video instead of ending in a straight cut; it keeps the thumb (left) and "向きを戻す" (right) in the frame.
export const CAMERA = { maskAboveCard: 4, turn: { from: beat(11), thumbMargin: 40, aboveStageBottom: 1 } };
// The pain, drawn over the real screen: an arrow along the thumb of the chart's view (it points right; drawn while the
// hand forms), and in bar 2 a small window with the real "自分から見る" screen of the same page (the take "inset"),
// whose thumb arrow points left. On the switch the big arrow turns with the hand and the small window leaves.
// Coordinates are app CSS px, measured on the shot frames (thumb from base to tip, arrow drawn just below it).
export const MARKS = {
  viewer: { from: [280, 388], to: [396, 351], label: '相手から見ると', labelAt: [338, 415], drawFrom: 0.2, drawTo: SIGN.slowLandsAt },
  self: { from: [252, 402], to: [148, 344], label: '自分から見ると', labelAt: [196, 432], hideAt: beat(11) },
};
// The small window: a crop of the inset take (the formed hand, seen from yourself), shown with its arrow from `start`.
export const INSET = { start: bar(1) + 0.08, crop: { x: 105, y: 160, w: 330, h: 300 }, box: { x: 10, y: 96, w: 160 }, label: '自分から見ると' };
// word: the notice bubble is closed with its own "i" button before the take (the face and both hands show). "ゆっくり"
// is pressed on the first frame of the scene, so the replay starts there (no jump of the hand on screen) and runs 2.1 s.
export const WORD = { hash: '#/dict/word-arigatou', anchor: '.sign-label', anchorTop: 6 };
// quiz and pairs: lesson 2 (え・お). The quiz shows the choice, not the check (the check button turns grey, then blue).
// The pairs start with あ and い matched; the scene ends 2 frames after the last pair matches.
export const QUIZ = { answer: 'kana-o' };
// spell: the "ことばを指文字で再生" page; a name is typed, then played. 0.5 s of the still end of "り" is left out
// (take time 18.533-19.033 s), so "ん" follows sooner; the take shoots 0.5 s longer than its place in the video.
export const SPELL = { name: 'りん', skip: { from: 18.533, seconds: 0.5 } };
// dict: the dictionary list, scrolled so the course tabs and the first row of cards sit in the window; a finger then
// scrolls through the あいさつ cards.
export const DICT = { anchor: '.course-tabs', anchorTop: 120, swipe: { from: beat(34.75), to: beat(35.75), dy: -170 } };
// result: the screen is scrolled (before the scene) so the streak card shows and the mascot is fully under the band;
// the counter rises; つづける opens the path, where the streak flame now reads 2. `seconds` = the elapsed time shown.
export const RESULT = { anchor: '.result .eyebrow', anchorTop: 8, seconds: 4 * 60 + 12 };

// Taps (the ring is drawn where the real element is; the element is really pressed). `pair:<side>:<id>` = a pairs button.
// `noLead`: the press is on the scene's first frame, so no ring is drawn before it (it would sit on the previous scene).
export const TAPS = [
  { at: bar(2), take: 'sign', target: 'view:self', label: '自分から見る' },                 // the drop: your own view
  { at: SIGN.resetAt, take: 'sign', target: 'button:向きを戻す', label: '向きを戻す' },
  { at: beat(15.5), take: 'word', target: 'button:ゆっくり', label: 'ゆっくり', noLead: true },
  { at: beat(20.5), take: 'quiz', target: `[data-option="${QUIZ.answer}"]`, label: '「お」の手' },
  { at: beat(22.3), take: 'pairs', target: 'pair:sign:kana-e', label: '「え」の手' },
  { at: beat(22.8), take: 'pairs', target: 'pair:label:kana-e', label: 'え' },
  { at: beat(23.35), take: 'pairs', target: 'pair:sign:kana-o', label: '「お」の手' },
  { at: beat(23.9), take: 'pairs', target: 'pair:label:kana-o', label: 'お' },
  { at: beat(24.5), take: 'spell', target: '#spell-input', label: '入力欄' },
  { at: beat(26), take: 'spell', target: 'button:指文字で再生', label: '指文字で再生' },
  { at: beat(32), take: 'dict', target: 'tab:数字', label: '数字' },
  { at: beat(33.5), take: 'dict', target: 'tab:あいさつ', label: 'あいさつ' },
  { at: beat(38.5), take: 'result', target: 'button:つづける', label: 'つづける' },
];
// The name is typed one character at a time (after the input is tapped).
export const TYPING = [...SPELL.name].map((char, i) => ({ at: beat(25) + i * beat(0.25), char }));

// Soft "kira" sounds where a hand shape lands (the hook; each letter of the name, in video time) and a soft tick on every
// tap. render-promo.mjs warns when the capture drifts from them.
export const SHAPE_CUES = [SIGN.slowLandsAt, 17.333, 19.133 - SPELL.skip.seconds];
export const TAP_CUES = TAPS.map((tap) => tap.at);

// Music cues read by promo-audio.mjs. The end chord starts with the end card (beat 42 = 28.0 s).
export const MUSIC_CUES = {
  buildAt: bar(1),
  dropAt: bar(2),
  liftAt: bar(4),
  chorusAt: bar(5),
  chorus2At: bar(9),
  endChordAt: beat(42),
  fadeSeconds: 1.6,
};

// End card (fully readable from about 28.2 s). The URL matches meta.json publicUrl.
export const END_CARD = {
  title: 'てことば',
  sub: '3Dの手で覚える手話と指文字の入門',
  badges: ['無料', '登録なし', 'ブラウザですぐ', 'スマホは指で回せる'],
  url: 'rairakku.com/100days/day-092-shuwa',
  day: 'DAY 092 / 100',
};
