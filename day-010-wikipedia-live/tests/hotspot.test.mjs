import test from "node:test";
import assert from "node:assert/strict";
import { WINDOW_MS, createHotspot } from "../lib/hotspot.js";

const japan = { n: "日本" };
const france = { n: "フランス" };

test("1件も無ければ null", () => {
  const spot = createHotspot();
  assert.equal(spot.top(0), null);
});

test("いちばん多い国を名指しする", () => {
  const spot = createHotspot();
  spot.add(japan, 1000);
  spot.add(france, 1100);
  spot.add(japan, 1200);

  const top = spot.top(1300);
  assert.equal(top.name, "日本");
  assert.equal(top.count, 2);
  assert.equal(top.total, 3);
  assert.equal(top.countries, 2);
});

test("同数なら直近に書き換わったほうを選ぶ", () => {
  const spot = createHotspot();
  spot.add(japan, 1000);
  spot.add(france, 2000);
  assert.equal(spot.top(2100).name, "フランス");

  spot.add(japan, 3000);
  spot.add(france, 3100);
  assert.equal(spot.top(3200).name, "フランス", "2対2ならあとから来たほう");
});

test("5分より古いピンは数えない", () => {
  const spot = createHotspot();
  spot.add(japan, 0);
  spot.add(japan, 1000);
  spot.add(france, WINDOW_MS);

  // 0msと1000msのピンは窓から外れる
  const top = spot.top(WINDOW_MS + 1500);
  assert.equal(top.name, "フランス");
  assert.equal(top.total, 1);
  assert.equal(spot.size, 1, "古いピンは保持もしない");

  assert.equal(spot.top(WINDOW_MS * 3), null, "全部古くなれば null に戻る");
});

test("国が分からない座標は数に入れない", () => {
  const spot = createHotspot();
  assert.equal(spot.add(null, 1000), false);
  assert.equal(spot.size, 0);
  assert.equal(spot.top(1100), null);
});
