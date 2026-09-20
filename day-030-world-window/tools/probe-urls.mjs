import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYouTubeUrl } from '../lib/youtube.js';
import { classifyUrl, isExcluded, kindFromContentType, readExcludeHosts, upgradeToHttps } from './url-kind.mjs';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const RAW_PATH = resolve(TOOL_DIR, 'cache/osm-raw.json');
const PROBE_PATH = resolve(TOOL_DIR, 'cache/probe.json');
const EXCLUDE_PATH = resolve(TOOL_DIR, 'exclude-hosts.txt');
const USER_AGENT = `hundred-days-day030-probe (+https://${'hundred-days.pages.dev'}/day-030-world-window/)`;

function parseArguments(values) {
  let limit = Number.POSITIVE_INFINITY;
  let recheck = false;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === '--recheck') recheck = true;
    else if (values[index] === '--limit' && /^\d+$/.test(values[index + 1] || '')) limit = Number(values[++index]);
    else throw new Error('使い方: node tools/probe-urls.mjs [--limit N] [--recheck]');
  }
  return { limit, recheck };
}

const firstUrl = (element) => String(element.tags?.['contact:webcam'] || '').split(';', 1)[0].trim();

async function existingProbe() {
  try {
    return JSON.parse(await readFile(PROBE_PATH, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function request(url, method = 'HEAD') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    return await fetch(url, {
      method,
      redirect: 'follow',
      headers: {
        'user-agent': USER_AGENT,
        ...(method === 'GET' ? { range: 'bytes=0-0' } : {}),
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function inspectHttp(url) {
  let response = await request(url);
  if ([400, 403, 405].includes(response.status)) response = await request(url, 'GET');
  return response;
}

function record(kind, status, contentType, finalUrl) {
  return { kind, status, contentType: contentType || '', finalUrl, checkedAt: new Date().toISOString() };
}

async function probeOne(url, excludeHosts) {
  const classified = classifyUrl(url);
  if (classified.kind === 'invalid') return record('drop', 'invalid', '', url);
  if (isExcluded(classified.url, excludeHosts)) return record('page', 'excluded', '', classified.url);

  if (classified.kind === 'youtube') {
    const parsed = parseYouTubeUrl(classified.url);
    if (parsed.type === 'channel') return record('yt', 'channel', '', `c:${parsed.id}`);
    if (parsed.type !== 'video') return record('page', 'id-unresolved', '', classified.url);
    const endpoint = new URL(`https://${'www.youtube.com'}/oembed`);
    endpoint.search = new URLSearchParams({ url: classified.url, format: 'json' });
    try {
      const response = await request(endpoint.href, 'GET');
      if (response.status === 200) return record('yt', 200, response.headers.get('content-type'), `v:${parsed.id}`);
      if ([401, 403].includes(response.status)) return record('page', response.status, response.headers.get('content-type'), classified.url);
      if (response.status === 404) return record('drop', 404, response.headers.get('content-type'), classified.url);
      return record('page', response.status, response.headers.get('content-type'), classified.url);
    } catch (error) {
      return record('page', error.name === 'AbortError' ? 'timeout' : 'error', '', classified.url);
    }
  }

  if (classified.kind === 'm3u8') {
    return record(classified.https ? 'hls' : 'page', 'extension', '', classified.url);
  }

  const candidate = classified.https ? classified.url : upgradeToHttps(classified.url);
  const upgraded = candidate !== classified.url;
  try {
    const response = await inspectHttp(candidate);
    const contentType = response.headers.get('content-type') || '';
    if ([404, 410].includes(response.status)) {
      return record(upgraded ? 'page' : 'drop', response.status, contentType, upgraded ? classified.url : response.url || candidate);
    }
    const kind = response.ok || [400, 401, 403, 405].includes(response.status)
      ? kindFromContentType(contentType, candidate) : 'page';
    return record(kind, response.status, contentType, response.url || candidate);
  } catch (error) {
    const code = error.cause?.code || error.code;
    return record(!upgraded && code === 'ENOTFOUND' ? 'drop' : 'page', error.name === 'AbortError' ? 'timeout' : code || 'error', '', classified.url);
  }
}

async function main() {
  const { limit, recheck } = parseArguments(process.argv.slice(2));
  const raw = JSON.parse(await readFile(RAW_PATH, 'utf8'));
  const probe = recheck ? {} : await existingProbe();
  const excludeHosts = readExcludeHosts(await readFile(EXCLUDE_PATH, 'utf8'));
  const unique = [...new Set((raw.elements || []).map(firstUrl).filter(Boolean))];
  const selected = unique.slice(0, limit);
  const pending = selected.filter((url) => recheck || !Object.hasOwn(probe, url));
  const groups = new Map();
  for (const url of pending) {
    let host = `invalid-${groups.size}`;
    try { host = new URL(url).hostname; } catch { /* 不正URL同士を直列化する理由がないため分ける。 */ }
    if (!groups.has(host)) groups.set(host, []);
    groups.get(host).push(url);
  }

  const queues = [...groups.values()];
  let completed = 0;
  async function worker() {
    while (queues.length) {
      const urls = queues.shift();
      for (let index = 0; index < urls.length; index += 1) {
        probe[urls[index]] = await probeOne(urls[index], excludeHosts);
        completed += 1;
        if (completed % 100 === 0) console.error(`進捗: ${completed}/${pending.length}`);
        if (index + 1 < urls.length) await new Promise((done) => setTimeout(done, 300));
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(24, queues.length) }, worker));
  await mkdir(dirname(PROBE_PATH), { recursive: true });
  await writeFile(PROBE_PATH, `${JSON.stringify(probe, null, 2)}\n`);
  console.log(`probe完了: 今回${completed}件、保存${Object.keys(probe).length}件`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
