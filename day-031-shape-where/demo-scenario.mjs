import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildRound } from './lib/quiz.js';
import { mulberry32 } from './lib/rng.js';

/* record-demo.mjs は最初に file:// で開くので、fetch も ES モジュールも動かない。
   振り付けの中でこのアプリを配信するミニHTTPサーバーへ開き直す。 */
const appDir = dirname(fileURLToPath(import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json; charset=utf-8'
};
let baseUrl = null;

async function ensureServer() {
  if (baseUrl) return baseUrl;
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://local').pathname);
      if (path.endsWith('/')) path += 'index.html';
      const body = await readFile(join(appDir, path));
      res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  server.unref();
  baseUrl = `http://127.0.0.1:${server.address().port}/`;
  return baseUrl;
}

const SEED = 20260907;
const PREF = '05';

/* 出題は種で決まるので、振り付け側でも同じ10問を先に組み立てて正解を知っておく。
   「たまたま外した」映像にならず、毎回同じ絵が録れる。 */
async function loadRound() {
  const read = async (path) => JSON.parse(await readFile(join(appDir, path), 'utf8'));
  const prefs = (await read('data/prefectures.json')).items;
  const towns = { [PREF]: await read(`data/towns/${PREF}.json`) };
  return buildRound({ mode: 'town', prefs, townsByPref: towns, prefCode: PREF, rng: mulberry32(SEED) });
}

const answerAt = (page, question) => page.click(`.choice[data-code="${question.answer.code}"]`);
const waitState = (page, state) =>
  page.waitForFunction((want) => document.getElementById('app').dataset.state === want, state);

async function start(page) {
  await page.goto(`${await ensureServer()}?seed=${SEED}&p=${PREF}`, { waitUntil: 'load' });
  await page.waitForSelector('#play-town:not([disabled])');
  await page.click('#play-town');
  await waitState(page, 'playing');
}

export default async function demo(page, h) {
  /* 1コマ目はシルエットが出ている画面にする。録画はページを開いた時点から始まるので、
     頭に入る「モード選び」は書き出したあとに切り落とす（CLAUDE.md「動画の1コマ目は動いているところ」）。
     切る長さは録画ごとに変わる（読み込みの速さで前後する）ので、毎回1コマ目を見て決める。
     2026-09-07 の録り直しは 0.4 秒だった。

       ffmpeg -y -ss 0.4 -i demo.mp4 -c:v libx264 -preset slow -crf 26 \
         -pix_fmt yuv420p -movflags +faststart -an demo-trimmed.mp4

     見せる順は、正解 → Wikipedia の1行 → 次の問 → ヒント → 結果。 */
  const round = await loadRound();
  await start(page);
  await h.pause(1800);

  // 1問目：正解すると Wikipedia の要約と写真が出る
  await answerAt(page, round.questions[0]);
  /* 解説の枠は最初から出ている（高さを先に確保するため）ので、
     「見えたか」ではなく「本文に差し替わったか」を待つ */
  await page
    .waitForFunction(() => document.getElementById('reveal-wiki').dataset.status !== 'loading', null, { timeout: 6000 })
    .catch(() => {});
  await h.pause(2800);

  // 2問目：ヒントを見ると県の中の位置が出る（点は半分になる）
  await page.click('#next-button');
  await waitState(page, 'playing');
  await h.pause(1500);
  await page.click('#hint-button');
  await h.pause(2000);
  await answerAt(page, round.questions[1]);
  await h.pause(1900);

  // 残りは早送りで通して結果まで
  for (const question of round.questions.slice(2)) {
    await page.click('#next-button');
    await waitState(page, 'playing');
    await h.pause(160);
    await answerAt(page, question);
    await h.pause(200);
  }
  await page.click('#next-button');
  await waitState(page, 'result');
  await h.pause(2800);
}

export const shotScroll = 0;

/** 一覧用のスクショは、シルエットと4択が入った出題中の画面にする */
export async function shotSetup(page) {
  await start(page);
  // シルエットは 240ms かけて現れる。途中を撮ると灰色に写るので終わるまで待つ
  await page.waitForTimeout(500);
  await page.mouse.move(0, 0);
}
