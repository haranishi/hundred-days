/* 一覧カード用のデモ（720×1280・15〜20秒・音なし）とスクショ（1200×750）。
   サンプルねこを押して完成イメージ・型紙を出し、難易度を切り替え、型紙と材料までスクロールする流れ。
   file:// では fetch/ESモジュールが動かないため、ミニHTTPサーバーを立てて開き直す。
   頭は tools/trim-demo.mjs（または record-demo）で切り、1コマ目を完成イメージや型紙が出ている所にする。 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = dirname(fileURLToPath(import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

let base = null;
async function serve() {
  if (base) return base;
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://local').pathname);
      if (path.endsWith('/')) path += 'index.html';
      res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' })
        .end(await readFile(join(appDir, path)));
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  server.unref();
  base = `http://127.0.0.1:${server.address().port}/`;
  return base;
}

export default async function (page, h) {
  await page.goto(await serve(), { waitUntil: 'load' });
  await page.waitForSelector('#sample-neko');
  // サンプルねこをクリック
  await page.click('#sample-neko');
  await page.waitForSelector('.templates svg', { timeout: 5000 });
  await h.pause(1800); // 1コマ目：完成イメージと整える画面

  // 弁当箱を「幼児用」に変更
  await page.click('input[name="box"][value="kid"]');
  await h.pause(1000);

  // 難易度を「かんたん」に変更
  await page.click('input[name="difficulty"][value="easy"]');
  await h.pause(1200);

  // 材料と手順へスクロール
  await h.scrollTo('#make');
  await h.pause(2000);

  // 型紙までスクロール
  await h.scrollTo('#templates');
  await h.pause(2500);

  // 買い物メモをコピー
  await page.click('#copy-memo');
  await h.pause(1500);
}

// スクショ（1200×750）：完成イメージと食材・型紙が並んでいる状態
export async function shotSetup(page) {
  await page.goto(await serve(), { waitUntil: 'load' });
  await page.waitForSelector('#sample-neko');
  await page.click('#sample-neko');
  await page.waitForSelector('.templates svg', { timeout: 5000 });
  await page.waitForTimeout(500);
}
