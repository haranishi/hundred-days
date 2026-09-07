// 国土数値情報 行政区域データ 2025年版の都道府県別 zip を tools/cache/n03/ に集め、
// 中の geojson だけを NN.geojson として展開する。build-data.mjs の入力を用意するだけのツール。
// 使い方: node tools/fetch-n03.mjs [NN ...]（県コードを省略すると 01〜47 すべて）
//
// 一度取れば以降は取らない。ダウンロードが途中で切れた zip をそのまま使うと
// build-data が意味の分からない場所で落ちるので、毎回 `unzip -tq` で検証してから使い、
// 壊れていれば消して取り直す。
import { execFile } from 'node:child_process';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = resolve(TOOL_DIR, 'cache/n03');

const DATASET = 'N03-20250101';
const BASE_URL = 'https://nlftp.mlit.go.jp/ksj/gml/data/N03/N03-2025';
const AGENT = 'hundred-days build tool (+https://hundred-days.pages.dev/)';
const PAUSE_MS = 300;
const RETRIES = 3;

export const PREF_CODES = Array.from({ length: 47 }, (_, index) => String(index + 1).padStart(2, '0'));

const zipPathOf = (code) => resolve(CACHE_DIR, `${DATASET}_${code}_GML.zip`);
const geojsonPathOf = (code) => resolve(CACHE_DIR, `${code}.geojson`);
const sleep = (ms) => new Promise((done) => { setTimeout(done, ms); });

async function exists(path) {
  try {
    const info = await stat(path);
    return info.size > 0;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

/** zip が最後まで揃っているか。ダウンロード中・途中で切れたファイルをここで弾く */
async function isCompleteZip(path) {
  try {
    await run('unzip', ['-tq', path]);
    return true;
  } catch {
    return false;
  }
}

async function download(code) {
  const url = `${BASE_URL}/${DATASET}_${code}_GML.zip`;
  const response = await fetch(url, { headers: { 'user-agent': AGENT } });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
  const body = Buffer.from(await response.arrayBuffer());
  // 検証に落ちた半端なファイルを次回「既にある」と誤認しないよう、確定してから本来の名前にする
  const staging = `${zipPathOf(code)}.part`;
  await writeFile(staging, body);
  if (!(await isCompleteZip(staging))) {
    await rm(staging, { force: true });
    throw new Error(`zipが壊れている: ${url}`);
  }
  await rename(staging, zipPathOf(code));
  return body.length;
}

async function ensureZip(code) {
  const path = zipPathOf(code);
  if (await exists(path)) {
    if (await isCompleteZip(path)) return 'cached';
    console.log(`  ${code}: zipが壊れているので取り直す`);
    await rm(path, { force: true });
  }
  for (let attempt = 1; ; attempt += 1) {
    try {
      const size = await download(code);
      return `${(size / 1024 / 1024).toFixed(1)}MB`;
    } catch (error) {
      if (attempt >= RETRIES) throw error;
      console.log(`  ${code}: ${error.message} → 再試行 ${attempt}/${RETRIES - 1}`);
      await sleep(PAUSE_MS * attempt * 4);
    }
  }
}

async function ensureGeojson(code) {
  const path = geojsonPathOf(code);
  if (await exists(path)) return 'cached';
  const inner = `${DATASET}_${code}.geojson`;
  // -j でディレクトリを畳み、目的の1ファイルだけ出す（shp/dbf/xml は使わない）
  await run('unzip', ['-o', '-j', '-q', zipPathOf(code), inner, '-d', CACHE_DIR]);
  await rename(resolve(CACHE_DIR, inner), path);
  return 'extracted';
}

async function main() {
  const requested = process.argv.slice(2).filter((value) => !value.startsWith('-'));
  const codes = requested.length ? requested.map((value) => value.padStart(2, '0')) : PREF_CODES;
  const unknown = codes.filter((code) => !PREF_CODES.includes(code));
  if (unknown.length) throw new Error(`県コードが不正: ${unknown.join(', ')}`);
  await mkdir(CACHE_DIR, { recursive: true });

  let downloaded = 0;
  for (const code of codes) {
    const before = await exists(zipPathOf(code));
    const zip = await ensureZip(code);
    const geojson = await ensureGeojson(code);
    if (zip !== 'cached') downloaded += 1;
    console.log(`${code}: zip=${zip} geojson=${geojson}`);
    // 相手のサーバーを叩き続けない。手元にあった県は待たない
    if (!before) await sleep(PAUSE_MS);
  }
  console.log(`\n完了: ${codes.length}県（新規ダウンロード ${downloaded}件）→ tools/cache/n03/`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
