import type { CategoryId } from "../game";
export const MUSIC_BPM = 96;
export const SECONDS_PER_BEAT = 60 / MUSIC_BPM;
export const MUSIC_STEPS = 64; // Eight original bars, with eighth-note scheduling.
export const RUN_STEPS_PER_SECOND = MUSIC_BPM / 30;
export type Instrument = "chord" | "bass" | "mallet" | "kick" | "hat" | "clap";
export type MusicNote = {
  instrument: Instrument;
  midi?: number;
  notes?: number[];
  duration: number;
  level: number;
  offset?: number;
};
export type ScheduledMusicNote = MusicNote & { time: number; step: number };
const chords = [
  [60, 64, 67, 71],
  [57, 60, 64, 67],
  [53, 57, 60, 64],
  [55, 59, 62, 67],
  [60, 64, 67, 71],
  [57, 60, 64, 67],
  [53, 57, 60, 64],
  [55, 59, 62, 65],
];
const bass = [48, 45, 41, 43, 48, 45, 41, 43];
const melody: (number | null)[][] = [
  [76, null, 79, 81, null, 79, 76, 74],
  [72, null, 76, 79, 76, null, 72, 69],
  [72, null, 74, 76, null, 74, 72, 69],
  [71, null, 74, 79, 76, 74, null, null],
  [79, null, 81, 84, null, 81, 79, 76],
  [76, null, 79, 81, 79, null, 76, 72],
  [74, null, 76, 79, null, 76, 74, 72],
  [71, 74, null, 79, 76, 74, null, null],
];
export function midiHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}
/** Settings use a perceptual -36..0dB range, with a true mute at zero. */
export function volumeGain(value: number): number {
  const v = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  return v === 0 ? 0 : 10 ** ((-36 * (1 - v)) / 20);
}
export function musicNotes(step: number, category: CategoryId): MusicNote[] {
  const normalized =
    ((Math.floor(step) % MUSIC_STEPS) + MUSIC_STEPS) % MUSIC_STEPS;
  const bar = Math.floor(normalized / 8),
    eighth = normalized % 8;
  const transpose = category === "love" ? 2 : category === "money" ? -2 : 0;
  const notes: MusicNote[] = [];
  if (eighth === 0)
    notes.push({
      instrument: "chord",
      notes: chords[bar].map((n) => n + transpose),
      duration: SECONDS_PER_BEAT * 3.6,
      level: category === "love" ? 0.095 : 0.078,
    });
  if ([0, 3, 4, 6].includes(eighth))
    notes.push({
      instrument: "bass",
      midi: bass[bar] + transpose + (eighth === 3 ? 7 : eighth === 6 ? 12 : 0),
      duration: SECONDS_PER_BEAT * (eighth === 3 ? 0.42 : 0.7),
      level: 0.23,
    });
  const tone = melody[bar][eighth];
  if (tone !== null)
    notes.push({
      instrument: "mallet",
      midi: tone + transpose,
      duration: SECONDS_PER_BEAT * 0.62,
      level: category === "love" ? 0.17 : 0.19,
      offset: eighth % 2 ? 0.018 : 0,
    });
  if (eighth === 0 || eighth === 4)
    notes.push({ instrument: "kick", duration: 0.13, level: 0.28 });
  if (eighth === 2 || eighth === 6)
    notes.push({ instrument: "clap", duration: 0.075, level: 0.07 });
  notes.push({
    instrument: "hat",
    duration: 0.035,
    level: eighth % 2 ? 0.025 : 0.038,
    offset: eighth % 2 ? 0.018 : 0,
  });
  return notes;
}
/** Audio-clock lookahead. Missed windows restart ahead instead of dumping stale notes. */
export class MusicTransport {
  private anchor = 0;
  private cursor = 0;
  private active = false;
  start(now: number) {
    this.anchor = now + 0.035;
    this.cursor = 0;
    this.active = true;
  }
  stop() {
    this.active = false;
  }
  get running() {
    return this.active;
  }
  take(
    now: number,
    category: CategoryId,
    lookahead = 0.14,
  ): ScheduledMusicNote[] {
    if (!this.active || !Number.isFinite(now)) return [];
    const stepSeconds = SECONDS_PER_BEAT / 2;
    if (this.anchor + this.cursor * stepSeconds < now - 0.07) this.start(now);
    const horizon = Number.isFinite(lookahead)
      ? Math.min(0.25, Math.max(0, lookahead))
      : 0.14;
    const end = now + horizon;
    const result: ScheduledMusicNote[] = [];
    for (let safety = 0; safety < 8; safety++) {
      const time = this.anchor + this.cursor * stepSeconds;
      if (time > end) break;
      const step = this.cursor++;
      for (const note of musicNotes(step, category))
        result.push({ ...note, step, time: time + (note.offset ?? 0) });
    }
    return result;
  }
}
