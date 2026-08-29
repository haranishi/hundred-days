import test from "node:test";
import assert from "node:assert/strict";
import { PARTIAL_NOTE_TEXT, chartCoordinates, partialNoteLayout, xLabelYears, yAxisTicks } from "../lib/chart.js";

const years = Array.from({ length: 30 }, (_, index) => ({ year: 1997 + index, count: index }));

test("30点を描画領域内の座標へ変換する", () => {
  const points = chartCoordinates(years, { width: 760, height: 330, left: 44, right: 24, top: 30, bottom: 48 });
  assert.equal(points.length, 30);
  assert.equal(points[0].x, 44);
  assert.equal(points.at(-1).x, 736);
  assert.ok(points.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)));
});

test("最大値から切りのいいy軸3本を作る", () => {
  assert.deepEqual(yAxisTicks(years), [0, 25, 50]);
  assert.deepEqual(yAxisTicks([{ year: 2026, count: 0 }]), [0, 1, 2]);
});

test("幅390では狭い余白内に座標を収め、x軸ラベルを4点に絞る", () => {
  const points = chartCoordinates(years, { width: 390, height: 260, left: 40, right: 24, top: 30, bottom: 48 });
  assert.equal(points[0].x, 40);
  assert.equal(points.at(-1).x, 366);
  assert.deepEqual(xLabelYears(390), [1997, 2007, 2017, 2026]);
});

test("幅760ではx軸ラベルを7点表示する", () => {
  assert.deepEqual(xLabelYears(760), [1997, 2002, 2007, 2012, 2017, 2022, 2026]);
});

test("0件と欠損値でも座標計算が例外にならない", () => {
  assert.equal(chartCoordinates([]).length, 0);
  assert.equal(chartCoordinates([{ year: 2026, count: null }])[0].y, null);
});

test("集計途中の注記をプロット外・x軸ラベルの下に置く", () => {
  assert.equal(PARTIAL_NOTE_TEXT, "集計途中");
  const wide = partialNoteLayout({ width: 760, height: 330, right: 24 });
  assert.deepEqual(wide, { x: 736, y: 324, textAnchor: "end" });
  const narrow = partialNoteLayout({ width: 390, height: 260, right: 24 });
  const lastPoint = chartCoordinates(years, { width: 390, height: 260, left: 40, right: 24, top: 30, bottom: 48 }).at(-1);
  assert.equal(narrow.x, lastPoint.x);
  assert.ok(narrow.y > 260 - 20, "x軸の年ラベル（height-20）より下にある");
  assert.ok(narrow.y < 260, "viewBoxの内側に収まる");
  assert.ok(narrow.y > 260 - 48, "プロット領域（bottom=48）より下にある");
});
