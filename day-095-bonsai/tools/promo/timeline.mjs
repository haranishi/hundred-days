// Day095 "盆栽日和" promo storyboard. The video (render-promo.mjs) and the music (promo-audio.mjs) both read this one table.
// Vertical 1080x1920, 30 fps, 29.33 s. 90 BPM: 1 beat = 0.667 s (20 frames), 1 bar (4 beats) = 2.667 s (80 frames), 11 bars = exactly 29.333 s (880 frames).
// The story is a feeling, not a feature list: "a bonsai cannot be un-cut" (the real-life pain) -> cut a branch -> UNDO (the relief:
// here you can go back, up to 30 times) -> wire-bend -> the seasons turn -> three trees -> a photo -> try it.
export const DURATION_SECONDS = 88 / 3;   // 11 bars at 90 BPM = 29.333 s
export const BPM = 90;
export const BEAT = 60 / BPM;
export const BAR = BEAT * 4;
export const BARS = 11;
export const FPS = 30;
export const bar = (n) => Math.round(n * BAR * 1000) / 1000;
export const beat = (n) => Math.round(n * BEAT * 1000) / 1000;
export const frameAt = (seconds) => Math.round(seconds * FPS);

// Scenes, one caption per scene, every change on a bar line. `lines` state only what the screen shows (or a fact of the app).
// The first frame is already moving (the maple turning, leaves falling), never a title card. `big` = the hook (it is the thumbnail).
export const STORYBOARD = [
  // The hook is already moving: the maple turns, leaves fall, and a finger cuts the first branch under the caption (2 lines, big: it is the thumbnail).
  { id: 'S0', name: 'フック', start: bar(0), end: bar(1), lines: ['盆栽は、切りすぎると', '戻らない。'], big: true, music: 'intro' },
  { id: 'S1', name: '切る', start: bar(1), end: bar(2), lines: ['枝を、ぱちん、ぱちん。'], music: 'drop' },
  { id: 'S2', name: '戻せる', start: bar(2), end: bar(3), lines: ['切りすぎても、30回まで戻せる。'], music: 'groove' },
  { id: 'S3', name: '曲げる', start: bar(3), end: bar(4), lines: ['針金で、曲げる。'], music: 'groove' },
  { id: 'S4', name: '季節', start: bar(4), end: bar(6), lines: ['季節が巡って、姿が変わる。'], music: 'lift' },
  // One caption per tree, on the beat the shot starts: the word always matches the tree on screen.
  { id: 'S5a', name: '黒松', start: bar(6), end: bar(7), lines: ['黒松も、'], music: 'chorus' },
  { id: 'S5b', name: '梅', start: bar(7), end: bar(8), lines: ['梅も。'], music: 'chorus' },
  { id: 'S6', name: '写真', start: bar(8), end: bar(9), lines: ['できたら、写真に。'], music: 'chorus2' },
  { id: 'S7', name: 'エンド', start: bar(9), end: bar(11), lines: [], music: 'resolve' },
];

// URL state of the app for every take. All use ?debug=1 (the app's own test entrance: window.__bonsai) and fresh=1 (ignore any saved tree),
// gfx=high (the best picture; the video is shot with software GL, slowly, frame by frame), tips=0 (no first-visit card), seed=11.
// `day` is days since the app's start (day 0 = Oct week 1). Maple colour peaks around day 40; leaves fall most around day 50-60.
export const APP_QUERY = 'debug=1&fresh=1&gfx=high&tips=0&seed=11';

// Story: one page from bar 0 to bar 6, the same maple tree all the way (a real session: real taps, real finger drags, real undo).
export const STORY = {
  // Day 46 = mid-November week 3: the colours are still at their peak and the first leaves are coming down.
  query: `${APP_QUERY}&species=maple&day=46&light=noon`,
  // The camera is moved by this script (the same camera the user moves with a finger): a slow orbit and push-in while nothing is
  // touched (a cutting finger follows its branch), still while a finger drags a branch. Keys are seconds; azimuth/polar in degrees,
  // dist and target in the app's units (default az 20, pol 72, dist 8.5, target [0, 1.5, 0]). Pulled back to dist ~13.3 and aimed up and a
  // little to the left so the whole tree and the pot fit the 540x960 stage, no branch tip touches the screen edge, and the wall above
  // the crown is empty for the caption (the app's own notice sits above that).
  cameraKeys: [
    { at: 0, az: -10, pol: 75, dist: 13.3, target: [-0.5, 2.2, 0] },
    { at: bar(3), az: 12, pol: 75, dist: 13.3, target: [-0.5, 2.2, 0] },             // a slow orbit under the cuts and the undos
    { at: bar(4), az: 12, pol: 75, dist: 13.3, target: [-0.5, 2.2, 0] },             // still through the bend and the wire
    { at: bar(6), az: 62, pol: 72, dist: 13.4, target: [-0.5, 2.2, 0] },             // orbit through the seasons
  ],
  // Real touches. `tool` buttons and undo are pressed with a real finger tap (a ring is drawn at the real element);
  // finger actions are real touch events on the canvas (CDP), at the screen position of the chosen branch.
  // Three big leafy arms are cut (the first under the hook caption), then undone one by one (the history goes back 30 steps).
  // `node` is the app's node id, chosen by trying every candidate on the real screen and keeping the ones whose removal changes it
  // most (the first removes the long left arm, 121 nodes; the second the upper-left cluster, 49; the third the crown cluster, 29).
  // The bend then grabs the tip of that left arm (node 27) and pulls it down: the leaves hang.
  actions: [
    { at: beat(0.5), type: 'tap', target: 'button.tool[data-tool="cut"]', label: '切る' },
    { at: beat(1), type: 'finger-down', branch: 'cut-target', node: 19 },
    { at: beat(2.25), type: 'finger-up' },                                  // cut 1: SNIP_CUES[0]
    { at: bar(1) + beat(0.5), type: 'finger-down', branch: 'cut-target', node: 57 },
    { at: bar(1) + beat(1.5), type: 'finger-up' },                          // cut 2
    { at: bar(1) + beat(1.75), type: 'finger-down', branch: 'cut-target', node: 65 },
    { at: bar(1) + beat(2.75), type: 'finger-up' },                         // cut 3
    { at: bar(2) + beat(0.5), type: 'tap', target: '#undo', label: '元に戻す' },    // the arms come back, one by one
    { at: bar(2) + beat(1.25), type: 'tap', target: '#undo', label: '元に戻す' },
    { at: bar(2) + beat(2), type: 'tap', target: '#undo', label: '元に戻す' },
    { at: bar(3), type: 'tap', target: 'button.tool[data-tool="bend"]', label: '曲げる' },
    { at: bar(3) + beat(0.5), type: 'finger-down', branch: 'bend-target', node: 27 },
    { at: bar(3) + beat(1), type: 'finger-move', dx: -10, dy: 100, over: beat(2) },  // the tip of the left arm is pulled down: the leaves hang
    { at: bar(3) + beat(3.2), type: 'finger-up' },               // the wire is wound here: WIRE_CUE
    { at: bar(4) + beat(0.25), type: 'tap', target: 'button.tool[data-tool="look"]', label: '見る' },
    { at: bar(4) + beat(1), type: 'tap', target: 'button[data-advance="season"]', label: '次の季節' },   // autumn -> winter
    { at: bar(4) + beat(3.5), type: 'tap', target: 'button[data-advance="season"]', label: '次の季節' },   // winter -> spring
    { at: bar(4) + beat(6), type: 'tap', target: 'button[data-advance="season"]', label: '次の季節' },   // spring -> summer; 1.3 s of lush summer before the next shot
  ],
  end: bar(6),
};

// Two more trees (the maple has had the whole story), one shot each (separate pages, each opened on a good-looking day, a slow orbit inside
// the shot). Shots are whole bars, so every cut is on the bar line.
export const TRIO_SHOTS = [
  // The pine turns the other way from the maple and the plum (the orbit direction changes, so the table does not always slope the same way).
  { id: 'pine', query: `${APP_QUERY}&species=pine&day=226&light=morning`, at: bar(6), beats: 4, orbit: { from: { az: 40, pol: 75, dist: 13.5, target: [-0.5, 2.2, 0] }, to: { az: 14, pol: 74, dist: 13.5, target: [-0.5, 2.2, 0] } } },
  { id: 'plum', query: `${APP_QUERY}&species=plum&day=135&light=noon`, at: bar(7), beats: 4, orbit: { from: { az: 10, pol: 75, dist: 12.6, target: [-0.5, 2.2, 0] }, to: { az: 44, pol: 74, dist: 12.6, target: [-0.5, 2.2, 0] } } },
];

// Photo: the plum in bloom (the tree of the shot before), the camera settled, the "写真" button pressed; the app's own photo card (1080x1350, date and species) rises and holds.
export const PHOTO = {
  query: `${APP_QUERY}&species=plum&day=135&light=noon&cam=10,77,12.3`,   // the plum seen just before, from the front (a clean card: the table leg stays out of the picture)
  at: bar(8),
  tapAt: bar(8) + beat(0.5),
  target: '#photo-open',
  end: bar(9),
};

// Moments with a sound of their own (measured from the capture where possible; the script warns when they drift).
export const SNIP_CUES = [beat(2.25), bar(1) + beat(1.5), bar(1) + beat(2.75)];
export const UNDO_CUES = [bar(2) + beat(0.5), bar(2) + beat(1.25), bar(2) + beat(2)];
export const WIRE_CUES = [bar(3) + beat(3.2)];
export const SEASON_CUES = [bar(4) + beat(1), bar(4) + beat(3.5), bar(4) + beat(6)];
export const SHUTTER_CUES = [bar(8) + beat(0.5)];
export const TAP_CUES = STORY.actions.filter((a) => a.type === 'tap').map((a) => a.at).concat(PHOTO.tapAt);

// Music cues read by promo-audio.mjs.
export const MUSIC_CUES = {
  introEnd: bar(1),       // bar 0: a sparse koto line and a breath of wind, no drums
  dropAt: bar(1),         // the cut tool is chosen; the "snip" on beat 3 of bar 1 is the hit that the groove answers
  liftAt: bar(4),
  chorusAt: bar(6),
  photoAt: bar(8),
  endChordAt: bar(9),
  fadeSeconds: 1.8,
};

// End card. The URL matches meta.json publicUrl.
export const END_CARD = {
  title: '盆栽日和',
  sub: '切って、曲げて、育てる。',
  cta: 'まずは、枝を1本、切ってみる。',
  badges: ['無料', '登録なし', 'ブラウザですぐ', 'スマホもPCも'],
  url: 'rairakku.com/100days/day-095-bonsai',
  day: '100日チャレンジ・DAY 95',
};
