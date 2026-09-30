/* 一覧カード用のデモ（720×1280・15〜20秒・音なし）とスクショ（1200×750）。
   かんたん・家の番号6は、1問目で廊下の突き当たりの大きな振り子時計が消える。
   覚える（廊下を歩いてリビングをのぞく）→ 目を閉じる → 目を開けると時計が無い → 答えて正解、の順に見せる。
   録画のページは file:// で開かれるが、ESモジュールと模型は file:// では読めないので、ミニHTTPサーバーへ開き直す。
   3Dはソフトウェア描画だとコマ送りになるので、実GPUで録る:
     DEMO_GPU=1 PLAYWRIGHT=<playwright の index.js> node scripts/record-demo.mjs --day 54
   頭（読み込みと「1問目」の帯）は tools/trim-demo.mjs で切る。切る位置は録画中に表示する秒数を使う。 */

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
  '.glb': 'model/gltf-binary'
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

async function open(page, hash) {
  await page.goto(`${await serve()}${hash}`);
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true', null, { timeout: 120000 });
}

const phase = (page) => page.evaluate(() => window.__day054.game?.phase);
async function waitPhase(page, p) {
  await page.waitForFunction((want) => window.__day054.game?.phase === want, p, { timeout: 30000 });
}

/** なめらかに見回す（ドラッグ） */
async function look(page, dx, dy, ms) {
  const box = await page.locator('#scene').boundingBox();
  const x0 = box.x + box.width / 2;
  const y0 = box.y + box.height * 0.45;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  const n = Math.max(8, Math.round(ms / 30));
  for (let i = 1; i <= n; i++) {
    await page.mouse.move(x0 + (dx * i) / n, y0 + (dy * i) / n);
    await page.waitForTimeout(ms / n);
  }
  await page.mouse.up();
}

async function walk(page, ms) {
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(ms);
  await page.keyboard.up('KeyW');
}

export default async function (page, h) {
  const t0 = Date.now();
  const mark = (label) => console.log(`[demo] ${label} ${((Date.now() - t0) / 1000).toFixed(2)}s`);
  await open(page, '#c-e-6');
  await h.pause(600);
  await page.click('#start');
  await waitPhase(page, 'memorize');
  // 覚える：廊下の奥の時計へ歩き、リビングをのぞいて、また奥を見る
  mark('覚える開始');
  await walk(page, 1300);
  // 出入口から部屋の中が見えるよう、ほぼ真横まで振り向く（200px では廊下の壁しか写らなかった）
  await look(page, 400, 0, 1000);
  await h.pause(600);
  await look(page, -400, 0, 1000);
  await walk(page, 500);
  await page.click('#primary');
  mark('目を閉じる');
  await waitPhase(page, 'search');
  mark('探す開始');
  await h.pause(900);
  await walk(page, 1200);
  await h.pause(700);
  await page.click('#primary');
  await waitPhase(page, 'answer');
  await h.pause(1300);
  await page.click('.choice[data-id="grandfather-clock"]');
  await h.pause(600);
  await page.click('#confirm');
  mark('答え合わせ');
  await h.pause(3600);
  mark('終わり');
}

/* 一覧とOGPのスクショ：1問目の覚える時間に、リビングの入口から部屋を見たところ */
export async function shotSetup(page) {
  await open(page, '#c-n-4242');
  await page.click('#start');
  await waitPhase(page, 'memorize');
  await page.evaluate(() => {
    const p = window.__day054.player;
    p.x = 4.45; p.z = 7.55; p.yaw = 58; p.pitch = -14;
    window.__day054.game.pause();
    window.__day054.game.resume();
  });
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.__day054.game.pause());
  await page.evaluate(() => {
    document.getElementById('pause-screen').hidden = true;
    // 一覧とOGPの写真では、操作の案内の帯が家具に重なるので消す
    document.getElementById('controls-hint').classList.add('gone');
  });
  await page.waitForTimeout(300);
}
