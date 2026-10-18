// Original 120 BPM score: electric-pluck harmony, bass, soft percussion, and game cues.
import { writeFile } from 'node:fs/promises';
export async function writeAudio(path, events) {
  const rate = 48000, seconds = 30, count = rate * seconds;
  const left = new Float32Array(count), right = new Float32Array(count);
  const tau = 2 * Math.PI, hz = midi => 440 * 2 ** ((midi - 69) / 12);
  let seed = 70019;
  const noise = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 2147483648 - 1; };
  function add(start, duration, gain, pan, sample) {
    const a = Math.cos((pan + 1) * Math.PI / 4), b = Math.sin((pan + 1) * Math.PI / 4);
    for (let i = Math.max(0, Math.floor(start * rate)); i < Math.min(count, (start + duration) * rate); i++) {
      const t = i / rate - start, edge = Math.min(1, t / .004, (duration - t) / .045);
      const value = sample(t) * gain * Math.max(0, edge);
      left[i] += value * a; right[i] += value * b;
    }
  }
  function pluck(start, midi, duration = .65, gain = .18, pan = 0) {
    const f = hz(midi);
    add(start, duration, gain, pan, t => Math.sin(tau*f*t + 1.6*Math.sin(tau*f*t)*Math.exp(-t/.07)) * Math.exp(-t/.2) + .09*Math.sin(tau*f*3*t)*Math.exp(-t/.1));
  }
  const chords = [[60,64,67,71],[57,60,64,67],[53,57,60,64],[55,59,62,67]];
  const bass = [36,33,29,31], tune = [76,79,81,79,76,74,72,74];
  for (let bar = 0; bar < 15; bar++) {
    const start = bar * 2, chord = chords[bar % 4];
    for (let step = 0; step < 8; step++) pluck(start + step * .25, chord[[0,2,1,3,2,1,3,2][step]] + 12, .65, .10, step % 2 ? .35 : -.35);
    for (let beat = 0; beat < 4; beat++) {
      add(start + beat * .5, .42, .22, 0, t => Math.sin(tau * hz(bass[bar%4]) * t) * Math.exp(-t/.2));
      if (beat % 2 === 0) add(start + beat * .5, .18, .17, 0, t => Math.sin(tau*(49*t+24*.022*(1-Math.exp(-t/.022)))) * Math.exp(-t/.045));
      else add(start + beat * .5, .12, .032, .1, t => noise() * Math.exp(-t/.028));
      add(start + beat * .5 + .25, .07, .018, -.3, t => noise() * Math.exp(-t/.012));
    }
    if (bar % 2 === 0) {
      pluck(start, tune[(bar/2)%8], .85, .15, -.15);
      pluck(start + .75, tune[((bar/2)+1)%8], .65, .12, .15);
      pluck(start + 1.5, tune[((bar/2)+2)%8], .75, .13, -.1);
    }
  }
  for (const event of events) {
    if (event.type === 'return') {
      add(event.time, .07, .045, event.pan ?? 0, t => Math.sin(tau*690*t)*Math.exp(-t/.013));
    } else if (event.type === 'landing') {
      pluck(event.time, event.flips > 0 ? 84 : 79, .22, event.flips > 0 ? .075 : .045, 0);
      if (event.flips > 0) pluck(event.time+.045, 88, .24, .05, .2);
    }
  }
  [72,76,79,84].forEach((note,i) => pluck(25.8+i*.085,note,1.1,.085,(i-1.5)*.12));
  let sum = 0, peak = 0;
  for (let i=0;i<count;i++) {
    const fade = Math.min(1, i / (rate*.06), (count-i)/(rate*.45));
    left[i] *= fade; right[i] *= fade;
    sum += left[i]**2+right[i]**2; peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));
  }
  const gain = Math.min(.8 / peak, .115 / Math.sqrt(sum / (count*2)));
  const wav = Buffer.alloc(44+count*4);
  wav.write('RIFF',0); wav.writeUInt32LE(wav.length-8,4); wav.write('WAVEfmt ',8);
  wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(2,22); wav.writeUInt32LE(rate,24);
  wav.writeUInt32LE(rate*4,28); wav.writeUInt16LE(4,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(count*4,40);
  for(let i=0;i<count;i++) { wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,left[i]*gain))*32767),44+i*4); wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,right[i]*gain))*32767),46+i*4); }
  await writeFile(path,wav);
  return { sampleRate:rate, channels:2, duration:seconds, composition:'Original 120 BPM, 15 bars; synthesized only', cues:events.length };
}
