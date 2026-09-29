/* 一覧カード用のデモ（720×1280・15〜20秒・音なし）。
   開くと柱が伸びる → 銭湯の数に切り替える → 源泉の数に戻して大分県を押す → 温泉に絞って1件開き「行った」を押す、の順に見せる。
   地図タイルは本物を読む（OpenFreeMap）。1コマ目は「柱が伸びている途中」にしたいので、頭は tools/trim-demo.mjs で切る。
   録画: DEMO_WIDTH=432 DEMO_HEIGHT=768 PLAYWRIGHT=<playwright の index.js> node scripts/record-demo.mjs --day 52 --video-only */

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
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

/* 録画スクリプトは file:// で開くが、ESモジュールと fetch は file:// では動かないので
   ミニHTTPサーバーへ開き直す（Day 039・040 と同じ） */
async function serve() {
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
  return `http://127.0.0.1:${server.address().port}/`;
}

/* 柱はタイルが描けてから伸びる（lib/map.js）。伸びきるまで待ってから次へ進む。
   __E2E__ は E2E と同じ観察用のフックを出すだけで、アプリの動きは変えない */
const grown = (page) => page.waitForFunction(
  () => globalThis.__day052?.grow() === 1 && !globalThis.__day052.growing(),
  null,
  { timeout: 20000 },
);

export default async function (page, h) {
  await page.addInitScript(() => { globalThis.__E2E__ = true; });
  await page.goto(await serve(), { waitUntil: 'load' });
  await page.waitForSelector('#app[data-state="ready"]', { timeout: 25000 });
  await grown(page);
  await h.pause(2200);                                   // 見出しの1行を読ませる（trim後の頭は柱が伸びている途中）
  await page.locator('.metric[data-metric="sento"]').click();
  await grown(page);
  await h.pause(2400);                                   // 銭湯の数（東京・大阪・青森）と4年の推移
  await page.locator('.metric[data-metric="sources"]').click();
  await h.pause(1700);
  await page.locator('button.rank-row[data-pref="44"]').click();
  await page.waitForSelector('#pref-card:not([hidden])', { timeout: 15000 });
  await h.pause(3000);                                   // 大分県へ寄って、お風呂の点が出る
  await page.locator('button.type-chip[data-type="onsen"]').click();
  await h.pause(1400);                                   // 温泉だけに絞る
  await page.locator('#bath-list button.bath-row').first().click();
  await page.waitForSelector('#bath-card:not([hidden])', { timeout: 15000 });
  await h.pause(2800);                                   // お風呂のカード
  await page.locator('#bath-visit').click();
  await h.pause(2200);                                   // 「行った」が付く
}
