/* プロモ動画（縦型1080×1920・35秒・BGM付き）を作る。
   絵コンテは timeline.mjs、音は promo-audio.mjs。この3つで完結する。

   実行:
     PLAYWRIGHT=/path/to/playwright/index.js node day-039-dig-below/tools/promo/render-promo.mjs

   Day 035〜038 と同じく、アプリを実際に操作して録画する。化石の記録は保存しておいた実応答に
   差し替えるので、撮り直しても数字が変わらない（相手のサーバーも叩かない）。
   地図タイルだけは本物を読む（ベタ塗りの地図では「場所を選んでいる」ことが伝わらないため）。 */

import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CAPTIONS, DEEP_START, DEFAULT_FPS, DOWN_START, DURATION_SECONDS, END_START,
  OPEN_START, SOURCE_START, SWITCH_START, ANSWER_START, T_CONFIRM_TAP } from './timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = dirname(dirname(here));
const VIEW = { width: 540, height: 960 };
const OUT = { width: 1080, height: 1920 };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json; charset=utf-8' };

/* 撮る2か所。fixture の取得地点と同じ緯度経度を使う（距離が食い違わないように） */
const TOKYO = { lat: 35.6812, lng: 139.7671, colls: 'colls-tokyo', occs: 'occs-tokyo', layers: 4 };
const KOCHI = { lat: 33.559, lng: 133.531, colls: 'colls-kochi', occs: 'occs-kochi', layers: 9 };

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
  return { base: `http://127.0.0.1:${server.address().port}/`, server };
}

/* 差し込む要素には pointer-events: none が要る。画面いっぱいのエンド画面が
   透明でもクリックを奪い、地図が押せなくなる（Day 035 で踏んだ） */
const OVERLAY = `
  .promo-caption {
    position: fixed; left: 6%; right: 6%; bottom: 11%; margin: 0 auto; max-width: 88%;
    padding: 14px 20px; border-radius: 14px; background: rgba(23, 23, 19, .93);
    color: #fffdf7; font-family: "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif;
    font-size: 29px; font-weight: 700; line-height: 1.45; text-align: center;
    letter-spacing: .01em; opacity: 0; transition: opacity 260ms ease; z-index: 9999; pointer-events: none;
    box-shadow: 0 10px 28px rgba(23, 23, 19, .3);
  }
  .promo-caption[data-on="1"] { opacity: 1; }
  .promo-end {
    position: fixed; inset: 0; display: grid; place-content: center; gap: 16px; text-align: center;
    background: #f6f3eb; color: #171713; z-index: 10000; opacity: 0; transition: opacity 420ms ease; pointer-events: none;
    font-family: "Hiragino Sans", system-ui, sans-serif;
  }
  .promo-end[data-on="1"] { opacity: 1; }
  .promo-end strong { font-family: "Yu Mincho", "Hiragino Mincho ProN", serif; font-size: 58px; letter-spacing: .08em; font-weight: 700; line-height: 1.3; }
  .promo-end em { font-style: normal; font-size: 26px; color: #3a3733; }
  .promo-end span { font-size: 23px; color: #64665c; letter-spacing: .04em; }
`;

async function main() {
  const spec = process.env.PLAYWRIGHT || 'playwright';
  const mod = await import(spec.startsWith('/') ? pathToFileURL(spec).href : spec);
  const chromium = mod.chromium ?? mod.default?.chromium;
  if (!chromium) throw new Error('Playwright を読み込めませんでした');
  for (const cmd of ['ffmpeg', 'ffprobe']) execFileSync('which', [cmd], { stdio: 'ignore' });

  const wav = join(here, 'promo-audio.wav');
  if (!existsSync(wav)) execFileSync('node', [join(here, 'promo-audio.mjs'), '--variant', 'a'], { stdio: 'inherit' });

  const fixtures = {};
  for (const place of [TOKYO, KOCHI]) {
    for (const name of [place.colls, place.occs]) {
      fixtures[name] ??= await readFile(join(appDir, 'tests', 'fixtures', `${name}.json`), 'utf8');
    }
  }

  const { base, server } = await serve();
  const work = mkdtempSync(join(tmpdir(), 'day039-promo-'));
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEW,
    locale: 'ja-JP',
    permissions: ['geolocation'],
    geolocation: { latitude: TOKYO.lat, longitude: TOKYO.lng },
    recordVideo: { dir: work, size: VIEW },
  });
  const recordStart = Date.now();
  const page = await context.newPage();
  const seen = new Set();
  page.on('request', (r) => seen.add(new URL(r.url()).host));

  let place = TOKYO;
  await page.route('**paleobiodb.org/data1.2/**', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: fixtures[route.request().url().includes('/colls/') ? place.colls : place.occs],
  }));

  await page.goto(base, { waitUntil: 'load' });
  await page.waitForSelector('#map canvas');
  await page.waitForTimeout(2600);   // タイルが描き切るまで待つ（白いままの地図を撮らない）
  await page.addStyleTag({ content: OVERLAY });
  await page.evaluate(() => {
    const caption = document.createElement('p');
    caption.className = 'promo-caption';
    const end = document.createElement('div');
    end.className = 'promo-end';
    end.innerHTML =
      '<strong>足もとを掘る</strong>' +
      '<em>場所を選ぶと、近くで見つかった化石が時代の柱になる</em>' +
      '<span>hundred-days.pages.dev／DAY 039</span>';
    document.body.append(caption, end);
    window.promoCaption = (lines) => {
      caption.dataset.on = lines.length ? '1' : '0';
      caption.innerHTML = lines.map((line) => `<span>${line}</span>`).join('<br>');
    };
    window.promoEnd = (on) => { end.dataset.on = on ? '1' : '0'; };
  });

  /* 送り先を、上からの位置で指定する。見せたいのが節の途中なので scrollIntoView では足りない */
  const scrollTo = (selector, offset = 0, behavior = 'smooth') =>
    page.evaluate(([sel, off, mode]) => {
      const target = document.querySelector(sel);
      if (!target) return;
      const top = target.getBoundingClientRect().top + window.scrollY - off;
      window.scrollTo({ top, behavior: mode });
    }, [selector, offset, behavior]);

  /* 冒頭だけは smooth に任せず、秒数を指定して動かす。
     smooth は数百msで着いてしまい、1コマ目が止まって見える（この企画は1コマ目が動いていることが条件） */
  const panTo = (selector, offset, ms) =>
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

  /* 地図の初期状態（中心 [137.5, 36]・ズーム4.5）からの画素位置を Web メルカトルで出して押す。
     現在地ボタンは1回しか使えない（アプリが maximumAge 60秒で前の位置を返すため）。
     1画素はこのズームで約3.4km。実測では±11kmずれても層数と最古層は変わらない */
  const MAP_CENTER = { lat: 36, lng: 137.5 }, MAP_ZOOM = 4.5;
  const clickMap = async (point) => {
    const box = await page.locator('#map').boundingBox();
    const world = 512 * 2 ** MAP_ZOOM;
    const px = (lng) => (lng + 180) / 360 * world;
    const py = (lat) => (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))) / 360 * world;
    await page.mouse.click(
      box.x + box.width / 2 + (px(point.lng) - px(MAP_CENTER.lng)),
      box.y + box.height / 2 + (py(point.lat) - py(MAP_CENTER.lat)),
    );
    await page.waitForSelector('#app[data-state="ready"]', { timeout: 25000 });
  };

  const search = async () => {
    await page.getByRole('button', { name: '現在地から探す', exact: true }).click();
    await page.waitForSelector('#app[data-state="ready"]', { timeout: 25000 });
  };

  /* 画面に出ている文字と字幕が食い違ったまま書き出さないための関門 */
  const expect = async (selector, needle) => {
    const text = (await page.locator(selector).textContent()) ?? '';
    if (!text.includes(needle)) throw new Error(`画面と字幕が食い違っています: "${needle}" が ${selector} に無い（実際は "${text.trim()}"）`);
  };

  await search();  // 東京。現在地はここで1回だけ使う
  await expect('#answer-text', '1,598万年前');
  await expect('#answer-text', '0.2km先');
  if (await page.locator('.layer').count() !== TOKYO.layers) throw new Error('東京の層数が想定と違います');

  /* 1コマ目を「柱が流れている途中」にするため、時間割の0秒より前に送り始める。
     頭の切り落としは録画開始と t0 の差で測る（下の head） */
  await scrollTo('#answer', 20, 'instant');
  /* 字幕は t0 より前に出し切る。フェードの途中が1コマ目になると半透明の帯が写る */
  await page.evaluate((lines) => window.promoCaption(lines), CAPTIONS[0].lines);
  await page.waitForTimeout(520);
  const opening = panTo('#column', 60, 3600);   // t0 をまたいで動き続ける
  await page.waitForTimeout(420);

  const t0 = Date.now();
  const at = async (seconds) => {
    const wait = t0 + seconds * 1000 - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
  };
  let captionIndex = -1;
  const syncCaption = async (t) => {
    const index = CAPTIONS.findIndex(({ start, end }) => t >= start && t < end);
    if (index !== captionIndex) {
      captionIndex = index;
      await page.evaluate((lines) => window.promoCaption(lines), index >= 0 ? CAPTIONS[index].lines : []);
    }
  };
  captionIndex = 0;   // t0 前に出した分

  /* S1 答え：0.2km先の記録が読める位置へ戻す */
  await at(ANSWER_START - 0.9);
  await opening;
  /* 字幕が数字を言い出す前に、その数字が画面に載っている状態にする */
  await scrollTo('#answer', 24);
  await at(ANSWER_START); await syncCaption(ANSWER_START);
  await at(5.6); await syncCaption(5.6);

  /* S2 柱を下る：色が変わっていくところを見せる */
  await at(DOWN_START); await syncCaption(DOWN_START);
  await scrollTo('#column', 80);
  await at(10.2); await syncCaption(10.2);
  await page.evaluate(() => window.scrollBy({ top: 420, behavior: 'smooth' }));

  /* S3 層を開く：何がいたかと出典が出る */
  await at(OPEN_START); await syncCaption(OPEN_START);
  await page.locator('.layer').nth(3).locator('summary').click();
  await scrollTo('.layer:nth-of-type(4)', 120);
  await at(15.5); await syncCaption(15.5);

  /* S4 場所を変える：地図まで戻して高知を押す。ここが山 */
  await at(SWITCH_START); await syncCaption(SWITCH_START);
  await scrollTo('#picker', 40);
  await at(T_CONFIRM_TAP);
  place = KOCHI;
  await clickMap(KOCHI);
  const layers = await page.locator('.layer').count();
  if (layers !== KOCHI.layers) throw new Error(`高知の層数が${layers}層。字幕は${KOCHI.layers}層と言っています`);
  await scrollTo('#answer', 24);
  await at(21.2); await syncCaption(21.2);
  await scrollTo('#column', 80);

  /* S5 柱の底：いちばん古い層まで一気に下る */
  await at(DEEP_START); await syncCaption(DEEP_START);
  await scrollTo('.layer:last-of-type', 200);
  await expect('.layer:last-of-type', '2億7,440万年前');
  await at(26.3); await syncCaption(26.3);

  /* S6 出典：その記録が載った論文 */
  await at(SOURCE_START); await syncCaption(SOURCE_START);
  await page.locator('.layer').last().locator('summary').click();
  await page.waitForTimeout(250);
  await scrollTo('.layer:last-of-type .reference', 420);

  await at(END_START);
  await page.evaluate(() => { window.promoCaption([]); window.promoEnd(true); });
  await at(DURATION_SECONDS);

  const head = (t0 - recordStart) / 1000;
  await context.close();
  await browser.close();
  server.close();

  const webm = readdirSync(work).find((file) => file.endsWith('.webm'));
  if (!webm) throw new Error('録画ファイルが作られませんでした');
  const out = join(here, 'promo.mp4');
  execFileSync('ffmpeg', [
    '-y', '-ss', head.toFixed(3), '-t', String(DURATION_SECONDS), '-i', join(work, webm), '-i', wav,
    '-filter_complex', `[0:v]scale=${OUT.width}:${OUT.height}:flags=lanczos,fps=${DEFAULT_FPS},format=yuv420p[v]`,
    '-map', '[v]', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '22',
    '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', out, '-frames:v', '1', join(here, 'promo-first-frame.png')]);
  rmSync(work, { recursive: true, force: true });

  const duration = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString().trim();
  console.log(`promo.mp4 を作りました（${duration}秒・${OUT.width}×${OUT.height}）`);
  console.log(`頭の切り落とし ${head.toFixed(2)}秒 / 通信したホスト: ${[...seen].join(', ')}`);
  console.log('1コマ目は promo-first-frame.png。必ず目視すること。');
}

await main();
