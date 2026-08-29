import test from "node:test";
import assert from "node:assert/strict";
import { analyzeTrend } from "../../../functions/api/day-023/trend.js";

const years = (entries = {}) => Array.from({ length: 30 }, (_, index) => {
  const year = 1997 + index;
  return { year, count: Object.hasOwn(entries, year) ? entries[year] : 0 };
});

test("first、同数なら新しいpeak、増加数最大のjumpを決める", () => {
  const result = analyzeTrend("語", years({ 2019: 1, 2020: 5, 2021: 4, 2022: 9, 2023: 9, 2024: 9 }));
  assert.deepEqual(result.first, { year: 2019, count: 1 });
  assert.deepEqual(result.peak, { year: 2024, count: 9 });
  assert.deepEqual(result.jump, { year: 2022, from: 4, to: 9, ratio: 2.3 });
});

test("倍率が大きくても増加数が小さい年はjumpに選ばない", () => {
  const result = analyzeTrend("語", years({ 2002: 1, 2003: 6, 2021: 9, 2022: 36 }));
  assert.deepEqual(result.jump, { year: 2022, from: 9, to: 36, ratio: 4 });
});

test("jumpの増加数が同点なら新しい年を選ぶ", () => {
  const result = analyzeTrend("語", years({ 2020: 1, 2021: 6, 2022: 2, 2023: 7 }));
  assert.deepEqual(result.jump, { year: 2023, from: 2, to: 7, ratio: 3.5 });
});

test("jumpのratioが1.5未満なら増加数を伝える見出しと補足にする", () => {
  const result = analyzeTrend("語", years({ 2020: 10, 2021: 11, 2022: 14 }));
  assert.equal(result.headline, "2022年に、前年からいちばん増えた（11件→14件）");
  assert.match(result.finding.support, /^2022年には前年から最も増えました（11件→14件）。/);
});

test("jumpの件数と差の閾値を満たさなければnull", () => {
  assert.equal(analyzeTrend("語", years({ 2020: 1, 2021: 4, 2022: 5 })).jump, null);
});

test("直近3年のtrendをup、down、flat、nullに分類する", () => {
  assert.equal(analyzeTrend("語", years({ 2020: 1, 2021: 1, 2022: 1, 2023: 2, 2024: 2, 2025: 2 })).trend, "up");
  assert.equal(analyzeTrend("語", years({ 2020: 5, 2021: 5, 2022: 5, 2023: 2, 2024: 2, 2025: 2 })).trend, "down");
  assert.equal(analyzeTrend("語", years({ 2020: 5, 2021: 5, 2022: 5, 2023: 5, 2024: 5, 2025: 5 })).trend, "flat");
  assert.equal(analyzeTrend("語", years()).trend, null);
});

test("headlineとfindingを固定テンプレートで作る", () => {
  const result = analyzeTrend("語", years({ 2020: 5, 2021: 4, 2022: 4, 2023: 4, 2024: 4, 2025: 4 }));
  assert.equal(result.headline, "2020年に最も多く語られた（5件）");
  assert.equal(result.finding.lead, "「語」を題名に含む雑誌記事は、2020年に現れ、その年が最多です（5件）。");
  assert.match(result.finding.support, /直近3年はほぼ横ばいです/);
});

test("今年だけなら集計途中のfindingにし判定から外す", () => {
  const result = analyzeTrend("語", years({ 2026: 7 }));
  assert.equal(result.first, null);
  assert.equal(result.peak, null);
  assert.equal(result.jump, null);
  assert.equal(result.finding.lead, "「語」を題名に含む雑誌記事は、2026年になって現れました（7件・集計途中）。");
});

test("cluesは同年を統合しturningYearsは重複を除いて昇順にする", () => {
  const result = analyzeTrend("語", years({ 2020: 5, 2021: 4, 2022: 4, 2023: 4, 2024: 4, 2025: 4 }));
  assert.equal(result.clues[0].year, 2020);
  assert.match(result.clues[0].text, /初めて.*・.*最多/);
  assert.deepEqual(result.turningYears, [2020]);
});

test("全0では分析対象がなく、件数だけの見出しになる", () => {
  const result = analyzeTrend("語", years());
  assert.equal(result.first, null);
  assert.equal(result.peak, null);
  assert.equal(result.jump, null);
  assert.equal(result.headline, "この30年で0件");
  assert.deepEqual(result.clues, []);
  assert.deepEqual(result.turningYears, []);
});
