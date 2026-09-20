#!/usr/bin/env node
// Day 042「台風、うちに来る？」 データ調査用プローブ。
// 気象庁（www.jma.go.jp / www.data.jma.go.jp）だけを叩き、
// HTTPステータス・主要ヘッダ・本文を tests/fixtures/ に保存する。
//
// 使い方:
//   node tools/probe-jma.mjs get <url> <保存ファイル名>
//   node tools/probe-jma.mjs head <url>            # GETして本文は保存せず要約だけ
//   node tools/probe-jma.mjs cors <url>            # Origin付きで叩いてCORSヘッダだけ確認
// 取得記録は tests/fixtures/_probe-log.json に追記される（同じURLは再取得しない）。
//
// cors を分けている理由: 気象庁のCDNは Vary: Origin を返す。Origin無しのリクエストでは
// access-control-allow-origin が付かないことがあり、ブラウザから読めるかの判定を誤る。

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(HERE, '..');
const FIXTURES = path.join(APP_DIR, 'tests', 'fixtures');
const LOG_PATH = path.join(FIXTURES, '_probe-log.json');

const UA = 'hundred-days-day042 (+https://hundred-days.pages.dev/)';
const ALLOWED_HOSTS = new Set(['www.jma.go.jp', 'www.data.jma.go.jp']);

const HEADERS_OF_INTEREST = [
  'content-type',
  'content-length',
  'access-control-allow-origin',
  'access-control-allow-methods',
  'cache-control',
  'last-modified',
  'expires',
  'etag',
  'age',
  'server',
  'content-encoding',
  'vary',
];

async function loadLog() {
  if (!existsSync(LOG_PATH)) return {};
  try {
    return JSON.parse(await readFile(LOG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

async function saveLog(log) {
  await mkdir(FIXTURES, { recursive: true });
  await writeFile(LOG_PATH, JSON.stringify(log, null, 2) + '\n', 'utf8');
}

function assertAllowed(url) {
  const u = new URL(url);
  if (u.protocol !== 'https:') throw new Error(`https以外は叩かない: ${url}`);
  if (!ALLOWED_HOSTS.has(u.host)) throw new Error(`許可外ホスト: ${u.host}`);
}

/** 1回だけ取得する（失敗時の再試行は1回まで）。 */
async function fetchOnce(url, origin) {
  assertAllowed(url);
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const headers = { 'user-agent': UA, accept: '*/*' };
      if (origin) headers.origin = origin;
      const res = await fetch(url, { headers, redirect: 'follow' });
      const buf = Buffer.from(await res.arrayBuffer());
      const seen = {};
      for (const key of HEADERS_OF_INTEREST) {
        const v = res.headers.get(key);
        if (v !== null) seen[key] = v;
      }
      return {
        url,
        finalUrl: res.url,
        status: res.status,
        ok: res.ok,
        headers: seen,
        bytes: buf.length,
        body: buf,
      };
    } catch (err) {
      lastErr = err;
    }
  }
  return { url, status: 0, ok: false, error: String(lastErr), headers: {}, bytes: 0, body: Buffer.alloc(0) };
}

async function main() {
  const [cmd, url, saveAs] = process.argv.slice(2);
  if (!cmd || !url) {
    console.error('usage: node tools/probe-jma.mjs <get|head> <url> [saveAs]');
    process.exit(2);
  }
  const origin = cmd === 'cors' ? 'https://hundred-days.pages.dev' : null;
  const logKey = origin ? `${url} [Origin付き]` : url;
  const log = await loadLog();
  if (log[logKey]) {
    console.log(JSON.stringify({ cached: true, ...log[logKey] }, null, 2));
    return;
  }

  const r = await fetchOnce(url, origin);
  const record = {
    url: r.url,
    finalUrl: r.finalUrl,
    status: r.status,
    fetchedAt: new Date().toISOString(),
    headers: r.headers,
    bytes: r.bytes,
    error: r.error || null,
    savedAs: null,
    requestOrigin: origin,
  };

  if (cmd === 'get' && saveAs && r.ok) {
    await mkdir(FIXTURES, { recursive: true });
    const dest = path.join(FIXTURES, saveAs);
    await writeFile(dest, r.body);
    record.savedAs = path.relative(APP_DIR, dest);
  }

  const text = r.body.toString('utf8');
  record.head300 = text.slice(0, 300);

  log[logKey] = record;
  await saveLog(log);
  console.log(JSON.stringify(record, null, 2));
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
