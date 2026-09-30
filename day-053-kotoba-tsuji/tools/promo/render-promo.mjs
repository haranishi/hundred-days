/* ことば辻（Day 053）のプロモ動画（縦型1080×1920・34秒・BGM付き）を作る。絵コンテは timeline.mjs、音は promo-audio.mjs。
   アプリを実際に操作して録画し、字幕・注目の印・幕・エンドを重ね、合成した BGM と ffmpeg で書き出し、書き出した動画で検査する。

   実行（リポジトリ直下から）:
     PLAYWRIGHT=/path/to/playwright/index.js node day-053-kotoba-tsuji/tools/promo/render-promo.mjs --day 53
       --audio a|b    重ねる BGM（既定 a）。両案の WAV は毎回作り直す
       --day <番号>    エンドの「Day ◯ / 100」（既定 timeline.mjs の DEFAULT_DAY＝53）
       --out <mp4>    出力先（既定 このフォルダの promo.mp4）。1コマ目は <名前>-first-frame.png
       --sheet <jpg>  2秒おきのコンタクトシート（既定 このフォルダの preview-contact.jpg）
       --shots <dir>  下見の各場面のスクショを <dir> に残す（見た目が変わったときの確かめ用）
       --keep         録画の元（webm）を残して場所を出す
   PLAYWRIGHT を省くと、このリポジトリの node_modules の playwright を読む。
   画面がロックされて Chromium が起動しないときは KOTOBA_BROWSER=webkit を付ける。

   Day 052 の作りを土台にした（下見→本番、ページの中の時計で字幕、カチンコで頭を切る、画面と字幕の突き合わせ、
   Day のフォルダを空きポートで配る）。ことば辻で変えたところ:
   - アプリは撮影用の台紙（STAGE_HTML、このツールの配信が返す）の中の iframe で動かす。字幕は iframe の上の帯に置き、
     盤・問・五十音盤に掛からない。アプリのファイルには手を入れない
   - 場面の切り替え（免許皆伝・果たし状）は藍の暖簾の幕で隠し、閉じている間に盤を組み替えて、その時間（gap）を書き出しで切り落とす
   - 腕前選びから始める局の種は乱数（crypto.getRandomValues）で決まるので、押す直前にだけ差し替えて固定する。
     案内役の台詞も候補から Math.random で選ばれるので、その1回だけ固定する（どれもアプリが実際に出す台詞）
   - 書体はアプリと同じ fonts/ の同梱書体（字の組を絞った woff2）を使い、外への通信はすべて断つ。字幕とエンドの字が
     fonts/chars.txt に全部あるかを起動時に確かめる（無い字は別の書体で描かれる）。「□」は書体に無いので、
     盤の空き辻と同じ朱の点線の枠を CSS で描く */

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BOARD_COLUMNS } from '../../lib/kana.js';
import {
  CAPTIONS, CUTS, DEFAULT_DAY, DEFAULT_FPS, DUEL_SECONDS, DURATION_SECONDS, END_START, FOCUS, GLOW_PERIOD, SEEDS,
  T_AKI, T_CHANGE, T_FILLS, T_ICHI, T_KANA, WIPE_IN, WIPE_OUT,
} from './timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, '..', '..');
const VIEW = { width: 540, height: 960 };
const OUT = { width: 1080, height: 1920 };
const SCALE = OUT.width / VIEW.width;
const BAND = 215;                 // 字幕の帯の高さ。アプリの iframe はこの下（540×745）
const LEAD_IN = 2;                // 予定表を動かし始めてから t0（動画の0秒）まで
const FLASH = [-1.6, -1.36];      // カチンコの光（t0 からの秒）。頭の切り落としの中に入る
const ACCEPT_AT = -1.1;           // 手習いの果たし状を「受けて立つ」（ページの予定表が押す）。1コマ目までに盤が落ち着く
const RIPPLE_LEAD = .07;          // 指の輪を出してから押すまで
const REHEARSAL_STEP_MS = 150;    // 下見では待たずに次の操作へ進む
const STAGE_PATH = '/__promo__.html';
const FONT_CSS = './fonts/fonts.css';     // アプリと同じ同梱書体（Shippori Mincho B1 500/700/800・Zen Kaku Gothic New 500/700）
const FACES = [['Shippori Mincho B1', 500], ['Shippori Mincho B1', 700], ['Shippori Mincho B1', 800], ['Zen Kaku Gothic New', 500], ['Zen Kaku Gothic New', 700]];
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};
const PLAIN_KANA = new Set(BOARD_COLUMNS.flat().filter(Boolean));

/* 字幕の数字・言葉と、画面のどこと突き合わせるか（README の表と同じ）。caption は字幕側に入っているべき語。
   食い違ったら字幕を画面に合わせる。逆はしない */
const SCREEN = {
  S0: [{ selector: '.play-level', has: '手習い・埋める字1' }, { count: '.cell.is-aki', equals: 1 }, { pair: true }],
  S1: [{ caption: ['1字で', '縦も横も解ける'], annai: '二つとも解けたり' }, { solved: 2 }],
  S1seal: [{ caption: ['「天晴」の朱印'], selector: '.seal-ch', equals: '天晴' }],
  S2: [{ caption: ['埋める字 1・7・15'], blanks: [1, 7, 15] }],
  S3: [
    { caption: ['埋める字が7つ'], selector: '.play-level', has: '一人前・埋める字7' },
    { selector: '.prog-val', equals: '7' }, { seed: SEEDS.ichininmae },
  ],
  S3fill: [{ caption: ['縦と横、2つの問を'], pair: true }, { selector: '.prog-val', equals: '3' }, { solved: 4 }],
  S4: [
    { caption: ['免許皆伝は'], selector: '.play-level', has: '免許皆伝・埋める字15' },
    { caption: ['辻がすべて空き'], allTsuji: true }, { annai: '空いた辻は15か所' }, { seed: SEEDS.menkyo },
  ],
  S4aki: [{ pair: true }],
  S5: [
    { caption: ['果たし状で友に送れる'], selector: '.letter-head', has: '果たし状が届いたでござる' },
    { selector: '.letter-text', has: '免許皆伝（埋める字15）' }, { selector: '.letter-time', has: '5分12秒' },
  ],
};

// ---------------------------------------------------------------- 引数と下ごしらえ

function parseArgs(args) {
  const options = { audio: 'a', day: DEFAULT_DAY, out: join(here, 'promo.mp4'), sheet: join(here, 'preview-contact.jpg'), shots: null, keep: false };
  for (let i = 0; i < args.length; i += 1) {
    const next = () => { const value = args[i + 1]; if (!value || value.startsWith('--')) throw new Error(`${args[i]} の値がありません`); i += 1; return value; };
    if (args[i] === '--audio') options.audio = next().toLowerCase();
    else if (args[i] === '--day') options.day = Number(next());
    else if (args[i] === '--out') options.out = resolve(next());
    else if (args[i] === '--sheet') options.sheet = resolve(next());
    else if (args[i] === '--shots') options.shots = resolve(next());
    else if (args[i] === '--keep') options.keep = true;
    else throw new Error(`知らない引数です: ${args[i]}（--audio a|b / --day / --out / --sheet / --shots / --keep）`);
  }
  if (!['a', 'b'].includes(options.audio)) throw new Error('--audio は a か b です');
  if (!Number.isInteger(options.day) || options.day < 1 || options.day > 100) throw new Error('--day は 1〜100 の整数です');
  options.endLines = { seal: '辻', title: 'ことば辻', sub: '江戸のクロスワード', fuda: '無料・登録不要', day: `Day ${options.day} / 100` };
  if (extname(options.out) !== '.mp4') throw new Error('--out は .mp4 を指定してください');
  return options;
}

/* 絵コンテの書き方の約束（1行16字・2行まで・字幕の切れ目が連続・字幕の語が画面の表と一致） */
function checkTimeline() {
  const problems = [];
  CAPTIONS.forEach((caption, index) => {
    if (caption.lines.length > 2) problems.push(`字幕${index}が3行以上`);
    for (const line of caption.lines) if ([...line].length > 16) problems.push(`字幕${index}「${line}」が16字を超える（${[...line].length}字）`);
    if (index && Math.abs(CAPTIONS[index - 1].end - caption.start) > 1e-9) problems.push(`字幕${index - 1}と${index}の間が切れている`);
  });
  if (CAPTIONS.at(-1).end !== END_START) problems.push('最後の字幕はエンドの頭で終わる約束');
  for (const [scene, checks] of Object.entries(SCREEN)) {
    for (const check of checks) {
      for (const word of check.caption ?? []) {
        if (!CAPTIONS.some((caption) => caption.lines.includes(word))) problems.push(`${scene}: 字幕に「${word}」が無い（SCREEN と timeline.mjs を合わせる）`);
      }
    }
  }
  if (problems.length) throw new Error(`timeline.mjs を確かめてください: ${problems.join(' / ')}`);
}

/* 撮影中の秒（ページの秒）と動画の秒の換算。幕の gap はページにだけあり、書き出しで切り落とす */
const PAGE_CUTS = (() => { let total = 0; return CUTS.map((cut) => { const pageAt = cut.at + total; total += cut.gap; return { ...cut, pageAt }; }); })();
const TOTAL_GAP = CUTS.reduce((sum, cut) => sum + cut.gap, 0);
const gapsBefore = (videoSeconds) => CUTS.filter((cut) => cut.at <= videoSeconds).reduce((sum, cut) => sum + cut.gap, 0);
const toPage = (videoSeconds) => videoSeconds + gapsBefore(videoSeconds);

/* Day のフォルダを空きポート（OS が選ぶ。4321 のような決め打ちの番号は使わない）で配る。台紙だけはここで返す */
async function serve(stage) {
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://local').pathname);
      if (path === STAGE_PATH) { res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' }).end(stage); return; }
      if (path.endsWith('/')) path += 'index.html';
      const file = resolve(appDir, `.${path}`);
      if (!file.startsWith(appDir + sep)) { res.writeHead(403).end(); return; }
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
    } catch {
      if (!res.headersSent) res.writeHead(404);
      res.end('not found');
    }
  });
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok); });
  return { base: `http://127.0.0.1:${server.address().port}`, stop: () => server.close() };
}

/* Playwright は環境変数 PLAYWRIGHT（index.js のパス）から読む。無ければこのリポジトリの node_modules の playwright */
async function loadPlaywright() {
  const spec = process.env.PLAYWRIGHT || 'playwright';
  const target = spec.startsWith('.') || spec.startsWith('/') ? pathToFileURL(resolve(spec)).href : spec;
  const mod = await import(target);
  const pw = mod.chromium ? mod : mod.default;
  if (!pw?.chromium) throw new Error('Playwright を読み込めませんでした（PLAYWRIGHT=<playwright の index.js> を付けて実行）');
  return pw;
}

/* KOTOBA_BROWSER=chromium|webkit。未指定なら Chromium を試し、起動できなければ WebKit に切り替える
   （画面がロックされた Mac では Chromium が起動の直後に落ちるため、ページを1枚開けるかまで確かめる） */
async function launchBrowser(pw) {
  const want = String(process.env.KOTOBA_BROWSER || '').toLowerCase();
  if (want === 'webkit') return pw.webkit.launch();
  let browser = null;
  try {
    browser = await pw.chromium.launch();
    const context = await browser.newContext();
    await context.newPage();
    await context.close();
    return browser;
  } catch (error) {
    await browser?.close().catch(() => {});
    if (want === 'chromium') throw error;
    console.warn(`Chromium を起動できないため WebKit に切り替える: ${String(error?.message ?? error).split('\n')[0]}`);
    return pw.webkit.launch();
  }
}

function runAudio(args) {
  return new Promise((ok, fail) => {
    const child = spawn(process.execPath, [join(here, 'promo-audio.mjs'), ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { out += chunk; });
    child.on('error', fail);
    child.on('close', (code) => (code === 0 || code === 2 ? ok({ out, failed: code === 2 }) : fail(new Error(`BGM を作れませんでした:\n${out}`))));
  });
}

/* 字幕とエンドの字が、同梱書体の字の一覧（fonts/chars.txt）に全部あるか。無い字は別の書体で描かれてしまう。
   「□」だけは書体に無いので、台紙が CSS の枠で描く */
function fontGlyphs(endLines) {
  const chars = readFileSync(join(appDir, 'fonts', 'chars.txt'), 'utf8');
  const have = new Set([...chars]);
  const text = [...CAPTIONS.flatMap((caption) => caption.lines), ...Object.values(endLines)].join('');
  const missing = [...new Set([...text])].filter((ch) => ch !== '□' && ch.trim() && !have.has(ch));
  return { chars, missing };
}

// ---------------------------------------------------------------- 外への通信（書体も同梱なので、すべて断って記録する）

const blocked = new Set();
async function route(request) {
  const url = new URL(request.request().url());
  if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return request.continue();
  blocked.add(url.host);
  return request.abort();
}

// ---------------------------------------------------------------- 撮影用の台紙（字幕の帯・iframe・注目の印・幕・エンド・カチンコ）

/* 色と書体はアプリの app.css（和紙・墨・朱・藍・木）に合わせる。差し込む要素はすべて pointer-events: none
   （画面いっぱいの幕やエンドが透明でもクリックを奪うため） */
function stageHtml(end) {
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>ことば辻 promo</title>
<link rel="stylesheet" href="${FONT_CSS}">
<style>
  :root { --washi: #F2E8D5; --sumi: #26221E; --shu: #B33A2B; --ai: #22406B; --kinari: #FBF6EA; --wood: #6B4428; --wood-face: #C99E6E; --wood-light: #E2C49A; --kincha: #C8963E; --akari: #F6DFA4; }
  html, body { margin: 0; height: 100%; overflow: hidden; background: var(--washi); }
  #band { position: absolute; left: 0; right: 0; top: 0; height: ${BAND - 3}px; border-bottom: 3px solid var(--wood-face);
    background: radial-gradient(90% 120% at 50% 0%, #F7EFDD 0%, var(--washi) 60%, #EADCC0 100%); }
  #app { position: absolute; left: 0; top: ${BAND}px; width: ${VIEW.width}px; height: ${VIEW.height - BAND}px; border: 0; display: block; background: var(--washi); }
  .promo-caption { position: absolute; left: 50%; top: 110px; transform: translateX(-50%); padding: 7px 24px 9px; border-radius: 6px;
    background: linear-gradient(180deg, #FFFBF1, #F6ECD8); box-shadow: 0 0 0 2px var(--wood-face), 0 6px 14px rgba(38, 34, 30, .14);
    font-family: "Shippori Mincho B1", "Hiragino Mincho ProN", serif; font-weight: 800; font-size: 33px; line-height: 1.3; letter-spacing: .03em;
    color: var(--sumi); text-align: center; white-space: nowrap; opacity: 0; transition: opacity 200ms ease; pointer-events: none; z-index: 60; }
  .promo-caption[data-on="1"] { opacity: 1; }
  .promo-caption span { display: block; }
  .promo-caption .tone-shu { color: var(--shu); }
  .promo-caption .tone-ai { color: var(--ai); }
  /* 「□」は同梱書体に無いので、盤の空き辻と同じ朱の点線の枠で描く */
  .promo-caption i.aki { display: inline-block; width: .8em; height: .8em; margin: 0 .08em 0 .02em; vertical-align: -.04em; box-sizing: border-box;
    border: 2px dotted var(--shu); border-radius: 1px; background: #FFFDF6; }
  .promo-ring { position: absolute; left: 0; top: 0; width: 0; height: 0; border-radius: 8px; border: 3px solid var(--shu);
    box-shadow: 0 0 0 3px rgba(179, 58, 43, .16), 0 0 18px rgba(179, 58, 43, .35); opacity: 0; transition: opacity 220ms ease; pointer-events: none; z-index: 20; }
  .promo-ring[data-on="1"] { opacity: 1; animation: promo-breathe 1.4s ease-in-out infinite; }
  @keyframes promo-breathe { 50% { box-shadow: 0 0 0 6px rgba(179, 58, 43, .1), 0 0 28px rgba(179, 58, 43, .5); } }
  .promo-ring.is-glow { border-color: var(--kincha); border-radius: 6px; }
  .promo-ring.is-glow[data-on="1"] { animation: promo-glow ${GLOW_PERIOD}s ease-in-out infinite; }
  @keyframes promo-glow {
    0%, 100% { transform: scale(.9); box-shadow: 0 0 0 2px rgba(246, 223, 164, .95), 0 0 10px 2px rgba(200, 150, 62, .8); }
    50% { transform: scale(1.3); box-shadow: 0 0 0 14px rgba(246, 223, 164, .3), 0 0 34px 14px rgba(200, 150, 62, .4); }
  }
  .promo-tap { position: absolute; width: 56px; height: 56px; margin: -28px 0 0 -28px; border-radius: 50%; background: rgba(34, 64, 107, .2);
    box-shadow: 0 0 0 3px rgba(34, 64, 107, .85), 0 0 0 7px rgba(251, 246, 234, .55); z-index: 30; pointer-events: none;
    animation: promo-tap 560ms cubic-bezier(.2, .7, .3, 1) forwards; }
  @keyframes promo-tap { 0% { transform: scale(.4); opacity: 0; } 20% { transform: scale(.8); opacity: 1; } 100% { transform: scale(1.4); opacity: 0; } }
  /* 幕：藍の暖簾が左右から閉じる（定式幕の3色の縞は歌舞伎座の登録商標なので使わない。アプリの開幕と同じ考え） */
  .promo-wipe { position: absolute; left: 0; right: 0; top: ${BAND}px; bottom: 0; overflow: hidden; pointer-events: none; z-index: 40; display: none; --k: 0; }
  .promo-wipe[data-on="1"] { display: block; }
  .promo-wipe i { position: absolute; top: 0; bottom: 0; width: 51%; background: linear-gradient(180deg, #1B355A 0%, var(--ai) 50%, #1D3860 100%); }
  .promo-wipe i.l { left: 0; transform: translateX(calc((var(--k) - 1) * 100%)); box-shadow: inset -2px 0 0 rgba(251, 246, 234, .22); }
  .promo-wipe i.r { right: 0; transform: translateX(calc((1 - var(--k)) * 100%)); box-shadow: inset 2px 0 0 rgba(251, 246, 234, .22); }
  .promo-wipe b { position: absolute; left: 50%; top: 42%; width: 84px; height: 84px; margin: -42px 0 0 -42px; border-radius: 50%;
    background: var(--washi); color: var(--ai); font: 800 46px/84px "Shippori Mincho B1", serif; text-align: center; opacity: calc(var(--k) * 1.6 - .6); }
  .promo-end { position: absolute; inset: 0; z-index: 50; display: grid; place-content: center; justify-items: center; gap: 16px; pointer-events: none;
    background: radial-gradient(110% 70% at 50% 40%, #FBF6EA 0%, var(--washi) 58%, #E6D6B6 100%); opacity: 0; transition: opacity 420ms ease; }
  .promo-end[data-on="1"] { opacity: 1; }
  .promo-end .end-seal { width: 96px; height: 96px; border-radius: 50%; background: var(--shu); color: var(--washi); font: 800 54px/96px "Shippori Mincho B1", serif;
    text-align: center; box-shadow: inset 0 0 0 4px rgba(251, 246, 234, .22); opacity: 0; transform: scale(1.4) rotate(-8deg); margin-bottom: 4px; }
  .promo-end[data-on="1"] .end-seal { animation: end-stamp 360ms cubic-bezier(.3, 1.5, .5, 1) 160ms forwards; }
  @keyframes end-stamp { to { opacity: 1; transform: scale(1) rotate(-8deg); } }
  .promo-end .end-title { font: 800 78px/1.1 "Shippori Mincho B1", serif; color: var(--sumi); letter-spacing: .12em; margin-right: -.12em; }
  .promo-end .end-sub { font: 700 29px/1.3 "Shippori Mincho B1", serif; color: var(--ai); letter-spacing: .18em; margin-right: -.18em; }
  .promo-end .end-fuda { margin-top: 14px; padding: 12px 30px 13px; border: 3px solid var(--wood); border-radius: 6px;
    background: linear-gradient(180deg, var(--wood-light), var(--wood-face)); box-shadow: 0 6px 14px rgba(38, 34, 30, .18);
    font: 700 29px/1.2 "Zen Kaku Gothic New", sans-serif; color: var(--sumi); letter-spacing: .08em; }
  .promo-end .end-day { margin-top: 6px; font: 700 25px/1.2 "Zen Kaku Gothic New", sans-serif; color: var(--ai); letter-spacing: .1em; }
  .promo-flash { position: absolute; inset: 0; background: #ff00ff; z-index: 2147483647; display: none; pointer-events: none; }
  .promo-flash[data-on="1"] { display: block; }
  #promo-warm { position: absolute; left: 0; top: -4000px; width: 540px; opacity: 0; pointer-events: none; }
</style></head>
<body>
  <div id="band"></div>
  <iframe id="app" src="/index.html#c-1-${SEEDS.tenarai}" title="ことば辻"></iframe>
  <div class="promo-ring"></div><div class="promo-ring"></div><div class="promo-ring"></div><div class="promo-ring"></div>
  <div class="promo-caption"></div>
  <div class="promo-wipe"><i class="l"></i><i class="r"></i><b>${end.seal}</b></div>
  <div class="promo-end">
    <div class="end-seal">${end.seal}</div>
    <div class="end-title">${end.title}</div>
    <div class="end-sub">${end.sub}</div>
    <div class="end-fuda">${end.fuda}</div>
    <div class="end-day">${end.day}</div>
  </div>
  <div class="promo-flash"></div>
  <div id="promo-warm"></div>
  <script>
    window.promoTap = (x, y) => {
      const dot = document.createElement('div');
      dot.className = 'promo-tap'; dot.style.left = x + 'px'; dot.style.top = y + 'px';
      document.body.append(dot); setTimeout(() => dot.remove(), 900);
    };
  </script>
</body></html>`;
}

/* 書体を先に読み込ませる。台紙とアプリの両方に、同梱書体の字を全部の太さで置いてから fonts.ready を待つ */
async function warmFonts(page, app, glyphs) {
  const faces = FACES;
  const plant = ([text, list]) => {
    let box = document.getElementById('promo-warm');
    if (!box) { box = document.createElement('div'); box.id = 'promo-warm'; box.setAttribute('aria-hidden', 'true'); box.style.cssText = 'position:absolute;left:0;top:-4000px;width:540px;opacity:0;pointer-events:none'; document.body.append(box); }
    box.replaceChildren(...list.map(([family, weight]) => { const p = document.createElement('p'); p.style.cssText = `font-family:"${family}";font-weight:${weight};font-size:20px`; p.textContent = text; return p; }));
    return document.fonts.ready.then(() => ({
      ok: document.fonts.check('800 20px "Shippori Mincho B1"') && document.fonts.check('500 20px "Zen Kaku Gothic New"'),
      errors: [...document.fonts].filter((face) => face.status === 'error').length,
      loaded: [...document.fonts].filter((face) => face.status === 'loaded').length,
    }));
  };
  const [a, b] = await Promise.all([page.evaluate(plant, [glyphs, faces]), app.evaluate(plant, [glyphs, faces])]);
  await page.waitForTimeout(300);
  return { ok: a.ok && b.ok, errors: a.errors + b.errors, loaded: a.loaded + b.loaded };
}

/* ページの中の予定表。t0 から見たページの秒で動き、幕の gap の間は動画の秒を止める（書き出しで切り落とす所）。
   字幕・注目の印・幕・エンド・カチンコ・手習いの「受けて立つ」をここで出し、字幕の置き場所を毎コマ確かめて記録する */
function runSchedule(plan) {
  const $ = (selector) => document.querySelector(selector);
  const frameEl = $('#app');
  const caption = $('.promo-caption');
  const wipe = $('.promo-wipe');
  const end = $('.promo-end');
  const flash = $('.promo-flash');
  const rings = [...document.querySelectorAll('.promo-ring')];
  const t0 = performance.now() + plan.leadIn * 1000;
  const W = innerWidth; const H = innerHeight;
  const safe = { left: W * .1, right: W * .9, top: H * .1, bottom: H * .9 };
  const log = { captions: [], violations: [], first: null, focusMissing: [], accept: null, done: false, frames: 0, probes: {} };
  window.promoLog = log;
  let total = 0;
  const cuts = plan.cuts.map((cut) => { const pageAt = cut.at + total; total += cut.gap; return { ...cut, pageAt }; });
  const toVideo = (t) => {
    let v = t;
    for (const cut of cuts) {
      if (t >= cut.pageAt + cut.gap) v -= cut.gap;
      else if (t >= cut.pageAt) return { v: cut.at, held: true };
    }
    return { v, held: false };
  };
  const ease = (x) => (x < .5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
  const doc = () => frameEl.contentDocument;
  const shown = (node) => Boolean(node) && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden';
  const box = (node) => { const r = node.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
  const inFrame = (node) => {
    const o = frameEl.getBoundingClientRect(); const r = node.getBoundingClientRect();
    const rect = { left: Math.max(o.left, o.left + r.left), top: Math.max(o.top, o.top + r.top), right: Math.min(o.right, o.left + r.right), bottom: Math.min(o.bottom, o.top + r.bottom) };
    return rect.right > rect.left && rect.bottom > rect.top ? rect : null;
  };
  const hits = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const targets = (name) => {
    const d = doc();
    if (!d) return [];
    const one = (selector) => [d.querySelector(selector)];
    if (name === 'aki') return one('.cell.is-aki:not(.is-locked)');
    if (name === 'seal') return one('.seal');
    if (name === 'levels') return [...d.querySelectorAll('.level-card .lc-blanks')];
    if (name === 'prog') return one('.play-prog');
    if (name === 'clue') return one('.clue');
    if (name === 'board') return one('.board');
    if (name === 'letter') return one('.letter');
    return [];
  };
  let captionIndex = -2;
  const fit = () => {
    caption.style.fontSize = '';
    const width = caption.getBoundingClientRect().width;
    const room = safe.right - safe.left;
    if (width > room) caption.style.fontSize = `${Math.floor(33 * room / width)}px`;
    const height = caption.getBoundingClientRect().height;
    caption.style.top = `${Math.round(safe.top + Math.max(0, (plan.band - 6 - safe.top - height) / 2))}px`;
  };
  const frame = (now) => {
    const t = (now - t0) / 1000;
    log.frames += 1;
    flash.dataset.on = t >= plan.flash[0] && t < plan.flash[1] ? '1' : '0';
    if (!log.accept && t >= plan.acceptAt) {
      const button = doc()?.querySelector('[data-act="accept"]');
      button?.click();
      log.accept = { t, found: Boolean(button) };
    }
    const { v, held } = toVideo(t);
    const index = plan.captions.findIndex((item) => v >= item.start && v < item.end);
    if (index !== captionIndex) {
      captionIndex = index;
      caption.replaceChildren();
      if (index >= 0) {
        const item = plan.captions[index];
        item.lines.forEach((line, k) => {
          const span = document.createElement('span');
          // 「□」は同梱書体に無いので、朱の点線の枠（i.aki）に置き換える
          line.split('□').forEach((part, n) => {
            if (n) { const box = document.createElement('i'); box.className = 'aki'; span.append(box); }
            span.append(part);
          });
          if (k === item.lines.length - 1 && item.tone) span.className = `tone-${item.tone}`;
          caption.append(span);
        });
        fit();
      }
      caption.dataset.on = index >= 0 ? '1' : '0';
      log.captions.push({ index, t, v, rect: index >= 0 ? box(caption) : null });
    }
    // 幕：閉じる（WIPE_IN）→ gap の間は閉じたまま → 開く（WIPE_OUT）
    let k = held ? 1 : 0;
    for (const cut of plan.cuts) {
      if (v >= cut.at - plan.wipeIn && v < cut.at) k = Math.max(k, ease((v - (cut.at - plan.wipeIn)) / plan.wipeIn));
      else if (v >= cut.at && v < cut.at + plan.wipeOut) k = Math.max(k, 1 - ease((v - cut.at) / plan.wipeOut));
    }
    wipe.style.setProperty('--k', k.toFixed(4));
    wipe.dataset.on = k > 0 ? '1' : '0';
    // 注目の印（空き辻の光・朱の枠）。相手が見えなければ出さずに記録する
    const active = held ? [] : plan.focus.filter((item) => v >= item.start && v < item.end);
    let used = 0;
    for (const item of active) {
      const nodes = targets(item.target).filter(shown).map(inFrame).filter(Boolean);
      if (!nodes.length && !log.focusMissing.includes(item.target)) log.focusMissing.push(item.target);
      for (const rect of nodes) {
        const ring = rings[used];
        if (!ring) break;
        used += 1;
        const pad = item.style === 'glow' ? 2 : 6;
        ring.classList.toggle('is-glow', item.style === 'glow');
        Object.assign(ring.style, { left: `${rect.left - pad}px`, top: `${rect.top - pad}px`, width: `${rect.right - rect.left + pad * 2}px`, height: `${rect.bottom - rect.top + pad * 2}px` });
        ring.dataset.on = '1';
      }
    }
    rings.slice(used).forEach((ring) => { ring.dataset.on = '0'; });
    end.dataset.on = v >= plan.endStart ? '1' : '0';
    for (const probe of plan.probes) {
      if (!log.probes[probe.name] && v >= probe.at && !held) {
        const clue = doc()?.querySelector('.clue');
        const board = doc()?.querySelector('.board');
        log.probes[probe.name] = { clue: clue && shown(clue) ? inFrame(clue) : null, board: board && shown(board) ? inFrame(board) : null };
      }
    }
    if (t >= 0 && !log.first) {
      const glow = targets('aki')[0];
      log.first = { t, screen: doc()?.body?.dataset.screen ?? null, glow: glow && shown(glow) ? inFrame(glow) : null, caption: box(caption) };
    }
    // 字幕が安全域の外に出ていないか、盤・問・五十音盤などの読む所に掛かっていないか（6コマに1回）
    if (index >= 0 && t >= 0 && !held && log.frames % 6 === 0) {
      const at = box(caption);
      const problems = [];
      if (at.left < safe.left - .5 || at.right > safe.right + .5 || at.top < safe.top - .5 || at.bottom > safe.bottom + .5) problems.push('安全域の外');
      const d = doc();
      const keep = d ? [...d.querySelectorAll('.board, .clue, .keypad, .play-head, .level-list, .letter, .result-top, .stats')].filter(shown) : [];
      for (const node of keep) { const rect = inFrame(node); if (rect && hits(at, rect)) problems.push(`${node.className.split(' ')[0]}に重なる`); }
      if (problems.length && log.violations.length < 20) log.violations.push({ v: Number(v.toFixed(2)), caption: index, problems: [...new Set(problems)] });
    }
    if (t < plan.duration + plan.totalGap + .3) requestAnimationFrame(frame);
    else log.done = true;
  };
  requestAnimationFrame(frame);
  return true;
}

/* iframe の中を、狙った要素が箱の上から align の位置に来るまで ms かけて送る（見せたい送り。下見は一瞬で） */
function scrollInto({ selector, align, ms }) {
  const node = document.querySelector(selector);
  if (!node) return Promise.resolve(`${selector} が無い`);
  const scroller = document.scrollingElement;
  const r = node.getBoundingClientRect();
  if (r.top >= 0 && r.bottom <= innerHeight - 8) return Promise.resolve('ok');
  const to = Math.max(0, Math.min(scroller.scrollHeight - innerHeight, scroller.scrollTop + r.top - innerHeight * align));
  const from = scroller.scrollTop;
  if (ms <= 0) { scroller.scrollTo({ top: to, behavior: 'instant' }); return Promise.resolve('ok'); }
  return new Promise((done) => {
    const start = performance.now();
    const ease = (x) => (x < .5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
    const step = (now) => {
      const k = Math.min(1, (now - start) / ms);
      scroller.scrollTo({ top: from + (to - from) * ease(k), behavior: 'instant' });
      if (k < 1) requestAnimationFrame(step); else done('ok');
    };
    requestAnimationFrame(step);
  });
}

/* 腕前選びから始める局の種を固定する（randomSeed が使う crypto.getRandomValues の9語だけを差し替える） */
function pinSeed(seed) {
  const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';
  const values = [seed.length - 6, ...[...seed].map((ch) => B36.indexOf(ch))];
  const original = crypto.getRandomValues.bind(crypto);
  crypto.getRandomValues = (array) => {
    if (array instanceof Uint32Array && array.length === 9) { array.fill(0); values.forEach((value, i) => { array[i] = value; }); return array; }
    return original(array);
  };
}
/* 案内役の台詞を候補から選ぶ1回だけ、Math.random を固定する（ms 後に戻す） */
function pinRandom([value, ms]) {
  const original = Math.random;
  Math.random = () => value;
  setTimeout(() => { Math.random = original; }, ms);
}

// ---------------------------------------------------------------- 操作（下見と本番で同じ台本を使う）

async function check(app, scene) {
  for (const item of SCREEN[scene]) {
    const fail = (what) => { throw new Error(`画面と字幕が食い違っています（${scene}）: ${what}`); };
    if (item.selector) {
      const text = ((await app.locator(item.selector).first().textContent({ timeout: 5000 })) ?? '').trim();
      if (item.has !== undefined && !text.includes(item.has)) fail(`「${item.has}」が ${item.selector} に無い（実際は「${text.slice(0, 60)}」）`);
      if (item.equals !== undefined && text !== item.equals) fail(`${item.selector} は「${item.equals}」のはず（実際は「${text}」）`);
    }
    if (item.count) {
      const n = await app.locator(item.count).count();
      if (n !== item.equals) fail(`${item.count} は ${item.equals} 個のはず（実際は ${n} 個）`);
    }
    if (item.pair) {
      const rows = await app.evaluate(() => [...document.querySelectorAll('.clue .clue-row')].filter((row) => !row.hidden && row.getClientRects().length).map((row) => row.textContent.trim()));
      if (rows.length !== 2) fail(`問の帯が縦横2段になっていない（${rows.length}段）`);
    }
    if (item.annai) {
      const text = (await app.locator('.annai-text').first().textContent()) ?? '';
      if (!text.includes(item.annai)) fail(`案内役の台詞に「${item.annai}」が無い（実際は「${text}」）`);
    }
    if (item.blanks) {
      const nums = (await app.locator('.level-card .lc-blanks b').allTextContents()).map(Number);
      if (nums.join('・') !== item.blanks.join('・')) fail(`腕前の札の埋める字は ${item.blanks.join('・')} のはず（実際は ${nums.join('・')}）`);
    }
    if (item.allTsuji) {
      const r = await app.evaluate(() => { const p = window.__kotoba.puzzle(); return { crossings: p.crossings, blanks: p.blanks.length, only: p.blanksAtCrossingsOnly, aki: document.querySelectorAll('.cell.is-aki').length }; });
      if (!(r.only && r.blanks === r.crossings && r.aki === r.crossings)) fail(`辻がすべて空いていない（辻 ${r.crossings}・空き ${r.blanks}・盤の空き ${r.aki}）`);
    }
    if (item.solved !== undefined) {
      const n = await app.evaluate(() => window.__kotoba.game().solved.size);
      if (n !== item.solved) fail(`解けた言葉は ${item.solved} 語のはず（実際は ${n} 語）`);
    }
    if (item.seed) {
      const seed = await app.evaluate(() => window.__kotoba.puzzle().seed);
      if (seed !== item.seed) fail(`盤の種は ${item.seed} のはず（実際は ${seed}）`);
    }
  }
}

async function perform(page, app, { take, t0, report, shots }) {
  const clock = () => (Date.now() - t0) / 1000;
  const atPage = async (pageSeconds) => {
    if (!take) { await page.waitForTimeout(REHEARSAL_STEP_MS); return; }
    const wait = t0 + pageSeconds * 1000 - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
  };
  const at = (videoSeconds) => atPage(toPage(videoSeconds));
  const snap = async (name) => { if (shots) await page.screenshot({ path: join(shots, `${name}.png`) }); };
  const tap = async (locator, name, planned, { pin = null } = {}) => {
    await at(planned - RIPPLE_LEAD);
    const b = await locator.boundingBox({ timeout: 5000 });
    if (!b) throw new Error(`押すものが画面にありません: ${name}`);
    const x = b.x + b.width / 2;
    const y = b.y + b.height / 2;
    if (x < 0 || y < BAND || x > VIEW.width || y > VIEW.height) throw new Error(`押すものがアプリの画面の外です（${Math.round(x)}, ${Math.round(y)}）: ${name}`);
    if (take) await page.evaluate(([px, py]) => window.promoTap(px, py), [x, y]);
    if (pin) await app.evaluate(pinRandom, pin);
    await at(planned);
    await page.mouse.click(x, y);
    if (take) report.taps.push({ name, planned, actual: clock() - gapsBefore(planned) });
  };
  const kanaHere = () => app.evaluate(() => {
    const g = window.__kotoba.game(); const p = window.__kotoba.puzzle();
    return g.isBlank(g.cursor.x, g.cursor.y) && !g.locked[g.cursor.y][g.cursor.x] ? p.grid[g.cursor.y][g.cursor.x] : null;
  });
  const key = (kana) => {
    if (!kana || !PLAIN_KANA.has(kana)) throw new Error(`五十音盤の1押しで書けない字です（${kana}）。timeline.mjs の SEEDS を選び直す`);
    return app.locator(`.key[data-kana="${kana}"]`);
  };

  /* S0 手習いの盤（edo01p）。本番はページの予定表が t0 の1.1秒前に「受けて立つ」を押す */
  if (!take) await app.locator('[data-act="accept"]').click();
  await app.waitForSelector('[data-screen="play"]', { timeout: (LEAD_IN + 4) * 1000 });
  await check(app, 'S0');
  await snap('s0-tenarai');

  /* S1 五十音盤で空き辻の字を押す。縦横2語が藍に染まり「一字で…二つとも解けたり」→約1.2秒後に結果の朱印「天晴」 */
  const answer = await kanaHere();
  await tap(key(answer), `五十音盤「${answer}」`, T_KANA, { pin: [0, 400] });
  await check(app, 'S1');
  await snap('s1-dyed');
  await app.waitForSelector('[data-screen="result"]', { timeout: 5000 });
  await check(app, 'S1seal');
  await snap('s1-result');

  /* S2 「腕前を変える」→ 腕前選び（埋める字 1・7・15）。札が画面の下なら、押す前にゆっくり送って見せる */
  await at(T_CHANGE - 1.1);
  const scrolled = await app.evaluate(scrollInto, { selector: '[data-act="change"]', align: .72, ms: take ? 650 : 0 });
  if (scrolled !== 'ok') throw new Error(`結果の画面を送れません: ${scrolled}`);
  await tap(app.locator('[data-act="change"]'), '腕前を変える', T_CHANGE);
  await app.waitForSelector('[data-screen="select"]', { timeout: 5000 });
  await check(app, 'S2');
  await snap('s2-select');

  /* S3 一人前（種 edo0d3 に固定）。4字を続けて書き、言葉が1つずつ藍に染まって残りが 7→3 */
  await app.evaluate(pinSeed, SEEDS.ichininmae);
  await tap(app.locator('.level-card[data-level="2"]'), '一人前', T_ICHI, { pin: [0, 900] });
  await app.waitForSelector('[data-screen="play"]', { timeout: 5000 });
  await check(app, 'S3');
  await snap('s3-ichininmae');
  for (const [index, planned] of T_FILLS.entries()) {
    const kana = await kanaHere();
    const before = await app.evaluate(() => window.__kotoba.game().solved.size);
    await tap(key(kana), `「${kana}」（${index + 1}字目）`, planned);
    const after = await app.evaluate(() => window.__kotoba.game().solved.size);
    if (after <= before) throw new Error(`「${kana}」で言葉が解けなかった（${index + 1}字目）`);
    report.fills.push(kana);
  }
  await check(app, 'S3fill');
  await snap('s3-filled');

  /* S4 幕の間に、免許皆伝の盤（edo042）へ組み替える：退く → 果たし状のリンク → 受けて立つ → 途中の局を消して新しく */
  const [cut1, cut2] = PAGE_CUTS;
  await atPage(cut1.pageAt + .05);
  const started1 = Date.now();
  await app.locator('[data-act="leave"]').click();
  await app.waitForSelector('[data-screen="title"]', { timeout: 5000 });
  await app.evaluate((hash) => { location.hash = hash; }, `#c-3-${SEEDS.menkyo}`);
  await app.waitForSelector('[data-screen="challenge"]', { timeout: 5000 });
  await app.locator('[data-act="accept"]').click();
  const fresh = app.locator('[data-dialog="midway"] [data-value="new"]');
  await fresh.waitFor({ timeout: 5000 });
  await atPage(cut1.pageAt + cut1.gap - .5);   // 盤は幕が開く直前に出す（案内役の一言を開いた後にも見せる）
  await app.evaluate(pinRandom, [.7, 400]);    // 「空いた辻は15か所。易しい所から埋めるが吉であろう。」
  await fresh.click();
  await app.waitForSelector('[data-screen="play"]', { timeout: 5000 });
  report.cuts.push({ name: cut1.name, ms: Date.now() - started1, late: take && clock() > cut1.pageAt + cut1.gap - .05 });
  await check(app, 'S4');
  await snap('s4-menkyo');
  const aki = await app.evaluate(() => {
    const g = window.__kotoba.game(); const p = window.__kotoba.puzzle();
    const cx = (p.width - 1) / 2; const cy = (p.height - 1) / 2;
    return p.blanks.filter(({ x, y }) => !(x === g.cursor.x && y === g.cursor.y)).sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))[0];
  });
  await tap(app.locator(`.cell[data-x="${aki.x}"][data-y="${aki.y}"]`), `空き辻（${aki.x},${aki.y}）`, T_AKI);
  await check(app, 'S4aki');

  /* S5 幕の間に、果たし状の画面へ（同じ盤。差出人の時間つき） */
  await atPage(cut2.pageAt + .05);
  const started2 = Date.now();
  await app.locator('[data-act="leave"]').click();
  await app.waitForSelector('[data-screen="title"]', { timeout: 5000 });
  await app.evaluate((hash) => { location.hash = hash; }, `#c-3-${SEEDS.menkyo}-${DUEL_SECONDS}`);
  await app.waitForSelector('[data-screen="challenge"]', { timeout: 5000 });
  report.cuts.push({ name: cut2.name, ms: Date.now() - started2, late: take && clock() > cut2.pageAt + cut2.gap - .05 });
  await check(app, 'S5');
  await snap('s5-duel');
}

async function openStage(context, base) {
  const page = await context.newPage();
  await page.goto(`${base}${STAGE_PATH}`, { waitUntil: 'load' });
  const handle = await page.waitForSelector('#app');
  const app = await handle.contentFrame();
  await app.waitForFunction(() => document.body?.dataset.boot === 'ready', null, { timeout: 25_000 });
  await app.waitForSelector('[data-screen="challenge"]', { timeout: 10_000 });
  const letter = (await app.locator('.letter-text').textContent()) ?? '';
  if (!letter.includes('手習い（埋める字1）')) throw new Error(`手習いの果たし状が出ていません（${letter}）`);
  return { page, app };
}

// ---------------------------------------------------------------- 書き出した動画の検査

const ffmpegRaw = (args) => execFileSync('ffmpeg', ['-v', 'error', ...args, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 });

/* カチンコの光を録画の中で探す（赤紫が画面の大半を占める最初のコマ）。録画は 25fps の固定 */
function findFlash(webm) {
  const w = 8; const h = 14;
  const raw = ffmpegRaw(['-i', webm, '-vf', `scale=${w}:${h},format=rgb24`]);
  const size = w * h * 3;
  for (let i = 0; i < Math.floor(raw.length / size); i += 1) {
    let magenta = 0;
    for (let p = 0; p < w * h; p += 1) {
      const [r, g, b] = [raw[i * size + p * 3], raw[i * size + p * 3 + 1], raw[i * size + p * 3 + 2]];
      if (r > 200 && g < 70 && b > 200) magenta += 1;
    }
    if (magenta > w * h * .8) return i / 25;
  }
  return null;
}

/* 字幕が予定の秒に入れ替わったか。字幕の箱の内側だけを切り出し、予定の前後1秒で最初に大きく変わったコマを拾う
   （隣のコマとの差 step。エンドは0.42秒かけて溶け込むので、窓の頭からの差 total でも拾う）。元の30fpsのまま測る */
function captionSwitches(file, expected) {
  const W = 96; const H = 24; const STEP = 7; const TOTAL = 12;
  return expected.map(({ want, rect }) => {
    const from = Math.max(0, want - 1);
    const x = Math.round((rect.left + 10) * SCALE); const y = Math.round((rect.top + 6) * SCALE);
    const w = Math.round((rect.right - rect.left - 20) * SCALE); const h = Math.round((rect.bottom - rect.top - 12) * SCALE);
    const raw = ffmpegRaw(['-ss', from.toFixed(3), '-t', '2', '-i', file, '-vf', `crop=${w}:${h}:${x}:${y},scale=${W}:${H}:flags=area,format=gray`]);
    const size = W * H;
    let got = null; let peak = 0; let drift = 0;
    for (let i = 1; i < Math.floor(raw.length / size); i += 1) {
      let step = 0; let total = 0;
      for (let j = 0; j < size; j += 1) {
        step += Math.abs(raw[i * size + j] - raw[(i - 1) * size + j]);
        total += Math.abs(raw[i * size + j] - raw[j]);
      }
      step /= size; total /= size;
      peak = Math.max(peak, step); drift = Math.max(drift, total);
      if (got === null && (step > STEP || total > TOTAL)) got = from + i / DEFAULT_FPS;
    }
    return { want, got, peak, drift };
  });
}

/* 1コマ目と0.1秒後の、空き辻の光のまわりの差（0〜255 の平均） */
function motionAt(file, region) {
  const x = Math.max(0, Math.round((region.left - 24) * SCALE)); const y = Math.max(0, Math.round((region.top - 24) * SCALE));
  const w = Math.round((region.right - region.left + 48) * SCALE); const h = Math.round((region.bottom - region.top + 48) * SCALE);
  const raw = ffmpegRaw(['-i', file, '-frames:v', '4', '-vf', `crop=${w}:${h}:${x}:${y},format=gray`]);
  const size = w * h;
  let diff = 0;
  for (let j = 0; j < size; j += 1) diff += Math.abs(raw[3 * size + j] - raw[j]);
  return diff / size;
}

/* 押した瞬間の見た目の時刻。region の中で、from のコマから大きく変わった最初のコマ（音は予定の秒ちょうどに鳴る） */
function visualOnset(file, region, from, threshold) {
  const x = Math.max(0, Math.round(region.left * SCALE)); const y = Math.max(0, Math.round(region.top * SCALE));
  const w = Math.round((region.right - region.left) * SCALE); const h = Math.round((region.bottom - region.top) * SCALE);
  const W = 96; const H = Math.max(8, Math.round(96 * h / w));
  const raw = ffmpegRaw(['-ss', from.toFixed(3), '-t', '1', '-i', file, '-vf', `crop=${w}:${h}:${x}:${y},scale=${W}:${H}:flags=area,format=gray`]);
  const size = W * H;
  for (let i = 1; i < Math.floor(raw.length / size); i += 1) {
    let diff = 0;
    for (let j = 0; j < size; j += 1) diff += Math.abs(raw[i * size + j] - raw[j]);
    if (diff / size > threshold) return from + i / DEFAULT_FPS;
  }
  return null;
}

function probe(file) {
  const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }));
  return { video: info.streams.find((s) => s.codec_type === 'video'), audio: info.streams.find((s) => s.codec_type === 'audio'), duration: Number(info.format.duration) };
}

function loudness(file) {
  const log = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-map', '0:a:0', '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const summary = log.slice(log.lastIndexOf('Summary:'));
  const head = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-map', '0:a:0', '-af', 'atrim=0:0.3,astats=measure_perchannel=none:measure_overall=RMS_level', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  return {
    lufs: Number(/I:\s+(-?[\d.]+) LUFS/.exec(summary)?.[1]),
    truePeak: Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(summary)?.[1]),
    headRms: Number(/RMS level dB:\s+(-?[\d.inf]+)/.exec(head)?.[1]),
  };
}

function contactSheet(file, sheet) {
  const font = ['/System/Library/Fonts/Supplemental/Arial.ttf', '/System/Library/Fonts/Helvetica.ttc'].find((path) => existsSync(path));
  const label = font ? `,drawtext=fontfile=${font}:text='%{eif\\:t\\:d}s':x=10:y=10:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6` : '';
  const frames = Math.ceil(DURATION_SECONDS / 2);   // 0,2,…,32秒の17コマ
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', file, '-vf',
    `select='not(mod(n\\,${DEFAULT_FPS * 2}))',scale=270:480:flags=lanczos${label},tile=6x${Math.ceil(frames / 6)}:padding=8:margin=8:color=0x111111`,
    '-frames:v', '1', '-q:v', '3', sheet]);
}

// ---------------------------------------------------------------- 本体

async function main() {
  const options = parseArgs(process.argv.slice(2));
  checkTimeline();
  for (const cmd of ['ffmpeg', 'ffprobe']) execFileSync('which', [cmd], { stdio: 'ignore' });
  const clock = Date.now();
  const lap = () => `${((Date.now() - clock) / 1000).toFixed(0)}秒`;
  if (options.shots) mkdirSync(options.shots, { recursive: true });

  const glyphs = fontGlyphs(options.endLines);
  if (glyphs.missing.length) throw new Error(`同梱書体（fonts/chars.txt）に無い字が字幕かエンドにあります: ${glyphs.missing.join('')}（字幕を言い換えるか、fonts を作り直す）`);
  const pw = await loadPlaywright();

  // BGM は別のプロセスで両案を作り直す（約40秒。下見と並べて走らせ、本番の前に待つ）
  const music = runAudio(['--variant', 'all']);
  music.catch(() => {});

  const server = await serve(stageHtml(options.endLines));
  const work = mkdtempSync(join(tmpdir(), 'day053-promo-'));
  const browser = await launchBrowser(pw);
  const browserName = browser.browserType().name();
  const report = { taps: [], fills: [], cuts: [], errors: [], warnings: [], fontProblem: null };
  try {
    const contextOptions = { viewport: VIEW, deviceScaleFactor: 1, locale: 'ja-JP', reducedMotion: 'no-preference' };
    const watch = (page) => {
      page.on('pageerror', (error) => report.errors.push(`pageerror: ${error.message}`));
      page.on('console', (message) => { if (message.type() === 'error') report.warnings.push(`console: ${message.text().slice(0, 160)}`); });
    };
    const init = () => { globalThis.__KOTOBA_TEST__ = true; };

    /* 下見：同じ台本を待たずに通す。画面と字幕の突き合わせもここで済ませ、食い違えば録画の前に止まる */
    const rehearsal = await browser.newContext(contextOptions);
    await rehearsal.addInitScript(init);
    await rehearsal.route('**/*', route);
    const draft = await openStage(rehearsal, server.base);
    watch(draft.page);
    const fontsDraft = await warmFonts(draft.page, draft.app, glyphs.chars);
    await perform(draft.page, draft.app, { take: false, t0: 0, report, shots: options.shots });
    await rehearsal.close();
    console.log(`下見: 済み（${lap()}・${browserName}）/ 同梱書体 ${fontsDraft.loaded}面${fontsDraft.ok && !fontsDraft.errors ? '' : `（読めなかった書体 ${fontsDraft.errors}）`} / 盤の組み替え ${report.cuts.map((cut) => `${cut.name} ${cut.ms}ms`).join('・')} / 一人前で書いた字 ${report.fills.join('')}`);
    report.cuts.length = 0; report.fills.length = 0;

    const { out: musicLog, failed: musicFailed } = await music;
    const musicLines = musicLog.trim().split('\n').filter((line) => !line.startsWith('WAV'));
    console.log(`BGM:\n${musicLines.join('\n')}`);
    const wav = join(here, `promo-audio-${options.audio}.wav`);
    if (!existsSync(wav)) throw new Error(`${wav} がありません`);

    /* 本番 */
    const context = await browser.newContext({ ...contextOptions, recordVideo: { dir: work, size: VIEW } });
    await context.addInitScript(init);
    await context.route('**/*', route);
    const { page, app } = await openStage(context, server.base);
    watch(page);
    const fontsTake = await warmFonts(page, app, glyphs.chars);
    if (!fontsTake.ok || fontsTake.errors) report.fontProblem = `同梱書体の一部が読めず、代わりの書体が混じるおそれ（読めなかった書体 ${fontsTake.errors}件）`;
    const plan = {
      leadIn: LEAD_IN, flash: FLASH, acceptAt: ACCEPT_AT, band: BAND, wipeIn: WIPE_IN, wipeOut: WIPE_OUT, cuts: CUTS, totalGap: TOTAL_GAP,
      captions: CAPTIONS.map((caption, index) => ({ ...caption, start: index === 0 ? -.6 : caption.start })),
      focus: FOCUS, endStart: END_START, duration: DURATION_SECONDS,
      probes: [{ name: 'tenarai', at: 1 }, { name: 'ichi', at: T_ICHI + .8 }],
    };
    const before = Date.now();
    await page.evaluate(runSchedule, plan);
    const t0 = (before + Date.now()) / 2 + LEAD_IN * 1000;
    await perform(page, app, { take: true, t0, report, shots: null });
    await page.waitForFunction(() => window.promoLog?.done, null, { timeout: (DURATION_SECONDS + TOTAL_GAP + 10) * 1000 });
    const log = await page.evaluate(() => window.promoLog);
    await context.close();
    console.log(`本番: 済み（${lap()}）/ 外へ出ようとした宛先: ${[...blocked].join(', ') || 'なし'}`);

    /* 頭の切り落とし（カチンコ）と、幕の gap の切り落とし */
    const webm = readdirSync(work).map((name) => join(work, name)).find((path) => path.endsWith('.webm'));
    if (!webm) throw new Error('録画ファイルが作られませんでした');
    const flashAt = findFlash(webm);
    if (flashAt === null) throw new Error(`録画の中にカチンコの光が見つかりません（${webm}）`);
    const head = flashAt - FLASH[0];
    const segments = [];
    let from = 0;
    for (const cut of PAGE_CUTS) { segments.push([from, cut.pageAt]); from = cut.pageAt + cut.gap; }
    segments.push([from, DURATION_SECONDS + TOTAL_GAP + .2]);
    console.log(`頭の切り落とし ${head.toFixed(3)}秒（カチンコ ${flashAt.toFixed(2)}秒）/ 使う区間（ページの秒）${segments.map(([a, b]) => `${a.toFixed(2)}〜${b.toFixed(2)}`).join('・')}`);
    const split = segments.map((_, i) => `[s${i}]`).join('');
    const trims = segments.map(([a, b], i) => `[s${i}]trim=start=${(head + a).toFixed(3)}:end=${(head + b).toFixed(3)},setpts=PTS-STARTPTS[v${i}]`).join(';');
    const filter = `[0:v]split=${segments.length}${split};${trims};${segments.map((_, i) => `[v${i}]`).join('')}concat=n=${segments.length}:v=1:a=0,`
      + `tpad=stop_mode=clone:stop_duration=0.3,scale=${OUT.width}:${OUT.height}:flags=lanczos,fps=${DEFAULT_FPS},format=yuv420p[v]`;
    execFileSync('ffmpeg', [
      '-y', '-v', 'error', '-i', webm, '-i', wav, '-filter_complex', filter,
      '-map', '[v]', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', String(DURATION_SECONDS), '-movflags', '+faststart', options.out,
    ]);
    const firstFrame = options.out.replace(/\.mp4$/, '-first-frame.png');
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', options.out, '-frames:v', '1', firstFrame]);
    contactSheet(options.out, options.sheet);
    if (options.keep) console.log(`録画の元: ${webm}`);
    console.log(`書き出し: 済み（${lap()}）→ ${options.out}`);

    /* 検査。落ちても mp4 は残す（目で見て直すため） */
    const failures = [];
    const { video, audio, duration } = probe(options.out);
    const videoSeconds = Number(video?.duration ?? duration);
    if (video?.width !== OUT.width || video?.height !== OUT.height) failures.push(`寸法 ${video?.width}×${video?.height}`);
    if (video?.codec_name !== 'h264' || audio?.codec_name !== 'aac') failures.push(`コーデック ${video?.codec_name}/${audio?.codec_name}`);
    if (video?.r_frame_rate !== `${DEFAULT_FPS}/1`) failures.push(`フレームレート ${video?.r_frame_rate}`);
    if (Math.abs(videoSeconds - DURATION_SECONDS) > .1) failures.push(`尺 ${videoSeconds}秒`);
    const loud = loudness(options.out);
    if (!(loud.lufs >= -18 && loud.lufs <= -16)) failures.push(`音量 ${loud.lufs} LUFS（-16〜-18）`);
    if (!(loud.truePeak <= -1.5)) failures.push(`真のピーク ${loud.truePeak} dBTP（-1.5 以下）`);
    if (!(loud.headRms > -40)) failures.push(`冒頭0.3秒が静かすぎる（${loud.headRms} dBFS）`);
    if (musicFailed) failures.push('BGM の数値の検査に外れがある（上の BGM の行）');

    const switches = log.captions.filter((item) => item.index >= 1).map((item) => ({ want: CAPTIONS[item.index].start, rect: item.rect }));
    switches.push({ want: END_START, rect: { left: VIEW.width * .15, right: VIEW.width * .85, top: VIEW.height * .38, bottom: VIEW.height * .62 } });
    const measured = captionSwitches(options.out, switches);
    const off = measured.filter(({ want, got }) => got === null || Math.abs(got - want) > .4);
    if (measured.length !== CAPTIONS.length) failures.push(`字幕の入れ替わりの数 ${measured.length}（予定 ${CAPTIONS.length}）`);
    if (off.length) failures.push(`字幕が絵とずれた: ${off.map(({ want, got }) => `${want.toFixed(2)}秒→${got?.toFixed(2) ?? 'なし'}`).join('、')}`);

    const motion = log.first?.glow ? motionAt(options.out, log.first.glow) : 0;
    if (log.first?.screen !== 'play') failures.push(`1コマ目が手習いの盤になっていない（${log.first?.screen}）`);
    if (!(motion > 2)) failures.push(`1コマ目と0.1秒後で絵が動いていない（空き辻の光のまわりの差 ${motion.toFixed(2)}）`);
    if (!log.accept?.found) failures.push('手習いの「受けて立つ」を押せなかった');
    if (log.violations.length) failures.push(`字幕の置き場所: ${log.violations.slice(0, 4).map((v) => `${v.v}秒 字幕${v.caption} ${v.problems.join('・')}`).join(' / ')}`);
    if (log.focusMissing.length) failures.push(`注目の印の相手が画面に無い: ${log.focusMissing.join('・')}`);
    const late = report.taps.filter((tap) => tap.actual - tap.planned > .25);
    if (late.length) failures.push(`押すのが遅れた: ${late.map((tap) => `${tap.name} ${tap.planned.toFixed(2)}→${tap.actual.toFixed(2)}秒`).join('、')}`);
    const slow = report.cuts.filter((cut) => cut.late);
    if (slow.length) failures.push(`幕が閉じている間に盤を組み替えられなかった: ${slow.map((cut) => `${cut.name} ${cut.ms}ms`).join('、')}`);
    if (report.errors.length) failures.push(`ページのエラー: ${report.errors.join(' / ')}`);
    if (blocked.size) failures.push(`外へ出ようとした: ${[...blocked].join(', ')}`);
    if (report.fontProblem) failures.push(report.fontProblem);

    const appArea = { left: 0, right: VIEW.width, top: BAND + 2, bottom: VIEW.height };
    const onsets = [
      ['五十音盤「こ」（問の帯）', T_KANA, log.probes.tenarai?.clue, 6],
      ['腕前を変える（画面）', T_CHANGE, appArea, 12],
      ['一人前（画面）', T_ICHI, appArea, 12],
      ['1字目（盤）', T_FILLS[0], log.probes.ichi?.board, 3],
    ].filter(([, , region]) => region).map(([name, planned, region, threshold]) => ({ name, planned, got: visualOnset(options.out, region, planned - .3, threshold) }));
    console.log(`押した瞬間の見た目（音は予定の秒ちょうど）: ${onsets.map(({ name, planned, got }) => `${name} ${planned.toFixed(2)}→${got?.toFixed(2) ?? 'なし'}`).join(' / ')}`);
    console.log(`字幕の入れ替わり（予定→実測、括弧は隣のコマとの差・窓の頭からの差の最大）: ${measured.map(({ want, got, peak, drift }) => `${want.toFixed(2)}→${got?.toFixed(2) ?? 'なし'}(${peak.toFixed(0)}・${drift.toFixed(0)})`).join(' / ')}`);
    console.log(`押した時刻（動画の秒）: ${report.taps.map((tap) => `${tap.name} ${tap.planned.toFixed(2)}→${tap.actual.toFixed(2)}`).join(' / ')}`);
    console.log(`幕の間の組み替え: ${report.cuts.map((cut) => `${cut.name} ${cut.ms}ms`).join('・')} / 一人前で書いた字 ${report.fills.join('')}`);
    console.log(`字幕の置き場所（540×960 の縦位置）: ${log.captions.filter((item) => item.rect).map((item) => `${item.index}: ${Math.round(item.rect.top)}〜${Math.round(item.rect.bottom)}`).join(' / ')}`);
    console.log(`1コマ目: 画面 ${log.first?.screen} / 空き辻の光のまわりの差（0→0.1秒）${motion.toFixed(2)} / 受けて立つ ${log.accept?.t?.toFixed(2)}秒`);
    console.log(`動画: ${video?.width}×${video?.height}・${video?.r_frame_rate}・${videoSeconds.toFixed(3)}秒・${video?.codec_name}/${audio?.codec_name} / 音（${options.audio.toUpperCase()}案）${loud.lufs} LUFS・真のピーク ${loud.truePeak} dBTP・冒頭0.3秒 ${loud.headRms} dBFS`);
    for (const warning of [...new Set(report.warnings)]) console.log(`  注意: ${warning}`);
    console.log(`1コマ目は ${firstFrame}、2秒おきの一覧は ${options.sheet}。必ず目視すること。`);
    if (failures.length) throw new Error(`検査に落ちました（${options.out} は残してあります）:\n- ${failures.join('\n- ')}`);
    console.log(`検査: すべて通過（全体 ${lap()}）`);
  } finally {
    await browser.close().catch(() => {});
    server.stop();
    if (!options.keep) rmSync(work, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
