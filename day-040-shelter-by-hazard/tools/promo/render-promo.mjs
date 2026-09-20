/* プロモ動画（縦型1080×1920・35秒・BGM付き）を作る。
   絵コンテは timeline.mjs、音は promo-audio.mjs。この3つで完結する。

   実行:
     PLAYWRIGHT=/path/to/playwright/index.js node day-040-shelter-by-hazard/tools/promo/render-promo.mjs

   Day 035〜039 と同じく、アプリを実際に操作して録画する。避難場所のタイルと住所検索は
   tests/fixtures/ の実応答に差し替えるので、撮り直しても数字が変わらない（相手のサーバーも叩かない）。
   地図タイルだけは本物を読む（ベタ塗りの地図では「場所を選んでいる」ことが伝わらないため）。 */

import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ANSWER_START, CAPTIONS, DEFAULT_FPS, DURATION_SECONDS, END_START, PLACE_START,
  SOURCE_START, SWITCH_START, T_CONFIRM_TAP, UNUSABLE_START, USABLE_START } from './timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = dirname(dirname(here));
const fixtures = join(appDir, 'tests', 'fixtures');
const VIEW = { width: 540, height: 960 };
const OUT = { width: 1080, height: 1920 };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json; charset=utf-8' };

/* 撮る2か所。秋田は現在地、高知は住所検索「高知駅」の候補から選ぶ（fixture の実応答） */
const AKITA = { latitude: 39.7186, longitude: 140.1025 };

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

/* 避難場所タイルは区画ごとの実応答。秋田駅=910/388・高知駅=891/410。ほかは本物と同じく404 */
function tileFixture(url) {
  const m = url.match(/skhb0(\d)\/10\/(\d+)\/(\d+)\.geojson/);
  if (!m) return null;
  const city = m[2] === '910' && m[3] === '388' ? 'akita' : m[2] === '891' && m[3] === '410' ? 'kochi' : null;
  const file = city && join(fixtures, 'skhb', city, `skhb0${m[1]}.json`);
  return file && existsSync(file) ? file : 'missing';
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
    position: fixed; inset: 0; display: grid; place-content: center; gap: 16px; text-align: center; padding: 0 36px;
    background: #f6f3eb; color: #171713; z-index: 10000; opacity: 0; transition: opacity 420ms ease; pointer-events: none;
    font-family: "Hiragino Sans", system-ui, sans-serif;
  }
  .promo-end[data-on="1"] { opacity: 1; }
  .promo-end strong { font-family: "Yu Mincho", "Hiragino Mincho ProN", serif; font-size: 52px; letter-spacing: .06em; font-weight: 700; line-height: 1.3; }
  .promo-end em { font-style: normal; font-size: 25px; color: #3a3733; line-height: 1.5; }
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

  const { base, server } = await serve();
  const work = mkdtempSync(join(tmpdir(), 'day040-promo-'));
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEW,
    locale: 'ja-JP',
    permissions: ['geolocation'],
    geolocation: AKITA,
    recordVideo: { dir: work, size: VIEW },
  });
  const recordStart = Date.now();
  const page = await context.newPage();
  const seen = new Set();
  page.on('request', (r) => seen.add(new URL(r.url()).host));

  await page.route('**/*', (route) => {
    const url = route.request().url();
    const tile = tileFixture(url);
    if (tile === 'missing') return route.fulfill({ status: 404, body: '' });
    if (tile) return route.fulfill({ status: 200, headers: { 'content-type': 'application/json', 'last-modified': 'Mon, 14 Sep 2026 07:14:12 GMT' }, body: readFileSync(tile) });
    if (url.includes('msearch.gsi.go.jp')) return route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: readFileSync(join(fixtures, 'address-kochi-eki.json')) });
    return route.continue();
  });

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
      '<strong>その避難場所、<br>洪水でも？</strong>' +
      '<em>災害の種類で、逃げていい場所は変わる</em>' +
      '<span>hundred-days.pages.dev／DAY 040</span>';
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
  const hazard = (value) => page.locator(`input[name="hazard"][value="${value}"]`).check();

  await page.getByRole('button', { name: '現在地から探す', exact: true }).click();   // 秋田。現在地はここで1回だけ使う
  await ready();
  await expect('#answer-text', '170m');
  await expect('#answer-sub', 'そのまま洪水で使えます');
  await page.waitForTimeout(2600);   // ピンと周辺タイルが描き切るまで

  /* 1コマ目を「一覧から答えへ上っている途中」にするため、時間割の0秒より前に送り始める。
     頭の切り落としは録画開始と t0 の差で測る（下の head） */
  await scrollTo('#usable', 20, 'instant');
  await page.evaluate((lines) => window.promoCaption(lines), CAPTIONS[0].lines);
  await page.waitForTimeout(520);
  const opening = panTo('#answer', 24, 3600);   // t0 をまたいで動き続ける
  await page.waitForTimeout(420);

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

  /* S1 答え：秋田駅は170m先が使える */
  await at(ANSWER_START - 0.9);
  await opening;
  await scrollTo('#answer', 24);
  await at(ANSWER_START); await syncCaption(ANSWER_START);
  await at(5.6); await syncCaption(5.6);

  /* S2 近いのに使えない場所：2番目に近い公園 */
  await at(UNUSABLE_START); await syncCaption(UNUSABLE_START);
  await expect('#unusable-list', '山王第一街区公園');
  await scrollTo('#unusable', 60);
  await at(10.2); await syncCaption(10.2);
  await page.evaluate(() => window.scrollBy({ top: 220, behavior: 'smooth' }));

  /* S3 津波に切り替える：答えが変わる */
  await at(SWITCH_START); await syncCaption(SWITCH_START);
  await scrollTo('#hazards', 40);
  await at(SWITCH_START + 0.4);
  await hazard(5);
  await ready();
  await expect('#answer-text', '津波のとき');
  await page.waitForTimeout(500);
  await scrollTo('#answer', 24);
  await at(15.5); await syncCaption(15.5);

  /* S4 場所を高知に変える：住所検索の候補から「高知駅」を押す。ここが山 */
  await at(PLACE_START); await syncCaption(PLACE_START);
  await hazard(1);
  await ready();
  await scrollTo('#picker', 40);
  await page.fill('#address', '高知駅');
  await page.click('#search-address');
  await page.waitForSelector('#candidates button');
  await at(T_CONFIRM_TAP);
  await page.getByRole('button', { name: '高知駅', exact: true }).click();
  await ready();
  await expect('#answer-sub', '15か所');
  await expect('#answer-text', '470m');
  await scrollTo('#answer', 24);
  await at(21.2); await syncCaption(21.2);

  /* S5 洪水で使えるのは470m先の小学校 */
  await at(USABLE_START); await syncCaption(USABLE_START);
  await expect('#usable-list', '江ノ口小学校');
  await scrollTo('#usable', 60);
  await at(26.3); await syncCaption(26.3);

  /* S6 出典と注意 */
  await at(SOURCE_START); await syncCaption(SOURCE_START);
  await scrollTo('.notes', 60);

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
