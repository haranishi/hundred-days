import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_AUDIO_SCENE } from "../src/lib/audio/engine";
import {
  PreparedGameAudioSession,
  prepareAudioSession,
} from "../src/lib/audio/session";
import {
  AUDIO_PREFERENCES_KEY,
  DEFAULT_AUDIO_PREFERENCES,
  normalizeAudioPreferences,
  readAudioPreferences,
  saveAudioPreferences,
} from "../src/lib/audio/preferences";

const doubles = vi.hoisted(() => ({
  engines: [] as Array<{
    enabled: boolean;
    disposed: boolean;
    volumes: number[];
  }>,
}));
vi.mock("../src/lib/audio/engine", () => ({
  DEFAULT_AUDIO_SCENE: {
    phase: "countdown",
    paused: false,
    hidden: false,
    holding: false,
    category: "daily",
  },
  GameAudioEngine: class {
    enabled = false;
    disposed = false;
    volumes: number[] = [];
    constructor() {
      doubles.engines.push(this);
    }
    setEnabled(value: boolean) {
      this.enabled = value;
    }
    setScene() {}
    setVolumes(...values: number[]) {
      this.volumes = values;
    }
    play() {}
    footstep() {}
    dispose() {
      this.enabled = false;
      this.disposed = true;
    }
  },
}));

let contexts: FakeContext[];
let resumeImplementation: (context: FakeContext) => Promise<void>;
class FakeContext {
  state: AudioContextState = "suspended";
  resumeCalls = 0;
  closeCalls = 0;
  listeners = new Set<() => void>();
  constructor() {
    contexts.push(this);
  }
  resume() {
    this.resumeCalls++;
    return resumeImplementation(this);
  }
  close() {
    this.closeCalls++;
    this.state = "closed";
    return Promise.resolve();
  }
  addEventListener(_name: string, listener: () => void) {
    this.listeners.add(listener);
  }
  removeEventListener(_name: string, listener: () => void) {
    this.listeners.delete(listener);
  }
  running() {
    this.state = "running";
    this.listeners.forEach((listener) => listener());
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  contexts = [];
  doubles.engines.length = 0;
  resumeImplementation = async (context) => {
    context.running();
  };
  vi.stubGlobal("AudioContext", FakeContext);
  saveAudioPreferences({ ...DEFAULT_AUDIO_PREFERENCES }, null);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("sound preferences", () => {
  it("defaults to sound on and stores only bounded sound preferences", () => {
    expect(readAudioPreferences(null)).toEqual({
      enabled: true,
      music: 0.65,
      effects: 0.72,
    });
    expect(
      normalizeAudioPreferences({
        enabled: "false",
        music: Infinity,
        effects: -1,
      }),
    ).toEqual(DEFAULT_AUDIO_PREFERENCES);
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    saveAudioPreferences(
      { enabled: false, music: 0.35, effects: 0.8 },
      storage,
    );
    expect([...values.keys()]).toEqual([AUDIO_PREFERENCES_KEY]);
    expect(readAudioPreferences(storage)).toEqual({
      enabled: false,
      music: 0.35,
      effects: 0.8,
    });
  });
  it("keeps controls usable when storage is denied or corrupt", () => {
    const denied = {
      getItem: () => {
        throw Error("denied");
      },
      setItem: () => {
        throw Error("denied");
      },
    };
    saveAudioPreferences({ enabled: false, music: 0.2, effects: 0.9 }, denied);
    expect(readAudioPreferences(denied)).toEqual({
      enabled: false,
      music: 0.2,
      effects: 0.9,
    });
    expect(
      readAudioPreferences({ ...denied, getItem: () => "invalid json" }),
    ).toEqual({ enabled: false, music: 0.2, effects: 0.9 });
  });
});

describe("play-gesture audio ownership", () => {
  it("creates no audio before preparation and calls resume synchronously in preparation", async () => {
    const unused = new PreparedGameAudioSession();
    expect(contexts).toHaveLength(0);
    unused.dispose();
    const session = prepareAudioSession();
    expect(contexts).toHaveLength(1);
    expect(contexts[0].resumeCalls).toBe(1);
    expect(await session.activation).toBe(true);
    expect(session.getSnapshot().enabled).toBe(true);
    expect(doubles.engines[0].enabled).toBe(true);
    session.dispose();
  });
  it("does not overwrite manual mute when activation resolves late", async () => {
    let finish!: () => void;
    resumeImplementation = (context) =>
      new Promise((resolve) => {
        finish = () => {
          context.running();
          resolve();
        };
      });
    const session = prepareAudioSession();
    session.mute();
    finish();
    expect(await session.activation).toBe(false);
    expect(session.getSnapshot().enabled).toBe(false);
    expect(doubles.engines[0].enabled).toBe(false);
    expect(readAudioPreferences(null).enabled).toBe(false);
    session.dispose();
  });
  it("reuses the same graph through Strict Mode cleanup/setup and closes after final release", async () => {
    const session = prepareAudioSession();
    await session.activation;
    const releaseFirst = session.acquire();
    releaseFirst();
    releaseFirst();
    expect(doubles.engines[0].enabled).toBe(false);
    await vi.advanceTimersByTimeAsync(20);
    const releaseSecond = session.acquire();
    await vi.advanceTimersByTimeAsync(100);
    expect(contexts).toHaveLength(1);
    expect(contexts[0].closeCalls).toBe(0);
    expect(doubles.engines[0].enabled).toBe(true);
    releaseSecond();
    await vi.advanceTimersByTimeAsync(90);
    expect(contexts[0].closeCalls).toBe(1);
    expect(doubles.engines[0].disposed).toBe(true);
    await session.toggle();
    expect(contexts).toHaveLength(1);
    expect(session.getSnapshot().enabled).toBe(false);
  });
  it("closes an unclaimed start failure and ignores pending activation after leaving", async () => {
    let finish!: () => void;
    resumeImplementation = (context) =>
      new Promise((resolve) => {
        finish = () => {
          context.running();
          resolve();
        };
      });
    const session = prepareAudioSession();
    session.disposeIfUnclaimed();
    finish();
    expect(await session.activation).toBe(false);
    await vi.advanceTimersByTimeAsync(40);
    expect(contexts[0].closeCalls).toBe(1);
    expect(session.getSnapshot().enabled).toBe(false);
    session.setScene(DEFAULT_AUDIO_SCENE);
    await session.toggle();
    expect(contexts).toHaveLength(1);
    expect(contexts[0].resumeCalls).toBe(1);
  });
  it("lets the child own a committed session when the parent leaves", async () => {
    const session = prepareAudioSession();
    await session.activation;
    const release = session.acquire();
    session.disposeIfUnclaimed();
    expect(session.getSnapshot().enabled).toBe(true);
    release();
    await vi.advanceTimersByTimeAsync(90);
    expect(contexts[0].closeCalls).toBe(1);
  });
  it("honors saved mute and volume across retries without creating muted contexts", async () => {
    const first = prepareAudioSession();
    await first.activation;
    first.setMusicVolume(0.35);
    first.setEffectsVolume(0.8);
    first.mute();
    first.dispose();
    const retry = prepareAudioSession();
    expect(contexts).toHaveLength(1);
    expect(retry.getSnapshot()).toMatchObject({
      enabled: false,
      musicVolume: 0.35,
      effectsVolume: 0.8,
    });
    await retry.toggle();
    expect(contexts).toHaveLength(2);
    expect(retry.getSnapshot().enabled).toBe(true);
    expect(doubles.engines[1].volumes).toEqual([0.35, 0.8]);
    retry.dispose();
  });
  it("recovers through the speaker when the browser denies initial resume", async () => {
    resumeImplementation = async (context) => {
      context.running();
      throw Error("NotAllowedError");
    };
    const session = prepareAudioSession();
    expect(await session.activation).toBe(false);
    expect(session.getSnapshot().enabled).toBe(false);
    expect(session.getSnapshot().notice).toContain("スピーカー");
    resumeImplementation = async (context) => {
      context.running();
    };
    expect(await session.toggle()).toBe(true);
    expect(contexts).toHaveLength(1);
    expect(session.getSnapshot().enabled).toBe(true);
    session.dispose();
  });
  it("does not crash the game on devices without Web Audio", async () => {
    vi.stubGlobal("AudioContext", undefined);
    const session = prepareAudioSession();
    expect(await session.activation).toBe(false);
    expect(session.getSnapshot()).toMatchObject({ enabled: false });
    expect(session.getSnapshot().notice).toContain("音なしで遊べます");
    session.dispose();
  });
});
