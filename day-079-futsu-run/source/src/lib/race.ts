import type { AnswerSnapshot, Choice } from "./game";
export const GATE_SECONDS = 6;
export const INTRO_SECONDS = 1.8;
export const REVEAL_SECONDS = 1.6;
export const HOLD_PROGRESS = 0.88;
export type RaceStage =
  | "countdown"
  | "approach"
  | "crossing"
  | "reveal"
  | "fall"
  | "finish"
  | "error";
export type RaceState = {
  stage: RaceStage;
  index: number;
  progress: number;
  lane: -1 | 0 | 1;
  answer: AnswerSnapshot | null;
  answers: AnswerSnapshot[];
  clock: number;
  paused: boolean;
  ready: boolean;
  error: string;
  retryStage: "crossing" | "finish";
};
export const initialRace: RaceState = {
  stage: "countdown",
  index: 0,
  progress: 0,
  lane: 0,
  answer: null,
  answers: [],
  clock: 0,
  paused: false,
  ready: false,
  error: "",
  retryStage: "crossing",
};
export type RaceAction =
  | { type: "ready" }
  | { type: "pause" }
  | { type: "select"; choice: Choice }
  | { type: "tick"; seconds: number }
  | { type: "frame"; seconds: number }
  | { type: "answer"; index: number; answer: AnswerSnapshot }
  | { type: "error"; message: string }
  | { type: "retry" };
export function advanceApproach(
  progress: number,
  seconds: number,
  selected: boolean,
): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return progress;
  return Math.min(
    selected ? 1 : HOLD_PROGRESS,
    progress + Math.min(seconds, 0.1) / GATE_SECONDS,
  );
}
export function raceReducer(state: RaceState, action: RaceAction): RaceState {
  switch (action.type) {
    case "frame": {
      if (!Number.isFinite(action.seconds) || action.seconds <= 0) return state;
      // Preserve visible elapsed time on slower GPUs, with bounded simulation steps.
      const duration = Math.min(action.seconds, 0.24);
      const steps = Math.ceil(duration / 0.08);
      let next = state;
      for (let i = 0; i < steps; i++)
        next = raceReducer(next, { type: "tick", seconds: duration / steps });
      return next;
    }
    case "ready":
      return { ...state, ready: true };
    case "pause":
      return state.stage === "finish" || state.stage === "error"
        ? state
        : { ...state, paused: !state.paused };
    case "select":
      return state.stage !== "approach" || state.paused || !state.ready
        ? state
        : { ...state, lane: action.choice === 0 ? -1 : 1 };
    case "answer":
      if (state.stage !== "crossing" || action.index !== state.index)
        return state;
      return {
        ...state,
        answer: action.answer,
        answers: [...state.answers, action.answer],
        stage: action.answer.eliminated ? "fall" : "reveal",
        clock: 0,
      };
    case "error":
      return {
        ...state,
        stage: "error",
        error: action.message,
        retryStage: state.stage === "finish" ? "finish" : "crossing",
      };
    case "retry":
      return state.stage === "error"
        ? { ...state, stage: state.retryStage, error: "", paused: false }
        : state;
    case "tick": {
      if (
        !state.ready ||
        state.paused ||
        !Number.isFinite(action.seconds) ||
        action.seconds <= 0
      )
        return state;
      if (state.stage === "countdown") {
        const clock = state.clock + Math.min(action.seconds, 0.1);
        return clock >= INTRO_SECONDS
          ? { ...state, stage: "approach", clock: 0 }
          : { ...state, clock };
      }
      if (state.stage === "approach") {
        const progress = advanceApproach(
          state.progress,
          action.seconds,
          state.lane !== 0,
        );
        return progress === state.progress
          ? state
          : {
              ...state,
              progress,
              stage: progress >= 1 ? "crossing" : "approach",
            };
      }
      if (state.stage === "reveal" || state.stage === "fall") {
        const clock = state.clock + Math.min(action.seconds, 0.1);
        const duration = state.stage === "fall" ? 1.9 : REVEAL_SECONDS;
        if (clock >= duration) {
          if (state.stage === "fall" || state.index === 6)
            return { ...state, stage: "finish", clock: 0, progress: 1.4 };
          return {
            ...state,
            stage: "approach",
            index: state.index + 1,
            progress: 0,
            lane: 0,
            answer: null,
            clock: 0,
          };
        }
        return {
          ...state,
          clock,
          progress: 1 + Math.min(clock / duration, 1) * 0.4,
        };
      }
      return state;
    }
  }
}
