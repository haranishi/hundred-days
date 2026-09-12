import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* file:// からミニHTTPサーバーへ開き直す。ESモジュールと data/kvg/*.json の取得が
   file:// では動かないため。

   1コマ目を「筆が動いているところ」にしたいので、?word= を付けて開き、読み込んだ
   直後から書き始める。頭の空白は tools/trim-demo.mjs で切り落とす。 */

const appDir = dirname(fileURLToPath(import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json; charset=utf-8',
};

async function serve() {
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
  return `http://127.0.0.1:${server.address().port}/`;
}

const clearStore = (page) =>
  page.addInitScript(() => localStorage.removeItem('day-036-stroke-by-stroke'));

export default async function (page, h) {
  const baseUrl = await serve();
  await clearStore(page);
  await page.goto(`${baseUrl}?word=秋田`, { waitUntil: 'load' });

  /* 1本目：ふつうの速さで最後まで */
  await page.waitForSelector('#app[data-state="done"]', { timeout: 20000 });
  await h.pause(900);

  /* 2本目：速さを変えて、続けて別の言葉を書く */
  await h.scrollTo('#playback', 400);
  await page.click('.speed-btn[data-speed="fast"]');
  await h.pause(300);
  await page.fill('#word', '');
  await page.type('#word', '名前', { delay: 90 });
  await h.pause(200);
  await page.click('#write');
  await h.scrollTo('#board-wrap', 400);
  await page.waitForSelector('#app[data-state="done"]', { timeout: 20000 });
  await h.pause(1600);
}

/* 一覧カードとOGPに使う静止画。書き終わった盤面を撮る */
export async function shotSetup(page) {
  const baseUrl = await serve();
  await clearStore(page);
  await page.goto(`${baseUrl}?word=秋田の朝`, { waitUntil: 'load' });
  await page.waitForSelector('#app[data-state="done"]', { timeout: 20000 });
  await page.waitForTimeout(400);
}
