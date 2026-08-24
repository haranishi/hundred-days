import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// record-demo.mjs は file:// でページを開くが、このアプリは ES モジュール（./lib/*.js）を
// import するため file:// では CORS で読み込めない。ローカルHTTPサーバーを立てて開き直す。
// 前例：apps/day-008-vending-radar/demo-scenario.mjs
const appDir = dirname(fileURLToPath(import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};
let baseUrl = null;

async function ensureServer() {
  if (baseUrl) return baseUrl;
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (path.endsWith('/')) path += 'index.html';
      const body = await readFile(join(appDir, path));
      res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  server.unref();
  baseUrl = `http://127.0.0.1:${server.address().port}/`;
  return baseUrl;
}

const idx = (coord) => (Number(coord[1]) - 1) * 8 + 'abcdefgh'.indexOf(coord[0]);
const cellSel = (coord) => `.cell[data-index="${idx(coord)}"]`;

/** 盤と評価値が出ている状態まで進める。1コマ目を「動いているところ」にするため冒頭で対局を開始する */
async function openAndStart(page) {
  const base = await ensureServer();
  await page.goto(base, { waitUntil: 'load' });
  await page.click('#start');
  await page.waitForSelector('.cell__score');
}

export async function shotSetup(page) {
  await openAndStart(page);
  // 1手指してAIの応手まで終わらせる＝盤の数字とAIの説明が両方写る状態
  await page.click(cellSel('d3'));
  await page.waitForFunction(
    () => document.querySelector('#status')?.textContent === 'あなたの番です',
    null,
    { timeout: 20000 },
  );
  await page.waitForSelector('.cell__score');
  await page.waitForTimeout(300);
}

export const shotScroll = 0;

export default async function (page, h) {
  // 冒頭から盤と評価値が出ている（静止したタイトル画面から始めない）
  await openAndStart(page);
  await h.pause(1600);

  // 1手目。ここからAIが1手先→4手先と読み、盤の数字が書き換わる＝このアプリの見せ場
  await page.click(cellSel('d3'));
  await page.waitForSelector('#thinking:not([hidden])');
  await h.pause(2600);

  await page.waitForFunction(
    () => document.querySelector('#status')?.textContent === 'あなたの番です',
    null,
    { timeout: 20000 },
  );
  await h.pause(2400);

  // 2手目。もう一度、読みが深まる様子を見せる
  const second = await page.evaluate(() => {
    const best = document.querySelector('.cell--best');
    return best ? Number(best.dataset.index) : null;
  });
  if (second !== null) {
    await page.click(`.cell[data-index="${second}"]`);
    await page.waitForSelector('#thinking:not([hidden])');
    await h.pause(3000);
    await page.waitForFunction(
      () => document.querySelector('#status')?.textContent === 'あなたの番です',
      null,
      { timeout: 20000 },
    );
    await h.pause(2600);
  }

  // 打てないマスを押したときの返しも見せる
  await page.click(cellSel('a1'));
  await h.pause(2200);
}
