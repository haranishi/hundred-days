/* プロモ動画（縦型1080×1920・34秒・BGM付き）を作る。絵コンテは timeline.mjs、音は promo-audio.mjs。
   Day 044 の道具を土台に、アプリを実際に操作して録画する（合成した画は足さない）。

   実行（リポジトリ直下で）:
     node day-054-what-vanished/tools/promo/render-promo.mjs
     PLAYWRIGHT=/path/to/playwright/index.js node day-054-what-vanished/tools/promo/render-promo.mjs

   - 3Dは実GPUの headed で撮る（headless のソフトウェア描画ではコマが間引かれ、絵と音がずれる。
     Metal を使う headless でも、録画が画面の左上4分の1だけになり残りが灰色で埋まった＝2倍密度が効かない）
   - Day のフォルダを空きポートで自分で配り、127.0.0.1 以外への通信は断って最後に報告する
   - 字幕の数字（60秒・3問・3段）は書き出し前に画面の文字と突き合わせ、食い違えば止まる
   - 頭の切り落としは、書き出した録画から字幕の入れ替わり時刻を読んで決める */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ANSWER_START, CAPTIONS, CLOSE_START, DEFAULT_FPS, DURATION_SECONDS, END_START,
  LOOK_START, NEXT_START, OPEN_START, REVEAL_START } from './timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = dirname(dirname(here));
const repoDir = dirname(appDir);
const VIEW = { width: 540, height: 960 };
const OUT = { width: 1080, height: 1920 };
const SEED_HASH = '#c-e-6';   // かんたん・家の番号6：1問目で大きな振り子時計が消える
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.glb': 'model/gltf-binary' };

/* 字幕の箱は、主ボタンと見取り図の段（下端から約230px）より上、画面の下寄りに置く。
   色はアプリと同じ（墨 #1f1a16・夕日のだいだい #e86f26）。差し込む要素は pointer-events: none。 */
const OVERLAY = `
  .promo-caption {
    position: fixed; left: 6%; right: 6%; bottom: 29%; margin: 0 auto; padding: 12px 16px 14px;
    border-radius: 16px; background: rgba(31, 26, 22, .92); color: #fff;
    font-family: "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif; text-align: center;
    z-index: 9999; pointer-events: none; box-shadow: 0 12px 30px rgba(0, 0, 0, .3);
  }
  #promo-lines { display: block; font-size: 27px; font-weight: 800; line-height: 1.45; min-height: 39px; }
  #promo-lines[data-on="0"] { opacity: 0; }
  .promo-caption:has(#promo-lines[data-on="0"]) { opacity: 0; }
  .promo-caption[data-pos="top"] { bottom: auto; top: 7%; }
  .promo-end {
    position: fixed; inset: 0; display: grid; place-content: center; gap: 16px; text-align: center; padding: 0 44px;
    background: #fffcf6; color: #1f1a16; z-index: 10000; opacity: 0; transition: opacity 420ms ease; pointer-events: none;
    font-family: "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif;
  }
  .promo-end[data-on="1"] { opacity: 1; }
  .promo-end strong { font-size: 50px; font-weight: 900; line-height: 1.15; }
  .promo-end em { font-style: normal; font-size: 24px; color: #5a4e44; line-height: 1.6; }
  .promo-end span { font-size: 18px; color: #b24f16; letter-spacing: .12em; font-weight: 700; }
`;

function captionSwitches(file, rect, { seek = 0, limit = DURATION_SECONDS } = {}) {
  const W = 96, H = 12, FPS = 20;
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-ss', seek.toFixed(3), ...(limit ? ['-t', String(limit)] : []), '-i', file,
    '-vf', `crop=iw*${rect.w}:ih*${rect.h}:iw*${rect.x}:ih*${rect.y},scale=${W}:${H},format=gray`,
    '-r', String(FPS), '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 });
  const size = W * H;
  const found = [], peaks = [];
  for (let i = 1; i < Math.floor(raw.length / size); i++) {
    let diff = 0;
    for (let j = 0; j < size; j++) diff += Math.abs(raw[i * size + j] - raw[(i - 1) * size + j]);
    const mean = diff / size;
    peaks.push(mean);
    if (mean > 15) found.push(i / FPS);
  }
  return { switches: found.filter((t, i) => i === 0 || t - found[i - 1] > 0.3), quiet: Math.max(0, ...peaks.filter((m) => m <= 15)) };
}

async function serveApp() {
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://local').pathname);
      if (path.endsWith('/')) path += 'index.html';
      res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' }).end(await readFile(join(appDir, path)));
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}/` };
}

async function main() {
  const spec = process.env.PLAYWRIGHT || join(repoDir, 'node_modules/playwright/index.js');
  const mod = await import(spec.startsWith('/') ? pathToFileURL(spec).href : spec);
  const chromium = mod.chromium ?? mod.default?.chromium;
  if (!chromium) throw new Error('Playwright を読み込めませんでした');
  for (const cmd of ['ffmpeg', 'ffprobe']) execFileSync('which', [cmd], { stdio: 'ignore' });
  for (const caption of CAPTIONS) {
    if (caption.lines.length > 2 || caption.lines.some((line) => [...line].length > 16)) throw new Error('字幕は1行16字・2行まで');
  }
  const wav = join(here, 'promo-audio.wav');
  if (!existsSync(wav)) execFileSync('node', [join(here, 'promo-audio.mjs'), '--variant', 'a'], { stdio: 'inherit' });

  const { server, base } = await serveApp();
  const work = mkdtempSync(join(tmpdir(), 'day054-promo-'));
  let browser;
  try {
    const headless = process.env.PROMO_HEADLESS === '1';
    browser = await chromium.launch({ headless, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
    const context = await browser.newContext({
      viewport: VIEW, deviceScaleFactor: 2, locale: 'ja-JP', reducedMotion: 'no-preference',
      recordVideo: { dir: work, size: OUT }
    });
    const recordStart = Date.now();
    const page = await context.newPage();
    const blocked = new Set();
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
      blocked.add(url.host);
      return route.abort();
    });
    await page.goto(`${base}${SEED_HASH}`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.dataset.ready === 'true', null, { timeout: 90000 });
    await page.waitForTimeout(900);

    await page.addStyleTag({ content: OVERLAY });
    await page.evaluate(() => {
      const caption = document.createElement('p');
      caption.className = 'promo-caption';
      const lines = document.createElement('span');
      lines.id = 'promo-lines';
      lines.dataset.on = '0';
      caption.append(lines);
      const end = document.createElement('div');
      end.className = 'promo-end';
      const title = document.createElement('strong');
      title.append('消えたのは、', document.createElement('br'), 'どれ？');
      const copy = document.createElement('em');
      copy.append('3Dの家を歩いて覚えて、', document.createElement('br'), 'みんなで当てる間違い探し');
      const foot = document.createElement('span');
      foot.textContent = 'DAY 054 / 100';
      end.append(title, copy, foot);
      document.body.append(caption, end);
      window.promoCaption = (rows, pos = 'bottom') => {
        caption.dataset.pos = pos;
        lines.dataset.on = rows.length ? '1' : '0';
        lines.replaceChildren();
        rows.forEach((row, index) => { if (index) lines.append(document.createElement('br')); lines.append(row); });
      };
      window.promoEnd = (on) => { end.dataset.on = on ? '1' : '0'; };
    });
    const lineRect = await page.locator('#promo-lines').evaluate((el, view) => {
      el.dataset.on = '1';
      el.textContent = '測る';
      const r = el.getBoundingClientRect();
      el.textContent = '';
      el.dataset.on = '0';
      return { x: (r.x + 4) / view.width, y: (r.y + 2) / view.height, w: (r.width - 8) / view.width, h: (r.height - 4) / view.height };
    }, VIEW);

    const expectText = async (selector, needle) => {
      const text = (await page.locator(selector).textContent()) ?? '';
      if (!text.includes(needle)) throw new Error(`画面と字幕が食い違っています: "${needle}" が ${selector} に無い（実際は "${text.trim().slice(0, 80)}"）`);
    };
    const phase = () => page.evaluate(() => window.__day054.game?.phase);
    const look = async (dx, ms) => {
      const x0 = VIEW.width / 2;
      const y0 = VIEW.height * 0.42;
      await page.mouse.move(x0, y0);
      await page.mouse.down();
      const n = Math.max(10, Math.round(ms / 28));
      for (let i = 1; i <= n; i++) {
        await page.mouse.move(x0 + (dx * i) / n, y0);
        await page.waitForTimeout(ms / n);
      }
      await page.mouse.up();
    };

    // 始める。「1問目」の帯（2.4秒）が消えて歩き出したところを t0（1コマ目）にする
    await page.click('#start');
    await page.waitForFunction(() => window.__day054.game?.phase === 'memorize', null, { timeout: 20000 });
    await expectText('#timer', '60');
    await expectText('#round-no', '/ 3');
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(240);
    const t0 = Date.now();
    await page.evaluate((rows) => window.promoCaption(rows), CAPTIONS[0].lines);
    const at = async (seconds) => {
      const wait = t0 + seconds * 1000 - Date.now();
      if (wait > 0) await page.waitForTimeout(wait);
    };
    let captionIndex = 0;
    const syncCaption = async (t) => {
      const index = CAPTIONS.findIndex(({ start, end }) => t >= start && t < end);
      if (index !== captionIndex) {
        captionIndex = index;
        // 候補を選ぶ場面は札が画面の中ほどまで来るので、字幕を上に置く
        const pos = index >= 0 && CAPTIONS[index].start === ANSWER_START ? 'top' : 'bottom';
        await page.evaluate(([rows, where]) => window.promoCaption(rows, where), [index >= 0 ? CAPTIONS[index].lines : [], pos]);
      }
    };

    // S0 廊下を歩く（奥に大きな振り子時計）
    await at(1.25);
    await page.keyboard.up('KeyW');
    // S1 左へ振り向いてリビングをのぞき、また奥の時計へ向き直る
    // 出入口から部屋の中が見えるよう、ほぼ真横（約90度）まで振り向く。
    // ドラッグは1.1秒の予定でも、マウスを動かす往復のぶん実測1.5秒かかるので、字幕より1.6秒前に始める
    await at(LOOK_START - 1.6);
    await look(410, 1100);
    await at(LOOK_START); await syncCaption(LOOK_START);
    await at(LOOK_START + 2.2);
    await look(-410, 1100);
    // S2 覚えた → 目を閉じる
    await at(CLOSE_START - 0.05);
    await page.click('#primary');
    await at(CLOSE_START); await syncCaption(CLOSE_START);
    if (await phase() !== 'closing') throw new Error('目を閉じる場面に入っていません');
    // S3 目を開けると時計が無い。少し止めてから奥へ歩く
    await page.waitForFunction(() => window.__day054.game?.phase === 'search', null, { timeout: 8000 });
    await at(OPEN_START); await syncCaption(OPEN_START);
    if (!await page.evaluate(() => window.__day054.hidden('grandfather-clock'))) throw new Error('時計が消えていません');
    await at(OPEN_START + 1.6);
    await page.keyboard.down('KeyW');
    await at(OPEN_START + 3.4);
    await page.keyboard.up('KeyW');
    // S4 わかった → 候補から選ぶ
    await at(ANSWER_START - 0.3);
    await page.click('#primary');
    await at(ANSWER_START); await syncCaption(ANSWER_START);
    await page.waitForSelector('.choice[data-id="grandfather-clock"]');
    await at(REVEAL_START - 1.2);
    await page.click('.choice[data-id="grandfather-clock"]');
    // S5 決める → 消えた場所へ視点が飛ぶ
    await at(REVEAL_START - 0.05);
    await page.click('#confirm');
    await at(REVEAL_START); await syncCaption(REVEAL_START);
    await at(REVEAL_START + 2.6);
    await expectText('#reveal-verdict', '正解');
    // S6 2問目へ
    await at(NEXT_START - 0.3);
    await page.click('#next');
    await at(NEXT_START); await syncCaption(NEXT_START);
    await expectText('#ready-round', '2問目');
    await expectText('#round-no', '/ 3');
    const levels = await page.locator('input[name="level"]').count();
    if (levels !== 3) throw new Error(`むずかしさの数が ${levels}（字幕は3段）`);
    await at(END_START);
    await page.evaluate(() => { window.promoCaption([]); window.promoEnd(true); });
    await at(DURATION_SECONDS);

    const wall = (Date.now() - recordStart) / 1000;
    await context.close();
    await browser.close();
    browser = null;

    const webm = readdirSync(work).find((file) => file.endsWith('.webm'));
    if (!webm) throw new Error('録画ファイルが作られませんでした');
    const source = join(work, webm);
    const raw = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', source]).toString().trim());
    console.log(`録画 ${raw.toFixed(2)}秒 / 実時間 ${wall.toFixed(2)}秒（差 ${(wall - raw).toFixed(2)}秒）`);

    const marks = [0, ...CAPTIONS.slice(1).map(({ start }) => start), END_START];
    const all = captionSwitches(source, lineRect, { limit: null }).switches;
    const tail = all.slice(-marks.length);
    let head = (t0 - recordStart) / 1000;
    const gaps = tail.length === marks.length ? tail.map((got, i) => got - tail[0] - marks[i]) : null;
    const worst = gaps ? Math.max(...gaps.map(Math.abs)) : null;
    if (gaps && worst <= 0.5) {
      console.log(`切り出しの下読み: 録画の ${tail[0].toFixed(2)}秒が t0（実時間の見積もりは ${head.toFixed(2)}秒）／並びのずれ 最大 ${worst.toFixed(2)}秒`);
      head = tail[0];
    } else {
      console.log(`切り出しの下読み: 字幕の並びを読み取れませんでした（拾えた ${all.length}回・ずれ ${worst?.toFixed(2) ?? '—'}秒）。実時間で切ります。`);
    }

    const out = join(here, 'promo.mp4');
    execFileSync('ffmpeg', [
      '-y', '-ss', head.toFixed(3), '-t', String(DURATION_SECONDS), '-i', source, '-i', wav,
      '-filter_complex', `[0:v]scale=${OUT.width}:${OUT.height}:flags=lanczos,fps=${DEFAULT_FPS},format=yuv420p[v]`,
      '-map', '[v]', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '22',
      '-c:a', 'aac', '-b:a', '160k', '-shortest', '-map_metadata', '-1', '-movflags', '+faststart', out
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', out, '-frames:v', '1', join(here, 'promo-first-frame.png')]);

    const expected = [...CAPTIONS.slice(1).map(({ start }) => start), END_START];
    const { switches, quiet } = captionSwitches(out, lineRect, {});
    const rows = expected.map((want, i) => ({ want, got: switches[i] }));
    const off = rows.filter(({ want, got }) => got === undefined || Math.abs(got - want) > 0.4);
    console.log(`字幕の入れ替わり: ${rows.map(({ want, got }) => `${want}→${got?.toFixed(2) ?? 'なし'}`).join(' / ')}`);
    console.log(`字幕の箱の裏の透け（最大）: ${quiet.toFixed(1)}（しきい値 15）`);
    if (off.length || switches.length !== expected.length) {
      throw new Error(`字幕が絵とずれています（${out} は残してあります）。`
        + `ずれた場面: ${off.map(({ want, got }) => `${want}秒→${got?.toFixed(2) ?? 'なし'}`).join('、')}`
        + `${switches.length !== expected.length ? `／入れ替わりの数 ${switches.length}（予定 ${expected.length}）` : ''}`);
    }
    const duration = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString().trim();
    console.log(`promo.mp4 を作りました（${duration}秒・${OUT.width}×${OUT.height}）`);
    console.log(`頭の切り落とし ${head.toFixed(2)}秒 / 断った宛先: ${[...blocked].join(', ') || 'なし'}`);
    console.log('1コマ目は promo-first-frame.png。必ず目視すること。');
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.close();
    rmSync(work, { recursive: true, force: true });
  }
}

await main();
