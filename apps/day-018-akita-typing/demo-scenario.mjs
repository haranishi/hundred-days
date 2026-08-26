import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* record-demo.mjs は file:// でページを開くが、このアプリはESモジュール（動的importを含む）を
   使うため file:// ではCORSで読み込めない。振り付けの中でローカルHTTPサーバーを立てて開き直す。
   前例は day-008-vending-radar。 */

const appDir = dirname(fileURLToPath(import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json'
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

/** 画面に出ている「まだ打っていないローマ字」を、実際に打って消す */
async function typeTarget(page, perKeyMs) {
  const next = await page.locator('#romaji-next').innerText();
  const rest = await page.locator('#romaji-rest').innerText();
  const seq = next + rest;
  if (!seq) return false;
  for (const ch of seq) {
    await page.keyboard.press(ch);
    await page.waitForTimeout(perKeyMs);
  }
  return true;
}

/** レーンに指定枚数の皿が並ぶまで待つ（皿の投入は2秒前後に1枚） */
async function waitForPlates(page, count) {
  await page.waitForFunction(
    (n) => document.querySelectorAll('.plate[data-state="riding"]').length >= n,
    count,
    { timeout: 15_000 }
  );
}

/**
 * いちばん奥（右）の皿の札を押して、そこから打ち始める。
 * v2で足した「どの皿から始めるか選べる」を見せるための振り付け。
 * 押せるのは語の1打目だけなので、何も打っていない状態で呼ぶこと。
 */
async function pickFarPlate(page) {
  const key = await page.evaluate(() => {
    const plates = [...document.querySelectorAll('.plate[data-takeable="true"]')]
      .map((el) => ({ el, x: el.getBoundingClientRect().left }))
      .sort((a, b) => a.x - b.x);
    if (plates.length < 2) return null;
    const label = plates[plates.length - 1].el.querySelector('.plate__key');
    const text = label && label.textContent ? label.textContent.trim() : '';
    return text.length === 1 ? text : null;
  });
  if (!key) return false;
  await page.keyboard.press(key);
  return true;
}

/** 開始ボタンを押して、3・2・1 のカウントが明けるまで待つ */
async function startRound(page) {
  await page.click('#start');
  await page.waitForSelector('#game:not([hidden])', { timeout: 5000 });
  await page.waitForTimeout(200);
}

// ---- デモ動画（720×1280・縦型） ---------------------------------------------
// 頭のコース選択とカウントは仕上げで切り落とす前提で、頭から素直に撮る。
// 1コマ目を「動いているところ」にするための切り落としは tools/trim-demo.mjs が行う。

export default async function scenario(page, h) {
  const base = await ensureServer();
  // seed で皿の出る順を固定し、duration で1回を15秒にして結果画面まで見せる
  // sound=off で撮る。音はWeb Audioで生成していて録画には乗らないうえ、
  // 鳴らすと収録機ごとに間が変わるため（音を載せる場合は後付けでミックスする）
  await page.goto(`${base}?seed=7&duration=15&sound=off`, { waitUntil: 'load' });
  await h.pause(500);

  await startRound(page);

  // v2の目玉。奥の皿の札を押して、左端の消えかけではなくそちらから打ち始める
  await waitForPlates(page, 3);
  if (await pickFarPlate(page)) await h.pause(460);

  // 打てるだけ打つ。1回だけわざと外して、赤く光るところと「つまずいた打鍵」に繋げる
  let missed = false;
  const until = Date.now() + 13_400;
  while (Date.now() < until) {
    if (!missed) {
      const next = await page.locator('#romaji-next').innerText();
      if (next) {
        await page.keyboard.press(next === 'q' ? 'z' : 'q');
        await h.pause(320);
        missed = true;
      }
    }
    const typed = await typeTarget(page, 195);
    await h.pause(typed ? 330 : 400);
  }

  // 結果画面
  await page.waitForSelector('#result:not([hidden])', { timeout: 8000 });
  await h.pause(3200);
}

// ---- 一覧用スクショ（1200×750・横） -----------------------------------------
// 会計が動いていて、いま打っている途中が分かる瞬間を写す。

export async function shotSetup(page) {
  const base = await ensureServer();
  await page.goto(`${base}?seed=7&sound=off`, { waitUntil: 'load' });
  await page.waitForTimeout(300);
  await startRound(page);

  // レーンが埋まるまで待ってから1皿食べる。空のレーンを写さないための待ち
  await waitForPlates(page, 4);
  await typeTarget(page, 35);
  await waitForPlates(page, 4);

  // 次の皿を半分だけ打った状態で止める（打った分・次のキー・残りが全部写る）
  const next = await page.locator('#romaji-next').innerText();
  const rest = await page.locator('#romaji-rest').innerText();
  const seq = next + rest;
  for (const ch of seq.slice(0, Math.max(2, Math.floor(seq.length / 2)))) {
    await page.keyboard.press(ch);
    await page.waitForTimeout(35);
  }
  await page.waitForTimeout(200);
}

export const shotScroll = 0;
