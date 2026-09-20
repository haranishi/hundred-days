import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* file:// からミニHTTPサーバーへ開き直す。潮位表と時計を固定して実データを再現する。 */

const appDir = dirname(fileURLToPath(import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json; charset=utf-8'
};
const FIXED_NOW = new Date('2026-09-10T15:00:00+09:00');

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

async function openReady(page) {
  await page.route('**://www.data.jma.go.jp/kaiyou/data/db/tide/suisan/txt/*/*.txt', async (route) => {
    const parts = new URL(route.request().url()).pathname.split('/');
    const year = parts.at(-2), code = parts.at(-1).slice(0, -4);
    if (!/^[A-Z][A-Z0-9]$/.test(code) || !/^\d{4}$/.test(year)) { await route.fulfill({ status: 404, body: '' }); return; }
    try {
      const body = await readFile(join(appDir, `tests/fixtures/${code}-${year}.txt`), 'utf8');
      await route.fulfill({ status: 200, contentType: 'text/plain', body });
    } catch { await route.fulfill({ status: 404, body: '' }); }
  });
  await page.clock.setFixedTime(FIXED_NOW);
  await page.addInitScript(() => {
    localStorage.setItem('day-034-tide-now', JSON.stringify({ code: 'TK', mode: 'picked' }));
  });
  await page.goto(await ensureServer(), { waitUntil: 'load' });
  await page.waitForSelector('#answer[data-kind="rising"]');
}

export default async function (page, h) {
  await openReady(page);
  await h.pause(2200);
  await h.scrollTo('#answer-sub', 700);
  await h.pause(2000);
  await h.scrollTo('#curve', 700);
  await h.pause(2300);
  await h.scrollTo('.place-row', 700);
  await h.pause(1800);
  await h.scrollTo('#events-today', 700);
  await h.pause(2300);
  await h.scrollTo('#events-tomorrow', 700);
  await h.pause(1600);
  await h.scrollTop(700);
  await h.pause(1300);
}

export async function shotSetup(page) {
  await page.setViewportSize({ width: 1200, height: 750 });
  await openReady(page);
  await page.waitForTimeout(650);
  await page.evaluate(() => window.scrollTo(0, document.getElementById('headline').getBoundingClientRect().top + window.scrollY - 20));
}
