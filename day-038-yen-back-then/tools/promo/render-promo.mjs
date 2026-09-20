/* プロモ動画（縦型1080×1920・35秒・BGM付き）を作る。
   絵コンテは timeline.mjs、音は promo-audio.mjs。この3つで完結する。

   実行:
     PLAYWRIGHT=/path/to/playwright/index.js node day-038-yen-back-then/tools/promo/render-promo.mjs

   Day 035〜037 と同じく、アプリを実際に操作して録画する。物価指数は保存しておいた実応答に
   差し替えるので、撮り直しても数字が変わらない（相手のサーバーも叩かない）。 */

import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ANSWER_START, CAPTIONS, CAVEAT_START, CHART_START, COINS_START, DURATION_SECONDS,
  DEFAULT_FPS, END_START, FACTS_START, NEAR_START, T_CONFIRM_TAP } from './timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = dirname(dirname(here));
const VIEW = { width: 540, height: 960 };
const OUT = { width: 1080, height: 1920 };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json; charset=utf-8' };

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
   透明でもクリックを奪い、ボタンが押せなくなる（Day 035 で踏んだ） */
const OVERLAY = `
  .promo-caption {
    position: fixed; left: 6%; right: 6%; bottom: 11%; margin: 0 auto; max-width: 88%;
    padding: 14px 20px; border-radius: 14px; background: rgba(30, 28, 24, .93);
    color: #fffdf7; font-family: "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif;
    font-size: 29px; font-weight: 700; line-height: 1.45; text-align: center;
    letter-spacing: .01em; opacity: 0; transition: opacity 260ms ease; z-index: 9999; pointer-events: none;
    box-shadow: 0 10px 28px rgba(30, 28, 24, .3);
  }
  .promo-caption[data-on="1"] { opacity: 1; }
  .promo-end {
    position: fixed; inset: 0; display: grid; place-content: center; gap: 16px; text-align: center;
    background: #f3efe6; color: #1e1c18; z-index: 10000; opacity: 0; transition: opacity 420ms ease; pointer-events: none;
    font-family: "Hiragino Sans", system-ui, sans-serif;
  }
  .promo-end[data-on="1"] { opacity: 1; }
  .promo-end strong { font-size: 52px; letter-spacing: .08em; font-weight: 700; line-height: 1.3; }
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
  const work = mkdtempSync(join(tmpdir(), 'day038-promo-'));
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

  const fixture = await readFile(join(appDir, 'tests', 'fixtures', 'worldbank-cpi.json'), 'utf8');
  await page.route('https://api.worldbank.org/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: fixture }));

  await page.goto(base, { waitUntil: 'load' });
  await page.waitForSelector('#app[data-state="ready"]', { timeout: 25000 });
  await page.addStyleTag({ content: OVERLAY });
  await page.evaluate(() => {
    const caption = document.createElement('p');
    caption.className = 'promo-caption';
    const end = document.createElement('div');
    end.className = 'promo-end';
    end.innerHTML =
      '<strong>昔の1000円、<br>いまいくら</strong>' +
      '<em>年を選ぶと、そのころのお金が今の何円かが出る</em>' +
      '<span>hundred-days.pages.dev／DAY 038</span>';
    document.body.append(caption, end);
    window.promoCaption = (lines) => {
      caption.dataset.on = lines.length ? '1' : '0';
      caption.innerHTML = lines.map((line) => `<span>${line}</span>`).join('<br>');
    };
    window.promoEnd = (on) => { end.dataset.on = on ? '1' : '0'; };
  });

  /* 送り先を、上からの位置で指定する。見せたいのが節の途中なので scrollIntoView では足りない */
  const scrollTo = (selector, offset = 0) =>
    page.evaluate(([sel, off]) => {
      const target = document.querySelector(sel);
      const top = target.getBoundingClientRect().top + window.scrollY - off;
      window.scrollTo({ top, behavior: 'smooth' });
    }, [selector, offset]);

  const setYear = (year) => page.evaluate((value) => {
    const el = document.querySelector('#year');
    el.value = String(value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, year);

  const slide = async (from, to, stepMs) => {
    const step = to >= from ? 1 : -1;
    for (let year = from; step > 0 ? year <= to : year >= to; year += step) {
      await setYear(year);
      await page.waitForTimeout(stepMs);
    }
  };

  /* 1コマ目を「年が動いている途中」にするため、時間割の0秒より前に送り始める。
     頭の切り落としは録画開始と t0 の差で測る（下の head） */
  await scrollTo('#answer', 24);
  await setYear(1995);
  await page.waitForTimeout(500);
  const sliding = slide(1994, 1960, 92);
  await page.waitForTimeout(800);

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
  await sliding;

  /* S1 答え：6,222円で止まったところを見せる */
  await at(ANSWER_START); await syncCaption(ANSWER_START);
  await at(5.6); await syncCaption(5.6);

  /* S2 丸：1960年は6倍以上の差が付く */
  await at(COINS_START); await syncCaption(COINS_START);
  await scrollTo('#coins', 40);
  await at(10.4); await syncCaption(10.4);

  /* S3 近い年：飛び石で2000年へ。差が一気に縮む */
  await at(NEAR_START); await syncCaption(NEAR_START);
  await scrollTo('#jumps', 320);
  await at(T_CONFIRM_TAP);
  await page.click('.jump[data-year="2000"]');
  await scrollTo('#answer', 24);
  await at(15.8); await syncCaption(15.8);

  /* S4 折れ線：止まっていた期間が塗られる */
  await at(CHART_START); await syncCaption(CHART_START);
  await scrollTo('#chart-section', 60);

  /* S5 分かったこと */
  await at(FACTS_START); await syncCaption(FACTS_START);
  await scrollTo('#facts', 60);
  await at(26.0); await syncCaption(26.0);

  /* S6 ことわり：この数字が言っていないこと */
  await at(CAVEAT_START); await syncCaption(CAVEAT_START);
  await scrollTo('.limits', 60);

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
