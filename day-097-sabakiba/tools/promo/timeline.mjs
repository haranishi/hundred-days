// Day097 "さばき場" promo storyboard. The video (render-promo.mjs) and the music (promo-audio.mjs) both read this one table.
// Vertical 1080x1920, 30 fps, exactly 30.000 s. 120 BPM: 1 beat = 0.5 s (15 frames), 1 bar (4 beats) = 2.0 s (60 frames), 15 bars = 900 frames.
// The story is "I have a whole fish and my hands stop: where does the knife go?" -> the knife slides along a red line that shows its path
// (the first beat already moves) -> turn the view -> see through to the bones -> the other hand's position -> left-handed mirror -> eight fish,
// five ways to cut -> just press "next" -> trace the line and get a score -> free, no sign-up, in the browser.
// Every frame is a real screen of the shipped app: real taps, the app's own playback, a real stroke scored by the app.
// Captions state only what the screen shows. Numbers on the stage (the score) are read from the app after the stroke, not typed here.
export const DURATION_SECONDS = 30;
export const BPM = 120;
export const BEAT = 60 / BPM;
export const BAR = BEAT * 4;
export const BARS = 15;
export const FPS = 30;
export const TOTAL_FRAMES = DURATION_SECONDS * FPS;
export const bar = (n) => Math.round(n * BAR * 1000) / 1000;
export const beat = (n) => Math.round(n * BEAT * 1000) / 1000;
export const at = (barNo, beatNo = 0) => Math.round((barNo * BAR + beatNo * BEAT) * 1000) / 1000;
export const frameAt = (seconds) => Math.round(seconds * FPS);

// Stage (CSS px; the video is the stage at device scale factor 2 = 1080x1920). The caption band on top (240 px) keeps the first caption line
// below y 250 px of the video (the part Reels / TikTok / Shorts cover with their own header). The app runs at 432 px wide (a real phone is
// 390-430 px) and is magnified x1.25 to fill the 540-wide stage, so its text is as large in the video as it is on a phone.
export const APP_SCALE = 540 / 432;
export const STAGE = { width: 540, height: 960, band: 240, app: { width: 540, height: 720, viewport: { width: 432, height: 576 }, scale: APP_SCALE } };

// The stripe colours under the caption band (the app's own: ink, cut-line red, hand blue).
export const STAGES = [
  { key: 'ink', color: '#3b4f5a' }, { key: 'cut', color: '#e5422f' }, { key: 'hand', color: '#2b7bd6' },
];

// Music scenes (every change on a bar line): intro (no drums) -> drop -> groove -> groove -> build -> lift (eight cuts) -> chorus -> resolve.
export const STORYBOARD = [
  { id: 'S0', name: 'フック', start: bar(0), end: bar(1), music: 'intro' },
  { id: 'S1', name: '赤い線', start: bar(1), end: bar(2), music: 'drop' },
  { id: 'S2', name: '視点', start: bar(2), end: bar(3), music: 'groove' },
  { id: 'S3', name: '透視', start: bar(3), end: bar(4), music: 'groove' },
  { id: 'S4', name: '手の位置', start: bar(4), end: bar(5), music: 'groove2' },
  { id: 'S5', name: '左利き', start: bar(5), end: bar(6), music: 'groove2' },
  { id: 'S6', name: '8種×5つ', start: bar(6), end: bar(8), music: 'lift' },
  { id: 'S7', name: '8種（続き）', start: bar(8), end: bar(9), music: 'build' },
  { id: 'S8', name: '次へ', start: bar(9), end: bar(11), music: 'chorus' },
  { id: 'S9', name: 'なぞって練習', start: bar(11), end: bar(13), music: 'chorus' },
  { id: 'S10', name: 'エンド', start: bar(13), end: bar(15), music: 'resolve' },
];

// Frames (iframes of the app inside the stage). They are all loaded and set up before the clock is stopped; only the visible one is drawn.
//   hash = the app route (1-based step); debug = the test hook is on (needed to read the practice guide); freeze = no autoplay.
//   zoom = a mouse-wheel zoom on the 3D view before the first frame (the same input a user gives; the fish gets bigger); view = start in that view.
export const FRAMES = [
  { name: 'f-main', hash: '#/fish/aji/4', debug: false, freeze: false, zoom: -250 },   // hook -> red line -> view ("胸びれの後ろを切ります")
  { name: 'f-xray', hash: '#/fish/aji/2', debug: false, freeze: false, view: 'top' },  // see-through -> other hand -> left-handed ("うろことぜいごを取ります")
  { name: 'f-next', hash: '#/fish/aji/7', debug: false, freeze: false },               // "next" x3 (step 7 -> 10)
  { name: 'f-practice', hash: '#/fish/aji/4', debug: true, freeze: true },             // trace practice
];

// The eight fish of the montage (0.75 s each from bar 6, 6 s in all). The first five show the five ways to cut (三枚おろし・手開き・背開き・五枚おろし・節取り).
// goto = [species, step index (0-based), progress] for the frame's still picture; zoom = the wheel zoom that makes the fish fill the width.
export const MONTAGE_ZOOM = -220;
export const MONTAGE_PER = 0.75;
export const FISH = [
  { key: 'aji', name: 'アジ', method: '三枚おろし', goto: ['aji', 1, 0.5] },
  { key: 'iwashi', name: 'イワシ', method: '手開き', goto: ['iwashi', 2, 0.5] },
  { key: 'kisu', name: 'キス', method: '背開き', goto: ['kisu', 2, 0.5] },
  { key: 'hirame', name: 'ヒラメ', method: '五枚おろし', goto: ['hirame', 2, 0.5] },
  { key: 'katsuo', name: 'カツオ', method: '節取り', goto: ['katsuo', 2, 0.5] },
  { key: 'saba', name: 'サバ', method: '三枚おろし', goto: ['saba', 3, 0.5] },
  { key: 'sanma', name: 'サンマ', method: '三枚おろし', goto: ['sanma', 3, 0.5] },
  { key: 'tai', name: 'タイ', method: '三枚おろし', goto: ['tai', 3, 0.5] },
];
export const MONTAGE_FRAMES = FISH.map((f) => `f-m-${f.key}`);

// Captions. `lines` are shown as written. `big` = the hook (it is the thumbnail). `montage` = line 2 is the fish name and method of the beat, with eight dots.
// The last caption stays until the end card has covered the band (no empty band while the card fades in).
export const CAPTIONS = [
  { start: 0, end: bar(1), lines: ['丸ごとの魚、', 'どこに包丁を入れる？'], big: true },
  { start: bar(1), end: bar(2), lines: ['刃の通り道が、', '赤い線で見える。'] },
  { start: bar(2), end: bar(3), lines: ['台所と同じ向きから、', '回して確かめる。'] },
  { start: bar(3), end: bar(4), lines: ['身を透かして、', '骨の位置まで見る。'] },
  { start: bar(4), end: bar(5), lines: ['もう一方の手の位置も、', '示す。'] },
  { start: bar(5), end: bar(6), lines: ['左利きは、', '左右を反転。'] },
  { start: bar(6), end: bar(9), lines: ['魚は8種、さばき方は5つ。'], montage: true },
  { start: bar(9), end: bar(11), lines: ['手順は、', '「次へ」を押すだけ。'] },
  { start: bar(11), end: bar(13) + 0.7, lines: ['なぞって、', '練習もできる。'] },
];

// The end card (bars 13-14): 4 s. Lines are inside the 9:16 safe area.
export const END_CARD = {
  start: bar(13), end: bar(15),
  label: '魚をさばきたい人へ',
  lead: '迷うなら、\n3Dで見てから。',
  title: 'さばき場',
  sub: '魚のさばき方を、3Dで見られるアプリ',
  feats: '刃の線・骨の透視・なぞって練習',
  pills: ['登録なし', '無料', 'ブラウザだけ'],
  series: '100日チャレンジ  DAY 97',
  cta: 'いますぐ、ブラウザで開けます',
  url: 'rairakku.com/100days/day-097-sabakiba/',
};

// How the app is driven. `target` is resolved by render-promo.mjs inside the named frame: { testid } | { css, nth? } | { role, name }.
// Times are video seconds; a `tap` has the finger arrive on the target just before `at` and press exactly at `at` (a real touch).
// Every action may carry `cue` (a sound for the music): kind and optional index n. `cues: [..]` lists several.
export const PRE_ROLL = { frame: 'f-main', playAt: 0, runMs: 450 }; // f-main is already playing at frame 0 (a clean fish with the red line; the knife comes in from the left in the first second)
export const ACTIONS = [
  // Bars 0-1: the hook. A whole fish with the red line, then the knife comes down on it. The music's drop is at 2.0 s; the rise starts at 1.0 s.
  { at: 1.0, type: 'cue', cue: { kind: 'build' } },
  // Bar 2: turn the view with the real view button: kitchen -> side -> top (the camera glides).
  { at: at(2, 0.3), type: 'tap', frame: 'f-main', target: { testid: 'toggle-view' }, cues: [{ kind: 'tap' }, { kind: 'whoosh', dir: 'down' }] },
  { at: at(2, 2.2), type: 'tap', frame: 'f-main', target: { testid: 'toggle-view' }, cues: [{ kind: 'tap' }, { kind: 'whoosh', dir: 'up' }] },
  // Bar 3: cut to the see-through scene (top view already), then see through. The skin turns translucent and the bones show.
  { at: bar(3), type: 'show', frame: 'f-xray', flash: true },
  { at: at(3, 0.9), type: 'tap', frame: 'f-xray', target: { testid: 'toggle-xray' }, cues: [{ kind: 'tap' }, { kind: 'shimmer' }] },
  // Bar 4: the other hand. The blue ring and its tag are the app's own marks; the stage only draws a frame around them.
  { at: at(4, 0.2), type: 'ring', frame: 'f-xray', target: { css: '.fish-pin--hand' }, hold: 1.8, cue: { kind: 'ping' } },
  { at: at(4, 0.2), type: 'ring', frame: 'f-xray', target: { css: '.fish-tag--hand' }, hold: 1.8 },
  // Bar 5: left-handed. The whole scene and the text mirror.
  { at: at(5, 0.5), type: 'tap', frame: 'f-xray', target: { testid: 'toggle-left' }, cues: [{ kind: 'tap' }, { kind: 'flip' }], flash: true },
  // Bars 6-8: eight fish, 0.75 s each. Each frame is a still of the app at one step of that fish (zoomed).
  { at: bar(6), type: 'montage', per: MONTAGE_PER, cuesKind: 'cut' },
  // Bars 9-10: just press "next" (three times). The step name, number and 3D change; the app keeps playing.
  { at: bar(9), type: 'show', frame: 'f-next', flash: true },
  { at: at(9, 1.5), type: 'tap', frame: 'f-next', target: { testid: 'btn-next', dx: 70 }, cue: { kind: 'step', n: 0 } },
  { at: at(9, 3.5), type: 'tap', frame: 'f-next', target: { testid: 'btn-next', dx: 70 }, cue: { kind: 'step', n: 1 } },
  { at: at(10, 1.5), type: 'tap', frame: 'f-next', target: { testid: 'btn-next', dx: 70 }, cue: { kind: 'step', n: 2 } },
  // Bars 11-12: practice. Press the practice button, then trace the red line from the start ring; the app scores the real stroke.
  { at: bar(11), type: 'show', frame: 'f-practice', flash: true },
  { at: at(11, 0.6), type: 'tap', frame: 'f-practice', target: { testid: 'btn-practice' }, cue: { kind: 'tap' } },
  { at: at(11, 2.3), type: 'stroke', frame: 'f-practice', over: 1.4, wobble: 1.6 },
  { at: at(12, 1.5), type: 'callout', hold: 1.1, tone: 'up', result: true, cue: { kind: 'chime' } }, // the result card appears a few frames after the stroke ends; read it from the app, then show it big
  // Bars 13-14: the end card.
  { at: bar(13), type: 'end-card', cue: { kind: 'end' } },
];

// Sound cues for the music, derived from ACTIONS so the picture and the sound cannot drift apart.
// kinds: tap build whoosh shimmer ping flip cut label chime step end (n = index where several in a row; dir for whoosh)
export function buildCues() {
  const cues = [];
  for (const a of ACTIONS) {
    if (a.cue) cues.push({ at: a.at, ...a.cue });
    for (const c of a.cues || []) cues.push({ at: a.at, ...c });
    if (a.type === 'montage') FISH.forEach((_, n) => cues.push({ at: Math.round((a.at + n * a.per) * 1000) / 1000, kind: a.cuesKind, n }));
  }
  return cues.sort((x, y) => x.at - y.at);
}
export const CUES = buildCues();
