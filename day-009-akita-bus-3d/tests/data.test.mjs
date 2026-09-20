import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const raw = await readFile(new URL("../data/network.json", import.meta.url), "utf8");
const data = JSON.parse(raw);

const BOUNDS = { latMin: 38.8, latMax: 40.6, lonMin: 139.4, lonMax: 141.1 };
const isRounded = (value) => Math.abs(value * 10_000 - Math.round(value * 10_000)) < 1e-6;

test("file stays inside the 1.5MB budget", () => {
  assert.ok(Buffer.byteLength(raw) <= 1_500_000, `too large: ${Buffer.byteLength(raw)} bytes`);
});

test("metadata and operators are complete", () => {
  assert.match(data.generatedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(data.license, "CC BY 4.0");
  assert.ok(data.source.length > 0);
  assert.ok(data.operators.length > 0);
  for (const operator of data.operators) {
    assert.ok(operator.name.length > 0);
    assert.equal(typeof operator.live, "boolean");
    assert.ok(Number.isInteger(operator.lineCount) && operator.lineCount >= 0);
    assert.ok(Number.isInteger(operator.stopCount) && operator.stopCount >= 0);
  }
  const live = data.operators.filter((operator) => operator.live).map((operator) => operator.name);
  assert.deepEqual(live.sort(), ["秋田中央交通", "秋田市"].sort());
});

// shapedがfalseの線は停留所を直線で結んだ近似なので、実形状と混ぜて見せないための区別が要る。
test("every operator declares shaped and exactly five are real shapes", () => {
  for (const operator of data.operators) {
    assert.equal(typeof operator.shaped, "boolean", `shaped missing: ${operator.name}`);
  }
  const shaped = data.operators.filter((operator) => operator.shaped);
  assert.equal(shaped.length, 5);
  assert.deepEqual(
    shaped.map((operator) => operator.name).sort(),
    ["秋北バス", "秋田中央交通", "秋田市", "男鹿市", "にかほ市"].sort(),
  );
});

// 夜間に0台なのは故障ではなく時刻表どおり、と画面で言い切るための裏付けデータ。
test("service covers exactly the live operators", () => {
  const live = data.operators
    .map((operator, index) => ({ operator, index }))
    .filter((entry) => entry.operator.live);
  assert.equal(data.service.length, live.length);
  assert.deepEqual(
    data.service.map((entry) => entry.op).sort((a, b) => a - b),
    live.map((entry) => entry.index).sort((a, b) => a - b),
  );
  for (const entry of data.service) assert.equal(data.operators[entry.op].live, true);
});

test("every service day has 24 non-negative hourly counts", () => {
  for (const entry of data.service) {
    for (const label of ["weekday", "saturday", "sunday"]) {
      const day = entry[label];
      assert.ok(day, `${label} missing for op ${entry.op}`);
      assert.equal(day.hourly.length, 24);
      for (const count of day.hourly) {
        assert.ok(Number.isInteger(count) && count >= 0, `bad hourly count: ${count}`);
      }
      for (const clock of [day.first, day.last]) {
        if (clock !== null) assert.match(clock, /^\d{2}:\d{2}$/);
      }
      // 便がある日は必ず最初と最後の時刻を持つ（画面の「次は◯時頃」に使う）。
      const running = day.hourly.some((count) => count > 0);
      if (running) {
        assert.notEqual(day.first, null);
        assert.notEqual(day.last, null);
      }
    }
  }
});

test("lines are non-empty polylines with valid operator indexes", () => {
  assert.ok(data.lines.length > 0);
  const counts = data.operators.map(() => 0);
  for (const line of data.lines) {
    assert.ok(Number.isInteger(line.op) && line.op >= 0 && line.op < data.operators.length);
    assert.ok(line.p.length >= 2, "polyline needs at least 2 points");
    counts[line.op] += 1;
  }
  assert.deepEqual(counts, data.operators.map((operator) => operator.lineCount));
});

test("stops are unique per operator and match the declared counts", () => {
  assert.ok(data.stops.length > 0);
  const counts = data.operators.map(() => 0);
  const seen = new Set();
  for (const stop of data.stops) {
    assert.ok(Number.isInteger(stop.op) && stop.op >= 0 && stop.op < data.operators.length);
    const key = `${stop.op}:${stop.c[0]},${stop.c[1]}`;
    assert.ok(!seen.has(key), `duplicate stop: ${key}`);
    seen.add(key);
    counts[stop.op] += 1;
  }
  assert.deepEqual(counts, data.operators.map((operator) => operator.stopCount));
});

test("every coordinate is a 4-decimal number inside Akita", () => {
  const check = ([lon, lat]) => {
    assert.equal(typeof lon, "number");
    assert.equal(typeof lat, "number");
    assert.ok(lat >= BOUNDS.latMin && lat <= BOUNDS.latMax, `lat out of Akita: ${lat}`);
    assert.ok(lon >= BOUNDS.lonMin && lon <= BOUNDS.lonMax, `lon out of Akita: ${lon}`);
    assert.ok(isRounded(lon), `lon has over 4 decimals: ${lon}`);
    assert.ok(isRounded(lat), `lat has over 4 decimals: ${lat}`);
  };
  for (const line of data.lines) for (const point of line.p) check(point);
  for (const stop of data.stops) check(stop.c);
});

test("bbox wraps exactly the emitted coordinates", () => {
  const actual = [Infinity, Infinity, -Infinity, -Infinity];
  const extend = ([lon, lat]) => {
    actual[0] = Math.min(actual[0], lon);
    actual[1] = Math.min(actual[1], lat);
    actual[2] = Math.max(actual[2], lon);
    actual[3] = Math.max(actual[3], lat);
  };
  for (const line of data.lines) for (const point of line.p) extend(point);
  for (const stop of data.stops) extend(stop.c);
  assert.deepEqual(data.bbox, actual);
});

test("no polyline is duplicated within the same operator", () => {
  const seen = new Set();
  for (const line of data.lines) {
    const forward = JSON.stringify(line.p);
    const backward = JSON.stringify([...line.p].reverse());
    const key = `${line.op}:${forward < backward ? forward : backward}`;
    assert.ok(!seen.has(key), `duplicate polyline for operator ${line.op}`);
    seen.add(key);
  }
});
