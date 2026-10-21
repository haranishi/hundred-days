import { writeFile } from 'node:fs/promises';

// Original 96 BPM score, twelve bars. No samples, recordings, or downloaded music.
export async function writeAudio(path) {
  const rate = 48000, seconds = 30, count = rate * seconds, beat = .625;
  const left = new Float32Array(count), right = new Float32Array(count), tau = Math.PI * 2;
  const hz = midi => 440 * 2 ** ((midi - 69) / 12);
  let seed = 72021;
  const noise = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 2147483648 - 1; };
  function add(start, duration, gain, pan, sample) {
    const a = Math.cos((pan + 1) * Math.PI / 4), b = Math.sin((pan + 1) * Math.PI / 4);
    for (let i = Math.max(0, Math.ceil(start * rate)); i < Math.min(count, (start + duration) * rate); i++) {
      const t = i / rate - start, edge = Math.max(0, Math.min(1, t / .006, (duration - t) / .06)), value = sample(t) * gain * edge;
      left[i] += value * a; right[i] += value * b;
    }
  }
  function pluck(time, midi, gain = .1, pan = 0, length = 1.1) {
    const f = hz(midi);
    add(time, length, gain, pan, t => (Math.sin(tau * f * t + .8 * Math.sin(tau * f * 2 * t) * Math.exp(-t / .04)) + .16 * Math.sin(tau * f * 3 * t) * Math.exp(-t / .09)) * Math.exp(-t / .32));
  }
  const chords = [[53, 57, 60, 64], [48, 52, 55, 62], [45, 48, 52, 55], [43, 50, 55, 57]];
  const melody = [76, 79, 81, 79, 74, 76, 72, 74, 76, 79, 83, 84];
  for (let bar = 0; bar < 12; bar++) {
    const t = bar * 4 * beat, chord = chords[bar % 4];
    for (let step = 0; step < 8; step++) pluck(t + step * beat / 2, chord[[0, 2, 1, 3, 2, 1, 3, 2][step]] + 12, .09, step % 2 ? .28 : -.28);
    for (let b = 0; b < 4; b++) {
      add(t + b * beat, .6, .14, 0, s => Math.sin(tau * hz(chord[0] - 12) * s) * Math.exp(-s / .26));
      if (b % 2 === 0) add(t + b * beat, .16, .1, 0, s => Math.sin(tau * (46 * s + 1.6 * (1 - Math.exp(-s / .025)))) * Math.exp(-s / .04));
      else add(t + b * beat, .1, .018, .12, s => noise() * Math.exp(-s / .025));
    }
    pluck(t + beat / 2, melody[bar], .12, -.1, 1.35);
    pluck(t + beat * 2.5, melody[(bar + 2) % melody.length], .09, .15, 1.1);
  }
  for (const [time, notes] of [[4, [79]], [9, [76, 79]], [13, [79, 83]], [18, [76, 81]], [24, [72, 76, 79, 84]]]) {
    notes.forEach((note, i) => pluck(time + .065 * i, note, .075, (i - notes.length / 2) * .12, 1.4));
  }
  // Small stereo echoes soften the plucks; the final fade covers their tails.
  const delay = Math.round(.1875 * rate);
  for (let i = delay; i < count; i++) { left[i] += right[i - delay] * .16; right[i] += left[i - delay] * .14; }
  let peak = 0, sum = 0;
  for (let i = 0; i < count; i++) {
    const fade = Math.max(0, Math.min(1, i / (rate * .04), (count - i) / (rate * .5)));
    left[i] *= fade; right[i] *= fade; peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i])); sum += left[i] ** 2 + right[i] ** 2;
  }
  const gain = Math.min(.8 / peak, .12 / Math.sqrt(sum / (count * 2))), wav = Buffer.alloc(44 + count * 4);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(count * 4, 40);
  for (let i = 0; i < count; i++) {
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left[i] * gain)) * 32767), 44 + i * 4);
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[i] * gain)) * 32767), 46 + i * 4);
  }
  await writeFile(path, wav);
  return { sampleRate: rate, channels: 2, duration: seconds, composition: 'Original 96 BPM / twelve bars / synthesized plucks, bass, and soft percussion', samples: 'none' };
}
