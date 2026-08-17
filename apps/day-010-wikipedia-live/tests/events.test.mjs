import test from "node:test";
import assert from "node:assert/strict";
import { COUNTED_TYPES, MASK, createSeen, isReadable, maskComment, normalize, shorten } from "../lib/events.js";

const raw = (overrides = {}) => ({
  $schema: "/mediawiki/recentchange/1.0.0",
  meta: { id: "11111111-2222-3333-4444-555555555555", domain: "ja.wikipedia.org" },
  type: "edit",
  namespace: 0,
  title: "秋田県",
  title_url: "https://ja.wikipedia.org/wiki/%E7%A7%8B%E7%94%B0%E7%9C%8C",
  comment: "体裁調整",
  timestamp: 1786900000,
  user: "192.0.2.55",
  bot: false,
  minor: false,
  length: { old: 1000, new: 1210 },
  server_name: "ja.wikipedia.org",
  wiki: "jawiki",
  ...overrides,
});

test("normalize は user を絶対に持ち出さない", () => {
  const event = normalize(raw());
  // 匿名編集はIPアドレスがそのまま user に入ってくる。キーごと存在しないことを固定する
  assert.equal("user" in event, false);
  assert.equal(JSON.stringify(event).includes("192.0.2.55"), false);
});

test("normalize は編集と新規作成だけを通す", () => {
  assert.deepEqual([...COUNTED_TYPES].sort(), ["edit", "new"]);
  assert.ok(normalize(raw({ type: "edit" })));
  assert.ok(normalize(raw({ type: "new" })));
  assert.equal(normalize(raw({ type: "categorize" })), null);
  assert.equal(normalize(raw({ type: "log" })), null);
  assert.equal(normalize(null), null);
  assert.equal(normalize("edit"), null);
});

test("normalize はバイト増減を計算する", () => {
  assert.equal(normalize(raw()).delta, 210);
  assert.equal(normalize(raw({ length: { old: 1210, new: 1000 } })).delta, -210);
  // 新規作成は old が無い
  assert.equal(normalize(raw({ type: "new", length: { new: 400 } })).delta, 400);
  // length ごと欠けても落ちない
  assert.equal(normalize(raw({ length: undefined })).delta, 0);
});

test("normalize は壊れた値を安全側に倒す", () => {
  const event = normalize(raw({ title_url: "javascript:alert(1)", namespace: "0", title: undefined, meta: {} }));
  assert.equal(event.url, "");
  assert.equal(event.namespace, -1);
  assert.equal(event.title, "");
  assert.equal(event.id, "");
});

test("isReadable は日本語版の記事本体だけを通す", () => {
  assert.equal(isReadable(normalize(raw())), true);
  assert.equal(isReadable(normalize(raw({ namespace: 1 }))), false, "ノートは出さない");
  assert.equal(isReadable(normalize(raw({ namespace: 2 }))), false, "利用者ページは出さない");
  assert.equal(isReadable(normalize(raw({ wiki: "enwiki" }))), false);
  assert.equal(isReadable(normalize(raw({ wiki: "jawiktionary" }))), false, "ウィクショナリーは別プロジェクト");
  assert.equal(isReadable(null), false);
});

test("maskComment はIPアドレスを伏せる", () => {
  const ipv4 = maskComment("192.0.2.55 の編集を差し戻し");
  assert.equal(ipv4.text, `${MASK} の編集を差し戻し`);
  assert.equal(ipv4.masked, true);

  const ipv6 = maskComment("2001:0db8:85a3:0000:0000:8a2e:0370:7334 を巻き戻し");
  assert.equal(ipv6.text, `${MASK} を巻き戻し`);
  assert.equal(ipv6.masked, true);
});

test("maskComment は時刻や版番号をIPv6と誤認しない", () => {
  // 3組までの数字とコロンは時刻表記なので伏せない
  assert.equal(maskComment("12:34:56 の版へ戻す").text, "12:34:56 の版へ戻す");
  assert.equal(maskComment("12:34:56 の版へ戻す").masked, false);
});

test("maskComment は利用者ページへのリンクを伏せる", () => {
  for (const link of [
    "[[利用者:テスト太郎]]",
    "[[利用者‐会話:テスト太郎]]",
    "[[User:Test]]",
    "[[User talk:Test]]",
    "[[特別:投稿記録/192.0.2.55]]",
    "[[Special:Contributions/Test]]",
  ]) {
    const result = maskComment(`${link} の編集を取り消し`);
    assert.equal(result.text, `${MASK} の編集を取り消し`, link);
    assert.equal(result.masked, true, link);
  }
});

test("maskComment は記事へのリンクは伏せずに読みやすくする", () => {
  assert.deepEqual(maskComment("[[秋田県]]を参照"), { text: "秋田県を参照", masked: false });
  assert.deepEqual(maskComment("[[秋田県|あきた]]へ"), { text: "あきたへ", masked: false });
  // 節名は【】に置き換える
  assert.deepEqual(maskComment("/* 概要 */ 追記"), { text: "【概要】 追記", masked: false });
  assert.deepEqual(maskComment("/*  */ 追記"), { text: "追記", masked: false });
  assert.deepEqual(maskComment(""), { text: "", masked: false });
  assert.deepEqual(maskComment(undefined), { text: "", masked: false });
});

test("normalize は伏せた事実を持ち回る", () => {
  const event = normalize(raw({ comment: "[[利用者:テスト太郎]] の編集を差し戻し" }));
  assert.equal(event.comment, `${MASK} の編集を差し戻し`);
  assert.equal(event.commentMasked, true);
  assert.equal(normalize(raw()).commentMasked, false);
});

test("shorten は長い要約だけを切る", () => {
  assert.equal(shorten("短い要約"), "短い要約");
  assert.equal(shorten("あ".repeat(90)).length, 90);
  assert.equal(shorten("あ".repeat(200)).length, 90);
  assert.ok(shorten("あ".repeat(200)).endsWith("…"));
  assert.equal(shorten("あいうえお", 3), "あい…");
});

test("createSeen は同じイベントを二度数えない", () => {
  const seen = createSeen(3);
  assert.equal(seen.accept("a"), true);
  assert.equal(seen.accept("a"), false);
  assert.equal(seen.accept("b"), true);

  // IDが無いイベントは弾きようがないので通す
  assert.equal(seen.accept(""), true);
  assert.equal(seen.accept(""), true);

  // 上限を超えたら古いものから忘れる（記憶が無限に増えない）
  seen.accept("c");
  seen.accept("d");
  assert.equal(seen.size, 3);
  assert.equal(seen.accept("a"), true, "忘れた分は再び通る");
});
