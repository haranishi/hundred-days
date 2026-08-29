import test from "node:test";
import assert from "node:assert/strict";
import { normalizeQuery } from "../../../functions/api/day-023/trend.js";

test("前後の空白を除きNFKCで正規化する", () => {
  assert.equal(normalizeQuery("  生成ＡＩ  "), "生成AI");
});

test("制御文字と禁止文字を除去する", () => {
  assert.equal(normalizeQuery("推\nし\"活'<>\\"), "推し活");
});

test("空と30文字超は無効にする", () => {
  assert.equal(normalizeQuery(" \n<> "), null);
  assert.equal(normalizeQuery("あ".repeat(30)), "あ".repeat(30));
  assert.equal(normalizeQuery("あ".repeat(31)), null);
  assert.equal(normalizeQuery(null), null);
});
