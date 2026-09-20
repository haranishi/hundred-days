import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* file:// からミニHTTPサーバーへ開き直す。ESモジュールと fetch が file:// では動かないため。

   化石の記録は本物の PBDB から取る（1回の検索につき2リクエスト）。
   1コマ目は「柱を下っている途中」にしたいので、頭の空白は tools/trim-demo.mjs で切り落とす。 */

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

/* 地図の初期状態（中心 [137.5, 36]・ズーム4.5）からの画素位置を Web メルカトルで出す。
   現在地の許可を出さずに済むし、画面の上でも「場所を選んだ」ことが分かる */
const MAP = { lat: 36, lng: 137.5, zoom: 4.5 };
async function clickMap(page, point) {
  const box = await page.locator('#map').boundingBox();
  const world = 512 * 2 ** MAP.zoom;
  const px = (lng) => (lng + 180) / 360 * world;
  const py = (lat) => (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))) / 360 * world;
  await page.mouse.click(
    box.x + box.width / 2 + (px(point.lng) - px(MAP.lng)),
    box.y + box.height / 2 + (py(point.lat) - py(MAP.lat)),
  );
  await page.waitForSelector('#app[data-state="ready"]', { timeout: 25000 });
}

/* 高知。柱が9層になり、ペルム紀まで下りられる。日本でいちばん時代の幅が出る場所のひとつ */
const KOCHI = { lat: 33.559, lng: 133.531 };

export default async function (page, h) {
  await page.goto(await serve(), { waitUntil: 'load' });
  await page.waitForSelector('#map canvas');
  await h.pause(2600);   // タイルが描き切るまで待つ（白いままの地図を撮らない）

  await clickMap(page, KOCHI);
  await h.pause(1500);

  /* 柱を上から下へ。色が変わっていくのがこのアプリの見せ場。
     頭を切り落とす前提で長めに撮る（切ったあと15〜20秒に収まるように） */
  await h.scrollTo('#column', 900);
  await h.pause(1100);
  for (let i = 0; i < 4; i += 1) {
    await page.evaluate(() => window.scrollBy({ top: 520, behavior: 'smooth' }));
    await h.pause(1500);
  }

  /* 層を開くと、何がいたかと出典論文が出る */
  await page.locator('.layer').nth(4).locator('summary').click();
  await h.scrollTo('.layer:nth-of-type(5)', 900);
  await h.pause(2400);

  /* いちばん古い層まで下りる */
  await h.scrollTo('.layer:last-of-type', 1000);
  await h.pause(1600);
  await page.locator('.layer').last().locator('summary').click();
  await h.pause(2400);
}

/* 一覧カードとOGPに使う静止画。広い画面では左に地図・右に柱が並ぶので、
   「場所を選ぶと柱が出る」が1枚で分かる */
export async function shotSetup(page) {
  await page.goto(await serve(), { waitUntil: 'load' });
  await page.waitForSelector('#map canvas');
  await page.waitForTimeout(2600);
  await clickMap(page, KOCHI);
  await page.waitForTimeout(900);
}
export const shotScroll = 330;
