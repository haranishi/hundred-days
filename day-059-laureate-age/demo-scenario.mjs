/* 一覧カード用のデモ（縦・15〜20秒・音なし）と、一覧の画像（1200×750）。
   年齢を打つ → 26歳は0人 → 帯の図 → 82歳に打ち直す → 一覧の先頭に今夜の物理学賞 → 今年の受賞者、の順に見せる。
   今年の分は tests/fixtures の実応答（2026-10-06 18:53）で返し、時計は 21:00 に固定する。発表が進んでも同じ画が撮れる。
   1コマ目を「数字が入るところ」にしたいので、頭は tools/trim-demo.mjs で切る。
   録画: PLAYWRIGHT=<playwright の index.js> node scripts/record-demo.mjs --day 59 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = dirname(fileURLToPath(import.meta.url));
const NOW = '2026-10-06T21:00:00+09:00';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

/* 録画スクリプトは file:// で開くが、ESモジュールと fetch は file:// では動かないので
   ミニHTTPサーバーへ開き直す（Day 039・040・052 と同じ） */
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

async function open(page) {
  const prizes = await readFile(join(appDir, 'tests/fixtures/prizes-2026-1006-physics.json'), 'utf8');
  const laureates = await readFile(join(appDir, 'tests/fixtures/laureates-2026-1006-physics.json'), 'utf8');
  await page.route('https://api.nobelprize.org/**', (route) => route.fulfill({
    contentType: 'application/json',
    body: new URL(route.request().url()).pathname.endsWith('/nobelPrizes') ? prizes : laureates,
  }));
  await page.goto(`${await serve()}?now=${encodeURIComponent(NOW)}`, { waitUntil: 'load' });
  await page.waitForSelector('#app[data-state="ready"]', { timeout: 15000 });
  await page.waitForSelector('#current:not([data-live="loading"])', { timeout: 15000 });
}

async function typeAge(page, value) {
  await page.locator('#age').fill('');
  await page.locator('#age').pressSequentially(value, { delay: 260 });
  await page.mouse.move(1, 1);   // スクロールでボタンがマウスの下に来て、ホバー色のまま映らないように
}

export default async function (page, h) {
  await open(page);
  await h.pause(500);
  await typeAge(page, '26');               // 切ったあとの1コマ目は、数字が入るところ
  await h.pause(2600);                      // 0人・まだいません
  await h.scrollTo('#band', 900);
  await h.pause(2200);                      // 帯の図の「あなた 26歳」
  await h.scrollTop(700);
  await typeAge(page, '82');
  await h.pause(1600);                      // 82歳は9人
  await h.scrollTo('#matches .laureate', 900);
  await h.pause(2200);                      // 先頭は今夜の物理学賞のフランシス・ハルツェン
  await h.scrollTo('#current', 900);
  await h.pause(2600);                      // 今年の受賞者
}

export async function shotSetup(page) {
  await open(page);
  await page.locator('#age').fill('26');
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForTimeout(400);
}
