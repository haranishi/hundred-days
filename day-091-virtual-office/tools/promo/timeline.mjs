// Day091 "バーチャルオフィス" promo storyboard. The video (render-promo.mjs) and the music (promo-audio.mjs) both read this table.
// Vertical 1080x1920, 30 fps, 32 s. 720/7 BPM (about 102.9): 1 beat = 7/12 s and 1 bar = 7/3 s, so the drop lands exactly on 7.0 s
// (bar 3) and the end card on 28.0 s (bar 12). Every cut is on a beat or half beat.
// The story is a feeling, not a feature list: "wouldn't you like a desk next to someone, even remote?" (hook: three people at their
// desks) -> the small pains of remote work (cards only, no app) -> make an office (the drop) -> send the link, people come in ->
// walk, sit, status, a word -> other rooms and ping-pong -> alone, NPC colleagues are there -> free, no login.
// Every app frame is the real production site (https://day91.rairakku.com), recorded in real time from three phones (browser
// contexts) in the same office. Only captions, tap rings, flashes, the S1 cards and the end card are drawn on top.
export const DURATION_SECONDS = 32;
export const BPM = 720 / 7;
export const BEAT = 7 / 12;
export const BAR = 4 * BEAT;
export const BARS = Math.ceil(DURATION_SECONDS / BAR);   // 14; the last bar is cut by the fade
const r3 = (x) => Math.round(x * 1000) / 1000;
export const beat = (n) => r3(n * BEAT);
export const bar = (n) => r3(n * BAR);

export const APP_ORIGIN = 'https://day91.rairakku.com';
// The app window appears (white flash) half a beat before the drop, so the top page is seen before the press.
export const WINDOW_AT = beat(11.5);

// Scenes: one caption each (the approved lines, unchanged). `captionAt`: the caption changes with the picture (S2: the frame the
// window appears). `overlayOnly`: no app window (S1 shows the cards instead of a caption).
export const STORYBOARD = [
  { id: 'S0', name: 'フック', start: 0, end: beat(5), lines: ['リモートでも、', '「隣の席」がほしくない？'], music: 'intro' },
  { id: 'S1', name: 'あるある', start: beat(5), end: beat(12), lines: [], overlayOnly: true, music: 'build' },
  { id: 'S2', name: 'オフィスを作る', start: beat(12), end: beat(19), captionAt: WINDOW_AT, lines: ['リンクを送るだけで、', '同じオフィスに。'], music: 'drop' },
  { id: 'S3', name: '招待', start: beat(19), end: beat(27), lines: ['登録なし。', 'リンクを開けば入れる。'], music: 'groove' },
  { id: 'S4', name: '座る・状態・ひとこと', start: beat(27), end: beat(37), lines: ['歩く・座る・状態・ひとこと。'], music: 'lift' },
  { id: 'S5', name: '部屋と卓球', start: beat(37), end: beat(45), lines: ['会議室も、休憩室も、', '卓球も。'], music: 'chorus' },
  { id: 'S6', name: 'ひとりでも', start: beat(45), end: beat(48), lines: ['ひとりでも、', 'NPCの同僚がいます。'], music: 'hush' },
  { id: 'S7', name: 'エンド', start: beat(48), end: DURATION_SECONDS, lines: [], music: 'resolve' },
];
export const scene = (id) => STORYBOARD.find((s) => s.id === id);

// S1: small pains of remote work, one card per beat (they pile up until the drop). The first two are the brief's examples.
export const ARUARU = ['今話しかけていい？', '誰がいるか分からない', 'みんな今なにしてる？', '雑談のきっかけがない', 'ひとりの作業はさみしい', 'ツールの登録がめんどう'];
export const CARD_TIMES = ARUARU.map((_, i) => beat(5 + i));

// People. Names and lines are fixed and plain. Colors are the app's own choices (0 アイボリー … 7 グレー).
export const PEOPLE = {
  A: { name: 'あなた', color: '2' },   // the phone on camera (オレンジ)
  B: { name: 'さくら', color: '5' },   // ピンク
  C: { name: 'はると', color: '1' },   // ブルー
};
export const LINES = { hello: 'おはよう！', hookB: '今日もよろしく！', hookA: 'こちらこそ！' };

// Real-time plan, in VIDEO seconds. The capture schedules each action at (anchor's real time + (video time - anchor's video time)),
// so the taps land on these times and the tick sounds of the music (TAP_CUES) meet them.
export const PLAN = {
  createTap: beat(12),                         // 7.000 the drop: 「オフィスを作る」
  nameTap: 7.45, nameKeys: [7.63, 7.71, 7.79], // the name field, then あ・な・た (replacing the random guest name)
  colorPick: 8.1, joinTap: 8.45,               // color オレンジ, 「入る」
  officeReady: 8.75,                           // the invitation dialog is up (the app opens it for the person who made the office)
  copyTap: 11.25, closeTap: 11.8,              // 「リンクをコピー」, 「閉じる」
  bJoin: 12.6, cJoin: 14.0,                    // さくら and はると press 入る on their own phones (they appear on A's map)
  deskTap: beat(27) + 0.083,                   // 15.833 「デスク」: all three walk to desks
  cMeeting: 18.99, bWave: 19.6,                // はると 会議中, さくら 👋 (the walk to the desks takes about 2.8 s)
  aChatFocus: 19.85, aChatSend: 20.25,         // A types おはよう！ (the input is below the window) and sends it
  hookStart: 0.05, hookLike: 0.8, hookReplyFocus: 0.85, hookReply: 1.5,   // hook (recorded after S4): さくら, はると 👍, A
  coffeeTap: beat(37) + 0.083,                 // 21.667 「コーヒーバー」 (the walk takes about 1.8 s; the cut skips its last part)
  coffeeArrived: 22.85, roomsTap: 23.2, meetingTap: 23.7,   // at the coffee bar: 「部屋を移動」, then 「会議室へ移動」
  meetingReady: beat(41),                      // 23.917 arrived in 会議室 (さくら is already at the table)
  serveTap: beat(43) + 0.083,                  // 25.167 はると's phone: 「サーブして開始」 (vs NPC)
  aloneReady: beat(45),                        // 26.250 another office, one person: the NPC colleagues are at their desks
};
// The tick sounds of the music: the taps seen on screen.
export const TAP_CUES = ['createTap', 'nameTap', 'colorPick', 'joinTap', 'copyTap', 'closeTap', 'deskTap', 'coffeeTap', 'roomsTap', 'meetingTap', 'serveTap'].map((k) => PLAN[k]);

// Shots: the window shows the top 540x825 CSS px of a 540x1020 phone screen (DPR 2). A shot plays one page's recording at real
// speed: capture time = anchor event + lead + (video time - anchor video time). Cuts only at shot boundaries.
// camera: keyframes { at, zoom, focus } (focus: 'screen' = the whole frame, 'trio' = the three people with their labels and
// bubbles, 'entrance' (where people arrive), 'map', 'pong', 'labels' (every label on the map, NPCs too)), resolved from what the
// recording logged, or `point: [x, y]` (CSS px of the frame). `bottom`: the view's lower edge (CSS px) instead of centring on the
// focus; `fit`: how much of the view the focused group may fill (default 0.9). Eased from each keyframe to the next (smoothstep;
// `ease: 'out'` is already moving on its first frame; `ease: 'linear'` for a steady slow push). Boundaries are counted in frames
// (round(seconds * 30)). Views that rest (or push slowly) keep their edges off text: below the button labels (y 360+), on or
// below the map's guide line (y 805+), around the dialog card with its shadow (x 60-490, y 216-814 once 「コピーしました」 shows).
// `flash`: white flash strength at the shot's first frame (scene cuts only).
export const SHOTS = [
  { id: 'hook', from: 0, to: beat(5), take: 'main', page: 'A', anchor: ['hookStart', PLAN.hookStart], geo: 'trioHook',
    camera: [{ at: 0, zoom: 1.42, focus: 'trio', ease: 'out' }, { at: beat(5), zoom: 1.74, focus: 'trio' }] },
  // `untilPageChanges`: the shot ends on the last frame before the page starts to navigate (the next shot starts there).
  { id: 'top', from: WINDOW_AT, to: 7.2, take: 'main', page: 'A', anchor: ['createTap', PLAN.createTap], flash: 0.4, untilPageChanges: true,
    camera: [{ at: WINDOW_AT, zoom: 1, focus: 'screen' }] },
  { id: 'join', from: 7.2, to: 8.75, take: 'main', page: 'A', anchor: ['nameTap', PLAN.nameTap],
    camera: [{ at: 7.2, zoom: 1, focus: 'screen' }] },
  // The invitation: a slow push toward 送る文 and リンクをコピー (the link field above is never the target; its ID is covered in the
  // overlay). After 閉じる, into the map (between the buttons and the toggle) and a slow push toward さくら and はると at the entrance.
  { id: 'invite', from: 8.75, to: beat(27), take: 'main', page: 'A', anchor: ['officeReady', PLAN.officeReady, 0.06], geo: 'arrivals',
    camera: [{ at: 8.75, zoom: 1, focus: 'screen', ease: 'linear' }, { at: 11.13, zoom: 1.15, point: [274.8, 460.7] }, { at: 11.8, zoom: 1.15, point: [274.8, 460.7] },
      { at: 12.77, zoom: 1.9, focus: 'entrance', bottom: 815, ease: 'linear' }, { at: 15.73, zoom: 2.1, focus: 'entrance', bottom: 815 }] },
  { id: 'desk', from: beat(27), to: 18.6, take: 'main', page: 'A', anchor: ['deskTap', PLAN.deskTap], flash: 0.25,
    camera: [{ at: beat(27), zoom: 1, focus: 'screen' }, { at: 16.25, zoom: 1, focus: 'screen' }, { at: 17.1, zoom: 1.22, focus: 'map' }] },
  { id: 'social', from: 18.6, to: beat(37), take: 'main', page: 'A', anchor: ['cMeeting', PLAN.cMeeting], geo: 'trioSocial',
    // Seated: a slow push held by the map's bottom edge, centred so the TEAM A sign (x 124-162) and はると's label (to x 389) stay whole.
    camera: [{ at: 18.6, zoom: 1.22, focus: 'map' }, { at: 19.2, zoom: 1.88, point: [256, 0], bottom: 815, ease: 'linear' }, { at: 21.53, zoom: 1.97, point: [256, 0], bottom: 815 }] },
  { id: 'coffee', from: beat(37), to: beat(39), take: 'main', page: 'A', anchor: ['coffeeTap', PLAN.coffeeTap], flash: 0.25,
    camera: [{ at: beat(37), zoom: 1, focus: 'screen' }, { at: 21.9, zoom: 1, focus: 'screen' }, { at: 22.6, zoom: 1.15, focus: 'map' }] },
  { id: 'rooms', from: beat(39), to: beat(41), take: 'main', page: 'A', anchor: ['coffeeArrived', PLAN.coffeeArrived],
    camera: [{ at: beat(39), zoom: 1, focus: 'screen' }] },
  { id: 'meeting', from: beat(41), to: beat(43), take: 'main', page: 'A', anchor: ['meetingReady', PLAN.meetingReady, 0.08], geo: 'meetingGeo',
    camera: [{ at: beat(41), zoom: 1.12, focus: 'map' }, { at: beat(43), zoom: 1.16, focus: 'map' }] },
  { id: 'pong', from: beat(43), to: beat(45), take: 'main', page: 'C', anchor: ['serveTap', PLAN.serveTap], geo: 'pongGeo',
    camera: [{ at: beat(43), zoom: 1.04, focus: 'pong' }, { at: beat(45), zoom: 1.1, focus: 'pong' }] },
  { id: 'alone', from: beat(45), to: beat(48), take: 'alone', page: 'D', anchor: ['aloneReady', PLAN.aloneReady], geo: 'aloneGeo', flash: 0.25,
    camera: [{ at: beat(45), zoom: 1.3, focus: 'labels' }, { at: beat(48), zoom: 1.4, focus: 'labels' }] },
];
// Scene-level flashes that are not a shot start: hook -> cards, last shot -> end card.
export const FLASHES = [[beat(5), 0.25], [beat(48), 0.3]];

// The alone take: a fresh office with one person, who walks to the aisle between TEAM A and TEAM B so that two NPC colleagues at
// their desks are in the phone's view (the app seats NPCs on free seats; the person stands, so no seat is taken).
export const ALONE = { tile: { x: 15, y: 12 } };

// A status every seated person sets before sitting ('home' = 在宅), or null. It worked around a bug of the production app (a name
// label with an empty or hidden status icon ran off the map with its bubble), fixed on 2026-11-13, so it stays null.
export const SEATED_STATUS = null;

// Music cues read by promo-audio.mjs.
export const MUSIC_CUES = {
  buildAt: beat(5),
  dropAt: beat(12),
  liftAt: beat(27),
  chorusAt: beat(37),
  hushAt: beat(45),
  endChordAt: beat(48),
  fadeSeconds: 1.6,
};

// End card (the brief's text). The URL matches meta.json publicUrl.
export const END_CARD = {
  title: 'バーチャルオフィス',
  badges: ['無料', 'ログイン不要'],
  url: 'day91.rairakku.com',
  day: '100日チャレンジ Day91',
};
