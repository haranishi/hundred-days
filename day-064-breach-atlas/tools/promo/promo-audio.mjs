// Original ambient score synthesized from oscillators; no recordings/samples.
import { writeFile } from 'node:fs/promises';
import { DURATION } from './timeline.mjs';
const rate = 48000, frames = rate * DURATION;
const output = process.argv[2];
if (!output) throw new Error('Specify the output WAV file.');
const pcm = Buffer.alloc(frames * 4);
const chords = [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 67], [52, 55, 59, 62]];
const hz = note => 440 * 2 ** ((note - 69) / 12);
let peak = 0, power = 0;
for (let i = 0; i < frames; i++) {
  const t = i / rate, chord = chords[Math.floor(t / 4) % chords.length];
  const fade = Math.min(1, t / .9, (DURATION - t) / 1.4);
  const local = t % 4, pulse = Math.exp(-4.6 * (t % .75));
  const envelope = Math.min(1, local / .16) * Math.min(1, (4 - local) / .35);
  const pad = chord.reduce((v, note, j) => v + Math.sin(2 * Math.PI * hz(note) * t + j * .3), 0) * .021 * envelope;
  const bell = Math.sin(2 * Math.PI * hz(chord[Math.floor(t / .75) % 4] + 12) * t) * .035 * pulse;
  const low = Math.sin(2 * Math.PI * hz(chord[0] - 12) * t) * .025 * (.6 + .4 * pulse);
  const value = (pad + bell + low) * fade;
  const left = value * (.96 + .04 * Math.sin(t * .5));
  const right = value * (.96 - .04 * Math.sin(t * .5));
  pcm.writeInt16LE(Math.round(left * 32767), i * 4);
  pcm.writeInt16LE(Math.round(right * 32767), i * 4 + 2);
  peak = Math.max(peak, Math.abs(left), Math.abs(right)); power += (left * left + right * right) / 2;
}
const header = Buffer.alloc(44);
header.write('RIFF'); header.writeUInt32LE(pcm.length + 36, 4); header.write('WAVEfmt ', 8);
header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 4, 28);
header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34); header.write('data', 36);
header.writeUInt32LE(pcm.length, 40);
await writeFile(output, Buffer.concat([header, pcm]));
console.log(JSON.stringify({ originalScore: true, seconds: DURATION, peakDb: +(20 * Math.log10(peak)).toFixed(2), rmsDb: +(20 * Math.log10(Math.sqrt(power / frames))).toFixed(2) }));
