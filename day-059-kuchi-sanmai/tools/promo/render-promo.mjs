/* プロモ動画（縦型1080×1920・34秒・BGM付き）を作る。
   絵コンテは timeline.mjs、音は promo-audio.mjs。この3つで完結する。

   実行:
     PLAYWRIGHT=/path/to/playwright/index.js node day-059-kuchi-sanmai/tools/promo/render-promo.mjs

   アプリを実際に操作して録画する。見本は同梱の自作ロボットとテスト音だけを使う（有名キャラや人の声は使わない）。
   外への通信は断つ（このアプリはもともと外と通信しない）。テスト音は録画に入らないので、音はBGMだけ。
   字幕の書体は Zen Kaku Gothic New（SIL OFL 1.1）。置き場所は環境変数 PROMO_FONT で変えられる
   （既定は ~/Library/Fonts/ZenKakuGothicNew-Bold.ttf）。ページから file:// は読めないので、ミニサーバーの /__promo-font で配る。 */

import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CAPTIONS, DEFAULT_FPS, DURATION_SECONDS, END_START, GREEN_START, NOTICE_START, PARTS_START,
  RECORD_START, SQUARE_START, TALK_START } from './timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = dirname(dirname(here));
const font = process.env.PROMO_FONT || join(homedir(), 'Library/Fonts/ZenKakuGothicNew-Bold.ttf');
const VIEW = { width: 540, height: 960 };
const OUT = { width: 1080, height: 1920 };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.wav': 'audio/wav', '.txt': 'text/plain; charset=utf-8' };

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
   色はアプリの暗いスタジオに合わせる */
const OVERLAY = `
  @font-face { font-family: PromoCaption; src: url('/__promo-font'); font-weight: 700; }
  .promo-caption {
    position: fixed; left: 8%; right: 8%; bottom: 11%; margin: 0 auto; max-width: 84%;
    padding: 14px 20px; border-radius: 12px; background: rgba(245, 248, 246, .95);
    color: #0e1517; font-family: PromoCaption, system-ui, sans-serif;
    font-size: 30px; font-weight: 700; line-height: 1.45; text-align: center;
    letter-spacing: .02em; opacity: 0; transition: opacity 240ms ease; z-index: 9999; pointer-events: none;
    box-shadow: 0 10px 28px rgba(0, 0, 0, .35);
  }
  .promo-caption[data-on="1"] { opacity: 1; }
  .promo-end {
    position: fixed; inset: 0; display: grid; place-content: center; gap: 18px; text-align: center; padding: 0 36px;
    background: #0e1517; color: #e8f2ee; z-index: 10000; opacity: 0; transition: opacity 420ms ease; pointer-events: none;
    font-family: PromoCaption, system-ui, sans-serif;
  }
  .promo-end[data-on="1"] { opacity: 1; }
  .promo-end strong { font-size: 58px; letter-spacing: .04em; line-height: 1.3; }
  .promo-end em { font-style: normal; font-size: 25px; color: #b8cbc4; line-height: 1.55; }
  .promo-end span { font-size: 22px; color: #7fe3c8; letter-spacing: .04em; }
  .promo-end small { font-size: 15px; color: #93a7a0; line-height: 1.6; margin-top: 12px; }
`;

/* 書き出した動画そのもので、字幕が絵とずれていないかを確かめる（Day 042 と同じ関門） */
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
  const work = mkdtempSync(join(tmpdir(), 'day059b-promo-'));
  // 再生ボタンを画面を動かさずに押したいので、ブラウザの自動再生の制限を外す（録画用のブラウザだけ）
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: VIEW, locale: 'ja-JP', recordVideo: { dir: work, size: VIEW } });
  const recordStart = Date.now();
  const page = await context.newPage();
  const blocked = new Set();
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    blocked.add(url.host);
    return route.abort();
  });

  await page.goto(base, { waitUntil: 'load' });
  await page.getByRole('heading', { name: '声にあわせて、動きだす。' }).waitFor({ timeout: 25000 });
  await page.addStyleTag({ content: OVERLAY });
  await page.evaluate(() => document.fonts.load('700 30px PromoCaption'));
  await page.evaluate(() => {
    const caption = document.createElement('p');
    caption.className = 'promo-caption';
    const end = document.createElement('div');
    end.className = 'promo-end';
    end.innerHTML =
      '<strong>口さんまい</strong>' +
      '<em>口の絵3枚で、<br>声にあわせて動く</em>' +
      '<span>hundred-days.pages.dev／DAY 059</span>' +
      '<small>素材も声も、ブラウザの外へは送りません<br>見本のロボットは自作です</small>';
    document.body.append(caption, end);
    window.promoCaption = (lines) => {
      caption.dataset.on = lines.length ? '1' : '0';
      caption.innerHTML = lines.map((line) => `<span>${line}</span>`).join('<br>');
    };
    window.promoEnd = (on) => { end.dataset.on = on ? '1' : '0'; };
    // 口の状態を記録しておき、「口が開く」の字幕が本当に口の開いた絵と一緒に出ているかを確かめる
    window.__mouthSeen = new Set();
    setInterval(() => {
      const text = document.querySelector('[data-testid="status-mouth"]')?.textContent?.trim();
      if (text) window.__mouthSeen.add(text);
    }, 40);
  });

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
  // 画面を動かさずに押す（スクロールの位置は pan だけで決める）
  const press = (testId) => page.evaluate((id) => document.querySelector(`[data-testid="${id}"]`)?.click(), testId);
  const fail = (message) => { throw new Error(`画面と字幕が食い違っています: ${message}`); };
  const expectAttr = async (testId, name, value) => {
    const got = await page.locator(`[data-testid="${testId}"]`).first().getAttribute(name);
    if (got !== value) fail(`${testId} の ${name} が ${value} でない（実際は ${got}）`);
  };

  await page.mouse.move(1, 1);
  await page.evaluate((lines) => window.promoCaption(lines), CAPTIONS[0].lines);
  await page.waitForTimeout(300);
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

  /* S0 サンプルで試す。押した瞬間から下のプレビューへ送る（1コマ目から動いている） */
  await press('load-sample');
  pan('[data-testid="preview-canvas"]', 120, 2400);
  await page.getByText('サンプルを読み込みました。').waitFor({ timeout: 10000 });
  await at(1.6);
  await press('sample-play');   // 読み込み後の案内の横の「▶ 再生してみる」（プレビューは画面の中にあるので移動しない）

  /* S1 声にあわせて口が開く */
  await at(TALK_START); await syncCaption(TALK_START);
  await at(PARTS_START - 1.0);
  const seen = await page.evaluate(() => [...window.__mouthSeen]);
  // 欄の文字は「口の状態大」のように見出しと値が続く。値の末尾で見る（口が大きく開いた＝「大」）
  if (!seen.some((text) => text.endsWith('大'))) fail(`口が開いた状態が出ていない（見えた状態: ${seen.join(', ')}）`);

  /* S2 口の絵3枚（＋まばたき） */
  pan('[data-testid="slot-mouthClosed"]', 150, 1000);
  await at(PARTS_START); await syncCaption(PARTS_START);
  for (const slot of ['mouthClosed', 'mouthSmall', 'mouthOpen']) await expectAttr(`slot-${slot}`, 'data-loaded', 'true');

  /* S3 背景をグリーンに。プレビューへ戻ってから押す */
  await at(GREEN_START - 1.0);
  pan('[data-testid="preview-canvas"]', 120, 1000);
  await at(GREEN_START - 0.1);
  await press('bg-green');
  await syncCaption(GREEN_START);
  await expectAttr('bg-green', 'aria-pressed', 'true');

  /* S4 正方形の画角に */
  await at(SQUARE_START - 0.1);
  await press('preset-square');
  await syncCaption(SQUARE_START);
  await expectAttr('preset-square', 'aria-pressed', 'true');

  /* S5 録画して保存。音声の最初から録るので、2.5秒で止めて、できた動画のプレビューを見せる */
  await at(RECORD_START - 1.0);
  pan('[data-testid="record-start"]', 260, 1000);
  await at(RECORD_START); await syncCaption(RECORD_START);
  await at(RECORD_START + 0.4);
  await press('record-start');
  await at(RECORD_START + 2.9);
  await press('record-stop');
  await page.locator('[data-testid="record-preview"]').waitFor({ timeout: 4000 });
  pan('[data-testid="record-preview"]', 200, 700);

  /* S6 人の声や絵は許可の範囲で */
  await at(NOTICE_START - 0.9);
  pan('[data-testid="rights-notice-voice"]', 260, 900);
  await at(NOTICE_START); await syncCaption(NOTICE_START);
  const notice = (await page.getByTestId('rights-notice-voice').textContent()) ?? '';
  if (!notice.includes('許可なく使わないでください')) fail('音声の欄の注意書きが見つからない');

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
  console.log(`頭の切り落とし ${head.toFixed(2)}秒 / 断った宛先: ${[...blocked].join(', ') || 'なし'}`);
  console.log('1コマ目は promo-first-frame.png。必ず目視すること。');
}

await main();
