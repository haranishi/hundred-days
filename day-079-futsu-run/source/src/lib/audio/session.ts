import {
  DEFAULT_AUDIO_SCENE,
  GameAudioEngine,
  type AudioCue,
  type AudioScene,
} from "./engine";
import {
  readAudioPreferences,
  saveAudioPreferences,
  normalizeAudioPreferences,
  type AudioPreferences,
} from "./preferences";
export type AudioSessionSnapshot = Readonly<{
  enabled: boolean;
  notice: string;
  musicVolume: number;
  effectsVolume: number;
}>;
const clamp = (value: number) =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
/** A play-click owns preparation; the mounted game borrows the same audio graph. */
export class PreparedGameAudioSession {
  private context: AudioContext | null = null;
  private engine: GameAudioEngine | null = null;
  private scene: AudioScene = { ...DEFAULT_AUDIO_SCENE };
  private preferences: AudioPreferences;
  private wanted = false;
  private pending = false;
  private disposed = false;
  private request = 0;
  private leases = 0;
  private wasAcquired = false;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();
  private snapshot: AudioSessionSnapshot;
  activation: Promise<boolean> = Promise.resolve(false);
  constructor(preferences: AudioPreferences = readAudioPreferences()) {
    this.preferences = normalizeAudioPreferences(preferences);
    this.snapshot = {
      enabled: false,
      notice: "",
      musicVolume: this.preferences.music,
      effectsVolume: this.preferences.effects,
    };
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private audible() {
    return (
      !this.disposed &&
      this.wanted &&
      this.context?.state === "running" &&
      (!this.wasAcquired || this.leases > 0)
    );
  }
  private publish(notice = this.snapshot.notice) {
    const next: AudioSessionSnapshot = {
      enabled: Boolean(this.audible()),
      notice,
      musicVolume: this.preferences.music,
      effectsVolume: this.preferences.effects,
    };
    if (
      Object.keys(next).every(
        (key) =>
          next[key as keyof AudioSessionSnapshot] ===
          this.snapshot[key as keyof AudioSessionSnapshot],
      )
    )
      return;
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }
  private onContextState = () => {
    this.engine?.setEnabled(Boolean(this.audible()));
    this.publish();
  };
  /** Calls resume synchronously, while the original click still has activation. */
  enable(announce = true): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    this.wanted = true;
    this.pending = true;
    const request = ++this.request;
    this.preferences = { ...this.preferences, enabled: true };
    saveAudioPreferences(this.preferences);
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.context.addEventListener("statechange", this.onContextState);
      }
      const resumed = this.context.resume();
      this.engine ??= new GameAudioEngine(this.context);
      this.engine.setScene(this.scene);
      this.engine.setVolumes(this.preferences.music, this.preferences.effects);
      this.publish();
      this.activation = Promise.resolve(resumed)
        .then(() => {
          if (this.disposed || request !== this.request || !this.wanted)
            return false;
          const running =
            this.context?.state === "running" &&
            (!this.wasAcquired || this.leases > 0);
          this.engine?.setEnabled(Boolean(running));
          this.publish(
            running
              ? announce
                ? "BGM・足音・効果音をオンにしました"
                : ""
              : "音を開始できませんでした。スピーカーでオンにできます。",
          );
          return Boolean(running);
        })
        .catch(() => {
          if (!this.disposed && request === this.request) {
            this.wanted = false;
            this.engine?.setEnabled(false);
            this.publish(
              "音を開始できませんでした。スピーカーでオンにできます。",
            );
          }
          return false;
        })
        .finally(() => {
          if (request === this.request) this.pending = false;
        });
    } catch {
      this.wanted = false;
      this.pending = false;
      this.engine?.setEnabled(false);
      this.publish("この端末では音を使えません。音なしで遊べます。");
      this.activation = Promise.resolve(false);
    }
    return this.activation;
  }
  mute() {
    if (this.disposed) return;
    this.wanted = false;
    this.pending = false;
    this.request++;
    this.preferences = { ...this.preferences, enabled: false };
    saveAudioPreferences(this.preferences);
    this.engine?.setEnabled(false);
    this.publish("音をオフにしました");
  }
  toggle = (): Promise<boolean> => {
    if (this.snapshot.enabled || (this.wanted && this.pending)) {
      this.mute();
      return Promise.resolve(false);
    }
    return this.enable(true);
  };
  setScene = (value: AudioScene) => {
    if (this.disposed) return;
    this.scene = { ...value };
    this.engine?.setScene(value);
    if (
      this.wanted &&
      !value.paused &&
      !value.hidden &&
      this.context?.state === "suspended"
    ) {
      const context = this.context;
      void context
        .resume()
        .then(() => {
          if (!this.disposed && context === this.context) this.onContextState();
        })
        .catch(() => {
          if (!this.disposed)
            this.publish(
              "音を再開できませんでした。スピーカーでオンにできます。",
            );
        });
    }
  };
  play = (cue: AudioCue) => this.engine?.play(cue);
  footstep = (side: "left" | "right" = "left") => this.engine?.footstep(side);
  setMusicVolume = (value: number) => {
    this.preferences = { ...this.preferences, music: clamp(value) };
    saveAudioPreferences(this.preferences);
    this.engine?.setVolumes(this.preferences.music, this.preferences.effects);
    this.publish();
  };
  setEffectsVolume = (value: number) => {
    this.preferences = { ...this.preferences, effects: clamp(value) };
    saveAudioPreferences(this.preferences);
    this.engine?.setVolumes(this.preferences.music, this.preferences.effects);
    this.publish();
  };
  acquire = () => {
    if (this.disposed) return () => {};
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    this.wasAcquired = true;
    this.leases++;
    this.engine?.setEnabled(Boolean(this.audible()));
    this.publish();
    let released = false;
    return () => {
      if (released || this.disposed) return;
      released = true;
      this.leases = Math.max(0, this.leases - 1);
      if (this.leases === 0) {
        this.engine?.setEnabled(false);
        this.publish();
        this.closeTimer = setTimeout(() => {
          this.closeTimer = null;
          if (this.leases === 0) this.dispose();
        }, 50);
      }
    };
  };
  /** A parent that leaves before its child commits must not abandon an unlocked graph. */
  disposeIfUnclaimed = () => {
    if (!this.wasAcquired) this.dispose();
  };
  dispose = () => {
    if (this.disposed) return;
    this.disposed = true;
    this.request++;
    this.pending = false;
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    this.engine?.dispose();
    this.engine = null;
    const context = this.context;
    this.context = null;
    if (context) {
      context.removeEventListener("statechange", this.onContextState);
      setTimeout(() => void context.close().catch(() => {}), 35);
    }
    this.publish();
    this.listeners.clear();
  };
}
/** Invoke directly from the play button, before any await or component effect. */
export function prepareAudioSession(): PreparedGameAudioSession {
  const preferences = readAudioPreferences();
  const session = new PreparedGameAudioSession(preferences);
  if (preferences.enabled) void session.enable(false);
  return session;
}
