import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BOUNDS, countryAt, inBounds, inRing, project, wrapLon } from "../lib/geo.js";

const world = JSON.parse(readFileSync(new URL("../data/world.json", import.meta.url), "utf8"));

test("project は経度緯度を画面の座標に置く", () => {
  const [left, top] = project(BOUNDS.west, BOUNDS.north, 800, 400);
  assert.ok(Math.abs(left) < 0.001);
  assert.ok(Math.abs(top) < 0.001);

  const [right, bottom] = project(BOUNDS.east, BOUNDS.south, 800, 400);
  assert.ok(Math.abs(right - 800) < 0.001);
  assert.ok(Math.abs(bottom - 400) < 0.001);

  // 東経0度・緯度0度は画面の横中央より少し上（南を切っているぶん中心がずれる）
  const [x, y] = project(0, 0, 800, 400);
  assert.ok(Math.abs(x - 400) < 0.001);
  assert.ok(y > 0 && y < 400);
});

test("inBounds は画面に入らない緯度を弾く", () => {
  assert.equal(inBounds(139.7, 35.7), true, "東京");
  assert.equal(inBounds(0, -89), false, "南極");
  assert.equal(inBounds(0, 89), false, "北極点");
});

test("inRing は多角形の内と外を分ける", () => {
  const square = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];
  assert.equal(inRing(5, 5, square), true);
  assert.equal(inRing(15, 5, square), false);
  assert.equal(inRing(5, 15, square), false);
  assert.equal(inRing(-1, 5, square), false);
});

test("countryAt は実際の地図データで国を当てる", () => {
  const cases = [
    [139.77, 35.68, "日本"],
    [2.35, 48.86, "フランス"],
    [-47.9, -15.79, "ブラジル"],
    [151.21, -33.87, "オーストラリア"],
  ];
  for (const [lon, lat, name] of cases) {
    const hit = countryAt(lon, lat, world.countries);
    assert.ok(hit, `${name} が見つからない`);
    assert.equal(hit.n, name);
  }
});

test("countryAt は海の上なら null を返す", () => {
  // 太平洋のまんなか
  assert.equal(countryAt(-150, 10, world.countries), null);
});

test("同梱の地図データが軽いまま国名を持っている", () => {
  assert.ok(world.countries.length > 150);
  assert.equal(world.license, "public domain");
  // 画面に「undefined」を出さないよう、全部に名前がある
  for (const country of world.countries) {
    assert.ok(country.n && country.n.length > 0, JSON.stringify(country.e));
    assert.ok(country.r.length > 0);
  }
});

test("wrapLon は日付変更線をまたぐ差を畳む", () => {
  assert.equal(wrapLon(10), 10);
  assert.equal(wrapLon(190), -170);
  assert.equal(wrapLon(-190), 170);
  assert.equal(wrapLon(360), 0);
});
