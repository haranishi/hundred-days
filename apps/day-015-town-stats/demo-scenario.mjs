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
   ここでもサーバー経由で開き直す。見どころ＝順位ヒートマップの日本列島。 */
export async function shotSetup(page) {
  const base = await ensureServer();
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForSelector('#map-section', { state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    document.getElementById('map').scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(300);
}

export default async function (page, h) {
  const base = await ensureServer();
  /* 1コマ目から「動いているところ」＝ヒートマップの日本列島を見せる */
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForSelector('#map-section', { state: 'visible', timeout: 30_000 });
  await h.scrollTo('#map-section', 400);
  await h.pause(2000);

  // 指標を切り替えて塗りが変わるところ
  await page.locator('#map-metrics .chip[data-metric="dens"]').click();
  await h.pause(1800);
  await page.locator('#map-metrics .chip[data-metric="single"]').click();
  await h.pause(1800);

  // 地図の点を押して街を選ぶ（新宿区）
  const at = await page.evaluate(() => window.__day015Project('13104'));
  if (at) {
    await page.mouse.click(at[0], at[1]);
    await page.waitForSelector('#card-main', { state: 'visible' });
  }
  await h.pause(900);
  await h.scrollTo('.stat-list', 900);
  await h.pause(2200);

  // 地図へ戻ると選択リングが付いている
  await h.scrollTo('#map-section', 800);
  await h.pause(1600);
  await page.locator('#map-metrics .chip[data-metric="ageAvg"]').click();
  await h.pause(1800);
}
