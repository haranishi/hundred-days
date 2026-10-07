/* プロモ動画（縦型1080×1920・34.5秒・BGM付き）と、一覧用の demo.mp4（540×960・無音・字幕なし）を作る。
   絵コンテは timeline.mjs、音は promo-audio.mjs。この3つで完結する。

   実行:
     node day-060-prize-explained/tools/promo/render-promo.mjs          promo.mp4 と promo-first-frame.png
     node day-060-prize-explained/tools/promo/render-promo.mjs --demo   ../../demo.mp4（一覧用）

   Day 042 と同じく、アプリを実際に操作して録画する。今年の分は tests/fixtures の実応答
   （2026-10-07 の化学賞の発表後。医学賞・物理学賞・化学賞が入っている）で返し、時計は ?now= で 21:00 に固定する。
   発表が進めば本物の画面は変わり、同じ画は二度と撮れないからで、映る文字は本物と同じ。
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
import { AGE_START, CAPTIONS, CARD_START, DEFAULT_FPS, DEMO_SECONDS, DURATION_SECONDS, END_START,
  SOURCE_JUMPED, SOURCE_START, SPLIT_START, T_CONFIRM_TAP, WEEK_START, YEARS_START } from './timeline.mjs';

const DEMO = process.argv.includes('--demo');
const here = dirname(fileURLToPath(import.meta.url));
const appDir = dirname(dirname(here));
const fixtures = join(appDir, 'tests', 'fixtures');
const font = process.env.PROMO_FONT || join(homedir(), 'Library/Fonts/ZenKakuGothicNew-Bold.ttf');
const VIEW = { width: 540, height: 960 };
/* 一覧用の demo は録画した大きさ（540×960）のまま。引き伸ばしても細かくならず、大きさだけが増える */
const OUT = DEMO ? { width: 540, height: 960 } : { width: 1080, height: 1920 };
const NOW = '2026-10-07T21:00:00+09:00';
const SECONDS = DEMO ? DEMO_SECONDS : DURATION_SECONDS;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

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
   色はアプリの app.css と同じもの（紙 #f5f3ed・インク #222d30・青緑 #255b66）。
   .promo-tap は、指が触れた所を示す輪（録画にはマウスが映らないため） */
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
  .promo-tap {
    position: fixed; width: 64px; height: 64px; margin: -32px 0 0 -32px; border-radius: 50%;
    border: 4px solid rgba(37, 91, 102, .92); background: rgba(37, 91, 102, .18);
    z-index: 9998; pointer-events: none; opacity: 0; transform: scale(.35);
  }
  .promo-hit { background: rgba(37, 91, 102, .14); box-shadow: 0 0 0 8px rgba(37, 91, 102, .14); border-radius: 4px; }
  .promo-tap[data-go="1"] { animation: promo-tap 620ms ease-out forwards; }
  @keyframes promo-tap { 0% { opacity: 1; transform: scale(.35); } 70% { opacity: .9; } 100% { opacity: 0; transform: scale(1.25); } }
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
  if (!DEMO && !existsSync(wav)) execFileSync('node', [join(here, 'promo-audio.mjs'), '--variant', 'a'], { stdio: 'inherit' });

  const { base, server } = await serve();
  const work = mkdtempSync(join(tmpdir(), 'day060-promo-'));
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEW, locale: 'ja-JP', recordVideo: { dir: work, size: VIEW } });
  const recordStart = Date.now();
  const page = await context.newPage();
  const stubbed = new Set();
  const blocked = new Set();
  const prizes = readFileSync(join(fixtures, 'prizes-2026-1007-chemistry.json'));
  const laureates = readFileSync(join(fixtures, 'laureates-2026-1007-chemistry.json'));

  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (url.hostname !== 'api.nobelprize.org') { blocked.add(url.host); return route.abort(); }
    stubbed.add(url.pathname);
    return route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: url.pathname.endsWith('/nobelPrizes') ? prizes : laureates });
  });

  await page.goto(`${base}?now=${encodeURIComponent(NOW)}`, { waitUntil: 'load' });
  await page.waitForSelector('#app[data-state="ready"]', { timeout: 25000 });
  await page.waitForSelector('#week:not([data-live="loading"])', { timeout: 25000 });
  await page.addStyleTag({ content: OVERLAY });
  await page.evaluate(() => document.fonts.load('700 30px PromoCaption'));
  await page.evaluate((demo) => {
    const caption = document.createElement('p');
    caption.className = 'promo-caption';
    const end = document.createElement('div');
    end.className = 'promo-end';
    end.innerHTML =
      '<strong>今年の<br>受賞の解説</strong>' +
      '<em>何をした人で、何が変わったか。<br>事実と期待を分けて、出典つき</em>' +
      '<span>hundred-days.pages.dev／DAY 060</span>' +
      '<small>データ：Nobel Prize API（CC0）<br>解説は、作者が出典をもとに書いたものです<br>ノーベル財団・Nobel Prize Outreach とは関係ありません</small>';
    const tap = document.createElement('div');
    tap.className = 'promo-tap';
    document.body.append(...(demo ? [tap] : [caption, end, tap]));
    window.promoCaption = (lines) => {
      caption.dataset.on = lines.length ? '1' : '0';
      caption.innerHTML = lines.map((line) => `<span>${line}</span>`).join('<br>');
    };
    window.promoEnd = (on) => { end.dataset.on = on ? '1' : '0'; };
    window.promoTap = (x, y) => {
      tap.style.left = `${x}px`; tap.style.top = `${y}px`;
      tap.dataset.go = '0'; void tap.offsetWidth; tap.dataset.go = '1';
    };
  }, DEMO);

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
  const expectAll = async (selector, needles) => {
    const texts = await page.locator(selector).allTextContents();
    for (const needle of needles) if (!texts.some((text) => text.includes(needle))) throw new Error(`画面と字幕が食い違っています: "${needle}" が ${selector} に無い（実際は ${JSON.stringify(texts)}）`);
  };
  const expectInView = async (selector, what) => {
    const top = await page.locator(selector).first().evaluate((el) => el.getBoundingClientRect().top);
    if (!(top >= -20 && top < VIEW.height - 120)) throw new Error(`${what} が画面に入っていません（上端 ${Math.round(top)}px）`);
  };
  /* 指が触れた所に輪を出してから押す。録画にはマウスが映らないので、輪が「押した」を伝える */
  const tapOn = async (locator, { click = true } = {}) => {
    const box = await locator.boundingBox();
    if (!box) throw new Error('押す対象が画面にありません');
    await page.evaluate(([x, y]) => window.promoTap(x, y), [box.x + box.width / 2, box.y + box.height / 2]);
    if (click) await locator.click({ position: { x: box.width / 2, y: box.height / 2 } });
  };

  /* 1コマ目を動いているところにするため、t0 の前から下へ送り始める */
  await page.mouse.move(1, 1);   // スクロールでボタンがマウスの下に来て、ホバー色のまま映らないように
  await page.evaluate((lines) => window.promoCaption?.(lines), CAPTIONS[0].lines);
  await page.waitForTimeout(400);
  pan('#today .prize-card', 24, 3100);
  await page.waitForTimeout(1200);   // t0 の時点で、送りが3割ほど進んでいる＝1コマ目が動いている絵になる

  const t0 = Date.now();
  const at = async (seconds) => {
    const wait = t0 + seconds * 1000 - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
  };
  let captionIndex = 0;
  const syncCaption = async (t) => {
    if (DEMO) return;
    const index = CAPTIONS.findIndex(({ start, end }) => t >= start && t < end);
    if (index !== captionIndex) {
      captionIndex = index;
      await page.evaluate((lines) => window.promoCaption(lines), index >= 0 ? CAPTIONS[index].lines : []);
    }
  };

  /* S1 先頭の解説カード（化学賞） */
  await at(CARD_START - 0.7);
  pan('#today .commentary-fact', 84, 1300);
  await at(CARD_START); await syncCaption(CARD_START);
  await expect('#today-title', '今日の受賞');
  await expect('#today .prize-heading h3', '化学賞');
  await expect('#today .prize-heading', '10月7日');
  await at(CARD_START + 1.9);
  pan('#today .commentary-fact', -110, 2400);

  /* S2 確かめられた事実と、これからの期待は別の欄 */
  await at(SPLIT_START - 0.7);
  pan('#today .commentary-fact:nth-of-type(2)', 28, 1300);
  await at(SPLIT_START); await syncCaption(SPLIT_START);
  await expect('#today .commentary-fact:nth-of-type(2) h4', '何が変わったか');
  await expect('#today .commentary-expected', 'まだ実現していません');
  await at(SPLIT_START + 1.5);
  pan('#today .commentary-expected', 70, 2500);

  /* S3 発見から受賞まで：40年と31年 */
  await at(YEARS_START - 0.8);
  pan('#today .commentary-gap', 40, 1300);
  await at(YEARS_START); await syncCaption(YEARS_START);
  await expectAll('#today .year-line strong', ['40年', '31年']);
  await at(YEARS_START + 1.7);
  pan('#today .gap-item + .gap-item', 120, 2200);

  /* S4 出典の番号を押すと、出典の一覧へ。音は、SOURCE_START にヒント、T_CONFIRM_TAP に「当たった」の山。
     画は、番号に輪を出し（ヒント）→もう一度輪を出して押し→すべるように出典の一覧へ着く（約0.35秒）→着いた出典を枠で示す。
     押すのは T_CONFIRM_TAP の0.3秒前にして、着地が音の山に重なるようにする */
  const refLocator = page.locator('#today .gap-item + .gap-item .source-ref').first();
  await at(SOURCE_START - 0.9);
  pan('#today .gap-item + .gap-item .source-ref', 420, 900);
  await at(SOURCE_START); await syncCaption(SOURCE_START);
  await expect('#today .gap-item + .gap-item .source-ref', '[');
  const href = await refLocator.getAttribute('href');
  await at(SOURCE_START + 0.1);
  await tapOn(refLocator, { click: false });
  await at(T_CONFIRM_TAP - 0.62);
  await tapOn(refLocator, { click: false });
  await at(T_CONFIRM_TAP - 0.3);
  await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'smooth'; });
  await refLocator.click();
  await at(T_CONFIRM_TAP + 0.05);
  await page.evaluate((id) => document.getElementById(id)?.classList.add('promo-hit'), href.slice(1));
  await at(SOURCE_JUMPED); await syncCaption(SOURCE_JUMPED);
  await expectInView(href, '押した番号の出典');
  await expect('#today .commentary-sources', '論文');
  await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; });
  if (DEMO) { await at(DEMO_SECONDS); }

  if (!DEMO) {
    /* S5 医学賞・物理学賞も、同じ形で読めます */
    await at(WEEK_START - 0.8);
    pan('#week', 12, 1100);
    await at(WEEK_START); await syncCaption(WEEK_START);
    await expect('#week .announcement[data-cat="med"]', '解説を読む');
    await at(WEEK_START + 1.0);
    await tapOn(page.locator('#week .announcement[data-cat="med"] summary'));
    await at(WEEK_START + 1.5);
    pan('#week .announcement[data-cat="med"] .headline', 150, 1300);
    await expect('#week .announcement[data-cat="med"] .headline', '光に反応するたんぱく質');
    await at(WEEK_START + 3.0);
    pan('#week .announcement[data-cat="med"] .commentary-fact', 90, 2300);

    /* S6 年齢を入れる：26歳で受賞した人は、まだ0人 */
    await at(AGE_START - 0.9);
    pan('#age', 10, 900);
    await at(AGE_START); await syncCaption(AGE_START);
    await at(AGE_START - 0.05);
    await tapOn(page.locator('#age-input'), { click: false });
    await page.locator('#age-input').focus();
    await at(AGE_START + 0.3);
    await page.keyboard.type('2');
    await at(AGE_START + 0.65);
    await page.keyboard.type('6');
    await page.evaluate(() => document.activeElement?.blur());
    await at(AGE_START + 1.2);
    const label = await page.locator('#answer').getAttribute('aria-label');
    if (label !== '26歳で受賞した人は、まだいません') throw new Error(`答えが字幕と違います: "26歳で受賞した人は、まだいません"（実際は "${label}"）`);
    pan('#answer', 70, 900);

    await at(END_START);
    await page.evaluate(() => { window.promoCaption([]); window.promoEnd(true); });
  }
  await at(SECONDS);

  const headByClock = (t0 - recordStart) / 1000;
  await context.close();
  await browser.close();
  server.close();

  const webm = readdirSync(work).find((file) => file.endsWith('.webm'));
  if (!webm) throw new Error('録画ファイルが作られませんでした');
  /* 録画が始まる時刻は実時間では測れない（Day 044 で0.3〜1.7秒ずれた）。字幕つきの動画は、録画から読んだ
     「字幕の最初の入れ替わり（CARD_START）」の時刻から、頭の切り落としを決める。一覧用（字幕なし）は時計の値を使う */
  let head = headByClock;
  if (!DEMO) {
    /* 録画の頭には、字幕の箱が現れる変化も混ざる。予定の入れ替わり（CAPTIONS の切れ目＋エンド）と
       いちばん多く重なる切り落としを選ぶ */
    const raw = captionSwitches(join(work, webm));
    const planned = [...CAPTIONS.slice(1).map(({ start }) => start), END_START];
    let best = { head: headByClock, hits: -1 };
    for (const candidate of raw.map((time) => time - planned[0])) {
      const hits = planned.filter((want) => raw.some((got) => Math.abs(got - candidate - want) < 0.25)).length;
      if (hits > best.hits || (hits === best.hits && Math.abs(candidate - headByClock) < Math.abs(best.head - headByClock))) best = { head: candidate, hits };
    }
    console.log(`録画の字幕の入れ替わり（生）: ${raw.map((time) => time.toFixed(2)).join(', ')}`);
    console.log(`頭の切り落とし: 時計 ${headByClock.toFixed(2)}秒 / 録画の字幕から ${best.head.toFixed(2)}秒（予定と重なる入れ替わり ${best.hits}/${planned.length}）`);
    if (best.hits < planned.length - 1) throw new Error('録画の字幕の入れ替わりが、絵コンテと合いません。録画を確かめてください');
    head = best.head;
  }
  const out = DEMO ? join(appDir, 'demo.mp4') : join(here, 'promo.mp4');
  if (DEMO) {
    execFileSync('ffmpeg', [
      '-y', '-ss', head.toFixed(3), '-t', String(SECONDS), '-i', join(work, webm),
      '-vf', `scale=${OUT.width}:${OUT.height}:flags=lanczos,fps=25,format=yuv420p`,
      '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '28', '-movflags', '+faststart', '-map_metadata', '-1', out,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', out, '-frames:v', '1', join(dirname(here), 'demo-first-frame.png')]);
    rmSync(work, { recursive: true, force: true });
    const duration = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString().trim();
    console.log(`demo.mp4 を作りました（${duration}秒・${OUT.width}×${OUT.height}・無音）`);
    console.log(`頭の切り落とし ${head.toFixed(2)}秒 / 実応答で答えた取得 ${stubbed.size}本 / 断った宛先: ${[...blocked].join(', ') || 'なし'}`);
    return;
  }
  execFileSync('ffmpeg', [
    '-y', '-ss', head.toFixed(3), '-t', String(DURATION_SECONDS), '-i', join(work, webm), '-i', wav,
    '-filter_complex', `[0:v]scale=${OUT.width}:${OUT.height}:flags=lanczos,fps=${DEFAULT_FPS},format=yuv420p[v]`,
    '-map', '[v]', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '26',
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
