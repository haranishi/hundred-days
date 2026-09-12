/* プロモ動画（縦型1080×1920・34秒・BGM付き）を作る。
   絵コンテは timeline.mjs、音は promo-audio.mjs。この3つで完結する。

   実行:
     PLAYWRIGHT=/path/to/playwright/index.js node apps/day-036-stroke-by-stroke/tools/promo/render-promo.mjs

   Day 035 と同じく、1コマずつHTMLを合成するのではなくアプリを実際に操作して録画する。
   このアプリは外へ何も送らないので、差し替える中継は無い。

   🔴 録画コンテキストに reducedMotion: 'reduce' を渡してはいけない。このアプリは
   「動きを減らす」設定のときアニメーションを飛ばして完成形だけを出すので、
   筆が動くところが1コマも撮れなくなる。 */

import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CAPTIONS, DURATION_SECONDS, DEFAULT_FPS, BRUSH_START, END_START, GUIDE_START,
  PROMISE_START, SAVE_START, SLOW_START, TITLE_START, T_CONFIRM_TAP } from './timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = dirname(dirname(here));
const VIEW = { width: 540, height: 960 };
const OUT = { width: 1080, height: 1920 };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json; charset=utf-8' };

/* 1本目は「書き順が怪しい字」の代表として飛。2本目は名前らしい2字。
   どちらも画数と所要時間を timeline.mjs の場面に合わせて選んである。 */
const HOOK_WORD = '飛';
const NAME_WORD = '結衣';
/* 録画の1コマ目を「筆が動いているところ」にするため、時間割の0秒より前に書き始める */
const HEAD_LEAD_MS = 1000;

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
   透明でもクリックを奪い、「書く」が押せなくなる（Day 035 で踏んだ） */
const OVERLAY = `
  .promo-caption {
    position: fixed; left: 6%; right: 6%; bottom: 11%; margin: 0 auto; max-width: 88%;
    padding: 14px 20px; border-radius: 14px; background: rgba(27, 27, 27, .92);
    color: #f7f3ea; font-family: "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif;
    font-size: 29px; font-weight: 700; line-height: 1.45; text-align: center;
    letter-spacing: .01em; opacity: 0; transition: opacity 260ms ease; z-index: 9999; pointer-events: none;
    box-shadow: 0 10px 28px rgba(27, 27, 27, .28);
  }
  .promo-caption[data-on="1"] { opacity: 1; }
  .promo-end {
    position: fixed; inset: 0; display: grid; place-content: center; gap: 16px; text-align: center;
    background: #efe9dc; color: #1b1b1b; z-index: 10000; opacity: 0; transition: opacity 420ms ease; pointer-events: none;
    font-family: "Hiragino Sans", system-ui, sans-serif;
  }
  .promo-end[data-on="1"] { opacity: 1; }
  .promo-end strong { font-size: 66px; letter-spacing: .18em; font-weight: 700; }
  .promo-end em { font-style: normal; font-size: 27px; color: #3a3a3a; }
  .promo-end span { font-size: 24px; color: #6b6455; letter-spacing: .04em; }
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
  const work = mkdtempSync(join(tmpdir(), 'day036-promo-'));
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEW,
    locale: 'ja-JP',
    reducedMotion: 'no-preference',
    recordVideo: { dir: work, size: VIEW }
  });
  const recordStart = Date.now();
  const page = await context.newPage();
  const seen = new Set();
  page.on('request', (r) => seen.add(new URL(r.url()).host));

  await page.addInitScript(() => localStorage.removeItem('day-036-stroke-by-stroke'));
  await page.goto(base, { waitUntil: 'load' });
  await page.addStyleTag({ content: OVERLAY });
  await page.evaluate(() => {
    const caption = document.createElement('p');
    caption.className = 'promo-caption';
    const end = document.createElement('div');
    end.className = 'promo-end';
    end.innerHTML = '<strong>一画ずつ</strong><em>打った言葉が、筆順どおりに書かれていく</em><span>hundred-days.pages.dev／DAY 036</span>';
    document.body.append(caption, end);
    window.promoCaption = (lines) => {
      caption.dataset.on = lines.length ? '1' : '0';
      caption.innerHTML = lines.map((line) => `<span>${line}</span>`).join('<br>');
    };
    window.promoEnd = (on) => { end.dataset.on = on ? '1' : '0'; };
  });

  const write = async (word) => {
    await page.fill('#word', word);
    await page.click('#write');
  };
  const board = () => page.evaluate(() =>
    document.querySelector('#board-wrap').scrollIntoView({ behavior: 'smooth', block: 'center' }));

  /* 時間割の0秒より前に書き始める。1コマ目を筆が動いているところにするため */
  await write(HOOK_WORD);
  await page.waitForTimeout(HEAD_LEAD_MS);

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

  /* S1 タイトル：1本目が書き上がる */
  await at(TITLE_START); await syncCaption(TITLE_START);

  /* S2 ゆっくり：速さを落として同じ字を書き直す。筆の運びが見える */
  await at(SLOW_START); await syncCaption(SLOW_START);
  await page.click('.speed-btn[data-speed="slow"]');
  await at(SLOW_START + 0.5);
  await page.click('#replay');
  await board();
  await at(9.8); await syncCaption(9.8);

  /* S3 筆づかい：入りと終わりを見せてから、はやいに上げて名前を続ける */
  await at(BRUSH_START); await syncCaption(BRUSH_START);
  await at(15.0);
  await page.click('.speed-btn[data-speed="fast"]');
  await at(16.4); await syncCaption(16.4);
  await write(NAME_WORD);
  await board();

  /* S4 番号と下書き：書いている途中で下書きを消して、戻す */
  await at(GUIDE_START); await syncCaption(GUIDE_START);
  await at(GUIDE_START + 1.0);
  await page.uncheck('#toggle-guide');
  await at(22.2); await syncCaption(22.2);
  await page.check('#toggle-guide');
  await page.waitForSelector('#app[data-state="done"]', { timeout: 8000 });

  /* S5 保存：書き上がった盤面をPNGで保存する */
  await at(SAVE_START); await syncCaption(SAVE_START);
  await page.evaluate(() =>
    document.querySelector('#ready-actions').scrollIntoView({ behavior: 'smooth', block: 'center' }));
  await at(T_CONFIRM_TAP);
  const download = page.waitForEvent('download').catch(() => null);
  await page.click('#save-png');
  await download;

  /* S6 約束：端末から出ないことを書いてある脚注まで下りる */
  await at(PROMISE_START); await syncCaption(PROMISE_START);
  await page.evaluate(() =>
    document.querySelector('.site-foot').scrollIntoView({ behavior: 'smooth', block: 'end' }));

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
