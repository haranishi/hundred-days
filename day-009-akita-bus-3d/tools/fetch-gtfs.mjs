import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

// 秋田県バス協会などが公開するGTFS-JP静的データ。live=trueは実測リアルタイム位置も公開している事業者。
const OPERATORS = [
  { name: "秋北バス", live: false, url: "https://www.akita-bus.or.jp/~akita-gtfs/bus-shuhokubus.zip" },
  { name: "秋田中央交通", live: true, url: "https://ajt-mobusta-gtfs.mcapps.jp/static/52/latest.zip" },
  { name: "鹿角市", live: false, url: "https://www.akita-bus.or.jp/~akita-gtfs/gtfs-kazunoshi2026.zip" },
  { name: "小坂町", live: false, url: "https://www.akita-bus.or.jp/~akita-gtfs/bus-kosakatown.zip" },
  { name: "能代市", live: false, url: "https://www.akita-bus.or.jp/~akita-gtfs/bus-city-noshiro.zip" },
  { name: "三種町", live: false, url: "https://www.akita-bus.or.jp/~akita-gtfs/R8mitanegtfsdata.zip" },
  { name: "秋田市", live: true, url: "https://www.akita-bus.or.jp/~akita-gtfs/bus-akitacity.zip" },
  { name: "男鹿市", live: false, url: "https://www.city.oga.akita.jp/material/files/group/2/bus-ogacity-2.zip" },
  { name: "潟上市", live: false, url: "https://www.akita-bus.or.jp/~akita-gtfs/bus-katagamicity.zip" },
  { name: "南秋地域広域マイタウンバス", live: false, url: "https://www.akita-bus.or.jp/~akita-gtfs/bus-nansyu.zip" },
  { name: "井川町", live: false, url: "https://www.akita-bus.or.jp/~akita-gtfs/bus-ikawatown.zip" },
  { name: "由利本荘市", live: false, url: "https://www.akita-bus.or.jp/~akita-gtfs/bus-yurihonjyocity.zip" },
  { name: "にかほ市", live: false, url: "https://www.akita-bus.or.jp/~akita-gtfs/bus-nikaho-akita-jp.zip" },
  { name: "大仙市", live: false, url: "https://www.akita-bus.or.jp/~akita-gtfs/bus-daisencity-01.zip" },
  { name: "仙北市", live: false, url: "https://www.akita-bus.or.jp/~akita-gtfs/bus-sembokucity20260301.zip" },
  { name: "横手市", live: false, url: "https://www.akita-bus.or.jp/~akita-gtfs/bus-yokotecity.zip" },
  { name: "湯沢市", live: false, url: "https://www.akita-bus.or.jp/~akita-gtfs/SenshuTaxi_Noriai.zip" },
];

const BOUNDS = { latMin: 38.8, latMax: 40.6, lonMin: 139.4, lonMax: 141.1 };
const DECIMALS = 4; // 小数4桁＝約11m。3D俯瞰ではこれ以上の精度は見えない。
const TOLERANCES = [20, 30, 45, 65, 90, 130]; // Douglas-Peuckerの許容誤差(m)。1.5MBに収まる最初の値を採用する。
const MAX_BYTES = 1_500_000;
const CONCURRENCY = 3; // 相手サーバーへの同時接続数。増やさないこと。
const FETCH_TIMEOUT_MS = 120_000;
const OUTPUT_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../data/network.json");
const CACHE_DIR = join(tmpdir(), "hundred-days-day009-gtfs");

function parseArguments(args) {
  const options = { refresh: false, date: new Date().toISOString().slice(0, 10) };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--refresh") {
      options.refresh = true;
      continue;
    }
    if (args[index] === "--date" && /^\d{4}-\d{2}-\d{2}$/.test(args[index + 1] ?? "")) {
      options.date = args[index + 1];
      index += 1;
      continue;
    }
    throw new Error("使い方: node tools/fetch-gtfs.mjs [--refresh] [--date YYYY-MM-DD]");
  }
  return options;
}

// ---- 取得 ----------------------------------------------------------------

async function downloadZip(operator, options) {
  const cachePath = join(CACHE_DIR, `${operator.name}.zip`);
  if (!options.refresh && existsSync(cachePath)) return cachePath;

  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(operator.url, {
        headers: { "user-agent": "hundred-days-day009-gtfs-fetch/1.0" },
        redirect: "follow",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = Buffer.from(await response.arrayBuffer());
      // zipのローカルファイルヘッダ(PK\x03\x04)が無ければHTMLのエラーページを掴んでいる。
      if (body.subarray(0, 2).toString("latin1") !== "PK") throw new Error("zipではない応答");
      await writeFile(cachePath, body);
      return cachePath;
    } catch (error) {
      lastError = error;
      console.warn(`取得失敗(${attempt}/2): ${operator.name} ${operator.url} (${error.message})`);
      if (attempt === 1) await new Promise((done) => setTimeout(done, 3_000));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(lastError?.message ?? "不明なエラー");
}

async function mapWithLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

// ---- 展開・CSV ------------------------------------------------------------

async function collectFiles(directory, found = new Map()) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(path, found);
      continue;
    }
    const key = entry.name.toLowerCase();
    if (!found.has(key)) found.set(key, path);
  }
  return found;
}

async function extractZip(zipPath, destination) {
  await run("unzip", ["-o", "-q", zipPath, "-d", destination]);
  let files = await collectFiles(destination);
  // フィードを束ねたzip(zip in zip)の場合は1段だけ中を開く。
  if (!files.has("stops.txt")) {
    const nested = [...files.entries()].filter(([name]) => name.endsWith(".zip")).map(([, path]) => path);
    for (const [index, path] of nested.entries()) {
      await run("unzip", ["-o", "-q", path, "-d", join(destination, `nested-${index}`)]).catch(() => {});
    }
    if (nested.length > 0) files = await collectFiles(destination);
  }
  return files;
}

// RFC4180準拠の最小CSVパーサ。GTFSは引用符付きフィールドを普通に含むので split(",") は使えない。
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char !== '"') {
        field += char;
      } else if (text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = false;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") field += char;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function readTable(path) {
  if (!path) return null;
  // Shift_JISの事業者もあるが、利用するのは列名と数値・IDのASCII部分だけなのでUTF-8で読み切る。
  const text = (await readFile(path, "utf8")).replace(/^﻿/, "");
  const rows = parseCsv(text);
  if (rows.length === 0) return null;
  const columns = new Map(rows[0].map((name, index) => [name.trim().toLowerCase(), index]));
  return { columns, rows: rows.slice(1) };
}

function cell(table, row, name) {
  const index = table.columns.get(name);
  return index === undefined ? "" : (row[index] ?? "").trim();
}

// ---- 座標処理 -------------------------------------------------------------

function roundCoord(value) {
  return Number(value.toFixed(DECIMALS));
}

function inBounds(lon, lat) {
  return lat >= BOUNDS.latMin && lat <= BOUNDS.latMax && lon >= BOUNDS.lonMin && lon <= BOUNDS.lonMax;
}

// 緯度経度をメートルに近似展開してから間引く。秋田県内の緯度差では等距円筒近似で十分。
function douglasPeucker(points, tolerance) {
  if (points.length <= 2) return points;
  const kx = 111_320 * Math.cos((points[0][1] * Math.PI) / 180);
  const ky = 110_540;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop();
    if (last - first < 2) continue;
    const ax = points[first][0] * kx;
    const ay = points[first][1] * ky;
    const dx = points[last][0] * kx - ax;
    const dy = points[last][1] * ky - ay;
    const lengthSq = dx * dx + dy * dy;
    let farthest = -1;
    let farthestIndex = -1;
    for (let index = first + 1; index < last; index += 1) {
      const px = points[index][0] * kx;
      const py = points[index][1] * ky;
      let distance;
      if (lengthSq === 0) {
        distance = Math.hypot(px - ax, py - ay);
      } else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
        distance = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      }
      if (distance > farthest) {
        farthest = distance;
        farthestIndex = index;
      }
    }
    if (farthest > tolerance) {
      keep[farthestIndex] = 1;
      stack.push([first, farthestIndex], [farthestIndex, last]);
    }
  }
  return points.filter((_, index) => keep[index] === 1);
}

// 丸め・範囲外除去・連続重複の除去まで済ませたポリラインを返す。ここまでは許容誤差に依存しない。
function normalizePolyline(rawPoints, counters) {
  const points = [];
  for (const [lon, lat] of rawPoints) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      counters.invalid += 1;
      continue;
    }
    if (!inBounds(lon, lat)) {
      counters.outOfBounds += 1;
      continue;
    }
    const point = [roundCoord(lon), roundCoord(lat)];
    const previous = points[points.length - 1];
    if (previous && previous[0] === point[0] && previous[1] === point[1]) continue;
    points.push(point);
  }
  return points;
}

// ---- GTFS読み出し ---------------------------------------------------------

function readShapeLines(files, counters) {
  const table = files.shapes;
  if (!table) return [];
  const groups = new Map();
  for (const row of table.rows) {
    const id = cell(table, row, "shape_id");
    if (!id) continue;
    const lat = Number(cell(table, row, "shape_pt_lat"));
    const lon = Number(cell(table, row, "shape_pt_lon"));
    const sequence = Number(cell(table, row, "shape_pt_sequence"));
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push([Number.isFinite(sequence) ? sequence : groups.get(id).length, lon, lat]);
  }
  const lines = [];
  for (const entries of groups.values()) {
    entries.sort((a, b) => a[0] - b[0]);
    lines.push(normalizePolyline(entries.map(([, lon, lat]) => [lon, lat]), counters));
  }
  return lines;
}

// shapes.txtが無い事業者向け。停留所の並び（＝便ごとの経路）を線に見立てる。
function readStopSequenceLines(files, stopCoords, counters) {
  const table = files.stop_times;
  if (!table || !files.trips) return [];
  const trips = new Map();
  for (const row of table.rows) {
    const tripId = cell(table, row, "trip_id");
    const stopId = cell(table, row, "stop_id");
    if (!tripId || !stopId) continue;
    const sequence = Number(cell(table, row, "stop_sequence"));
    if (!trips.has(tripId)) trips.set(tripId, []);
    trips.get(tripId).push([Number.isFinite(sequence) ? sequence : trips.get(tripId).length, stopId]);
  }
  const patterns = new Set();
  const lines = [];
  for (const entries of trips.values()) {
    entries.sort((a, b) => a[0] - b[0]);
    const key = entries.map(([, stopId]) => stopId).join(">");
    if (patterns.has(key)) continue; // 同じ停留所並びの便が何十本もあるので先に潰す
    patterns.add(key);
    const points = [];
    for (const [, stopId] of entries) {
      const coord = stopCoords.get(stopId);
      if (coord) points.push(coord);
    }
    lines.push(normalizePolyline(points, counters));
  }
  return lines;
}

function readStops(files, counters) {
  const table = files.stops;
  const coords = new Map();
  const points = [];
  const seen = new Set();
  if (!table) return { coords, points };
  for (const row of table.rows) {
    const lat = Number(cell(table, row, "stop_lat"));
    const lon = Number(cell(table, row, "stop_lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      counters.invalid += 1;
      continue;
    }
    coords.set(cell(table, row, "stop_id"), [lon, lat]);
    if (!inBounds(lon, lat)) {
      counters.outOfBounds += 1;
      continue;
    }
    const point = [roundCoord(lon), roundCoord(lat)];
    const key = `${point[0]},${point[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    points.push(point);
  }
  return { coords, points };
}

// ---- 運行時間帯（live=trueの事業者だけ） ----------------------------------

const DAY_COLUMNS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_MS = 86_400_000;

function toEpoch(text) {
  const compact = text.replace(/-/g, "");
  return Date.UTC(Number(compact.slice(0, 4)), Number(compact.slice(4, 6)) - 1, Number(compact.slice(6, 8)));
}

function toCompact(epoch) {
  const date = new Date(epoch);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}${month}${day}`;
}

// GTFSは「25:30」のように24時を超える時刻を使う。秒に直したうえで表示時は翌日側へ畳む。
function parseClock(text) {
  const matched = /^(\d{1,3}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (!matched) return null;
  return Number(matched[1]) * 3600 + Number(matched[2]) * 60 + Number(matched[3] ?? 0);
}

function formatClock(seconds) {
  const hour = String(Math.floor(seconds / 3600) % 24).padStart(2, "0");
  const minute = String(Math.floor(seconds / 60) % 60).padStart(2, "0");
  return `${hour}:${minute}`;
}

function feedRange(files) {
  let start = "99999999";
  let end = "00000000";
  for (const row of files.calendar?.rows ?? []) {
    const from = cell(files.calendar, row, "start_date");
    const to = cell(files.calendar, row, "end_date");
    if (from && from < start) start = from;
    if (to && to > end) end = to;
  }
  for (const row of files.calendar_dates?.rows ?? []) {
    const date = cell(files.calendar_dates, row, "date");
    if (!date) continue;
    if (date < start) start = date;
    if (date > end) end = date;
  }
  return start <= end ? { start, end } : null;
}

// 生成日以降で最初に来るその曜日を代表日にする。フィードの有効期間外なら週単位で寄せる。
function representativeDate(baseDate, targetDow, range) {
  let epoch = toEpoch(baseDate);
  for (let step = 0; step < 7 && new Date(epoch).getUTCDay() !== targetDow; step += 1) epoch += DAY_MS;
  if (!range) return epoch;
  for (let step = 0; step < 520 && toCompact(epoch) > range.end; step += 1) epoch -= 7 * DAY_MS;
  for (let step = 0; step < 520 && toCompact(epoch) < range.start; step += 1) epoch += 7 * DAY_MS;
  return epoch;
}

function activeServices(files, compactDate, dow) {
  const active = new Set();
  for (const row of files.calendar?.rows ?? []) {
    const id = cell(files.calendar, row, "service_id");
    if (!id) continue;
    const start = cell(files.calendar, row, "start_date");
    const end = cell(files.calendar, row, "end_date");
    if (start && compactDate < start) continue;
    if (end && compactDate > end) continue;
    if (cell(files.calendar, row, DAY_COLUMNS[dow]) === "1") active.add(id);
  }
  for (const row of files.calendar_dates?.rows ?? []) {
    if (cell(files.calendar_dates, row, "date") !== compactDate) continue;
    const id = cell(files.calendar_dates, row, "service_id");
    const exception = cell(files.calendar_dates, row, "exception_type");
    if (exception === "1") active.add(id);
    else if (exception === "2") active.delete(id);
  }
  return active;
}

// 便ごとの[最初の発時刻, 最後の着時刻]。1便の中で時刻は単調増加するので最小・最大で足りる。
function tripSpans(files, active) {
  const targets = new Set();
  for (const row of files.trips?.rows ?? []) {
    const tripId = cell(files.trips, row, "trip_id");
    if (tripId && active.has(cell(files.trips, row, "service_id"))) targets.add(tripId);
  }
  const spans = new Map();
  for (const row of files.stop_times?.rows ?? []) {
    const tripId = cell(files.stop_times, row, "trip_id");
    if (!targets.has(tripId)) continue;
    for (const column of ["arrival_time", "departure_time"]) {
      const seconds = parseClock(cell(files.stop_times, row, column));
      if (seconds === null) continue;
      const span = spans.get(tripId);
      if (!span) spans.set(tripId, [seconds, seconds]);
      else {
        if (seconds < span[0]) span[0] = seconds;
        if (seconds > span[1]) span[1] = seconds;
      }
    }
  }
  return [...spans.values()];
}

function summarizeDay(spans) {
  const hourly = Array.from({ length: 24 }, () => 0);
  for (const [start, end] of spans) {
    for (let hour = 0; hour < 24; hour += 1) {
      const instant = hour * 3600;
      // 24時超えの便を拾うため、翌日側（+24h）でも走行中か調べる。
      if ((start <= instant && instant <= end) || (start <= instant + 86_400 && instant + 86_400 <= end)) {
        hourly[hour] += 1;
      }
    }
  }
  let first = null;
  let last = null;
  for (const [start, end] of spans) {
    if (first === null || start < first) first = start;
    if (last === null || end > last) last = end;
  }
  return {
    hourly,
    first: first === null ? null : formatClock(first),
    last: last === null ? null : formatClock(last),
    tripCount: spans.length,
  };
}

function buildService(files, baseDate) {
  const range = feedRange(files);
  const days = { weekday: 1, saturday: 6, sunday: 0 };
  const summary = {};
  const dates = {};
  for (const [label, dow] of Object.entries(days)) {
    const epoch = representativeDate(baseDate, dow, range);
    const compactDate = toCompact(epoch);
    dates[label] = compactDate;
    summary[label] = summarizeDay(tripSpans(files, activeServices(files, compactDate, dow)));
  }
  return { summary, dates };
}

async function loadOperator(operator, options) {
  const zipPath = await downloadZip(operator, options);
  const workDir = await mkdtemp(join(tmpdir(), "day009-gtfs-"));
  try {
    const paths = await extractZip(zipPath, workDir);
    const files = {
      shapes: await readTable(paths.get("shapes.txt")),
      stops: await readTable(paths.get("stops.txt")),
      trips: await readTable(paths.get("trips.txt")),
      stop_times: await readTable(paths.get("stop_times.txt")),
      calendar: await readTable(paths.get("calendar.txt")),
      calendar_dates: await readTable(paths.get("calendar_dates.txt")),
    };
    if (!files.stops) throw new Error("stops.txt が見つからない");
    const counters = { invalid: 0, outOfBounds: 0 };
    const { coords, points: stops } = readStops(files, counters);

    let lines = readShapeLines(files, counters).filter((line) => line.length >= 2);
    // shapedは「道なりの実形状か」を表す。falseの線は停留所を直線で結んだだけの近似なので、
    // 同じ路線図として黙って混ぜず、アプリ側で見分けられるように出力へ持ち出す。
    let shaped = lines.length > 0;
    let method = "shapes.txt";
    if (!shaped) {
      lines = readStopSequenceLines(files, coords, counters).filter((line) => line.length >= 2);
      method = lines.length > 0 ? "停留所並びで代用" : "停留所のみ（線なし）";
    }
    // 夜間に0台なのが正常だと画面で言い切るため、実測位置を出す事業者だけ時刻表も集計する。
    const service = operator.live ? buildService(files, options.date) : null;

    return {
      operator,
      method,
      shaped,
      service,
      lines,
      stops,
      counters,
      entries: [...paths.keys()].filter((name) => name.endsWith(".txt")).sort(),
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

// ---- 出力の組み立て -------------------------------------------------------

function buildNetwork(loaded, tolerance, generatedAt) {
  const operators = [];
  const lines = [];
  const stops = [];
  const service = [];
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];

  const extend = ([lon, lat]) => {
    if (lon < bbox[0]) bbox[0] = lon;
    if (lat < bbox[1]) bbox[1] = lat;
    if (lon > bbox[2]) bbox[2] = lon;
    if (lat > bbox[3]) bbox[3] = lat;
  };

  for (const item of loaded) {
    const index = operators.length;
    const seen = new Set();
    const kept = [];
    for (const raw of item.lines) {
      const simplified = douglasPeucker(raw, tolerance);
      if (simplified.length < 2) continue;
      // 同じ道を走る路線が大量にあるので、丸め後に一致する線は1本に潰す。往復は同じ線とみなす。
      const forward = JSON.stringify(simplified);
      const backward = JSON.stringify([...simplified].reverse());
      const key = forward < backward ? forward : backward;
      if (seen.has(key)) continue;
      seen.add(key);
      kept.push(simplified);
    }
    kept.sort((a, b) => a[0][0] - b[0][0] || a[0][1] - b[0][1] || a.length - b.length);
    const sortedStops = [...item.stops].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (kept.length === 0 && sortedStops.length === 0) continue;

    operators.push({
      name: item.operator.name,
      live: item.operator.live,
      shaped: item.shaped,
      lineCount: kept.length,
      stopCount: sortedStops.length,
    });
    if (item.service) {
      const entry = { op: index };
      for (const label of ["weekday", "saturday", "sunday"]) {
        const { hourly, first, last } = item.service.summary[label];
        entry[label] = { hourly, first, last };
      }
      service.push(entry);
    }
    for (const points of kept) {
      points.forEach(extend);
      lines.push({ op: index, p: points });
    }
    for (const coord of sortedStops) {
      extend(coord);
      stops.push({ op: index, c: coord });
    }
  }

  return {
    generatedAt,
    source: "秋田県バス協会 公共交通オープンデータ（GTFS-JP）",
    license: "CC BY 4.0",
    bbox: bbox.map(roundCoord),
    operators,
    service,
    lines,
    stops,
  };
}

// ---- 実行 ----------------------------------------------------------------

const options = parseArguments(process.argv.slice(2));
await mkdir(CACHE_DIR, { recursive: true });

const failures = [];
const results = await mapWithLimit(OPERATORS, CONCURRENCY, async (operator) => {
  try {
    return await loadOperator(operator, options);
  } catch (error) {
    failures.push({ name: operator.name, reason: error.message });
    return null;
  }
});
const loaded = results.filter(Boolean);
if (loaded.length === 0) throw new Error("すべての事業者で取得に失敗しました");

let network = null;
let output = "";
let usedTolerance = TOLERANCES[TOLERANCES.length - 1];
for (const tolerance of TOLERANCES) {
  network = buildNetwork(loaded, tolerance, options.date);
  output = `${JSON.stringify(network)}\n`;
  usedTolerance = tolerance;
  if (Buffer.byteLength(output) <= MAX_BYTES) break;
  console.warn(`許容誤差${tolerance}mでは${Buffer.byteLength(output)} bytes＝上限超過。次の値で再生成します。`);
}

await mkdir(dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, output);

const totalPoints = network.lines.reduce((sum, line) => sum + line.p.length, 0);
const outOfBounds = loaded.reduce((sum, item) => sum + item.counters.outOfBounds, 0);
const invalid = loaded.reduce((sum, item) => sum + item.counters.invalid, 0);

console.log(`出力: ${OUTPUT_PATH}`);
console.log(`採用した許容誤差: ${usedTolerance}m`);
console.log(`事業者: ${network.operators.length}件 / 線: ${network.lines.length}本 / 頂点: ${totalPoints.toLocaleString("ja-JP")}点 / 停留所: ${network.stops.length.toLocaleString("ja-JP")}件`);
console.log(`ファイルサイズ: ${Buffer.byteLength(output).toLocaleString("ja-JP")} bytes`);
console.log(`範囲外として除外した点: ${outOfBounds.toLocaleString("ja-JP")}点 / 座標不正: ${invalid}点`);
console.log(`bbox: ${network.bbox.join(", ")}`);
const shapedNames = network.operators.filter((operator) => operator.shaped).map((operator) => operator.name);
console.log(`実形状(shaped=true): ${shapedNames.length}件 ${shapedNames.join("・")}`);
for (const item of loaded.filter((entry) => entry.service)) {
  console.log(`運行時間帯 ${item.operator.name}:`);
  for (const label of ["weekday", "saturday", "sunday"]) {
    const day = item.service.summary[label];
    console.log(`  ${label.padEnd(8)} 代表日${item.service.dates[label]} ${String(day.tripCount).padStart(4)}便 ${day.first ?? "-"}〜${day.last ?? "-"} hourly=[${day.hourly.join(",")}]`);
  }
}
for (const item of loaded) {
  const entry = network.operators.find((operator) => operator.name === item.operator.name);
  console.log(`  ${item.operator.name}: ${item.method} 線${entry?.lineCount ?? 0}本 停留所${entry?.stopCount ?? 0}件 範囲外${item.counters.outOfBounds}点 live=${item.operator.live}`);
}
if (failures.length > 0) {
  console.log(`スキップした事業者: ${failures.map(({ name, reason }) => `${name}(${reason})`).join(", ")}`);
} else {
  console.log("スキップした事業者: なし");
}
