const TEMPOS = new Set([100, 110, 120]);
const TONES = new Set(['clear', 'soft']);
const gcd = (a, b) => b ? gcd(b, a % b) : a;

// Integer-second loops keep the loop seam on the same musical grid at 44.1/48kHz.
export function renderBeatLoop(sampleRate, bpm, tone = 'clear') {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new RangeError('sample rate');
  if (!TEMPOS.has(bpm) || !TONES.has(tone)) throw new RangeError('rhythm');
  const divisor = gcd(bpm, 60);
  const beats = bpm / divisor;
  const samples = new Float32Array(Math.round(sampleRate * 60 / divisor));
  const framesPerBeat = sampleRate * 60 / bpm;
  const length = Math.round(sampleRate * 0.055);
  const frequency = tone === 'soft' ? 660 : 1160;
  for (let beat = 0; beat < beats; beat++) {
    const offset = Math.round(beat * framesPerBeat);
    for (let i = 0; i < length && offset + i < samples.length; i++) {
      const t = i / sampleRate;
      const envelope = Math.min(1, t / .0025) * Math.exp(-t * (tone === 'soft' ? 85 : 105));
      const fundamental = Math.sin(2 * Math.PI * frequency * t);
      const overtone = .16 * Math.sin(2 * Math.PI * frequency * 2 * t);
      samples[offset + i] = .7 * envelope * (fundamental + overtone);
    }
  }
  return { samples, beats, framesPerBeat };
}

export class AudioLoopPlayer {
  constructor() {
    this.source = null; this.context = null; this.gain = null; this.voice = null;
    this.voices = new Set(); this.startedAt = 0; this.bpm = 110; this.previous = null;
  }
  get nextBeatTime() {
    if (!this.source) return null;
    const period = 60 / this.bpm;
    let next = this.startedAt + Math.max(0, Math.ceil((this.context.currentTime - this.startedAt) / period)) * period;
    if (next < this.context.currentTime + .02) next += period;
    return next;
  }
  retire(voice, at, immediate = false) {
    const { source, envelope, context } = voice;
    try {
      if (context.state === 'running' || !immediate) {
        envelope.gain.cancelScheduledValues(context.currentTime);
        envelope.gain.setValueAtTime(1, Math.max(context.currentTime, at - .003));
        envelope.gain.linearRampToValueAtTime(0, at);
        source.stop(at);
      } else { source.stop(); source.disconnect(); envelope.disconnect(); this.voices.delete(voice); }
    } catch { source.disconnect(); envelope.disconnect(); this.voices.delete(voice); }
  }
  play(context, { bpm, tone, volume }) {
    const rendered = renderBeatLoop(context.sampleRate, bpm, tone);
    if (this.context && this.context !== context) { this.stop(); this.gain?.disconnect(); this.gain = null; }
    const at = this.nextBeatTime ?? context.currentTime + .025;
    const previous = this.voice;
    if (previous && (context.currentTime >= this.startedAt || !this.previous)) this.previous = { start: this.startedAt, bpm: this.bpm };
    this.context = context;
    if (!this.gain) {
      this.gain = context.createGain(); this.gain.connect(context.destination);
      this.gain.gain.setValueAtTime(.35 * Math.max(0, Math.min(100, volume)) / 100, context.currentTime);
    } else this.setVolume(volume);
    const buffer = context.createBuffer(1, rendered.samples.length, context.sampleRate);
    buffer.getChannelData(0).set(rendered.samples);
    const source = context.createBufferSource(), envelope = context.createGain();
    source.buffer = buffer; source.loop = true; source.loopStart = 0; source.loopEnd = buffer.duration;
    envelope.gain.setValueAtTime(1, context.currentTime);
    source.connect(envelope); envelope.connect(this.gain);
    const voice = { source, envelope, context };
    source.onended = () => { source.disconnect(); envelope.disconnect(); this.voices.delete(voice); };
    this.voices.add(voice);
    try { source.start(at); }
    catch (error) { this.voices.delete(voice); source.disconnect(); envelope.disconnect(); throw error; }
    // Keep the old rhythm until the actual handover. Even a last-moment change must not skip a beat.
    if (previous) this.retire(previous, at);
    this.source = source; this.voice = voice; this.bpm = bpm; this.startedAt = at;
  }
  setVolume(volume) {
    if (this.gain) this.gain.gain.setTargetAtTime(.35 * Math.max(0, Math.min(100, volume)) / 100, this.context.currentTime, .015);
  }
  stop() {
    this.source = null; this.voice = null; this.previous = null;
    for (const voice of [...this.voices]) this.retire(voice, voice.context.currentTime + .006, true);
  }
  get beatPhase() {
    if (!this.source) return 1;
    const now = this.context.currentTime;
    const rhythm = now < this.startedAt && this.previous ? this.previous : { start: this.startedAt, bpm: this.bpm };
    return Math.max(0, (now - rhythm.start) * rhythm.bpm / 60) % 1;
  }
}
