// Day096 "UXレシピ" promo storyboard. The video (render-promo.mjs) and the music (promo-audio.mjs) both read this one table.
// Vertical 1080x1920, 30 fps, exactly 30.000 s. 120 BPM: 1 beat = 0.5 s (15 frames), 1 bar (4 beats) = 2.0 s (60 frames), 15 bars = 900 frames.
// The story is "I never know what to put on the page, or in what order" -> pick a purpose, and the page appears at once (the first beat)
// -> the whole page scrolls past -> the customer's flow (気づく→わかる→信じる→動く→安心) -> edit the copy, switch the look -> delete a part
// and the diagnosis moves (shown big: 信じる 1→0, 診断 96→73点) -> its reason and its source -> undo -> eight purposes -> take it out as a
// link / HTML / image -> free, no sign-up, in the browser. Every frame is a real screen of the shipped app: real taps, real typing, real undo.
// Captions state only what the screen shows. (Round 2 of the picture scoring, 2026-11-21: the tap moved from 2.0 s to 1.0 s so the first two
// seconds already move; the reorder beat was dropped and the diagnosis chapter doubled; the numbers are shown in a large card.)
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

// Stage (CSS px; the video is the stage at device scale factor 2 = 1080x1920). The app runs full-width in the lower part;
// the caption band on top (200 px) keeps the app's own top bar and flow meter uncovered. Caption text starts at CSS y 84 and every
// line of text on the stage stays inside y 77..768 (the part of a 9:16 frame that Reels / TikTok / Shorts do not cover with their own buttons).
// The app runs at 415 px wide (a real phone is 390-430 px) and is magnified x1.3 to fill the 540-wide stage, so its text is as large in the
// video as it is on a phone. (At 540 px the same UI looked about 30% smaller than on a phone: every grader found the chips and the reasons too small.)
export const APP_SCALE = 540 / 415;
export const STAGE = { width: 540, height: 960, band: 200, app: { width: 540, height: 760, viewport: { width: 415, height: 584 }, scale: APP_SCALE } };

// Music scenes (one label per scene, every change on a bar line): intro (no drums) -> drop on the tap -> groove -> build -> lift (eight cuts) -> chorus -> resolve.
export const STORYBOARD = [
  { id: 'S0', name: 'フック', start: bar(0), end: bar(1), music: 'intro' },
  { id: 'S1', name: '目的を選ぶ', start: bar(1), end: bar(2), music: 'drop' },
  { id: 'S2', name: '並ぶ・流れ', start: bar(2), end: bar(4), music: 'groove' },
  { id: 'S3', name: '文章・見た目', start: bar(4), end: bar(6), music: 'groove2' },
  { id: 'S4', name: '消す・診断・戻す', start: bar(6), end: bar(9), music: 'build' },
  { id: 'S5', name: '目的は8つ', start: bar(9), end: bar(11), music: 'lift' },
  { id: 'S6', name: '持ち出す', start: bar(11), end: bar(13), music: 'chorus' },
  { id: 'S7', name: 'エンド', start: bar(13), end: bar(15), music: 'resolve' },
];

// The stage labels of the app's customer flow (気づく→わかる→信じる→動く→安心). Colours are the app's own chip colours.
export const STAGES = [
  { key: 'notice', short: '気', label: '気づく', color: '#f6d9a0' },
  { key: 'understand', short: 'わ', label: 'わかる', color: '#bfe3f2' },
  { key: 'trust', short: '信', label: '信じる', color: '#c3eadc' },
  { key: 'act', short: '動', label: '動く', color: '#f6d6bd' },
  { key: 'relief', short: '安', label: '安心', color: '#f2cde0' },
];

// The eight purposes in the app's order; the montage shows one per beat from bar 9.
export const GOALS = [
  { key: 'reserve', label: '予約してもらう', short: '予約' },
  { key: 'buy', label: '買ってもらう', short: '購入' },
  { key: 'inquire', label: '問い合わせてもらう', short: '問い合わせ' },
  { key: 'signup', label: '登録してもらう', short: '登録' },
  { key: 'apply', label: '応募してもらう', short: '応募' },
  { key: 'event', label: '参加してもらう', short: '参加' },
  { key: 'visit', label: '来店してもらう', short: '来店' },
  { key: 'support', label: '応援してもらう', short: '応援' },
];

// The words typed into the hero's catch-copy field (replacing the sample sentence). 15 characters, one every 2 frames.
export const TYPED_TEXT = 'はじめての方も、お話からどうぞ';
export const TYPE_START = 8.7;
export const TYPE_PER = 2 / FPS;

// Captions. `lines` are shown as written. `big` = the hook (it is the thumbnail). `flow` = the five stage labels sit under the app's real chips.
// `goals` = the current purpose name is shown under the line, with eight dots.
export const CAPTIONS = [
  { start: 0, end: bar(1), lines: ['ページ作り、', '何を、どの順番で？'], big: true },
  { start: bar(1), end: bar(2), lines: ['目的を選ぶだけ。', '10個の部品が並ぶ。'] },
  { start: bar(2), end: bar(3), lines: ['おすすめの順番も、出る。'] },
  { start: bar(3), end: bar(4), lines: ['お客さんの流れが、', 'ひと目で。'], flow: true },
  { start: bar(4), end: bar(5), lines: ['文章は、その場で直せる。'] },
  { start: bar(5), end: bar(6), lines: ['見た目は、ワンタップ。'] },
  { start: bar(6), end: bar(7), lines: ['消すと、診断が変わる。'] },
  { start: bar(7), end: at(8, 1), lines: ['理由と根拠も、読める。'] },
  { start: at(8, 1), end: bar(9), lines: ['戻すのも、ワンタップ。'] },
  { start: bar(9), end: bar(11), lines: ['目的は、8つ。'], goals: true },
  { start: bar(11), end: bar(12), lines: ['できたページは、', '持ち出せる。'] },
  { start: bar(12), end: bar(13), lines: ['リンク・HTML・画像で。'] },
];

// The end card (bars 13-14): 4 s. Lines are inside the 9:16 safe area.
export const END_CARD = {
  start: bar(13), end: bar(15),
  label: 'ページを作る人へ',
  lead: '迷うなら、目的から。',
  title: 'UXレシピ',
  sub: '目的を選ぶと、ページの組み立て方が出る',
  pills: ['登録なし', '無料', 'ブラウザだけ'],
  series: '100日チャレンジ  DAY 96',
  cta: 'いますぐ、ブラウザで開けます',
  url: 'rairakku.com/100days/day-096-ux-recipe/',
};

// How the app is driven. `target` is resolved by render-promo.mjs inside the app frame:
//   { role, name, nth? } getByRole  |  { tab } panel tab  |  { row, button } outline row button  |  { css, text? }
// Times are video seconds; a `tap` has the finger arrive on the target just before `at` and click exactly at `at`.
// Every action may carry `cue` (a sound for the music): kind and optional index n. The renderer writes the realised times to capture-report.json.
export const ACTIONS = [
  // Bar 0: the hook. The finger comes in from the right, glides to the first purpose card and taps at 0.5 s: the page appears while the
  // question is still on screen (the music's drop follows at 2.0 s). Then the whole page scrolls past.
  { at: 0, type: 'finger-from', x: 500, y: 640 },
  { at: 0, type: 'finger-to', target: { role: 'button', name: '予約してもらう' }, over: 0.44 },
  { at: 0.5, type: 'tap', target: { role: 'button', name: '予約してもらう' }, wait: 'editor', cue: { kind: 'build' } },
  { at: 1.0, type: 'scroll', el: 'preview', from: 0, to: 'max', over: 2.9, ease: 'inOut', cue: { kind: 'whoosh', dir: 'up' } },
  // Bar 2: "the recommended order comes out too" -> the outline tab opens and its list rolls past: the ten parts in order, each tagged with its flow stage.
  { at: bar(2), type: 'tap', target: { tab: '構成' }, cue: { kind: 'tap' } },
  { at: at(2, 0.4), type: 'scroll', el: 'outline', from: 0, to: 'max', over: 1.4, ease: 'inOut' },
  // The page whooshes back up and has settled before the five chips light up (so the labels sit on a still hero).
  { at: 5.55, type: 'scroll', el: 'preview', from: 'current', to: 0, over: 0.4, ease: 'inOut', cue: { kind: 'whoosh', dir: 'down' } },
  { at: bar(3), type: 'chips', times: [0, 0.25, 0.5, 0.75, 1.0], cues: true },
  // Bar 4: edit the words. The hero's catch-copy is replaced, letter by letter, and the preview above follows.
  { at: at(3, 3) + 0.2, type: 'scroll', el: 'preview', from: 'current', to: 80, over: 0.1, ease: 'inOut' }, // the hero's catch-copy sits fully above the open panel
  { at: at(3, 3), type: 'finger-show' },
  { at: bar(4), type: 'tap', target: { tab: '編集' }, cue: { kind: 'tap' } },
  { at: at(4, 0.6), type: 'tap', target: { role: 'textbox', name: 'キャッチコピー' }, cue: { kind: 'tap' }, scrollInto: 'instant', scrollBlock: 'start', leave: 0.1 },
  { at: at(4, 1.15), type: 'select-all' },
  { at: TYPE_START, type: 'type', text: TYPED_TEXT, per: TYPE_PER },
  // Bar 5: the look. Two contrasting themes, then the panel is folded so the restyled page fills the screen.
  { at: bar(5), type: 'tap', target: { tab: '見た目' }, cue: { kind: 'tap' } },
  { at: at(5, 1), type: 'tap', target: { role: 'radio', name: 'きりっと' }, cue: { kind: 'swap', n: 0 }, scrollInto: 'instant', scrollBlock: 'start' },
  { at: at(5, 2), type: 'tap', target: { role: 'radio', name: 'しっとり' }, cue: { kind: 'swap', n: 2 } },
  { at: at(5, 3), type: 'tap', target: { role: 'button', name: 'パネルをたたむ' }, cue: { kind: 'tap' } },
  // Bar 6: delete the testimonials -> the flow chip 信 drops to 0 and the score falls 96 -> 73 (shown big).
  { at: bar(6), type: 'tap', target: { tab: '構成' }, cue: { kind: 'tap' } },
  { at: at(6, 2), type: 'tap', target: { row: 'お客様の声', button: '削除' }, cue: { kind: 'delete' }, scrollInto: 'instant' },
  { at: at(6, 2) + 0.1, type: 'ring', hold: 1.3, target: { css: '.ed-meter li', nth: 2 } },
  { at: at(6, 2) + 0.1, type: 'ring', hold: 1.3, target: { css: '[data-score]' } },
  { at: at(6, 2) + 0.1, type: 'callout', hold: 1.0, tone: 'down', lines: ['信じる　1 → 0', '診断　96 → 73点'] },
  // Bar 7: the diagnosis tab (the big ring says 73), then the item the deletion caused opens: its reason and its source.
  { at: bar(7), type: 'tap', target: { tab: '診断' }, cue: { kind: 'tap' } },
  { at: at(7, 1.5), type: 'tap', target: { css: '#panel-diagnosis summary', text: '最初の手続きの前に信頼を判断する材料がある' }, cue: { kind: 'expand' }, scrollInto: true, scrollBlock: 'start', scrollLead: 0.4, leave: 0.1 },
  // Bar 8 (second half): undo -> the flow chip and the score come back (shown big), and the diagnosis panel rolls back to its big ring.
  { at: at(8, 1), type: 'tap', target: { role: 'button', name: '元に戻す', nth: 0 }, cue: { kind: 'undo' } },
  { at: at(8, 1) + 0.04, type: 'panel-top', target: { css: '#panel-diagnosis' } },
  { at: at(8, 1) + 0.1, type: 'ring', hold: 1.3, target: { css: '.ed-meter li', nth: 2 } },
  { at: at(8, 1) + 0.1, type: 'ring', hold: 1.3, target: { css: '[data-score]' } },
  { at: at(8, 1) + 0.1, type: 'callout', hold: 1.2, tone: 'up', lines: ['信じる　0 → 1', '診断　73 → 96点'] },
  // Bars 9-10: the eight purposes, one per beat (a different built page each time; the app's own top bar names it).
  { at: bar(9), type: 'montage', goals: GOALS.map((g) => g.key), per: BEAT, cuesKind: 'cut' },
  // Bars 11-12: take it out. The dialog opens on the link tab, then the export tab: HTML and image.
  { at: bar(11), type: 'tap', target: { role: 'button', name: '共有・書き出し' }, cue: { kind: 'open' }, wait: 'dialog' },
  { at: at(11, 3), type: 'tap', target: { role: 'tab', name: '書き出し' }, cue: { kind: 'tap' } },
  { at: at(12, 1), type: 'ring', target: { role: 'button', name: 'HTMLをダウンロード' }, cue: { kind: 'chip', n: 0 } },
  { at: at(12, 2), type: 'ring', target: { role: 'button', name: '画像で保存(PNG)' }, cue: { kind: 'chip', n: 2 } },
  // Bars 13-14: the end card.
  { at: bar(13), type: 'end-card', cue: { kind: 'end' } },
];

// Sound cues for the music, derived from ACTIONS so the picture and the sound cannot drift apart.
// kinds: tap build whoosh chip swap move delete expand undo cut open key end (n = index where several in a row; dir for whoosh)
export function buildCues() {
  const cues = [];
  for (const a of ACTIONS) {
    if (a.cue) cues.push({ at: a.at, ...a.cue });
    if (a.type === 'chips' && a.cues) a.times.forEach((dt, n) => cues.push({ at: Math.round((a.at + dt) * 1000) / 1000, kind: 'chip', n }));
    if (a.type === 'type') for (let i = 0; i < a.text.length; i++) cues.push({ at: Math.round((a.at + i * a.per) * 1000) / 1000, kind: 'key', n: i });
    if (a.type === 'montage') a.goals.forEach((g, n) => cues.push({ at: Math.round((a.at + n * a.per) * 1000) / 1000, kind: a.cuesKind, n }));
  }
  return cues.sort((x, y) => x.at - y.at);
}
export const CUES = buildCues();
