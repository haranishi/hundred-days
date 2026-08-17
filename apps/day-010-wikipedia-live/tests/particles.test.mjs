import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_RADIUS,
  RIPPLE_MS,
  RIPPLE_MS_JA,
  SINK_MS,
  createDrop,
  createRipple,
  createSink,
  radiusFor,
  stepDrops,
  stepRipples,
  stepSinks,
} from "../lib/particles.js";

test("radiusFor は大きい編集ほど大きい粒にする", () => {
  const sizes = [0, 10, 100, 1000].map(radiusFor);
  for (let i = 1; i < sizes.length; i += 1) assert.ok(sizes[i] > sizes[i - 1]);
  assert.ok(radiusFor(0) > 2, "0バイトの編集も見える大きさで出す");
  assert.equal(radiusFor(-500), radiusFor(500), "削除も追加も大きさは同じ");
});

test("radiusFor は巨大な編集でも頭を止める", () => {
  // 頭打ちが無いと、10万バイトの編集ひとつで画面が埋まる
  assert.equal(radiusFor(100000), MAX_RADIUS);
  assert.ok(radiusFor(1000) < MAX_RADIUS);
  // 壊れた値は「いちばん小さい粒」に倒す（Infinityで画面を埋めない）
  assert.equal(radiusFor(Infinity), radiusFor(0));
  assert.equal(radiusFor(NaN), radiusFor(0));
});

test("stepDrops は水面に届いた粒だけを landed で返す", () => {
  const drops = [
    createDrop({ id: "a", x: 10, speed: 100 }), // y = -16 → 1秒で84
    createDrop({ id: "b", x: 20, speed: 100 }),
  ];
  const first = stepDrops(drops, 1000, 200);
  assert.equal(first.drops.length, 2);
  assert.equal(first.landed.length, 0);
  assert.equal(first.drops[0].y, 84);

  const second = stepDrops(first.drops, 2000, 200);
  assert.equal(second.drops.length, 0);
  assert.equal(second.landed.length, 2);
  assert.equal(second.landed[0].y, 200, "着水位置は水面ちょうどに揃える");
});

test("stepDrops は元の配列を書き換えない", () => {
  const drops = [createDrop({ id: "a", speed: 100 })];
  stepDrops(drops, 1000, 500);
  assert.equal(drops[0].y, -16);
});

test("createRipple は日本語版だけ大きく長く広がる", () => {
  const other = createRipple(createDrop({ delta: 100 }));
  const ja = createRipple(createDrop({ delta: 100, isJa: true, title: "秋田県" }));
  assert.equal(other.life, RIPPLE_MS);
  assert.equal(ja.life, RIPPLE_MS_JA);
  assert.ok(ja.rMax > other.rMax);
  assert.equal(ja.title, "秋田県", "記事名は波紋が持ち歩く");
});

test("stepRipples は広げて薄くし、寿命が来たら消す", () => {
  const ripples = [createRipple(createDrop({ delta: 100 }))];
  const mid = stepRipples(ripples, RIPPLE_MS / 2);
  assert.equal(mid.length, 1);
  assert.ok(mid[0].radius > ripples[0].r);
  assert.ok(mid[0].radius < mid[0].rMax);
  assert.ok(Math.abs(mid[0].alpha - 0.5) < 0.01);

  assert.equal(stepRipples(mid, RIPPLE_MS).length, 0);
});

test("stepSinks は着水点から沈めて消す", () => {
  const landed = { ...createDrop({ delta: 100 }), y: 300 };
  let sinks = [createSink(landed)];
  assert.equal(sinks[0].y, 300);

  sinks = stepSinks(sinks, SINK_MS / 2);
  assert.equal(sinks.length, 1);
  assert.ok(sinks[0].y > 300, "水面より下へ動く");
  assert.ok(sinks[0].radius < landed.r, "沈むほど小さくなる");
  assert.ok(sinks[0].alpha > 0 && sinks[0].alpha < 0.5);

  // 何コマに分けて進めても、同じ時間なら同じ位置に来る（着水点から計算しているか）
  const smooth = [createSink(landed)];
  const stepped = stepSinks(stepSinks(stepSinks(smooth, 250), 250), 250);
  assert.ok(Math.abs(stepped[0].y - sinks[0].y) < 0.001);

  assert.equal(stepSinks(sinks, SINK_MS).length, 0);
});

test("stepRipples は止まっていても落ちない", () => {
  const ripples = [createRipple(createDrop({ delta: 100 }))];
  assert.equal(stepRipples(ripples, 0).length, 1);
  assert.equal(stepRipples([], 100).length, 0);
});
