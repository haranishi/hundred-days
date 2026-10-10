import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  STAGES,
  S_TIME_LIMIT_SEC,
  RULES_LINE,
  calculateRank,
  describeNextGoal,
  buildShareText,
  explanationFor,
  timeoutResult,
  breakdownTag,
  stageResultLabel,
  describeRetries
} from "../lib/stages.js";

test("STAGES contains 5 distinct stages with required fields", () => {
  assert.equal(STAGES.length, 5);
  STAGES.forEach((stage, idx) => {
    assert.equal(stage.id, idx + 1);
    assert.ok(stage.title, "Stage has title");
    assert.ok(stage.category, "Stage has category");
    assert.ok(stage.scenario, "Stage has scenario");
    assert.ok(stage.successTitle, "Stage has successTitle");
    assert.ok(stage.darkPatternName, "Stage has darkPatternName");
    assert.ok(stage.explanation, "Stage has explanation");
    assert.ok(stage.legalNote, "Stage has legalNote");
    assert.ok(stage.timeLimit > 0, "Stage has positive timeLimit");
    assert.match(stage.path, /^\/[a-z/-]+$/, "Stage has its own URL path");
    // 金額は画面を描くたびに乱数で決める（app.js）。固定の金額や使っていない項目を残して読み手を誤らせない
    for (const unused of ["traps", "basePrice", "siteName"]) assert.equal(stage[unused], undefined, `${unused} は使っていない`);
  });
});

test("第4現場の解説は、成功でも被弾でも引き留めダイアログの手口に触れ、画面の見出しをそのまま引く", () => {
  const text = explanationFor(STAGES[3]);
  assert.ok(text.startsWith(STAGES[3].explanation), "事前チェックの説明はそのまま");
  assert.ok(text.includes("引き留め"), text);
  assert.equal(STAGES[3].retentionQuestion, "本当に定期便を解除しますか？");
  assert.ok(text.includes(`「${STAGES[3].retentionQuestion}」`), text);
});

test("第4現場：引き留めダイアログに押し戻されたときの内訳の1行（赤いボタン・Esc）", () => {
  assert.ok(STAGES[3].retentionNotes.keep.includes("お得な定期便を続ける"));
  assert.ok(STAGES[3].retentionNotes.escape.includes("確認ダイアログを閉じた"));
  assert.equal(STAGES[3].retentionNotes.remove, undefined);
});

test("ミッション文はスマホで2行に収まる長さ（40字以下）", () => {
  for (const stage of STAGES) assert.ok([...stage.scenario].length <= 40, `${stage.id}: ${stage.scenario}`);
});

test("第1現場の制限時間は20秒のまま（入口の現場）", () => {
  assert.equal(STAGES[0].timeLimit, 20);
});

test("偽サイトのURLは現場ごとの道筋で、第5現場は退会の道筋", () => {
  const paths = STAGES.map((s) => s.path);
  assert.equal(new Set(paths).size, 5);
  assert.equal(STAGES[4].path, "/account/cancel");
});

test("第3現場のミッション文に具体的な人数を書かない（画面の人数は毎回変わる）", () => {
  assert.doesNotMatch(STAGES[2].scenario, /\d+\s*人/);
});

test("呼び名は「配送補償」に統一（保証と混ぜない）", () => {
  const stage4 = JSON.stringify(STAGES[3]);
  assert.doesNotMatch(stage4, /保証/);
  assert.match(stage4, /配送補償/);
});

// ---------------------------------------------------------------- ランク（振る舞いは変えない）
test("calculateRank gives rank S for 0 damage and fast time", () => {
  const result = calculateRank(0, 30);
  assert.equal(result.rank, "S");
  assert.ok(result.title.includes("特務UI捜査官"));
});

test("calculateRank gives rank A for 0 damage and slower time", () => {
  const result = calculateRank(0, 60);
  assert.equal(result.rank, "A");
  assert.ok(result.title.includes("敏腕リテラシー捜査官"));
});

test("calculateRank gives rank B for 0 damage with timeouts", () => {
  const result = calculateRank(0, 40, true);
  assert.equal(result.rank, "B");
  assert.ok(result.title.includes("迷えるネット市民"));
});

test("calculateRank gives rank C for minor damage", () => {
  const result = calculateRank(4980, 40);
  assert.equal(result.rank, "C");
  assert.ok(result.title.includes("一般ネット市民"));
});

test("calculateRank gives rank D for medium damage", () => {
  const result = calculateRank(12000, 50);
  assert.equal(result.rank, "D");
  assert.ok(result.title.includes("要注意カモ予備軍"));
});

test("calculateRank gives rank E for heavy damage", () => {
  const result = calculateRank(25000, 50);
  assert.equal(result.rank, "E");
  assert.ok(result.title.includes("プラチナ上客"));
});

test("Sの条件は定数（45秒）どおり：45秒ならS、46秒ならA。時間切れがあれば最高でもB", () => {
  assert.equal(S_TIME_LIMIT_SEC, 45);
  assert.equal(calculateRank(0, S_TIME_LIMIT_SEC).rank, "S");
  assert.equal(calculateRank(0, S_TIME_LIMIT_SEC + 1).rank, "A");
  assert.equal(calculateRank(0, 1, true).rank, "B");
});

test("ランクEの講評は「ほぼ全て」と断定しない（5現場中2つ突破でも出るため）", () => {
  assert.doesNotMatch(calculateRank(25000, 50).comment, /ほぼ全て/);
});

test("開始画面のルール欄にSとAの条件が1行で書いてある", () => {
  assert.equal(RULES_LINE, "S＝被害0円・時間切れなし・合計45秒以内／A＝被害0円・時間切れなし");
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.ok(html.includes(RULES_LINE), "index.html のルール欄と定数が一致している");
  assert.ok(html.includes("全5現場"), "開始ボタンの呼び名は「全5現場」");
  assert.doesNotMatch(html, /全5問|全5ステージ/);
});

// ---------------------------------------------------------------- 次の目標
test("describeNextGoal: S は最高ランク達成", () => {
  const goal = describeNextGoal({ totalDamage: 0, totalTimeSec: 30, hasTimeouts: false });
  assert.equal(goal.kind, "top");
  assert.ok(goal.text.includes("最高ランク達成"));
});

test("describeNextGoal: A は Sまであと◯秒（Sの境目との差）", () => {
  assert.ok(describeNextGoal({ totalDamage: 0, totalTimeSec: 95, hasTimeouts: false }).text.startsWith("Sまであと50秒"));
  assert.ok(describeNextGoal({ totalDamage: 0, totalTimeSec: 46, hasTimeouts: false }).text.startsWith("Sまであと1秒"));
  assert.equal(describeNextGoal({ totalDamage: 0, totalTimeSec: 46, hasTimeouts: false }).kind, "time");
});

test("describeNextGoal: B（時間切れ）は時間切れなしで通すとA以上", () => {
  const goal = describeNextGoal({ totalDamage: 0, totalTimeSec: 30, hasTimeouts: true });
  assert.equal(goal.kind, "timeout");
  assert.equal(goal.text, "時間切れなしで通すとA以上");
});

test("describeNextGoal: C〜E は被害0円で通すとA以上。45秒以内ならS", () => {
  for (const damage of [980, 12000, 45730]) {
    const goal = describeNextGoal({ totalDamage: damage, totalTimeSec: 30, hasTimeouts: false });
    assert.equal(goal.kind, "damage");
    assert.equal(goal.text, "被害0円で通すとA以上。45秒以内ならS");
  }
  // 被害と時間切れが両方ある周は、時間切れの条件も書く
  assert.equal(
    describeNextGoal({ totalDamage: 980, totalTimeSec: 30, hasTimeouts: true }).text,
    "被害0円・時間切れなしで通すとA以上。45秒以内ならS"
  );
});

test("describeNextGoal はランクと食い違わない（境目の前後）", () => {
  for (const sec of [1, 44, 45, 46, 120]) {
    for (const hasTimeouts of [false, true]) {
      for (const damage of [0, 980]) {
        const rank = calculateRank(damage, sec, hasTimeouts).rank;
        const goal = describeNextGoal({ totalDamage: damage, totalTimeSec: sec, hasTimeouts });
        const expected = { S: "top", A: "time", B: "timeout" }[rank] ?? "damage";
        assert.equal(goal.kind, expected, `rank ${rank} at ${sec}s damage ${damage} timeouts ${hasTimeouts}`);
      }
    }
  }
});

// ---------------------------------------------------------------- 共有文
test("共有文はランクと一致し、時間切れ・被害ありの周に「クリア」と書かない", () => {
  for (const [damage, sec, hasTimeouts] of [[0, 20, false], [0, 60, false], [0, 30, true], [980, 30, false], [45730, 30, true]]) {
    const info = calculateRank(damage, sec, hasTimeouts);
    const text = buildShareText({ rank: info.rank, title: info.title, totalDamage: damage, totalTimeSec: sec, hasTimeouts });
    assert.ok(text.includes(info.title), "称号が入る");
    assert.ok(text.includes(`ランク${info.rank}`), "ランクが入る");
    assert.ok(text.includes(`${sec}秒`), "秒数が入る");
    assert.doesNotMatch(text, /クリア/);
    if (hasTimeouts) assert.ok(text.includes("時間切れ"), "時間切れの周はそれと分かる");
    // 「時間切れ」は1回だけ（ランクBの称号に入っているときは、末尾の注記を省く）
    assert.ok((text.match(/時間切れ/g) ?? []).length <= 1, text);
  }
});

// ---------------------------------------------------------------- 解説の引用・内訳
test("解説は画面に実際に出た文言を引く（第1・第3・第5現場）", () => {
  const reject = "いいえ、割引を捨てて、わざわざ高い買い物をする道を選びます";
  assert.ok(explanationFor(STAGES[0], { rejectText: reject }).includes(`「${reject}」`));
  assert.ok(explanationFor(STAGES[2], { viewers: 47 }).includes("現在47人が検討中"));
  assert.ok(explanationFor(STAGES[2], { viewers: 47 }).includes("あと1分で部屋が解放されます"));
  assert.ok(explanationFor(STAGES[4]).includes(STAGES[4].question));
  assert.ok(explanationFor(STAGES[1], { notePlacement: "below" }).includes("開始ボタンの下"));
  assert.ok(explanationFor(STAGES[1], { notePlacement: "accordion" }).includes("折りたたみの中"));
});

test("時間切れの内訳は「未達」。被弾 +¥0 とは出さない。第5現場は退会未完了 +¥1,980", () => {
  for (const stage of STAGES.slice(0, 4)) {
    const { damage, breakdown } = timeoutResult(stage);
    assert.equal(damage, 0);
    assert.equal(breakdown[0].name, "時間切れ（手続き未完了）");
    assert.deepEqual(breakdownTag(breakdown[0]), { text: "未達", tone: "timeout" });
  }
  const last = timeoutResult(STAGES[4]);
  assert.equal(last.damage, 1980);
  assert.ok(last.breakdown[0].name.startsWith("退会未完了"));
  assert.equal(breakdownTag(last.breakdown[0]).text, "未達 +¥1,980");
});

test("内訳の札：被弾は赤、解除は緑", () => {
  assert.deepEqual(breakdownTag({ status: "hit", cost: 19800 }), { text: "被弾 +¥19,800", tone: "hit" });
  assert.deepEqual(breakdownTag({ status: "disarmed", cost: 0 }), { text: "解除済 ¥0", tone: "ok" });
});

test("結果一覧の時間切れは「未達 (時間切れ)」（ユーザー確定の表記）", () => {
  assert.deepEqual(stageResultLabel({ isTimeout: true, damage: 0 }), { text: "未達 (時間切れ)", tone: "timeout" });
  assert.deepEqual(stageResultLabel({ isTimeout: true, damage: 1980 }), { text: "未達 (時間切れ)", tone: "timeout" });
  assert.deepEqual(stageResultLabel({ isTimeout: false, damage: 0 }), { text: "回避 ¥0", tone: "ok" });
  assert.deepEqual(stageResultLabel({ isTimeout: false, damage: 1480 }), { text: "被弾 +¥1,480", tone: "hit" });
});

test("やり直しの表示：やり直さず被害0円・時間切れなしの周だけ「ノーミス」", () => {
  assert.deepEqual(describeRetries({ retries: 0, totalDamage: 0, hasTimeouts: false }), { text: "ノーミス", perfect: true });
  assert.deepEqual(describeRetries({ retries: 2, totalDamage: 0, hasTimeouts: false }), { text: "やり直し 2回", perfect: false });
  // やり直さずに被弾したまま・時間切れのまま進んだ周は「ノーミス」と呼ばない
  assert.deepEqual(describeRetries({ retries: 0, totalDamage: 980, hasTimeouts: false }), { text: "やり直し 0回", perfect: false });
  assert.deepEqual(describeRetries({ retries: 0, totalDamage: 0, hasTimeouts: true }), { text: "やり直し 0回", perfect: false });
});

test("第3現場の内訳には、同額でも全額が戻らない理由を添える", () => {
  assert.ok(STAGES[2].trapNote.includes("全額が戻りません"));
});
