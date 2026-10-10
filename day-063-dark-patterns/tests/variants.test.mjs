import test from "node:test";
import assert from "node:assert/strict";
import {
  REJECT_TEXTS,
  STAGE1_LAYOUTS,
  SAFE_PLAN_TEXTS,
  STAGE2_POSITIONS,
  pickVariant,
  nextStage1Variant,
  nextStage2Variant,
  dodgeOffset
} from "../lib/variants.js";

// 決まった値を順に返す乱数（テスト用）
const sequence = (...values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

// 再現できる疑似乱数（mulberry32）
const seeded = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

test("pickVariant は直前と同じ番号を返さない", () => {
  for (const count of [2, 3, 4]) {
    for (let previous = 0; previous < count; previous++) {
      for (const r of [0, 0.1, 0.25, 0.5, 0.75, 0.9999]) {
        const picked = pickVariant(count, previous, () => r);
        assert.notEqual(picked, previous, `count ${count} previous ${previous} r ${r}`);
        assert.ok(picked >= 0 && picked < count);
      }
    }
  }
});

test("pickVariant は直前以外の候補を全部選びうる（偏らない）", () => {
  const random = seeded(63);
  for (const count of [2, 3, 4]) {
    for (let previous = 0; previous < count; previous++) {
      const seen = new Set();
      for (let i = 0; i < 400; i++) seen.add(pickVariant(count, previous, random));
      assert.equal(seen.size, count - 1);
      assert.ok(!seen.has(previous));
    }
  }
});

test("pickVariant: 直前が無いときは全候補から選ぶ。候補が1つなら0。壊れた乱数でも範囲内", () => {
  assert.equal(pickVariant(3, undefined, () => 0), 0);
  assert.equal(pickVariant(3, -1, () => 0.99), 2);
  assert.equal(pickVariant(1, 0, () => 0.5), 0);
  assert.equal(pickVariant(3, 7, () => 0.5), 1, "範囲外の直前は無視する");
  assert.equal(pickVariant(3, 0, () => 1), 2, "1.0 でも範囲を超えない");
  assert.equal(pickVariant(3, 0, () => Number.NaN), 1);
  assert.throws(() => pickVariant(0, -1));
});

test("第1現場：拒否リンクの文言は3種類以上、配置は2種類以上", () => {
  assert.ok(REJECT_TEXTS.length >= 3);
  assert.equal(new Set(REJECT_TEXTS).size, REJECT_TEXTS.length);
  assert.ok(STAGE1_LAYOUTS.length >= 2);
  assert.equal(new Set(STAGE1_LAYOUTS).size, STAGE1_LAYOUTS.length);
});

test("第1現場の拒否リンクは辱める調子だが、侮辱語・差別的な言葉は使わない", () => {
  const banned = ["バカ", "馬鹿", "アホ", "ブス", "デブ", "クズ", "低能", "無能", "情弱", "貧乏人", "負け組"];
  for (const text of REJECT_TEXTS) {
    for (const word of banned) assert.ok(!text.includes(word), `${text} に ${word}`);
  }
});

test("第2現場：チェックの文言は2〜3種類、配置は注記2種類×チェックの左右", () => {
  assert.ok(SAFE_PLAN_TEXTS.length >= 2 && SAFE_PLAN_TEXTS.length <= 3);
  for (const make of SAFE_PLAN_TEXTS) assert.ok(make("¥1,280").includes("¥1,280"), "月額料金が入る");
  assert.deepEqual([...new Set(STAGE2_POSITIONS.map((p) => p.note))].sort(), ["accordion", "below"]);
  assert.deepEqual([...new Set(STAGE2_POSITIONS.map((p) => p.check))].sort(), ["left", "right"]);
});

test("同じページでやり直すたびに、第1現場は文言も配置も前回と変わる", () => {
  const random = seeded(1);
  let previous = {};
  for (let round = 0; round < 50; round++) {
    const next = nextStage1Variant(previous, random);
    if (round > 0) {
      assert.notEqual(next.text, previous.text);
      assert.notEqual(next.layout, previous.layout);
    }
    previous = next;
  }
});

test("同じページでやり直すたびに、第2現場は押す位置（注記の置き場所かチェックの左右）と文言が変わる", () => {
  const random = seeded(2);
  let previous = {};
  for (let round = 0; round < 50; round++) {
    const next = nextStage2Variant(previous, random);
    if (round > 0) {
      assert.notEqual(next.text, previous.text);
      assert.notEqual(next.position, previous.position);
      const a = STAGE2_POSITIONS[next.position];
      const b = STAGE2_POSITIONS[previous.position];
      assert.ok(a.note !== b.note || a.check !== b.check);
    }
    previous = next;
  }
});

test("拒否リンクの文言に重言（後で後悔）を使わない", () => {
  for (const text of REJECT_TEXTS) assert.doesNotMatch(text, /後で後悔/);
});

test("逃げる×は左へ4〜72px・上下±3pxの範囲だけを動き、前の位置から12px以上動く（壊れた乱数でも範囲内）", () => {
  const random = seeded(4);
  let x = 0;
  for (let i = 0; i < 1000; i++) {
    const next = dodgeOffset(random, x);
    assert.ok(next.x >= -72 && next.x <= -4, `x=${next.x}`);
    assert.ok(Math.abs(next.y) <= 3, `y=${next.y}`);
    assert.ok(Math.abs(next.x - x) >= 12, `${x} → ${next.x}`);
    x = next.x;
  }
  for (const value of [Number.NaN, -1, 2, Infinity]) {
    const odd = dodgeOffset(() => value, 0);
    assert.ok(odd.x >= -72 && odd.x <= -4 && Math.abs(odd.y) <= 3, JSON.stringify(odd));
  }
});

test("乱数を差し替えると選ばれる変種も決まる（純粋関数）", () => {
  assert.deepEqual(nextStage1Variant({}, sequence(0, 0.99)), { text: 0, layout: 2 });
  assert.deepEqual(nextStage1Variant({ text: 0, layout: 2 }, sequence(0, 0)), { text: 1, layout: 0 });
  assert.deepEqual(nextStage2Variant({ text: 2, position: 3 }, sequence(0.99, 0.99)), { text: 1, position: 2 });
});
