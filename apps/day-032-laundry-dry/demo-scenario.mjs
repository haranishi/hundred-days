import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* record-demo.mjs は最初に file:// で開くので fetch も ES モジュールも動かない。
   振り付けの中で、このアプリを配信するミニHTTPサーバーへ開き直す。

   天気は固定応答（E2Eと同じ2026-09-08の秋田）に差し替え、時計も止める。
   本物の予報のまま撮ると、撮り直すたびに違う映像になって比べられない。 */

const appDir = dirname(fileURLToPath(import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json; charset=utf-8'
};
const FIXED_NOW = new Date('2026-09-08T09:30:00+09:00');
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

async function openReady(page, { fabric = 'normal' } = {}) {
  const forecast = JSON.parse(
    await readFile(join(appDir, 'tests/fixtures/akita-2026-09-08.json'), 'utf8')
  );
  await page.route('**://api.open-meteo.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(forecast) }));
  await page.clock.setFixedTime(FIXED_NOW);
  await page.addInitScript(([code, kind]) => {
    localStorage.setItem('day-032-laundry-dry', JSON.stringify({ code, fabric: kind, place: 'sun' }));
  }, [AKITA_CODE, fabric]);
  await page.goto(await ensureServer(), { waitUntil: 'load' });
  await page.waitForSelector('#ready:not([hidden])');
  await page.waitForTimeout(600);
}

export default async function (page, h) {
  await openReady(page);

  // 頭の2秒はここで捨てる前提（切り出しは tools/trim-demo.mjs）。
  // 切り出したあとの1コマ目が「バーが伸びている途中」になるよう、ここで描き直しを起こす
  await h.pause(1400);
  await page.click('[data-fabric="thick"]');
  await h.pause(2600);

  await page.click('[data-place="shade"]');
  await h.pause(2400);

  await page.click('[data-place="sun"]');
  await h.pause(1200);
  await page.click('[data-fabric="thin"]');
  await h.pause(2600);

  await h.scrollTo('#timeline', 700);
  await h.pause(1800);

  await h.scrollTo('#best-start', 700);
  await h.pause(2200);

  await page.click('#why > summary');
  await h.pause(600);
  await h.scrollTo('#why-values', 700);
  await h.pause(2600);

  await h.scrollTop(700);
  await h.pause(1200);
}

/* スクショ（1200×750）は結果の画面。乾く時刻とバーが1枚に入る位置で撮る */
export async function shotSetup(page) {
  await openReady(page, { fabric: 'normal' });
  await page.waitForTimeout(400);
}
