// BGM の楽譜（純粋なデータと計算。単体試験で並びを確かめる）。
// どちらもこのゲームのために作ったオリジナル。実在する店内BGMやチャイムのメロディは使わない（docs/01）。
// - タイトル：ゆったりした店内放送風。和音は伸ばす（パッド）
// - 試合：はずむ8分音符。強さ0＝メロディ・和音・ハイハット、1＝低音とリズム（キック・スネア）を足す、2＝テンポを上げる
// 音の高さは MIDI の番号（60＝ド4）。位置と長さは8分音符を1とした数。

import type { BgmKind } from '../contracts';

export type Inst = 'lead' | 'chord' | 'bass' | 'kick' | 'snare' | 'hat';

/** [小節の中の位置, 音, 長さ] */
type BarNote = readonly [number, number, number];

export interface NoteEv {
  /** 曲の頭からの位置（8分音符の数） */
  step: number;
  midi: number;
  len: number;
}

export interface Song {
  id: BgmKind;
  bpm: number;
  /** 1小節の8分音符の数（4/4拍子なので8） */
  stepsPerBar: number;
  bars: number;
  lead: readonly NoteEv[];
  /** 小節ごとの和音 */
  chords: readonly (readonly number[])[];
  chordStyle: 'pad' | 'stab';
  bass: readonly NoteEv[];
  /** 1小節の中で打つ位置 */
  drums: { kick: readonly number[]; snare: readonly number[]; hat: readonly number[] };
  /** その楽器が鳴りはじめる強さ */
  layers: Record<Inst, 0 | 1 | 2 | 3>;
}

/** 強さごとのテンポの倍率（2＝ラストスパートで速くなる） */
export const TEMPO_SCALE: readonly [number, number, number] = [1, 1, 1.22];

function flatten(bars: readonly (readonly BarNote[])[], stepsPerBar: number): NoteEv[] {
  return bars.flatMap((notes, bar) => notes.map(([pos, midi, len]) => ({ step: bar * stepsPerBar + pos, midi, len })));
}

/** 小節ごとの根音から、はずむベース（根音・根音・5度・オクターブ上）を作る */
function bounceBass(roots: readonly number[], stepsPerBar: number): NoteEv[] {
  return roots.flatMap((r, bar) => {
    const at = bar * stepsPerBar;
    return [
      { step: at, midi: r, len: 2 },
      { step: at + 3, midi: r, len: 1 },
      { step: at + 4, midi: r + 7, len: 2 },
      { step: at + 6, midi: r + 12, len: 1 },
    ];
  });
}

// タイトル：F G Em Am Dm G C C（ハ長調・IV–V–iii–vi の進行）
const TITLE_LEAD: readonly (readonly BarNote[])[] = [
  [[0, 77, 1], [1, 81, 1], [2, 84, 2], [4, 81, 1], [5, 79, 1], [6, 77, 2]],
  [[0, 79, 1], [1, 83, 1], [2, 86, 2], [4, 84, 1], [5, 83, 1], [6, 79, 2]],
  [[0, 76, 2], [2, 79, 1], [3, 83, 1], [4, 84, 2], [6, 83, 1], [7, 79, 1]],
  [[0, 81, 3], [4, 76, 1], [5, 79, 1], [6, 81, 2]],
  [[0, 77, 1], [1, 81, 1], [2, 84, 1], [3, 86, 1], [4, 84, 2], [6, 81, 2]],
  [[0, 79, 1], [1, 83, 1], [2, 86, 1], [3, 88, 1], [4, 86, 2], [6, 83, 1], [7, 86, 1]],
  [[0, 84, 2], [2, 88, 2], [4, 91, 2], [6, 88, 1], [7, 86, 1]],
  [[0, 84, 4], [6, 79, 1], [7, 81, 1]],
];

export const TITLE_SONG: Song = {
  id: 'title',
  bpm: 108,
  stepsPerBar: 8,
  bars: 8,
  lead: flatten(TITLE_LEAD, 8),
  chords: [
    [57, 60, 65],
    [55, 59, 62],
    [55, 59, 64],
    [57, 60, 64],
    [57, 62, 65],
    [55, 59, 62],
    [55, 60, 64],
    [55, 60, 64],
  ],
  chordStyle: 'pad',
  bass: bounceBass([41, 43, 40, 45, 38, 43, 48, 48], 8),
  drums: { kick: [0], snare: [], hat: [1, 3, 5, 7] },
  // タイトルは強さを変えないので全部0から
  layers: { lead: 0, chord: 0, bass: 0, kick: 0, snare: 3, hat: 0 },
};

// 試合：C F Dm G C F G C（ハ長調）。8分音符で跳ねるメロディ
const GAME_LEAD: readonly (readonly BarNote[])[] = [
  [[0, 72, 1], [1, 76, 1], [2, 79, 1], [3, 76, 1], [4, 84, 1], [6, 79, 1], [7, 76, 1]],
  [[0, 77, 1], [1, 81, 1], [2, 84, 1], [3, 81, 1], [4, 86, 1], [6, 84, 1], [7, 81, 1]],
  [[0, 74, 1], [1, 77, 1], [2, 81, 1], [3, 77, 1], [4, 84, 2], [6, 81, 1], [7, 77, 1]],
  [[0, 79, 2], [2, 83, 1], [3, 86, 1], [4, 91, 2], [6, 89, 1], [7, 86, 1]],
  [[0, 88, 1], [1, 86, 1], [2, 84, 1], [3, 79, 1], [4, 84, 1], [5, 86, 1], [6, 88, 2]],
  [[0, 89, 1], [1, 88, 1], [2, 86, 1], [3, 81, 1], [4, 84, 1], [5, 86, 1], [6, 89, 2]],
  [[0, 91, 1], [1, 89, 1], [2, 88, 1], [3, 86, 1], [4, 83, 1], [5, 86, 1], [6, 79, 2]],
  [[0, 84, 2], [2, 79, 1], [3, 76, 1], [4, 72, 2], [6, 74, 1], [7, 76, 1]],
];

export const GAME_SONG: Song = {
  id: 'game',
  bpm: 126,
  stepsPerBar: 8,
  bars: 8,
  lead: flatten(GAME_LEAD, 8),
  chords: [
    [55, 60, 64],
    [57, 60, 65],
    [57, 62, 65],
    [55, 59, 62],
    [55, 60, 64],
    [57, 60, 65],
    [55, 59, 62],
    [55, 60, 64],
  ],
  chordStyle: 'stab',
  bass: bounceBass([48, 41, 38, 43, 48, 41, 43, 48], 8),
  drums: { kick: [0, 4], snare: [2, 6], hat: [1, 3, 5, 7] },
  layers: { lead: 0, chord: 0, hat: 0, bass: 1, kick: 1, snare: 1 },
};

export const SONGS: Record<BgmKind, Song> = { title: TITLE_SONG, game: GAME_SONG };

export function totalSteps(song: Song): number {
  return song.stepsPerBar * song.bars;
}

/** 8分音符1つの長さ（秒）。強さ2でテンポが上がる */
export function stepSeconds(song: Song, intensity: 0 | 1 | 2): number {
  const bpm = song.bpm * (TEMPO_SCALE[intensity] ?? 1);
  return 60 / bpm / (song.stepsPerBar / 4);
}

export interface Ev {
  inst: Inst;
  midi: number;
  /** 長さ（8分音符の数） */
  len: number;
  /** 強さ 0..1 */
  vel: number;
}

/** その位置で鳴らす音の一覧。step は曲の頭からの位置（ループの長さで丸める） */
export function eventsAt(song: Song, step: number, intensity: 0 | 1 | 2): Ev[] {
  const total = totalSteps(song);
  const s = ((step % total) + total) % total;
  const bar = Math.floor(s / song.stepsPerBar);
  const pos = s % song.stepsPerBar;
  const on = (inst: Inst): boolean => intensity >= song.layers[inst];
  const out: Ev[] = [];
  if (on('lead')) for (const n of song.lead) if (n.step === s) out.push({ inst: 'lead', midi: n.midi, len: n.len, vel: 1 });
  if (on('chord')) {
    const chord = song.chords[bar] ?? [];
    const hit = song.chordStyle === 'pad' ? pos === 0 || pos === 4 : pos % 2 === 1;
    if (hit) for (const m of chord) out.push({ inst: 'chord', midi: m, len: song.chordStyle === 'pad' ? 4 : 1, vel: 1 });
  }
  if (on('bass')) for (const n of song.bass) if (n.step === s) out.push({ inst: 'bass', midi: n.midi, len: n.len, vel: 1 });
  if (on('kick') && song.drums.kick.includes(pos)) out.push({ inst: 'kick', midi: 0, len: 1, vel: 1 });
  if (on('snare') && song.drums.snare.includes(pos)) out.push({ inst: 'snare', midi: 0, len: 1, vel: 1 });
  if (on('hat')) {
    if (song.drums.hat.includes(pos)) out.push({ inst: 'hat', midi: 0, len: 1, vel: 1 });
    // ラストスパートは表拍にも小さく刻んで、せかす
    else if (intensity === 2 && song.id === 'game') out.push({ inst: 'hat', midi: 0, len: 1, vel: 0.6 });
  }
  return out;
}
