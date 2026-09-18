/* プロモ動画（縦型1080×1920・35秒・BGM付き）を作る。
   絵コンテは timeline.mjs、音は promo-audio.mjs。この3つで完結する。

   実行:
     PLAYWRIGHT=/path/to/playwright/index.js node apps/day-042-typhoon-coming/tools/promo/render-promo.mjs

   Day 035〜041 と同じく、アプリを実際に操作して録画する。ただしこのDayは、
   気象庁への通信を全部 tests/fixtures の実応答（2026-09-18 15時／18時45分の発表）に差し替える。
   台風が去れば本物の発表は「台風はありません」に変わり、同じ画は二度と撮れないからで、
   差し替えているのは実際の発表そのものなので、映る数字は本物と同じ。
   「いま」も 2026-09-18 21:00 に固定する（帯の「いま」の印が毎回同じ位置に出る）。
   気象庁以外の宛先は断つ。このアプリは地図も同梱データ（data/land.json）で描くので、
   外から取るものは何も無い。 */

import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ANSWER_START, BAND_START, CAPTIONS, DEFAULT_FPS, DURATION_SECONDS, END_START,
  HACHIJO_ANSWER, MAP_START, PEAK_START, PLACE_LEAD, PLACE_START, SOURCE_START,
  T_CONFIRM_TAP } from './timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = dirname(dirname(here));
const fixtures = join(appDir, 'tests', 'fixtures');
const VIEW = { width: 540, height: 960 };
const OUT = { width: 1080, height: 1920 };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json; charset=utf-8' };

/* 撮る2か所。東京駅は現在地（千代田区＝２３区西部）、八丈町は市区町村名で探して決める */
const TOKYO_STATION = { latitude: 35.6812, longitude: 139.7671 };
const NOW = new Date('2026-09-18T21:00:00+09:00');

/* 差し替える気象庁のURL。e2e（tests/e2e/day-042.spec.mjs）と同じ対応表 */
const DATA = 'https://www.jma.go.jp/bosai/typhoon/data/';
const FIXTURES = {
  [`${DATA}targetTc.json`]: 'bosai-typhoon-targetTc-20260918.json',
  [`${DATA}TC2630/specifications.json`]: 'bosai-TC2630-specifications-20260918.json',
  [`${DATA}TC2630/probabilityTimeseries.json`]: 'bosai-TC2630-probabilityTimeseries-20260918.json',
  [`${DATA}TC2630/probabilityThrough.json`]: 'bosai-TC2630-probabilityThrough-20260918.json',
  [`${DATA}TC2630/forecast.json`]: 'bosai-TC2630-forecast-20260918.json',
};

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
   透明でもクリックを奪い、ボタンが押せなくなる（Day 035 で踏んだ）。
   色はアプリの app.css と同じもの（紙 #f5f3ec・墨 #16160f） */
const OVERLAY = `
  .promo-caption {
    position: fixed; left: 8%; right: 8%; bottom: 11%; margin: 0 auto; max-width: 84%;
    padding: 14px 20px; border-radius: 14px; background: rgba(22, 22, 15, .93);
    color: #fbf9f2; font-family: "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif;
    font-size: 29px; font-weight: 700; line-height: 1.45; text-align: center;
    letter-spacing: .01em; opacity: 0; transition: opacity 260ms ease; z-index: 9999; pointer-events: none;
    box-shadow: 0 10px 28px rgba(22, 22, 15, .3);
  }
  .promo-caption[data-on="1"] { opacity: 1; }
  .promo-end {
    position: fixed; inset: 0; display: grid; place-content: center; gap: 16px; text-align: center; padding: 0 36px;
    background: #f5f3ec; color: #16160f; z-index: 10000; opacity: 0; transition: opacity 420ms ease; pointer-events: none;
    font-family: "Hiragino Sans", system-ui, sans-serif;
  }
  .promo-end[data-on="1"] { opacity: 1; }
  .promo-end strong { font-family: "Yu Mincho", "Hiragino Mincho ProN", serif; font-size: 52px; letter-spacing: .05em; font-weight: 700; line-height: 1.3; }
  .promo-end em { font-style: normal; font-size: 25px; color: #474a41; line-height: 1.5; }
  .promo-end span { font-size: 23px; color: #62655a; letter-spacing: .04em; }
`;

/* 書き出した動画そのもので、字幕が絵とずれていないかを確かめる。
   字幕の箱の内側（下から11%・左右22%の内側）だけを切り出してコマ差分を取り、
   文字が入れ替わった時刻を拾う。箱は不透明なので、裏でページが動いても差分はほとんど出ない。 */
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
    /* 文字の入れ替わりは 40〜140、裏のページの透け（7%）は 3 未満。20 で分かれる */
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

  const wav = join(here, 'promo-audio.wav');
  if (!existsSync(wav)) execFileSync('node', [join(here, 'promo-audio.mjs'), '--variant', 'a'], { stdio: 'inherit' });

  const { base, server } = await serve();
  const work = mkdtempSync(join(tmpdir(), 'day042-promo-'));
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEW,
    locale: 'ja-JP',
    permissions: ['geolocation'],
    geolocation: TOKYO_STATION,
    recordVideo: { dir: work, size: VIEW },
  });
  const recordStart = Date.now();
  const page = await context.newPage();
  const stubbed = new Set();
  const blocked = new Set();

  await page.clock.install({ time: NOW });
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    const name = FIXTURES[url.href];
    /* 気象庁は固定資料で答え、ほかの宛先は断つ。どちらの場合も外へは出ていない */
    if (!name) { blocked.add(url.host); return route.abort(); }
    stubbed.add(url.href);
    return route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: readFileSync(join(fixtures, name)) });
  });

  await page.goto(base, { waitUntil: 'load' });
  await page.waitForSelector('#app[data-state="ready"]', { timeout: 25000 });
  await page.waitForTimeout(1500);   // 現況カードと地図が描き切るまで待つ（白い地図を撮らない）
  await page.addStyleTag({ content: OVERLAY });
  await page.evaluate(() => {
    const caption = document.createElement('p');
    caption.className = 'promo-caption';
    const end = document.createElement('div');
    end.className = 'promo-end';
    end.innerHTML =
      '<strong>台風、<br>うちに来る？</strong>' +
      '<em>気象庁の確率を、<br>街の名前から</em>' +
      '<span>hundred-days.pages.dev／DAY 042</span>';
    document.body.append(caption, end);
    window.promoCaption = (lines) => {
      caption.dataset.on = lines.length ? '1' : '0';
      caption.innerHTML = lines.map((line) => `<span>${line}</span>`).join('<br>');
    };
    window.promoEnd = (on) => { end.dataset.on = on ? '1' : '0'; };
  });

  /* 送り先を、上からの位置で指定する。見せたいのが節の途中なので scrollIntoView では足りない。
     新しい送り出しが始まったら、走っているパン（panTo）は自分から降りる（window.__panGen） */
  const scrollTo = (selector, offset = 0, behavior = 'smooth') =>
    page.evaluate(([sel, off, mode]) => {
      window.__panGen = (window.__panGen ?? 0) + 1;
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
      const gen = (window.__panGen = (window.__panGen ?? 0) + 1);
      const t0 = performance.now();
      const ease = (x) => (x < .5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
      const step = (now) => {
        if (window.__panGen !== gen) return done();   // 次の送り出しに引き継いだ
        const k = Math.min(1, (now - t0) / span);
        window.scrollTo(0, from + (to - from) * ease(k));
        k < 1 ? requestAnimationFrame(step) : done();
      };
      requestAnimationFrame(step);
    }), [selector, offset, ms]);

  /* パンは送り出すだけにして、待たない。
     🔴 2026-09-18：終わりの返事を待ってから字幕を切り替えていたら、機械が混んでいるときに
     その返事が3秒遅れ、帯の字幕（S3）が地図の画面に出たまま書き出された（S4は一度も出なかった）。
     絵は rAF が実時間で動かすので予定どおりに着く。時刻は下の at() の絶対時間だけで決める。
     走っているパンは __panGen で自分から降りるので、置いていっても次のパンとぶつからない。 */
  const pan = (selector, offset, ms) => { panTo(selector, offset, ms).catch(() => {}); };

  /* 画面に出ている文字と字幕が食い違ったまま書き出さないための関門 */
  const expect = async (selector, needle) => {
    const text = (await page.locator(selector).textContent()) ?? '';
    if (!text.includes(needle)) throw new Error(`画面と字幕が食い違っています: "${needle}" が ${selector} に無い（実際は "${text.trim().slice(0, 80)}"）`);
  };
  const ready = () => page.waitForSelector('#app[data-state="ready"]', { timeout: 25000 });

  await page.getByRole('button', { name: '現在地から探す', exact: true }).click();   // 東京駅。現在地はここで1回だけ使う
  await ready();
  await page.waitForSelector('#answer-text');
  await page.waitForTimeout(1200);   // 帯と地図が描き直されるまで

  /* 1コマ目を「地図から答えへ上っている途中」にするため、時間割の0秒より前に送り始める。
     頭の切り落としは録画開始と t0 の差で測る（下の head） */
  await scrollTo('#map-area', 20, 'instant');
  await page.evaluate((lines) => window.promoCaption(lines), CAPTIONS[0].lines);
  await page.waitForTimeout(520);
  pan('#answer', 24, 3000);   // t0 をまたいで動き続ける
  /* 待つ長さ＝1コマ目がどれだけ動いているか。ease は入りが遅いので、
     短く待つと 1コマ目の動きが 2〜3px しかない。ここで加速し切ってから t0 にする */
  await page.waitForTimeout(700);

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

  /* S1 答え：千代田区は5日以内に30% */
  await at(ANSWER_START - 0.9);
  await scrollTo('#answer', 24);   // 冒頭のパンはここで引き継ぐ（__panGen）
  await at(ANSWER_START); await syncCaption(ANSWER_START);
  await expect('#place-name', '千代田区');
  await expect('#answer-text', '30%');

  /* S2 山：21日（月）9時〜12時 の 22%。答えの2行目を読ませる */
  await at(PEAK_START); await syncCaption(PEAK_START);
  await expect('#answer-sub', '21日（月）9時〜12時 の 22%');

  /* S3 帯：3時間ごと40本＝5日ぶん */
  await at(BAND_START - 1.3);
  pan('#band-area', 90, 1300);
  await at(BAND_START); await syncCaption(BAND_START);

  /* S4 地図：千代田区の印と予報円の位置関係 */
  await at(MAP_START - 1.5);
  pan('#map-area', 80, 1500);
  await at(MAP_START); await syncCaption(MAP_START);

  /* S5 街を八丈町に変える。「八丈」は八丈町だけに当たるので候補は出ず、
     「探す」を押した時点で答えが 30% から 78% に入れ替わる（そこが山） */
  await at(PLACE_LEAD); await syncCaption(PLACE_LEAD);
  await scrollTo('#picker', 40);
  await at(PLACE_START);
  await page.locator('#town-input').pressSequentially('八丈', { delay: 120 });
  await at(T_CONFIRM_TAP);
  await page.locator('#search-town').click();
  await ready();
  await page.waitForFunction(() => document.getElementById('answer-text')?.textContent.includes('78%'));
  await expect('#place-name', '八丈町');
  await expect('#answer-text', '78%');
  await scrollTo('#answer', 24);
  await at(HACHIJO_ANSWER); await syncCaption(HACHIJO_ANSWER);

  /* S6 0%は保証ではないこと・発表そのままであること */
  await at(SOURCE_START); await syncCaption(SOURCE_START);
  await scrollTo('#caveat', 60);
  await at(29.9);
  await scrollTo('.limits', 40);

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

  /* 字幕が予定の時刻に入れ替わっているか。ここが関門（絵と字幕が食い違ったまま出さない）。
     期待するのは CAPTIONS の切れ目と、エンド画面が被さる END_START */
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
  console.log(`頭の切り落とし ${head.toFixed(2)}秒 / 固定資料で答えた気象庁のURL ${stubbed.size}本 / 断った宛先: ${[...blocked].join(', ') || 'なし'}`);
  console.log('1コマ目は promo-first-frame.png。必ず目視すること。');
}

await main();
