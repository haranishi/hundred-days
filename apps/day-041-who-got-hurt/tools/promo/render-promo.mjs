/* プロモ動画（縦型1080×1920・35秒・BGM付き）を作る。
   絵コンテは timeline.mjs、音は promo-audio.mjs。この3つで完結する。

   実行:
     PLAYWRIGHT=/path/to/playwright/index.js node apps/day-041-who-got-hurt/tools/promo/render-promo.mjs

   Day 035〜040 と同じく、アプリを実際に操作して録画する。事故のデータは同梱ファイルなので
   撮り直しても数字は動かない。外へ出るのは地図タイルと住所検索の2系統だけで、
   住所検索は tests/fixtures/address-kochi-eki.json に差し替える（相手のサーバーを何十回も叩かない・
   候補の並びが変わって「高知駅」を押し損ねることも無い）。
   地図タイルだけは本物を読む。ここをベタ塗りにすると地図が真っ白になって、
   「場所の周りの事故」という絵が成立しないため。 */

import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ANSWER_START, BREAKDOWN_START, CAPTIONS, DEFAULT_FPS, DURATION_SECONDS, END_START,
  HOURS_START, KOCHI_ANSWER, KOCHI_BIKE, PLACE_LEAD, PLACE_START, SOURCE_START, SPOTS_START,
  T_CONFIRM_TAP } from './timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = dirname(dirname(here));
const fixtures = join(appDir, 'tests', 'fixtures');
const VIEW = { width: 540, height: 960 };
const OUT = { width: 1080, height: 1920 };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json; charset=utf-8' };

/* 撮る2か所。東京駅は現在地、高知駅は住所検索「高知駅」の候補から選ぶ（fixture の実応答） */
const TOKYO = { latitude: 35.6812, longitude: 139.7671 };

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://local').pathname);
      if (path.endsWith('/')) path += 'index.html';
      // data/m/*.bin は既定の octet-stream で届く（アプリは arrayBuffer で読む）
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
   透明でもクリックを奪い、ボタンが押せなくなる（Day 035 で踏んだ）。
   色はアプリの app.css と同じもの（紙 #f5f3ec・墨 #16160f） */
const OVERLAY = `
  .promo-caption {
    position: fixed; left: 8%; right: 8%; bottom: 11%; margin: 0 auto; max-width: 84%;
    padding: 14px 20px; border-radius: 14px; background: rgba(22, 22, 15, .93);
    color: #fbf9f2; font-family: "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif;
    font-size: 29px; font-weight: 700; line-height: 1.45; text-align: center;
    letter-spacing: .01em; opacity: 0; transition: opacity 260ms ease; z-index: 9999; pointer-events: none;
    box-shadow: 0 10px 28px rgba(22, 22, 15, .3);
  }
  .promo-caption[data-on="1"] { opacity: 1; }
  .promo-end {
    position: fixed; inset: 0; display: grid; place-content: center; gap: 16px; text-align: center; padding: 0 36px;
    background: #f5f3ec; color: #16160f; z-index: 10000; opacity: 0; transition: opacity 420ms ease; pointer-events: none;
    font-family: "Hiragino Sans", system-ui, sans-serif;
  }
  .promo-end[data-on="1"] { opacity: 1; }
  .promo-end strong { font-family: "Yu Mincho", "Hiragino Mincho ProN", serif; font-size: 52px; letter-spacing: .05em; font-weight: 700; line-height: 1.3; }
  .promo-end em { font-style: normal; font-size: 25px; color: #474a41; line-height: 1.5; }
  .promo-end span { font-size: 23px; color: #62655a; letter-spacing: .04em; }
`;

async function main() {
  const spec = process.env.PLAYWRIGHT || 'playwright';
  const mod = await import(spec.startsWith('/') ? pathToFileURL(spec).href : spec);
  const chromium = mod.chromium ?? mod.default?.chromium;
  if (!chromium) throw new Error('Playwright を読み込めませんでした');
  for (const cmd of ['ffmpeg', 'ffprobe']) execFileSync('which', [cmd], { stdio: 'ignore' });

  const wav = join(here, 'promo-audio.wav');
  if (!existsSync(wav)) execFileSync('node', [join(here, 'promo-audio.mjs'), '--variant', 'a'], { stdio: 'inherit' });

  const { base, server } = await serve();
  const work = mkdtempSync(join(tmpdir(), 'day041-promo-'));
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEW,
    locale: 'ja-JP',
    permissions: ['geolocation'],
    geolocation: TOKYO,
    recordVideo: { dir: work, size: VIEW },
  });
  const recordStart = Date.now();
  const page = await context.newPage();
  const seen = new Set();
  page.on('request', (r) => seen.add(new URL(r.url()).host));

  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.includes('msearch.gsi.go.jp')) {
      return route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: readFileSync(join(fixtures, 'address-kochi-eki.json')) });
    }
    // 地図タイル（cyberjapandata）とローカルの同梱データはそのまま通す
    return route.continue();
  });

  await page.goto(base, { waitUntil: 'load' });
  await page.waitForSelector('#map canvas');
  await page.waitForTimeout(2400);   // タイルが描き切るまで待つ（白いままの地図を撮らない）
  await page.addStyleTag({ content: OVERLAY });
  await page.evaluate(() => {
    const caption = document.createElement('p');
    caption.className = 'promo-caption';
    const end = document.createElement('div');
    end.className = 'promo-end';
    end.innerHTML =
      '<strong>この道、<br>誰がケガしてる？</strong>' +
      '<em>警察庁の188万件を、<br>歩いて通る道の単位で</em>' +
      '<span>hundred-days.pages.dev／DAY 041</span>';
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

  /* 画面に出ている文字と字幕が食い違ったまま書き出さないための関門 */
  const expect = async (selector, needle) => {
    const text = (await page.locator(selector).textContent()) ?? '';
    if (!text.includes(needle)) throw new Error(`画面と字幕が食い違っています: "${needle}" が ${selector} に無い（実際は "${text.trim().slice(0, 80)}"）`);
  };
  const ready = () => page.waitForSelector('#app[data-state="ready"]', { timeout: 25000 });

  await page.getByRole('button', { name: '現在地から探す', exact: true }).click();   // 東京駅。現在地はここで1回だけ使う
  await ready();
  await page.waitForTimeout(2400);   // ピンと周辺タイルが描き切るまで

  /* 1コマ目を「地図から答えへ上っている途中」にするため、時間割の0秒より前に送り始める。
     頭の切り落としは録画開始と t0 の差で測る（下の head） */
  await scrollTo('#map-area', 20, 'instant');
  await page.evaluate((lines) => window.promoCaption(lines), CAPTIONS[0].lines);
  await page.waitForTimeout(520);
  const opening = panTo('#answer', 24, 3000);   // t0 をまたいで動き続ける
  /* 待つ長さ＝1コマ目がどれだけ動いているか。ease は入りが遅いので、
     短く待つと 1コマ目の動きが 2〜3px しかない。ここで加速し切ってから t0 にする */
  await page.waitForTimeout(700);

  const t0 = Date.now();
  const at = async (seconds) => {
    const wait = t0 + seconds * 1000 - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
  };
  let captionIndex = 0;   // t0 前に出した分
  const syncCaption = async (t) => {
    const index = CAPTIONS.findIndex(({ start, end }) => t >= start && t < end);
    if (index !== captionIndex) {
      captionIndex = index;
      await page.evaluate((lines) => window.promoCaption(lines), index >= 0 ? CAPTIONS[index].lines : []);
    }
  };

  /* S1 答え：東京駅の半径500mに6年間で351件 */
  await at(ANSWER_START - 0.9);
  await opening;
  await scrollTo('#answer', 24);
  await at(ANSWER_START); await syncCaption(ANSWER_START);
  await expect('#answer-text', '6年間に351件');

  /* S2 内訳：歩行者78件・自転車76件。後半は地図へ下りて、形の違うピンと凡例を見せる */
  await at(BREAKDOWN_START); await syncCaption(BREAKDOWN_START);
  await expect('#answer-sub', '歩行者78件・自転車76件');
  await at(9.9);
  await panTo('#map-area', 140, 1500);

  /* S3 事故が集まっている地点の1位 */
  await at(SPOTS_START); await syncCaption(SPOTS_START);
  await expect('#spots-list', '北東へ440m・交差点 — 16件（歩行者3）');
  await scrollTo('#spots', 24);

  /* S4 何時に起きているか。帯の山は18時台 */
  await at(HOURS_START); await syncCaption(HOURS_START);
  await expect('#hours-peak', 'いちばん多いのは18時台で、30件です。');
  await scrollTo('#hours', 24);

  /* S5 場所を高知駅に変える。候補を押して答えが入れ替わるところが山 */
  await at(PLACE_LEAD); await syncCaption(PLACE_LEAD);
  await scrollTo('#picker', 40);
  await page.fill('#address', '高知駅');
  await at(PLACE_START);
  await page.click('#search-address');
  await page.waitForSelector('#candidates button');
  await at(T_CONFIRM_TAP);
  await page.getByRole('button', { name: '高知駅', exact: true }).click();
  await ready();
  await expect('#place-name', '選んだ場所：高知駅');
  await expect('#answer-text', '132件');
  await expect('#answer-sub', '自転車61件');
  await scrollTo('#answer', 24);
  await at(KOCHI_ANSWER); await syncCaption(KOCHI_ANSWER);
  await at(KOCHI_BIKE); await syncCaption(KOCHI_BIKE);

  /* S6 出典と、この数字で分からないこと */
  await at(SOURCE_START); await syncCaption(SOURCE_START);
  await scrollTo('.limits', 40);
  await at(30.0);
  await scrollTo('.sources', 40);

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
  // 住所検索は fixture に差し替えているので、宛先に出ていても外へは出ていない
  console.log(`頭の切り落とし ${head.toFixed(2)}秒 / 要求の宛先: ${[...seen].join(', ')}`);
  console.log('1コマ目は promo-first-frame.png。必ず目視すること。');
}

await main();
