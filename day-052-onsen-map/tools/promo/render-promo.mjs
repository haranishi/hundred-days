/* プロモ動画（縦型1080×1920・35秒・BGM付き）を作る。
   絵コンテは timeline.mjs、音は promo-audio.mjs。この3つで完結する。

   実行（リポジトリ直下から）:
     PLAYWRIGHT=/path/to/playwright/index.js node day-052-onsen-map/tools/promo/render-promo.mjs
       --audio a|b      重ねる BGM（既定 a）。両案の WAV は毎回作り直す
       --out <mp4>      出力先（既定 このフォルダの promo.mp4）。1コマ目は <名前>-first-frame.png
       --sheet <jpg>    2秒おきのコンタクトシート（既定 このフォルダの preview-contact.jpg）
       --swiftshader    GPU を使わずソフトウェアで描く（GPU の無い機械用。動きのコマ落ちが増える）
       --keep           録画の元（webm）を残して場所を出す

   Day 040 と同じく、アプリを実際に操作して録画し、字幕とエンド画面を重ねて、合成 BGM と ffmpeg で書き出す。
   Day 040 から変えたところ:
   - 地図タイルは本物の OpenFreeMap を読む。撮影の前に同じ操作を一度通して（下見）届いたタイルを手元に取っておき、
     本番はそこから返す。寄った先の地図が描き終わらないまま映らないようにするため。ほかの宛先へは出さない
   - 字幕・注目の枠・エンド画面・柱を伸ばし直すきっかけは、ページの中の時計（requestAnimationFrame）で出す。
     Node 側の操作が遅れても字幕はずれない（Day 042 で、終わりの返事を待って字幕が3秒遅れた反省）
   - 頭の切り落としは、撮影の外で1回だけ画面を赤紫に光らせ、録画の中でその光を探して決める（カチンコ）。
     Day 042 までの「録画開始からの実測」は、録画の始まりが遅れるぶん画が0.2秒ほど早くなっていた
   - GPU（Metal）で描く。SwiftShader より柱の伸びや地図の移動のコマ落ちが少ない */

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  ANSWER_START, BATH_ID, BATH_NAME, CAPTIONS, DEFAULT_FPS, DURATION_SECONDS, END_START, FOCUS, GROW_LEAD,
  T_BATH, T_CHIP, T_MORE, T_OITA, T_SENTO, T_SOURCES, T_TOP3, T_VISIT, TREND_START,
} from './timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = dirname(dirname(here));
const VIEW = { width: 540, height: 960 };
const OUT = { width: 1080, height: 1920 };
const SCALE = OUT.width / VIEW.width;
const LEAD_IN = 2;               // 予定表を動かし始めてから t0（動画の0秒）まで
const FLASH = [-1.6, -1.36];     // カチンコの光（t0 からの秒）。頭の切り落としの中に入る
const RIPPLE_LEAD = .07;         // 指の輪を出してから押すまで
const CAPTION_GAP = 14;          // 地図の上端から字幕の上端まで（px）
const REHEARSAL_STEP_MS = 120;   // 下見では待たずに次の操作へ進む
const OPENFREEMAP = /(^|\.)openfreemap\.org$/;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
};

/* 字幕の数字と、画面のどこと突き合わせるか（README の表と同じ）。
   caption は字幕側（timeline.mjs）に入っているべき語、has は画面に入っているべき語。
   食い違ったら字幕を画面に合わせる。逆はしない */
const SCREEN = {
  S1: [{ caption: ['源泉の数、1位は大分県', '5,094か所'], selector: '#headline', has: '源泉の数、1位は大分県。5,094か所' }],
  S2: [
    { selector: '#headline', has: '銭湯の数、1位は東京都' },
    { caption: ['東京・大阪・青森'], top3: ['東京都', '大阪府', '青森県'] },
  ],
  S3: [{ caption: ['銭湯は4年で', '501軒減った'], selector: '#trend', has: '4年で3,231軒→2,730軒（501軒減）' }],
  S4back: [{ selector: '#headline', has: '源泉の数、1位は大分県' }],
  S4: [{ visible: '#pref-card' }, { selector: '#headline', has: '大分県' }, { selector: '#pref-card', has: '地図に載っているお風呂' }],
  S5chip: [{ pressed: 'button.type-chip[data-type="onsen"]' }],
  S5: [{ visible: '#bath-card' }, { selector: '#bath-card', has: BATH_NAME }, { maps: true }],
  S6: [{ pressed: '#bath-visit' }],
};

// ---------------------------------------------------------------- 引数と下ごしらえ

function parseArgs(args) {
  const options = { audio: 'a', out: join(here, 'promo.mp4'), sheet: join(here, 'preview-contact.jpg'), gpu: true, keep: false };
  for (let i = 0; i < args.length; i += 1) {
    const next = () => { const value = args[i + 1]; if (!value || value.startsWith('--')) throw new Error(`${args[i]} の値がありません`); i += 1; return value; };
    if (args[i] === '--audio') options.audio = next().toLowerCase();
    else if (args[i] === '--out') options.out = resolve(next());
    else if (args[i] === '--sheet') options.sheet = resolve(next());
    else if (args[i] === '--swiftshader') options.gpu = false;
    else if (args[i] === '--keep') options.keep = true;
    else throw new Error(`知らない引数です: ${args[i]}（--audio a|b / --out / --sheet / --swiftshader / --keep）`);
  }
  if (!['a', 'b'].includes(options.audio)) throw new Error('--audio は a か b です');
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
        if (!CAPTIONS.some((caption) => caption.lines.includes(word))) problems.push(`${scene}: 字幕に「${word}」が無い（SCREEN の表と timeline.mjs を合わせる）`);
      }
    }
  }
  if (problems.length) throw new Error(`timeline.mjs を確かめてください: ${problems.join(' / ')}`);
}

function readBath() {
  const data = JSON.parse(readFileSync(join(appDir, 'data', 'baths.json'), 'utf8'));
  const bath = data.baths.find((one) => one.id === BATH_ID);
  if (!bath || bath.name !== BATH_NAME) throw new Error(`data/baths.json に ${BATH_ID}（${BATH_NAME}）がありません`);
  return { ...bath, query: `${bath.lat.toFixed(5)},${bath.lng.toFixed(5)}` };
}

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://local').pathname);
      if (path.endsWith('/')) path += 'index.html';
      const file = resolve(appDir, `.${path}`);
      if (!file.startsWith(appDir + sep)) { res.writeHead(403).end(); return; }
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' }).end(body);
    } catch {
      if (!res.headersSent) res.writeHead(404);
      res.end('not found');
    }
  });
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok); });
  return { server, base: `http://127.0.0.1:${server.address().port}/` };
}

function runNode(args) {
  return new Promise((ok, fail) => {
    const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { out += chunk; });
    child.on('error', fail);
    child.on('close', (code) => (code === 0 ? ok(out) : fail(new Error(`BGM を作れませんでした:\n${out}`))));
  });
}

// ---------------------------------------------------------------- 地図タイル（下見で取っておき、本番はそこから返す）

const net = { cache: new Map(), fetched: 0, cached: 0, blocked: new Set(), inflight: 0, lastChange: Date.now() };
const DROP_HEADERS = new Set(['content-encoding', 'content-length', 'transfer-encoding']);

async function route(route) {
  const url = new URL(route.request().url());
  if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
  if (!OPENFREEMAP.test(url.hostname)) { net.blocked.add(url.host); return route.abort(); }
  const hit = net.cache.get(url.href);
  if (hit) { net.cached += 1; return route.fulfill(hit); }
  net.inflight += 1; net.lastChange = Date.now();
  try {
    const response = await route.fetch();
    const headers = Object.fromEntries(Object.entries(response.headers()).filter(([name]) => !DROP_HEADERS.has(name.toLowerCase())));
    const entry = { status: response.status(), headers, body: await response.body() };
    if (entry.status === 200) net.cache.set(url.href, entry);
    net.fetched += 1;
    return route.fulfill(entry);
  } catch {
    return route.abort();
  } finally {
    net.inflight -= 1; net.lastChange = Date.now();
  }
}

/* 地図が描き終わるまで待つ。E2E 用の窓（__day052）があれば MapLibre に聞き、無ければ通信が静まるのを待つ */
async function mapIdle(page, { timeout = 15_000 } = {}) {
  const started = Date.now();
  const hook = await page.evaluate(() => Boolean(globalThis.__day052?.map)).catch(() => false);
  if (hook) {
    await page.waitForFunction(() => {
      const map = globalThis.__day052.map;
      return map.loaded() && map.areTilesLoaded() && !map.isMoving();
    }, null, { timeout, polling: 100 });
  } else {
    while (Date.now() - started < timeout && (net.inflight > 0 || Date.now() - net.lastChange < 800)) await page.waitForTimeout(100);
  }
  await page.waitForTimeout(300);
  return Date.now() - started;
}

// ---------------------------------------------------------------- 重ねる絵（字幕・枠・指の輪・エンド・カチンコ）

/* 差し込む要素には pointer-events: none が要る。画面いっぱいのエンド画面が透明でもクリックを奪い、
   地図や一覧が押せなくなる（Day 035 で踏んだ）。色はアプリの app.css（地の #0f1218・温泉の橙・銭湯の水色）に合わせる */
const OVERLAY_CSS = `
  .promo-caption {
    position: fixed; left: 50%; top: 20%; transform: translateX(-50%); max-width: 80%;
    padding: 11px 22px 12px; border-radius: 16px; background: rgba(9, 12, 18, .93);
    box-shadow: 0 0 0 1.5px rgba(255, 217, 138, .45), 0 12px 30px rgba(0, 0, 0, .45);
    color: #fffaf0; font-family: "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", system-ui, sans-serif;
    font-size: 28px; font-weight: 800; line-height: 1.42; letter-spacing: .02em; text-align: center; white-space: nowrap;
    opacity: 0; transition: opacity 220ms ease, top 320ms ease; z-index: 9999; pointer-events: none;
  }
  .promo-caption[data-on="1"] { opacity: 1; }
  .promo-caption span { display: block; }
  .promo-caption .tone-onsen { color: #ffc25e; }
  .promo-caption .tone-sento { color: #9fe6ff; }
  .promo-ring {
    position: fixed; left: 0; top: 0; width: 0; height: 0; border-radius: 12px; border: 3px solid #ffd98a;
    box-shadow: 0 0 0 3px rgba(255, 217, 138, .22), 0 0 26px rgba(255, 196, 94, .42);
    opacity: 0; transition: opacity 240ms ease; z-index: 9997; pointer-events: none;
  }
  .promo-ring[data-on="1"] { opacity: 1; animation: promo-breathe 1.6s ease-in-out infinite; }
  @keyframes promo-breathe { 50% { box-shadow: 0 0 0 6px rgba(255, 217, 138, .16), 0 0 34px rgba(255, 196, 94, .55); } }
  .promo-tap {
    position: fixed; width: 58px; height: 58px; margin: -29px 0 0 -29px; border-radius: 50%;
    background: rgba(255, 255, 255, .26); box-shadow: 0 0 0 2.5px rgba(255, 255, 255, .92), 0 0 0 6px rgba(0, 0, 0, .18);
    z-index: 9998; pointer-events: none; animation: promo-tap 560ms cubic-bezier(.2, .7, .3, 1) forwards;
  }
  @keyframes promo-tap {
    0% { transform: scale(.4); opacity: 0; } 20% { transform: scale(.78); opacity: 1; } 100% { transform: scale(1.35); opacity: 0; }
  }
  .promo-end {
    position: fixed; inset: 0; display: grid; place-content: center; justify-items: center; gap: 14px; padding: 0 12%;
    background: radial-gradient(120% 70% at 50% 36%, #2b2118 0%, #151a23 50%, #0f1218 100%);
    color: #fff4e2; text-align: center; z-index: 10000; opacity: 0; transition: opacity 420ms ease; pointer-events: none;
    font-family: "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif;
  }
  .promo-end[data-on="1"] { opacity: 1; }
  .promo-end svg { width: 128px; height: 116px; margin-bottom: 6px; overflow: visible; }
  .promo-end .steam { animation: promo-steam 2.4s ease-in-out infinite; }
  .promo-end .steam-2 { animation-delay: .4s; }
  .promo-end .steam-3 { animation-delay: .8s; }
  @keyframes promo-steam { 0%, 100% { transform: translateY(5px); opacity: .45; } 50% { transform: translateY(-5px); opacity: 1; } }
  .promo-end strong {
    font-family: "Hiragino Mincho ProN", "Yu Mincho", serif; font-size: 46px; font-weight: 700; letter-spacing: .08em; line-height: 1.3;
  }
  .promo-end em { font-style: normal; font-size: 26px; font-weight: 700; color: #ffc25e; letter-spacing: .06em; }
  .promo-end span { margin-top: 6px; font-size: 22px; color: #aab3c1; letter-spacing: .08em; }
  .promo-flash { position: fixed; inset: 0; background: #ff00ff; z-index: 2147483647; display: none; pointer-events: none; }
  .promo-flash[data-on="1"] { display: block; }
`;

// 温泉の記号（湯けむり3本と湯船）。湯けむりはゆっくり上下させる
const END_HTML = `
  <svg viewBox="0 0 128 116" aria-hidden="true">
    <g fill="none" stroke="#ffc25e" stroke-width="7" stroke-linecap="round">
      <path class="steam steam-1" d="M40 72 C 28 58, 52 48, 40 32 S 44 10, 40 6"/>
      <path class="steam steam-2" d="M64 68 C 52 54, 76 44, 64 28 S 68 6, 64 2"/>
      <path class="steam steam-3" d="M88 72 C 76 58, 100 48, 88 32 S 92 10, 88 6"/>
      <path d="M14 86 C 22 110, 106 110, 114 86" stroke-width="8"/>
    </g>
  </svg>
  <strong>湯けむり日本地図</strong>
  <em>無料・登録不要</em>
  <span>Day 52 / 100</span>`;

function installOverlay(endHtml) {
  const make = (className) => { const node = document.createElement('div'); node.className = className; return node; };
  const caption = make('promo-caption');
  const ring = make('promo-ring');
  const end = make('promo-end');
  const flash = make('promo-flash');
  end.innerHTML = endHtml;
  document.body.append(ring, caption, end, flash);
  window.__promo = { caption, ring, end, flash };
  window.promoTap = (x, y) => {
    const dot = make('promo-tap');
    dot.style.left = `${x}px`;
    dot.style.top = `${y}px`;
    document.body.append(dot);
    setTimeout(() => dot.remove(), 900);
  };
}

/* ページの中の予定表。t0 から見た秒で、字幕・枠・エンド・カチンコ・柱の伸び直しを出す。
   字幕は地図の上端のすぐ下に置き（帯の高さが場面で変わるので毎コマ測る）、安全域と帯の文字に掛からないかを記録する */
function runSchedule(plan) {
  const { caption, ring, end, flash } = window.__promo;
  const t0 = performance.now() + plan.leadIn * 1000;
  const H = innerHeight;
  const W = innerWidth;
  const safe = { left: W * .1, right: W * .9, top: H * .1, bottom: H * .9 };
  const log = { captions: [], violations: [], grow: null, first: null, focusMissing: [], done: false };
  window.promoLog = log;
  const box = (node) => { const r = node.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
  const shown = (node) => Boolean(node) && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden';
  const hits = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const mapTop = () => {
    const map = document.querySelector('#map') ?? document.querySelector('.maplibregl-canvas');
    return map ? map.getBoundingClientRect().top : H * .2;
  };
  const targets = (name) => {
    if (name === 'headline') return [document.querySelector('#headline')];
    if (name === 'trend') return [document.querySelector('#trend')];
    if (name === 'top3') return [...document.querySelectorAll('button.rank-row')].slice(0, 3);
    if (name === 'maps') return [document.querySelector('#bath-card a[href*="google.com/maps"]') ?? document.querySelector('#bath-maps')];
    if (name === 'visit') return [document.querySelector('#bath-visit')];
    return [];
  };
  let captionIndex = -2;
  let lastTop = -1;
  let frames = 0;
  const frame = (now) => {
    const t = (now - t0) / 1000;
    frames += 1;
    flash.dataset.on = t >= plan.flash[0] && t < plan.flash[1] ? '1' : '0';
    // 1コマ目の少し前に、撮影の外で選んでおいた「温泉地の数」から「源泉の数」へ戻す（柱が地面から伸び直す）
    if (!log.grow && t >= -plan.growLead) {
      document.querySelector(plan.growSelector)?.click();
      log.grow = { t };
    }
    const index = plan.captions.findIndex((item) => t >= item.start && t < item.end);
    if (index !== captionIndex) {
      captionIndex = index;
      caption.replaceChildren();
      if (index >= 0) {
        const item = plan.captions[index];
        item.lines.forEach((line, k) => {
          const span = document.createElement('span');
          span.textContent = line;
          if (k === 1 && item.tone) span.className = `tone-${item.tone}`;
          caption.append(span);
        });
      }
      caption.dataset.on = index >= 0 ? '1' : '0';
    }
    if (index >= 0) {
      const top = Math.max(mapTop() + plan.gap, safe.top);
      if (Math.abs(top - lastTop) > .5) { caption.style.top = `${top}px`; lastTop = top; }
    }
    // 字幕が切り替わった瞬間の置き場所（書き出した動画で切り替わりを測るとき、ここを切り出す）
    const last = log.captions.at(-1);
    if (!last || last.index !== captionIndex) log.captions.push({ index: captionIndex, t, rect: index >= 0 ? box(caption) : null });
    if (t >= 0 && !log.first) {
      const map = document.querySelector('#map') ?? document.querySelector('.maplibregl-canvas');
      log.first = { t, map: map ? box(map) : null, caption: box(caption), grow: globalThis.__day052?.grow?.() ?? null };
    }
    // 注目の枠：字幕が指しているものを囲む。相手が見えなければ出さずに記録する
    const focus = plan.focus.find((item) => t >= item.start && t < item.end);
    const nodes = focus ? targets(focus.target).filter(shown) : [];
    if (focus && !nodes.length && !log.focusMissing.includes(focus.target)) log.focusMissing.push(focus.target);
    if (nodes.length) {
      const rects = nodes.map(box);
      const pad = 6;
      const left = Math.min(...rects.map((r) => r.left)) - pad;
      const top = Math.min(...rects.map((r) => r.top)) - pad;
      Object.assign(ring.style, {
        left: `${left}px`, top: `${top}px`,
        width: `${Math.max(...rects.map((r) => r.right)) + pad - left}px`, height: `${Math.max(...rects.map((r) => r.bottom)) + pad - top}px`,
      });
    }
    ring.dataset.on = nodes.length ? '1' : '0';
    end.dataset.on = t >= plan.endStart ? '1' : '0';
    // 字幕が安全域の外に出ていないか、帯の文字や枠の相手に掛かっていないか（6コマに1回、移動の途中は見ない）
    if (index >= 0 && t >= 0 && frames % 6 === 0 && caption.getAnimations().every((a) => a.playState !== 'running')) {
      const at = box(caption);
      const problems = [];
      if (at.left < safe.left - .5 || at.right > safe.right + .5 || at.top < safe.top - .5 || at.bottom > safe.bottom + .5) problems.push('安全域の外');
      const keep = [...document.querySelectorAll('#headline, #trend, .metric'), ...nodes].filter(shown);
      for (const node of keep) if (hits(at, box(node))) problems.push(`${node.id ? `#${node.id}` : node.className}に重なる`);
      if (problems.length && log.violations.length < 20) log.violations.push({ t: Number(t.toFixed(2)), caption: index, problems: [...new Set(problems)] });
    }
    if (t < plan.duration + .3) requestAnimationFrame(frame);
    else log.done = true;
  };
  requestAnimationFrame(frame);
  return t0;
}

/* 一覧（シートの中）を、狙った行が箱の上から align の位置に来るまで ms かけて送る。
   Playwright の click はその場で飛ぶので、見せたい送りはこちらで動かす */
function scrollListTo({ target, align, ms }) {
  const shown = (node) => Boolean(node) && node.getClientRects().length > 0;
  let node = null;
  if (target.kind === 'rank') node = document.querySelectorAll('button.rank-row')[target.index];
  if (target.kind === 'more') node = [...document.querySelectorAll('#pref-card button')].find((one) => shown(one) && one.textContent.includes('もっと見る'));
  if (target.kind === 'bath') {
    node = document.querySelector(`#bath-list button.bath-row[data-id="${target.id}"]`)
      ?? [...document.querySelectorAll('#bath-list button.bath-row')].find((one) => one.textContent.includes(target.name));
  }
  if (!shown(node)) return Promise.resolve(`${target.kind} が画面に無い`);
  let scroller = node.parentElement;
  while (scroller && !(/(auto|scroll)/.test(getComputedStyle(scroller).overflowY) && scroller.scrollHeight > scroller.clientHeight + 1)) scroller = scroller.parentElement;
  if (!scroller) return Promise.resolve('送れる箱が無い');
  const offset = scroller.scrollTop + node.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  const to = Math.max(0, Math.min(scroller.scrollHeight - scroller.clientHeight, offset - scroller.clientHeight * align));
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

// ---------------------------------------------------------------- 操作（下見と本番で同じ台本を使う）

async function check(page, scene, bath) {
  for (const item of SCREEN[scene]) {
    if (item.visible) {
      if (!(await page.locator(item.visible).isVisible())) throw new Error(`${scene}: ${item.visible} が出ていません`);
    }
    if (item.selector) {
      const text = (await page.locator(item.selector).first().textContent({ timeout: 5000 })) ?? '';
      if (!text.includes(item.has)) throw new Error(`画面と字幕が食い違っています（${scene}）: 「${item.has}」が ${item.selector} に無い（実際は「${text.trim().slice(0, 80)}」）`);
    }
    if (item.top3) {
      const rows = await page.locator('button.rank-row').evaluateAll((nodes) => nodes.slice(0, 3).map((node) => node.textContent));
      item.top3.forEach((name, i) => {
        if (!rows[i]?.includes(name)) throw new Error(`画面と字幕が食い違っています（${scene}）: 順位の${i + 1}行目は「${name}」のはず（実際は「${rows[i]?.trim()}」）`);
      });
    }
    if (item.pressed) {
      const pressed = await page.locator(item.pressed).getAttribute('aria-pressed');
      if (pressed !== 'true') throw new Error(`${scene}: ${item.pressed} が押された状態になっていません（aria-pressed=${pressed}）`);
    }
    if (item.maps) {
      const link = page.locator('#bath-card a[href*="google.com/maps"]').first();
      const href = (await link.getAttribute('href')) ?? '';
      const label = (await link.textContent()) ?? '';
      if (!href.includes(bath.query) || !label.includes('Googleマップ')) throw new Error(`${scene}: Googleマップのボタンが ${BATH_NAME}（${bath.query}）を指していません（${label} ${href}）`);
    }
  }
}

async function perform(page, { take, t0, report, bath }) {
  const at = async (seconds) => {
    if (!take) { await page.waitForTimeout(REHEARSAL_STEP_MS); return; }
    const wait = t0 + seconds * 1000 - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
  };
  // 下見では、地図が動いたら描き終わるまで待つ（その間に届いたタイルを本番で使う）
  const settle = async (label) => { if (!take) report.idle.push(`${label} ${await mapIdle(page)}ms`); };
  // 本番の送りは待たない（絵は rAF が実時間で動かす。時刻は at() の絶対時間だけで決める）
  const scroll = (target, align, ms) => {
    const job = page.evaluate(scrollListTo, { target, align, ms: take ? ms : 0 });
    if (take) { job.then((result) => { if (result !== 'ok') report.warnings.push(`一覧の送り: ${result}`); }).catch(() => {}); return null; }
    return job.then((result) => { if (result !== 'ok') throw new Error(`一覧を送れません: ${result}`); });
  };
  const tap = async (locator, name, planned) => {
    await at(planned - RIPPLE_LEAD);
    const box = await locator.boundingBox({ timeout: 5000 });
    if (!box) throw new Error(`押すものが画面にありません: ${name}`);
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    // 画面の外の座標を押すと何も起きず、次の待ちで分かりにくいタイムアウトになる。先に止める
    if (x < 0 || y < 0 || x > VIEW.width || y > VIEW.height) {
      throw new Error(`押すものが画面にありません（${Math.round(x)}, ${Math.round(y)} は540×960の外）: ${name}`);
    }
    if (take) await page.evaluate(([px, py]) => window.promoTap(px, py), [x, y]);
    await at(planned);
    await page.mouse.click(x, y);
    if (take) report.taps.push({ name, planned, actual: (Date.now() - t0) / 1000 });
  };
  const bathRow = page.locator(`#bath-list button.bath-row[data-id="${BATH_ID}"]`);

  if (!take) await page.locator('.metric[data-metric="sources"]').click();   // 本番はページの予定表が t0 の直前に押す

  /* S1 見出し：源泉の数、1位は大分県。5,094か所 */
  await at(ANSWER_START);
  await check(page, 'S1');

  /* S2 銭湯の数に切り替える。柱が藍〜水色で伸び直し、順位の上から3県を見せる */
  await tap(page.locator('.metric[data-metric="sento"]'), '銭湯の数', T_SENTO);
  await check(page, 'S2');
  await at(T_TOP3);
  await scroll({ kind: 'rank', index: 0 }, .03, 650);

  /* S3 推移の1行：4年で3,231軒→2,730軒（501軒減） */
  await at(TREND_START);
  await check(page, 'S3');

  /* S4 源泉の数に戻して、順位の「大分県」を押す。大分県へ寄って点が出る */
  await tap(page.locator('.metric[data-metric="sources"]'), '源泉の数', T_SOURCES);
  await check(page, 'S4back');
  await tap(page.locator('button.rank-row[data-pref="44"]'), '大分県', T_OITA);
  await page.waitForSelector('#pref-card:not([hidden])', { timeout: 5000 });
  await check(page, 'S4');
  await settle('大分県');

  /* S5 温泉に絞り、竹瓦温泉（温泉93件の58番目）のカードを開く。最初の50件に無ければ「もっと見る」 */
  await tap(page.locator('button.type-chip[data-type="onsen"]'), '温泉のチップ', T_CHIP);
  await check(page, 'S5chip');
  if (!(await bathRow.count())) {
    await at(T_CHIP + .3);
    await scroll({ kind: 'more' }, .5, 460);
    await tap(page.locator('#pref-card button', { hasText: 'もっと見る' }).first(), 'もっと見る', T_MORE);
    await page.waitForFunction((id) => Boolean(document.querySelector(`#bath-list button.bath-row[data-id="${id}"]`)), BATH_ID, { timeout: 5000 });
    report.more = true;
  }
  await at(T_MORE + .12);
  await scroll({ kind: 'bath', id: BATH_ID, name: BATH_NAME }, .36, 420);
  await tap(bathRow, BATH_NAME, T_BATH);
  await page.waitForSelector('#bath-card:not([hidden])', { timeout: 5000 });
  await check(page, 'S5', bath);
  await settle(BATH_NAME);

  /* S6 「行った」を押す */
  await tap(page.locator('#bath-visit'), '行った', T_VISIT);
  await check(page, 'S6');
}

async function prepare(page, base) {
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForSelector('#app[data-state="ready"]', { timeout: 25_000 });
  await page.waitForSelector('.maplibregl-canvas', { timeout: 25_000 });
  await mapIdle(page);
  // 1コマ目で柱を伸ばし直すため、撮影の外で「温泉地の数」にしておく（t0 の直前に予定表が源泉の数へ戻す）
  await page.locator('.metric[data-metric="areas"]').click();
  await page.waitForTimeout(1500);
  await mapIdle(page);
  if ((await page.locator('.metric[data-metric="areas"]').getAttribute('aria-pressed')) !== 'true') throw new Error('「温泉地の数」を選べませんでした');
}

// ---------------------------------------------------------------- 書き出した動画の検査

const ffmpegRaw = (args) => execFileSync('ffmpeg', ['-v', 'error', ...args, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 });

/* カチンコの光を録画の中で探す（赤紫が画面の大半を占める最初のコマ）。録画は 25fps の固定 */
function findFlash(webm) {
  const w = 8; const h = 14;
  const raw = ffmpegRaw(['-i', webm, '-vf', `scale=${w}:${h},format=rgb24`]);
  const size = w * h * 3;
  const fps = 25;
  for (let i = 0; i < Math.floor(raw.length / size); i += 1) {
    let magenta = 0;
    for (let p = 0; p < w * h; p += 1) {
      const [r, g, b] = [raw[i * size + p * 3], raw[i * size + p * 3 + 1], raw[i * size + p * 3 + 2]];
      if (r > 200 && g < 70 && b > 200) magenta += 1;
    }
    if (magenta > w * h * .8) return i / fps;
  }
  return null;
}

/* 字幕が予定の秒に入れ替わったか。字幕の箱の内側だけを切り出し、予定の前後1秒で最初に大きく変わったコマを拾う。
   字幕の文字は一瞬で差し替わるので、隣のコマとの差（step）で拾える。エンド画面は0.42秒かけて溶け込むので
   隣どうしの差が毎コマ小さく、窓の最初のコマからの差（total）で拾う（step だけだとしきい値の境目で落ちた）。
   箱は不透明（93%）なので、裏で地図が動いても差はほとんど出ない。元の30fpsのまま測る
   （Day 048：20fpsに間引くと、変換のせいで全部が一律0.1秒遅れて測れた） */
function captionSwitches(file, expected) {
  const W = 96; const H = 24; const STEP = 7; const TOTAL = 12;
  return expected.map(({ want, rect }) => {
    const from = Math.max(0, want - 1);
    const x = Math.round((rect.left + 10) * SCALE); const y = Math.round((rect.top + 8) * SCALE);
    const w = Math.round((rect.right - rect.left - 20) * SCALE); const h = Math.round((rect.bottom - rect.top - 16) * SCALE);
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

/* 1コマ目が「柱が伸びている途中」か。地図の中の橙（柱の色）の画素を数え、伸び切った後と比べる */
function pillarPixels(file, seconds, region) {
  const x = Math.round(region.left * SCALE); const y = Math.round(region.top * SCALE);
  const w = Math.round((region.right - region.left) * SCALE); const h = Math.round((region.bottom - region.top) * SCALE);
  const raw = ffmpegRaw(['-ss', seconds.toFixed(3), '-i', file, '-frames:v', '1', '-vf', `crop=${w}:${h}:${x}:${y},scale=${Math.round(w / 2)}:${Math.round(h / 2)},format=rgb24`]);
  let count = 0;
  for (let i = 0; i + 2 < raw.length; i += 3) {
    const r = raw[i] / 255; const g = raw[i + 1] / 255; const b = raw[i + 2] / 255;
    const max = Math.max(r, g, b); const min = Math.min(r, g, b);
    if (max < .3 || max - min < .5 * max || max !== r) continue;
    const hue = 60 * ((g - b) / (max - min));
    if (hue >= 0 && hue <= 50) count += 1;
  }
  return count;
}

function probe(file) {
  const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }));
  const video = info.streams.find((s) => s.codec_type === 'video');
  const audio = info.streams.find((s) => s.codec_type === 'audio');
  return { video, audio, duration: Number(info.format.duration) };
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
  const frames = Math.floor(DURATION_SECONDS / 2) + 1;   // 0,2,…,34秒の18コマ
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', file, '-vf',
    `select='not(mod(n\\,${DEFAULT_FPS * 2}))',scale=270:480:flags=lanczos${label},tile=6x${Math.ceil(frames / 6)}:padding=8:margin=8:color=0x111111`,
    '-frames:v', '1', '-q:v', '3', sheet]);
}

// ---------------------------------------------------------------- 本体

async function main() {
  const options = parseArgs(process.argv.slice(2));
  checkTimeline();
  const bath = readBath();
  const spec = process.env.PLAYWRIGHT || 'playwright';
  const mod = await import(spec.startsWith('/') ? pathToFileURL(spec).href : spec);
  const chromium = mod.chromium ?? mod.default?.chromium;
  if (!chromium) throw new Error('Playwright を読み込めませんでした（PLAYWRIGHT=<playwright の index.js> を付けて実行）');
  for (const cmd of ['ffmpeg', 'ffprobe']) execFileSync('which', [cmd], { stdio: 'ignore' });
  const clock = Date.now();
  const lap = () => `${((Date.now() - clock) / 1000).toFixed(0)}秒`;

  // BGM は別のプロセスで両案を作り直す（下見と並べて走らせ、本番の前に待つ。
  // 合成は約16秒 CPU を占有するので、同じプロセスで作るとその間 Playwright の処理が止まる）
  const music = runNode([join(here, 'promo-audio.mjs'), '--variant', 'all']);
  music.catch(() => {});

  const { base, server } = await serve();
  const work = mkdtempSync(join(tmpdir(), 'day052-promo-'));
  const browser = await chromium.launch({ args: options.gpu ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : [] });
  const report = { taps: [], warnings: [], idle: [], errors: [], more: false };
  try {
    const contextOptions = { viewport: VIEW, locale: 'ja-JP', reducedMotion: 'no-preference' };
    const watch = (page) => {
      page.on('pageerror', (error) => report.errors.push(`pageerror: ${error.message}`));
      page.on('console', (message) => { if (message.type() === 'error') report.warnings.push(`console: ${message.text().slice(0, 160)}`); });
    };

    /* 下見：同じ台本を待たずに通す。画面と字幕の突き合わせもここで一度済ませ、食い違えば録画の前に止まる */
    const rehearsal = await browser.newContext(contextOptions);
    await rehearsal.addInitScript(() => { globalThis.__E2E__ = true; });
    await rehearsal.route('**/*', route);
    const draft = await rehearsal.newPage();
    watch(draft);
    const renderer = await draft.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      const info = gl?.getExtension('WEBGL_debug_renderer_info');
      return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'WebGL なし';
    });
    await prepare(draft, base);
    await perform(draft, { take: false, t0: 0, report, bath });
    await rehearsal.close();
    console.log(`下見: 済み（${lap()}）/ 描画 ${renderer} / タイル ${net.cache.size}枚 / 地図を待った時間 ${report.idle.join('・')}`);
    const musicLog = await music;
    console.log(musicLog.split('\n').filter((line) => line.includes('LUFS')).map((line) => `BGM ${line.trim()}`).join('\n'));
    const wav = join(here, `promo-audio-${options.audio}.wav`);
    if (!existsSync(wav)) throw new Error(`${wav} がありません`);

    /* 本番 */
    net.fetched = 0; net.cached = 0;
    const context = await browser.newContext({ ...contextOptions, recordVideo: { dir: work, size: VIEW } });
    const recordStart = Date.now();
    await context.addInitScript(() => { globalThis.__E2E__ = true; });
    await context.route('**/*', route);
    const page = await context.newPage();
    watch(page);
    await prepare(page, base);
    await page.addStyleTag({ content: OVERLAY_CSS });
    await page.evaluate(installOverlay, END_HTML);
    const plan = {
      leadIn: LEAD_IN, flash: FLASH, growLead: GROW_LEAD, growSelector: '.metric[data-metric="sources"]', gap: CAPTION_GAP,
      captions: CAPTIONS.map((caption, index) => ({ ...caption, start: index === 0 ? -.6 : caption.start })),
      focus: FOCUS, endStart: END_START, duration: DURATION_SECONDS,
    };
    const before = Date.now();
    await page.evaluate(runSchedule, plan);
    const t0 = (before + Date.now()) / 2 + LEAD_IN * 1000;
    await perform(page, { take: true, t0, report, bath });
    await page.waitForFunction(() => window.promoLog?.done, null, { timeout: (DURATION_SECONDS + 10) * 1000 });
    const log = await page.evaluate(() => window.promoLog);
    await context.close();
    console.log(`本番: 済み（${lap()}）/ タイルは手元から ${net.cached}件・取りに行った ${net.fetched}件 / 断った宛先: ${[...net.blocked].join(', ') || 'なし'}`);

    /* 頭の切り落とし：録画の中のカチンコの光から決める */
    const webm = readdirSync(work).map((name) => join(work, name)).find((path) => path.endsWith('.webm'));
    if (!webm) throw new Error('録画ファイルが作られませんでした');
    const flashAt = findFlash(webm);
    const estimate = (t0 - recordStart) / 1000;
    if (flashAt === null) throw new Error(`録画の中にカチンコの光が見つかりません（${webm}）`);
    const head = flashAt - FLASH[0];
    console.log(`頭の切り落とし ${head.toFixed(3)}秒（カチンコ ${flashAt.toFixed(2)}秒。録画開始からの実測なら ${estimate.toFixed(3)}秒＝${(estimate - head).toFixed(2)}秒の差）`);

    execFileSync('ffmpeg', [
      '-y', '-v', 'error', '-ss', head.toFixed(3), '-t', String(DURATION_SECONDS), '-i', webm, '-i', wav,
      '-filter_complex', `[0:v]scale=${OUT.width}:${OUT.height}:flags=lanczos,fps=${DEFAULT_FPS},format=yuv420p[v]`,
      '-map', '[v]', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-profile:v', 'high',
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
    if (!(loud.truePeak <= -1)) failures.push(`真のピーク ${loud.truePeak} dBTP（-1 以下）`);
    if (!(loud.headRms > -40)) failures.push(`冒頭0.3秒が静かすぎる（${loud.headRms} dBFS）`);

    const switches = log.captions.filter((item) => item.index >= 1).map((item) => ({ want: CAPTIONS[item.index].start, rect: item.rect }));
    const endTitle = { left: VIEW.width * .15, right: VIEW.width * .85, top: VIEW.height * .4, bottom: VIEW.height * .6 };
    switches.push({ want: END_START, rect: endTitle });
    const measured = captionSwitches(options.out, switches);
    const off = measured.filter(({ want, got }) => got === null || Math.abs(got - want) > .4);
    if (measured.length !== CAPTIONS.length) failures.push(`字幕の入れ替わりの数 ${measured.length}（予定 ${CAPTIONS.length}）`);
    if (off.length) failures.push(`字幕が絵とずれた: ${off.map(({ want, got }) => `${want}秒→${got?.toFixed(2) ?? 'なし'}`).join('、')}`);

    const region = log.first?.map && { left: 0, right: VIEW.width, top: Math.max(log.first.map.top, log.first.caption.bottom + 4), bottom: log.first.map.bottom };
    const growth = region ? [0, .1, 1.6].map((seconds) => pillarPixels(options.out, seconds, region)) : [0, 0, 0];
    const ratio = growth[2] ? growth[0] / growth[2] : 0;
    if (!(growth[2] > 400 && ratio > .05 && ratio < .85 && growth[1] > growth[0])) {
      failures.push(`1コマ目が「柱が伸びている途中」になっていない（柱の画素 0秒 ${growth[0]}・0.1秒 ${growth[1]}・1.6秒 ${growth[2]}）`);
    }
    if (log.violations.length) failures.push(`字幕の置き場所: ${log.violations.slice(0, 4).map((v) => `${v.t}秒 字幕${v.caption} ${v.problems.join('・')}`).join(' / ')}`);
    if (log.focusMissing.length) failures.push(`枠の相手が画面に無い: ${log.focusMissing.join('・')}`);
    const late = report.taps.filter((tap) => tap.actual - tap.planned > .25);
    if (late.length) failures.push(`押すのが遅れた: ${late.map((tap) => `${tap.name} ${tap.planned.toFixed(2)}→${tap.actual.toFixed(2)}秒`).join('、')}`);
    if (report.errors.length) failures.push(`ページのエラー: ${report.errors.join(' / ')}`);
    if (net.blocked.size) failures.push(`OpenFreeMap 以外へ出ようとした: ${[...net.blocked].join(', ')}`);

    console.log(`字幕の入れ替わり（予定→実測、括弧は隣のコマとの差・窓の頭からの差の最大）: ${measured.map(({ want, got, peak, drift }) => `${want}→${got?.toFixed(2) ?? 'なし'}(${peak.toFixed(0)}・${drift.toFixed(0)})`).join(' / ')}`);
    console.log(`押した時刻: ${report.taps.map((tap) => `${tap.name} ${tap.planned.toFixed(2)}→${tap.actual.toFixed(2)}`).join(' / ')}${report.more ? '（もっと見るを押した）' : ''}`);
    console.log(`字幕の置き場所（540×960 の縦位置）: ${log.captions.filter((item) => item.rect).map((item) => `${item.index}: ${Math.round(item.rect.top)}〜${Math.round(item.rect.bottom)}`).join(' / ')}`);
    console.log(`1コマ目: 柱の画素 ${growth.join(' → ')}（伸び切った後の ${(ratio * 100).toFixed(0)}%）/ ページの柱の伸び ${log.first?.grow ?? '不明'}`);
    console.log(`動画: ${video?.width}×${video?.height}・${video?.r_frame_rate}・${videoSeconds.toFixed(3)}秒・${video?.codec_name}/${audio?.codec_name} / 音 ${loud.lufs} LUFS・真のピーク ${loud.truePeak} dBTP・冒頭0.3秒 ${loud.headRms} dBFS`);
    for (const warning of [...new Set(report.warnings)]) console.log(`  注意: ${warning}`);
    console.log(`1コマ目は ${firstFrame}、2秒おきの一覧は ${options.sheet}。必ず目視すること。`);
    if (failures.length) throw new Error(`検査に落ちました（${options.out} は残してあります）:\n- ${failures.join('\n- ')}`);
    console.log(`検査: すべて通過（全体 ${lap()}）`);
  } finally {
    await browser.close().catch(() => {});
    server.close();
    if (!options.keep) rmSync(work, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
