// Original garden instruments and score. No recordings or outside sound assets.
export const MUSIC_BPM = 72;
export const MUSIC_BAR_SECONDS = 60 / MUSIC_BPM * 4;
export const MUSIC_LOOP_BARS = 8;
export const SOUND_EVENTS = Object.freeze([
  'step', 'push', 'rain', 'sprout', 'bloom', 'clear',
  'blocked', 'overwater', 'undo', 'reset', 'select', 'pickup', 'warp',
]);
const NOISE = new WeakMap();
const midi = note => 440 * 2 ** ((note - 69) / 12);
const variantNumber = value => Number.isFinite(value) ? Math.abs(Math.floor(value)) % 3 : 0;

function noiseBuffer(context) {
  if (NOISE.has(context)) return NOISE.get(context);
  const sampleRate = context.sampleRate || 44100;
  const buffer = context.createBuffer(1, Math.ceil(sampleRate), sampleRate);
  const samples = buffer.getChannelData(0);
  let seed = 0x36d2a1;
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    samples[i] = seed / 2147483648 - 1;
  }
  NOISE.set(context, buffer);
  return buffer;
}

function batch(context, destination, requestedTime) {
  const now = Number.isFinite(context.currentTime) ? context.currentTime : 0;
  const at = Math.max(now, Number.isFinite(requestedTime) ? requestedTime : now);
  const nodes = [], sources = [];
  let endTime = at, cleaned = false;
  const disconnect = list => {
    for (const node of list) { try { node.disconnect(); } catch { /* Already released. */ } }
  };
  function keep(voiceNodes, voiceSources, end) {
    nodes.push(...voiceNodes);
    sources.push(...voiceSources);
    endTime = Math.max(endTime, end);
    let remaining = voiceSources.length;
    for (const source of voiceSources) {
      source.onended = () => {
        remaining--;
        if (remaining === 0) disconnect(voiceNodes);
      };
    }
  }
  function outlet(pan) {
    if (typeof context.createStereoPanner === 'function') {
      const node = context.createStereoPanner();
      node.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), at);
      node.connect(destination);
      return { destination: node, nodes: [node] };
    }
    return { destination, nodes: [] };
  }
  function tone(frequency, start, options = {}) {
    const {
      duration = .3, amplitude = .1, attack = .006, pan = 0,
      shape = 'sine', endFrequency = frequency,
      partials = [[1, 1, 1]],
    } = options;
    const output = outlet(pan), ownNodes = [...output.nodes], ownSources = [];
    let end = start;
    for (const [ratio, weight, length] of partials) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const life = Math.max(.025, duration * length);
      const rise = Math.min(Math.max(.002, attack), life * .25);
      oscillator.type = shape;
      oscillator.frequency.setValueAtTime(Math.max(20, frequency * ratio), start);
      if (endFrequency !== frequency) {
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency * ratio), start + life * .8);
      }
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(amplitude * weight, start + rise);
      gain.gain.exponentialRampToValueAtTime(.00001, start + life);
      gain.gain.setValueAtTime(0, start + life + .008);
      oscillator.connect(gain);
      gain.connect(output.destination);
      ownNodes.push(oscillator, gain);
      ownSources.push(oscillator);
      oscillator.start(start);
      oscillator.stop(start + life + .015);
      end = Math.max(end, start + life + .015);
    }
    keep(ownNodes, ownSources, end);
  }
  function noise(start, options = {}) {
    const { duration = .1, amplitude = .05, frequency = 900,
      filterType = 'lowpass', q = .7, attack = .005, pan = 0 } = options;
    const output = outlet(pan);
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
    source.buffer = noiseBuffer(context);
    filter.type = filterType;
    filter.frequency.setValueAtTime(frequency, start);
    filter.Q.setValueAtTime(q, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(amplitude, start + Math.min(attack, duration * .3));
    gain.gain.exponentialRampToValueAtTime(.00001, start + duration);
    gain.gain.setValueAtTime(0, start + duration + .008);
    source.connect(filter); filter.connect(gain); gain.connect(output.destination);
    source.start(start); source.stop(start + duration + .015);
    keep([source, filter, gain, ...output.nodes], [source], start + duration + .015);
  }
  function bell(frequency, start, amplitude = .11, duration = .85, pan = 0) {
    tone(frequency, start, { amplitude, duration, pan, attack: .009,
      partials: [[1, 1, 1], [2.003, .32, .57], [3.998, .105, .29], [6.02, .025, .14]] });
  }
  return {
    at, tone, noise, bell,
    finish() {
      return {
        nodes, sources, endTime,
        cleanup() {
          if (cleaned) return;
          cleaned = true;
          for (const source of sources) { try { source.stop(context.currentTime); } catch { /* Already stopped. */ } }
          disconnect(nodes);
        },
      };
    },
  };
}

/** Schedule a finite original effect. Times are AudioContext seconds. */
export function renderSound(context, destination, event, at, { variant = 0 } = {}) {
  const score = batch(context, destination, at), t = score.at, v = variantNumber(variant);
  const { tone, noise, bell } = score;
  switch (event) {
    case 'step':
      noise(t, { duration: .065, amplitude: .07, frequency: 720 + v * 95, pan: v === 1 ? -.08 : .08 });
      tone(155 + v * 11, t, { duration: .085, amplitude: .085, endFrequency: 79 + v * 4, attack: .003 });
      break;
    case 'push':
      noise(t, { duration: .18, amplitude: .095, frequency: 680, filterType: 'bandpass', q: .65, attack: .035 });
      tone(210, t + .014, { duration: .14, amplitude: .03, endFrequency: 165 });
      break;
    case 'rain': {
      noise(t, { duration: .36, amplitude: .042, frequency: 2350, filterType: 'bandpass', q: .48, attack: .018 });
      const droplets = [720, 970, 630, 1120, 810, 900];
      droplets.forEach((frequency, i) => {
        tone(frequency * 1.32, t + i * .047, {
          duration: .075, amplitude: .048 + (i % 2) * .008, attack: .003,
          endFrequency: frequency * .72, pan: (i % 3 - 1) * .22,
        });
      });
      break;
    }
    case 'sprout':
      tone(midi(72 + [0, 2, 4][v]), t, { duration: .24, amplitude: .055, endFrequency: midi(76 + [0, 2, 4][v]), attack: .01 });
      bell(midi(79 + [0, 2, 4][v]), t + .075, .04, .34, .08);
      break;
    case 'bloom':
      bell(midi([76, 74, 79][v]), t, .16, 1.0, -.06);
      bell(midi([83, 81, 86][v]), t + .045, .052, .62, .14);
      break;
    case 'clear': {
      // A new ascending garden cadence; not a quotation from an existing game.
      const melody = [72, 74, 79, 76, 81, 79, 84];
      const starts = [0, .115, .23, .405, .51, .69, .88];
      melody.forEach((note, i) => bell(midi(note), t + starts[i],
        i === melody.length - 1 ? .13 : .095, i === melody.length - 1 ? .95 : .46, (i % 3 - 1) * .1));
      tone(midi(48), t + .88, { duration: .75, amplitude: .065, attack: .025 });
      break;
    }
    case 'blocked':
      tone(132, t, { duration: .068, amplitude: .085, endFrequency: 104, attack: .003 });
      tone(105, t + .073, { duration: .07, amplitude: .052, endFrequency: 88, attack: .004 });
      break;
    case 'overwater':
      noise(t, { duration: .13, amplitude: .055, frequency: 720, filterType: 'bandpass' });
      tone(154, t, { duration: .16, amplitude: .09, shape: 'triangle', endFrequency: 92, attack: .009 });
      tone(114, t + .14, { duration: .19, amplitude: .075, shape: 'triangle', endFrequency: 70, attack: .01 });
      break;
    case 'undo':
      tone(midi(79), t, { duration: .22, amplitude: .08, endFrequency: midi(67), attack: .008 });
      noise(t, { duration: .1, amplitude: .025, frequency: 1150, filterType: 'bandpass' });
      break;
    case 'reset':
      bell(midi(67), t, .075, .32, -.1);
      bell(midi(72), t + .085, .06, .38, .1);
      break;
    case 'pickup':
      bell(midi(79),t,.09,.32,-.12);
      bell(midi(86),t+.085,.07,.43,.12);
      break;
    case 'warp':
      noise(t,{duration:.32,amplitude:.065,frequency:1350,filterType:'bandpass',attack:.055});
      tone(midi(67),t,{duration:.28,amplitude:.055,endFrequency:midi(79),attack:.035,pan:-.2});
      bell(midi(79),t+.16,.045,.36,.2);
      break;
    case 'select':
      bell(midi(72 + v * 2), t, .07, .34);
      break;
    default:
      break;
  }
  return score.finish();
}

const HARMONY = [
  [48, [60, 64, 67]], [45, [57, 60, 64]], [41, [53, 57, 60]], [43, [55, 59, 62]],
  [48, [60, 64, 67]], [45, [57, 60, 64]], [41, [53, 57, 60]], [43, [55, 59, 62]],
];
const MELODY = [
  [[0, 76], [1.5, 79], [3, 74]],
  [[.5, 72], [2, 76], [3, 69]],
  [[0, 69], [1.5, 72], [3, 74]],
  [[.5, 67], [2, 74], [3, 76]],
  [[0, 79], [2, 81], [3, 76]],
  [[.5, 74], [2, 72], [3, 69]],
  [[0, 72], [1.5, 74], [3, 76]],
  [[.5, 74], [2, 67]],
];

/** Schedule one bar of the original 8-bar, 72 BPM music-box score. */
export function scheduleMusicBar(context, destination, barIndex, at, { level = 0 } = {}) {
  const score = batch(context, destination, at), t = score.at, v = variantNumber(level);
  const bar = ((Math.floor(Number.isFinite(barIndex) ? barIndex : 0) % MUSIC_LOOP_BARS) + MUSIC_LOOP_BARS) % MUSIC_LOOP_BARS;
  const beat = 60 / MUSIC_BPM;
  const [root, chord] = HARMONY[bar];
  score.tone(midi(root), t, {
    duration: MUSIC_BAR_SECONDS * .88, amplitude: .05, attack: .03,
    partials: [[1, 1, 1], [2, .13, .6]],
  });
  chord.forEach((note, index) => {
    score.tone(midi(note), t + index * .018, {
      duration: 2.45, amplitude: .014, attack: .12,
      pan: (index - 1) * .22, partials: [[1, 1, 1], [2, .08, .4]],
    });
  });
  MELODY[bar].forEach(([time, note], index) => {
    const noteAmplitude = .083 + (index === 0 ? .008 : 0);
    score.bell(midi(note), t + time * beat, noteAmplitude, 1.55 + v * .08, (index - 1) * .16);
  });
  if (v > 0 && bar % 2 === 0) {
    score.bell(midi(chord[1] + 12), t + 2.75 * beat, .028, .72, -.22);
  }
  if (v === 2 && bar % 2 === 1) {
    score.tone(midi(chord[0] + 12), t + 1.25 * beat, {
      duration: .8, amplitude: .026, attack: .015,
      partials: [[1, 1, 1], [2.002, .18, .4]], pan: .2,
    });
  }
  return score.finish();
}
