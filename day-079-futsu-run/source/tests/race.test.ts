import { describe, expect, it } from "vitest";
import { QUESTIONS, makeSnapshot, type AnswerSnapshot } from "../src/lib/game";
import {
  advanceApproach,
  GATE_SECONDS,
  HOLD_PROGRESS,
  initialRace,
  raceReducer,
  REVEAL_SECONDS,
  type RaceState,
} from "../src/lib/race";

function ready(): RaceState {
  const loaded = raceReducer(structuredClone(initialRace), { type: "ready" });
  return until(loaded, "approach");
}
function ticks(state: RaceState, count: number, seconds = 1 / 60): RaceState {
  for (let i = 0; i < count; i++)
    state = raceReducer(state, { type: "tick", seconds });
  return state;
}
function until(state: RaceState, stage: RaceState["stage"]): RaceState {
  for (let i = 0; i < 2000 && state.stage !== stage; i++)
    state = raceReducer(state, { type: "tick", seconds: 1 / 60 });
  expect(state.stage).toBe(stage);
  return state;
}
function snapshot(
  index: number,
  choice: 0 | 1 = 0,
  eliminated = false,
): AnswerSnapshot {
  return makeSnapshot(
    QUESTIONS.daily[index].id,
    choice,
    eliminated ? [10, 90] : [70, 30],
    eliminated ? "survival" : "complete",
  );
}

describe("continuous runner state and timing", () => {
  it("keeps a six-second approach at ten frames per second without jumping after a long stall", () => {
    let state = raceReducer(ready(), { type: "select", choice: 0 });
    for (let i = 0; i < 59; i++)
      state = raceReducer(state, { type: "frame", seconds: 0.1 });
    expect(state.stage).toBe("approach");
    state = raceReducer(state, { type: "frame", seconds: 0.1 });
    state = raceReducer(state, { type: "frame", seconds: 0.1 });
    expect(state.stage).toBe("crossing");
    const before = raceReducer(ready(), { type: "select", choice: 0 });
    expect(
      raceReducer(before, { type: "frame", seconds: 60 }).progress,
    ).toBeCloseTo(0.24 / GATE_SECONDS, 8);
  });
  it("shows one short introduction only after the scene is ready, then starts the first gate", () => {
    let state = raceReducer(structuredClone(initialRace), { type: "ready" });
    expect(state.stage).toBe("countdown");
    expect(raceReducer(state, { type: "select", choice: 0 })).toBe(state);
    state = ticks(state, 30);
    const paused = raceReducer(state, { type: "pause" });
    expect(ticks(paused, 600)).toBe(paused);
    state = ticks(raceReducer(paused, { type: "pause" }), 90);
    expect(state).toMatchObject({
      stage: "approach",
      index: 0,
      lane: 0,
      answers: [],
    });
  });
  it("waits for scene readiness and never chooses a lane automatically", () => {
    const initial = structuredClone(initialRace);
    expect(raceReducer(initial, { type: "tick", seconds: 0.1 })).toBe(initial);
    expect(raceReducer(initial, { type: "select", choice: 0 })).toBe(initial);
    const held = ticks(ready(), 1200);
    expect(held).toMatchObject({
      stage: "approach",
      lane: 0,
      progress: HOLD_PROGRESS,
      index: 0,
      answers: [],
    });
    expect(ticks(held, 600)).toBe(held);
  });
  it("allows changing directions until crossing, then fixes the final lane", () => {
    let state = raceReducer(ready(), { type: "select", choice: 0 });
    state = ticks(state, 150);
    state = raceReducer(state, { type: "select", choice: 1 });
    expect(state.lane).toBe(1);
    state = until(state, "crossing");
    expect(state.progress).toBe(1);
    expect(raceReducer(state, { type: "select", choice: 0 })).toBe(state);
    const lastChoice = makeSnapshot("daily-1", 1, [70, 30], "complete");
    expect(
      raceReducer(state, { type: "answer", index: 0, answer: lastChoice }),
    ).toMatchObject({ stage: "reveal", lane: 1, answer: lastChoice });
  });
  it("leaves the hold point when an explicit choice is made", () => {
    let state = ticks(ready(), 600);
    state = raceReducer(state, { type: "select", choice: 0 });
    expect(state.progress).toBe(HOLD_PROGRESS);
    state = until(state, "crossing");
    expect(state).toMatchObject({ lane: -1, progress: 1, index: 0 });
  });
  it("approaches for about six seconds when a lane is selected", () => {
    let state = raceReducer(ready(), { type: "select", choice: 0 });
    state = ticks(state, Math.floor((GATE_SECONDS - 0.1) * 60));
    expect(state.stage).toBe("approach");
    state = ticks(state, 12);
    expect(state.stage).toBe("crossing");
  });
  it("pauses both approach and reveal clocks and ignores input until resumed", () => {
    let state = raceReducer(ready(), { type: "select", choice: 0 });
    state = ticks(state, 120);
    const paused = raceReducer(state, { type: "pause" });
    expect(ticks(paused, 1200)).toBe(paused);
    expect(raceReducer(paused, { type: "select", choice: 1 })).toBe(paused);
    state = until(raceReducer(paused, { type: "pause" }), "crossing");
    state = raceReducer(state, {
      type: "answer",
      index: 0,
      answer: snapshot(0),
    });
    state = ticks(state, 30);
    const pausedReveal = raceReducer(state, { type: "pause" });
    expect(ticks(pausedReveal, 1200)).toBe(pausedReveal);
    expect(raceReducer(pausedReveal, { type: "pause" }).clock).toBe(
      state.clock,
    );
  });
  it("ignores nonfinite, negative and zero frame time, and clamps delayed frames", () => {
    const state = raceReducer(ready(), { type: "select", choice: 0 });
    for (const seconds of [NaN, Infinity, -Infinity, -1, 0]) {
      expect(raceReducer(state, { type: "tick", seconds })).toBe(state);
      expect(advanceApproach(0.5, seconds, true)).toBe(0.5);
    }
    expect(
      raceReducer(state, { type: "tick", seconds: 3600 }).progress,
    ).toBeCloseTo(0.1 / GATE_SECONDS, 8);
  });
  it("records each crossing once and rejects stale answer events", () => {
    let state = until(
      raceReducer(ready(), { type: "select", choice: 0 }),
      "crossing",
    );
    const answer = snapshot(0);
    expect(raceReducer(state, { type: "answer", index: 1, answer })).toBe(
      state,
    );
    state = raceReducer(state, { type: "answer", index: 0, answer });
    expect(state.answers).toHaveLength(1);
    expect(raceReducer(state, { type: "answer", index: 0, answer })).toBe(
      state,
    );
    state = until(state, "approach");
    expect(state).toMatchObject({
      index: 1,
      lane: 0,
      progress: 0,
      clock: 0,
      answer: null,
    });
    const next = until(
      raceReducer(state, { type: "select", choice: 1 }),
      "crossing",
    );
    expect(raceReducer(next, { type: "answer", index: 0, answer })).toBe(next);
  });
  it("automatically advances after the reveal and requires a new choice", () => {
    let state = until(
      raceReducer(ready(), { type: "select", choice: 0 }),
      "crossing",
    );
    state = raceReducer(state, {
      type: "answer",
      index: 0,
      answer: snapshot(0),
    });
    state = ticks(state, Math.floor((REVEAL_SECONDS - 0.1) * 60));
    expect(state.stage).toBe("reveal");
    state = ticks(state, 12);
    expect(state).toMatchObject({
      stage: "approach",
      index: 1,
      lane: 0,
      answer: null,
    });
    expect(ticks(state, 600)).toMatchObject({
      index: 1,
      stage: "approach",
      progress: HOLD_PROGRESS,
      lane: 0,
    });
  });
  it("finishes a minority run after falling and never presents another question", () => {
    let state = until(
      raceReducer(ready(), { type: "select", choice: 0 }),
      "crossing",
    );
    state = raceReducer(state, {
      type: "answer",
      index: 0,
      answer: snapshot(0, 0, true),
    });
    expect(state.stage).toBe("fall");
    state = until(state, "finish");
    expect(state.index).toBe(0);
    expect(state.answers).toHaveLength(1);
    expect(ticks(state, 600)).toBe(state);
  });
  it("completes exactly seven questions and never advances to an eighth", () => {
    let state = ready();
    for (let index = 0; index < 7; index++) {
      expect(state.index).toBe(index);
      state = until(
        raceReducer(state, { type: "select", choice: 0 }),
        "crossing",
      );
      state = raceReducer(state, {
        type: "answer",
        index,
        answer: snapshot(index),
      });
      state = until(state, index === 6 ? "finish" : "approach");
    }
    expect(state.answers).toHaveLength(7);
    expect(state.index).toBe(6);
    expect(ticks(state, 600)).toBe(state);
  });
  it("retries failed crossing or finishing without advancing the run", () => {
    const crossing = until(
      raceReducer(ready(), { type: "select", choice: 0 }),
      "crossing",
    );
    const failure = raceReducer(crossing, {
      type: "error",
      message: "try again",
    });
    expect(raceReducer(failure, { type: "retry" })).toMatchObject({
      stage: "crossing",
      index: 0,
      lane: -1,
      answers: [],
      error: "",
    });
    const finish: RaceState = { ...crossing, stage: "finish" };
    const finishError = raceReducer(finish, {
      type: "error",
      message: "retry result",
    });
    expect(raceReducer(finishError, { type: "retry" }).stage).toBe("finish");
  });
});
