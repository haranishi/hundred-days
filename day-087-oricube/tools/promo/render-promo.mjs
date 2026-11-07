// Day087 "OriCube" promo video (vertical 1080x1920, 30 fps, 32 s), shot frame by frame from the real app.
// Software WebGL cannot keep up with real time, so the page clock (requestAnimationFrame, performance.now,
// Date.now, setTimeout, CSS/Web Animations) is frozen and advanced by 1/30 s per frame. Captions, taps,
// the finger, the progress bar, flashes and the end card are separate transparent frames composited by ffmpeg.
//
// Usage (from the repository root; the app is served read-only from a built dist copy):
//   node day-087-oricube/tools/promo/render-promo.mjs --site-dir <.../dist> --frames-dir <work dir> --out-dir <output dir>
//   --only hook,story,montage,crane,overlay         re-shoot only these takes (others reuse earlier frames)
//   --compose-only                                  no shooting, only overlay compositing and encoding
//   --no-compose                                    shoot only
//   --mux a,b                                       also mux <out-dir>/bgm_{a,b}.wav into promo_{a,b}.mp4 (video stream copied)
// Paths can also come from PROMO_SITE_DIR / PROMO_FRAMES_DIR / PROMO_OUT_DIR. Fonts: PROMO_FONT, PROMO_FONT_BLACK.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BEAT, CRANE, DURATION_SECONDS, END_CARD, HOOK, MONTAGE, MONTAGE_LAND, PAPER_CUES, STORY, STORYBOARD, STORY_END, TAPS, TAP_CUES, bar } from './timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const { chromium } = await import(pathToFileURL(join(root, 'node_modules/playwright-core/index.mjs')).href);
const FPS = 30, TOTAL = Math.round(DURATION_SECONDS * FPS);
const VIEW = { width: 540, height: 960 }, DPR = 2;
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const flag = (name) => process.argv.includes(name);
const need = (value, what) => { if (!value) throw new Error(`${what} を指定してください（引数か環境変数）`); return resolve(value); };
const siteDir = need(arg('--site-dir', process.env.PROMO_SITE_DIR), '--site-dir');
const framesDir = need(arg('--frames-dir', process.env.PROMO_FRAMES_DIR), '--frames-dir');
const outDir = need(arg('--out-dir', process.env.PROMO_OUT_DIR), '--out-dir');
const font = process.env.PROMO_FONT || join(homedir(), 'Library/Fonts/ZenKakuGothicNew-Bold.ttf');
const fontBlack = process.env.PROMO_FONT_BLACK || join(homedir(), 'Library/Fonts/ZenKakuGothicNew-Black.ttf');
const port = Number(arg('--port', 4292));
const base = `http://127.0.0.1:${port}`;
const appPath = '/day-087-oricube/';
const frameAt = (seconds) => Math.round(seconds * FPS);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
if (basename(siteDir) !== 'dist' || !existsSync(join(siteDir, 'day-087-oricube/index.html'))) throw new Error(`--site-dir は day-087-oricube を含む dist を指す: ${siteDir}`);

// Takes: which frames of the final video each one shoots. The story is one page (the same petal fold) from bar 1
// to the list of works; the montage starts half a bar into scene S6.
const TAKES = {
  hook: { scenes: ['S0'], from: 0, to: frameAt(bar(1)) },
  story: { scenes: ['S1', 'S2', 'S3', 'S4', 'S5'], from: frameAt(bar(1)), to: frameAt(STORY_END) },
  montage: { scenes: ['S6'], from: frameAt(STORY_END), to: frameAt(CRANE.at) },
  crane: { scenes: ['S7'], from: frameAt(CRANE.at), to: frameAt(bar(11)) },
};
const only = (arg('--only', '') || '').split(',').filter(Boolean)
  .map((id) => Object.keys(TAKES).find((take) => take === id || TAKES[take].scenes.includes(id)) ?? (['S8', 'overlay'].includes(id) ? 'overlay' : id));
const wanted = (take) => !flag('--compose-only') && (!only.length || only.includes(take));

// ---- Frozen page clock (installed before any page script). __promoFreeze stops it, __promoStep(ms) advances it. ----
const CLOCK = `(() => {
  const realNow = performance.now.bind(performance), realRAF = requestAnimationFrame.bind(window), realCancel = cancelAnimationFrame.bind(window);
  const realDate = Date.now, realSet = setTimeout.bind(window), realClear = clearTimeout.bind(window);
  let virt = null, queue = new Map(), id = 1e6, timers = new Map(), seen = new WeakSet();
  const offset = realDate() - realNow();
  performance.now = () => virt ?? realNow();
  Date.now = () => virt === null ? realDate() : Math.round(offset + virt);
  window.requestAnimationFrame = (cb) => { if (virt === null) return realRAF((t) => cb(virt ?? t)); queue.set(++id, cb); return id; };
  window.cancelAnimationFrame = (h) => { if (queue.has(h)) queue.delete(h); else realCancel(h); };
  window.setTimeout = (cb, ms = 0, ...rest) => { if (virt === null || typeof cb !== 'function') return realSet(cb, ms, ...rest); timers.set(++id, { at: virt + Math.max(0, ms), cb, rest }); return id; };
  window.clearTimeout = (h) => { if (timers.has(h)) timers.delete(h); else realClear(h); };
  const syncAnimations = (ms) => {
    for (const a of document.getAnimations()) {
      if (!seen.has(a)) { seen.add(a); a.pause(); a.currentTime = ms; continue; }
      a.currentTime = (a.currentTime || 0) + ms;
    }
  };
  window.__promoFreeze = () => { if (virt === null) virt = realNow(); return virt; };
  window.__promoStep = (ms) => {
    virt += ms;
    for (const [h, t] of [...timers].sort((x, y) => x[1].at - y[1].at)) if (t.at <= virt) { timers.delete(h); t.cb(...t.rest); }
    const q = [...queue.values()]; queue = new Map();
    for (const cb of q) cb(virt);
    syncAnimations(ms);
    return q.length;
  };
})();`;

// ---- Server (the repository's dist server, run inside the dist copy's parent) and browser. ----
const stats = { blocked: [], warnings: [], driverNotes: 0, frames: {}, takes: {} };
const launch = () => chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function startServer() {
  const server = spawn(process.execPath, [join(root, 'scripts/serve-dist.mjs')], { cwd: dirname(siteDir), env: { ...process.env, PLAYWRIGHT_PORT: String(port) }, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${base}${appPath}`)).ok) return server; } catch { /* starting */ } await sleep(200); }
  server.kill(); throw new Error(`配信が起動しない: ${base}`);
}

async function newContext(browser, take) {
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: DPR, hasTouch: true, isMobile: true, locale: 'ja-JP', reducedMotion: 'no-preference' });
  await context.addInitScript(CLOCK);
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (new URL(url).origin === base) return route.continue();
    stats.blocked.push(url); return route.abort();
  });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (!['warning', 'error'].includes(message.type())) return;
    // A browser graphics performance note printed on every screenshot (GPU readback), not an app warning.
    if (/GL Driver Message .*GPU stall due to ReadPixels/.test(message.text())) { stats.driverNotes++; return; }
    stats.warnings.push(`${take}: ${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => stats.warnings.push(`${take}: pageerror: ${error.message}`));
  return { context, page };
}
// Opens the app at a URL state, freezes the clock, sets the speed and optionally presses play (before the first shot frame).
async function openApp(page, query, play, speed = 1) {
  await page.goto(`${base}${appPath}?debug=1&${query}`);
  await page.waitForFunction(() => document.getElementById('app').dataset.ready === 'true' && window.__oricube, null, { timeout: 180000 });
  await page.evaluate(() => window.__promoFreeze());
  await settle(page);
  if (speed !== 1) await click(page, `#speed [data-speed="${speed}"]`);
  if (play) await page.evaluate(() => document.getElementById('play').click());
  await settle(page);
}
const settle = (page, n = 3) => page.evaluate((n) => { for (let i = 0; i < n; i++) window.__promoStep(0); }, n);
const step = (page) => page.evaluate(() => window.__promoStep(1000 / 30));
const state = (page) => page.evaluate(() => { const s = window.__oricube.state(); return { model: s.model, step: s.step, t: +s.t.toFixed(4), phase: s.phase, playing: s.playing, finished: s.finished, exploded: s.exploded, theta: +(s.viewer?.theta ?? 0).toFixed(3) }; });
const rect = (page, selector) => page.evaluate((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r && r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height } : null; }, selector);
const click = (page, selector) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) throw new Error(`見つからない: ${s}`); el.click(); }, selector);
function takeDir(take) { const dir = join(framesDir, take); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true }); return dir; }
const shoot = (page, dir, index) => page.screenshot({ path: join(dir, `f${String(index).padStart(5, '0')}.png`), type: 'png', timeout: 120000 });

// A fold "lands" when the step progress reaches 1, or jumps (next/prev while moving). Used for the paper sound.
function landed(prev, now) {
  if (!prev || prev.model !== now.model) return false;
  if (now.step === prev.step) return prev.t < 1 && now.t >= 1;
  return now.step > prev.step && prev.phase === 'move';
}

// ---- Hook and story: one page each, taps and the finger drag at their frames; every frame of the take is saved. ----
async function shootPage(browser, take) {
  const { context, page } = await newContext(browser, take);
  const { from, to } = TAKES[take], dir = takeDir(take), events = { taps: [], fingers: [], states: [], landings: [] };
  const story = take === 'story';
  try {
    if (story) await openApp(page, STORY.query, false, STORY.speed);
    else await openApp(page, HOOK.query, HOOK.play, HOOK.speed);
    const tapAt = story ? Object.fromEntries(TAPS.map((tap) => [frameAt(tap.at), tap])) : {};
    const dragFrom = story ? frameAt(STORY.drag.from) : -1, dragTo = story ? frameAt(STORY.drag.to) : -1;
    const cdp = await context.newCDPSession(page);
    const touch = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y, id: 3, radiusX: 9, radiusY: 9, force: 1 }] : [] });
    let canvas = null, prev = null;
    for (let g = from; g < to; g++) {
      const tap = tapAt[g];
      if (tap) {
        const at = await rect(page, tap.target);
        if (!at) throw new Error(`押す部品が見えない: ${tap.target}（${g}コマ目）`);
        events.taps.push({ frame: g, label: tap.label, x: at.x, y: at.y, w: at.w, h: at.h });
        await click(page, tap.target);
        await settle(page, 1);
      }
      // Drag the 3D view with one finger: a gentle arc to the right (OrbitControls turns the camera around the paper).
      if (g >= dragFrom && g <= dragTo) {
        canvas ??= await rect(page, '#view');
        const u = (g - dragFrom) / (dragTo - dragFrom), e = u * u * (3 - 2 * u), dx = STORY.drag.dx;
        const p = { x: canvas.x - dx / 2 + dx * e, y: canvas.y + 20 - 36 * Math.sin(Math.PI * e) };
        await touch(g === dragFrom ? 'touchStart' : g === dragTo ? 'touchEnd' : 'touchMove', g === dragTo ? null : p);
        if (g < dragTo) events.fingers.push({ frame: g, points: [p] });
      }
      await step(page);
      const s = await state(page);
      if (landed(prev, s)) events.landings.push(+(g / FPS).toFixed(3));
      prev = s;
      await shoot(page, dir, g - from);
      events.states.push({ frame: g, ...s });
      if ((g - from) % 30 === 0) log(take, g - from, '/', to - from, JSON.stringify(s));
    }
    stats.frames[take] = to - from;
    stats.takes[take] = { landings: events.landings, taps: events.taps.map((t) => ({ seconds: +(t.frame / FPS).toFixed(3), label: t.label })) };
    writeFileSync(join(dir, 'events.json'), JSON.stringify(events, null, 1));
  } finally { await context.close(); }
}

// ---- Montage: each work opens on its last step a moment before the fold lands, and plays to the finished shape. ----
async function shootMontage(browser) {
  const { context, page } = await newContext(browser, 'montage');
  const { from, to } = TAKES.montage, dir = takeDir('montage'), events = { taps: [], fingers: [], states: [], landings: [], shots: [] };
  try {
    for (const [i, shot] of MONTAGE.entries()) {
      const start = frameAt(shot.at), end = i + 1 < MONTAGE.length ? frameAt(MONTAGE[i + 1].at) : to;
      await openApp(page, `m=${shot.model}&s=99`, false);   // s is clamped to the last step
      const last = await page.evaluate(() => { const m = window.__oricube.model; return { i: m.steps.length - 1, ms: m.steps.at(-1).durationMs }; });
      const t0 = Math.max(0, 1 - (MONTAGE_LAND * 1000) / last.ms);
      await page.evaluate(([i, t]) => window.__oricube.setProgress(i, t), [last.i, t0]);
      await settle(page);
      await click(page, '#play');
      let prev = null;
      for (let g = start; g < end; g++) {
        await step(page);
        const s = await state(page);
        if (landed(prev, s)) events.landings.push(+(g / FPS).toFixed(3));
        prev = s;
        await shoot(page, dir, g - from);
        events.states.push({ frame: g, ...s });
      }
      events.shots.push({ model: shot.model, from: start, to: end, step: last.i + 1, t0: +t0.toFixed(4), finishedInShot: prev.finished });
      log('montage', shot.model, `step ${last.i + 1} from t=${t0.toFixed(3)}`, JSON.stringify(prev));
    }
    stats.frames.montage = to - from;
    stats.takes.montage = { landings: events.landings, shots: events.shots };
    writeFileSync(join(dir, 'events.json'), JSON.stringify(events, null, 1));
  } finally { await context.close(); }
}

// ---- Crane: last step in side view, then the app's completion card and its slow turn. ----
async function shootCrane(browser) {
  const { context, page } = await newContext(browser, 'crane');
  const { from, to } = TAKES.crane, dir = takeDir('crane'), events = { taps: [], fingers: [], states: [], landings: [] };
  try {
    await openApp(page, CRANE.query, CRANE.play);
    let prev = null, finishedAt = null;
    for (let g = from; g < to; g++) {
      await step(page);
      const s = await state(page);
      if (landed(prev, s)) events.landings.push(+(g / FPS).toFixed(3));
      if (s.finished && finishedAt === null) finishedAt = +(g / FPS).toFixed(3);
      prev = s;
      await shoot(page, dir, g - from);
      events.states.push({ frame: g, ...s });
      if ((g - from) % 30 === 0) log('crane', g - from, '/', to - from, JSON.stringify(s));
    }
    stats.frames.crane = to - from;
    stats.takes.crane = { landings: events.landings, finishedAt, plannedFinish: CRANE.finishAt };
    writeFileSync(join(dir, 'events.json'), JSON.stringify(events, null, 1));
  } finally { await context.close(); }
}

// ---- Overlay frames (captions, progress bar, flashes, tap rings, finger, end card), transparent PNGs. ----
const FLASHES = [   // [seconds, strength]: cuts between pages, and the end card
  [bar(1), 0.4], ...MONTAGE.map((shot) => [shot.at, shot === MONTAGE[0] ? 0.4 : 0.28]), [CRANE.at, 0.45], [bar(11), 0.5],
];
// Caption top (CSS px) per scene: above the paper in the 3D view, below the app's hint pill and
// clear of the post UI (top 8% / bottom 20%). The crane's wings reach the top of the 3D view, so its caption sits
// over the transport row (prev / replay / next), which is not used in that scene.
// The hook is one big line (it is the thumbnail), clear of the paper's tip.
const CAPTION_TOP = { S0: 104, S1: 104, S2: 104, S3: 104, S4: 104, S5: 104, S6: 104, S7: 606 };

async function shootOverlay(browser) {
  const dir = takeDir('overlay');
  const events = Object.keys(TAKES).flatMap((take) => {
    const file = join(framesDir, take, 'events.json');
    return existsSync(file) ? [JSON.parse(readFileSync(file, 'utf8'))] : [];
  });
  const taps = events.flatMap((e) => e.taps), fingers = Object.fromEntries(events.flatMap((e) => e.fingers).map((f) => [f.frame, f.points]));
  const endBackground = join(framesDir, 'crane', `f${String(TAKES.crane.to - TAKES.crane.from - 1).padStart(5, '0')}.png`);
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: DPR });
  const page = await context.newPage();
  await page.route('**/*', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: overlayHtml() });
    if (path === '/font.ttf') return route.fulfill({ contentType: 'font/ttf', body: readFileSync(font) });
    if (path === '/font-black.ttf') return route.fulfill({ contentType: 'font/ttf', body: readFileSync(fontBlack) });
    if (path === '/end.png') return route.fulfill({ contentType: 'image/png', body: readFileSync(endBackground) });
    stats.blocked.push(route.request().url()); return route.abort();
  });
  await page.goto('http://promo.local/');
  await page.evaluate(async () => { await document.fonts.load('700 30px Promo'); await document.fonts.load('900 30px PromoBlack'); await document.fonts.ready; await new Promise((done) => { const img = document.querySelector('.end-bg'); img.complete ? done() : img.onload = done; }); });
  await page.evaluate((data) => window.__setup(data), { storyboard: STORYBOARD, taps, fingers, end: END_CARD, flashes: FLASHES, total: TOTAL, fps: FPS, captionTop: CAPTION_TOP });
  for (let f = 0; f < TOTAL; f++) {
    await page.evaluate((f) => window.__frame(f), f);
    await page.screenshot({ path: join(dir, `o${String(f).padStart(5, '0')}.png`), omitBackground: true });
  }
  stats.frames.overlay = TOTAL;
  await context.close();
}

function overlayHtml() {
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><style>
  @font-face { font-family: Promo; src: url(/font.ttf); font-weight: 700; }
  @font-face { font-family: PromoBlack; src: url(/font-black.ttf); font-weight: 900; }
  :root { --ink: #2b2623; --paper: #fffdf8; --red: #d6452d; --blue: #2e7bd0; }
  html, body { margin: 0; width: 540px; height: 960px; overflow: hidden; background: transparent; font-family: Promo, sans-serif; color: var(--ink); }
  .cap { position: absolute; left: 16px; right: 16px; text-align: center; }
  .cap span { display: inline-block; font-size: 31px; line-height: 1.24; font-weight: 700; letter-spacing: .02em; padding: 4px 15px 7px; margin: 3px 0; border-radius: 10px;
    background: rgba(255, 253, 248, .92); box-shadow: 0 2px 0 rgba(43, 38, 35, .12), 0 6px 18px rgba(43, 38, 35, .14); }
  .cap span:last-child { color: var(--red); }
  .cap.big span { font-size: 38px; padding: 6px 14px 9px; }
  .cap i { display: inline-block; width: 4px; }
  .bar { position: absolute; left: 0; bottom: 0; height: 4px; background: var(--red); }
  .flash { position: absolute; inset: 0; background: #fffdf8; opacity: 0; }
  .tap { position: absolute; width: 66px; height: 66px; margin: -33px; border-radius: 50%; border: 3.5px solid #fff; background: rgba(214, 69, 45, .30);
    box-shadow: 0 0 0 3px rgba(43, 38, 35, .55), 0 0 16px rgba(43, 38, 35, .35); box-sizing: border-box; opacity: 0; }
  .finger { position: absolute; width: 74px; height: 74px; margin: -37px; border-radius: 50%; background: rgba(255, 255, 255, .45); border: 3px solid rgba(255, 255, 255, .95);
    box-shadow: 0 0 0 6px rgba(214, 69, 45, .25), 0 4px 18px rgba(43, 38, 35, .35); box-sizing: border-box; }
  .end { position: absolute; inset: 0; display: none; overflow: hidden; background: #f1e9da; }
  .end-bg { position: absolute; inset: -40px; width: calc(100% + 80px); height: calc(100% + 80px); object-fit: cover; filter: blur(14px) saturate(1.05); opacity: .55; }
  .end-shade { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 42%, #f7f3eacc, #f1e9daf2 72%); }
  .end-body { position: absolute; left: 0; right: 0; top: 150px; text-align: center; }
  .end-body > * { opacity: 0; }
  .end .pill { display: inline-block; font-size: 14px; letter-spacing: .2em; color: var(--red); border: 1.5px solid #d6452d99; padding: 8px 16px; border-radius: 30px; background: #fffdf8; }
  .end .logo { display: block; margin: 26px auto 0; width: 64px; height: 64px; }
  .end h1 { font-family: PromoBlack, Promo, sans-serif; font-size: 72px; letter-spacing: .03em; margin: 10px 0 8px; font-weight: 900; color: var(--ink); }
  .end .sub { font-size: 27px; margin: 0 0 30px; color: var(--ink); }
  .end .badges { display: flex; justify-content: center; gap: 9px; flex-wrap: wrap; padding: 0 34px; }
  .end .badges b { font-size: 18px; font-weight: 700; padding: 9px 15px; border-radius: 30px; border: 1.5px solid #2b262340; background: #fffdf8; }
  .end .badges b:first-child { background: var(--red); color: #fff; border-color: var(--red); }
  .end .url { margin: 36px auto 0; display: inline-block; font-size: 21px; letter-spacing: .01em; color: #fff; background: var(--ink); padding: 14px 20px; border-radius: 14px; }
  </style>
  <div class="cap"></div>
  <div class="taps"></div>
  <div class="fingers"></div>
  <div class="bar"></div>
  <div class="end"><img class="end-bg" src="/end.png" alt=""><div class="end-shade"></div>
    <div class="end-body"><div class="pill end-day"></div>
      <svg class="logo" viewBox="0 0 32 32" aria-hidden="true"><path d="M5 7h22v18H5Z" fill="#2e7bd0"/><path d="M5 7h22L5 25Z" fill="#fffdf8"/><path d="M5 25 27 7" stroke="#d6452d" stroke-width="2" stroke-dasharray="3.4 2.2"/><path d="M5 7h22L5 25Z" fill="none" stroke="#2b2623" stroke-width="1.4" stroke-linejoin="round"/></svg>
      <h1 class="end-title"></h1><p class="sub end-sub"></p><div class="badges end-badges"></div><div><span class="url end-url"></span></div></div></div>
  <div class="flash"></div>
  <script>
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), easeOut = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;
  let D, current = null;
  window.__setup = (data) => {
    D = data;
    $('.end-day').textContent = data.end.day; $('.end-title').textContent = data.end.title; $('.end-sub').textContent = data.end.sub;
    $('.end-badges').replaceChildren(...data.end.badges.map((text) => Object.assign(document.createElement('b'), { textContent: text })));
    $('.end-url').textContent = data.end.url;
    $('.taps').replaceChildren(...data.taps.map((tap) => { const el = document.createElement('div'); el.className = 'tap'; el.style.left = tap.x + 'px'; el.style.top = tap.y + 'px'; return el; }));
  };
  window.__frame = (f) => {
    // Scene changes, flashes and the end card are compared in whole frames, the same rounding as the cuts.
    const t = f / D.fps, fr = (sec) => Math.round(sec * D.fps), scene = D.storyboard.findLast((s) => f >= fr(s.start)) ?? D.storyboard[0];
    $('.bar').style.width = (100 * (f + 1) / D.total) + '%';
    if (current !== scene.id) {
      current = scene.id;
      $('.cap').replaceChildren(...scene.lines.map((text) => Object.assign(document.createElement('span'), { textContent: text })).flatMap((el, i, all) => i < all.length - 1 ? [el, document.createElement(scene.inline ? 'i' : 'br')] : [el]));
      $('.cap').style.top = (D.captionTop[scene.id] ?? 112) + 'px';
      $('.cap').classList.toggle('big', !!scene.inline);
    }
    // The first scene is fully visible from frame 0 (the first frame is the post's thumbnail).
    const age = (f - fr(scene.start)) / D.fps + (f === 0 || scene.start === 0 ? 0.4 : 0);
    [...$('.cap').querySelectorAll('span')].forEach((el, i) => { const u = easeOut((age - i * 0.08) / 0.22); el.style.opacity = u; el.style.transform = 'translateY(' + ((1 - u) * 18) + 'px)'; });
    let flash = 0;
    for (const [at, strength] of D.flashes) { const dt = (f - fr(at)) / D.fps; if (dt >= 0) flash = Math.max(flash, strength * Math.exp(-dt / 0.14)); }
    $('.flash').style.opacity = flash;
    [...$('.taps').children].forEach((el, i) => { const dt = (f - D.taps[i].frame) / D.fps; const on = dt >= -0.17 && dt < 0.55; const u = clamp((dt + 0.07) / 0.6, 0, 1);
      el.style.opacity = on ? (dt < 0 ? 0.6 : 1 - u ** 1.5) : 0; el.style.transform = 'scale(' + (dt < 0 ? 0.55 : 0.6 + u * 0.9) + ')'; });
    const pts = D.fingers[f] || [];
    $('.fingers').replaceChildren(...pts.map((p) => { const el = document.createElement('div'); el.className = 'finger'; el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; return el; }));
    const endAt = D.storyboard.find((s) => s.music === 'resolve').start, end = f >= fr(endAt);
    $('.end').style.display = end ? 'block' : 'none';
    $('.cap').style.visibility = end ? 'hidden' : 'visible';
    if (end) {
      const e = (f - fr(endAt)) / D.fps;
      [...$('.end-body').children].forEach((el, i) => { const u = easeOut((e - i * 0.08) / 0.3); el.style.opacity = u; el.style.transform = 'translateY(' + ((1 - u) * 22) + 'px)'; });
      $('.end-bg').style.transform = 'scale(' + (1.04 + e * 0.02) + ')';
    }
  };
  </script></html>`;
}

// ---- Compose: lay the shot frames in final order, composite the overlay, encode, and check. ----
const ffmpeg = process.env.FFMPEG || '/opt/homebrew/bin/ffmpeg', ffprobe = process.env.FFPROBE || '/opt/homebrew/bin/ffprobe';
const silentName = 'Day087_oricube_promo_silent.mp4';
function compose() {
  const seq = join(framesDir, 'seq');
  rmSync(seq, { recursive: true, force: true }); mkdirSync(seq, { recursive: true });
  const lastCrane = join(framesDir, 'crane', `f${String(TAKES.crane.to - TAKES.crane.from - 1).padStart(5, '0')}.png`);
  const source = (g) => {
    for (const [take, { from, to }] of Object.entries(TAKES)) if (g >= from && g < to) return join(framesDir, take, `f${String(g - from).padStart(5, '0')}.png`);
    return lastCrane;   // under the end card
  };
  for (let g = 0; g < TOTAL; g++) {
    const file = source(g);
    if (!existsSync(file)) throw new Error(`コマがありません: ${file}（先にそのテイクを撮る）`);
    symlinkSync(file, join(seq, `r${String(g).padStart(5, '0')}.png`));
  }
  mkdirSync(outDir, { recursive: true });
  // Bring every overlay frame to rgba: an opaque frame (the end card) is saved as rgb24, and a pixel format change in
  // the middle of an image sequence makes ffmpeg rebuild the filter graph and drop the overlay on 1-2 frames (Day083).
  const overlayDir = join(framesDir, 'overlay-rgba');
  rmSync(overlayDir, { recursive: true, force: true }); mkdirSync(overlayDir, { recursive: true });
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', join(framesDir, 'overlay', 'o%05d.png'),
    '-vf', 'format=rgba', '-start_number', '0', join(overlayDir, 'o%05d.png')]);
  const silent = join(outDir, silentName);
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'warning', '-y',
    '-framerate', String(FPS), '-i', join(seq, 'r%05d.png'), '-framerate', String(FPS), '-i', join(overlayDir, 'o%05d.png'),
    '-filter_complex', '[0:v]format=rgba,scale=1080:1920:flags=lanczos,setsar=1[b];[b][1:v]overlay=0:0:format=auto,format=yuv420p[v]',
    '-map', '[v]', '-t', String(DURATION_SECONDS), '-r', String(FPS),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-map_metadata', '-1', silent], { stdio: 'inherit' });
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', silent, '-frames:v', '1', '-map_metadata', '-1', join(outDir, 'first-frame.png')]);
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', silent, '-vf', 'fps=1,scale=270:480,tile=8x4:padding=6:color=0xf1e9da', '-frames:v', '1', '-q:v', '3', '-map_metadata', '-1', join(outDir, 'contact-sheet.jpg')]);
  // The first frame must already be moving: compare frames 0 and 3 of the encoded video (mean absolute difference, 0..255).
  const gray = (n) => execFileSync(ffmpeg, ['-v', 'error', '-i', silent, '-vf', `select=eq(n\\,${n}),scale=270:480,format=gray`, '-frames:v', '1', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 24 });
  const [a, b] = [gray(0), gray(3)];
  let diff = 0, changed = 0;
  for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); diff += d; if (d > 8) changed++; }
  stats.firstFrameMotion = { meanAbsDiff: +(diff / a.length).toFixed(3), changedPixelsPercent: +(100 * changed / a.length).toFixed(2) };
  if (changed === 0) throw new Error('1コマ目とコマ3が同じ（動いていない）');
  // Every cut, 2 frames before and 2 after (one row per cut), to look for half-way states at the joins.
  const cuts = [...new Set(FLASHES.map(([at]) => frameAt(at)))].sort((x, y) => x - y);
  const picks = cuts.flatMap((c) => [c - 2, c - 1, c, c + 1]);
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', silent, '-vf', `select='${picks.map((n) => `eq(n\\,${n})`).join('+')}',scale=270:480,tile=4x${cuts.length}:padding=6:color=0x2b2623`,
    '-vsync', '0', '-frames:v', '1', '-q:v', '3', '-map_metadata', '-1', join(outDir, 'cut-check.jpg')]);
  stats.cutCheck = { file: 'cut-check.jpg', rows: cuts.map((c) => ({ cutFrame: c, seconds: +(c / FPS).toFixed(3), frames: [c - 2, c - 1, c, c + 1] })) };
  return [silent];
}
function mux(variant) {
  const wav = join(outDir, `bgm_${variant}.wav`), out = join(outDir, `Day087_oricube_promo_${variant}.mp4`);
  if (!existsSync(wav)) throw new Error(`BGMがありません: ${wav}（promo-audio.mjs --variant ${variant}）`);
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', join(outDir, silentName), '-i', wav,
    '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    '-af', `apad=whole_dur=${DURATION_SECONDS}`, '-t', String(DURATION_SECONDS), '-movflags', '+faststart', '-map_metadata', '-1', out]);
  return out;
}
function probe(file) {
  const p = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }));
  const v = p.streams.find((s) => s.codec_type === 'video'), a = p.streams.find((s) => s.codec_type === 'audio');
  const decode = execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-f', 'null', '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const silent = file.endsWith(silentName);
  const ok = v.width === 1080 && v.height === 1920 && v.codec_name === 'h264' && v.pix_fmt === 'yuv420p' && v.r_frame_rate === '30/1'
    && Math.abs(Number(p.format.duration) - DURATION_SECONDS) <= 0.05 && decode.trim() === ''
    && (silent ? !a : a?.codec_name === 'aac' && a.sample_rate === '48000' && a.channels === 2);
  const row = { file: basename(file), ok, size: `${v.width}x${v.height}`, codec: v.codec_name, pix: v.pix_fmt, fps: v.r_frame_rate, frames: Number(v.nb_frames),
    seconds: +Number(p.format.duration).toFixed(3), audio: a ? `${a.codec_name} ${a.sample_rate}Hz ${a.channels}ch` : 'なし', decodeErrors: decode.trim() ? decode.trim().split('\n').length : 0 };
  log(ok ? '検査OK' : '検査NG', JSON.stringify(row));
  if (!ok) throw new Error(`出力が仕様と違います: ${file}`);
  return row;
}

// ---- Run ----
mkdirSync(framesDir, { recursive: true });
const started = Date.now(), timings = {};
const needApp = Object.keys(TAKES).some(wanted);
const server = needApp ? await startServer() : null;
const browsers = [];
const timed = async (name, fn) => { const t0 = Date.now(); await fn(); timings[name] = +((Date.now() - t0) / 60000).toFixed(1); };
try {
  // Two browsers at most (--lanes 1 for a busy machine): the story (440 frames) and hook + montage + crane (440 frames).
  const lanes = [], one = arg('--lanes', '2') === '1';
  const laneA = async (b) => { if (wanted('story')) await timed('story', () => shootPage(b, 'story')); };
  const laneB = async (b) => { if (wanted('hook')) await timed('hook', () => shootPage(b, 'hook')); if (wanted('montage')) await timed('montage', () => shootMontage(b)); if (wanted('crane')) await timed('crane', () => shootCrane(b)); };
  if (one) { if (needApp) lanes.push(launch().then(async (b) => { browsers.push(b); await laneA(b); await laneB(b); })); }
  else {
    if (wanted('story')) lanes.push(launch().then(async (b) => { browsers.push(b); await laneA(b); }));
    if (['hook', 'montage', 'crane'].some(wanted)) lanes.push(launch().then(async (b) => { browsers.push(b); await laneB(b); }));
  }
  await Promise.all(lanes);
  if (!flag('--no-compose')) {
    if (!flag('--compose-only') && (!only.length || only.includes('overlay') || needApp)) { const b = await launch(); browsers.push(b); await timed('overlay', () => shootOverlay(b)); }
    compose();
  }
} finally {
  for (const b of browsers) await b.close().catch(() => {});
  server?.kill();
}
const outputs = [];
if (!flag('--no-compose')) {
  outputs.push(probe(join(outDir, silentName)));
  for (const variant of (arg('--mux', '') || '').split(',').filter(Boolean)) outputs.push(probe(mux(variant)));
}
// Paper-sound cues in timeline.mjs vs the fold landings measured in this capture.
const previous = existsSync(join(framesDir, 'capture-report.json')) ? JSON.parse(readFileSync(join(framesDir, 'capture-report.json'), 'utf8')) : {};
const allTakes = { ...previous.takes, ...stats.takes };
const measured = Object.values(allTakes).flatMap((t) => t.landings ?? []).sort((x, y) => x - y);
const cueDrift = PAPER_CUES.map((cue) => ({ cue, nearest: measured.reduce((best, t) => (Math.abs(t - cue) < Math.abs(best - cue) ? t : best), Infinity) }))
  .map((c) => ({ ...c, driftFrames: Math.round(Math.abs(c.nearest - c.cue) * FPS) }));
if (measured.length && cueDrift.some((c) => c.driftFrames > 2)) log('注意: PAPER_CUES と実測の着地がずれています', JSON.stringify(cueDrift));
const tapsMeasured = Object.values(allTakes).flatMap((t) => t.taps ?? []).map((t) => t.seconds);
const tapDrift = TAP_CUES.map((cue) => ({ cue, nearest: tapsMeasured.reduce((best, t) => (Math.abs(t - cue) < Math.abs(best - cue) ? t : best), Infinity) }))
  .map((c) => ({ ...c, driftFrames: Math.round(Math.abs(c.nearest - c.cue) * FPS) }));
const size = (dir) => readdirSync(dir, { withFileTypes: true }).reduce((sum, e) => sum + (e.isDirectory() ? size(join(dir, e.name)) : e.isFile() ? statSync(join(dir, e.name)).size : 0), 0);
const report = { seconds: DURATION_SECONDS, fps: FPS, width: 1080, height: 1920, beat: BEAT, capture: `CSS ${VIEW.width}x${VIEW.height}, DPR ${DPR}`,
  framesShot: { ...previous.framesShot, ...stats.frames }, takes: allTakes, measuredLandings: measured, paperCueDrift: cueDrift,
  minutes: +((Date.now() - started) / 60000).toFixed(1), minutesByTake: { ...previous.minutesByTake, ...timings },
  tapCueDrift: tapDrift, cutCheck: stats.cutCheck ?? previous.cutCheck,
  blockedRequests: stats.blocked.length, blocked: stats.blocked.slice(0, 20), consoleWarnings: stats.warnings, gpuReadbackNotes: stats.driverNotes,
  firstFrameMotion: stats.firstFrameMotion ?? previous.firstFrameMotion, outputs, framesBytes: size(framesDir) };
writeFileSync(join(framesDir, 'capture-report.json'), JSON.stringify(report, null, 2) + '\n');
if (!flag('--no-compose')) writeFileSync(join(outDir, 'capture-report.json'), JSON.stringify(report, null, 2) + '\n');
log('完了', JSON.stringify({ minutes: report.minutes, minutesByTake: report.minutesByTake, blocked: report.blockedRequests, warnings: report.consoleWarnings.length, firstFrameMotion: report.firstFrameMotion }));
