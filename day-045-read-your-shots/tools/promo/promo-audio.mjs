// 120 BPM / Em7 → Cmaj7 → Am7 → Bm7。外部音源なしの決定的な合成。
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeWav, normalize, SAMPLE_RATE } from '../render-demo-audio.mjs';
import { DURATION_SECONDS, RESULT_START, END_START } from './timeline.mjs';
export const BPM = 120;
export const PROGRESSION = [[52, 55, 59, 62], [48, 52, 55, 59], [45, 48, 52, 55], [47, 50, 54, 57]];
export function synthesizeMusic({ duration = DURATION_SECONDS, sampleRate = SAMPLE_RATE } = {}) {
  const track = new Float64Array(Math.ceil(duration * sampleRate));
  const beat = 60 / BPM, tau = Math.PI * 2;
  function tone(at, seconds, midi, gain, voice = 'pluck') {
    const first = Math.round(at * sampleRate), frequency = 440 * 2 ** ((midi - 69) / 12);
    for (let j = 0; j < seconds * sampleRate && first + j < track.length; j++) {
      const t = j / sampleRate, attack = Math.min(1, t / .01), release = Math.min(1, (seconds - t) / .08);
      const env = attack * release * Math.exp(-t / (voice === 'pad' ? 1.2 : .18));
      const wave = voice === 'kick' ? Math.sin(tau * (45 * t + 65 * .035 * (1 - Math.exp(-t / .035))))
        : Math.sin(tau * frequency * t) + (voice === 'pad' ? .12 : .3) * Math.sin(tau * frequency * 2 * t);
      track[first + j] += wave * env * gain;
    }
  }
  for (let bar = 0; bar * 4 * beat < duration; bar++) {
    const at = bar * 4 * beat, chord = PROGRESSION[bar % 4];
    for (const midi of chord) tone(at, 2.3, midi, .026, 'pad');
    if (at >= END_START) continue;
    const level = at >= RESULT_START ? .35 : 1;
    for (let n = 0; n < 8; n++) tone(at + n * beat / 2, .3, chord[(n + bar) % 4] + 12, .042 * level);
    for (const n of [0, 2]) { tone(at + n * beat, .35, chord[0] - 12, .065 * level); tone(at + n * beat, .18, 0, .055 * level, 'kick'); }
  }
  for (const midi of [52, 55, 59, 64]) tone(END_START, 2, midi, .04, 'pad');
  for (let i = 0; i < track.length; i++) {
    const t = i / sampleRate;
    track[i] *= Math.min(1, t / .04) * Math.max(0, Math.min(1, (duration - t) / 1.5));
  }
  return normalize(track, 10 ** (-6 / 20));
}
export function writeMusic(out) { writeFileSync(out, encodeWav(synthesizeMusic())); }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--help')) console.log('node tools/promo/promo-audio.mjs（promo-audio.wavを生成）');
  else writeMusic(resolve(dirname(fileURLToPath(import.meta.url)), 'promo-audio.wav'));
}
