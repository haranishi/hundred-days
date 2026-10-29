import { describe, expect, it } from "vitest";
import {
  QUESTIONS,
  getQuestionPresentation,
  makeResult,
  makeSnapshot,
} from "../src/lib/game";
import { encodeDemoResult, decodeDemoResult } from "../src/lib/api";

describe("authored question presentation", () => {
  it("provides two short faithful gate labels for every existing question", () => {
    for (const category of ["daily", "love", "money"] as const) {
      for (const q of QUESTIONS[category]) {
        const p = getQuestionPresentation(q);
        expect(p.gateLabels).toHaveLength(2);
        expect(
          p.gateLabels.every(
            (label) => [...label].length >= 1 && [...label].length <= 8,
          ),
        ).toBe(true);
        expect(new Set(p.gateLabels).size).toBe(2);
        expect(p.badges.join("")).not.toMatch(/[○×]/);
      }
    }
  });
  it("uses yes/no only for the two explicitly affirmative-or-negative prompts", () => {
    const binary = Object.values(QUESTIONS)
      .flat()
      .filter((q) => getQuestionPresentation(q).kind === "yes-no");
    expect(binary.map((q) => q.id)).toEqual(["daily-1", "daily-2"]);
    for (const q of binary)
      expect(getQuestionPresentation(q).badges).toEqual(["はい", "いいえ"]);
    for (const q of Object.values(QUESTIONS)
      .flat()
      .filter((q) => !binary.includes(q)))
      expect(getQuestionPresentation(q).badges).toEqual(["A", "B"]);
    expect(getQuestionPresentation(QUESTIONS.daily[3]).gateLabels).toEqual([
      "計画派",
      "気分派",
    ]);
  });
  it("never guesses semantics for a new prompt and cannot mutate later displays", () => {
    expect(() =>
      getQuestionPresentation({
        ...QUESTIONS.daily[0],
        id: "unconfigured-question",
      }),
    ).toThrow(/設定/);
    expect(() =>
      getQuestionPresentation({ ...QUESTIONS.daily[0], id: "toString" }),
    ).toThrow(/設定/);
    const p = getQuestionPresentation(QUESTIONS.daily[0]);
    p.gateLabels[0] = "変えた表示";
    p.badges[0] = "変えた表示";
    expect(getQuestionPresentation(QUESTIONS.daily[0])).toEqual({
      kind: "yes-no",
      badges: ["はい", "いいえ"],
      gateLabels: ["言う", "言わない"],
    });
  });
  it("does not change original full answers, score or the fixed result URL format", () => {
    expect(QUESTIONS.daily[3].options).toEqual([
      "事前に細かく決める",
      "現地で気分に任せる",
    ]);
    const answers = QUESTIONS.daily.map((q) =>
      makeSnapshot(q.id, 0, [68, 32], "complete"),
    );
    const result = makeResult("example", "daily", "complete", answers, true);
    const token = encodeDemoResult(result);
    const decoded = decodeDemoResult(token);
    expect(decoded?.score).toBe(68);
    expect(decoded?.answers).toEqual(result.answers);
    expect(encodeDemoResult(decoded!)).toBe(token);
  });
});
