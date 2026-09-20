import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* record-demo.mjs は file:// で開くためESモジュールを読めない。
   振り付けの中でこのアプリだけを配信するローカルHTTPサーバーへ開き直す。 */
const appDir = dirname(fileURLToPath(import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json'
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
  await page.goto(url, { waitUntil: 'load' });
}

async function fill(page, selector, value) {
  await page.locator(selector).fill(value);
  await page.waitForTimeout(260);
}

export default async function demo(page, h) {
  await prepare(page);
  await h.pause(1200);
  await fill(page, '#people', '4');
  await fill(page, '#water-stock', '24');
  await fill(page, '#food-stock', '20');
  await fill(page, '#toilet-stock', '30');
  await h.pause(1600);
  await h.scrollTo('[data-row-id="toilet"]');
  await h.pause(1600);
  await page.getByRole('button', { name: /カセットボンベ/ }).click();
  await fill(page, '.custom-card input[id$="-stock"]', '3');
  await fill(page, '.custom-card input[id$="-per-day"]', '1');
  await h.pause(1400);
  await h.scrollTop();
  await page.locator('input[name="target"][value="3"]').check();
  await h.pause(1100);
  await page.locator('input[name="target"][value="7"]').check();
  await h.scrollTo('#result');
  await h.pause(2200);
  await fill(page, '#water-expiry', '2020-01-01');
  await h.scrollTo('[data-row-id="water"]');
  await h.pause(2200);
}

export const shotScroll = 0;
export async function shotSetup(page) {
  await prepare(page);
  await fill(page, '#people', '4');
  await fill(page, '#water-stock', '24');
  await fill(page, '#food-stock', '20');
  await fill(page, '#toilet-stock', '30');
  // 入力でページが下へ動くので、タイトルと要約バーが写る先頭へ戻す
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
}
