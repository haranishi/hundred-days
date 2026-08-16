import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildNetwork, operatorLabel, OPERATOR_TABLE, resolveOperatorIndex } from "../lib/network.js";

const sample = JSON.parse(await readFile(new URL("./fixtures/network.sample.json", import.meta.url), "utf8"));

test("buildNetwork counts operators, lines, points, and stops", () => {
  const network = buildNetwork(sample);
  assert.deepEqual(network.totals, { operators: 4, live: 2, shaped: 3, lines: 4, points: 9, stops: 5 });
  assert.ok(Math.abs(network.origin.lon - 140.1) < 1e-9);
  assert.ok(Math.abs(network.origin.lat - 39.7) < 1e-9);
  assert.equal(network.generatedAt, "2026-08-16");
});

test("buildNetwork marks live and shaped lines from the operator table", () => {
  const { lines } = buildNetwork(sample);
  assert.deepEqual([...lines.live], [1, 1, 0, 0]);
  // shaped が書かれていない事業者（4件目）は true 扱い。全路線が近似と誤表示されるほうが害が大きい
  assert.deepEqual([...lines.shaped], [1, 1, 0, 1]);
  assert.deepEqual([...lines.starts], [0, 3, 5, 7, 9]);
});

test("buildNetwork converts coordinates to the plane once", () => {
  const { lines, stops } = buildNetwork(sample);
  // 1本目の先頭は bbox の中心そのものなので原点になる
  assert.ok(Math.abs(lines.xy[0]) < 1e-6);
  assert.ok(Math.abs(lines.xy[1]) < 1e-6);
  // 東へ0.02度 ≒ 1.7km、北へ0.03度 ≒ 3.3km
  assert.ok(Math.abs(lines.xy[4] - 1.71) < 0.05);
  assert.ok(Math.abs(lines.xy[5] - 3.34) < 0.05);
  assert.equal(stops.xy.length, 10);
  assert.deepEqual([...stops.live], [1, 1, 1, 0, 0]);
});

test("buildNetwork survives missing or empty data", () => {
  const empty = buildNetwork(null);
  assert.deepEqual(empty.totals, { operators: 0, live: 0, shaped: 0, lines: 0, points: 0, stops: 0 });
  assert.deepEqual(empty.origin, { lon: 140.1, lat: 39.7 });
  assert.equal(empty.service, null);
  assert.equal(buildNetwork({ operators: [], lines: [], stops: [] }).lines.count, 0);
});

test("operator codes map to operators by an explicit table, not by guessing names", () => {
  assert.deepEqual(OPERATOR_TABLE.map((entry) => entry.op), ["chuo", "akitacity"]);
  assert.equal(resolveOperatorIndex(sample.operators, "chuo"), 0);
  assert.equal(resolveOperatorIndex(sample.operators, "akitacity"), 1);
  assert.equal(resolveOperatorIndex(sample.operators, "unknown"), -1);
  // 表にある名前と完全一致しなければ「対応なし」。似た名前に勝手に寄せない
  assert.equal(resolveOperatorIndex([{ name: "秋田中央交通株式会社" }], "chuo"), -1);
  assert.equal(resolveOperatorIndex(null, "chuo"), -1);
});

test("operatorLabel falls back to the raw code for unknown operators", () => {
  assert.equal(operatorLabel("chuo"), "秋田中央交通");
  assert.equal(operatorLabel("akitacity"), "秋田市（ぐるる・マイタウン・バス）");
  assert.equal(operatorLabel("mystery"), "mystery");
  assert.equal(operatorLabel(undefined), "不明");
});
