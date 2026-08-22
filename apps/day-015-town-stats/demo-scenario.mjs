import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* record-demo.mjs は file:// でページを開くが、このアプリはESモジュールと fetch を使うので
   file:// では動かない。振り付けの中でローカルHTTPサーバーを立てて開き直す（day-008/014と同じ手）。 */
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

/* 一覧ページ用スクショ（1200×750）。record-demoのshoot()はfile://で開くので、
   ここでもサーバー経由で開き直す。秋田市と新宿区の2枚並び＝このアプリの見どころ。 */
export async function shotSetup(page) {
  const base = await ensureServer();
  await page.goto(`${base}?c=05201&vs=13104`, { waitUntil: 'load' });
  await page.waitForSelector('#card-vs', { state: 'visible', timeout: 30_000 });
  await page.evaluate(() => window.scrollTo(0, 240));
  await page.waitForTimeout(250);
}

export default async function (page, h) {
  const base = await ensureServer();
  /* 1コマ目から「動いているところ」にする決まりなので、
     空のトップではなく秋田市のカードが出た状態から録り始める。 */
  await page.goto(`${base}?c=05201`, { waitUntil: 'load' });
  await page.waitForSelector('#card-main', { state: 'visible', timeout: 30_000 });
  await h.pause(1600);
  await h.scrollTo('.stat-list', 900);
  await h.pause(1400);

  // べつの街とくらべる：横浜市
  await h.scrollTo('#compare', 700);
  await h.pause(600);
  await page.selectOption('#vs-pref', '神奈川県');
  await h.pause(700);
  await page.selectOption('#vs-town', { label: '横浜市' });
  await page.waitForSelector('#card-vs', { state: 'visible' });
  await h.pause(500);
  await h.scrollTo('#cards', 900);
  await h.pause(2400);

  // 検索で東京の特別区へ乗り換える
  await h.scrollTo('.picker', 600);
  await page.fill('#search-input', '新宿');
  await h.pause(900);
  await page.locator('#search-results li', { hasText: '新宿区' }).first().click();
  await page.waitForSelector('#card-main', { state: 'visible' });
  await h.pause(2200);
  await h.scrollTo('.stat-list', 800);
  await h.pause(1800);
}
