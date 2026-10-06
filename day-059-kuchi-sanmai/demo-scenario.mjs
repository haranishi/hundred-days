/* 一覧カード用のデモ（縦・15〜20秒・音なし）と、一覧の画像（1200×750）。
   「サンプルで試す」→ 見本の音を再生 → プレビューのロボットが口パクする → 背景をグリーンに → ドット絵モード、の順に見せる。
   1コマ目を「サンプルが入るところ」にしたいので、頭は tools/trim-demo.mjs で切る。
   録画: PLAYWRIGHT=<playwright の index.js> node scripts/record-demo.mjs --day 59 */

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
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
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
  // 外へは出さない（このアプリは外部と通信しないので、断っても見た目は変わらない）
  await page.route('**/*', (route) => (route.request().url().startsWith('http://127.0.0.1:') ? route.fallback() : route.abort()));
  await page.goto(await serve(), { waitUntil: 'load' });
  await page.getByRole('heading', { name: '声にあわせて、動きだす。' }).waitFor({ timeout: 15000 });
}

/* 画面の上からの位置へ、秒数を決めて送る（smooth は数百msで着いて止まって見えるため） */
const panTo = (page, selector, offset, ms) => page.evaluate(([sel, off, span]) => new Promise((done) => {
  const target = document.querySelector(sel);
  if (!target) return done();
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
  await open(page);
  await h.pause(600);
  await page.getByTestId('load-sample').click();                 // 切ったあとの1コマ目は、見本が入るところ
  await page.getByText('サンプルを読み込みました。').waitFor({ timeout: 15000 });
  await page.mouse.move(1, 1);
  await panTo(page, '[data-testid="preview-canvas"]', 90, 900);
  await h.pause(1200);
  // 読み込み後の案内の横の「▶ 再生してみる」。プレビューを見たまま再生できる（本物のクリックでないと音が始まらない）
  await page.getByTestId('sample-play').click();
  await page.mouse.move(1, 1);
  await panTo(page, '[data-testid="preview-canvas"]', 90, 800);
  await h.pause(6600);                                            // ロボットが口パクとまばたきをする
  await page.getByTestId('bg-green').click();
  await page.mouse.move(1, 1);
  await panTo(page, '[data-testid="preview-canvas"]', 90, 700);
  await h.pause(4600);                                            // 背景がグリーンになる（あとで透過合成しやすい）
}

// 一覧の画像は、プレビューのロボットが全身で入る位置まで下げて撮る（上の題名は一覧のカードに文字で出る）
export const shotScroll = 360;

export async function shotSetup(page) {
  await open(page);
  await page.getByTestId('load-sample').click();
  await page.getByText('サンプルを読み込みました。').waitFor({ timeout: 15000 });
  await page.mouse.move(1, 1);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
}
