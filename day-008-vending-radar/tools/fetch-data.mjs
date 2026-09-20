import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const QUERY = '[out:json][timeout:180]; area["ISO3166-1"="JP"][admin_level=2]->.jp; node["amenity"="vending_machine"](area.jp); out body;';
const TYPES = ["不明", "飲み物", "食べ物", "たばこ", "きっぷ", "コーヒー", "アイス", "お菓子", "新聞", "その他"];
const OUTPUT_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../data/vending.json");

function parseArguments(args) {
  if (args.length === 0) return { fromFile: null };
  if (args.length === 2 && args[0] === "--from-file" && args[1]) return { fromFile: args[1] };
  throw new Error("使い方: node tools/fetch-data.mjs [--from-file <生JSONパス>]");
}

async function downloadOverpass() {
  let lastError;
  for (const endpoint of ENDPOINTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 180_000);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: new URLSearchParams({ data: QUERY }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      console.warn(`取得失敗: ${endpoint} (${error.message})`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`すべてのOverpass APIで取得に失敗しました: ${lastError?.message ?? "不明なエラー"}`);
}

function exclusionReason(lat, lon) {
  if (lat < 24 || lat > 45.9 || lon < 122.9 || lon > 146) return "範囲外";
  if (lat > 42.3 && lon < 136) return "ロシア沿海州";
  if (lat >= 33.1 && lat <= 33.65 && lon >= 126 && lon <= 127) return "済州島";
  if (lat >= 37.4 && lat <= 37.6 && lon >= 130.7 && lon <= 131) return "鬱陵島";
  const isTsushima = lat >= 34.05 && lat <= 34.75 && lon >= 129.1 && lon <= 129.6;
  if (lat >= 34.2 && lon >= 124 && lon <= 129.6 && !isTsushima) return "韓国本土";
  return null;
}

function typeCode(tags) {
  const value = tags?.vending?.split(";", 1)[0]?.trim().toLowerCase();
  if (!value) return 0;
  if (value === "drinks") return 1;
  if (value === "food") return 2;
  if (value === "cigarettes") return 3;
  if (["public_transport_tickets", "tickets", "train_tickets", "admission_tickets"].includes(value)) return 4;
  if (value === "coffee") return 5;
  if (["ice_cream", "ice_cubes"].includes(value)) return 6;
  if (["sweets", "snacks", "candy"].includes(value)) return 7;
  if (value === "newspapers") return 8;
  return 9;
}

function transform(raw) {
  const excluded = {
    "node・座標不正": 0,
    "範囲外": 0,
    "ロシア沿海州": 0,
    "韓国本土": 0,
    "済州島": 0,
    "鬱陵島": 0,
    "丸め後重複": 0,
  };
  const points = [];
  const seen = new Set();

  for (const element of raw.elements ?? []) {
    if (element?.type !== "node" || !Number.isFinite(element.lat) || !Number.isFinite(element.lon)) {
      excluded["node・座標不正"] += 1;
      continue;
    }
    const reason = exclusionReason(element.lat, element.lon);
    if (reason) {
      excluded[reason] += 1;
      continue;
    }
    const lat = Number(element.lat.toFixed(5));
    const lon = Number(element.lon.toFixed(5));
    const key = `${lat},${lon}`;
    if (seen.has(key)) {
      excluded["丸め後重複"] += 1;
      continue;
    }
    seen.add(key);
    points.push([lat, lon, typeCode(element.tags)]);
  }

  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const generatedAt = String(raw.osm3s?.timestamp_osm_base ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(generatedAt)) {
    throw new Error("osm3s.timestamp_osm_base から生成日を取得できません");
  }
  return {
    data: {
      generatedAt,
      source: "OpenStreetMap © OpenStreetMap contributors, ODbL 1.0",
      count: points.length,
      types: TYPES,
      points,
    },
    excluded,
  };
}

const { fromFile } = parseArguments(process.argv.slice(2));
const raw = fromFile ? JSON.parse(await readFile(resolve(fromFile), "utf8")) : await downloadOverpass();
const { data, excluded } = transform(raw);
const output = `${JSON.stringify(data)}\n`;
await mkdir(dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, output);

const distribution = Array.from({ length: TYPES.length }, () => 0);
for (const point of data.points) distribution[point[2]] += 1;
console.log(`出力: ${OUTPUT_PATH}`);
console.log(`件数: ${data.count.toLocaleString("ja-JP")}件`);
console.log(`ファイルサイズ: ${Buffer.byteLength(output).toLocaleString("ja-JP")} bytes`);
console.log(`種類分布: ${TYPES.map((type, index) => `${type}=${distribution[index]}`).join(", ")}`);
console.log(`クリップ・除外数: ${Object.entries(excluded).map(([name, count]) => `${name}=${count}`).join(", ")}`);
