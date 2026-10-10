import test from "node:test";
import assert from "node:assert/strict";
import { phrases, phraseBoundaries } from "../lib/phrase.js";
import { STAGES, RULES_LINE } from "../lib/stages.js";
import { REJECT_TEXTS } from "../lib/variants.js";

const isHira = (c) => /^[ぁ-ゟ]/.test(c);
const SENTENCE_END = /[。．！？!?]\s*$/;
const letters = (s) => Array.from(s).filter((c) => /[\p{L}\p{N}]/u.test(c)).length;

// 文節の切れ目が、指定した文字列の内側に入っていないか
function assertKeptTogether(text, piece) {
  const at = text.indexOf(piece);
  assert.ok(at >= 0, `「${piece}」が「${text}」にない`);
  const inside = phraseBoundaries(text).filter((b) => b > at && b < at + piece.length);
  assert.deepEqual(inside, [], `「${piece}」の途中で切れる: ${phrases(text).join(" | ")}`);
}

// R2の評価で、語の途中・助詞の前で折れていた文言
const FLAGGED = [
  ["ネットに潜む「罠UI」を看破せよ", ["「罠UI」を", "看破せよ"]],
  [RULES_LINE, ["被害0円・", "時間切れなし", "合計45秒以内／"]],
  [STAGES[0].legalNote, ["情緒的圧迫であり、", "感情操作的UIとして"]],
  [STAGES[1].legalNote, ["電話窓口でのみ", "「電話限定縛り」は、"]],
  [STAGES[3].legalNote, ["表示しないこと、"]],
  [STAGES[3].explanation, ["配送補償」に、"]],
  ["※本無料トライアルは、期間終了の48時間前までに所定の電話サポート窓口（平日11:00〜14:00のみ受付）にお申し出がない場合、自動的に年額プレミアムプラン（¥12,800/年）へと更新されます。",
    ["11:00〜14:00のみ", "お申し出がない", "（¥12,800/年）へと"]],
  ["考え直す（契約を維持）", ["（契約を維持）"]],
  ["今解除すると、初回限定の特別割引（-90%）や送料無料特典が失効する可能性があります。", ["（-90%）や"]],
  ["（※有料プレミアムメルマガ月額¥1,980に同意）", ["月額¥1,980に", "同意）"]],
  ["年額の自動更新をやめて、月額¥1,280のプランで始める", ["月額¥1,280の"]],
  ["いいえ、私は損をするのが大好きなので、定価のまま無駄なお金を払い続けます", ["払い続けます", "お金を"]],
  ["【推奨】クーポンを受け取って買い物する", ["受け取って"]]
];

test("R2で語の途中・助詞の前で折れていた文言を、文節の途中で区切らない", () => {
  for (const [text, pieces] of FLAGGED) {
    for (const piece of pieces) assertKeptTogether(text, piece);
  }
});

// 画面に出る文をひととおり集める（文節の性質を全部に当てて確かめる）
const SAMPLES = [
  ...FLAGGED.map(([text]) => text),
  ...STAGES.flatMap((s) => [s.title, s.scenario, s.successTitle, s.darkPatternName, s.explanation, s.legalNote]),
  STAGES[4].question,
  ...REJECT_TEXTS,
  "出典参考：消費者庁「欺瞞的パターンに関する実態調査」、OECD「Dark Commercial Patterns」、国民生活センター相談事例。",
  "InstagramとYouTubeはWebから直接投稿できない仕組みなので、リンクをコピーして貼ってください。",
  "現場ごとに20〜30秒。現場名の表示（約1秒）の間は、操作できず、時間も進みません",
  "時間切れのまま次へ進むと、その周は最高でもB",
  "\n        捜査を開始する（全5現場）\n      "
];

test("連結すると元の文に戻り、何度区切っても同じ結果", () => {
  for (const text of SAMPLES) {
    const list = phrases(text);
    assert.equal(list.join(""), text);
    assert.deepEqual(phrases(text), list);
    assert.deepEqual(phrases(list.join("")), list);
  }
  assert.deepEqual(phrases(""), []);
  assert.deepEqual(phrases(null), []);
});

test("文節は、文の頭（句点のあと）以外でひらがなから始まらない（行頭に助詞が来ない）", () => {
  for (const text of SAMPLES) {
    const list = phrases(text);
    list.forEach((phrase, index) => {
      if (index === 0) return;
      const first = phrase.trimStart()[0];
      if (!isHira(first)) return;
      assert.match(list[index - 1], SENTENCE_END, `「${phrase}」が読点や語の途中から始まる: ${list.join(" | ")}`);
    });
  }
});

test("1文字だけの文節を作らない（1文字だけの行にならない）", () => {
  for (const text of SAMPLES) {
    for (const phrase of phrases(text)) {
      if (!phrase.trim()) continue;
      assert.ok(letters(phrase) >= 2, `「${phrase}」が1文字以下: ${phrases(text).join(" | ")}`);
    }
  }
});

test("切れ目の位置は phrases の区切りと一致する", () => {
  const text = "ネットに潜む「罠UI」を看破せよ";
  assert.deepEqual(phrases(text), ["ネットに", "潜む", "「罠UI」を", "看破せよ"]);
  assert.deepEqual(phraseBoundaries(text), [4, 6, 12]);
  assert.deepEqual(phraseBoundaries("看破"), []);
});

test("Intl.Segmenter が無い環境では区切らない（文をそのまま1つ返す）", async () => {
  const saved = Intl.Segmenter;
  delete Intl.Segmenter;
  try {
    const fallback = await import("../lib/phrase.js?no-segmenter");
    assert.deepEqual(fallback.phrases("ネットに潜む「罠UI」を看破せよ"), ["ネットに潜む「罠UI」を看破せよ"]);
    const root = { querySelectorAll: () => { throw new Error("触ってはいけない"); } };
    assert.equal(fallback.phrasifyNode(root), root);
  } finally {
    Intl.Segmenter = saved;
  }
});
