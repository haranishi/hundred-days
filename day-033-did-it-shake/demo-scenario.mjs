import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* file:// からミニHTTPサーバーへ開き直す。発表と時計を固定して実データを再現する。 */

const appDir = dirname(fileURLToPath(import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json; charset=utf-8'
};
const FIXED_NOW = new Date('2026-08-23T02:07:00+09:00');
const MITO_CODE = '08201';

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
  const list = JSON.parse(await readFile(join(appDir, 'tests/fixtures/jma-list-2026-09-08.json'), 'utf8'));
  await page.route('**://www.jma.go.jp/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(list) }));
  await page.clock.setFixedTime(new Date('2026-08-23T02:07:00+09:00'));
  await page.addInitScript((code) => {
    localStorage.setItem('day-033-did-it-shake', JSON.stringify({ code, mode: 'picked' }));
  }, MITO_CODE);
  await page.goto(await ensureServer(), { waitUntil: 'load' });
  await page.waitForSelector('#answer[data-kind="shook"]');
  await page.waitForFunction(() => document.getElementById('your-intensity').textContent === 'あなたの街は震度4');
}

export default async function (page, h) {
  await openReady(page);
  // 撮影後、この押し直しで見出しが現れる途中を先頭にする。
  await h.pause(1000);
  await page.click('#check');
  await h.pause(2000);
  await page.clock.setFixedTime(new Date(FIXED_NOW.getTime() + 5000));
  await page.click('#check');
  await h.pause(2000);
  await h.scrollTo('#place-name', 700);
  await h.pause(1800);
  await h.scrollTo('#today-label', 700);
  await h.pause(2200);
  await h.scrollTo('#your-town', 700);
  await h.pause(2000);
  await page.click('#recent > summary');
  await h.scrollTo('#recent', 700);
  await h.pause(2400);
  await h.scrollTop(700);
  await h.pause(1200);
}

/* 1200×750で、答えと帯が1枚に入る位置にそろえる。 */
export async function shotSetup(page) {
  await openReady(page);
  await page.waitForTimeout(650);
  await page.locator('#headline').scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.getElementById('headline').getBoundingClientRect().top + window.scrollY - 20));
}
