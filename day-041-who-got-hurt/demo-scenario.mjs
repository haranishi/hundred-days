/* 一覧カード用のデモ（720×1280・15〜20秒・音なし）。
   現在地を東京駅に置いて「現在地から探す」を押し、
   答え → 地図のピン → 半径1km → 歩行者だけ → 集まっている地点 → 時刻の帯、の順に見せる。
   事故データは同梱ファイルを読み、地図タイルだけ本物を取る。
   1コマ目は「動いている途中」にしたいので、頭の空白は tools/trim-demo.mjs で切り落とす。 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKYO = { latitude: 35.6812, longitude: 139.7671 };
const appDir = dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json; charset=utf-8' };

/* 録画スクリプトは file:// で開くが、ESモジュールと fetch は file:// では動かないので
   ミニHTTPサーバーへ開き直す（Day 039・040 と同じ。.bin は既定の octet-stream で届く） */
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

/* 送り先を、上からの位置で指定して滑らかに動かす。scrollIntoView だと止まって見える */
const panTo = (page, selector, offset, ms) =>
  page.evaluate(([sel, off, span]) => new Promise((done) => {
    const target = document.querySelector(sel);
    const from = window.scrollY;
    const to = target.getBoundingClientRect().top + window.scrollY - off;
    const t0 = performance.now();
    const ease = (x) => (x < .5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
    const step = (now) => {
      const k = Math.min(1, (now - t0) / span);
      window.scrollTo(0, from + (to - from) * ease(k));
      k < 1 ? requestAnimationFrame(step) : done();
    };
    requestAnimationFrame(step);
  }), [selector, offset, ms]);

export default async function (page, h) {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation(TOKYO);
  await page.goto(await serve(), { waitUntil: 'load' });
  await page.waitForSelector('#map canvas');
  await h.pause(2400);                          // 地図タイルが描き切るまで待つ
  await page.getByRole('button', { name: '現在地から探す', exact: true }).click();
  await page.waitForSelector('#app[data-state="ready"]', { timeout: 25000 });
  await h.pause(2200);                          // 答えの2行を読ませる（trim後の頭はこの途中）
  await panTo(page, '#map-area', 24, 1500);     // 形の違うピンを見せる
  await h.pause(2200);
  await page.locator('input[name="radius"][value="1000"]').check();
  await page.waitForSelector('#app[data-state="ready"]');
  await h.pause(2400);                          // 半径を広げてピンが増えるところ
  await page.locator('input[name="who"][value="walker"]').check();
  await h.pause(2400);                          // 歩行者だけに絞ると丸だけが残る
  await panTo(page, '#spots', 24, 1600);        // 集まっている地点
  await h.pause(2600);
  await panTo(page, '#hours', 24, 1600);        // 何時に起きているか
  await h.pause(2800);
}

/* 一覧用スクショ（1200×750）は東京駅・半径500mの結果を出した状態で撮る */
/* 見出しが切れない位置。h1は75〜145px、答えは477〜584pxにあるので、頭から撮れば両方入る */
export const shotScroll = 0;
export async function shotSetup(page) {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation(TOKYO);
  await page.goto(await serve(), { waitUntil: 'load' });
  await page.waitForSelector('#map canvas');
  await page.getByRole('button', { name: '現在地から探す', exact: true }).click();
  await page.waitForSelector('#app[data-state="ready"]', { timeout: 25000 });
  await page.waitForTimeout(2600);              // ピンと地図タイルが描き切るまで
}
