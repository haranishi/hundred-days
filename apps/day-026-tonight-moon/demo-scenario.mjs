import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* record-demo.mjs は最初に file:// で開くためESモジュールを読めない。
   振り付け内でこのアプリを配信するミニHTTPサーバーへ開き直す。 */
const appDir = dirname(fileURLToPath(import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css'
};
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

async function prepare(page) {
  const url = await ensureServer();
  await page.goto(`${url}?at=2026-09-02T21:00`, { waitUntil: 'load' });
  await page.waitForSelector('#moon-age');
}

export default async function demo(page, h) {
  await prepare(page);
  await h.pause(1500);
  await h.slide('#date-range', 1, 23, 130);
  await h.pause(900);
  await h.slide('#date-range', 24, 25, 220);
  await h.pause(1200);
  await page.click('#today-button');
  await h.pause(1000);
  await page.context().setGeolocation({ latitude: 39.72, longitude: 140.10 });
  await page.context().grantPermissions(['geolocation']);
  await page.click('#geo-button');
  await page.waitForFunction(() => document.getElementById('place-select').value === 'geo');
  await h.pause(1600);
  await page.click('#seen-button');
  await h.pause(1100);
  await h.scrollTo('.journal-card');
  await h.pause(4000);
}

export const shotScroll = 0;
export async function shotSetup(page) {
  await prepare(page);
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollTo(0, 0));
}
