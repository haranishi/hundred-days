/* 一覧カード用のデモ（720×1280・15〜20秒・音なし）とスクショ（1200×750）。
   手習いの盤で1字入れて「天晴」→ 腕前選び（埋める字 1・7・15）→ 一人前で空きを順に埋めて「天晴」、の順に見せる。
   録画のページは file:// で開かれるが、ESモジュールと同梱の書体は file:// では読めないので、ミニHTTPサーバーへ開き直す。
   頭（開き直しと果たし状の画面）は tools/trim-demo.mjs で切り、1コマ目を盤が見えている所にする。
   録画: PLAYWRIGHT=<playwright の index.js> node scripts/record-demo.mjs --day 53
   切り出し: node day-053-kotoba-tsuji/tools/trim-demo.mjs <開始秒> <終了秒> */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOARD_COLUMNS, toggleDakuten, toggleHandakuten } from './lib/kana.js';

const appDir = dirname(fileURLToPath(import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
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

// 手習いの盤：きつね（狐）とねずみ（鼠）の辻に「ね」を入れる
const TENARAI = 'demo06';
// スクショの一人前の盤（決まった盤を果たし状のリンクで出す）
const SHOT_SEED = 'edo1603';

// 濁りのある字は「基の字＋゛/゜」で入れる
const SPLIT = {};
for (const column of BOARD_COLUMNS) {
  for (const baseKana of column) {
    if (!baseKana) continue;
    const voiced = toggleDakuten(baseKana);
    if (voiced && !SPLIT[voiced]) SPLIT[voiced] = [baseKana, 'dakuten'];
    const half = toggleHandakuten(baseKana);
    if (half && !SPLIT[half]) SPLIT[half] = [baseKana, 'handakuten'];
  }
}

async function typeKana(page, ch, gap = 0) {
  const split = SPLIT[ch];
  if (!split) return page.click(`.key[data-kana="${ch}"]`);
  await page.click(`.key[data-kana="${split[0]}"]`);
  if (gap) await page.waitForTimeout(gap);
  await page.click(`[data-kp="${split[1]}"]`);
}

// 次の空きを1つ埋める（答えはテスト用の窓口 window.__kotoba から読む）。いまのマスが空きでなければ押してから書く
async function fillNext(page, gap = 0) {
  const step = await page.evaluate(() => {
    const g = window.__kotoba.game();
    const p = window.__kotoba.puzzle();
    const todo = p.blanks.filter(({ x, y }) => !g.locked[y][x] && g.entries[y][x] !== p.grid[y][x]);
    if (!todo.length) return null;
    const here = todo.find((c) => c.x === g.cursor.x && c.y === g.cursor.y);
    const t = here ?? todo[0];
    return { x: t.x, y: t.y, ch: p.grid[t.y][t.x], move: !here };
  });
  if (!step) return false;
  if (step.move) {
    await page.click(`.cell[data-x="${step.x}"][data-y="${step.y}"]`);
    if (gap) await page.waitForTimeout(gap);
  }
  await typeKana(page, step.ch, gap);
  return true;
}

// 盤を出す前に、使う太さの書体を読み込んでおく（1コマ目から同梱の書体で出す）
const loadFonts = (page) => page.evaluate(() => Promise.all([
  ...['500', '700', '800'].map((w) => document.fonts.load(`${w} 20px "Shippori Mincho B1"`, 'ことば辻')),
  ...['500', '700'].map((w) => document.fonts.load(`${w} 14px "Zen Kaku Gothic New"`, '残り')),
]));

async function openChallenge(page, level, seed) {
  await page.goto(`${await serve()}#c-${level}-${seed}`, { waitUntil: 'load' });
  await page.waitForSelector('[data-act="accept"]');
  await loadFonts(page);
  await page.click('[data-act="accept"]');
  await page.waitForSelector('[data-screen="play"]');
}

export default async function (page, h) {
  await page.addInitScript(() => { window.__KOTOBA_TEST__ = true; });
  await openChallenge(page, 1, TENARAI);
  await h.pause(1700);                                   // ここから使う：盤と朱の枠（空いた辻）と始めの声かけ
  await fillNext(page);                                  // 「ね」を1回押す
  await page.waitForSelector('[data-screen="result"]', { timeout: 5000 });
  await h.pause(2300);                                   // 朱印「天晴」と花火
  await page.click('[data-act="change"]');
  await page.waitForSelector('[data-screen="select"]');
  await h.pause(2200);                                   // 腕前選び（埋める字 1・7・15）
  await page.click('.level-card[data-level="2"]');
  await page.waitForSelector('[data-screen="play"]');
  await h.pause(1000);                                   // 一人前の盤：残り 7字
  while (await fillNext(page, 120)) await h.pause(420); // 空きを順に埋める（残りが減っていく）
  await page.waitForSelector('[data-screen="result"]', { timeout: 5000 });
  await h.pause(2000);
}

// スクショ（1200×750）：一人前の盤を3字まで埋めたところ。始めの声かけは見た扱いにして、盤を隠さない
export async function shotSetup(page) {
  await page.addInitScript(() => {
    window.__KOTOBA_TEST__ = true;
    localStorage.setItem('kotoba-tsuji.settings.v1', JSON.stringify({ sound: true, autoCheck: true, motion: 'auto', seenCoach: true }));
  });
  await openChallenge(page, 2, SHOT_SEED);
  for (let i = 0; i < 3; i++) await fillNext(page);
  await page.waitForTimeout(3200);                        // 声かけの札が消え、動きが止まるまで待つ
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'), null, { timeout: 8000 });
}
