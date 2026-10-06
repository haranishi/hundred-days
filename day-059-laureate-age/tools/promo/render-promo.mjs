/* プロモ動画（縦型1080×1920・34.5秒・BGM付き）を作る。
   絵コンテは timeline.mjs、音は promo-audio.mjs。この3つで完結する。

   実行:
     PLAYWRIGHT=/path/to/playwright/index.js node day-059-laureate-age/tools/promo/render-promo.mjs

   Day 042 と同じく、アプリを実際に操作して録画する。今年の分は tests/fixtures の実応答
   （2026-10-06 18:53、物理学賞の発表後）で返し、時計は ?now= で 21:00 に固定する。
   発表が進めば本物の画面は変わり、同じ画は二度と撮れないからで、映る数字は本物と同じ。
   api.nobelprize.org 以外の宛先は断つ。
   字幕の書体は Zen Kaku Gothic New（SIL OFL 1.1）。置き場所は環境変数 PROMO_FONT で変えられる
   （既定は ~/Library/Fonts/ZenKakuGothicNew-Bold.ttf）。ページから file:// は読めないので、
   ミニサーバーの /__promo-font で配る。 */

import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ANSWER_START, BAND_START, CAPTIONS, DEFAULT_FPS, DURATION_SECONDS, END_START,
  LIST_START, RETYPE_ANSWER, RETYPE_START, T_CONFIRM_TAP, YEAR_START, YOUNGER_START } from './timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = dirname(dirname(here));
const fixtures = join(appDir, 'tests', 'fixtures');
const font = process.env.PROMO_FONT || join(homedir(), 'Library/Fonts/ZenKakuGothicNew-Bold.ttf');
const VIEW = { width: 540, height: 960 };
const OUT = { width: 1080, height: 1920 };
const NOW = '2026-10-06T21:00:00+09:00';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://local').pathname);
      if (path === '/__promo-font') return res.writeHead(200, { 'content-type': 'font/ttf' }).end(await readFile(font));
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

/* 差し込む要素には pointer-events: none が要る（透明でもクリックを奪う。Day 035 で踏んだ）。
   色はアプリの app.css と同じもの（紙 #f5f3ed・インク #222d30・青緑 #255b66） */
const OVERLAY = `
  @font-face { font-family: PromoCaption; src: url('/__promo-font'); font-weight: 700; }
  .promo-caption {
    position: fixed; left: 8%; right: 8%; bottom: 11%; margin: 0 auto; max-width: 84%;
    padding: 14px 20px; border-radius: 12px; background: rgba(34, 45, 48, .94);
    color: #fbfaf5; font-family: PromoCaption, system-ui, sans-serif;
    font-size: 30px; font-weight: 700; line-height: 1.45; text-align: center;
    letter-spacing: .02em; opacity: 0; transition: opacity 240ms ease; z-index: 9999; pointer-events: none;
    box-shadow: 0 10px 28px rgba(34, 45, 48, .28);
  }
  .promo-caption[data-on="1"] { opacity: 1; }
  .promo-end {
    position: fixed; inset: 0; display: grid; place-content: center; gap: 18px; text-align: center; padding: 0 36px;
    background: #f5f3ed; color: #222d30; z-index: 10000; opacity: 0; transition: opacity 420ms ease; pointer-events: none;
    font-family: PromoCaption, system-ui, sans-serif;
  }
  .promo-end[data-on="1"] { opacity: 1; }
  .promo-end strong { font-size: 54px; letter-spacing: .04em; line-height: 1.3; }
  .promo-end em { font-style: normal; font-size: 25px; color: #3e4b4f; line-height: 1.55; }
  .promo-end span { font-size: 22px; color: #255b66; letter-spacing: .04em; }
  .promo-end small { font-size: 15px; color: #536166; line-height: 1.6; margin-top: 12px; }
`;

/* 書き出した動画そのもので、字幕が絵とずれていないかを確かめる（Day 042 と同じ関門）。
   字幕の箱の内側だけを切り出してコマ差分を取り、文字が入れ替わった時刻を拾う。 */
function captionSwitches(file) {
  const W = 96, H = 12, FPS = 20;
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file,
    '-vf', `crop=iw*0.56:ih*0.045:iw*0.22:ih*0.832,scale=${W}:${H},format=gray`,
    '-r', String(FPS), '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 });
  const size = W * H;
  const found = [];
  for (let i = 1; i < Math.floor(raw.length / size); i++) {
    let diff = 0;
    for (let j = 0; j < size; j++) diff += Math.abs(raw[i * size + j] - raw[(i - 1) * size + j]);
    if (diff / size > 20) found.push(i / FPS);
  }
  return found.filter((t, i) => i === 0 || t - found[i - 1] > 0.3);
}

async function main() {
  const spec = process.env.PLAYWRIGHT || 'playwright';
  const mod = await import(spec.startsWith('/') ? pathToFileURL(spec).href : spec);
  const chromium = mod.chromium ?? mod.default?.chromium;
  if (!chromium) throw new Error('Playwright を読み込めませんでした');
  for (const cmd of ['ffmpeg', 'ffprobe']) execFileSync('which', [cmd], { stdio: 'ignore' });
  if (!existsSync(font)) throw new Error(`字幕の書体が見つかりません: ${font}（PROMO_FONT で指定できます）`);

  const wav = join(here, 'promo-audio.wav');
  if (!existsSync(wav)) execFileSync('node', [join(here, 'promo-audio.mjs'), '--variant', 'a'], { stdio: 'inherit' });

  const { base, server } = await serve();
  const work = mkdtempSync(join(tmpdir(), 'day059-promo-'));
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEW, locale: 'ja-JP', recordVideo: { dir: work, size: VIEW } });
  const recordStart = Date.now();
  const page = await context.newPage();
  const stubbed = new Set();
  const blocked = new Set();
  const prizes = readFileSync(join(fixtures, 'prizes-2026-1006-physics.json'));
  const laureates = readFileSync(join(fixtures, 'laureates-2026-1006-physics.json'));

  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (url.hostname !== 'api.nobelprize.org') { blocked.add(url.host); return route.abort(); }
    stubbed.add(url.pathname);
    return route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: url.pathname.endsWith('/nobelPrizes') ? prizes : laureates });
  });

  await page.goto(`${base}?now=${encodeURIComponent(NOW)}`, { waitUntil: 'load' });
  await page.waitForSelector('#app[data-state="ready"]', { timeout: 25000 });
  await page.waitForSelector('#current:not([data-live="loading"])', { timeout: 25000 });
  await page.addStyleTag({ content: OVERLAY });
  await page.evaluate(() => document.fonts.load('700 30px PromoCaption'));
  await page.evaluate(() => {
    const caption = document.createElement('p');
    caption.className = 'promo-caption';
    const end = document.createElement('div');
    end.className = 'promo-end';
    end.innerHTML =
      '<strong>その歳で、<br>受賞した人</strong>' +
      '<em>年齢を入れると、<br>その歳の受賞者が出る</em>' +
      '<span>hundred-days.pages.dev／DAY 059</span>' +
      '<small>データ：Nobel Prize API（CC0）<br>ノーベル財団・Nobel Prize Outreach とは関係ありません</small>';
    document.body.append(caption, end);
    window.promoCaption = (lines) => {
      caption.dataset.on = lines.length ? '1' : '0';
      caption.innerHTML = lines.map((line) => `<span>${line}</span>`).join('<br>');
    };
    window.promoEnd = (on) => { end.dataset.on = on ? '1' : '0'; };
  });

  /* 送り先を上からの位置で指定し、秒数を決めて動かす。新しいパンが始まったら走っているパンは降りる。
     パンは送り出すだけで待たない。時刻は at() の絶対時間だけで決める（Day 042 で字幕が3秒遅れた教訓） */
  const panTo = (selector, offset, ms) =>
    page.evaluate(([sel, off, span]) => new Promise((done) => {
      const target = document.querySelector(sel);
      if (!target) return done();
      const from = window.scrollY;
      const to = target.getBoundingClientRect().top + window.scrollY - off;
      const gen = (window.__panGen = (window.__panGen ?? 0) + 1);
      const t0 = performance.now();
      const ease = (x) => (x < .5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
      const step = (now) => {
        if (window.__panGen !== gen) return done();
        const k = Math.min(1, (now - t0) / span);
        window.scrollTo(0, from + (to - from) * ease(k));
        k < 1 ? requestAnimationFrame(step) : done();
      };
      requestAnimationFrame(step);
    }), [selector, offset, ms]);
  const pan = (selector, offset, ms) => { panTo(selector, offset, ms).catch(() => {}); };

  /* 画面に出ている文字と字幕が食い違ったまま書き出さないための関門 */
  const expect = async (selector, needle) => {
    const text = (await page.locator(selector).first().textContent()) ?? '';
    if (!text.includes(needle)) throw new Error(`画面と字幕が食い違っています: "${needle}" が ${selector} に無い（実際は "${text.trim().slice(0, 80)}"）`);
  };
  const expectLabel = async (label) => {
    const got = await page.locator('#answer').getAttribute('aria-label');
    if (got !== label) throw new Error(`答えが字幕と違います: "${label}"（実際は "${got}"）`);
  };

  /* 1コマ目を動いているところにするため、t0 の前から下へ送り始め、数字も t0 の直前に打つ */
  await page.locator('#age').click();
  await page.mouse.move(1, 1);   // スクロールでボタンがマウスの下に来て、ホバー色のまま映らないように
  await page.evaluate((lines) => window.promoCaption(lines), CAPTIONS[0].lines);
  await page.waitForTimeout(400);
  pan('.controls', 12, 2600);
  await page.waitForTimeout(500);
  await page.keyboard.type('2');

  const t0 = Date.now();
  const at = async (seconds) => {
    const wait = t0 + seconds * 1000 - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
  };
  let captionIndex = 0;
  const syncCaption = async (t) => {
    const index = CAPTIONS.findIndex(({ start, end }) => t >= start && t < end);
    if (index !== captionIndex) {
      captionIndex = index;
      await page.evaluate((lines) => window.promoCaption(lines), index >= 0 ? CAPTIONS[index].lines : []);
    }
  };

  await at(0.45);
  await page.keyboard.type('6');
  await page.evaluate(() => document.activeElement?.blur());

  /* S1 答え：26歳は0人 */
  await at(ANSWER_START); await syncCaption(ANSWER_START);
  await expectLabel('26歳で受賞した人は、まだいません');
  await expect('#count-note', '1901〜2026年');   // 字幕の「1901年から」は、帯の下の数え方の行で照合する

  /* S2 自分より若い受賞は999回のうち3回 */
  await at(YOUNGER_START - 0.6);
  pan('#answer .answer-detail', 260, 900);
  await at(YOUNGER_START); await syncCaption(YOUNGER_START);
  await expect('#answer', 'のべ999回のうち3回');

  /* S3 帯の図：最年少17歳・最年長97歳 */
  await at(BAND_START - 1.0);
  pan('#band', 150, 1000);
  await at(BAND_START); await syncCaption(BAND_START);
  await expect('#band', '最年少 17歳');
  await expect('#band', '最年長 97歳');

  /* S4 82歳に打ち直す。打ち終えた瞬間（T_CONFIRM_TAP）に 0人 から 9人 へ入れ替わる */
  await at(RETYPE_START - 0.9);
  pan('.controls', 12, 900);
  await at(RETYPE_START); await syncCaption(RETYPE_START);
  await page.locator('#age').fill('');
  await page.locator('#age').focus();
  await page.keyboard.type('8');
  await at(T_CONFIRM_TAP);
  await page.keyboard.type('2');
  await page.evaluate(() => document.activeElement?.blur());
  await at(RETYPE_ANSWER); await syncCaption(RETYPE_ANSWER);
  await expectLabel('82歳で受賞した人は、9人');

  /* S5 一覧の先頭は今年の物理学賞 */
  await at(LIST_START - 1.0);
  pan('#matches .laureate', 120, 1000);
  await at(LIST_START); await syncCaption(LIST_START);
  await expect('#matches .laureate', 'フランシス・ハルツェン');
  await expect('#matches .laureate', '2026年 · 物理学賞 · 82歳');

  /* S6 今年の受賞者の欄 */
  await at(YEAR_START - 1.0);
  pan('#current', 30, 1000);
  await at(YEAR_START); await syncCaption(YEAR_START);
  await expect('#current', '発表済み');
  await expect('#current', 'フランシス・ハルツェン · 82歳');

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

  /* 字幕が予定の時刻に入れ替わっているか。期待するのは CAPTIONS の切れ目と、エンド画面が被さる END_START */
  const expected = [...CAPTIONS.slice(1).map(({ start }) => start), END_START];
  const actual = captionSwitches(out);
  const rows = expected.map((want, i) => ({ want, got: actual[i] }));
  const off = rows.filter(({ want, got }) => got === undefined || Math.abs(got - want) > 0.4);
  console.log(`字幕の入れ替わり: ${rows.map(({ want, got }) => `${want}→${got?.toFixed(2) ?? 'なし'}`).join(' / ')}`);
  if (off.length || actual.length !== expected.length) {
    throw new Error(`字幕が絵とずれています（${out} は残してあります）。`
      + `ずれた場面: ${off.map(({ want, got }) => `${want}秒→${got?.toFixed(2) ?? 'なし'}`).join('、')}`
      + `${actual.length !== expected.length ? `／入れ替わりの数 ${actual.length}（予定 ${expected.length}）` : ''}`);
  }

  const duration = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString().trim();
  console.log(`promo.mp4 を作りました（${duration}秒・${OUT.width}×${OUT.height}）`);
  console.log(`頭の切り落とし ${head.toFixed(2)}秒 / 実応答で答えた取得 ${stubbed.size}本 / 断った宛先: ${[...blocked].join(', ') || 'なし'}`);
  console.log('1コマ目は promo-first-frame.png。必ず目視すること。');
}

await main();
