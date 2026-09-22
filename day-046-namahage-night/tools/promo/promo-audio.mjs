// 84 BPM / Dm7 → B♭maj7 → Gm7 → A7。大晦日なので、頭と終わりに除夜の鐘を1打ずつ置く。
// 外部音源を使わない決定的な合成。import しただけでは何も書き出さない。
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DURATION_SECONDS, END_START } from './timeline.mjs';

export const SAMPLE_RATE = 48000;
export const BPM = 84;
export const PROGRESSION = [
  [50, 53, 57, 60],
  [46, 50, 53, 57],
  [43, 46, 50, 53],
  [45, 49, 52, 55],
];
// 旋律はニロ抜き（レ・ファ・ソ・ラ・ド）。和音から外れないので、どの小節に置いても濁らない。
const MELODY = [62, 65, 67, 69, 72, 69, 67, 65];

export function normalize(samples, ceiling = 10 ** (-6 / 20)) {
  let peak = 0;
  for (const value of samples) peak = Math.max(peak, Math.abs(value));
  const gain = peak ? ceiling / peak : 1;
  return Float64Array.from(samples, value => value * gain);
}

export function encodeWav(samples, sampleRate = SAMPLE_RATE) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
  }
  return buffer;
}

export function synthesizeMusic({ duration = DURATION_SECONDS, sampleRate = SAMPLE_RATE } = {}) {
  const track = new Float64Array(Math.ceil(duration * sampleRate));
  const beat = 60 / BPM;
  const tau = Math.PI * 2;
  const hz = midi => 440 * 2 ** ((midi - 69) / 12);

  function tone(at, seconds, midi, gain, voice = 'pluck') {
    const first = Math.round(at * sampleRate);
    const frequency = hz(midi);
    for (let j = 0; j < seconds * sampleRate && first + j < track.length; j++) {
      if (first + j < 0) continue;
      const t = j / sampleRate;
      const attack = Math.min(1, t / (voice === 'pad' ? 0.3 : 0.008));
      const release = Math.min(1, (seconds - t) / 0.12);
      const decay = voice === 'pad' ? 1.6 : voice === 'bass' ? 0.5 : 0.22;
      const env = attack * release * Math.exp(-t / decay);
      const wave =
        voice === 'pad'
          ? Math.sin(tau * frequency * t) + 0.1 * Math.sin(tau * frequency * 2 * t)
          : voice === 'bass'
            ? Math.sin(tau * frequency * t)
            : Math.sin(tau * frequency * t) + 0.28 * Math.sin(tau * frequency * 2 * t);
      track[first + j] += wave * env * gain;
    }
  }

  // 除夜の鐘。非整数倍の倍音を重ねて、長く尾を引かせる。
  function bell(at, gain) {
    const first = Math.round(at * sampleRate);
    const partials = [1, 2.02, 2.99, 4.21, 5.43, 6.79];
    const decays = [5.5, 3.4, 2.4, 1.6, 1.1, 0.8];
    for (let j = 0; j < 6.5 * sampleRate && first + j < track.length; j++) {
      if (first + j < 0) continue;
      const t = j / sampleRate;
      let value = 0;
      for (let p = 0; p < partials.length; p++) {
        value += Math.sin(tau * 82 * partials[p] * t) * Math.exp(-t / decays[p]) / (p + 1.4);
      }
      track[first + j] += value * gain * Math.min(1, t / 0.004);
    }
  }

  bell(0, 0.09);
  for (let bar = 0; bar * 4 * beat < duration; bar++) {
    const at = bar * 4 * beat;
    const chord = PROGRESSION[bar % 4];
    for (const midi of chord) tone(at, 3.1, midi, 0.022, 'pad');
    if (at >= END_START) continue;
    tone(at, 1.0, chord[0] - 12, 0.055, 'bass');
    tone(at + 2 * beat, 0.9, chord[0] - 12, 0.04, 'bass');
    for (let n = 0; n < 4; n++) {
      tone(at + n * beat + beat / 2, 0.42, MELODY[(bar * 2 + n) % MELODY.length], 0.038);
    }
  }
  bell(END_START - 0.2, 0.11);
  for (const midi of [50, 57, 62, 65]) tone(END_START, 2.6, midi, 0.032, 'pad');

  for (let i = 0; i < track.length; i++) {
    const t = i / sampleRate;
    track[i] *= Math.min(1, t / 0.05) * Math.max(0, Math.min(1, (duration - t) / 1.6));
  }
  return normalize(track);
}

export function writeMusic(out) {
  writeFileSync(out, encodeWav(synthesizeMusic()));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--help')) console.log('node tools/promo/promo-audio.mjs（promo-audio.wav を作る）');
  else writeMusic(resolve(dirname(fileURLToPath(import.meta.url)), 'promo-audio.wav'));
}
