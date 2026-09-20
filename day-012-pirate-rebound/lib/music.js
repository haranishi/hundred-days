/* 伴奏。音源ファイルは1つも読み込まないので、鳴らすものをここで全部組み立てる。

   拍で書いて、鳴らす直前に秒へ落とす（lib/beat.js）。
   打った音が伴奏の一部として乗るように、和音は控えめ・上を空けてある。 */

/** MIDIノート番号 → 周波数。A4(69)=440Hz。 */
export function midiToFreq(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

/* ニ短調。海の唄らしい重さが出て、かつ短調すぎない進行。1小節=4拍で1つずつ進む。 */
const PROGRESSION = [
  { name: 'Dm', bass: 50, pad: [57, 62, 65] },
  { name: 'B♭', bass: 46, pad: [58, 62, 65] },
  { name: 'F', bass: 53, pad: [57, 60, 65] },
  { name: 'C', bass: 48, pad: [55, 60, 64] }
];

/* 8小節のふし。1小節に2音だけ置く。
   音数を増やすと、打った音（プレイヤーの音）が埋もれる。 */
const MELODY = [
  [57, 62], [65, 62], [60, 65], [64, 60],
  [62, 65], [67, 65], [69, 67], [65, 64]
];

export const BEATS_PER_BAR = 4;

/** 小節番号 → その小節のコード。 */
export function chordAt(bar) {
  return PROGRESSION[((bar % PROGRESSION.length) + PROGRESSION.length) % PROGRESSION.length];
}

/** 曲全体の伴奏を組み立てる。返すのは {beat, freq, duration, voice, gain} の並び。 */
export function buildAccompaniment(beats) {
  const events = [];
  const bars = Math.ceil(beats / BEATS_PER_BAR);

  for (let bar = 0; bar < bars; bar += 1) {
    const start = bar * BEATS_PER_BAR;
    const chord = chordAt(bar);

    // 低音。1拍目と3拍目。船が揺れる速さ
    for (const offset of [0, 2]) {
      events.push({ beat: start + offset, freq: midiToFreq(chord.bass), duration: 1.6, voice: 'bass', gain: 0.22 });
    }

    // 和音。小節のあたまで薄く敷く
    for (const midi of chord.pad) {
      events.push({ beat: start, freq: midiToFreq(midi), duration: 3.4, voice: 'pad', gain: 0.05 });
    }

    // ふし。前半の8小節ぶんを繰り返す
    const phrase = MELODY[bar % MELODY.length];
    events.push({ beat: start + 0, freq: midiToFreq(phrase[0]), duration: 1.2, voice: 'melody', gain: 0.09 });
    events.push({ beat: start + 2.5, freq: midiToFreq(phrase[1]), duration: 1.0, voice: 'melody', gain: 0.09 });
  }

  return events.filter((event) => event.beat < beats).sort((a, b) => a.beat - b.beat);
}

/** カウントインの4拍。4拍目だけ高くして「次が頭」だと分かるようにする。 */
export function countInTicks() {
  return [-4, -3, -2, -1].map((beat, index) => ({
    beat,
    freq: index === 3 ? 1046.5 : 784,
    duration: 0.12,
    voice: 'tick',
    gain: 0.3
  }));
}
