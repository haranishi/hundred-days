/* Day 055 プロモ動画レンダラー（縦型1080×1920・32秒・BGM付き）
   実行: node day-055-kyaraben/tools/promo/render-promo.mjs */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  DURATION_SECONDS,
  DEFAULT_FPS,
  S1_PICK_START,
  S2_SPLIT_START,
  S3_ADJUST_START,
  S4_STEPS_START,
  S5_TEMPLATE_START,
  S6_END_START,
  CAPTIONS,
} from './timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = dirname(dirname(here));
const repoDir = dirname(appDir);
const VIEW = { width: 540, height: 960 };
const OUT = { width: 1080, height: 1920 };

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

const OVERLAY = `
  .promo-caption {
    position: fixed; left: 6%; right: 6%; bottom: 12%; margin: 0 auto; padding: 12px 18px 14px;
    border-radius: 16px; background: rgba(36, 32, 28, .92); color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", sans-serif;
    text-align: center; z-index: 9999; pointer-events: none;
    box-shadow: 0 10px 25px rgba(0, 0, 0, .3); transition: opacity 200ms ease;
  }
  #promo-lines { display: block; font-size: 24px; font-weight: 800; line-height: 1.45; }
  #promo-lines[data-on="0"] { opacity: 0; }
  .promo-caption:has(#promo-lines[data-on="0"]) { opacity: 0; }
  .promo-caption[data-pos="top"] { bottom: auto; top: 12%; }
  .promo-end {
    position: fixed; inset: 0; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 20px;
    text-align: center; padding: 0 36px; background: #FFFBF2; color: #2B2620; z-index: 10000;
    opacity: 0; transition: opacity 400ms ease; pointer-events: none;
    font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", sans-serif;
  }
  .promo-end[data-on="1"] { opacity: 1; }
  .promo-end strong { font-size: 42px; font-weight: 900; line-height: 1.2; color: #D84A38; }
  .promo-end em { font-style: normal; font-size: 22px; color: #6E6259; line-height: 1.6; }
  .promo-end .badge {
    display: inline-block; padding: 8px 16px; border-radius: 999px;
    background: #E8F5E9; color: #2E7D32; font-weight: 700; font-size: 18px;
  }
  .promo-end .footer-tag { font-size: 16px; color: #A09489; margin-top: 16px; }
`;

async function startServer() {
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://local').pathname);
      if (path === '/' || path.endsWith('/')) path += 'index.html';
      const file = join(appDir, path);
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
        .end(await readFile(file));
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function main() {
  const wav = join(here, 'promo-audio.wav');
  if (!existsSync(wav)) {
    execFileSync('node', [join(here, 'promo-audio.mjs')], { stdio: 'inherit' });
  }

  const server = await startServer();
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/`;
  const work = mkdtempSync(join(tmpdir(), 'day055-promo-'));

  let browser = null;
  try {
    const pwPath = pathToFileURL(new URL('../../../node_modules/playwright/index.mjs', import.meta.url).pathname).href;
    const { chromium } = await import(pwPath);

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: VIEW,
      deviceScaleFactor: 1,
      recordVideo: { dir: work, size: VIEW },
    });

    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForSelector('#sample-neko');

    // 字幕とエンド画面のスタイル注入
    await page.addStyleTag({ content: OVERLAY });
    await page.evaluate(() => {
      const box = document.createElement('aside');
      box.className = 'promo-caption';
      box.innerHTML = '<span id="promo-lines" data-on="0"></span>';
      document.body.appendChild(box);

      const end = document.createElement('div');
      end.className = 'promo-end';
      end.id = 'promo-end';
      end.innerHTML = `
        <span class="badge">登録不要・完全無料</span>
        <strong>キャラ弁設計図</strong>
        <em>絵を1枚えらぶと、材料と量・<br>段取り・実寸の型紙を出します</em>
        <div class="footer-tag">画像は端末内だけで処理・外部送信ゼロ</div>
      `;
      document.body.appendChild(end);

      window.promoCaption = (lines, pos = 'bottom') => {
        const span = document.getElementById('promo-lines');
        const aside = span.parentElement;
        aside.dataset.pos = pos;
        if (!lines || !lines.length) {
          span.dataset.on = '0';
          span.innerHTML = '';
          return;
        }
        span.innerHTML = lines.map((l) => `<span>${l}</span>`).join('<br>');
        span.dataset.on = '1';
      };

      window.promoEnd = (show) => {
        document.getElementById('promo-end').dataset.on = show ? '1' : '0';
      };
    });

    const recordStart = Date.now();
    let t0 = null;

    const at = async (targetSec) => {
      const elapsed = (Date.now() - t0) / 1000;
      const wait = targetSec - elapsed;
      if (wait > 0) await page.waitForTimeout(Math.round(wait * 1000));
    };

    const syncCaption = async (sec) => {
      const c = CAPTIONS.find((cap) => sec >= cap.start && sec < cap.end);
      await page.evaluate(({ lines, pos }) => {
        window.promoCaption(lines || [], pos || 'bottom');
      }, { lines: c?.lines || [], pos: c?.pos || 'bottom' });
    };

    // 初期安定化
    await page.waitForTimeout(600);
    t0 = Date.now();

    // S1 (0.0s): サンプルねこをクリック
    await syncCaption(0.5);
    await at(1.0);
    await page.click('#sample-neko');
    await page.waitForSelector('.templates svg', { timeout: 5000 });
    await at(S2_SPLIT_START);

    // S2 (5.0s): 食材への自動割り当てを見せる
    await syncCaption(S2_SPLIT_START + 0.5);
    await at(S3_ADJUST_START);

    // S3 (10.5s): 弁当箱を「大人」に変更
    await syncCaption(S3_ADJUST_START + 0.5);
    await page.click('input[name="box"][value="adult"]');
    await at(S3_ADJUST_START + 2.0);
    // 難易度を「かんたん」に変更
    await page.click('input[name="difficulty"][value="easy"]');
    await at(S4_STEPS_START);

    // S4 (16.0s): 手順へスムーズスクロール
    await syncCaption(S4_STEPS_START + 0.5);
    await page.evaluate(() => {
      document.getElementById('make').scrollIntoView({ behavior: 'smooth' });
    });
    await at(S4_STEPS_START + 2.5);
    // 買い物メモをコピー
    await page.click('#copy-memo');
    await at(S5_TEMPLATE_START);

    // S5 (22.0s): 型紙へスムーズスクロール
    await syncCaption(S5_TEMPLATE_START + 0.5);
    await page.evaluate(() => {
      document.getElementById('templates').scrollIntoView({ behavior: 'smooth' });
    });
    await at(S6_END_START);

    // S6 (27.5s): エンド画面
    await page.evaluate(() => {
      window.promoCaption([]);
      window.promoEnd(true);
    });
    await at(DURATION_SECONDS);

    const wall = (Date.now() - recordStart) / 1000;
    await context.close();
    await browser.close();
    browser = null;

    const webm = readdirSync(work).find((file) => file.endsWith('.webm'));
    if (!webm) throw new Error('録画ファイルが作られませんでした');
    const source = join(work, webm);
    const rawDur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', source]).toString().trim());
    console.log(`録画生ファイル: ${rawDur.toFixed(2)}秒 (実時間 ${wall.toFixed(2)}秒)`);

    const head = Math.max(0, (t0 - recordStart) / 1000);
    const out = join(here, 'promo.mp4');

    execFileSync('ffmpeg', [
      '-y', '-ss', head.toFixed(3), '-t', String(DURATION_SECONDS), '-i', source, '-i', wav,
      '-filter_complex', `[0:v]scale=${OUT.width}:${OUT.height}:flags=lanczos,fps=${DEFAULT_FPS},format=yuv420p[v]`,
      '-map', '[v]', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '22',
      '-c:a', 'aac', '-b:a', '160k', '-shortest', '-map_metadata', '-1', '-movflags', '+faststart', out
    ], { stdio: ['ignore', 'ignore', 'pipe'] });

    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', out, '-frames:v', '1', join(here, 'promo-first-frame.png')]);

    const finalDur = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString().trim();
    console.log(`promo.mp4 を出力しました（${finalDur}秒・${OUT.width}×${OUT.height}）: ${out}`);
    console.log(`1コマ目: ${join(here, 'promo-first-frame.png')}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.close();
    rmSync(work, { recursive: true, force: true });
  }
}

await main();
