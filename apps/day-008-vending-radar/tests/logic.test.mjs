import test from "node:test";
import assert from "node:assert/strict";
import {
  bearingDeg,
  compass8,
  formatDistance,
  haversineMeters,
  nearestN,
  pickRange,
  typeLabel,
} from "../logic.js";

test("haversineMeters calculates representative distances", () => {
  const tokyoOsaka = haversineMeters(35.6812, 139.7671, 34.7025, 135.4959);
  assert.ok(tokyoOsaka >= 396_000 && tokyoOsaka <= 410_000);
  assert.equal(haversineMeters(35, 139, 35, 139), 0);
  const tokyoShinjuku = haversineMeters(35.6812, 139.7671, 35.6896, 139.7006);
  assert.ok(tokyoShinjuku >= 6_000 && tokyoShinjuku <= 6_600);
});

test("bearingDeg uses north as zero clockwise", () => {
  assert.ok(Math.abs(bearingDeg(0, 0, 1, 0) - 0) <= 0.5);
  assert.ok(Math.abs(bearingDeg(0, 0, 0, 1) - 90) <= 1);
  assert.ok(Math.abs(bearingDeg(0, 0, -1, 0) - 180) <= 0.5);
  assert.ok(Math.abs(bearingDeg(0, 0, 0, -1) - 270) <= 1);
});

test("compass8 covers directions and boundaries", () => {
  const cases = [[0, "北"], [22.49, "北"], [22.5, "北東"], [45, "北東"], [90, "東"], [135, "南東"], [180, "南"], [225, "南西"], [270, "西"], [315, "北西"], [337.49, "北西"], [337.5, "北"], [360, "北"]];
  for (const [degrees, expected] of cases) assert.equal(compass8(degrees), expected);
});

test("formatDistance rounds under 1km to 10m, including 999m", () => {
  assert.equal(formatDistance(87), "約90m");
  assert.equal(formatDistance(1234), "約1.2km");
  assert.equal(formatDistance(999), "約1000m");
});

test("pickRange fits the tenth or farthest result", () => {
  assert.equal(pickRange(Array(10).fill(50)), 300);
  assert.equal(pickRange([50, 60, 70, 80, 100, 200, 300, 500, 700, 900]), 1000);
  assert.equal(pickRange([100, 5000, 12000]), 20000);
  assert.equal(pickRange([]), null);
});

test("nearestN sorts, limits, and preserves equal-distance input order", () => {
  const points = [[0, 1, 1], [0, -1, 2], [0, 0.1, 3]];
  const nearest = nearestN(points, 0, 0, 2);
  assert.equal(nearest.length, 2);
  assert.equal(nearest[0].typeCode, 3);
  assert.equal(nearest[1].typeCode, 1);
  assert.deepEqual(Object.keys(nearest[0]).sort(), ["bearing", "distance", "lat", "lon", "typeCode"].sort());
});

test("typeLabel handles valid, missing, and out-of-range codes", () => {
  const types = ["不明", "飲み物"];
  assert.equal(typeLabel(1, types), "飲み物");
  assert.equal(typeLabel(8, types), "不明");
  assert.equal(typeLabel(undefined, types), "不明");
});
