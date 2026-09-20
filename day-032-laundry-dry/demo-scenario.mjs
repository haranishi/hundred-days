import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* record-demo.mjs は最初に file:// で開くので fetch も ES モジュールも動かない。
   振り付けの中で、このアプリを配信するミニHTTPサーバーへ開き直す。

   天気は固定応答（2026-09-13 秋田の昼・実応答）に差し替える。
   本物の値のまま撮ると、撮り直すたびに違う映像になって比べられない。 */

const appDir = dirname(fileURLToPath(import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json; charset=utf-8'
};
const AKITA_CODE = '05201';

let baseUrl = null;

async function ensureServer() {
  if (baseUrl) return baseUrl;
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://local').pathname);
      if (path.endsWith('/')) path += 'index.html';
      const body = await readFile(join(appDir, path));
      res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  server.unref();
  baseUrl = `http://127.0.0.1:${server.address().port}/`;
  return baseUrl;
}

async function openReady(page, { fixture = 'akita-current-day.json' } = {}) {
  const current = JSON.parse(
    await readFile(join(appDir, 'tests/fixtures', fixture), 'utf8')
  );
  await page.route('**://api.open-meteo.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(current) }));
  await page.addInitScript((code) => {
    localStorage.setItem('day-032-laundry-dry', JSON.stringify({ code, place: 'sun' }));
  }, AKITA_CODE);
  await page.goto(await ensureServer(), { waitUntil: 'load' });
  await page.waitForSelector('#ready:not([hidden])');
  await page.waitForTimeout(600);
}

export default async function (page, h) {
  await openReady(page);

  // 頭の2秒はここで捨てる前提（切り出しは tools/trim-demo.mjs）
  await h.pause(1600);
  await h.scrollTo('#spans', 700);
  await h.pause(2600);

  await page.click('[data-place="shade"]');
  await h.pause(2800);

  await page.click('[data-place="sun"]');
  await h.pause(2400);

  await page.click('#why > summary');
  await h.pause(600);
  await h.scrollTo('#why-values', 700);
  await h.pause(2800);

  await h.scrollTop(700);
  await h.pause(1200);
}

/* スクショ（1200×750）は結果の画面。判定と3つの所要時間が1枚に入る位置で撮る */
export async function shotSetup(page) {
  await openReady(page);
  await page.waitForTimeout(400);
}
