import test from "node:test";
import assert from "node:assert/strict";
import { boundsCenter, boundsSpanKm, isInsideAkita, toPlane } from "../lib/geo.js";
import {
  clampCamera,
  contentExtremes,
  createCamera,
  createViewport,
  fitContent,
  fitDistance,
  headingVector,
  PITCH_MAX,
  PITCH_MIN,
  projectBounds,
  projectPoint,
} from "../lib/projection.js";

const AKITA = { lon: 140.1, lat: 39.7 };
const viewport = createViewport(1000, 600);
const topDown = { yaw: 0, pitch: 0, distance: 200, minDistance: 10, maxDistance: 500 };

test("toPlane puts the origin at zero and shrinks longitude by cos(latitude)", () => {
  assert.deepEqual(toPlane(AKITA.lon, AKITA.lat, AKITA), { x: 0, y: 0 });
  const north = toPlane(AKITA.lon, AKITA.lat + 1, AKITA);
  assert.ok(Math.abs(north.y - 111.32) < 0.01);
  assert.equal(north.x, 0);
  const east = toPlane(AKITA.lon + 1, AKITA.lat, AKITA);
  // 北緯39.7度では経度1度は約85.6km
  assert.ok(Math.abs(east.x - 85.6) < 0.5);
  assert.equal(east.y, 0);
});

test("boundsCenter and boundsSpanKm read the bbox, with a fallback for broken input", () => {
  const center = boundsCenter([139.7, 39.0, 141.1, 40.4]);
  assert.ok(Math.abs(center.lon - 140.4) < 1e-9);
  assert.ok(Math.abs(center.lat - 39.7) < 1e-9);
  assert.deepEqual(boundsCenter(undefined), { lon: 140.1, lat: 39.7 });
  const span = boundsSpanKm([139.7, 39.0, 141.1, 40.4], { lon: 140.4, lat: 39.7 });
  assert.ok(Math.abs(span.height - 155.8) < 1);
  assert.ok(Math.abs(span.width - 119.9) < 1);
});

test("isInsideAkita rejects coordinates outside the prefecture", () => {
  assert.equal(isInsideAkita(39.7, 140.1), true);
  assert.equal(isInsideAkita(35.68, 139.76), false);
});

test("projectPoint places the origin at the screen centre", () => {
  const point = projectPoint(0, 0, 0, topDown, viewport);
  assert.equal(point.visible, true);
  assert.ok(Math.abs(point.x - 500) < 1e-9);
  assert.ok(Math.abs(point.y - 300) < 1e-9);
});

test("projectPoint keeps north up and east right when looking straight down", () => {
  const north = projectPoint(0, 10, 0, topDown, viewport);
  const east = projectPoint(10, 0, 0, topDown, viewport);
  assert.ok(north.y < 300, "北は画面の上へ");
  assert.equal(Math.round(north.x), 500);
  assert.ok(east.x > 500, "東は画面の右へ");
  assert.equal(Math.round(east.y), 300);
});

test("projectPoint pushes the far side of the map away when the camera is tilted", () => {
  const tilted = { ...topDown, pitch: 60 };
  const far = projectPoint(0, 60, 0, tilted, viewport);
  const near = projectPoint(0, -60, 0, tilted, viewport);
  assert.ok(far.depth > near.depth, "北側のほうが遠い");
  assert.ok(far.scale < near.scale, "遠いほど小さく描かれる");
  assert.ok(far.y < near.y, "遠いほど画面の上に来る");
});

test("projectPoint rotates the map with yaw", () => {
  const yawed = { ...topDown, yaw: 90 };
  const north = projectPoint(0, 10, 0, yawed, viewport);
  // ヨー90度では北が画面の右を向く
  assert.ok(north.x > 500);
  assert.ok(Math.abs(north.y - 300) < 1e-6);
});

test("projectPoint reports points behind the camera as invisible", () => {
  const close = { ...topDown, pitch: 78, distance: 20 };
  const behind = projectPoint(0, -200, 0, close, viewport);
  assert.equal(behind.visible, false);
});

test("projectPoint lifts height above the ground point", () => {
  const tilted = { ...topDown, pitch: 60 };
  const ground = projectPoint(0, 0, 0, tilted, viewport);
  const roof = projectPoint(0, 0, 5, tilted, viewport);
  assert.ok(roof.y < ground.y, "高いほど画面の上へ");
});

test("fitDistance grows with the map and shrinks with the viewport", () => {
  const camera = createCamera();
  const small = fitDistance({ width: 100, height: 100 }, camera, viewport);
  const large = fitDistance({ width: 200, height: 200 }, camera, viewport);
  assert.ok(large > small * 1.9);
  const wide = fitDistance({ width: 100, height: 100 }, camera, createViewport(2000, 600));
  assert.ok(wide <= small);
  // 収めた距離で投影すれば、端の点が画面内に収まる
  const fitted = { ...camera, distance: fitDistance({ width: 120, height: 160 }, camera, viewport) };
  const corner = projectPoint(60, 80, 0, fitted, viewport);
  assert.ok(corner.x >= 0 && corner.x <= viewport.width);
  assert.ok(corner.y >= 0 && corner.y <= viewport.height);
});

test("clampCamera keeps pitch, distance, and yaw inside their limits", () => {
  const camera = clampCamera({ yaw: -30, pitch: 120, distance: 5, minDistance: 40, maxDistance: 600 });
  assert.equal(camera.yaw, 330);
  assert.equal(camera.pitch, PITCH_MAX);
  assert.equal(camera.distance, 40);
  assert.equal(clampCamera({ ...camera, pitch: -5 }).pitch, PITCH_MIN);
  assert.equal(clampCamera({ ...camera, distance: 9999 }).distance, 600);
  assert.equal(clampCamera({ ...camera, yaw: 400 }).yaw, 40);
});

test("projectPoint centres the camera target and applies the screen offset", () => {
  const target = { ...topDown, targetX: 10, targetY: -5 };
  const centred = projectPoint(10, -5, 0, target, viewport);
  assert.ok(Math.abs(centred.x - 500) < 1e-9);
  assert.ok(Math.abs(centred.y - 300) < 1e-9);

  const shifted = projectPoint(0, 0, 0, { ...topDown, offsetX: 20, offsetY: -30 }, viewport);
  assert.ok(Math.abs(shifted.x - 520) < 1e-9);
  assert.ok(Math.abs(shifted.y - 270) < 1e-9);
});

test("contentExtremes keeps the outermost points and drops the interior", () => {
  // 正方形の四隅＋中央。中央は どの方向から見ても外側に来ないので落ちる
  const points = Float32Array.from([-10, -10, 10, -10, 10, 10, -10, 10, 0, 0]);
  const extremes = contentExtremes(points, 16);
  assert.equal(extremes.length / 2, 4);
  for (let index = 0; index < 4; index += 1) {
    assert.equal(Math.abs(extremes[index * 2]), 10);
    assert.equal(Math.abs(extremes[index * 2 + 1]), 10);
  }
});

test("fitContent fills the frame with the real points, not the bounding rectangle", () => {
  const camera = createCamera({ yaw: -20, pitch: 56 });
  // 長方形の角が空いている点群。bbox で合わせると余白が残る形
  const points = Float64Array.from([0, 80, 60, 0, 0, -80, -60, 0, 30, 40, -30, -40]);
  const rough = fitDistance({ width: 120, height: 160 }, camera, viewport);
  const fit = fitContent(points, camera, viewport, { start: rough });

  const box = projectBounds(points, { ...camera, ...fit }, viewport);
  const filled = Math.max(box.width / viewport.width, box.height / viewport.height);
  assert.ok(filled > 0.9, `画面いっぱいに収まっていない（${filled.toFixed(2)}）`);
  assert.ok(box.minX >= -1 && box.maxX <= viewport.width + 1);
  assert.ok(box.minY >= -1 && box.maxY <= viewport.height + 1);
  // bbox基準よりカメラが近づく＝同じ画面で県が大きく映る
  assert.ok(fit.distance < rough);
});

test("headingVector points north at zero and east at ninety", () => {
  const north = headingVector(0);
  assert.ok(Math.abs(north.x) < 1e-9 && Math.abs(north.y - 1) < 1e-9);
  const east = headingVector(90);
  assert.ok(Math.abs(east.x - 1) < 1e-9 && Math.abs(east.y) < 1e-9);
});
