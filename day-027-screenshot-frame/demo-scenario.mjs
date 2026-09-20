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
  '.css': 'text/css',
  '.webp': 'image/webp'
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
  await page.waitForSelector('#sample');
}

export default async function demo(page, h) {
  await prepare(page);
  await h.pause(1200);
  await page.click('#sample');
  await page.waitForFunction(() => document.getElementById('app').dataset.state === 'ready');
  await h.pause(1600);
  /* 縦型（540×960）では設定がプレビューの下に来るので、前半はJSでボタンを押して
     プレビューの変化だけを見せ、後半でスクロールして操作そのものを見せる。 */
  const press = (selector) => page.evaluate((sel) => document.querySelector(sel).click(), selector);
  for (const id of ['sunset', 'ocean', 'midnight', 'graphite']) {
    await press(`[data-bg="${id}"]`);
    await h.pause(750);
  }
  for (const aspect of ['1:1', '4:5', 'auto']) {
    await press(`[data-aspect="${aspect}"]`);
    await h.pause(850);
  }
  await h.scrollTo('#controls');
  await h.pause(500);
  await page.check('#frame');
  await h.pause(900);
  await h.slide('#padding', 40, 56, 70);
  await h.pause(600);
  await page.click('[data-bg="grape"]');
  await h.pause(700);
  await h.scrollTop();
  await h.pause(900);
  await page.hover('#download');
  await h.pause(2400);
}

export const shotScroll = 0;
export async function shotSetup(page) {
  await prepare(page);
  await page.click('#sample');
  await page.waitForFunction(() => document.getElementById('app').dataset.state === 'ready');
  await page.waitForTimeout(900);
  await page.evaluate(() => window.scrollTo(0, 0));
}
