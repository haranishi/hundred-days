/** Operator-managed data. Practice percentages are not votes or sample sizes. */
export type PracticeData = {
  kind: "practice";
  percentages: [number, number];
  label: "練習用の割合";
};
export type VerifiedSurveyData = {
  kind: "survey";
  counts: [number, number];
  source: { title: string; url: string; conductedAt: string; audience: string };
};
export type SurveyData = PracticeData | VerifiedSurveyData;
function practice(a: number): PracticeData {
  return { kind: "practice", percentages: [a, 100 - a], label: "練習用の割合" };
}
export const SURVEY_RESULTS: Record<string, SurveyData> = {
  "daily-1": practice(68),
  "daily-2": practice(31),
  "daily-3": practice(43),
  "daily-4": practice(57),
  "daily-5": practice(39),
  "daily-6": practice(66),
  "daily-7": practice(74),
  "love-1": practice(42),
  "love-2": practice(72),
  "love-3": practice(58),
  "love-4": practice(61),
  "love-5": practice(46),
  "love-6": practice(63),
  "love-7": practice(54),
  "money-1": practice(28),
  "money-2": practice(47),
  "money-3": practice(62),
  "money-4": practice(73),
  "money-5": practice(44),
  "money-6": practice(39),
  "money-7": practice(67),
};
export function getSurveyData(questionId: string): SurveyData {
  if (!Object.hasOwn(SURVEY_RESULTS, questionId))
    throw new Error("問題の参考データがありません。");
  return SURVEY_RESULTS[questionId];
}
/** Practice values here are ratio weights, NOT participant vote counts. */
export function getSurveyCounts(questionId: string): [number, number] {
  const data = getSurveyData(questionId);
  if (data.kind === "practice") {
    const [a, b] = data.percentages;
    if (
      ![a, b].every((n) => Number.isSafeInteger(n) && n >= 0 && n <= 100) ||
      a + b !== 100
    )
      throw new Error("練習用の割合が正しくありません。");
    return [a, b];
  }
  const [a, b] = data.counts;
  if (
    ![a, b].every((n) => Number.isSafeInteger(n) && n >= 0) ||
    a + b < 1 ||
    !Number.isSafeInteger(a + b)
  )
    throw new Error("アンケートの集計が正しくありません。");
  const source = data.source;
  let sourceUrl: URL;
  try {
    sourceUrl = new URL(source.url);
  } catch {
    throw new Error("アンケートの出典が正しくありません。");
  }
  if (
    sourceUrl.protocol !== "https:" ||
    sourceUrl.username ||
    sourceUrl.password ||
    !source.title.trim() ||
    !source.audience.trim() ||
    !Number.isFinite(Date.parse(source.conductedAt))
  )
    throw new Error("アンケートの出典が正しくありません。");
  return [a, b];
}
