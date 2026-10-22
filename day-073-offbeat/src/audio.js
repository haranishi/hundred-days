import { TRACKS, makeLoop, makeSample, clamp, wrap, crossfadeGains } from './synthesis.js';

export class DJAudio {
  constructor() {
    this.context = null; this.masterValue = .65; this.muted = false; this.echo = false; this.paused = false;
    this.rendered = new Map(); this.samples = new Map(); this.crossfade = .5;
    this.decks = ['a', 'b'].map((id, index) => ({ id, track: TRACKS[index], bpm: TRACKS[index].bpm, playing: false, offset: 0, anchor: 0, volume: .85, eq: [0, 0, 0], filterValue: 1, loop: false, scratching: false, source: null, sourceSerial: 0 }));
  }
  get now() { return this.context?.currentTime ?? 0; }
  get(id) { return this.decks[id === 'a' ? 0 : 1]; }
  prepare() {
    for (const track of TRACKS) if (!this.rendered.has(track.id)) this.rendered.set(track.id, makeLoop(track));
  }
  async init() {
    if (this.context) {
      if (this.context.state === 'suspended' && !this.paused) await this.context.resume();
      return;
    }
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Context) throw new Error('このブラウザは音声再生に対応していません。Chrome / Safariなどで開いてください。');
    this.context = new Context({ latencyHint: 'interactive' });
    const ctx = this.context;
    this.bus = ctx.createGain(); this.bus.gain.value = .78;
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : this.masterValue;
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -12; this.compressor.knee.value = 15; this.compressor.ratio.value = 5; this.compressor.attack.value = .003; this.compressor.release.value = .18;
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 512;
    this.bus.connect(this.compressor); this.compressor.connect(this.master); this.master.connect(this.analyser); this.analyser.connect(ctx.destination);
    this.delay = ctx.createDelay(2); this.delay.delayTime.value = 60 / 122 * .75;
    this.feedback = ctx.createGain(); this.feedback.gain.value = .3;
    this.echoSend = ctx.createGain(); this.echoSend.gain.value = 0;
    this.echoWet = ctx.createGain(); this.echoWet.gain.value = .45;
    this.bus.connect(this.echoSend); this.echoSend.connect(this.delay); this.delay.connect(this.feedback); this.feedback.connect(this.delay); this.delay.connect(this.echoWet); this.echoWet.connect(this.compressor);
    this.prepare();
    for (const deck of this.decks) {
      deck.scratchGain = ctx.createGain();
      deck.eqNodes = [100, 1200, 6000].map((f, i) => {
        const node = ctx.createBiquadFilter(); node.type = ['lowshelf', 'peaking', 'highshelf'][i]; node.frequency.value = f; node.Q.value = .7; return node;
      });
      deck.filter = ctx.createBiquadFilter(); deck.filter.type = 'lowpass'; deck.filter.frequency.value = 20000; deck.filter.Q.value = .7;
      deck.channel = ctx.createGain(); deck.channel.gain.value = deck.volume;
      deck.fader = ctx.createGain();
      deck.scratchGain.connect(deck.eqNodes[0]); deck.eqNodes[0].connect(deck.eqNodes[1]); deck.eqNodes[1].connect(deck.eqNodes[2]); deck.eqNodes[2].connect(deck.filter);
      deck.filter.connect(deck.channel); deck.channel.connect(deck.fader); deck.fader.connect(this.bus);
      this.buffers(deck.track);
    }
    this.setCrossfade(this.crossfade);
    for (const kind of ['kick', 'clap', 'hat', 'horn']) this.samples.set(kind, this.toBuffer(makeSample(kind)));
    await ctx.resume();
  }
  toBuffer(rendered) {
    const buffer = this.context.createBuffer(1, rendered.pcm.length, rendered.sampleRate);
    buffer.copyToChannel(rendered.pcm, 0); return buffer;
  }
  buffers(track) {
    const rendered = this.rendered.get(track.id);
    if (!rendered.buffer) {
      rendered.buffer = this.toBuffer(rendered);
      rendered.reverse = this.toBuffer({ ...rendered, pcm: rendered.pcm.slice().reverse() });
    }
    return rendered;
  }
  position(id) {
    const d = this.get(id), duration = this.rendered.get(d.track.id)?.duration || 60 / d.track.bpm * 16;
    if (!d.playing || d.scratching) return wrap(d.offset, duration);
    let position = d.offset + (this.now - d.anchor) * (d.bpm / d.track.bpm);
    if (d.loop) position = d.loopStart + wrap(position - d.loopStart, d.loopEnd - d.loopStart);
    return wrap(position, duration);
  }
  stopSource(d) {
    if (!d.source) return;
    const old = d.source; d.source = null;
    // A tiny fade prevents clicks when a needle moves or changes direction.
    old.level.gain.cancelScheduledValues(this.now);
    old.level.gain.setValueAtTime(old.level.gain.value, this.now);
    old.level.gain.linearRampToValueAtTime(0, this.now + .006);
    try { old.node.stop(this.now + .008); } catch { /* Already ended. */ }
  }
  source(d, reversed = false, rate = d.bpm / d.track.bpm) {
    this.stopSource(d);
    const ctx = this.context, rendered = this.buffers(d.track), node = ctx.createBufferSource(), level = ctx.createGain();
    node.buffer = reversed ? rendered.reverse : rendered.buffer; node.loop = true;
    if (d.loop && !d.scratching && !reversed) { node.loopStart = d.loopStart; node.loopEnd = d.loopEnd; }
    node.playbackRate.value = Math.max(.001, rate);
    level.gain.setValueAtTime(0, this.now); level.gain.linearRampToValueAtTime(1, this.now + .006);
    node.connect(level); level.connect(d.scratchGain);
    node.onended = () => { node.disconnect(); level.disconnect(); };
    const offset = wrap(reversed ? rendered.duration - d.offset : d.offset, rendered.duration);
    node.start(this.now, offset); d.anchor = this.now; d.source = { node, level, reversed }; d.sourceSerial++;
    return d.source;
  }
  play(id) {
    const d = this.get(id); if (d.playing || !this.context) return;
    d.playing = true; this.source(d);
  }
  pauseDeck(id) {
    const d = this.get(id); d.offset = this.position(id); d.playing = false;
    if (d.scratching) this.endScratch(id, false);
    this.stopSource(d);
  }
  toggle(id) { const d = this.get(id); d.playing ? this.pauseDeck(id) : this.play(id); }
  playBoth() { for (const d of this.decks) this.play(d.id); }
  stopAll() { for (const d of this.decks) this.pauseDeck(d.id); }
  cue(id) { const d = this.get(id); d.offset = 0; d.anchor = this.now; if (d.playing) this.source(d); }
  load(id, trackId) {
    const d = this.get(id), track = TRACKS.find(t => t.id === trackId);
    if (!track) return;
    this.pauseDeck(id); d.track = track; d.bpm = track.bpm; d.offset = 0; d.loop = false;
    if (this.context) this.buffers(track);
  }
  tempo(id, bpm) {
    const d = this.get(id); d.offset = this.position(id); d.anchor = this.now; d.bpm = clamp(bpm, 75, 160);
    if (d.playing && !d.scratching) d.source.node.playbackRate.setTargetAtTime(d.bpm / d.track.bpm, this.now, .01);
  }
  sync(id) {
    const d = this.get(id), other = this.get(id === 'a' ? 'b' : 'a');
    d.offset = this.position(id); this.tempo(id, other.bpm);
    const ownBeat = 60 / d.track.bpm, otherBeat = 60 / other.track.bpm;
    d.offset = Math.floor(d.offset / ownBeat) * ownBeat + wrap(this.position(other.id), otherBeat) / otherBeat * ownBeat;
    d.anchor = this.now;
    if (d.playing) this.source(d);
  }
  setLoop(id) {
    const d = this.get(id); d.offset = this.position(id); d.loop = !d.loop;
    if (d.loop) {
      const measure = 60 / d.track.bpm * 4;
      d.loopStart = Math.floor(d.offset / measure) * measure; d.loopEnd = d.loopStart + measure;
    }
    if (d.playing) this.source(d);
    return d.loop;
  }
  setCrossfade(value) {
    this.crossfade = clamp(value, 0, 1);
    const gains = crossfadeGains(this.crossfade);
    for (const [i, d] of this.decks.entries()) if (d.fader) d.fader.gain.setTargetAtTime(gains[i], this.now, .012);
  }
  setVolume(id, value) { const d = this.get(id); d.volume = value; d.channel?.gain.setTargetAtTime(value, this.now, .012); }
  setEQ(id, index, value) { const d = this.get(id); d.eq[index] = value; d.eqNodes?.[index].gain.setTargetAtTime(value, this.now, .012); }
  setFilter(id, value) {
    const d = this.get(id); d.filterValue = value;
    d.filter?.frequency.setTargetAtTime(180 * (20000 / 180) ** value, this.now, .018);
    d.filter?.Q.setTargetAtTime(value < .9 ? 2 : .7, this.now, .018);
  }
  setMaster(value) { this.masterValue = value; this.master?.gain.setTargetAtTime(this.muted ? 0 : value, this.now, .018); }
  setMuted(muted) { this.muted = muted; this.setMaster(this.masterValue); }
  setEcho(on) { this.echo = on; this.echoSend?.gain.setTargetAtTime(on ? .45 : 0, this.now, .018); }
  sample(kind) {
    if (!this.context || !this.samples.has(kind)) return;
    const node = this.context.createBufferSource(); node.buffer = this.samples.get(kind); node.connect(this.bus);
    node.start(); node.onended = () => node.disconnect();
  }
  beginScratch(id) {
    const d = this.get(id); if (d.scratching || !this.context) return;
    d.offset = this.position(id); d.wasPlaying = d.playing; d.scratching = true; d.scratchDirection = 0;
    this.stopSource(d); d.scratchGain.gain.setValueAtTime(0, this.now);
  }
  moveScratch(id, deltaSeconds, interval) {
    const d = this.get(id); if (!d.scratching || Math.abs(deltaSeconds) < .0003) return;
    d.offset = wrap(d.offset + deltaSeconds, this.buffers(d.track).duration);
    const reversed = deltaSeconds < 0, rate = clamp(Math.abs(deltaSeconds) / Math.max(.008, interval), .08, 3.8);
    if (!d.source || d.source.reversed !== reversed) this.source(d, reversed, rate);
    else d.source.node.playbackRate.setTargetAtTime(rate, this.now, .008);
    d.scratchGain.gain.cancelScheduledValues(this.now); d.scratchGain.gain.setTargetAtTime(1, this.now, .005);
    clearTimeout(d.idleTimer);
    d.idleTimer = setTimeout(() => d.scratchGain.gain.setTargetAtTime(0, this.now, .012), 75);
  }
  endScratch(id, restore = true) {
    const d = this.get(id); if (!d.scratching) return;
    clearTimeout(d.idleTimer); this.stopSource(d); d.scratching = false;
    d.scratchGain.gain.cancelScheduledValues(this.now); d.scratchGain.gain.setValueAtTime(1, this.now);
    d.playing = restore && d.wasPlaying;
    if (d.playing) this.source(d);
  }
  async suspend() {
    if (!this.context) return;
    for (const d of this.decks) this.endScratch(d.id);
    this.paused = true; await this.context.suspend();
  }
  async resume() { if (!this.context) return; this.paused = false; await this.context.resume(); }
  phase(id = 'a') { const d = this.get(id); return wrap(this.position(id), 60 / d.track.bpm) / (60 / d.track.bpm); }
  level() {
    if (!this.analyser || this.paused) return 0;
    this.timeData ||= new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(this.timeData);
    return Math.sqrt(this.timeData.reduce((sum, x) => sum + x * x, 0) / this.timeData.length);
  }
}
