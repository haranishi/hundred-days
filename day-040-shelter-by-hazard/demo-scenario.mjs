/* 一覧カード用のデモ（720×1280・15〜20秒・音なし）。
   現在地を秋田駅に置いて「現在地から探す」を押し、答え → 使える5か所 → 使えない場所 → 津波に切り替え、の順に見せる。
   避難場所のタイルと地図タイルは本物を読む（国土地理院・8リクエスト）。
   1コマ目は「一覧を下っている途中」にしたいので、頭の空白は tools/trim-demo.mjs で切り落とす。 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AKITA = { latitude: 39.7186, longitude: 140.1025 };
const appDir = dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json; charset=utf-8' };

/* 録画スクリプトは file:// で開くが、ESモジュールと fetch は file:// では動かないので
   ミニHTTPサーバーへ開き直す（Day 039 と同じ） */
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
  await page.context().setGeolocation(AKITA);
  await page.goto(await serve(), { waitUntil: 'load' });
  await page.waitForSelector('#map canvas');
  await h.pause(2600);                       // 地図タイルが描き切るまで待つ
  await page.getByRole('button', { name: '現在地から探す', exact: true }).click();
  await page.waitForSelector('#app[data-state="ready"]', { timeout: 25000 });
  await h.pause(2200);                       // 答えの2行を読ませる（trim後の頭はこの途中）
  await panTo(page, '#hazards', 24, 1400);   // 災害の種類 → 地図（ピン）へ
  await h.pause(800);
  await panTo(page, '#map', 40, 1600);
  await h.pause(2600);                       // 塗りと白抜きのピンを見せる
  await panTo(page, '#usable', 24, 1600);    // 使える5か所
  await h.pause(2400);
  await panTo(page, '#unusable', 24, 1800);  // 近いのに使えない場所
  await h.pause(2600);
  await panTo(page, '#hazards', 24, 1400);   // 津波に切り替える
  await h.pause(500);
  await page.locator('input[name="hazard"][value="5"]').check();
  await page.waitForSelector('#app[data-state="ready"]');
  await panTo(page, '#answer', 20, 900);     // 答えが変わったところ
  await h.pause(3200);
}

/* 一覧用スクショ（1200×750）は秋田駅の結果を出した状態で撮る */
export const shotScroll = 44;
export async function shotSetup(page) {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation(AKITA);
  await page.goto(await serve(), { waitUntil: 'load' });
  await page.waitForSelector('#map canvas');
  await page.getByRole('button', { name: '現在地から探す', exact: true }).click();
  await page.waitForSelector('#app[data-state="ready"]', { timeout: 25000 });
  await page.waitForTimeout(2600);           // ピンと地図タイルが描き切るまで
}
