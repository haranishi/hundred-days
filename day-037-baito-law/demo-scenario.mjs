import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* file:// からミニHTTPサーバーへ開き直す。ESモジュールと fetch が file:// では動かないため。

   1コマ目を「読んでいるところ」にしたいので、?topic= を付けて開き、条文が出た状態から
   始める。頭の空白は tools/trim-demo.mjs で切り落とす。 */

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

const ready = (page) => page.waitForSelector('#app[data-state="ready"]', { timeout: 25000 });

export default async function (page, h) {
  const baseUrl = await serve();

  /* 1本目：休憩（第34条）。短くてルビと色分けが1画面に収まる */
  await page.goto(`${baseUrl}?topic=kyukei`, { waitUntil: 'load' });
  await ready(page);
  await h.scrollTo('.article', 500);
  await h.pause(3200);

  /* 2本目：有給（第39条）。札を押すと入れ替わる */
  await h.scrollTo('#topics', 500);
  await page.click('.topic[data-topic="yukyu"]');
  await ready(page);
  await h.scrollTo('.article', 500);
  await h.pause(2800);

  /* 3本目：辞めたい（民法第627条）。別の法令でも同じ形で出る */
  await h.scrollTo('#topics', 500);
  await page.click('.topic[data-topic="yameru"]');
  await ready(page);
  await h.scrollTo('.article', 500);
  await h.pause(2200);

  /* 最後に、判断しないことと相談先まで下りる */
  await h.scrollTo('.disclaimer', 500);
  await h.pause(1900);
  await h.scrollTo('.consult', 500);
  await h.pause(2400);
}

/* 一覧カードとOGPに使う静止画。ルビと色分けがいちばん分かる第34条を撮る */
export async function shotSetup(page) {
  const baseUrl = await serve();
  await page.goto(`${baseUrl}?topic=kyukei`, { waitUntil: 'load' });
  await ready(page);
  await page.evaluate(() => document.querySelector('.article').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(500);
}
