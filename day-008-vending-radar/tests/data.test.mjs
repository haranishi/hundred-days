import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const data = JSON.parse(await readFile(new URL("../data/vending.json", import.meta.url), "utf8"));

test("data count and volume are valid", () => {
  assert.equal(data.count, data.points.length);
  assert.ok(data.count > 10_000);
});

test("every point has valid clipped coordinates and type", () => {
  for (const [lat, lon, code] of data.points) {
    assert.ok(lat >= 24 && lat <= 45.9);
    assert.ok(lon >= 122.9 && lon <= 146);
    assert.ok(Number.isInteger(code) && code >= 0 && code < data.types.length);
    assert.ok(Math.abs(lat * 100_000 - Math.round(lat * 100_000)) < 1e-6, `lat has over 5 decimals: ${lat}`);
    assert.ok(Math.abs(lon * 100_000 - Math.round(lon * 100_000)) < 1e-6, `lon has over 5 decimals: ${lon}`);
  }
});

test("points are sorted by latitude then longitude", () => {
  for (let index = 1; index < data.points.length; index += 1) {
    const previous = data.points[index - 1];
    const current = data.points[index];
    assert.ok(previous[0] < current[0] || (previous[0] === current[0] && previous[1] <= current[1]));
  }
});
