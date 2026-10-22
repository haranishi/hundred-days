export const TRACKS = [
  { id: 'midnight', title: 'Midnight City', artist: 'OFFBEAT ORIGINALS', genre: 'DEEP HOUSE', bpm: 122, key: 'Am', color: '#ff805a', pattern: 0, description: '深いベースと、夜を走るコード。' },
  { id: 'velvet', title: 'Velvet Groove', artist: 'OFFBEAT ORIGINALS', genre: 'UK GARAGE', bpm: 126, key: 'Am', color: '#a9dfcd', pattern: 1, description: '跳ねるビートに、柔らかな鍵盤。' },
  { id: 'dusty', title: 'Dusty Business', artist: 'OFFBEAT ORIGINALS', genre: 'HIP-HOP', bpm: 96, key: 'Am', color: '#e5bb76', pattern: 2, description: 'ゆったり、太く。スクラッチの相棒。' },
  { id: 'acid', title: 'Acid Ritual', artist: 'OFFBEAT ORIGINALS', genre: 'TECHNO', bpm: 132, key: 'Am', color: '#b9a3e8', pattern: 3, description: 'うねるシンセで、ピークタイムへ。' },
];

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
export const wrap = (n, length) => ((n % length) + length) % length;
export const midi = note => 440 * 2 ** ((note - 69) / 12);

function random(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function add(data, sampleRate, at, duration, fn) {
  const start = Math.round(at * sampleRate), count = Math.floor(duration * sampleRate);
  for (let i = 0; i < count; i++) data[(start + i) % data.length] += fn(i / sampleRate, i);
}

export function makeLoop(track, sampleRate = 22050) {
  const beat = 60 / track.bpm, duration = beat * 16;
  const pcm = new Float32Array(Math.round(duration * sampleRate));
  const rand = random(12345 + track.pattern * 213);
  const hiphop = track.pattern === 2, garage = track.pattern === 1, acid = track.pattern === 3;
  const kick = time => add(pcm, sampleRate, time, .46, t => Math.sin(2 * Math.PI * (47 * t + 9 * (1 - Math.exp(-t * 30)))) * Math.exp(-t * 12) * .8 + Math.sin(2 * Math.PI * 900 * t) * Math.exp(-t * 180) * .1);
  for (let b = 0; b < 16; b++) {
    if (!hiphop && (!garage || b % 4 !== 3) || hiphop && [0, 2, 3, 6, 8, 10, 11, 14].includes(b)) kick(b * beat);
    if (garage && b % 4 === 2) kick((b + .75) * beat);
    if (b % 2 === 1) {
      let previous = 0;
      add(pcm, sampleRate, b * beat, .22, t => {
        const n = rand() * 2 - 1, high = n - previous * .8; previous = n;
        const clap = Math.exp(-t * 25) * (.6 + .4 * Math.cos(t * 500));
        return high * clap * .22 + Math.sin(2 * Math.PI * 185 * t) * Math.exp(-t * 35) * .12;
      });
    }
    for (let h = 0; h < 2; h++) {
      const open = h === 1, swing = garage || hiphop ? (h === 1 ? .085 : 0) : 0;
      let previous = 0;
      add(pcm, sampleRate, (b + h * .5 + swing) * beat, open ? .15 : .055, t => {
        const n = rand() * 2 - 1, high = n - previous; previous = n;
        return high * Math.exp(-t * (open ? 35 : 95)) * (open ? .07 : .065);
      });
    }
  }
  const bassNotes = hiphop ? [33, 33, 36, 40, 31, 31, 36, 28] : [33, 33, 40, 36, 31, 31, 38, 36];
  for (let s = 0; s < 32; s++) {
    if (!acid && [3, 7].includes(s % 8)) continue;
    const note = bassNotes[Math.floor(s / 4)] + (acid && s % 4 === 3 ? 12 : 0), frequency = midi(note);
    add(pcm, sampleRate, (s * .5 + (garage && s % 2 ? .08 : 0)) * beat, beat * .48, t => {
      const envelope = (1 - Math.exp(-t * 160)) * Math.exp(-t * (acid ? 10 : 6));
      const fundamental = Math.sin(2 * Math.PI * frequency * t);
      return (fundamental + Math.sin(2 * Math.PI * frequency * 2 * t) * .2 + Math.sin(2 * Math.PI * frequency * 3 * t) * (acid ? .25 : .07)) * envelope * .22;
    });
  }
  const chords = [[57, 60, 64, 67], [55, 59, 62, 65], [53, 57, 60, 64], [55, 59, 62, 69]];
  for (let bar = 0; bar < 4; bar++) {
    const hits = hiphop ? [0, 2.5] : garage ? [.5, 1.75, 3] : [.5, 1.5, 2.5, 3.5];
    for (const hit of hits) for (const note of chords[bar]) {
      const frequency = midi(note);
      add(pcm, sampleRate, (bar * 4 + hit) * beat, beat * 1.4, t => {
        const env = (1 - Math.exp(-t * 95)) * Math.exp(-t * (hiphop ? 4.5 : 8));
        return (Math.sin(2 * Math.PI * frequency * t) + .12 * Math.sin(2 * Math.PI * frequency * 2.003 * t)) * env * .048;
      });
    }
    for (let step = 0; step < 8; step++) {
      if (hiphop && step % 2) continue;
      const note = chords[bar][step % 4] + 12, frequency = midi(note);
      add(pcm, sampleRate, (bar * 4 + step * .5 + .25) * beat, beat * .8, t => Math.sin(2 * Math.PI * frequency * t + Math.sin(2 * Math.PI * frequency * 2 * t) * Math.exp(-t * 12)) * (1 - Math.exp(-t * 160)) * Math.exp(-t * 13) * (acid ? .045 : .035));
    }
  }
  // Gentle saturation keeps the independently composed layers inside [-1, 1].
  for (let i = 0; i < pcm.length; i++) pcm[i] = Math.tanh(pcm[i] * 1.35) * .88;
  return { pcm, sampleRate, duration: pcm.length / sampleRate };
}

export function makeSample(kind, sampleRate = 22050) {
  const duration = kind === 'horn' ? 1 : kind === 'kick' ? .5 : .3;
  const data = new Float32Array(Math.round(sampleRate * duration));
  const rand = random(671), frequencies = [midi(57), midi(64), midi(69)];
  let previous = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate, n = rand() * 2 - 1;
    if (kind === 'kick') data[i] = Math.sin(2 * Math.PI * (48 * t + 8 * (1 - Math.exp(-t * 35)))) * Math.exp(-t * 11) * .8;
    if (kind === 'clap') data[i] = n * Math.exp(-t * 20) * (.6 + .4 * Math.cos(t * 530)) * .55;
    if (kind === 'hat') data[i] = (n - previous) * Math.exp(-t * 65) * .3;
    if (kind === 'horn') data[i] = frequencies.reduce((sum, f) => sum + Math.sin(2 * Math.PI * f * t) + .25 * Math.sin(2 * Math.PI * f * 3 * t), 0) / 5 * Math.min(t * 40, 1) * Math.exp(-t * 3.7) * .65;
    previous = n;
  }
  return { pcm: data, sampleRate, duration };
}

export function crossfadeGains(position) {
  const x = clamp(position, 0, 1);
  return [Math.cos(x * Math.PI / 2), Math.sin(x * Math.PI / 2)];
}
