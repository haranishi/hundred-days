import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeVehicles } from "../../../functions/api/day-009/vehicles.js";
import { serviceByOperator } from "../lib/network.js";
import {
  dayTypeLabel,
  expectedAt,
  hourlyCount,
  isOffService,
  jstParts,
  nextServiceStart,
  partitionByService,
  scheduleFor,
  serviceStatus,
} from "../lib/service.js";

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

test("hourlyCount reads one operator's timetable and refuses broken data", () => {
  assert.equal(hourlyCount(service[1], MONDAY, 12), 6);
  assert.equal(hourlyCount(service[1], SUNDAY, 12), 4);
  assert.equal(hourlyCount(service[1], MONDAY, 2), 0);
  assert.equal(hourlyCount(null, MONDAY, 12), null);
  assert.equal(hourlyCount({ weekday: { hourly: [1, 2] } }, MONDAY, 0), null, "長さ24でなければ読まない");
});

/* 2026-08-17未明の実害：秋田市のフィードが座標を固定したまま送信時刻だけ現在時刻に更新し、
   「10分以上古い位置を捨てる」中継API側の判定を素通りするようになった。 */
test("isOffService drops the hours where that operator has no trips at all", () => {
  // 秋田市（service[1]・平日は19:12が終バス）の深夜と、走っている真昼
  assert.equal(isOffService(service[1], { day: MONDAY, hour: 2 }), true);
  assert.equal(isOffService(service[1], { day: MONDAY, hour: 12 }), false);
  // 事業者ごとに別々に見る。同じ21時でも、秋田中央交通（21:40が終バス）はまだ走っている
  assert.equal(isOffService(service[1], { day: MONDAY, hour: 21 }), true);
  assert.equal(isOffService(service[0], { day: MONDAY, hour: 21 }), false);
});

test("isOffService keeps a one-hour grace around the first and last trips", () => {
  // 終バス19:12の便は20時台まで走りうる。hourly[20]が0でも消さない
  assert.equal(hourlyCount(service[1], MONDAY, 20), 0);
  assert.equal(isOffService(service[1], { day: MONDAY, hour: 20 }), false);
  // 猶予は1時間だけ。21時まで来れば運行時間外と言い切る
  assert.equal(isOffService(service[1], { day: MONDAY, hour: 21 }), true);
  // 初便07:05の前も同じ。6時台に車庫を出ている車両を幽霊扱いしない
  assert.equal(isOffService(service[1], { day: MONDAY, hour: 6 }), false);
  assert.equal(isOffService(service[1], { day: MONDAY, hour: 5 }), true);
});

test("isOffService crosses midnight into the other day type", () => {
  // 0時の1時間前は前日の23時。曜日区分（平日／土日祝）も一緒にまたぐ
  const lateWeekday = [{
    weekday: { hourly: [...Array(23).fill(0), 2], first: "23:10", last: "23:40" },
    saturday: { hourly: Array(24).fill(0), first: "", last: "" },
    sunday: { hourly: Array(24).fill(0), first: "", last: "" },
  }];
  // 土曜の0時は「金曜（平日）の23時」の続きなので、まだ運行時間外とは言わない
  assert.equal(isOffService(lateWeekday[0], { day: SATURDAY, hour: 0 }), false);
  // 日曜の0時の前は土曜の23時＝0便。ここは運行時間外
  assert.equal(isOffService(lateWeekday[0], { day: SUNDAY, hour: 0 }), true);
});

test("isOffService never excludes when the timetable cannot be read", () => {
  // 判定できないなら残す。走っているバスを消すほうが害が大きい
  assert.equal(isOffService(null, { day: MONDAY, hour: 2 }), false);
  assert.equal(isOffService(undefined, { day: MONDAY, hour: 2 }), false);
  assert.equal(isOffService({ weekday: { hourly: [1, 2] } }, { day: MONDAY, hour: 2 }), false);
});

test("partitionByService counts the excluded vehicles per operator", () => {
  const serviceByOp = serviceByOperator(service, sample.operators);
  const vehicles = [
    { id: "1007", op: "akitacity" },
    { id: "48", op: "chuo" },
    { id: "x", op: "unknown" },
  ];

  // 平日の深夜0時台＝両社とも運行時間外。対応表にない事業者は判定材料が無いので残す
  const night = partitionByService(vehicles, serviceByOp, { day: MONDAY, hour: 0 });
  assert.deepEqual(night.vehicles.map((vehicle) => vehicle.id), ["x"]);
  assert.deepEqual([...night.offService], [["akitacity", 1], ["chuo", 1]]);

  // 平日21時台＝秋田市だけ運行時間外。走っている事業者の車両は落とさない
  const evening = partitionByService(vehicles, serviceByOp, { day: MONDAY, hour: 21 });
  assert.deepEqual(evening.vehicles.map((vehicle) => vehicle.id), ["48", "x"]);
  assert.deepEqual([...evening.offService], [["akitacity", 1]]);

  // 昼は誰も落とさない
  const noon = partitionByService(vehicles, serviceByOp, { day: MONDAY, hour: 12 });
  assert.equal(noon.vehicles.length, 3);
  assert.equal(noon.offService.size, 0);

  // 時刻表が無い版のデータでは1台も落とさない
  assert.equal(partitionByService(vehicles, {}, { day: MONDAY, hour: 0 }).vehicles.length, 3);
  assert.equal(partitionByService(null, serviceByOp, { day: MONDAY, hour: 0 }).vehicles.length, 0);
});

/* 除外は2段ある。中継APIが「位置が古い車両」を落とし、画面側が「運行時間外の車両」を落とす。
   2026-08-17未明の実データはこの2段を両方通らないと0台にならない。 */
test("the ten-minute rule and the timetable rule both stay in effect", () => {
  const serviceByOp = serviceByOperator(service, sample.operators);
  // 2026-08-17(月) 00:44:34 JST
  const now = Math.floor(Date.parse("2026-08-16T15:44:34Z") / 1000);
  const parts = jstParts(new Date(now * 1000));
  assert.deepEqual(parts, { day: MONDAY, hour: 0, minute: 44 });

  const raw = [
    // 送信時刻だけ新しくなり続ける車両。10分ルールは素通りする（実測の座標）
    { id: "1007", lat: 39.64194, lon: 140.11482, bearing: null, speed: null, ts: now - 3 },
    // 従来どおり送信時刻が止まっている車両。こちらは中継APIが落とす
    { id: "1008", lat: 39.64194, lon: 140.11482, bearing: null, speed: null, ts: now - 46_000 },
  ];

  const relayed = normalizeVehicles(raw, "akitacity", now);
  assert.equal(relayed.staleDropped, 1, "10分ルールが落とすのは古い1台だけ");
  assert.deepEqual(relayed.vehicles.map((vehicle) => vehicle.id), ["1007"]);

  const shown = partitionByService(relayed.vehicles, serviceByOp, parts);
  assert.equal(shown.vehicles.length, 0, "運行時間外なので走行中は0台");
  assert.deepEqual([...shown.offService], [["akitacity", 1]]);
  // 理由ごとに数を分けて持つ（画面でも行を分ける）
  assert.equal(relayed.staleDropped, 1);
  assert.equal([...shown.offService.values()].reduce((total, count) => total + count, 0), 1);
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
