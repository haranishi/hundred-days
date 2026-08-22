// 国勢調査2020の境界データ（e-Stat統計GIS・小地域）から、市区町村ごとの
// 「人口加重重心」を作って data/points.json に書く。依存ゼロ。
// 面積重心だと山の中に落ちるが、人口で重み付けると点が市街地に落ちる。
// 使い方: node tools/fetch-centroids.mjs（47県ぶんDL・tools/cache/gis/ にキャッシュ）
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const cacheDir = join(here, 'cache/gis');
const OUT = join(here, '../data/points.json');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
const url = (pref) => `https://www.e-stat.go.jp/gis/statmap-search/data?dlserveyId=A002005212020&code=${pref}&coordSys=1&format=shape&downloadType=5&datum=2000`;

/* ---- ZIP（build-data.mjsと同じ最小実装） ---- */
function readZipEntries(buffer) {
  let eocd = buffer.length - 22;
  while (eocd >= 0 && buffer.readUInt32LE(eocd) !== 0x06054b50) eocd -= 1;
  assert.ok(eocd >= 0, 'EOCDが見つからない');
  let at = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();
  while (at < eocd && buffer.readUInt32LE(at) === 0x02014b50) {
    const method = buffer.readUInt16LE(at + 10);
    const compressedSize = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const localOffset = buffer.readUInt32LE(at + 42);
    const name = buffer.toString('utf8', at + 46, at + 46 + nameLength);
    entries.set(name, { method, compressedSize, localOffset });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
function readZipFile(buffer, entry) {
  const nameLength = buffer.readUInt16LE(entry.localOffset + 26);
  const extraLength = buffer.readUInt16LE(entry.localOffset + 28);
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const raw = buffer.subarray(start, start + entry.compressedSize);
  return entry.method === 8 ? inflateRawSync(raw) : Buffer.from(raw);
}

/* ---- DBF（固定長レコード） ---- */
function* dbfRecords(buffer) {
  const count = buffer.readUInt32LE(4);
  const headerSize = buffer.readUInt16LE(8);
  const recordSize = buffer.readUInt16LE(10);
  const fields = [];
  for (let at = 32; buffer[at] !== 0x0d; at += 32) {
    const name = buffer.toString('ascii', at, at + 11).split('\0')[0];
    fields.push({ name, length: buffer[at + 16] });
  }
  const decoder = new TextDecoder('shift_jis');
  for (let i = 0; i < count; i += 1) {
    const start = headerSize + i * recordSize;
    if (buffer[start] === 0x2a) continue;         // 削除フラグ
    const row = {};
    let pos = start + 1;
    for (const f of fields) {
      row[f.name] = decoder.decode(buffer.subarray(pos, pos + f.length)).trim();
      pos += f.length;
    }
    yield row;
  }
}

/* ---- 本体 ---- */
const townsPath = join(here, '../data/towns.json');
const codes = new Set(JSON.parse(await readFile(townsPath, 'utf8')).towns.map((t) => t.code));

/* 政令市の区コードを市コードへ寄せる（例 14131川崎市川崎区→14130、14118→14100） */
function resolveCode(raw) {
  if (codes.has(raw)) return raw;
  const tail1 = raw.slice(0, 4) + '0';
  if (codes.has(tail1)) return tail1;
  const tail2 = raw.slice(0, 3) + '00';
  if (codes.has(tail2)) return tail2;
  return null;
}

await mkdir(cacheDir, { recursive: true });
const acc = new Map();  // code → {wx, wy, w, ax, ay, a}（人口重みと面積重みを両方持つ）

for (let p = 1; p <= 47; p += 1) {
  const pref = String(p).padStart(2, '0');
  const zipPath = join(cacheDir, `r2ka${pref}.zip`);
  if (!existsSync(zipPath)) {
    const res = await fetch(url(pref), { headers: { 'User-Agent': UA } });
    assert.ok(res.ok, `${pref}のダウンロードに失敗: ${res.status}`);
    await writeFile(zipPath, Buffer.from(await res.arrayBuffer()));
    await new Promise((ok) => setTimeout(ok, 400));   // 行儀
  }
  const zip = await readFile(zipPath);
  const entries = readZipEntries(zip);
  const dbfName = [...entries.keys()].find((n) => n.endsWith('.dbf'));
  assert.ok(dbfName, `${pref}にdbfが無い`);
  const dbf = readZipFile(zip, entries.get(dbfName));
  let rows = 0;
  for (const row of dbfRecords(dbf)) {
    const code = resolveCode(row.PREF + row.CITY);
    if (!code) continue;
    const x = Number(row.X_CODE);
    const y = Number(row.Y_CODE);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const jinko = Number(row.JINKO) || 0;           // 秘匿「*」等は0扱い
    const area = Number(row.AREA) || 0;
    const a = acc.get(code) ?? { wx: 0, wy: 0, w: 0, ax: 0, ay: 0, a: 0 };
    a.wx += x * jinko; a.wy += y * jinko; a.w += jinko;
    a.ax += x * area; a.ay += y * area; a.a += area;
    acc.set(code, a);
    rows += 1;
  }
  console.log(`${pref}: 小地域${rows}件`);
}

const points = {};
for (const [code, a] of acc) {
  const usePop = a.w > 0;                            // 双葉町(人口0)は面積重心に落ちる
  const lon = usePop ? a.wx / a.w : a.ax / a.a;
  const lat = usePop ? a.wy / a.w : a.ay / a.a;
  points[code] = [Number(lon.toFixed(4)), Number(lat.toFixed(4))];
}

assert.equal(Object.keys(points).length, 1741, `点が1,741件でない: ${Object.keys(points).length}`);
const [akLon, akLat] = points['05201'];
assert.ok(Math.abs(akLon - 140.1) < 0.3 && Math.abs(akLat - 39.72) < 0.3, `秋田市の点が変: ${akLon},${akLat}`);
for (const [code, [lon, lat]] of Object.entries(points)) {
  assert.ok(lon > 122 && lon < 154 && lat > 24 && lat < 46, `${code}が日本の外: ${lon},${lat}`);
}
await writeFile(OUT, JSON.stringify(points));
console.log(`points.json を書き出した: ${Object.keys(points).length}件 / 検算通過`);
