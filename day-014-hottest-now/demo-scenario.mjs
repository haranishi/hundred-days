import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* record-demo.mjs は file:// でページを開くが、このアプリはESモジュールと fetch を使うので
   file:// では動かない。振り付けの中でローカルHTTPサーバーを立てて開き直す（day-008と同じ手）。
   気温は本物を取りに行くので、録画するたびに数字は変わる。 */
const appDir = dirname(fileURLToPath(import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};
let baseUrl = null;

async function ensureServer() {
  if (baseUrl) return baseUrl;
  const server = createServer(async (request, response) => {
    try {
      let path = decodeURIComponent(new URL(request.url, 'http://x').pathname);
      if (path.endsWith('/')) path += 'index.html';
      const body = await readFile(join(appDir, path));
      response.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' }).end(body);
    } catch {
      response.writeHead(404).end('not found');
    }
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  server.unref();
  baseUrl = `http://127.0.0.1:${server.address().port}/`;
  return baseUrl;
}

async function ready(page) {
  const base = await ensureServer();
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForSelector('#main', { state: 'visible', timeout: 30_000 });
}

export default async function (page, h) {
  await ready(page);
  await h.pause(900);
  await h.scrollTo('.map', 800);          // 地図を画面いっぱいに置く
  await h.pause(1200);
  await page.click('#regions button:nth-child(2)');   // 北海道へ寄る
  await h.pause(2600);
  await page.click('#regions button:nth-child(9)');   // 九州へ寄る
  await h.pause(2600);
  await page.click('#regions button:nth-child(1)');   // 日本ぜんぶへ戻る
  await h.pause(1800);
  await page.locator('#q').pressSequentially('秋田', { delay: 260 });
  await page.click('#search button[type="submit"]');
  await page.waitForSelector('.you__place');
  await h.pause(2400);
  await h.scrollTo('.you__result', 700);
  await h.pause(2200);
  await h.scrollTo('.lists', 700);
  await h.pause(2200);
}

/* 一覧ページに出す静止画は、いちばん暑い場所と自分の街の順位が1枚に入る状態にする。 */
export async function shotSetup(page) {
  await ready(page);
  await page.waitForTimeout(900);
}

/* 一覧ページのサムネは、地図が主役だと分かる位置で撮る */
export const shotScroll = 520;
