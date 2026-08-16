import test from "node:test";
import assert from "node:assert/strict";
import { bearingBetween, chooseHeading, lerpAngle, sampleTrack, trackKey, updateTracks } from "../lib/interpolate.js";

const vehicle = (overrides) => ({ id: "95", op: "chuo", lat: 39.7, lon: 140.1, bearing: null, speed: 30, ts: 1000, ...overrides });

test("bearingBetween measures clockwise from north", () => {
  assert.ok(Math.abs(bearingBetween(39.7, 140.1, 39.8, 140.1) - 0) < 0.01);
  assert.ok(Math.abs(bearingBetween(39.7, 140.1, 39.7, 140.2) - 90) < 0.01);
  assert.ok(Math.abs(bearingBetween(39.7, 140.1, 39.6, 140.1) - 180) < 0.01);
  assert.ok(Math.abs(bearingBetween(39.7, 140.1, 39.7, 140.0) - 270) < 0.01);
  assert.equal(bearingBetween(39.7, 140.1, 39.7, 140.1), null);
});

test("bearingBetween corrects longitude by latitude", () => {
  // 緯度差と経度差が同じでも、北緯39.7度では東西方向が約77%に縮むので、真北東(45度)にはならない
  const angle = bearingBetween(39.7, 140.1, 39.71, 140.11);
  assert.ok(angle > 30 && angle < 45);
});

test("lerpAngle takes the shortest way around", () => {
  assert.equal(lerpAngle(0, 90, 0.5), 45);
  assert.equal(lerpAngle(350, 10, 0.5), 0);
  assert.equal(lerpAngle(10, 350, 0.5), 0);
  assert.equal(lerpAngle(90, 90, 0.3), 90);
});

test("chooseHeading treats a reported zero the same as a missing value", () => {
  assert.equal(chooseHeading(45, 200, 300), 45);
  assert.equal(chooseHeading(0, 200, 300), 200, "0は移動方向で上書きする");
  assert.equal(chooseHeading(null, 200, 300), 200);
  assert.equal(chooseHeading(null, null, 300), 300);
  assert.equal(chooseHeading(null, null, null), 0);
  assert.equal(chooseHeading(370, null, null), 10);
});

test("sampleTrack interpolates position and turns twice as fast", () => {
  const track = {
    from: { lat: 39.7, lon: 140.1, heading: 0 },
    to: { lat: 39.8, lon: 140.2, heading: 90 },
    startedAt: 1000,
    duration: 20_000,
  };
  const start = sampleTrack(track, 1000);
  assert.ok(Math.abs(start.lat - 39.7) < 1e-9);
  const middle = sampleTrack(track, 11_000);
  assert.ok(Math.abs(middle.lat - 39.75) < 1e-9);
  assert.ok(Math.abs(middle.lon - 140.15) < 1e-9);
  assert.equal(middle.heading, 90, "向きは半分の時間で追いつく");
  const past = sampleTrack(track, 99_000);
  assert.ok(Math.abs(past.lat - 39.8) < 1e-9, "進捗は1で止まる");
  assert.equal(past.progress, 1);
});

test("updateTracks places a newly seen vehicle without sliding it in", () => {
  const tracks = updateTracks(new Map(), [vehicle({ bearing: 120 })], 5_000);
  const track = tracks.get("chuo:95");
  assert.equal(tracks.size, 1);
  assert.equal(track.duration, 0);
  assert.deepEqual(track.from, track.to);
  assert.equal(track.to.heading, 120);
  assert.equal(track.moved, false);
});

test("updateTracks moves a vehicle from where it is now to the new position", () => {
  const first = updateTracks(new Map(), [vehicle()], 0);
  const second = updateTracks(first, [vehicle({ lat: 39.8 })], 20_000, { duration: 20_000 });
  const track = second.get("chuo:95");
  assert.equal(track.duration, 20_000);
  assert.equal(track.moved, true);
  assert.ok(Math.abs(track.from.lat - 39.7) < 1e-9);
  assert.ok(Math.abs(track.to.lat - 39.8) < 1e-9);
  assert.equal(track.to.heading, 0, "bearingが無いので移動方向（真北）を向く");

  // 補間の途中で次の位置が来たら、いま画面にいる場所から続ける（巻き戻さない）
  const third = updateTracks(second, [vehicle({ lat: 39.9 })], 30_000, { duration: 20_000 });
  const continued = third.get("chuo:95");
  assert.ok(continued.from.lat > 39.74 && continued.from.lat < 39.76);
});

test("updateTracks keeps a standing vehicle still and drops vanished ones", () => {
  const first = updateTracks(new Map(), [vehicle({ bearing: 90 })], 0);
  const second = updateTracks(first, [vehicle({ bearing: 0 })], 20_000);
  const track = second.get("chuo:95");
  assert.equal(track.moved, false);
  assert.equal(track.duration, 0);
  assert.equal(track.to.heading, 90, "動いていないので直前の向きを保つ");

  const third = updateTracks(second, [], 40_000);
  assert.equal(third.size, 0);
});

test("updateTracks jumps straight to the new position when motion is reduced", () => {
  const first = updateTracks(new Map(), [vehicle()], 0);
  const second = updateTracks(first, [vehicle({ lat: 39.8 })], 20_000, { instant: true });
  assert.equal(second.get("chuo:95").duration, 0);
  assert.ok(Math.abs(sampleTrack(second.get("chuo:95"), 20_000).lat - 39.8) < 1e-9);
});

test("trackKey separates operators that reuse the same vehicle id", () => {
  assert.equal(trackKey({ op: "chuo", id: "95" }), "chuo:95");
  assert.notEqual(trackKey({ op: "chuo", id: "95" }), trackKey({ op: "akitacity", id: "95" }));
});
