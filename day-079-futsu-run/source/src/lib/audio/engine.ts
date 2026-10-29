import type { CategoryId } from "../game";
import {
  MusicTransport,
  midiHz,
  volumeGain,
  RUN_STEPS_PER_SECOND,
  type ScheduledMusicNote,
} from "./score";
export type AudioPhase =
  | "countdown"
  | "approach"
  | "crossing"
  | "reveal"
  | "fall"
  | "finish"
  | "error";
export type AudioScene = {
  phase: AudioPhase;
  paused: boolean;
  hidden: boolean;
  holding: boolean;
  category: CategoryId;
};
export type AudioCue = "select" | "pass" | "fall" | "start";
export const DEFAULT_AUDIO_SCENE: AudioScene = {
  phase: "countdown",
  paused: false,
  hidden: false,
  holding: false,
  category: "daily",
};
export function musicAllowed(scene: AudioScene) {
  return (
    !scene.paused &&
    !scene.hidden &&
    ["countdown", "approach", "crossing", "reveal"].includes(scene.phase)
  );
}
export function footstepsAllowed(scene: AudioScene) {
  return (
    musicAllowed(scene) &&
    !scene.holding &&
    ["approach", "crossing", "reveal"].includes(scene.phase)
  );
}
const MUSIC_BUS_GAIN = 1.85;
const EFFECTS_BUS_GAIN = 1.35;
type Voice = {
  source: AudioScheduledSourceNode;
  gain: GainNode;
  nodes: AudioNode[];
  group: "music" | "effects";
};
/** All sounds are original synthesis; no samples, remote requests or hidden autoplay. */
export class GameAudioEngine {
  readonly transport = new MusicTransport();
  private master: GainNode;
  private music: GainNode;
  private effects: GainNode;
  private compressor: DynamicsCompressorNode;
  private safety: WaveShaperNode;
  private voices = new Set<Voice>();
  private noise: AudioBuffer;
  private scene: AudioScene = { ...DEFAULT_AUDIO_SCENE };
  private enabled = false;
  private musicVolume = 0.65;
  private effectsVolume = 0.72;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastFoot = -1;
  private footIndex = 0;
  private disposed = false;
  constructor(private context: BaseAudioContext) {
    this.master = context.createGain();
    this.master.gain.value = 0;
    this.music = context.createGain();
    this.music.gain.value = 0;
    this.effects = context.createGain();
    this.effects.gain.value = 0;
    this.compressor = context.createDynamicsCompressor();
    this.compressor.threshold.value = -12;
    this.compressor.knee.value = 9;
    this.compressor.ratio.value = 3;
    this.compressor.attack.value = 0.006;
    this.compressor.release.value = 0.2;
    this.safety = context.createWaveShaper();
    const curve = new Float32Array(4097);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1,
        a = Math.abs(x);
      curve[i] =
        Math.sign(x) *
        (a <= 0.72 ? a : 0.72 + 0.22 * (1 - Math.exp(-(a - 0.72) / 0.22)));
    }
    this.safety.curve = curve;
    this.safety.oversample = "2x";
    this.music.connect(this.master);
    this.effects.connect(this.master);
    this.master.connect(this.compressor);
    this.compressor.connect(this.safety);
    this.safety.connect(context.destination);
    this.noise = context.createBuffer(
      1,
      Math.ceil(context.sampleRate * 0.5),
      context.sampleRate,
    );
    const channel = this.noise.getChannelData(0);
    let seed = 86173;
    for (let i = 0; i < channel.length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      channel[i] = seed / 2147483648 - 1;
    }
  }
  private ramp(param: AudioParam, value: number, seconds = 0.035) {
    const now = this.context.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + seconds);
  }
  private busLevels() {
    const active = this.enabled && !this.scene.paused && !this.scene.hidden;
    this.ramp(this.master.gain, active ? 0.8 : 0, 0.025);
    this.ramp(
      this.music.gain,
      volumeGain(this.musicVolume) *
        MUSIC_BUS_GAIN *
        (this.scene.holding ? 0.65 : this.scene.phase === "reveal" ? 0.78 : 1),
    );
    this.ramp(
      this.effects.gain,
      volumeGain(this.effectsVolume) * EFFECTS_BUS_GAIN,
    );
  }
  setVolumes(music: number, effects: number) {
    this.musicVolume = Number.isFinite(music)
      ? Math.min(1, Math.max(0, music))
      : 0;
    this.effectsVolume = Number.isFinite(effects)
      ? Math.min(1, Math.max(0, effects))
      : 0;
    this.synchronize();
  }
  setEnabled(value: boolean) {
    if (this.disposed) return;
    this.enabled = value;
    this.synchronize();
  }
  setScene(value: AudioScene) {
    if (this.disposed) return;
    this.scene = { ...value };
    this.synchronize();
  }
  private synchronize() {
    this.busLevels();
    const shouldRun =
      this.enabled && this.musicVolume > 0 && musicAllowed(this.scene);
    if (shouldRun && !this.transport.running) {
      this.transport.start(this.context.currentTime);
      this.timer = setInterval(() => this.pump(), 25);
      this.pump();
    }
    if (!shouldRun && this.transport.running) {
      this.transport.stop();
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
      this.stopVoices("music");
    }
    if (!this.enabled || this.scene.paused || this.scene.hidden)
      this.stopVoices("effects");
    if (!footstepsAllowed(this.scene)) this.lastFoot = -1;
  }
  private pump() {
    if (this.context.state !== "running" || this.disposed) return;
    for (const note of this.transport.take(
      this.context.currentTime,
      this.scene.category,
    ))
      this.scheduleMusic(note);
  }
  private attach(
    source: AudioScheduledSourceNode,
    gain: GainNode,
    nodes: AudioNode[],
    group: "music" | "effects",
    at: number,
    duration: number,
  ) {
    const voice: Voice = { source, gain, nodes, group };
    this.voices.add(voice);
    gain.connect(group === "music" ? this.music : this.effects);
    source.onended = () => {
      for (const node of [source, gain, ...nodes]) {
        try {
          node.disconnect();
        } catch {
          /* Already disconnected by teardown. */
        }
      }
      this.voices.delete(voice);
    };
    source.start(at);
    source.stop(at + duration + 0.035);
  }
  private envelope(
    gain: GainNode,
    at: number,
    level: number,
    duration: number,
    attack = 0.008,
  ) {
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level, at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  }
  private tone(
    frequency: number,
    at: number,
    duration: number,
    level: number,
    type: OscillatorType,
    group: "music" | "effects",
    endFrequency?: number,
    detune = 0,
  ) {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    oscillator.detune.value = detune;
    if (endFrequency)
      oscillator.frequency.exponentialRampToValueAtTime(
        endFrequency,
        at + duration,
      );
    this.envelope(gain, at, level, duration);
    oscillator.connect(gain);
    this.attach(oscillator, gain, [], group, at, duration);
  }
  private noiseHit(
    at: number,
    duration: number,
    level: number,
    frequency: number,
    type: BiquadFilterType,
    group: "music" | "effects",
    pan = 0,
  ) {
    const source = this.context.createBufferSource();
    source.buffer = this.noise;
    const filter = this.context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = type === "bandpass" ? 0.8 : 0.4;
    const gain = this.context.createGain();
    this.envelope(gain, at, level, duration, 0.003);
    const panner = this.context.createStereoPanner();
    panner.pan.value = pan;
    source.connect(filter);
    filter.connect(panner);
    panner.connect(gain);
    this.attach(source, gain, [filter, panner], group, at, duration);
  }
  scheduleMusic(note: ScheduledMusicNote) {
    const at = note.time,
      level = note.level;
    switch (note.instrument) {
      case "chord":
        for (const [i, midi] of (note.notes ?? []).entries())
          this.tone(
            midiHz(midi),
            at + i * 0.012,
            note.duration,
            level,
            "triangle",
            "music",
            undefined,
            i % 2 ? -3 : 3,
          );
        break;
      case "bass":
        this.tone(
          midiHz(note.midi!),
          at,
          note.duration,
          level,
          "sine",
          "music",
        );
        this.tone(
          midiHz(note.midi!) * 2,
          at,
          note.duration * 0.65,
          level * 0.16,
          "triangle",
          "music",
        );
        break;
      case "mallet":
        this.tone(
          midiHz(note.midi!),
          at,
          note.duration,
          level,
          "sine",
          "music",
        );
        this.tone(
          midiHz(note.midi!) * 2.01,
          at,
          note.duration * 0.4,
          level * 0.18,
          "sine",
          "music",
        );
        break;
      case "kick":
        this.tone(130, at, note.duration, level, "sine", "music", 49);
        break;
      case "hat":
        this.noiseHit(
          at,
          note.duration,
          level,
          5800,
          "highpass",
          "music",
          0.16,
        );
        break;
      case "clap":
        this.noiseHit(
          at,
          note.duration,
          level,
          1300,
          "bandpass",
          "music",
          -0.08,
        );
        break;
    }
  }
  play(cue: AudioCue) {
    if (
      !this.enabled ||
      this.scene.paused ||
      this.scene.hidden ||
      this.context.state !== "running" ||
      this.disposed ||
      this.effectsVolume === 0
    )
      return;
    const notes =
      cue === "pass"
        ? [72, 76, 79]
        : cue === "fall"
          ? [55, 50]
          : cue === "start"
            ? [67, 72]
            : [79];
    for (const [i, midi] of notes.entries())
      this.tone(
        midiHz(midi),
        this.context.currentTime + i * 0.055,
        cue === "fall" ? 0.19 : 0.1,
        cue === "select" ? 0.13 : 0.2,
        cue === "fall" ? "triangle" : "sine",
        "effects",
        cue === "fall" ? midiHz(midi - 5) : undefined,
      );
  }
  footstep(side: "left" | "right" = "left") {
    const now = this.context.currentTime;
    if (
      !this.enabled ||
      !footstepsAllowed(this.scene) ||
      this.context.state !== "running" ||
      this.disposed ||
      this.effectsVolume === 0 ||
      now - this.lastFoot < 0.13
    )
      return;
    this.lastFoot = now;
    this.scheduleFootstep(now, side);
  }
  private scheduleFootstep(now: number, side: "left" | "right") {
    const variation = [0.97, 1.04, 1, 0.94, 1.03, 0.99][this.footIndex++ % 6];
    this.tone(
      (side === "left" ? 120 : 132) * variation,
      now,
      0.085,
      0.23,
      "sine",
      "effects",
      58 * variation,
    );
    this.noiseHit(
      now + 0.005,
      0.065,
      0.18,
      1000 * variation,
      "lowpass",
      "effects",
      side === "left" ? -0.16 : 0.16,
    );
  }
  private stopVoices(group?: "music" | "effects") {
    const at = this.context.currentTime;
    for (const voice of this.voices) {
      if (group && voice.group !== group) continue;
      this.ramp(voice.gain.gain, 0, 0.012);
      try {
        voice.source.stop(at + 0.016);
      } catch {
        /* Source may have already ended. */
      }
    }
  }
  preview(
    seconds: number,
    category: CategoryId,
    withFootsteps = false,
    musicVolume = 0.65,
    effectsVolume = 0.72,
  ) {
    this.master.gain.value = 0.8;
    this.music.gain.value = volumeGain(musicVolume) * MUSIC_BUS_GAIN;
    this.effects.gain.value = volumeGain(effectsVolume) * EFFECTS_BUS_GAIN;
    const clock = new MusicTransport();
    clock.start(0);
    for (let now = 0; now < seconds; now += 0.1)
      for (const note of clock.take(now, category))
        if (note.time < seconds) this.scheduleMusic(note);
    if (withFootsteps)
      for (let step = 0; 4 + step / RUN_STEPS_PER_SECOND < seconds; step++)
        this.scheduleFootstep(
          4 + step / RUN_STEPS_PER_SECOND,
          step % 2 ? "right" : "left",
        );
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.enabled = false;
    this.transport.stop();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.ramp(this.master.gain, 0, 0.02);
    this.stopVoices();
    setTimeout(() => {
      this.master.disconnect();
      this.music.disconnect();
      this.effects.disconnect();
      this.compressor.disconnect();
      this.safety.disconnect();
    }, 35);
  }
}
/** A deterministic, opt-in-independent offline preview for audio verification tools only. */
export function scheduleOfflinePreview(
  context: BaseAudioContext,
  seconds = 16,
  category: CategoryId = "daily",
  withFootsteps = false,
  musicVolume = 0.65,
  effectsVolume = 0.72,
) {
  const engine = new GameAudioEngine(context);
  engine.preview(seconds, category, withFootsteps, musicVolume, effectsVolume);
  return engine;
}
