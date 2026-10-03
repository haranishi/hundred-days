// OWNER: audio-tools
// 曲の譜面：96BPM・4/4・72小節（ちょうど3分＝1回の遊びの長さ）。調は D、旋律は都節の五音（D・E♭・G・A・B♭）。
// 構成：導入（1〜8）→ A（9〜24、主題）→ B（25〜40、展開）→ C（41〜56、山：主題を全員で）→ 橋渡し（57〜64）→ 終わり（65〜72）。
// 3つの層（静・暴・頂）は同じテンポと和声の上に重ねる。静は単独で曲として成り立ち、暴と頂は足すだけで厚くなる。
// 和声は D の短調とフリギアの色（E♭の和音）で、低い金管と弦を支え、太鼓と琴と笛で和の響きを出す。

export const BPM = 96;
export const BEAT = 60 / BPM;
export const BAR = BEAT * 4;
export const BARS = 72;
export const LENGTH = BAR * BARS;
export const STEP = BEAT / 4;

export const SECTIONS = [
  { name: 'intro', from: 1, to: 8 },
  { name: 'A', from: 9, to: 24 },
  { name: 'B', from: 25, to: 40 },
  { name: 'C', from: 41, to: 56 },
  { name: 'bridge', from: 57, to: 64 },
  { name: 'finale', from: 65, to: 72 },
];

/** 小節（1から）と16分の位置から秒へ。 */
export const T = (bar, step = 0) => (bar - 1) * BAR + step * STEP;

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** 'Bb4' → MIDI の番号 */
export function midi(name) {
  const m = /^([A-G])(b|#)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`音名が読めない: ${name}`);
  return 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0);
}

// 和音の並び（小節ごと）
const A_CHORDS = ['Dm', 'Dm', 'Bb', 'Bb', 'Gm', 'Gm', 'Asus', 'A', 'Dm', 'Dm', 'Eb', 'Eb', 'Gm', 'Gm', 'Asus', 'A'];
export const CHORDS = [
  'D5', 'D5', 'D5', 'D5', 'EbD', 'EbD', 'Dsus', 'D5',
  ...A_CHORDS,
  'Eb', 'Eb', 'Bb', 'Bb', 'Cm', 'Cm', 'Gm', 'Gm', 'Eb', 'Eb', 'Bb', 'Bb', 'Asus', 'Asus', 'A', 'A',
  ...A_CHORDS,
  'EbD', 'EbD', 'EbD', 'EbD', 'GmD', 'GmD', 'Asus', 'A',
  'Dm', 'Dm', 'Bb', 'Bb', 'Gm', 'Gm', 'D5', 'D5',
];

/** 和音ごとの低音・和音の積み（弦と合唱）・琴の分散（8分8つ）。 */
export const VOICING = {
  D5: { bass: 'D2', pad: ['D3', 'A3', 'D4'], arp: ['D4', 'A4', 'D5', 'A4', 'Eb5', 'A4', 'D5', 'A4'] },
  EbD: { bass: 'D2', pad: ['Eb3', 'Bb3', 'Eb4', 'G4'], arp: ['Eb4', 'Bb4', 'Eb5', 'Bb4', 'G4', 'Bb4', 'D5', 'Bb4'] },
  Dsus: { bass: 'D2', pad: ['D3', 'G3', 'A3', 'D4'], arp: ['D4', 'G4', 'A4', 'D5', 'A4', 'G4', 'D4', 'A4'] },
  Dm: { bass: 'D2', pad: ['D3', 'A3', 'D4', 'F4'], arp: ['D4', 'A4', 'D5', 'A4', 'Bb4', 'A4', 'G4', 'A4'] },
  Bb: { bass: 'Bb1', pad: ['Bb2', 'F3', 'Bb3', 'D4'], arp: ['Bb3', 'F4', 'Bb4', 'F4', 'D5', 'Bb4', 'A4', 'F4'] },
  Gm: { bass: 'G1', pad: ['G2', 'D3', 'G3', 'Bb3'], arp: ['G3', 'D4', 'G4', 'D4', 'Bb4', 'A4', 'G4', 'D4'] },
  GmD: { bass: 'D2', pad: ['G2', 'D3', 'G3', 'Bb3'], arp: ['G3', 'D4', 'G4', 'D4', 'Bb4', 'A4', 'G4', 'D4'] },
  Asus: { bass: 'A1', pad: ['A2', 'E3', 'A3', 'D4'], arp: ['A3', 'E4', 'A4', 'E4', 'D5', 'A4', 'E4', 'A4'] },
  A: { bass: 'A1', pad: ['A2', 'E3', 'A3', 'C#4'], arp: ['A3', 'E4', 'A4', 'E4', 'C#5', 'A4', 'E4', 'A4'] },
  Eb: { bass: 'Eb2', pad: ['Eb3', 'Bb3', 'Eb4', 'G4'], arp: ['Eb4', 'Bb4', 'Eb5', 'Bb4', 'G4', 'Bb4', 'D5', 'Bb4'] },
  Cm: { bass: 'C2', pad: ['C3', 'G3', 'C4', 'Eb4'], arp: ['C4', 'G4', 'C5', 'G4', 'Eb5', 'D5', 'C5', 'G4'] },
};

// 旋律（[音名 | 'r', 拍の数]）。主題 A は和音2小節ごとの動きに沿う
export const THEME_A = [
  ['A4', 3], ['Bb4', 1], ['A4', 1], ['G4', 1], ['A4', 2],
  ['D5', 2], ['Bb4', 1], ['D5', 1], ['Eb5', 1], ['D5', 1], ['Bb4', 2],
  ['G4', 2], ['A4', 1], ['Bb4', 1], ['A4', 1], ['G4', 1], ['D4', 2],
  ['A4', 2], ['Bb4', 1], ['A4', 1], ['A4', 4],
  ['D5', 1.5], ['Eb5', 0.5], ['D5', 1], ['A4', 1], ['Bb4', 1], ['A4', 1], ['G4', 1], ['A4', 1],
  ['G4', 2], ['Bb4', 2], ['Eb5', 3], ['D5', 1],
  ['D5', 2], ['Bb4', 1], ['G4', 1], ['A4', 1], ['Bb4', 1], ['A4', 1], ['G4', 1],
  ['A4', 4], ['A4', 2], ['r', 2],
];

export const THEME_B = [
  ['Bb4', 1], ['Eb5', 1], ['G5', 2], ['G5', 1], ['Eb5', 1], ['D5', 2],
  ['D5', 2], ['Bb4', 1], ['A4', 1], ['Bb4', 2], ['r', 2],
  ['G4', 1], ['Eb5', 1], ['D5', 1], ['Eb5', 1], ['G5', 3], ['Eb5', 1],
  ['D5', 2], ['Bb4', 2], ['A4', 1], ['G4', 1], ['D4', 2],
  ['G4', 1], ['Bb4', 1], ['Eb5', 2], ['D5', 1], ['Eb5', 1], ['G5', 2],
  ['G5', 1], ['Eb5', 1], ['D5', 2], ['Bb4', 2], ['D5', 2],
  ['A4', 2], ['D5', 2], ['Eb5', 1], ['D5', 1], ['A4', 2],
  ['A4', 4], ['r', 4],
];

export const INTRO_FLUTE = [
  ['r', 8],
  ['A4', 3], ['Bb4', 0.5], ['A4', 0.5], ['G4', 2], ['A4', 2],
  ['D5', 4], ['Eb5', 1], ['D5', 1], ['Bb4', 2],
  ['A4', 2], ['G4', 1], ['Eb4', 1], ['D4', 4],
];

export const BRIDGE_FLUTE = [
  ['Eb5', 3], ['D5', 1], ['Bb4', 2], ['G4', 2],
  ['A4', 4], ['r', 4],
  ['G4', 2], ['Bb4', 1], ['A4', 1], ['G4', 2], ['D4', 2],
  ['A4', 4], ['A4', 2], ['r', 2],
];

/**
 * r05-audio：指摘「静と暴の 9〜16 小節に旋律が無い」 静の層の笛で吹く短い呼びかけ（9〜16 小節、8小節）。
 * 頂の層の篠笛が同じ小節で主題 A を1オクターブ上に吹くので、重なっても濁らないよう、強い拍は主題とオクターブ・4度・5度・6度で合わせた。
 * 頭の拍は太鼓に譲って休む。13〜16 小節は暴の層の低い金管が1オクターブ下でなぞる（答え）。
 */
export const SHORT_CALL = [
  ['r', 1], ['A4', 1], ['D5', 2],
  ['D5', 1], ['Eb5', 0.5], ['D5', 0.5], ['A4', 2],
  ['Bb4', 1.5], ['A4', 0.5], ['G4', 1], ['Bb4', 1],
  ['Bb4', 2], ['D5', 2],
  ['r', 1], ['D5', 1], ['D5', 1], ['G4', 1],
  ['D5', 2], ['A4', 2],
  ['A4', 2], ['G4', 1], ['A4', 1],
  ['A4', 4],
];

/** 終わり：主題 A の頭6小節から、最後の D へ。 */
export const FINALE_THEME = [...THEME_A.slice(0, 17), ['D5', 8]];

/** 旋律を、startBar から始まる音の並び（{ t, d, m }）にする。transpose は半音。 */
export function melody(line, startBar, transpose = 0) {
  const out = [];
  let beat = 0;
  for (const [name, beats] of line) {
    if (name !== 'r') out.push({ t: T(startBar) + beat * BEAT, d: beats * BEAT, m: midi(name) + transpose });
    beat += beats;
  }
  return out;
}

export const chordAt = (bar) => CHORDS[bar - 1];

/** 小節が属する区分の名前。 */
export function sectionOf(bar) {
  return SECTIONS.find((s) => bar >= s.from && bar <= s.to).name;
}
