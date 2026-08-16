import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dayTypeLabel, expectedAt, jstParts, nextServiceStart, scheduleFor, serviceStatus } from "../lib/service.js";

const sample = JSON.parse(await readFile(new URL("./fixtures/network.sample.json", import.meta.url), "utf8"));
const { service } = sample;

// 曜日は 0=日曜, 1〜5=平日, 6=土曜
const MONDAY = 1;
const SUNDAY = 0;
const SATURDAY = 6;

test("jstParts reads the Japanese time even when the device is elsewhere", () => {
  // UTC 2026-08-16 20:30 は日本時間の 8/17(月) 05:30
  assert.deepEqual(jstParts(new Date("2026-08-16T20:30:00Z")), { day: 1, hour: 5, minute: 30 });
  assert.deepEqual(jstParts(new Date("2026-08-16T12:00:00Z")), { day: 0, hour: 21, minute: 0 });
});

test("dayTypeLabel merges Saturday and Sunday", () => {
  // 土曜と日曜は本数がまったく同じ（calendar_dates.txt が土曜を日祝ダイヤへ振り替えている）
  assert.equal(dayTypeLabel(SATURDAY), "土日祝");
  assert.equal(dayTypeLabel(SUNDAY), "土日祝");
  assert.equal(dayTypeLabel(MONDAY), "平日");
});

test("scheduleFor picks the weekday or weekend timetable", () => {
  assert.equal(scheduleFor(service[0], MONDAY).first, "06:12");
  assert.equal(scheduleFor(service[0], SATURDAY).first, "08:20");
  assert.equal(scheduleFor(service[0], SUNDAY).first, "08:20");
});

test("expectedAt sums the live operators for that hour", () => {
  assert.equal(expectedAt(service, MONDAY, 8), 18 + 7);
  assert.equal(expectedAt(service, MONDAY, 6), 2, "秋田市はまだ動いていない時間");
  assert.equal(expectedAt(service, MONDAY, 3), 0);
  assert.equal(expectedAt(service, SUNDAY, 8), 6 + 3);
  assert.equal(expectedAt(null, MONDAY, 8), null, "serviceが無い版のデータでは判定しない");
  assert.equal(expectedAt([{ weekday: { hourly: [1, 2] } }], MONDAY, 0), null, "長さ24でなければ無視する");
});

test("nextServiceStart finds the first departure, including across midnight", () => {
  assert.deepEqual(nextServiceStart(service, { day: MONDAY, hour: 3 }), { hour: 6, dayOffset: 0, label: "6:12" });
  // 平日の終バス後は翌朝まで飛ぶ
  assert.deepEqual(nextServiceStart(service, { day: MONDAY, hour: 23 }), { hour: 6, dayOffset: 1, label: "6:12" });
  // 日曜は初便が遅い
  assert.deepEqual(nextServiceStart(service, { day: SUNDAY, hour: 4 }), { hour: 8, dayOffset: 0, label: "8:20" });
  // その日の最初の運行時間帯でなければ、初便ではないので時単位で丸める
  assert.deepEqual(nextServiceStart(service, { day: MONDAY, hour: 6 }), { hour: 7, dayOffset: 0, label: "7時" });
  assert.deepEqual(nextServiceStart(service, { day: MONDAY, hour: 7 }), { hour: 8, dayOffset: 0, label: "8時" });
  assert.equal(nextServiceStart([{ weekday: { hourly: Array(24).fill(0) } }], { day: MONDAY, hour: 3 }), null);
});

test("nextServiceStart uses the first departure time, not the hour it first shows up", () => {
  // 5:40発の便は hourly[5] ではなく hourly[6] に現れる。「6時」ではなく「5:40」と案内したい
  const early = [{
    weekday: { hourly: [...Array(6).fill(0), 3, 8, ...Array(16).fill(0)], first: "05:40", last: "07:50" },
    saturday: { hourly: Array(24).fill(0), first: "", last: "" },
    sunday: { hourly: Array(24).fill(0), first: "", last: "" },
  }];
  assert.deepEqual(nextServiceStart(early, { day: MONDAY, hour: 2 }), { hour: 6, dayOffset: 0, label: "5:40" });
});

test("serviceStatus separates a quiet night from a feed that stopped sending", () => {
  const night = serviceStatus(service, { day: MONDAY, hour: 2 });
  assert.equal(night.known, true);
  assert.equal(night.expected, 0);
  assert.equal(night.next.label, "6:12", "運行時間外なので次の始発を出す");

  const daytime = serviceStatus(service, { day: MONDAY, hour: 12 });
  assert.equal(daytime.expected, 17);
  assert.equal(daytime.next, null, "走っているはずの時間なので始発の案内は出さない");

  assert.deepEqual(serviceStatus(undefined, { day: MONDAY, hour: 12 }), { known: false, expected: null, next: null });
});
