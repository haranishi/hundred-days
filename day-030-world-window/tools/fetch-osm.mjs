import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = resolve(TOOL_DIR, 'cache/osm-raw.json');
const QUERY = '[out:json][timeout:120];(node["contact:webcam"];way["contact:webcam"];);out tags center;';

function argumentsFrom(values) {
  if (!values.length) return { fromFile: null };
  if (values.length === 2 && values[0] === '--from-file' && values[1]) return { fromFile: resolve(values[1]) };
  throw new Error('使い方: node tools/fetch-osm.mjs [--from-file <生JSONパス>]');
}

async function fetchOverpass() {
  const endpoint = `https://${'overpass-api.de'}/api/interpreter`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'user-agent': `hundred-days-day030-fetch (+https://${'hundred-days.pages.dev'}/day-030-world-window/)`,
      },
      body: new URLSearchParams({ data: QUERY }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Overpass API: HTTP ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const { fromFile } = argumentsFrom(process.argv.slice(2));
  let raw;
  if (fromFile) {
    raw = JSON.parse(await readFile(fromFile, 'utf8'));
  } else {
    try {
      raw = JSON.parse(await readFile(CACHE_PATH, 'utf8'));
      console.log('既存キャッシュを使用: tools/cache/osm-raw.json');
      return;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      raw = await fetchOverpass();
    }
  }
  if (!Array.isArray(raw?.elements)) throw new Error('Overpass JSONにelementsがありません');
  await mkdir(dirname(CACHE_PATH), { recursive: true });
  await writeFile(CACHE_PATH, `${JSON.stringify(raw)}\n`);
  console.log(`保存: tools/cache/osm-raw.json (${raw.elements.length}件)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
