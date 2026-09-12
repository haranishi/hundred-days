/* プロモ動画（縦型1080×1920・34秒・BGM付き）を作る。
   絵コンテは timeline.mjs、音は promo-audio.mjs。この3つで完結する。

   実行:
     PLAYWRIGHT=/path/to/playwright/index.js node apps/day-037-baito-law/tools/promo/render-promo.mjs

   Day 035・036 と同じく、アプリを実際に操作して録画する。条文は保存しておいた実データに
   差し替えるので、撮影のたびに e-Gov を叩かない（相手に迷惑をかけない・撮り直しで結果が変わらない）。 */

import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ACTOR_START, CAPTIONS, DURATION_SECONDS, DEFAULT_FPS, END_START, OTHER_LAW_START,
  PROMISE_START, RUBY_START, SOURCE_START, TITLE_START, T_CONFIRM_TAP } from './timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = dirname(dirname(here));
const VIEW = { width: 540, height: 960 };
const OUT = { width: 1080, height: 1920 };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json; charset=utf-8' };

/* 撮影で使う条文。tests/fixtures に保存してある実データ */
const ARTICLES = { 34: 'roukikou-34.json', 39: 'roukikou-39.json', 91: 'roukikou-91.json', 627: 'minpou-627.json' };

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
   透明でもクリックを奪い、札が押せなくなる（Day 035 で踏んだ） */
const OVERLAY = `
  .promo-caption {
    position: fixed; left: 6%; right: 6%; bottom: 11%; margin: 0 auto; max-width: 88%;
    padding: 14px 20px; border-radius: 14px; background: rgba(31, 29, 25, .93);
    color: #fffdf8; font-family: "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif;
    font-size: 29px; font-weight: 700; line-height: 1.45; text-align: center;
    letter-spacing: .01em; opacity: 0; transition: opacity 260ms ease; z-index: 9999; pointer-events: none;
    box-shadow: 0 10px 28px rgba(31, 29, 25, .3);
  }
  .promo-caption[data-on="1"] { opacity: 1; }
  .promo-end {
    position: fixed; inset: 0; display: grid; place-content: center; gap: 16px; text-align: center;
    background: #f1ede4; color: #1f1d19; z-index: 10000; opacity: 0; transition: opacity 420ms ease; pointer-events: none;
    font-family: "Hiragino Sans", system-ui, sans-serif;
  }
  .promo-end[data-on="1"] { opacity: 1; }
  .promo-end strong { font-size: 52px; letter-spacing: .1em; font-weight: 700; line-height: 1.3; }
  .promo-end em { font-style: normal; font-size: 26px; color: #3a3733; }
  .promo-end span { font-size: 23px; color: #6b6455; letter-spacing: .04em; }
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
  const work = mkdtempSync(join(tmpdir(), 'day037-promo-'));
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEW,
    locale: 'ja-JP',
    recordVideo: { dir: work, size: VIEW },
  });
  const recordStart = Date.now();
  const page = await context.newPage();
  const seen = new Set();
  page.on('request', (r) => seen.add(new URL(r.url()).host));

  await page.route('https://laws.e-gov.go.jp/api/**', async (route) => {
    const num = /Article_(\d+)/.exec(route.request().url())?.[1];
    const file = ARTICLES[num];
    if (!file) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: await readFile(join(appDir, 'tests', 'fixtures', file), 'utf8'),
    });
  });

  await page.goto(`${base}?topic=kyukei`, { waitUntil: 'load' });
  await page.waitForSelector('#app[data-state="ready"]', { timeout: 25000 });
  await page.addStyleTag({ content: OVERLAY });
  await page.evaluate(() => {
    const caption = document.createElement('p');
    caption.className = 'promo-caption';
    const end = document.createElement('div');
    end.className = 'promo-end';
    end.innerHTML =
      '<strong>バイトの法律、<br>原文はこう</strong>' +
      '<em>気になることを選ぶと、根拠の条文が出る</em>' +
      '<span>hundred-days.pages.dev／DAY 037</span>';
    document.body.append(caption, end);
    window.promoCaption = (lines) => {
      caption.dataset.on = lines.length ? '1' : '0';
      caption.innerHTML = lines.map((line) => `<span>${line}</span>`).join('<br>');
    };
    window.promoEnd = (on) => { end.dataset.on = on ? '1' : '0'; };
  });

  /* 送り先を、上からの位置で指定する。条文の途中を見せたいので scrollIntoView では足りない */
  const scrollTo = (selector, offset = 0) =>
    page.evaluate(([sel, off]) => {
      const target = document.querySelector(sel);
      const top = target.getBoundingClientRect().top + window.scrollY - off;
      window.scrollTo({ top, behavior: 'smooth' });
    }, [selector, offset]);

  /* 時間割の0秒より前に条文まで送っておく。1コマ目を「読んでいるところ」にするため */
  await scrollTo('.article', 40);
  await page.waitForTimeout(900);

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

  await syncCaption(0);

  /* S1 タイトル：札に戻って、選ぶところを見せる */
  await at(TITLE_START); await syncCaption(TITLE_START);
  await scrollTo('#topics', 120);

  /* S2 ルビ：有給（第39条）は漢数字がいちばん多い */
  await at(RUBY_START); await syncCaption(RUBY_START);
  await page.click('.topic[data-topic="yukyu"]');
  await page.waitForSelector('#app[data-state="ready"]', { timeout: 25000 });
  await scrollTo('.article', 40);
  await at(9.8); await syncCaption(9.8);

  /* S3 主語：使用者と労働者が並ぶあたりまで送る */
  await at(ACTOR_START); await syncCaption(ACTOR_START);
  await scrollTo('.article', -260);
  await at(16.4); await syncCaption(16.4);
  await scrollTo('.article', -520);

  /* S4 別の法令：民法でも同じ形で出る */
  await at(OTHER_LAW_START); await syncCaption(OTHER_LAW_START);
  await scrollTo('#topics', 120);
  await at(T_CONFIRM_TAP);
  await page.click('.topic[data-topic="yameru"]');
  await page.waitForSelector('#app[data-state="ready"]', { timeout: 25000 });
  await scrollTo('.article', 40);
  await at(22.2); await syncCaption(22.2);

  /* S5 施行日と原典 */
  await at(SOURCE_START); await syncCaption(SOURCE_START);
  await scrollTo('#enforced', 320);

  /* S6 約束：判断しないことと、相談先 */
  await at(PROMISE_START); await syncCaption(PROMISE_START);
  await scrollTo('.consult', 260);

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
