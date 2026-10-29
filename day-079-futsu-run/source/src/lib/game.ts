export type CategoryId = "daily" | "love" | "money";
export type GameMode = "survival" | "complete";
export type Choice = 0 | 1;
export type Question = {
  id: string;
  category: CategoryId;
  order: number;
  text: string;
  options: [string, string];
};
export type QuestionPresentation = {
  kind: "yes-no" | "choice";
  badges: [string, string];
  gateLabels: [string, string];
};
// Authored labels keep each short gate sign faithful to the full answer.
const QUESTION_PRESENTATIONS: Record<string, QuestionPresentation> = {
  "daily-1": {
    kind: "yes-no",
    badges: ["はい", "いいえ"],
    gateLabels: ["言う", "言わない"],
  },
  "daily-2": {
    kind: "yes-no",
    badges: ["はい", "いいえ"],
    gateLabels: ["混ぜる", "混ぜない"],
  },
  "daily-3": {
    kind: "choice",
    badges: ["A", "B"],
    gateLabels: ["1個", "2個以上"],
  },
  "daily-4": {
    kind: "choice",
    badges: ["A", "B"],
    gateLabels: ["計画派", "気分派"],
  },
  "daily-5": {
    kind: "choice",
    badges: ["A", "B"],
    gateLabels: ["すぐ返信", "落ち着いて返信"],
  },
  "daily-6": {
    kind: "choice",
    badges: ["A", "B"],
    gateLabels: ["定番・人気", "冒険する"],
  },
  "daily-7": {
    kind: "choice",
    badges: ["A", "B"],
    gateLabels: ["最後まで見る", "途中で出る"],
  },
  "love-1": {
    kind: "choice",
    badges: ["A", "B"],
    gateLabels: ["自分から伝える", "様子を見る"],
  },
  "love-2": {
    kind: "choice",
    badges: ["A", "B"],
    gateLabels: ["一緒に相談", "どちらかに任せる"],
  },
  "love-3": {
    kind: "choice",
    badges: ["A", "B"],
    gateLabels: ["毎日連絡", "お互いのペース"],
  },
  "love-4": {
    kind: "choice",
    badges: ["A", "B"],
    gateLabels: ["レストラン", "カフェ"],
  },
  "love-5": {
    kind: "choice",
    badges: ["A", "B"],
    gateLabels: ["特別なお祝い", "いつもどおり"],
  },
  "love-6": {
    kind: "choice",
    badges: ["A", "B"],
    gateLabels: ["一緒に体験", "それぞれ楽しむ"],
  },
  "love-7": {
    kind: "choice",
    badges: ["A", "B"],
    gateLabels: ["予定を調整", "都合のよい日"],
  },
  "money-1": {
    kind: "choice",
    badges: ["A", "B"],
    gateLabels: ["すぐ買う", "一晩考える"],
  },
  "money-2": {
    kind: "choice",
    badges: ["A", "B"],
    gateLabels: ["こまめに記録", "残高で調整"],
  },
  "money-3": {
    kind: "choice",
    badges: ["A", "B"],
    gateLabels: ["おいしいもの", "長く使えるもの"],
  },
  "money-4": {
    kind: "choice",
    badges: ["A", "B"],
    gateLabels: ["積極的に貯める", "気にせず買う"],
  },
  "money-5": {
    kind: "choice",
    badges: ["A", "B"],
    gateLabels: ["宿・移動の快適さ", "食事・体験"],
  },
  "money-6": {
    kind: "choice",
    badges: ["A", "B"],
    gateLabels: ["定期的に確認", "気づいた時"],
  },
  "money-7": {
    kind: "choice",
    badges: ["A", "B"],
    gateLabels: ["きっちり割り勘", "だいたい同じ"],
  },
};
export function getQuestionPresentation(
  question: Question,
): QuestionPresentation {
  if (!Object.hasOwn(QUESTION_PRESENTATIONS, question.id))
    throw new Error("この問題のゲート表示が設定されていません。");
  const presentation = QUESTION_PRESENTATIONS[question.id];
  return {
    kind: presentation.kind,
    badges: [...presentation.badges],
    gateLabels: [...presentation.gateLabels],
  };
}
export type AnswerSnapshot = {
  questionId: string;
  choice: Choice;
  counts: [number, number];
  total: number;
  percentage: number;
  provisional: boolean;
  reused: boolean;
  eliminated: boolean;
};
export type GameResult = {
  id: string;
  category: CategoryId;
  mode: GameMode;
  score: number;
  typeName: string;
  comment: string;
  answers: AnswerSnapshot[];
  minority: AnswerSnapshot | null;
  completed: boolean;
  provisional: boolean;
  demo: boolean;
  createdAt: string;
};
export const CATEGORIES: {
  id: CategoryId;
  name: string;
  eyebrow: string;
  description: string;
  color: string;
  emoji: string;
}[] = [
  {
    id: "daily",
    name: "日常",
    eyebrow: "EVERYDAY",
    description: "いつもの自分に、意外な発見。",
    color: "#b5ef65",
    emoji: "☀",
  },
  {
    id: "love",
    name: "恋愛",
    eyebrow: "LOVE",
    description: "その恋愛観、みんなと同じ？",
    color: "#ff9c8c",
    emoji: "♡",
  },
  {
    id: "money",
    name: "お金",
    eyebrow: "MONEY",
    description: "使い方に、あなたらしさ。",
    color: "#f4d778",
    emoji: "¥",
  },
];
const daily: [string, string, string][] = [
  ["家で一人のとき、独り言を言う？", "言う", "言わない"],
  ["カレーは食べ始める前に混ぜる？", "混ぜる", "混ぜない"],
  ["目覚ましアラーム、普段は何個設定する？", "1個", "2個以上"],
  ["旅行の予定、どっちが好き？", "事前に細かく決める", "現地で気分に任せる"],
  ["友達からメッセージが来たら？", "できるだけすぐ返信", "落ち着いてから返信"],
  ["初めてのお店で食事を選ぶなら？", "定番・人気メニュー", "冒険してみる"],
  ["映画館のエンドロールは？", "最後まで見る", "途中で席を立つ"],
];
const love: [string, string, string][] = [
  ["好きな人への気持ち、先に伝える？", "自分から伝える", "相手の様子を待つ"],
  ["デートの行き先は？", "一緒に相談して決める", "どちらかに任せる"],
  ["恋人と連絡するなら？", "毎日やりとりしたい", "お互いのペースで"],
  ["初デートの食事は？", "ゆっくりレストラン", "気軽なカフェ"],
  ["記念日を過ごすなら？", "特別なお祝いをする", "普段どおりが好き"],
  ["恋人と趣味が違ったら？", "一緒に体験してみる", "それぞれ楽しむ"],
  ["気になる人に誘われたら？", "予定を調整して会う", "都合のよい日を提案"],
];
const money: [string, string, string][] = [
  ["欲しいものを見つけたら？", "すぐに買う", "一晩考える"],
  ["お金の管理、どっち派？", "こまめに記録する", "残高を見て調整する"],
  ["ちょっとしたご褒美なら？", "おいしいもの", "長く使えるもの"],
  ["買い物のポイントは？", "積極的に貯める", "気にせず買う"],
  ["旅行の予算、使うなら？", "宿や移動の快適さ", "現地の食事や体験"],
  ["サブスクの見直しは？", "定期的に確認する", "気づいたときにする"],
  ["友達とごはん、お会計は？", "きっちり割り勘", "だいたい同じならOK"],
];
function questions(
  category: CategoryId,
  rows: [string, string, string][],
): Question[] {
  return rows.map(([text, a, b], i) => ({
    id: `${category}-${i + 1}`,
    category,
    order: i + 1,
    text,
    options: [a, b],
  }));
}
export const QUESTIONS: Record<CategoryId, Question[]> = {
  daily: questions("daily", daily),
  love: questions("love", love),
  money: questions("money", money),
};
export const PROVISIONAL_THRESHOLD = 30;
export function calculateScore(
  answers: Pick<AnswerSnapshot, "percentage">[],
): number {
  if (
    !answers.length ||
    answers.some(
      (a) =>
        !Number.isFinite(a.percentage) ||
        a.percentage < 0 ||
        a.percentage > 100,
    )
  )
    throw new Error("回答データが正しくありません。");
  return Math.round(
    answers.reduce((sum, a) => sum + a.percentage, 0) / answers.length,
  );
}
export function getType(score: number): { typeName: string; comment: string } {
  if (score < 30)
    return {
      typeName: "唯一無二タイプ",
      comment:
        "その感覚は、あなただけの宝物。違いがあるから、世界はおもしろい。",
    };
  if (score < 45)
    return {
      typeName: "ちょい少数派タイプ",
      comment: "みんなと少し違う、その視点。新しい発見を連れてきてくれそう。",
    };
  if (score < 55)
    return {
      typeName: "自分の道を行くタイプ",
      comment:
        "みんなに共感する日も、自分を貫く日も。バランスだって、あなたらしさ。",
    };
  if (score < 70)
    return {
      typeName: "ほどよくマイペースタイプ",
      comment: "共感もこだわりも、ちょうどよく。自分のペースで進んでいこう。",
    };
  return {
    typeName: "王道ど真ん中タイプ",
    comment:
      "その「わかる！」で、人とつながれる。あなたの普通は、誰かの安心かも。",
  };
}
export function makeSnapshot(
  questionId: string,
  choice: Choice,
  counts: [number, number],
  mode: GameMode,
  reused = false,
): AnswerSnapshot {
  const total = counts[0] + counts[1];
  if (
    !Number.isSafeInteger(total) ||
    counts.some((n) => !Number.isSafeInteger(n) || n < 0) ||
    total < 1
  )
    throw new Error("集計データが正しくありません。");
  const percentage = (counts[choice] / total) * 100;
  const provisional = total < PROVISIONAL_THRESHOLD;
  return {
    questionId,
    choice,
    counts,
    total,
    percentage,
    provisional,
    reused,
    eliminated:
      mode === "survival" && !provisional && counts[choice] * 2 < total,
  };
}
export function makeResult(
  id: string,
  category: CategoryId,
  mode: GameMode,
  answers: AnswerSnapshot[],
  demo: boolean,
): GameResult {
  const score = calculateScore(answers);
  const frozen = structuredClone(answers);
  return {
    id,
    category,
    mode,
    score,
    ...getType(score),
    answers: frozen,
    minority: frozen.reduce(
      (min, a) => (a.percentage < min.percentage ? a : min),
      frozen[0],
    ),
    completed: answers.length === 7,
    provisional: answers.some((a) => a.provisional),
    demo,
    createdAt: new Date().toISOString(),
  };
}
export function findQuestion(id: string): Question | undefined {
  return Object.values(QUESTIONS)
    .flat()
    .find((q) => q.id === id);
}
