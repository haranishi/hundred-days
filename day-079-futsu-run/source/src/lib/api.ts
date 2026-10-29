import {
  QUESTIONS,
  makeSnapshot,
  makeResult,
  type AnswerSnapshot,
  type CategoryId,
  type Choice,
  type GameMode,
  type GameResult,
} from "./game";
import { getSurveyCounts } from "../data/survey-results";

// Compatibility name: there is no remote service or participant collection.
export const isDemo = true;
type PracticeRun = {
  category: CategoryId;
  mode: GameMode;
  answers: AnswerSnapshot[];
  result?: GameResult;
};
type Store = { runs: Record<string, PracticeRun> };
const STORAGE = "futsu-run-practice-v2";
let memory: Store = { runs: {} };
let restored = false;
function load(): Store {
  if (!restored) {
    restored = true;
    try {
      const value: unknown = JSON.parse(
        localStorage.getItem(STORAGE) || "null",
      );
      if (
        value &&
        typeof value === "object" &&
        "runs" in value &&
        value.runs &&
        typeof value.runs === "object" &&
        !Array.isArray(value.runs)
      ) {
        const candidates = Object.entries(value.runs).slice(-30);
        for (const [id, candidate] of candidates) {
          if (
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              id,
            )
          )
            continue;
          if (!candidate || typeof candidate !== "object") continue;
          const run = candidate as PracticeRun;
          if (
            !["daily", "love", "money"].includes(run.category) ||
            !["survival", "complete"].includes(run.mode) ||
            !Array.isArray(run.answers) ||
            run.answers.length > 7
          )
            continue;
          // Restore only internally consistent question snapshots; corrupt storage is optional.
          try {
            const answers = run.answers.map((a, i) =>
              validateAnswer(a, run.category, i, run.mode),
            );
            if (answers.slice(0, -1).some((a) => a.eliminated)) continue;
            memory.runs[id] = {
              category: run.category,
              mode: run.mode,
              answers,
            };
            if (
              run.result &&
              (answers.length === 7 || answers.at(-1)?.eliminated)
            ) {
              const decoded = decodeDemoResult(encodeDemoResult(run.result));
              if (
                decoded &&
                decoded.category === run.category &&
                decoded.mode === run.mode &&
                JSON.stringify(decoded.answers) === JSON.stringify(answers)
              )
                memory.runs[id].result = { ...decoded, id };
            }
          } catch {
            /* Ignore malformed local practice data. */
          }
        }
      }
    } catch {
      /* Private browsing and disabled storage both use in-memory state. */
    }
  }
  return memory;
}
function save(store: Store) {
  memory = store;
  try {
    localStorage.setItem(STORAGE, JSON.stringify(store));
  } catch {
    /* Gameplay does not depend on persistence. */
  }
}
function requireRun(store: Store, id: string) {
  if (!Object.hasOwn(store.runs, id))
    throw new Error("このプレイが見つかりません。もう一度始めてください。");
  return store.runs[id];
}
function validateAnswer(
  value: unknown,
  category: CategoryId,
  i: number,
  mode: GameMode,
): AnswerSnapshot {
  if (!value || typeof value !== "object") throw Error("Invalid answer");
  const answer = value as AnswerSnapshot;
  if (
    !QUESTIONS[category][i] ||
    answer.questionId !== QUESTIONS[category][i].id ||
    ![0, 1].includes(answer.choice) ||
    !Array.isArray(answer.counts) ||
    answer.counts.length !== 2 ||
    !answer.counts.every(
      (n) => Number.isSafeInteger(n) && n >= 0 && n <= 1_000_000,
    )
  )
    throw Error("Invalid answer");
  return makeSnapshot(
    answer.questionId,
    answer.choice,
    [...answer.counts],
    mode,
  );
}
export const api = {
  async startRun(
    category: CategoryId,
    mode: GameMode,
  ): Promise<{ id: string }> {
    if (
      !Object.hasOwn(QUESTIONS, category) ||
      !["survival", "complete"].includes(mode)
    )
      throw new Error("カテゴリーが正しくありません。");
    const store = load();
    const id = crypto.randomUUID();
    const ids = Object.keys(store.runs);
    for (const old of ids.slice(0, Math.max(0, ids.length - 29)))
      delete store.runs[old];
    store.runs[id] = { category, mode, answers: [] };
    save(store);
    return { id };
  },
  async vote(
    runId: string,
    questionId: string,
    choice: Choice,
  ): Promise<AnswerSnapshot> {
    if (choice !== 0 && choice !== 1)
      throw new Error("選択肢が正しくありません。");
    const store = load();
    const run = requireRun(store, runId);
    const previous = run.answers.find((a) => a.questionId === questionId);
    if (previous) return structuredClone(previous);
    if (run.result || run.answers.at(-1)?.eliminated)
      throw new Error("このプレイは終了しています。");
    const q = QUESTIONS[run.category][run.answers.length];
    if (!q || q.id !== questionId)
      throw new Error("問題の順番が正しくありません。");
    const answer = makeSnapshot(
      questionId,
      choice,
      getSurveyCounts(questionId),
      run.mode,
    );
    run.answers.push(answer);
    save(store);
    return structuredClone(answer);
  },
  async finish(runId: string): Promise<GameResult> {
    const store = load();
    const run = requireRun(store, runId);
    if (run.result) return structuredClone(run.result);
    if (run.answers.length !== 7 && !run.answers.at(-1)?.eliminated)
      throw new Error("回答を続けてください。");
    run.result = makeResult(runId, run.category, run.mode, run.answers, true);
    save(store);
    return structuredClone(run.result);
  },
};
/** No backend exists. Shared snapshots are decoded from the result URL instead. */
export async function getPublicResult(_id: string): Promise<GameResult | null> {
  void _id;
  return null;
}
/** Portable practice snapshot; never a claim of an authentic participant poll. */
export function encodeDemoResult(result: GameResult): string {
  const payload = JSON.stringify({
    v: 2,
    k: "practice",
    c: result.category,
    m: result.mode,
    a: result.answers.map((a) => [a.choice, ...a.counts]),
    t: result.createdAt,
  });
  const bytes = new TextEncoder().encode(payload);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
export function decodeDemoResult(token: string): GameResult | null {
  if (token.length > 1800 || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
  try {
    const raw = atob(token.replaceAll("-", "+").replaceAll("_", "/"));
    const payload = JSON.parse(
      new TextDecoder().decode(Uint8Array.from(raw, (c) => c.charCodeAt(0))),
    );
    if (
      !payload ||
      typeof payload !== "object" ||
      Object.keys(payload).sort().join(",") !== "a,c,k,m,t,v"
    )
      return null;
    const { v, k, c, m, a, t } = payload;
    if (
      v !== 2 ||
      k !== "practice" ||
      !["daily", "love", "money"].includes(c) ||
      !["survival", "complete"].includes(m) ||
      !Array.isArray(a) ||
      !a.length ||
      a.length > 7 ||
      typeof t !== "string" ||
      t.length > 40 ||
      !Number.isFinite(Date.parse(t))
    )
      return null;
    const answers: AnswerSnapshot[] = a.map((row: unknown, i: number) => {
      if (!Array.isArray(row) || row.length !== 3)
        throw Error("Invalid snapshot");
      return validateAnswer(
        {
          questionId: QUESTIONS[c as CategoryId][i].id,
          choice: row[0],
          counts: row.slice(1),
        },
        c,
        i,
        m,
      );
    });
    if (
      answers.slice(0, -1).some((value) => value.eliminated) ||
      (answers.length < 7 && !answers.at(-1)?.eliminated)
    )
      return null;
    const result = makeResult("demo", c, m, answers, true);
    result.createdAt = new Date(t).toISOString();
    return result;
  } catch {
    return null;
  }
}
