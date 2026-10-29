import { describe, it, expect } from "vitest";
import {
  MusicTransport,
  MUSIC_BPM,
  MUSIC_STEPS,
  RUN_STEPS_PER_SECOND,
  musicNotes,
  midiHz,
  volumeGain,
} from "../src/lib/audio/score";
import {
  DEFAULT_AUDIO_SCENE,
  musicAllowed,
  footstepsAllowed,
} from "../src/lib/audio/engine";
describe("original music score and bounded audio-clock scheduling", () => {
  it("provides varied harmony, melody, bass and rhythm over eight bars", () => {
    expect(MUSIC_BPM).toBe(96);
    expect(RUN_STEPS_PER_SECOND).toBeCloseTo(3.2);
    const score = Array.from({ length: MUSIC_STEPS }, (_, step) =>
      musicNotes(step, "daily"),
    ).flat();
    expect(new Set(score.map((n) => n.instrument))).toEqual(
      new Set(["chord", "bass", "mallet", "kick", "hat", "clap"]),
    );
    const harmonies = score
      .filter((n) => n.instrument === "chord")
      .map((n) => JSON.stringify(n.notes));
    expect(harmonies).toHaveLength(8);
    expect(new Set(harmonies).size).toBeGreaterThan(3);
    expect(
      new Set(score.filter((n) => n.instrument === "mallet").map((n) => n.midi))
        .size,
    ).toBeGreaterThan(5);
    expect(musicNotes(0, "daily")).toEqual(musicNotes(64, "daily"));
    expect(musicNotes(0, "love")).not.toEqual(musicNotes(0, "money"));
  });
  it("schedules each step once from the audio clock, including across loops", () => {
    const clock = new MusicTransport();
    expect(clock.take(0, "daily")).toEqual([]);
    clock.start(0);
    const result = [];
    for (let now = 0; now < 45; now += 0.025)
      result.push(...clock.take(now, "daily"));
    const hats = result.filter((n) => n.instrument === "hat");
    expect(new Set(hats.map((n) => n.step)).size).toBe(hats.length);
    expect(hats.length).toBeGreaterThan(128);
    expect(
      hats.every((note, i) => i === 0 || note.time > hats[i - 1].time),
    ).toBe(true);
  });
  it("drops missed windows and never queues an audio burst on resume", () => {
    const clock = new MusicTransport();
    clock.start(0);
    clock.take(0, "daily");
    const afterStall = clock.take(30, "daily");
    expect(afterStall.length).toBeGreaterThan(0);
    expect(afterStall.every((n) => n.time >= 30)).toBe(true);
    expect(afterStall.length).toBeLessThan(12);
    clock.stop();
    expect(clock.take(40, "daily")).toEqual([]);
    clock.start(50);
    const resumed = clock.take(50, "daily");
    expect(resumed.every((n) => n.time >= 50)).toBe(true);
    expect(resumed.length).toBeLessThan(12);
  });
  it("bounds pathological lookahead, invalid time, MIDI and volume settings", () => {
    const clock = new MusicTransport();
    clock.start(0);
    expect(clock.take(NaN, "daily")).toEqual([]);
    expect(clock.take(0, "daily", Infinity).length).toBeLessThan(12);
    expect(midiHz(69)).toBe(440);
    expect(midiHz(81)).toBe(880);
    expect(volumeGain(0)).toBe(0);
    expect(volumeGain(1)).toBe(1);
    expect(volumeGain(-2)).toBe(0);
    expect(volumeGain(NaN)).toBe(0);
    expect(volumeGain(0.5)).toBeCloseTo(10 ** (-18 / 20));
  });
  it("keeps footfalls on real running and all audio silent while paused or hidden", () => {
    expect(musicAllowed(DEFAULT_AUDIO_SCENE)).toBe(true);
    expect(footstepsAllowed(DEFAULT_AUDIO_SCENE)).toBe(false);
    for (const phase of ["approach", "crossing", "reveal"] as const)
      expect(footstepsAllowed({ ...DEFAULT_AUDIO_SCENE, phase })).toBe(true);
    for (const phase of ["fall", "finish", "error"] as const) {
      expect(musicAllowed({ ...DEFAULT_AUDIO_SCENE, phase })).toBe(false);
      expect(footstepsAllowed({ ...DEFAULT_AUDIO_SCENE, phase })).toBe(false);
    }
    expect(
      musicAllowed({
        ...DEFAULT_AUDIO_SCENE,
        phase: "approach",
        holding: true,
      }),
    ).toBe(true);
    expect(
      footstepsAllowed({
        ...DEFAULT_AUDIO_SCENE,
        phase: "approach",
        holding: true,
      }),
    ).toBe(false);
    for (const property of ["paused", "hidden"] as const) {
      const scene = {
        ...DEFAULT_AUDIO_SCENE,
        phase: "approach" as const,
        [property]: true,
      };
      expect(musicAllowed(scene)).toBe(false);
      expect(footstepsAllowed(scene)).toBe(false);
    }
  });
});
