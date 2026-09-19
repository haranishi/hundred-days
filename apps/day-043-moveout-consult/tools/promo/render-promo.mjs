// Day042の実画面録画方式を使用。時間割は絶対時刻、パンは返事を待たずに進める。
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setup, sampleSituation, sampleBreakdown, sampleDocuments } from '../../demo-scenario.mjs';
import { CAPTIONS, DURATION_SECONDS } from './timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const work = mkdtempSync(join(tmpdir(), 'day043-promo-'));
const view = { width: 540, height: 960 };
const wav = join(here, 'promo-audio.wav');
if (!existsSync(wav)) execFileSync('node', [join(here, 'promo-audio.mjs')], { stdio: 'inherit' });
for (const caption of CAPTIONS) {
  if (caption.lines.length > 2 || caption.lines.some((line) => [...line].length > 16)) throw new Error('字幕の文字数を確認してください');
}
const browser = await chromium.launch();
let server;
try {
  const context = await browser.newContext({ viewport: view, locale: 'ja-JP', permissions: ['clipboard-read', 'clipboard-write'], recordVideo: { dir: work, size: view } });
  const recordStart = Date.now();
  const page = await context.newPage();
  const external = [];
  await page.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname;
    if (host !== '127.0.0.1' && host !== 'localhost') { external.push(host); return route.abort(); }
    return route.continue();
  });
  server = await setup(page);
  await sampleSituation(page); await page.locator('#next').click(); await sampleBreakdown(page);
  await page.locator('#next').click(); await sampleDocuments(page);
  await page.locator('[data-step="0"]').click();
  if (await page.locator('#memo-invoice').textContent() !== '120,000円') throw new Error('入力例とメモが異なります');
  await page.addStyleTag({ content: `
    .promo-caption { position:fixed;left:10%;right:10%;bottom:11%;padding:15px 12px;background:#205749;color:#fffefa;border-radius:8px;font:600 24px/1.6 "Hiragino Kaku Gothic ProN",sans-serif;text-align:center;z-index:30;pointer-events:none;box-shadow:0 6px 22px #152f2222; }
    .promo-sample { position:fixed;top:11%;right:10%;padding:6px 10px;background:#fffefa;color:#253e35;border:1px solid #7b8c80;border-radius:4px;font:11px/1.4 sans-serif;z-index:29;pointer-events:none; }
    .promo-end { position:fixed;inset:0;background:#f6f5ef;color:#253e35;z-index:40;display:grid;place-content:center;text-align:center;padding:54px;gap:25px;opacity:0;transition:opacity .4s;pointer-events:none; }
    .promo-end[data-on] { opacity:1; }
    .promo-end strong { font:600 44px/1.7 "Hiragino Mincho ProN",serif; }
    .promo-end p { font:16px/1.9 sans-serif; }
    .promo-end small { font:12px/1.6 sans-serif;letter-spacing:.1em; }
  ` });
  await page.evaluate(() => {
    const caption = document.createElement('p'); caption.className = 'promo-caption';
    const sample = document.createElement('span'); sample.className = 'promo-sample'; sample.textContent = '入力例・架空の金額';
    const end = document.createElement('div'); end.className = 'promo-end';
    const title = document.createElement('strong'); title.append('退去費用、', document.createElement('br'), '相談の準備');
    const copy = document.createElement('p'); copy.append('わかることから、相談できる形に。', document.createElement('br'), '無料・登録不要');
    const note = document.createElement('p'); note.textContent = '請求の妥当性は判断しません。';
    const day = document.createElement('small'); day.textContent = 'DAY 043 / 100';
    end.append(title, copy, note, day); document.body.append(caption, sample, end);
    window.promoCaption = (lines) => { caption.replaceChildren(); for (const line of lines) { const span = document.createElement('span'); span.textContent = line; caption.append(span); } };
  });
  const pan = async (selector, offset, ms) => page.evaluate(([selector, offset, duration]) => {
    const from = scrollY; const to = document.querySelector(selector).getBoundingClientRect().top + scrollY - offset;
    const start = performance.now(); const generation = window.panGeneration = (window.panGeneration || 0) + 1;
    const frame = (now) => {
      if (generation !== window.panGeneration) return;
      const k = Math.min(1, (now - start) / duration); const ease = k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      scrollTo(0, from + (to - from) * ease); if (k < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, [selector, offset, ms]);
  await page.evaluate(() => scrollTo(0, 0));
  await page.evaluate((lines) => window.promoCaption(lines), CAPTIONS[0].lines);
  await pan('#invoice', 190, 2400); await page.waitForTimeout(700);
  const t0 = Date.now();
  const at = async (second) => { const ms = t0 + second * 1000 - Date.now(); if (ms > 0) await page.waitForTimeout(ms); };
  const caption = async (at) => page.evaluate((lines) => window.promoCaption(lines), CAPTIONS.find((c) => c.at === at).lines);
  await at(3); await caption(3);
  await at(7); await page.locator('[data-step="1"]').click(); await caption(7);
  await at(9.2); await pan('.concerns', 170, 1100);
  await at(12); await page.locator('[data-step="2"]').click(); await caption(12);
  await at(14); await pan('#document-fields .document-row:nth-child(3)', 200, 900);
  await at(17); await page.locator('#next').click(); await caption(17);
  await at(19.5); await pan('#memo-questions', 250, 1400);
  await at(23); await pan('.export-area', 300, 900); await caption(23);
  await at(24.2); await page.locator('#copy-memo').click();
  await page.waitForFunction(() => document.querySelector('#export-status').textContent.includes('コピーしました'), undefined, { timeout: 1800 });
  if (!(await page.locator('#export-status').textContent()).includes('コピーしました')) throw new Error('コピー成功を確認できません');
  await at(27); await page.evaluate(() => { document.querySelector('.promo-end').dataset.on = ''; });
  await at(DURATION_SECONDS + .3);
  await context.close();
  const raw = join(work, readdirSync(work).find((file) => file.endsWith('.webm')));
  const head = (t0 - recordStart) / 1000;
  const out = join(here, 'promo.mp4');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', head.toFixed(3), '-t', String(DURATION_SECONDS), '-i', raw, '-i', wav,
    '-vf', 'scale=1080:1920:flags=lanczos,fps=30,format=yuv420p', '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
    '-c:a', 'aac', '-b:a', '160k', '-shortest', '-map_metadata', '-1', '-movflags', '+faststart', out]);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', out, '-frames:v', '1', join(here, 'promo-first-frame.png')]);
  console.log(`30秒・1080×1920のプロモを作成。外部リクエスト: ${external.length}件。`);
  // このスクリプト自身が作った一時録画ディレクトリだけを片付ける。
  rmSync(work, { recursive: true, force: true });
} finally { await browser.close(); server?.close(); }
