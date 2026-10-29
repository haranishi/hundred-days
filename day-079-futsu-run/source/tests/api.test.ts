import { beforeEach, describe, expect, it, vi } from "vitest";
import { QUESTIONS } from "../src/lib/game";
import { SURVEY_RESULTS, getSurveyCounts } from "../src/data/survey-results";
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
}
beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.stubGlobal("localStorage", storage());
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("No network allowed");
    }),
  );
});
describe("offline practice API", () => {
  it("uses explicit practice percentages without adding a player vote", async () => {
    const { api, isDemo } = await import("../src/lib/api");
    expect(isDemo).toBe(true);
    expect(
      Object.values(SURVEY_RESULTS).every((d) => d.kind === "practice"),
    ).toBe(true);
    const { id } = await api.startRun("daily", "complete");
    const answer = await api.vote(id, "daily-1", 0);
    expect(answer).toMatchObject({
      counts: [68, 32],
      percentage: 68,
      total: 100,
    });
    expect(getSurveyCounts("daily-1")).toEqual([68, 32]);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("allows a different choice on every new play", async () => {
    const { api } = await import("../src/lib/api");
    const first = await api.startRun("daily", "survival");
    expect((await api.vote(first.id, "daily-1", 1)).choice).toBe(1);
    await api.finish(first.id);
    const second = await api.startRun("daily", "survival");
    expect(await api.vote(second.id, "daily-1", 0)).toMatchObject({
      choice: 0,
      reused: false,
      eliminated: false,
      percentage: 68,
    });
  });
  it("makes duplicate gate crossings idempotent within the same run", async () => {
    const { api } = await import("../src/lib/api");
    const { id } = await api.startRun("daily", "complete");
    const [first, second] = await Promise.all([
      api.vote(id, "daily-1", 0),
      api.vote(id, "daily-1", 1),
    ]);
    expect(second).toEqual(first);
    first.counts[0] = 999;
    expect((await api.vote(id, "daily-1", 1)).counts).toEqual([68, 32]);
    expect(await api.vote(id, "daily-2", 0)).toMatchObject({
      questionId: "daily-2",
    });
  });
  it("rejects invalid ordering, cross-category questions, early finish and post-fall input", async () => {
    const { api } = await import("../src/lib/api");
    const { id } = await api.startRun("daily", "survival");
    await expect(api.vote(id, "love-1", 0)).rejects.toThrow();
    await expect(api.vote(id, "daily-2", 0)).rejects.toThrow();
    await expect(api.finish(id)).rejects.toThrow();
    await api.vote(id, "daily-1", 0);
    expect((await api.vote(id, "daily-2", 0)).eliminated).toBe(true);
    await expect(api.vote(id, "daily-3", 0)).rejects.toThrow();
    expect(await api.finish(id)).toMatchObject({
      score: 50,
      completed: false,
      demo: true,
    });
  });
  it("finishes seven questions, freezes the shared result and never contacts a service", async () => {
    const { api, encodeDemoResult, decodeDemoResult, getPublicResult } =
      await import("../src/lib/api");
    const { id } = await api.startRun("daily", "complete");
    for (const q of QUESTIONS.daily) await api.vote(id, q.id, 0);
    const result = await api.finish(id);
    const token = encodeDemoResult(result);
    expect(result).toMatchObject({ completed: true, score: 54, demo: true });
    result.answers[0].counts[0] = 999;
    result.score = 1;
    expect(await api.finish(id)).toMatchObject({ score: 54 });
    expect(decodeDemoResult(token)).toMatchObject({ score: 54, demo: true });
    const next = await api.startRun("daily", "complete");
    await api.vote(next.id, "daily-1", 1);
    expect(decodeDemoResult(token)?.answers[0].counts).toEqual([68, 32]);
    expect(await getPublicResult(id)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("continues with in-memory state when localStorage reads and writes are blocked", async () => {
    vi.stubGlobal("localStorage", {
      getItem() {
        throw Error("blocked");
      },
      setItem() {
        throw Error("quota");
      },
    });
    const { api } = await import("../src/lib/api");
    const { id } = await api.startRun("money", "complete");
    for (const q of QUESTIONS.money) await api.vote(id, q.id, 0);
    expect((await api.finish(id)).completed).toBe(true);
  });
  it("ignores corrupt optional persistence and restores valid immutable results", async () => {
    localStorage.setItem(
      "futsu-run-practice-v2",
      '{"runs":{"bad":{"category":"unknown"}}}',
    );
    const first = await import("../src/lib/api");
    const { id } = await first.api.startRun("daily", "survival");
    await first.api.vote(id, "daily-1", 1);
    const result = await first.api.finish(id);
    vi.resetModules();
    const next = await import("../src/lib/api");
    expect(await next.api.finish(id)).toEqual(result);
  });
  it("never accepts a token claiming to be an authentic poll or arbitrary score", async () => {
    const { api, encodeDemoResult, decodeDemoResult } = await import(
      "../src/lib/api"
    );
    const { id } = await api.startRun("daily", "survival");
    await api.vote(id, "daily-1", 1);
    const token = encodeDemoResult(await api.finish(id));
    const raw = JSON.parse(
      atob(token.replaceAll("-", "+").replaceAll("_", "/")),
    );
    function encoded(payload: unknown) {
      return btoa(JSON.stringify(payload))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", "");
    }
    expect(decodeDemoResult(encoded({ ...raw, k: "survey" }))).toBeNull();
    expect(decodeDemoResult(encoded({ ...raw, demo: false }))).toBeNull();
    expect(decodeDemoResult(encoded({ ...raw, score: 100 }))).toBeNull();
    expect(decodeDemoResult(encoded({ ...raw, a: [[1, -1, 101]] }))).toBeNull();
    expect(decodeDemoResult(encoded({ ...raw, t: "nonsense" }))).toBeNull();
    expect(decodeDemoResult(token)?.score).toBe(32);
  });
});
