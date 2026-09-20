import test from "node:test";
import assert from "node:assert/strict";
import { createRate } from "../lib/rate.js";

test("createRate は測れる長さが貯まるまで null を返す", () => {
  const rate = createRate();
  assert.equal(rate.perSecond(0), null, "1件も来ていない");
  rate.push(0);
  assert.equal(rate.perSecond(500), null, "経過0.5秒では出さない");
  assert.notEqual(rate.perSecond(1000), null);
});

test("createRate は開いてからの実時間で割る", () => {
  const rate = createRate();
  // 2秒で60件 = 毎秒30件。60秒窓で割ると1件になってしまう
  for (let i = 0; i < 60; i += 1) rate.push(i * 33);
  assert.equal(Math.round(rate.perSecond(2000)), 30);
});

test("createRate は窓から出た古い件数を落とす", () => {
  const rate = createRate(1000);
  rate.push(0);
  rate.push(100);
  rate.push(900);
  assert.equal(Math.round(rate.perSecond(1000)), 3);

  rate.push(1500);
  // 1500ms時点の窓は500〜1500ms。0msと100msの2件は外れる
  assert.equal(Math.round(rate.perSecond(1500)), 2);
  assert.equal(rate.size, 2, "窓から出た分は保持もしない");
});
