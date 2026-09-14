import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* file:// からミニHTTPサーバーへ開き直す。ESモジュールと fetch が file:// では動かないため。

   物価指数は本物の世界銀行APIから取る（起動1回につき1リクエスト）。
   1コマ目は「年のスライダーが動いて金額が変わっている途中」にしたいので、
   読み込みが終わったらすぐ動かし始め、頭の空白は tools/trim-demo.mjs で切り落とす。 */

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
  await page.goto(baseUrl, { waitUntil: 'load' });
  await ready(page);

  /* 昔へ向かって年を送る。金額と丸がいっしょに育っていくのが、このアプリの見せ場 */
  await h.slide('#year', 1995, 1960, 145);
  await h.pause(1500);

  /* 丸の大きさ比べまで下りる。1960年は6倍以上の差が付く */
  await h.scrollTo('#coins', 600);
  await h.pause(1600);

  /* 飛び石で1990年へ。差が一気に縮む */
  await h.scrollTop(500);
  await page.click('.jump[data-year="1990"]');
  await h.pause(1500);

  /* 金額を1万円に変える */
  await h.scrollTo('#presets', 600);
  await page.click('.preset[data-amount="10000"]');
  await h.pause(1600);

  /* 折れ線と、分かったこと */
  await h.scrollTo('#chart-section', 600);
  await h.pause(1700);
  await h.scrollTo('#facts', 600);
  await h.pause(2200);
}

/* 一覧カードとOGPに使う静止画。いちばん差が出る1960年で、答えと丸が同時に入る位置を撮る */
export async function shotSetup(page) {
  const baseUrl = await serve();
  await page.goto(baseUrl, { waitUntil: 'load' });
  await ready(page);
  await page.evaluate(() => {
    const el = document.querySelector('#year');
    el.value = '1960';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(600);
}
