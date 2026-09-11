/* プロモ動画（縦型1080×1920・34秒・BGM付き）を作る。
   絵コンテは timeline.mjs、音は promo-audio.mjs。この3つで完結する。

   実行:
     PLAYWRIGHT=/path/to/playwright/index.js node apps/day-035-front-page/tools/promo/render-promo.mjs

   録画はアプリを実際に操作して撮る（1コマずつHTMLを合成する方式は採らない）。
   中継は fixtures に差し替えるので外へは出ない。字幕とエンド画面はページに差し込む。 */

import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CAPTIONS, DURATION_SECONDS, DEFAULT_FPS, END_START, PROMISE_START, SAVE_START,
  SECOND_START, THIRD_START, DETAIL_START, TITLE_START } from './timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = dirname(dirname(here));
const appsDir = dirname(appDir);
const VIEW = { width: 540, height: 960 };
const OUT = { width: 1080, height: 1920 };
const SOURCES = [
  { dir: 'day-034-tide-now', photo: 'screenshot.webp' },
  { dir: 'day-033-did-it-shake', photo: null },
  { dir: 'day-032-laundry-dry', photo: null }
];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json; charset=utf-8' };

async function buildArticles() {
  const entries = [];
  for (const source of SOURCES) {
    const meta = JSON.parse(await readFile(join(appsDir, source.dir, 'meta.json'), 'utf8'));
    const url = `https://hundred-days.pages.dev/${source.dir}/`;
    entries.push([url, {
      body: {
        title: meta.title,
        lead: meta.description,
        image: source.photo ? `${url}${source.photo}` : null,
        site: '100 DAYS / 100 APPS',
        publishedAt: `${meta.finishedAt}T09:00:00+09:00`,
        canonical: url,
        host: 'hundred-days.pages.dev'
      },
      photo: source.photo ? join(appsDir, source.dir, source.photo) : null
    }]);
  }
  return new Map(entries);
}

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

const OVERLAY = `
  .promo-caption {
    position: fixed; left: 6%; right: 6%; bottom: 11%; margin: 0 auto; max-width: 88%;
    padding: 14px 20px; border-radius: 14px; background: rgba(24, 22, 19, .92);
    color: #f6f2e8; font-family: "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif;
    font-size: 29px; font-weight: 700; line-height: 1.45; text-align: center;
    letter-spacing: .01em; opacity: 0; transition: opacity 260ms ease; z-index: 9999; pointer-events: none;
    box-shadow: 0 10px 28px rgba(24, 22, 19, .28);
  }
  .promo-caption[data-on="1"] { opacity: 1; }
  .promo-end {
    position: fixed; inset: 0; display: grid; place-content: center; gap: 14px; text-align: center;
    background: #f4efe4; color: #1b1b1b; z-index: 10000; opacity: 0; transition: opacity 420ms ease; pointer-events: none;
    font-family: "Hiragino Mincho ProN", "Yu Mincho", serif;
  }
  .promo-end[data-on="1"] { opacity: 1; }
  .promo-end strong { font-size: 62px; letter-spacing: .16em; font-weight: 600; }
  .promo-end span { font-family: "Hiragino Sans", system-ui, sans-serif; font-size: 24px; color: #55503f; letter-spacing: .04em; }
  .promo-end em { font-family: "Hiragino Sans", system-ui, sans-serif; font-style: normal; font-size: 27px; }
`;

async function main() {
  const spec = process.env.PLAYWRIGHT || 'playwright';
  const mod = await import(spec.startsWith('/') ? pathToFileURL(spec).href : spec);
  const chromium = mod.chromium ?? mod.default?.chromium;
  if (!chromium) throw new Error('Playwright を読み込めませんでした');
  for (const cmd of ['ffmpeg', 'ffprobe']) execFileSync('which', [cmd], { stdio: 'ignore' });

  const wav = join(here, 'promo-audio.wav');
  if (!existsSync(wav)) execFileSync('node', [join(here, 'promo-audio.mjs'), '--variant', 'a'], { stdio: 'inherit' });

  const articles = await buildArticles();
  const { base, server } = await serve();
  const work = mkdtempSync(join(tmpdir(), 'day035-promo-'));
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEW,
    locale: 'ja-JP',
    reducedMotion: 'reduce',
    recordVideo: { dir: work, size: VIEW }
  });
  const recordStart = Date.now();
  const page = await context.newPage();
  const seen = new Set();
  page.on('request', (r) => seen.add(new URL(r.url()).host));

  await page.route('**/api/day-035/page*', async (route) => {
    const entry = articles.get(new URL(route.request().url()).searchParams.get('url'));
    await route.fulfill(entry
      ? { status: 200, contentType: 'application/json', body: JSON.stringify(entry.body) }
      : { status: 502, contentType: 'application/json', body: '{"error":"upstream_unavailable"}' });
  });
  await page.route('**/api/day-035/image*', async (route) => {
    const src = new URL(route.request().url()).searchParams.get('src');
    const entry = [...articles.values()].find((item) => item.body.image === src);
    await route.fulfill(entry?.photo
      ? { status: 200, contentType: 'image/webp', body: await readFile(entry.photo) }
      : { status: 404, body: '' });
  });
  await page.addInitScript(() => localStorage.removeItem('day-035-front-page'));
  await page.goto(base, { waitUntil: 'load' });
  await page.addStyleTag({ content: OVERLAY });
  await page.evaluate(() => {
    const caption = document.createElement('p');
    caption.className = 'promo-caption';
    const end = document.createElement('div');
    end.className = 'promo-end';
    end.innerHTML = '<strong>きょうの一面</strong><em>リンクを貼ると、新聞の一面になる</em><span>hundred-days.pages.dev／DAY 035</span>';
    document.body.append(caption, end);
    window.promoCaption = (lines) => {
      caption.dataset.on = lines.length ? '1' : '0';
      caption.innerHTML = lines.map((line) => `<span>${line}</span>`).join('<br>');
    };
    window.promoEnd = (on) => { end.dataset.on = on ? '1' : '0'; };
  });

  const urls = [...articles.keys()];
  const add = async (url) => {
    await page.fill('#url', url);
    await page.click('#submit');
    await page.waitForSelector('#app[data-state="ready"]');
  };
  // 1本目は撮影が始まる前に組んでおく。冒頭のコマを「動いている紙面」にするため
  await add(urls[0]);
  await page.evaluate(() => window.scrollTo(0, 420));
  await page.waitForTimeout(200);

  const t0 = Date.now();
  const at = async (seconds) => {
    const wait = t0 + seconds * 1000 - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
  };
  const caption = (lines) => page.evaluate((value) => window.promoCaption(value), lines);
  let captionIndex = -1;
  const syncCaption = async (t) => {
    const index = CAPTIONS.findIndex(({ start, end }) => t >= start && t < end);
    if (index !== captionIndex) {
      captionIndex = index;
      await caption(index >= 0 ? CAPTIONS[index].lines : []);
    }
  };

  await syncCaption(0);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));

  await at(TITLE_START); await syncCaption(TITLE_START);
  await at(SECOND_START); await syncCaption(SECOND_START);
  await page.click('#more');
  await at(SECOND_START + 0.8); await add(urls[1]);
  await page.evaluate(() => document.querySelector('#paper').scrollIntoView({ behavior: 'smooth', block: 'center' }));
  await at(9.6); await syncCaption(9.6);

  await at(THIRD_START); await syncCaption(THIRD_START);
  await page.click('#more');
  await at(THIRD_START + 0.8); await add(urls[2]);
  await page.evaluate(() => document.querySelector('#paper').scrollIntoView({ behavior: 'smooth', block: 'center' }));
  await at(16.4); await syncCaption(16.4);

  await at(DETAIL_START); await syncCaption(DETAIL_START);
  await page.evaluate(() => window.scrollTo({ top: 260, behavior: 'smooth' }));
  await at(21.9); await syncCaption(21.9);
  await page.evaluate(() => window.scrollTo({ top: 40, behavior: 'smooth' }));

  await at(SAVE_START); await syncCaption(SAVE_START);
  await page.evaluate(() => document.querySelector('#save').scrollIntoView({ behavior: 'smooth', block: 'center' }));
  await at(SAVE_START + 0.6);
  const download = page.waitForEvent('download').catch(() => null);
  await page.click('#save');
  await download;

  await at(PROMISE_START); await syncCaption(PROMISE_START);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));

  await at(END_START);
  await caption([]);
  await page.evaluate(() => window.promoEnd(true));
  await at(DURATION_SECONDS);

  const head = (t0 - recordStart) / 1000;
  await context.close();
  await browser.close();
  server.close();

  const webm = readdirSync(work).find((file) => file.endsWith('.webm'));
  if (!webm) throw new Error('録画ファイルが作られませんでした');
  const source = join(work, webm);
  const out = join(here, 'promo.mp4');
  execFileSync('ffmpeg', [
    '-y', '-ss', head.toFixed(3), '-t', String(DURATION_SECONDS), '-i', source, '-i', wav,
    '-filter_complex', `[0:v]scale=${OUT.width}:${OUT.height}:flags=lanczos,fps=${DEFAULT_FPS},format=yuv420p[v]`,
    '-map', '[v]', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '22',
    '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', out, '-frames:v', '1', join(here, 'promo-first-frame.png')]);
  rmSync(work, { recursive: true, force: true });

  const duration = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString().trim();
  console.log(`promo.mp4 を作りました（${duration}秒・${OUT.width}×${OUT.height}）`);
  console.log(`頭の切り落とし ${head.toFixed(2)}秒 / 通信したホスト: ${[...seen].join(', ')}`);
  console.log('1コマ目は promo-first-frame.png。必ず目視すること。');
}

await main();
