import { describe, expect, it } from "vitest";
import {
  QUESTIONS,
  calculateScore,
  getType,
  makeSnapshot,
  makeResult,
} from "../src/lib/game";
import { decodeDemoResult, encodeDemoResult } from "../src/lib/api";

describe("game scoring and transitions", () => {
  it("has 7 unique binary questions per category and the requested daily wording", () => {
    expect(Object.values(QUESTIONS).flat()).toHaveLength(21);
    expect(
      new Set(
        Object.values(QUESTIONS)
          .flat()
          .map((q) => q.id),
      ).size,
    ).toBe(21);
    for (const list of Object.values(QUESTIONS)) {
      expect(list).toHaveLength(7);
      expect(list.every((q) => q.options.length === 2)).toBe(true);
    }
    expect(QUESTIONS.daily[0].text).toBe("家で一人のとき、独り言を言う？");
    expect(QUESTIONS.daily[6].options).toEqual([
      "最後まで見る",
      "途中で席を立つ",
    ]);
  });
  it("averages raw fractions and rounds only once", () => {
    expect(
      calculateScore(
        [70, 40, 60, 55, 30, 80, 45].map((percentage) => ({ percentage })),
      ),
    ).toBe(54);
    expect(
      calculateScore([
        { percentage: 49.49 },
        { percentage: 49.49 },
        { percentage: 49.99 },
      ]),
    ).toBe(50);
    expect(() => calculateScore([])).toThrow();
    expect(() => calculateScore([{ percentage: NaN }])).toThrow();
  });
  it("classifies a near-tie with the raw ratio rather than the rounded percent", () => {
    const minority = makeSnapshot("daily-1", 0, [499, 501], "survival");
    expect(Math.round(minority.percentage)).toBe(50);
    expect(minority.eliminated).toBe(true);
    expect(makeSnapshot("daily-1", 0, [15, 15], "survival").eliminated).toBe(
      false,
    );
    expect(makeSnapshot("daily-1", 0, [1, 28], "survival")).toMatchObject({
      provisional: true,
      eliminated: false,
    });
    expect(makeSnapshot("daily-1", 0, [1, 29], "survival").eliminated).toBe(
      true,
    );
    expect(makeSnapshot("daily-1", 0, [1, 99], "complete").eliminated).toBe(
      false,
    );
  });
  it("only uses affirmative type names with stable boundaries", () => {
    expect(
      [0, 29, 30, 44, 45, 54, 55, 69, 70, 100].map((s) => getType(s).typeName),
    ).toEqual([
      "唯一無二タイプ",
      "唯一無二タイプ",
      "ちょい少数派タイプ",
      "ちょい少数派タイプ",
      "自分の道を行くタイプ",
      "自分の道を行くタイプ",
      "ほどよくマイペースタイプ",
      "ほどよくマイペースタイプ",
      "王道ど真ん中タイプ",
      "王道ど真ん中タイプ",
    ]);
  });
  it("keeps result snapshots immutable when source answer arrays change", () => {
    const answer = makeSnapshot("daily-1", 0, [20, 80], "survival");
    const result = makeResult("id", "daily", "survival", [answer], true);
    answer.counts[0] = 999;
    expect(result.answers[0].counts).toEqual([20, 80]);
    expect(result.minority?.counts).toEqual([20, 80]);
  });
  it("round trips a portable demo and rejects malformed or inconsistent data", () => {
    const result = makeResult(
      "id",
      "daily",
      "survival",
      [makeSnapshot("daily-1", 0, [20, 80], "survival")],
      true,
    );
    const token = encodeDemoResult(result);
    const decoded = decodeDemoResult(token);
    expect(decoded).toMatchObject({
      demo: true,
      score: 20,
      category: "daily",
      completed: false,
    });
    expect(decodeDemoResult("!bad")).toBeNull();
    expect(decodeDemoResult("x".repeat(2000))).toBeNull();
    const invalid = btoa(
      JSON.stringify({
        c: "daily",
        m: "survival",
        a: [[0, 80, 20]],
        t: new Date().toISOString(),
      }),
    ).replaceAll("=", "");
    expect(decodeDemoResult(invalid)).toBeNull();
  });
});
