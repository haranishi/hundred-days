import test from "node:test";
import assert from "node:assert/strict";
import { BEST_KEY, isBestEligible, parseBest, mergeBest, betterBest, readBest, writeBest, describeBest } from "../lib/records.js";

// localStorage の代わり（Map で持つ）
const memoryStorage = () => {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    dump: () => Object.fromEntries(map)
  };
};

// 読み書きのたびに例外を投げる保存先（拒否・容量超過・プライベートモード相当）
const brokenStorage = {
  getItem() { throw new Error("SecurityError"); },
  setItem() { throw new Error("QuotaExceededError"); }
};

test("記録の対象は被害0円・時間切れなしの周だけ", () => {
  assert.equal(isBestEligible({ totalDamage: 0, hasTimeouts: false }), true);
  assert.equal(isBestEligible({ totalDamage: 0, hasTimeouts: true }), false);
  assert.equal(isBestEligible({ totalDamage: 980, hasTimeouts: false }), false);
});

test("壊れた値・別の形の値は記録なしとして扱う", () => {
  for (const raw of [null, "", "{", "null", "[]", '{"sec":"12","rank":"S"}', '{"sec":0,"rank":"S"}', '{"sec":12.5,"rank":"S"}', '{"sec":12,"rank":"B"}']) {
    assert.equal(parseBest(raw), null, String(raw));
  }
  assert.deepEqual(parseBest('{"sec":12,"rank":"S","extra":"x"}'), { sec: 12, rank: "S" });
});

test("初めての対象周は初記録、縮めたら更新、同じか遅ければそのまま", () => {
  const first = mergeBest(null, { totalDamage: 0, hasTimeouts: false, totalTimeSec: 40, rank: "S" });
  assert.deepEqual(first, { best: { sec: 40, rank: "S" }, updated: true, first: true });
  const faster = mergeBest(first.best, { totalDamage: 0, hasTimeouts: false, totalTimeSec: 21, rank: "S" });
  assert.deepEqual(faster, { best: { sec: 21, rank: "S" }, updated: true, first: false });
  const same = mergeBest(faster.best, { totalDamage: 0, hasTimeouts: false, totalTimeSec: 21, rank: "S" });
  assert.equal(same.updated, false);
  const slower = mergeBest(faster.best, { totalDamage: 0, hasTimeouts: false, totalTimeSec: 95, rank: "A" });
  assert.deepEqual(slower, { best: { sec: 21, rank: "S" }, updated: false, first: false });
});

test("被害ありや時間切れの周は、速くても記録を書き換えない", () => {
  const best = { sec: 30, rank: "S" };
  assert.deepEqual(mergeBest(best, { totalDamage: 980, hasTimeouts: false, totalTimeSec: 5, rank: "C" }), { best, updated: false, first: false });
  assert.deepEqual(mergeBest(best, { totalDamage: 0, hasTimeouts: true, totalTimeSec: 5, rank: "B" }), { best, updated: false, first: false });
  assert.deepEqual(mergeBest(null, { totalDamage: 0, hasTimeouts: true, totalTimeSec: 5, rank: "B" }), { best: null, updated: false, first: false });
});

test("保存するのは秒数とランクだけ（キーは day063.best.v1）", () => {
  const storage = memoryStorage();
  assert.equal(writeBest(storage, { sec: 21, rank: "S", name: "個人情報" }), true);
  assert.deepEqual(storage.dump(), { [BEST_KEY]: '{"sec":21,"rank":"S"}' });
  assert.deepEqual(readBest(storage), { sec: 21, rank: "S" });
});

test("保存先が使えなくても例外を外に出さない（記録なしとして続ける）", () => {
  assert.equal(readBest(brokenStorage), null);
  assert.equal(writeBest(brokenStorage, { sec: 21, rank: "S" }), false);
  assert.equal(readBest(null), null);
  assert.equal(writeBest(null, { sec: 21, rank: "S" }), false);
});

test("betterBest は速い方を選ぶ（保存できなかったページ内の記録との突き合わせ）", () => {
  assert.equal(betterBest(null, null), null);
  assert.deepEqual(betterBest({ sec: 30, rank: "S" }, null), { sec: 30, rank: "S" });
  assert.deepEqual(betterBest(null, { sec: 30, rank: "S" }), { sec: 30, rank: "S" });
  assert.deepEqual(betterBest({ sec: 30, rank: "S" }, { sec: 21, rank: "S" }), { sec: 21, rank: "S" });
  assert.deepEqual(betterBest({ sec: 21, rank: "S" }, { sec: 30, rank: "S" }), { sec: 21, rank: "S" });
});

test("結果画面の1行と札：初めての記録は「初記録！」、縮めたときだけ「更新！」、無ければ記録の条件を案内", () => {
  assert.deepEqual(describeBest({ best: { sec: 40, rank: "S" }, updated: true, first: true }), { text: "自己ベスト 40秒（S）", badge: "初記録！" });
  assert.deepEqual(describeBest({ best: { sec: 21, rank: "S" }, updated: true, first: false }), { text: "自己ベスト 21秒（S）", badge: "更新！" });
  assert.deepEqual(describeBest({ best: { sec: 21, rank: "S" }, updated: false, first: false }), { text: "自己ベスト 21秒（S）", badge: null });
  assert.deepEqual(describeBest({ best: null, updated: false }), { text: "自己ベストは、被害0円・時間切れなしの周で記録されます", badge: null });
  // mergeBest の結果をそのまま渡したとき（1周目→速い2周目）
  const run1 = mergeBest(null, { totalDamage: 0, hasTimeouts: false, totalTimeSec: 40, rank: "S" });
  assert.equal(describeBest(run1).badge, "初記録！");
  const run2 = mergeBest(run1.best, { totalDamage: 0, hasTimeouts: false, totalTimeSec: 30, rank: "S" });
  assert.equal(describeBest(run2).badge, "更新！");
});

test("縮められなかった周は「自己ベスト◯秒まであと◯秒」（更新した周と同じ文にしない）", () => {
  const best = { sec: 22, rank: "S" };
  const slower = { totalDamage: 0, hasTimeouts: false, totalTimeSec: 25, rank: "S" };
  assert.deepEqual(describeBest({ ...mergeBest(best, slower), run: slower }), { text: "自己ベスト 22秒（S）まであと3秒", badge: null });
  const same = { totalDamage: 0, hasTimeouts: false, totalTimeSec: 22, rank: "S" };
  assert.deepEqual(describeBest({ ...mergeBest(best, same), run: same }), { text: "自己ベスト 22秒（S）と同じタイム", badge: null });
  // 記録の対象外の周（被害あり・時間切れ）は、差を書かない
  const hit = { totalDamage: 980, hasTimeouts: false, totalTimeSec: 25, rank: "C" };
  assert.deepEqual(describeBest({ ...mergeBest(best, hit), run: hit }), { text: "自己ベスト 22秒（S）", badge: null });
  // 縮めた周は差ではなく札
  const faster = { totalDamage: 0, hasTimeouts: false, totalTimeSec: 20, rank: "S" };
  assert.deepEqual(describeBest({ ...mergeBest(best, faster), run: faster }), { text: "自己ベスト 20秒（S）", badge: "更新！" });
});
