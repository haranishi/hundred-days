/* プロモ動画（縦型1080×1920・30秒・BGM付き）を作る。
   絵コンテは timeline.mjs、音は promo-audio.mjs。この3つで完結する。

   実行:
     node day-044-train-here/tools/promo/render-promo.mjs
     PLAYWRIGHT=/path/to/playwright/index.js node day-044-train-here/tools/promo/render-promo.mjs

   Day 035〜043 と同じく、アプリを実際に操作して録画する。合成した画は足さない。
   このDayは公開版そのままの架空デモで撮る。実データには接続せず、
   アプリのローカル配信（tools/serve.mjs）を専用ポートで自分で起こし、自分で止める。
   外に出る通信は1本も無い（127.0.0.1 以外は断ち、断った宛先を最後に報告する）。 */

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CAPTIONS, CITY_START, DEFAULT_FPS, DEMO_START, DURATION_SECONDS, END_START,
  FOLLOW_START, PICK_START, PLACE_START, RIDE_START } from './timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = dirname(dirname(here));
const repoDir = dirname(appDir);
const VIEW = { width: 540, height: 960 };
const OUT = { width: 1080, height: 1920 };
const PORT = Number(process.env.DAY044_PROMO_PORT || 8451);
const TRAIN = 'demo-yamanote-0';

/* 差し込む要素には pointer-events: none が要る。画面いっぱいのエンド画面が
   透明でもクリックを奪い、ボタンが押せなくなる（Day 035 で踏んだ）。
   字幕の箱は「選んだ編成の情報（bottom:146px）」と「再生バー」の上に置く。
   下端に置くと情報カードに重なり、上端に置くとカメラ操作の列に重なる。
   色はアプリの app.css と同じもの（紙 #f4f7ed・墨 #223026・DEMO の琥珀 #8b5b26）。 */
const OVERLAY = `
  .promo-caption {
    position: fixed; left: 4.5%; right: 4.5%; bottom: 35%; margin: 0 auto;
    padding: 11px 18px 15px; border-radius: 14px; background: #223026;
    color: #f7faf1; font-family: "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif;
    text-align: center; z-index: 9999; pointer-events: none;
    box-shadow: 0 12px 30px rgba(34, 48, 38, .28);
  }
  .promo-mark {
    display: block; font-size: 13px; font-weight: 650; letter-spacing: .14em;
    color: #f0c98d; margin-bottom: 8px;
  }
  #promo-lines { display: block; font-size: 26px; font-weight: 700; line-height: 1.5; letter-spacing: .01em; min-height: 39px; }
  #promo-lines[data-on="0"] { opacity: 0; }
  .promo-end {
    position: fixed; inset: 0; display: grid; place-content: center; gap: 18px; text-align: center; padding: 0 40px;
    background: #f4f7ed; color: #223026; z-index: 10000; opacity: 0; transition: opacity 420ms ease; pointer-events: none;
    font-family: "Hiragino Sans", system-ui, sans-serif;
  }
  .promo-end[data-on="1"] { opacity: 1; }
  .promo-end strong { font-size: 46px; letter-spacing: .04em; font-weight: 750; line-height: 1.3; }
  .promo-end em { font-style: normal; font-size: 25px; color: #4c6152; line-height: 1.6; }
  .promo-end span { font-size: 20px; color: #8b5b26; letter-spacing: .05em; }
`;

/* 書き出した動画そのもので、字幕が絵とずれていないかを確かめる。
   字幕の「文字の行」だけを切り出してコマ差分を取り、入れ替わった時刻を拾う。
   箱はほぼ不透明なので、裏で街が動いても差分はほとんど出ない。 */
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
    /* 文字の入れ替わりは数十以上、裏の街の透け（5%）はひと桁。15 で分かれる */
    if (mean > 15) found.push(i / FPS);
  }
  return { switches: found.filter((t, i) => i === 0 || t - found[i - 1] > 0.3), quiet: Math.max(...peaks.filter((m) => m <= 15)) };
}

async function waitForServer(url, ms = 15000) {
  const until = Date.now() + ms;
  for (;;) {
    try { if ((await fetch(url)).ok) return; } catch { /* まだ上がっていない */ }
    if (Date.now() > until) throw new Error(`ローカル配信が ${ms}ms で応答しませんでした: ${url}`);
    await new Promise((done) => setTimeout(done, 200));
  }
}

async function main() {
  const spec = process.env.PLAYWRIGHT || 'playwright';
  const mod = await import(spec.startsWith('/') ? pathToFileURL(spec).href : spec);
  const chromium = mod.chromium ?? mod.default?.chromium;
  if (!chromium) throw new Error('Playwright を読み込めませんでした');
  for (const cmd of ['ffmpeg', 'ffprobe']) execFileSync('which', [cmd], { stdio: 'ignore' });
  for (const caption of CAPTIONS) {
    if (caption.lines.length > 2 || caption.lines.some((line) => [...line].length > 16)) throw new Error('字幕は1行16字・2行まで');
  }

  const wav = join(here, 'promo-audio.wav');
  if (!existsSync(wav)) execFileSync('node', [join(here, 'promo-audio.mjs'), '--variant', 'a'], { stdio: 'inherit' });

  /* 配信は自分で起こして自分で止める。既に使われているポートには触らない */
  const server = spawn('node', [join(appDir, 'tools', 'serve.mjs')],
    { cwd: repoDir, env: { ...process.env, DAY044_PORT: String(PORT) }, stdio: 'ignore' });
  const base = `http://127.0.0.1:${PORT}/day-044-train-here/`;
  const work = mkdtempSync(join(tmpdir(), 'day044-promo-'));
  let browser;
  try {
    await waitForServer(base);
    /* 3Dの描画が重いと、録画の frame が間引かれて絵と音の時間がずれる。
       既定は実GPUを使える headed。PROMO_HEADLESS=1 で headless（時間割の検査が落ちやすい） */
    const headless = process.env.PROMO_HEADLESS === '1';
    browser = await chromium.launch({ headless, args: headless ? ['--use-angle=metal'] : [] });
    const context = await browser.newContext({
      viewport: VIEW,
      deviceScaleFactor: 2,             // 540×960の画面のまま、録画は1080×1920で撮る（拡大しない）
      locale: 'ja-JP',
      reducedMotion: 'no-preference',   // 電車が止まっていては撮る意味がない
      recordVideo: { dir: work, size: OUT },
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

    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelector('#scene-canvas')?.dataset.renderState === 'ready', null, { timeout: 40000 });
    await page.waitForFunction(() => document.querySelector('#scene-canvas')?.dataset.renderedTrains === '48', null, { timeout: 20000 });
    await page.waitForTimeout(1200);   // 街の影と駅名が出そろうまで（灰色の街を撮らない）

    await page.addStyleTag({ content: OVERLAY });
    await page.evaluate(() => {
      const caption = document.createElement('p');
      caption.className = 'promo-caption';
      const mark = document.createElement('span');
      mark.className = 'promo-mark';
      mark.textContent = '架空の運行デモ';
      const lines = document.createElement('span');
      lines.id = 'promo-lines';
      caption.append(mark, lines);
      const end = document.createElement('div');
      end.className = 'promo-end';
      const title = document.createElement('strong');
      title.textContent = 'Tokyo Railscape';
      const copy = document.createElement('em');
      copy.append('東京の電車を、', document.createElement('br'), '風景として眺める。');
      const foot = document.createElement('span');
      foot.textContent = '架空の運行デモ ・ DAY 044 / 100 ・ 制作中';
      end.append(title, copy, foot);
      document.body.append(caption, end);
      window.promoCaption = (rows) => {
        lines.dataset.on = rows.length ? '1' : '0';
        lines.replaceChildren();
        rows.forEach((row, index) => { if (index) lines.append(document.createElement('br')); lines.append(row); });
      };
      window.promoEnd = (on) => { end.dataset.on = on ? '1' : '0'; };
    });
    /* 字幕の「文字の行」の位置を画面から測り、そのまま書き出し後の検査に使う */
    const lineRect = await page.locator('#promo-lines').evaluate((el, view) => {
      const r = el.getBoundingClientRect();
      return { x: (r.x + 4) / view.width, y: (r.y + 2) / view.height, w: (r.width - 8) / view.width, h: (r.height - 4) / view.height };
    }, VIEW);

    /* 画面に出ている文字と字幕が食い違ったまま書き出さないための関門 */
    const expect = async (selector, needle) => {
      const text = (await page.locator(selector).textContent()) ?? '';
      if (!text.includes(needle)) throw new Error(`画面と字幕が食い違っています: "${needle}" が ${selector} に無い（実際は "${text.trim().slice(0, 80)}"）`);
    };
    const expectAttr = async (selector, name, value) => {
      const got = await page.locator(selector).getAttribute(name);
      if (got !== value) throw new Error(`画面と字幕が食い違っています: ${selector} の ${name} が "${got}"（期待 "${value}"）`);
    };
    const openPanel = async () => {
      if (!await page.locator('#routes-panel').evaluate((el) => el.open)) await page.locator('#routes-panel summary').click();
    };

    /* 1コマ目を「カメラが東京駅へ降りていく途中」にする。編成は最初から走っているので
       画は常に動いているが、カメラも動かしたほうがサムネとして強い（企画の条件）。
       頭の切り落としは録画開始と t0 の差で測る（下の head） */
    await page.evaluate(() => window.promoCaption([]));
    await page.waitForTimeout(800);   // 箱の出現と t0 を、下読みが別ものとして拾える間隔まで離す
    await page.locator('[data-view=tokyo]').click();
    await page.waitForTimeout(260);   // ここで t0。カメラはまだ降りている途中

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
        await page.evaluate((rows) => window.promoCaption(rows), index >= 0 ? CAPTIONS[index].lines : []);
      }
    };

    /* カメラが東京駅で止まり切らないよう、寄りの途中で一度ゆっくり振る */
    await at(1.5);
    await page.locator('#rotate-left').click();

    /* S1 全景：5路線・48編成 */
    await at(CITY_START - 0.5);
    await page.locator('#reset-camera').click();
    await at(CITY_START); await syncCaption(CITY_START);
    await expect('#route-total', '5 ROUTES');
    await expect('#visible-count', '48');

    /* S2 一覧から1編成を選ぶ。選んだ時点で追従が始まる */
    await at(PICK_START); await syncCaption(PICK_START);
    await openPanel();
    await at(PICK_START + 1.4);
    await page.locator('#train-picker').selectOption(TRAIN);
    await expectAttr('#scene-canvas', 'data-camera-mode', 'follow');

    /* S3 追従。編成の名前は画面から取る */
    await at(FOLLOW_START); await syncCaption(FOLLOW_START);
    await expect('#detail-title', '山手線');
    await expect('#detail-kind', '架空の列車');

    /* S4 前方の風景（いちばんの山） */
    await at(RIDE_START - 0.25);
    await page.locator('#ride-train').click();
    await at(RIDE_START); await syncCaption(RIDE_START);
    await expectAttr('#scene-canvas', 'data-camera-mode', 'ride');

    /* S5 新宿のあたりへ寄る */
    await at(PLACE_START - 0.3);
    await page.locator('[data-view=shinjuku]').click();
    await at(PLACE_START); await syncCaption(PLACE_START);
    await expectAttr('[data-view=shinjuku]', 'aria-pressed', 'true');

    /* S6 架空の運行デモであることを、画面の表示ごと見せる */
    await at(DEMO_START - 0.6);
    await page.locator('#reset-camera').click();
    await at(DEMO_START); await syncCaption(DEMO_START);
    await expect('#scene-mode', '架空の運行');
    await expect('#mode-label', '3Dデモ');

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
    /* 録画の長さが実時間より短ければ、録画が描画に追いつけていない（絵と音がずれる） */
    const raw = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', source]).toString().trim());
    console.log(`録画 ${raw.toFixed(2)}秒 / 実時間 ${wall.toFixed(2)}秒（差 ${(wall - raw).toFixed(2)}秒）`);

    /* 頭の切り落としを、録画そのもので決める。
       録画が始まる時刻は t0 からの実時間では測れない（実測で1〜2秒ずれる）。
       字幕が入れ替わった時刻を先に読み、予定とのずれのぶんだけ切り出し位置を動かす。 */
    /* marks[0] は t0（字幕が最初に出る瞬間）。以降は絵コンテの切れ目とエンド画面。
       録画の頭から全部読んで、最後の marks.length 個をこの並びとみなす。
       箱を出したのは t0 の1秒前なので、箱の出現とは混ざらない。 */
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
      console.log(`切り出しの下読み: 字幕の並びを読み取れませんでした（拾えた ${all.length}回・最後の${marks.length}回のずれ ${worst?.toFixed(2) ?? '—'}秒）。実時間で切ります。`);
    }

    const out = join(here, 'promo.mp4');
    execFileSync('ffmpeg', [
      '-y', '-ss', head.toFixed(3), '-t', String(DURATION_SECONDS), '-i', source, '-i', wav,
      '-filter_complex', `[0:v]scale=${OUT.width}:${OUT.height}:flags=lanczos,fps=${DEFAULT_FPS},format=yuv420p[v]`,   // 既に1080幅。念のため寸法をそろえる
      '-map', '[v]', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '22',
      '-c:a', 'aac', '-b:a', '160k', '-shortest', '-map_metadata', '-1', '-movflags', '+faststart', out,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', out, '-frames:v', '1', join(here, 'promo-first-frame.png')]);

    /* 字幕が予定の時刻に入れ替わっているか。ここが関門（絵と字幕が食い違ったまま出さない） */
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
    server.kill();
    rmSync(work, { recursive: true, force: true });
  }
}

await main();
