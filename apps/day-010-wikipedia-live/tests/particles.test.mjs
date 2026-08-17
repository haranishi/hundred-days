import test from "node:test";
import assert from "node:assert/strict";
import {
  MARK_MS,
  MAX_RADIUS,
  RIPPLE_MS,
  RIPPLE_MS_JA,
  createMark,
  createRipple,
  radiusFor,
  stepMarks,
  stepRipples,
} from "../lib/particles.js";

test("radiusFor は大きい編集ほど大きい点にする", () => {
  const sizes = [0, 10, 100, 1000].map(radiusFor);
  for (let i = 1; i < sizes.length; i += 1) assert.ok(sizes[i] > sizes[i - 1]);
  assert.ok(radiusFor(0) > 2, "0バイトの編集も見える大きさで出す");
  assert.equal(radiusFor(-500), radiusFor(500), "削除も追加も大きさは同じ");
});

test("radiusFor は巨大な編集でも頭を止める", () => {
  // 頭打ちが無いと、10万バイトの編集ひとつで地図が埋まる
  assert.equal(radiusFor(100000), MAX_RADIUS);
  assert.ok(radiusFor(1000) < MAX_RADIUS);
  assert.equal(radiusFor(Infinity), radiusFor(0), "壊れた値はいちばん小さい点に倒す");
  assert.equal(radiusFor(NaN), radiusFor(0));
});

test("createRipple は日本語版だけ大きく長く広がる", () => {
  const other = createRipple({ lon: 10, lat: 20, delta: 100 });
  const ja = createRipple({ lon: 10, lat: 20, delta: 100, isJa: true, title: "秋田県" });
  assert.equal(other.life, RIPPLE_MS);
  assert.equal(ja.life, RIPPLE_MS_JA);
  assert.ok(ja.rMax > other.rMax);
  assert.equal(ja.title, "秋田県", "記事名は波紋が持ち歩く");
});

test("stepRipples は広げて薄くし、寿命が来たら消す", () => {
  const ripples = [createRipple({ lon: 1, lat: 2, delta: 100 })];
  const mid = stepRipples(ripples, RIPPLE_MS / 2);
  assert.equal(mid.length, 1);
  assert.ok(mid[0].radius > ripples[0].r);
  assert.ok(mid[0].radius < mid[0].rMax);
  assert.ok(Math.abs(mid[0].alpha - 0.5) < 0.01);
  assert.equal(stepRipples(mid, RIPPLE_MS).length, 0);
});

test("stepRipples は元の配列を書き換えない", () => {
  const ripples = [createRipple({ lon: 1, lat: 2, delta: 100 })];
  stepRipples(ripples, 500);
  assert.equal(ripples[0].age, 0);
});

test("stepMarks は5分かけて薄れ、そこで消える", () => {
  let marks = [createMark({ lon: 5, lat: 6, delta: 300 })];
  assert.equal(marks[0].alpha, 1);

  marks = stepMarks(marks, MARK_MS / 2);
  assert.equal(marks.length, 1);
  assert.ok(marks[0].alpha < 1 && marks[0].alpha > 0);

  // 前半より後半のほうが速く薄れる（直近のピンをはっきり見せるため）
  const half = marks[0].alpha;
  const later = stepMarks(marks, MARK_MS / 4)[0].alpha;
  assert.ok(1 - half < half - later);

  assert.equal(stepMarks(marks, MARK_MS).length, 0);
});

test("stepMarks は止まっていても落ちない", () => {
  assert.equal(stepMarks([createMark({ lon: 0, lat: 0 })], 0).length, 1);
  assert.equal(stepMarks([], 100).length, 0);
});
