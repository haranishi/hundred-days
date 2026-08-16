import test from "node:test";
import assert from "node:assert/strict";
import { decodeFeed, isInsideAkita, normalizeVehicles, readVarint } from "../../../functions/api/day-009/vehicles.js";

// ---- テスト用のprotobufを組み立てるヘルパ（デコーダとは別の道具で作る） ----

const varint = (value) => {
  const bytes = [];
  let rest = value;
  while (rest > 127) {
    bytes.push((rest % 128) + 128);
    rest = Math.floor(rest / 128);
  }
  bytes.push(rest);
  return bytes;
};
const tag = (field, wire) => varint(field * 8 + wire);
const lengthField = (field, payload) => [...tag(field, 2), ...varint(payload.length), ...payload];
const varintField = (field, value) => [...tag(field, 0), ...varint(value)];
const textField = (field, value) => lengthField(field, [...new TextEncoder().encode(value)]);
const floatField = (field, value) => {
  const buffer = new DataView(new ArrayBuffer(4));
  buffer.setFloat32(0, value, true);
  return [...tag(field, 5), ...new Uint8Array(buffer.buffer)];
};
const hex = (text) => Uint8Array.from(text.match(/.{2}/g).map((pair) => parseInt(pair, 16)));

const header = (timestamp) => lengthField(1, [...textField(1, "1.0"), ...varintField(2, 0), ...varintField(3, timestamp)]);

const entity = (id, vehicle) => lengthField(2, [...textField(1, id), ...varintField(2, 0), ...lengthField(4, vehicle)]);

const position = ({ lat, lon, bearing, speed }) => [
  ...floatField(1, lat),
  ...floatField(2, lon),
  ...(bearing === undefined ? [] : floatField(3, bearing)),
  ...(speed === undefined ? [] : floatField(5, speed)),
];

/* 2026-08-16 21:24 と 21:25 に実際の上流から取ったバイト列。
   秋田中央交通は 413バイト・3台、秋田市は 109バイトで、フィールドの出現順が両者で違う
   （秋田市は VehicleDescriptor が Position より先に来る）。 */
const CHUO_SAMPLE = hex(
  "0a0d0a03312e30100018c6d786d4061282010a2466373864356432372d323961362d343365382d386633642d3364"
  + "3639656466366363396310002258" + "0a340a2437623032633439642d633437382d343930332d383565662d3935"
  + "3665613933336435616420002a0a31383834333539303233" + "12140dbe061f4215a5110c431d000000002d0000"
  + "244228a4d786d4064204" + "0a023935"
  + "1281010a2430366434346339662d613332312d346261342d393064332d34646437356331313462313210002257"
  + "0a330a2463356232656637302d373935392d343733612d386434312d3036343362366466353533382000"
  + "2a0937363839363830373412140d28c81e4215e01e0c431d000000422d000000002884d786d40642040a023538"
  + "1282010a2437366531653937642d393235622d343863362d393731332d3362366430363431663763361000"
  + "2258" + "0a340a2432623566373035372d616334382d346163642d393263622d3830313765346637633233612000"
  + "2a0a3131363039333136373912140d63a41e4215492b0c431d000040412d0000184228b0d786d40642040a023536",
);
const AKITA_CITY_SAMPLE = hex(
  "0a0d0a03312e30100018bdd886d406125c0a0456502d3122540a230a21e59c9fe697a5e7a59d5f3131e699823430"
  + "e588865fe7b3bbe7b5b131303033303142170a0431303037120949636869676f4255531a04313030371"
  + "20a0d59911e4215651d0c43181220022882cd84d406",
);

// ---- varint ----

test("readVarint reads multi-byte values used by GTFS-RT timestamps", () => {
  assert.deepEqual(readVarint(Uint8Array.from([0x00]), 0), { value: 0, next: 1 });
  assert.deepEqual(readVarint(Uint8Array.from([0x7f]), 0), { value: 127, next: 1 });
  assert.deepEqual(readVarint(Uint8Array.from([0x80, 0x01]), 0), { value: 128, next: 2 });
  // 1786882980 = 実測のtimestamp。32bitのビット演算で組むと壊れる桁
  assert.deepEqual(readVarint(Uint8Array.from([0xa4, 0xd7, 0x86, 0xd4, 0x06]), 0), { value: 1786882980, next: 5 });
  assert.throws(() => readVarint(Uint8Array.from([0x80]), 0), /varint/);
});

// ---- 組み立てたバイト列 ----

test("decodeFeed reads header timestamp, position, speed, and vehicle id", () => {
  const bytes = Uint8Array.from([
    ...header(1786883014),
    ...entity("e1", [
      ...lengthField(2, position({ lat: 39.75658, lon: 140.06892, bearing: 0, speed: 41 })),
      ...varintField(5, 1786882980),
      ...lengthField(8, textField(1, "95")),
    ]),
  ]);
  const feed = decodeFeed(bytes);
  assert.equal(feed.feedTs, 1786883014);
  assert.equal(feed.vehicles.length, 1);
  const [vehicle] = feed.vehicles;
  assert.equal(vehicle.id, "95");
  assert.ok(Math.abs(vehicle.lat - 39.75658) < 1e-5);
  assert.ok(Math.abs(vehicle.lon - 140.06892) < 1e-5);
  assert.equal(vehicle.bearing, 0);
  assert.equal(vehicle.speed, 41);
  assert.equal(vehicle.ts, 1786882980);
});

test("decodeFeed keeps missing bearing and speed as null, not zero", () => {
  const bytes = Uint8Array.from([
    ...header(100),
    ...entity("VP-1", [...lengthField(2, position({ lat: 39.64194, lon: 140.11482 })), ...varintField(5, 90)]),
  ]);
  const [vehicle] = decodeFeed(bytes).vehicles;
  assert.equal(vehicle.bearing, null);
  assert.equal(vehicle.speed, null);
  // VehicleDescriptor が無ければ FeedEntity.id で代用する
  assert.equal(vehicle.id, "VP-1");
});

test("decodeFeed ignores unknown fields and reads fields in any order", () => {
  const bytes = Uint8Array.from([
    ...header(100),
    ...varintField(9, 12345), // 知らないフィールドは読み飛ばす
    ...entity("e1", [
      ...lengthField(8, textField(1, "1007")), // VehicleDescriptor が Position より先
      ...varintField(3, 18),
      ...lengthField(2, position({ lat: 39.7, lon: 140.1 })),
      ...varintField(5, 90),
    ]),
  ]);
  const [vehicle] = decodeFeed(bytes).vehicles;
  assert.equal(vehicle.id, "1007");
  assert.ok(Math.abs(vehicle.lat - 39.7) < 1e-5);
});

// ---- 実測のバイト列 ----

test("decodeFeed matches the captured 秋田中央交通 feed", () => {
  const feed = decodeFeed(CHUO_SAMPLE);
  assert.equal(CHUO_SAMPLE.length, 413);
  assert.equal(feed.feedTs, 1786883014);
  assert.equal(feed.vehicles.length, 3);
  const { vehicles } = normalizeVehicles(feed.vehicles, "chuo", 1786883014);
  assert.deepEqual(vehicles[0], {
    id: "95", op: "chuo", lat: 39.75658, lon: 140.06892, bearing: 0, speed: 41, ts: 1786882980,
  });
  assert.deepEqual(vehicles.map((vehicle) => vehicle.id), ["95", "58", "56"]);
});

test("decodeFeed matches the captured 秋田市 feed", () => {
  const feed = decodeFeed(AKITA_CITY_SAMPLE);
  assert.equal(AKITA_CITY_SAMPLE.length, 109);
  assert.equal(feed.feedTs, 1786883133);
  assert.equal(feed.vehicles.length, 1);
  const [vehicle] = feed.vehicles;
  assert.ok(Math.abs(vehicle.lat - 39.64194) < 1e-5);
  assert.ok(Math.abs(vehicle.lon - 140.11482) < 1e-5);
  assert.equal(vehicle.bearing, null);
  assert.equal(vehicle.speed, null);
  assert.equal(vehicle.id, "1007");
});

// ---- 正規化 ----

test("normalizeVehicles drops positions older than ten minutes", () => {
  const now = 1786883133;
  const feed = decodeFeed(AKITA_CITY_SAMPLE);
  // 実測データ：フィード自体は39秒前に作られているのに、車両の位置は9時間41分前で止まっている
  assert.ok(now - feed.vehicles[0].ts > 34_000);
  const stale = normalizeVehicles(feed.vehicles, "akitacity", now);
  assert.deepEqual(stale.vehicles, []);
  assert.equal(stale.staleDropped, 1);

  // 同じ車両でも、位置が新しければ残る
  const fresh = normalizeVehicles(feed.vehicles, "akitacity", feed.vehicles[0].ts + 60);
  assert.equal(fresh.vehicles.length, 1);
  assert.equal(fresh.staleDropped, 0);
  assert.equal(fresh.vehicles[0].bearing, null);
});

test("normalizeVehicles keeps vehicles without a timestamp", () => {
  const raw = [{ id: "x", lat: 39.7, lon: 140.1, bearing: null, speed: null, ts: null }];
  const { vehicles, staleDropped } = normalizeVehicles(raw, "chuo", 1786883133);
  assert.equal(vehicles.length, 1);
  assert.equal(vehicles[0].ts, null);
  assert.equal(staleDropped, 0);
});

test("normalizeVehicles drops coordinates outside Akita and rounds to five decimals", () => {
  const raw = [
    { id: "in", lat: 39.756583, lon: 140.068924, bearing: 12.5, speed: 30, ts: 1000 },
    { id: "tokyo", lat: 35.6812, lon: 139.7671, bearing: null, speed: null, ts: 1000 },
    { id: "broken", lat: Number.NaN, lon: 140.1, bearing: null, speed: null, ts: 1000 },
  ];
  const { vehicles } = normalizeVehicles(raw, "chuo", 1000);
  assert.deepEqual(vehicles.map((vehicle) => vehicle.id), ["in"]);
  assert.equal(vehicles[0].lat, 39.75658);
  assert.equal(vehicles[0].lon, 140.06892);
});

test("isInsideAkita covers the prefecture bounds", () => {
  assert.equal(isInsideAkita(39.7, 140.1), true);
  assert.equal(isInsideAkita(38.8, 139.4), true);
  assert.equal(isInsideAkita(40.6, 141.1), true);
  assert.equal(isInsideAkita(38.79, 140.1), false);
  assert.equal(isInsideAkita(40.61, 140.1), false);
  assert.equal(isInsideAkita(39.7, 139.39), false);
  assert.equal(isInsideAkita(39.7, 141.11), false);
  assert.equal(isInsideAkita(null, undefined), false);
});
