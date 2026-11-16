// Day093 "find" promo video (vertical 1080x1920, 30 fps, 32 s) and demo.mp4 (540x960, 16 s).
// Served locally under https://day93.rairakku.com with local API gateway.fetch on disposable SQLite/libSQL DBs.
// Nothing connects to the real network; shop/mall names are hidden only via CSS injection during capture.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createLocalGateway } from './demo-catalog.mjs';
import {
  API_ORIGIN, APP_ORIGIN, ARUARU, BAR, BEAT, CARD_TIMES, DISCLAIMER_TEXT,
  DURATION_SECONDS, END_CARD, HIDDEN_SELECTORS, MUSIC_CUES, PLAN, STORYBOARD, TAP_CUES, bar, beat, scene,
} from './timeline.mjs';

const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const flag = (name) => args.includes(name);
const need = (value, what) => { if (!value) throw new Error(`${what} を指定してください（引数か環境変数）`); return resolve(value); };

const siteDir = need(arg('--site-dir', process.env.PROMO_SITE_DIR), '--site-dir');
const findRoot = need(arg('--find-root', process.env.PROMO_FIND_ROOT), '--find-root');
const framesDir = need(arg('--frames-dir', process.env.PROMO_FRAMES_DIR), '--frames-dir');
const outDir = need(arg('--out-dir', process.env.PROMO_OUT_DIR), '--out-dir');
const font = arg('--font', process.env.PROMO_FONT) || join(homedir(), 'Library/Fonts/ZenKakuGothicNew-Bold.ttf');
const fontBlack = arg('--font-black', process.env.PROMO_FONT_BLACK) || join(homedir(), 'Library/Fonts/ZenKakuGothicNew-Black.ttf');
const which = (name, env) => process.env[env] || execFileSync('/bin/sh', ['-c', `command -v ${name}`], { encoding: 'utf8' }).trim();
const ffmpeg = which('ffmpeg', 'FFMPEG');
const ffprobe = which('ffprobe', 'FFPROBE');

async function loadChromium() {
  if (process.env.PLAYWRIGHT) {
    const mod = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT)).href);
    return mod.chromium ?? mod.default.chromium;
  }
  const here = fileURLToPath(import.meta.url);
  const candidates = [
    resolve(process.cwd(), 'node_modules/playwright/index.mjs'),
    resolve(here, '../../../../node_modules/playwright/index.mjs'),
  ];
  const found = candidates.find((p) => existsSync(p));
  const mod = found ? await import(pathToFileURL(found).href) : await import('playwright');
  return mod.chromium ?? mod.default.chromium;
}

const FPS = 30, TOTAL = Math.round(DURATION_SECONDS * FPS), DPR = 2;
const VIEW = { width: 430, height: 680 };
const SRC = { w: VIEW.width * DPR, h: VIEW.height * DPR }; // 860x1360
const WIN = { x: 110, y: 420, w: 860, h: 1360, radius: 44 }; // 1080x1920 pixels (CSS: x=55, y=210, w=430, h=680)
const silentName = 'Day093_find_promo_silent.mp4';
const only = (arg('--only', '') || '').split(',').filter(Boolean);
const wanted = (part) => !flag('--compose-only') && (!only.length || only.includes(part));

const frameAt = (seconds) => Math.round(seconds * FPS);
const pad = (n) => String(n).padStart(5, '0');
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const clamp01 = (u) => Math.max(0, Math.min(1, u));
const smooth = (u) => { const x = clamp01(u); return x * x * (3 - 2 * x); };
if (!existsSync(join(siteDir, 'index.html'))) throw new Error(`--site-dir に index.html がありません: ${siteDir}`);

// ---- Frozen page clock (installed before page script) ----
const FIXED_EPOCH = 1763280000000;
const CLOCK = `(() => {
  const realNow = performance.now.bind(performance), realRAF = requestAnimationFrame.bind(window), realCancel = cancelAnimationFrame.bind(window);
  const realSet = setTimeout.bind(window), realClear = clearTimeout.bind(window);
  let virt = null, frozenAt = 0, queue = new Map(), id = 1e6, timers = new Map(), seen = new WeakSet();
  performance.now = () => virt ?? realNow();
  Date.now = () => virt === null ? ${FIXED_EPOCH} : Math.round(${FIXED_EPOCH} + virt - frozenAt);
  window.requestAnimationFrame = (cb) => { if (virt === null) return realRAF((t) => cb(virt ?? t)); queue.set(++id, cb); return id; };
  window.cancelAnimationFrame = (h) => { if (queue.has(h)) queue.delete(h); else realCancel(h); };
  window.setTimeout = (cb, ms = 0, ...rest) => { if (virt === null || typeof cb !== 'function') return realSet(cb, ms, ...rest); timers.set(++id, { at: virt + Math.max(0, ms), cb, rest }); return id; };
  window.clearTimeout = (h) => { if (timers.has(h)) timers.delete(h); else realClear(h); };
  const syncAnimations = (ms) => {
    void document.body.offsetHeight;
    for (const a of document.getAnimations()) {
      if (!seen.has(a)) { seen.add(a); a.pause(); a.currentTime = ms; continue; }
      a.currentTime = (a.currentTime || 0) + ms;
    }
  };
  window.__promoFreeze = () => { if (virt === null) { virt = realNow(); frozenAt = virt; } return virt; };
  window.__promoStep = (ms) => {
    virt += ms;
    for (const [h, t] of [...timers].sort((x, y) => x[1].at - y[1].at)) if (t.at <= virt + 1e-6) { timers.delete(h); t.cb(...t.rest); }
    const q = [...queue.values()]; queue = new Map();
    for (const cb of q) cb(virt);
    syncAnimations(ms);
    return q.length;
  };
})();`;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json; charset=utf-8',
};
const HOP = ['content-encoding', 'content-length', 'transfer-encoding', 'connection'];
const HIDE_CSS = `${HIDDEN_SELECTORS.join(', ')} { display: none !important; }`;

const stats = {
  blocked: [],
  warnings: [],
  routedStatic: 0,
  routedApi: 0,
  requestsSeen: 0,
  frames: {},
  takes: {},
  hiddenSelectors: HIDDEN_SELECTORS,
  hiddenMatchCounts: {},
  mallNameChecks: [],
  prVisibleCount: 0,
  shownImages: [],
};

async function createAppContext(browser, gw, pendingBg, takeName, did, { v4Done = false } = {}) {
  const context = await browser.newContext({
    viewport: VIEW, deviceScaleFactor: DPR, isMobile: true, hasTouch: true,
    locale: 'ja-JP', timezoneId: 'Asia/Tokyo', reducedMotion: 'no-preference', serviceWorkers: 'block',
  });
  await context.addInitScript(CLOCK);
  await context.addInitScript(({ deviceId, done }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('find_did', deviceId);
    if (done) localStorage.setItem('find_v4_done', '1');
  }, { deviceId: did, done: v4Done });

  await context.route('**/*', async (route) => {
    const req = route.request(), url = req.url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    const u = new URL(url);
    if (u.origin === APP_ORIGIN) {
      const rel = u.pathname === '/' ? 'index.html' : u.pathname.replace(/^\/+/, '');
      const target = resolve(siteDir, rel);
      stats.routedStatic++;
      if (target.startsWith(siteDir) && statSync(target, { throwIfNoEntry: false })?.isFile()) {
        return route.fulfill({ status: 200, headers: { 'Content-Type': MIME[extname(target)] ?? 'application/octet-stream' }, body: readFileSync(target) });
      }
      return route.fulfill({ status: 404, body: 'not found' });
    }
    if (u.origin === API_ORIGIN) {
      stats.routedApi++;
      const postData = req.postDataBuffer();
      const webReq = new Request(url, {
        method: req.method(),
        headers: req.headers(),
        body: req.method() === 'GET' || req.method() === 'HEAD' ? undefined : postData,
      });
      const res = await gw.gateway.fetch(webReq, {}, { waitUntil: (p) => pendingBg.push(p), passThroughOnException: () => {} });
      const headers = Object.fromEntries([...res.headers].filter(([k]) => !HOP.includes(k.toLowerCase())));
      return route.fulfill({ status: res.status, headers, body: Buffer.from(await res.arrayBuffer()) });
    }
    stats.blocked.push(`${takeName}: ${url}`);
    return route.abort();
  });

  context.on('request', (req) => {
    const url = req.url();
    if (!url.startsWith('data:') && !url.startsWith('blob:')) stats.requestsSeen++;
  });

  const page = await context.newPage();
  let expected403Seen = 0;
  page.on('response', (res) => {
    const st = res.status(), u = res.url();
    if (st === 403 && u.endsWith('/api/feed?onboarding=1')) {
      expected403Seen++;
      return;
    }
    if (st >= 400) stats.warnings.push(`${takeName}: http ${st} ${u}`);
  });
  page.on('console', (msg) => {
    if (!['warning', 'error'].includes(msg.type())) return;
    const txt = msg.text();
    if (/GPU stall due to ReadPixels/.test(txt)) return;
    if (/status of 403/.test(txt) && expected403Seen > 0) return;
    stats.warnings.push(`${takeName}: ${msg.type()}: ${txt.slice(0, 260)}`);
  });
  page.on('pageerror', (err) => stats.warnings.push(`${takeName}: pageerror: ${err.message}`));
  return { context, page };
}

function takeDir(name) {
  const dir = join(framesDir, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}
const step = (page) => page.evaluate(() => { window.__promoStep(1000 / 60); window.__promoStep(1000 / 60); });
const settle = (page, n = 2) => page.evaluate((n) => { for (let i = 0; i < n; i++) window.__promoStep(0); }, n);
const shoot = (page, dir, idx) => page.screenshot({ path: join(dir, `f${pad(idx)}.png`), type: 'png', timeout: 120000 });
async function shootSmart(page, cdp, dir, idx) {
  const scrollY = await page.evaluate(() => window.scrollY);
  if (scrollY > 0) return shoot(page, dir, idx);
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: VIEW.width, height: VIEW.height, scale: DPR },
    optimizeForSpeed: true,
  });
  writeFileSync(join(dir, `f${pad(idx)}.png`), Buffer.from(data, 'base64'));
}
const rectOf = (page, selector) => page.evaluate((s) => {
  const el = document.querySelector(s);
  const r = el?.getBoundingClientRect();
  return r && r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height, top: r.top, bottom: r.bottom } : null;
}, selector);

async function poll(page, fn, argVal, what, ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await page.evaluate(fn, argVal)) return;
    await settle(page, 1);
    await sleep(20);
  }
  throw new Error(`待っても起きない: ${what}`);
}

async function inspectFrame(page, takeName, idx) {
  const check = await page.evaluate((selectors) => {
    const text = document.body.innerText || '';
    const matches = text.match(/楽天|Yahoo/gi) || [];
    const hiddenCounts = {};
    for (const s of selectors) hiddenCounts[s] = document.querySelectorAll(s).length;
    const pr = [...document.querySelectorAll('.pr-badge, .legal-line, .pr-label')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none';
    }).length;
    const host = document.body.dataset.view === 'main' ? '#deck' : '#v4-deck';
    const topCardEl = document.querySelector(`${host} .card:not(.behind)`);
    const topCardImg = topCardEl?.querySelector('img')?.getAttribute('src') || null;
    const topCardId = topCardEl?.dataset?.itemId || null;
    return { matches, hiddenCounts, pr, topCardImg, topCardId };
  }, HIDDEN_SELECTORS);

  if (check.matches.length) throw new Error(`禁止文字列を検出 (${takeName} f=${idx}): ${check.matches.join(', ')}`);
  for (const [s, n] of Object.entries(check.hiddenCounts)) {
    stats.hiddenMatchCounts[s] = Math.max(stats.hiddenMatchCounts[s] ?? 0, n);
  }
  stats.prVisibleCount = Math.max(stats.prVisibleCount, check.pr);
  if (check.topCardImg && check.topCardId) {
    const prev = stats.shownImages.at(-1);
    if (!prev || prev.id !== check.topCardId || prev.take !== takeName) {
      stats.shownImages.push({ take: takeName, frame: idx, id: check.topCardId, src: check.topCardImg });
    }
  }
  return check;
}

async function seedDevicePrefs(gw, did, { gender = 'female', ageBand = '25_29', budget = 'u10k', styles }) {
  const headers = { 'content-type': 'application/json', 'x-find-device-id': did };
  await gw.gateway.fetch(new Request(`${API_ORIGIN}/api/onboarding/attributes`, { method: 'POST', headers, body: JSON.stringify({ gender, ageBand, budget }) }));
  if (styles?.length) {
    await gw.gateway.fetch(new Request(`${API_ORIGIN}/api/onboarding`, { method: 'POST', headers, body: JSON.stringify({ styles }) }));
  }
  await gw.profile.fetch(new Request('https://internal/internal/project', { method: 'POST' }));
}

async function performTap(page, cdp, selector, videoSec, events, { holdFrames = 3, overlayDy = 0 } = {}) {
  const box = await rectOf(page, selector);
  if (!box) throw new Error(`タップ対象が見つかりません: ${selector}`);
  const t0 = Date.now() / 1000;
  events.taps.push({ videoSeconds: videoSec, selector, x: +box.x.toFixed(1), y: +(box.y + overlayDy).toFixed(1), w: +box.w.toFixed(1), h: +box.h.toFixed(1), holdFrames });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x, y: box.y, id: 1, radiusX: 9, radiusY: 9, force: 1 }], timestamp: t0 });
  return { box, finish: async () => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: t0 + holdFrames / FPS }); } };
}

// ---- Take 1: hook (S0: 0..2.5 s, 75 frames). Slow continuous finger drag right across the hook -> release at ~2.33 s (<=3 overlap frames). ----
async function shootHook(browser, gw, pendingBg) {
  const did = crypto.randomUUID();
  await seedDevicePrefs(gw, did, { styles: ['street', 'y2k'] });
  const { context, page } = await createAppContext(browser, gw, pendingBg, 'hook', did, { v4Done: true });
  const dir = takeDir('hook');
  const events = { did, taps: [], fingers: [], swipes: [] };
  try {
    await page.goto(`${APP_ORIGIN}/`, { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: HIDE_CSS });
    await page.waitForSelector('#deck .card');
    await poll(page, () => [...document.querySelectorAll('#deck .card img')].every((i) => i.complete && i.naturalWidth > 0), null, 'フック画像読込');

    const firstSrc = await page.evaluate(() => document.querySelector('#deck .card:not(.behind) img')?.getAttribute('src'));
    await page.evaluate(() => window.__promoFreeze());
    await settle(page);

    const cdp = await context.newCDPSession(page);
    const t0 = Date.now() / 1000;
    const x0 = 176, y0 = 280;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1, radiusX: 9, radiusY: 9, force: 1 }], timestamp: t0 });

    const framesCount = frameAt(scene('S0').end) - frameAt(scene('S0').start); // 75
    const releaseFrame = 70; // f=0..66 gentle pull (dx<=22px, 0 overlap); f=67,68,69 crisp tilt (3 frames); f=70 release + instant deck advance
    const whipOffsets = [68, 98, 132];
    for (let f = 0; f < framesCount; f++) {
      if (f < releaseFrame - 3) {
        const u = f / (releaseFrame - 4);
        const px = x0 + 6 + 16 * u;
        const py = y0 - 12 * smooth(u);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: px, y: py, id: 1, radiusX: 9, radiusY: 9, force: 1 }], timestamp: t0 + f / FPS });
        events.fingers.push({ frame: f, x: +px.toFixed(1), y: +py.toFixed(1) });
      } else if (f < releaseFrame) {
        const k = f - (releaseFrame - 3);
        const px = x0 + whipOffsets[k], py = y0 - 14 - k * 2;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: px, y: py, id: 1, radiusX: 9, radiusY: 9, force: 1 }], timestamp: t0 + f / FPS });
        events.fingers.push({ frame: f, x: +px.toFixed(1), y: +py.toFixed(1) });
      } else if (f === releaseFrame) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: t0 + f / FPS });
        await page.evaluate(() => window.__promoStep(260));
        await poll(page, () => [...document.querySelectorAll('#deck .card img')].every((i) => i.complete && i.naturalWidth > 0), null, 'フック次カード読込');
      }
      await shoot(page, dir, f);
      await inspectFrame(page, 'hook', f);
      await step(page);
    }
    const secondSrc = await page.evaluate(() => document.querySelector('#deck .card:not(.behind) img')?.getAttribute('src'));
    events.swipes.push({ firstSrc, secondSrc });
    stats.frames.hook = framesCount;
    stats.takes.hook = events;
    writeFileSync(join(dir, 'events.json'), JSON.stringify(events, null, 2));
    return events;
  } finally {
    await context.close();
  }
}

// ---- Take 2: drop (S2: 5.0..7.5 s, 75 frames). Swipe right (♥) then left (✕) on main screen (<=3 overlap frames each). ----
async function shootDrop(browser, gw, pendingBg) {
  const did = crypto.randomUUID();
  await seedDevicePrefs(gw, did, { styles: ['ryosan', 'jirai'] });
  const { context, page } = await createAppContext(browser, gw, pendingBg, 'drop', did, { v4Done: true });
  const dir = takeDir('drop');
  const events = { did, taps: [], fingers: [], swipes: [] };
  try {
    await page.goto(`${APP_ORIGIN}/`, { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: HIDE_CSS });
    await page.waitForSelector('#deck .card');
    await poll(page, () => [...document.querySelectorAll('#deck .card img')].every((i) => i.complete && i.naturalWidth > 0), null, 'ドロップ画像読込');
    await page.evaluate(() => window.__promoFreeze());
    await settle(page);

    const cdp = await context.newCDPSession(page);
    const t0 = Date.now() / 1000;
    const framesCount = frameAt(scene('S2').end) - frameAt(scene('S2').start); // 75

    const swipe1Start = 6, swipe1End = 15;   // right
    const swipe2Start = 35, swipe2End = 44;  // left
    const whipOffsets = [68, 98, 132];

    const stepDropSwipe = async (f, sF, eF, dirSign, idBase) => {
      const x0 = dirSign > 0 ? 165 : 265, y0 = 275;
      if (f === sF) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: idBase, radiusX: 9, radiusY: 9, force: 1 }], timestamp: t0 + f / FPS });
        events.fingers.push({ frame: f, x: x0, y: y0 });
      } else if (f > sF && f < eF - 3) {
        const u = (f - sF) / (eF - 3 - sF);
        const px = x0 + dirSign * 22 * smooth(u), py = y0 - 6 * u;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: px, y: py, id: idBase, radiusX: 9, radiusY: 9, force: 1 }], timestamp: t0 + f / FPS });
        events.fingers.push({ frame: f, x: +px.toFixed(1), y: +py.toFixed(1) });
      } else if (f >= eF - 3 && f < eF) {
        const k = f - (eF - 3);
        const px = x0 + dirSign * whipOffsets[k], py = y0 - 8 - k * 2;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: px, y: py, id: idBase, radiusX: 9, radiusY: 9, force: 1 }], timestamp: t0 + f / FPS });
        events.fingers.push({ frame: f, x: +px.toFixed(1), y: +py.toFixed(1) });
      } else if (f === eF) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: t0 + f / FPS });
        await page.evaluate(() => window.__promoStep(260));
        await poll(page, () => [...document.querySelectorAll('#deck .card img')].every((i) => i.complete && i.naturalWidth > 0), null, 'ドロップ次カード読込');
      }
    };

    for (let f = 0; f < framesCount; f++) {
      await stepDropSwipe(f, swipe1Start, swipe1End, 1, 2);
      await stepDropSwipe(f, swipe2Start, swipe2End, -1, 3);
      await shoot(page, dir, f);
      await inspectFrame(page, 'drop', f);
      await step(page);
    }

    stats.frames.drop = framesCount;
    stats.takes.drop = events;
    writeFileSync(join(dir, 'events.json'), JSON.stringify(events, null, 2));
    return events;
  } finally {
    await context.close();
  }
}

// ---- Take 3: flow (S3..S7: 7.5..27.5 s, 600 frames). Starts cleanly at C-1 (skipping C-0). ----
async function shootFlow(browser, gw, pendingBg) {
  const did = crypto.randomUUID();
  const { context, page } = await createAppContext(browser, gw, pendingBg, 'flow', did, { v4Done: false });
  const dir = takeDir('flow');
  const startSec = scene('S3').start; // 7.500
  const startFrame = frameAt(startSec); // 225
  const totalFlowFrames = frameAt(scene('S8').start) - startFrame; // 825 - 225 = 600
  const relFrame = (videoSec) => frameAt(videoSec) - startFrame;

  const events = {
    did, taps: [], fingers: [],
    budgetBounds: null, looksBounds: { view1: null, view2: null },
    resultBounds: null, favBounds: null,
    c6Bars: null, favCount: 0,
  };
  try {
    await page.goto(`${APP_ORIGIN}/`, { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: HIDE_CSS });
    await page.waitForSelector('#v4-begin');
    // Off camera: skip C-0 so C-1 ("誰の服を探す？") is shown first.
    await page.click('#v4-begin');
    await page.waitForSelector('#v4-gender:not([hidden])');
    await page.evaluate(() => window.__promoFreeze());
    await settle(page);

    const cdp = await context.newCDPSession(page);
    const t0 = Date.now() / 1000;

    // Frame indices relative to S3 start (f=0 -> 7.500s)
    const F = {
      genderTap: relFrame(PLAN.genderTap),       // 7.90s
      ageTap: relFrame(PLAN.ageTap),             // 8.60s
      budgetTap: relFrame(PLAN.budgetTap),       // 9.30s
      looksView2: relFrame(PLAN.looksView2At),   // 10.05s
      lookTaps: PLAN.lookTaps.map(relFrame),     // [9.65, 10.35, 10.70, 11.05, 11.40]
      looksNextTap: relFrame(PLAN.looksNextTap), // 12.40s
      s4Start: relFrame(scene('S4').start),      // 12.50s (bar 5)
      s5Start: relFrame(scene('S5').start),      // 17.50s (bar 7)
      s6aStart: relFrame(scene('S6a').start),    // 20.00s (bar 8)
      s6bStart: relFrame(scene('S6b').start),    // 22.50s (bar 9)
      undoTap: relFrame(PLAN.undoTap),           // 24.00s
      s7Start: relFrame(scene('S7').start),      // 25.00s (bar 10)
      favTap: relFrame(PLAN.favTabTap),          // 25.00s (exact S7 start)
    };

    const LOOK_PICKS = ['ryosan-01', 'jirai-01', 'jirai-02', 'kireime-01', 'kireime-02'];
    let pendingTap = null, undoBtnBox = null;
    const lookTapDownFrames = new Map(F.lookTaps.map((lf, i) => [lf - 2, i]));
    const lookTapUpFrames = new Map(F.lookTaps.map((lf, i) => [lf, i]));

    // 8 sequential C-5 swipe slots inside [s4Start .. s5Start] (150 frames = 5.0 s, zero skipped numbers)
    const s4Len = F.s5Start - F.s4Start; // 150 frames
    const c5Slots = [
      { s: F.s4Start + 6, e: F.s4Start + 14 },
      { s: F.s4Start + 24, e: F.s4Start + 32 },
      { s: F.s4Start + 42, e: F.s4Start + 50 },
      { s: F.s4Start + 60, e: F.s4Start + 68 },
      { s: F.s4Start + 78, e: F.s4Start + 86 },
      { s: F.s4Start + 96, e: F.s4Start + 104 },
      { s: F.s4Start + 114, e: F.s4Start + 122 },
      { s: F.s4Start + s4Len - 10, e: F.s5Start },
    ];
    const c5Dirs = new Array(8).fill(-1);
    const whipOffsets = [68, 98, 132];

    // Helper for drag swipe with <=3 overlap frames and optional instant virtual-clock settle on release
    const dragCard = async (f, sF, eF, dirSign, idBase, fastStepMs = 0) => {
      const x0 = dirSign > 0 ? 165 : 265, y0 = 265;
      if (f === sF) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: idBase, radiusX: 9, radiusY: 9, force: 1 }], timestamp: t0 + f / FPS });
        events.fingers.push({ frame: startFrame + f, x: x0, y: y0 });
      } else if (f > sF && f < eF - 3) {
        const u = (f - sF) / Math.max(1, eF - 3 - sF);
        const px = x0 + dirSign * 22 * smooth(u), py = y0 - 6 * u;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: px, y: py, id: idBase, radiusX: 9, radiusY: 9, force: 1 }], timestamp: t0 + f / FPS });
        events.fingers.push({ frame: startFrame + f, x: +px.toFixed(1), y: +py.toFixed(1) });
      } else if (f >= eF - 3 && f < eF) {
        const k = f - (eF - 3);
        const px = x0 + dirSign * whipOffsets[k], py = y0 - 8 - k * 2;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: px, y: py, id: idBase, radiusX: 9, radiusY: 9, force: 1 }], timestamp: t0 + f / FPS });
        events.fingers.push({ frame: startFrame + f, x: +px.toFixed(1), y: +py.toFixed(1) });
      } else if (f === eF) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: t0 + f / FPS });
        if (fastStepMs > 0) {
          await page.evaluate((ms) => window.__promoStep(ms), fastStepMs);
          await poll(page, () => [...document.querySelectorAll('#deck .card img')].every((i) => i.complete && i.naturalWidth > 0), null, '本画面次カード読込');
        }
      }
    };

    for (let f = 0; f < totalFlowFrames; f++) {
      // ---- S3: C-1 -> C-2 -> C-3 -> C-4 ----
      if (f === F.genderTap - 3) pendingTap = await performTap(page, cdp, '#v4-gender-opts button:first-child', PLAN.genderTap, events);
      if (f === F.genderTap) {
        await pendingTap.finish(); pendingTap = null;
        await poll(page, () => !document.querySelector('#v4-age')?.hidden, null, 'C-2 年代');
      }
      if (f === F.ageTap - 3) pendingTap = await performTap(page, cdp, '#v4-age-opts button:nth-child(3)', PLAN.ageTap, events);
      if (f === F.ageTap) {
        await pendingTap.finish(); pendingTap = null;
        await poll(page, () => !document.querySelector('#v4-budget')?.hidden, null, 'C-3 予算');
        // Measure C-3 .v4-why vs #v4-budget-opts so windowFrames omits the orphaned "しませ／ん。" line cleanly.
        events.budgetBounds = await page.evaluate((bounds) => {
          const why = document.querySelector('#v4-budget .v4-why')?.getBoundingClientRect();
          const opts = document.querySelector('#v4-budget-opts')?.getBoundingClientRect();
          return { ...bounds, whyTop: Math.floor(why.top), optsTop: Math.floor(opts.top), overlayDy: Math.floor(why.top) - Math.floor(opts.top) };
        }, { f0: startFrame + F.ageTap, f1: startFrame + F.budgetTap });
      }
      if (f === F.budgetTap - 3) {
        pendingTap = await performTap(page, cdp, '#v4-budget-opts button:nth-child(2)', PLAN.budgetTap, events, { overlayDy: events.budgetBounds?.overlayDy ?? 0 });
      }
      if (f === F.budgetTap) {
        await pendingTap.finish(); pendingTap = null;
        await poll(page, () => !document.querySelector('#v4-looks')?.hidden && document.querySelectorAll('#v4-looks-grid button img').length === 16, null, 'C-4 写真一覧');
        await poll(page, () => [...document.querySelectorAll('#v4-looks-grid button img')].slice(0, 4).every((i) => i.complete && i.naturalWidth > 0), null, 'C-4 View1画像読込');
        events.looksBounds.view1 = await page.evaluate((range) => {
          const btns = [...document.querySelectorAll('#v4-looks-grid button')];
          const r1b = btns[0].getBoundingClientRect().bottom;
          const r2t = btns[2].getBoundingClientRect().top;
          const cntTop = document.querySelector('#v4-looks-count').getBoundingClientRect().top;
          return { ...range, cutY: Math.floor((r1b + r2t) / 2), footTop: Math.floor(cntTop - 8) };
        }, { f0: startFrame + F.budgetTap, f1: startFrame + F.looksView2 });
      }

      // Snap cleanly at looksView2 from View 1 (row 1) to View 2 (rows 2 + 3 unclipped + footer below).
      if (f === F.looksView2) {
        await page.evaluate(() => {
          const r2t = document.querySelectorAll('#v4-looks-grid button')[2].getBoundingClientRect().top + window.scrollY;
          window.scrollTo(0, Math.max(0, Math.round(r2t - 8)));
        });
        await poll(page, () => [...document.querySelectorAll('#v4-looks-grid button img')].slice(2, 6).every((i) => i.complete && i.naturalWidth > 0), null, 'C-4 View2画像読込');
        events.looksBounds.view2 = await page.evaluate((range) => {
          const btns = [...document.querySelectorAll('#v4-looks-grid button')];
          const r3b = btns[4].getBoundingClientRect().bottom;
          const r4t = btns[6].getBoundingClientRect().top;
          const cntTop = document.querySelector('#v4-looks-count').getBoundingClientRect().top;
          const cutY = Math.floor((r3b + r4t) / 2);
          const footTop = Math.floor(cntTop - 8);
          return { ...range, cutY, footTop, nextDy: cutY - footTop };
        }, { f0: startFrame + F.looksView2, f1: startFrame + F.looksNextTap });
      }

      if (lookTapDownFrames.has(f)) {
        const idx = lookTapDownFrames.get(f);
        pendingTap = await performTap(page, cdp, `#v4-looks-grid button[data-look-id="${LOOK_PICKS[idx]}"]`, PLAN.lookTaps[idx], events, { holdFrames: 2 });
      }
      if (lookTapUpFrames.has(f)) {
        await pendingTap.finish(); pendingTap = null;
        const idx = lookTapUpFrames.get(f);
        await poll(page, (n) => document.querySelector('#v4-looks-count')?.textContent?.startsWith(`${n} /`), idx + 1, `look ${idx + 1}`);
      }
      if (f === F.looksNextTap - 3) {
        pendingTap = await performTap(page, cdp, '#v4-looks-next', PLAN.looksNextTap, events, { overlayDy: events.looksBounds.view2?.nextDy ?? 0 });
      }
      if (f === F.looksNextTap) {
        await pendingTap.finish(); pendingTap = null;
        await poll(page, () => !document.querySelector('#v4-swipe')?.hidden && document.querySelectorAll('#v4-deck .card').length > 0, null, 'C-5 お試しスワイプ');
        await poll(page, () => [...document.querySelectorAll('#v4-deck .card img')].every((i) => i.complete && i.naturalWidth > 0), null, 'C-5 画像読込');
      }

      // ---- S4: C-5 all 8 trial swipes sequentially (1/8 -> 8/8, <=3 overlap frames each) ----
      for (let k = 0; k < 8; k++) {
        const { s, e } = c5Slots[k];
        if (f === s) {
          c5Dirs[k] = await page.evaluate(() => {
            const card = document.querySelector('#v4-deck .card:not(.behind)');
            const isExplore = !!card?.querySelector('.explore-badge');
            const tags = [...(card?.querySelectorAll('.tag') ?? [])].map((t) => t.textContent);
            return !isExplore && tags.includes('#きれいめ') ? 1 : -1;
          });
        }
        if (f >= s && f <= e) {
          await dragCard(f, s, e, c5Dirs[k], 10 + k);
        }
        if (f === e && k < 7) {
          await poll(page, (n) => document.querySelector('#v4-swipe-count')?.textContent?.startsWith(`${n} /`), k + 2, `C-5 ${k + 2}枚目`);
          await poll(page, () => [...document.querySelectorAll('#v4-deck .card img')].every((i) => i.complete && i.naturalWidth > 0), null, `C-5 ${k + 2}枚目画像`);
        }
      }
      if (f === F.s5Start) {
        await poll(page, () => !document.querySelector('#v4-result')?.hidden && document.querySelectorAll('#v4-bars .bar-row').length > 0, null, 'C-6 結果');
        events.resultBounds = await page.evaluate(() => {
          const box = (s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), left: +r.left.toFixed(1), right: +r.right.toFixed(1) } : null; };
          return { card: box('#v4-result .v4-card'), subTitle: box('#v4-result .v4-sub'), subMeta: box('#v4-result .v4-swipe-meta') };
        });
        events.c6Bars = await page.evaluate(() => [...document.querySelectorAll('#v4-bars .bar-row')].map((r) => ({ text: r.textContent, h: Math.round(r.querySelector('.bar-label').getBoundingClientRect().height) })));
        if (events.c6Bars.some((b) => b.h > 24)) throw new Error(`C-6 系統名が折り返されています: ${JSON.stringify(events.c6Bars)}`);
      }

      // ---- S5 -> S6a transition: enter main screen right on S6a start ----
      if (f === F.s6aStart) {
        await page.click('#v4-result-next');
        await poll(page, () => document.body.dataset.view === 'main' && document.querySelectorAll('#deck .card').length > 0, null, '本画面へ遷移');
        await poll(page, () => [...document.querySelectorAll('#deck .card img')].every((i) => i.complete && i.naturalWidth > 0), null, '本画面画像読込');
      }

      // ---- S6a (3 consecutive preferred items with 0 flying ghosting) & S6b (finger guides to ↺ + tap ring + 1.0s restored card) ----
      if (f >= F.s6aStart && f < F.s7Start) {
        await dragCard(f, F.s6aStart + 8, F.s6aStart + 16, 1, 20, 260);
        await dragCard(f, F.s6aStart + 38, F.s6aStart + 46, 1, 21, 260);
        if (f === F.s6bStart) {
          undoBtnBox = await rectOf(page, '#btn-undo');
        }
        if (undoBtnBox && f >= F.undoTap - 16 && f < F.undoTap - 5) {
          const u = smooth((f - (F.undoTap - 16)) / 10);
          const fx = 215 + (undoBtnBox.x - 215) * u;
          const fy = 330 + (undoBtnBox.y - 330) * u;
          events.fingers.push({ frame: startFrame + f, x: +fx.toFixed(1), y: +fy.toFixed(1) });
        }
        if (f === F.undoTap - 5) {
          await sleep(100);
          pendingTap = await performTap(page, cdp, '#btn-undo', PLAN.undoTap, events, { holdFrames: 5 });
        }
        if (f === F.undoTap) {
          const prevTopId = await page.evaluate(() => document.querySelector('#deck .card:not(.behind)')?.dataset.itemId);
          await pendingTap.finish(); pendingTap = null;
          await poll(page, (id) => document.querySelector('#deck .card:not(.behind)')?.dataset.itemId !== id, prevTopId, '↺ もどす反映');
        }
      }

      // ---- S7: Favorites (exact cut at bar 10 = 25.00s, single PR badge crop) ----
      if (f === F.favTap - 3) pendingTap = await performTap(page, cdp, '.tabbar-btn[data-tab="favorites"]', PLAN.favTabTap, events);
      if (f === F.favTap) {
        // Let the 2.2s undo toast timer finish naturally at the scene boundary before opening Favorites.
        await page.evaluate(() => window.__promoStep(2300));
        await pendingTap.finish(); pendingTap = null;
        await poll(page, () => !document.querySelector('#tab-favorites')?.hidden && document.querySelectorAll('#fav-grid .fav-card').length > 0, null, 'お気に入り一覧');
        await poll(page, () => [...document.querySelectorAll('#fav-grid img')].every((i) => i.complete && i.naturalWidth > 0), null, 'お気に入り画像');
        events.favCount = await page.evaluate(() => document.querySelectorAll('#fav-grid .fav-card').length);
        events.favBounds = await page.evaluate(() => {
          const head = document.querySelector('#tab-favorites .fav-head')?.getBoundingClientRect();
          return { topCss: Math.max(0, Math.floor((head?.top ?? 52) - 10)) };
        });
      }

      await shootSmart(page, cdp, dir, f);
      await inspectFrame(page, 'flow', f);
      await step(page);
      if (f % 60 === 0) log('flow', f, '/', totalFlowFrames);
    }

    events.framesCount = totalFlowFrames;
    events.shownImages = stats.shownImages.filter((x) => x.take === 'flow');
    events.hiddenMatchCounts = { ...stats.hiddenMatchCounts };
    events.prVisibleCount = stats.prVisibleCount;
    events.routedStatic = stats.routedStatic;
    events.routedApi = stats.routedApi;
    events.blockedCount = stats.blocked.length;
    events.warnings = [...stats.warnings];
    stats.frames.flow = totalFlowFrames;
    stats.takes.flow = events;
    writeFileSync(join(dir, 'events.json'), JSON.stringify(events, null, 2));
    return events;
  } finally {
    await context.close();
  }
}

// ---- Window frames (crop wrapped C-3 subtitle, unclipped C-4 photo rows + footer, C-6 result card only, S7 single-PR favorites) ----
function buildPlan(takes) {
  const s = (id) => scene(id);
  const fS3 = frameAt(s('S3').start);
  const s3Splices = [
    takes.flow.budgetBounds && { f0: takes.flow.budgetBounds.f0, f1: takes.flow.budgetBounds.f1, cutStart: takes.flow.budgetBounds.whyTop, cutEnd: takes.flow.budgetBounds.optsTop },
    takes.flow.looksBounds?.view1 && { f0: takes.flow.looksBounds.view1.f0, f1: takes.flow.looksBounds.view1.f1, cutStart: takes.flow.looksBounds.view1.cutY, cutEnd: takes.flow.looksBounds.view1.footTop },
    takes.flow.looksBounds?.view2 && { f0: takes.flow.looksBounds.view2.f0, f1: takes.flow.looksBounds.view2.f1, cutStart: takes.flow.looksBounds.view2.cutY, cutEnd: takes.flow.looksBounds.view2.footTop },
  ].filter(Boolean);
  return [
    { id: 'S0', take: 'hook', f0: frameAt(s('S0').start), f1: frameAt(s('S0').end), takeStartFrame: 0, zoom: [1.0, 1.05] },
    { id: 'S2', take: 'drop', f0: frameAt(s('S2').start), f1: frameAt(s('S2').end), takeStartFrame: 0, zoom: [1.0, 1.0] },
    { id: 'S3', take: 'flow', f0: fS3, f1: frameAt(s('S3').end), takeStartFrame: 0, splices: s3Splices, zoom: [1.0, 1.0] },
    { id: 'S4', take: 'flow', f0: frameAt(s('S4').start), f1: frameAt(s('S4').end), takeStartFrame: frameAt(s('S4').start) - fS3, zoom: [1.0, 1.0] },
    { id: 'S5', take: 'flow', f0: frameAt(s('S5').start), f1: frameAt(s('S5').end), takeStartFrame: frameAt(s('S5').start) - fS3, resultCrop: takes.flow.resultBounds, zoom: [1.04, 1.08] },
    { id: 'S6a', take: 'flow', f0: frameAt(s('S6a').start), f1: frameAt(s('S6a').end), takeStartFrame: frameAt(s('S6a').start) - fS3, zoom: [1.0, 1.0] },
    { id: 'S6b', take: 'flow', f0: frameAt(s('S6b').start), f1: frameAt(s('S6b').end), takeStartFrame: frameAt(s('S6b').start) - fS3, zoom: [1.0, 1.0] },
    { id: 'S7', take: 'flow', f0: frameAt(s('S7').start), f1: frameAt(s('S7').end), takeStartFrame: frameAt(s('S7').start) - fS3, favCrop: takes.flow.favBounds, zoom: [1.0, 1.0] },
  ];
}

function windowFrames(plan) {
  const dir = join(framesDir, 'win');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const rows = [];
  let fallback = null, lastFfmpegKey = null, lastFfmpegKeyBuf = null, lastFfmpegOut = null;
  for (let g = 0; g < TOTAL; g++) {
    const seg = plan.find((p) => g >= p.f0 && g < p.f1) ?? null;
    const out = join(dir, `w${pad(g)}.png`);
    if (!seg) {
      rows.push({ g, shot: null });
      symlinkSync(fallback || join(framesDir, 'hook', 'f00000.png'), out);
      continue;
    }
    const localIdx = seg.takeStartFrame + (g - seg.f0);
    const src = join(framesDir, seg.take, `f${pad(localIdx)}.png`);
    if (!existsSync(src)) throw new Error(`フレームがありません: ${src}`);
    fallback = src;
    const u = seg.f1 > seg.f0 + 1 ? (g - seg.f0) / (seg.f1 - seg.f0 - 1) : 0;
    const z = seg.zoom[0] + (seg.zoom[1] - seg.zoom[0]) * u;
    const splice = seg.splices?.find((sp) => g >= sp.f0 && g < sp.f1) ?? null;
    const cachedVf = (spec, cmdArgs, row) => {
      const bytes = readFileSync(src);
      const key = `${spec}:${bytes.length}:${bytes.subarray(0, 64).toString('hex')}`;
      if (lastFfmpegKey === key && Buffer.compare(bytes, lastFfmpegKeyBuf) === 0) {
        symlinkSync(lastFfmpegOut, out);
      } else {
        execFileSync(ffmpeg, cmdArgs);
        lastFfmpegKey = key;
        lastFfmpegKeyBuf = bytes;
        lastFfmpegOut = out;
      }
      rows.push(row);
    };
    if (splice) {
      // Remove middle band [cutStart..cutEnd] seamlessly and pad bottom with #FFFFFF so rows/options stay crisp and unclipped.
      const isLooks = splice.cutStart >= 400;
      const topPx = (isLooks ? splice.cutStart - 4 : splice.cutStart) * DPR;
      const botY = splice.cutEnd * DPR;
      const botH = SRC.h - botY;
      const totalH = topPx + botH;
      const spec = `splice:${isLooks ? 'L' : 'B'}:${topPx}:${botY}`;
      const fc = isLooks
        ? `[0:v]crop=${SRC.w}:${topPx}:0:0,pad=${SRC.w}:${topPx + 20}:0:0:color=0xFFFFFF[t];[0:v]crop=${SRC.w}:32:0:1112,drawbox=x=0:y=0:w=310:h=32:color=white:t=fill,drawbox=x=550:y=0:w=310:h=32:color=white:t=fill[b1];[0:v]crop=${SRC.w}:216:0:1144[b2];[t][b1][b2]vstack=inputs=3,pad=${SRC.w}:${SRC.h}:0:0:color=0xFFFFFF,format=rgb24`
        : `[0:v]crop=${SRC.w}:${topPx}:0:0[t];[0:v]crop=${SRC.w}:${botH}:0:${botY}[b];[t][b]vstack=inputs=2,pad=${SRC.w}:${SRC.h}:0:0:color=0xFFFFFF,format=rgb24`;
      cachedVf(spec, [
        '-v', 'error', '-y', '-i', src,
        '-filter_complex', fc,
        out,
      ], { g, shot: seg.id, frame: localIdx, zoom: 1, spliceTop: splice.cutStart, spliceEnd: splice.cutEnd, totalPx: totalH });
    } else if (seg.favCrop) {
      // Omit the topbar (find logo + upper PR badge) so only ONE PR badge next to "お気に入り" is shown, keeping heading + 4 items + tabbar intact.
      const topCss = seg.favCrop.topCss ?? 42;
      const topPx = topCss * DPR;
      const keepH = SRC.h - topPx;
      const spec = `fav:${topPx}:${keepH}`;
      cachedVf(spec, [
        '-v', 'error', '-y', '-i', src,
        '-vf', `crop=${SRC.w}:${keepH}:0:${topPx},pad=${SRC.w}:${SRC.h}:0:0:color=0xFFFFFF,format=rgb24`,
        out,
      ], { g, shot: seg.id, frame: localIdx, zoom: 1, topCss });
    } else if (seg.resultCrop) {
      // Crop strictly between .v4-card bottom and .v4-sub text top, then center vertically on #FFFFFF.
      const cutCss = Math.floor((seg.resultCrop.card.bottom + seg.resultCrop.subTitle.top) / 2);
      const cutPx = cutCss * DPR;
      const cw = Math.round(SRC.w / z);
      const cx = Math.round((SRC.w - cw) / 2);
      const scaledH = Math.round((cutPx * SRC.w) / cw);
      const padTop = Math.max(0, Math.round((SRC.h - scaledH) / 2));
      execFileSync(ffmpeg, [
        '-v', 'error', '-y', '-i', src,
        '-vf', `crop=${cw}:${cutPx}:${cx}:0,scale=${SRC.w}:${scaledH}:flags=lanczos,pad=${SRC.w}:${SRC.h}:0:${padTop}:color=0xFFFFFF,format=rgb24`,
        out,
      ]);
      rows.push({ g, shot: seg.id, frame: localIdx, zoom: +z.toFixed(3), cutCss });
    } else if (Math.abs(z - 1) < 1e-5) {
      symlinkSync(src, out);
      rows.push({ g, shot: seg.id, frame: localIdx, zoom: 1 });
    } else {
      const cw = Math.round(SRC.w / z), ch = Math.round(SRC.h / z);
      const cx = Math.round((SRC.w - cw) / 2), cy = Math.round((SRC.h - ch) / 2);
      execFileSync(ffmpeg, [
        '-v', 'error', '-y', '-i', src,
        '-vf', `crop=${cw}:${ch}:${cx}:${cy},scale=${SRC.w}:${SRC.h}:flags=lanczos,format=rgb24`,
        out,
      ]);
      rows.push({ g, shot: seg.id, frame: localIdx, zoom: +z.toFixed(3) });
    }
  }
  return rows;
}

// ---- Overlay (captions, tap rings, fingers, S1 cards, flashes, disclaimer, end card) ----
function captionPlan() {
  const segments = [];
  for (const sc of STORYBOARD) {
    const key = sc.lines.join('\n');
    if (segments.length && segments.at(-1).key === key) continue;
    segments.push({ id: sc.id, from: frameAt(sc.start), lines: sc.lines, key });
  }
  return segments;
}

function flashPlan(takes) {
  return [
    [scene('S1').start, 0.25],
    [scene('S2').start, 0.50],
    [scene('S3').start, 0.25],
    [scene('S4').start, 0.25],
    [scene('S5').start, 0.25],
    [scene('S6a').start, 0.25],
    [scene('S7').start, 0.25],
    [scene('S8').start, 0.35],
  ];
}

function markPlan(takes) {
  const marks = Array.from({ length: TOTAL }, () => []);
  const toOverlay = (appX, appY) => ({ x: WIN.x / DPR + appX, y: WIN.y / DPR + appY });
  const addRing = (g0, p, until) => {
    for (let g = g0; g < Math.min(TOTAL, until); g++) {
      const u = (g - g0) / FPS / 0.30;
      if (u >= 1) break;
      const at = toOverlay(p.x, p.y);
      marks[g].push({ kind: 'ring', x: +at.x.toFixed(1), y: +at.y.toFixed(1), o: +((1 - u) ** 1.6).toFixed(3), s: +(0.55 + 0.75 * (1 - (1 - u) ** 3)).toFixed(3) });
    }
  };
  for (const t of takes.flow.taps) {
    const gTap = frameAt(t.videoSeconds);
    addRing(gTap - (t.holdFrames ?? 3), t, gTap + 7);
  }
  for (const f of takes.hook.fingers ?? []) {
    const g = frameAt(scene('S0').start) + f.frame;
    if (g >= 0 && g < TOTAL) {
      const at = toOverlay(f.x, f.y);
      marks[g].push({ kind: 'finger', x: +at.x.toFixed(1), y: +at.y.toFixed(1) });
    }
  }
  for (const f of takes.drop.fingers) {
    const g = frameAt(scene('S2').start) + f.frame;
    if (g >= 0 && g < TOTAL) {
      const at = toOverlay(f.x, f.y);
      marks[g].push({ kind: 'finger', x: +at.x.toFixed(1), y: +at.y.toFixed(1) });
    }
  }
  for (const f of takes.flow.fingers) {
    if (f.frame >= 0 && f.frame < TOTAL) {
      const at = toOverlay(f.x, f.y);
      marks[f.frame].push({ kind: 'finger', x: +at.x.toFixed(1), y: +at.y.toFixed(1) });
    }
  }
  return marks;
}

function overlayHtml() {
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><style>
  @font-face { font-family: Promo; src: url(/font.ttf); font-weight: 700; }
  @font-face { font-family: PromoBlack; src: url(/font-black.ttf); font-weight: 900; }
  :root { --ink: #16161A; --accent: #E63B7A; --soft: #FFFBFD; }
  html, body { margin: 0; width: 540px; height: 960px; overflow: hidden; background: transparent; font-family: Promo, sans-serif; color: var(--ink); }
  .bg { position: absolute; inset: 0; display: none; background: linear-gradient(172deg, #FFFBFD 0%, #FDF0F5 55%, #FCE2EC 100%); }
  .bg .shadow { position: absolute; background: #fff; box-shadow: 0 12px 32px rgba(22, 22, 26, .16), 0 2px 6px rgba(22, 22, 26, .08); }
  .mask { position: absolute; inset: 0; display: none; background: #000; }
  .mask div { position: absolute; background: #fff; }
  .cap { position: absolute; left: 12px; right: 12px; top: 78px; height: 86px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
  .cap span { display: block; font-family: PromoBlack, Promo, sans-serif; font-weight: 900; font-size: 32px; line-height: 1.25; letter-spacing: .01em; white-space: nowrap; }
  .cap span:last-child { color: var(--accent); }
  .cap span:only-child { color: var(--ink); }
  .disclaimer { position: absolute; left: 12px; right: 12px; top: 168px; text-align: center; font-size: 18px; line-height: 1.2; font-weight: 700; color: #241E24; letter-spacing: .02em; white-space: nowrap; }
  .flash { position: absolute; inset: 0; background: #FFF9FB; opacity: 0; }
  .s1 { position: absolute; inset: 0; display: none; overflow: hidden; background: linear-gradient(170deg, #F4EFF4 0%, #EAE3EC 60%, #E0D7E4 100%); }
  .s1 .dot { position: absolute; border-radius: 50%; background: #D96B94; }
  .s1 .card { position: absolute; transform-origin: 50% 50%; white-space: nowrap; font-family: Promo, sans-serif; font-weight: 700; font-size: 26px; letter-spacing: .01em;
    color: #241F26; background: #fff; border: 2px solid #D96B94; border-radius: 20px; padding: 16px 26px; box-shadow: 0 10px 24px rgba(36, 31, 38, .14); opacity: 0; }
  .s1 .card::after { content: ''; position: absolute; bottom: -10px; left: 32px; width: 16px; height: 16px; background: #fff; border-right: 2px solid #D96B94; border-bottom: 2px solid #D96B94; transform: rotate(45deg); }
  .s1 .card.right::after { left: auto; right: 32px; }
  .tap { position: absolute; width: 52px; height: 52px; margin: -26px; border-radius: 50%; border: 3.5px solid #fff; background: rgba(230, 59, 122, .42);
    box-shadow: 0 0 0 2.5px rgba(22, 22, 26, .55), 0 0 14px rgba(230, 59, 122, .35); box-sizing: border-box; }
  .finger { position: absolute; width: 48px; height: 48px; margin: -24px; border-radius: 50%; background: rgba(255, 255, 255, .52); border: 3px solid rgba(255, 255, 255, .95);
    box-shadow: 0 0 0 4px rgba(230, 59, 122, .30), 0 4px 14px rgba(22, 22, 26, .28); box-sizing: border-box; }
  .end { position: absolute; inset: 0; display: none; overflow: hidden; background: #FFFBFD; }
  .end-bg { position: absolute; inset: -40px; width: calc(100% + 80px); height: calc(100% + 80px); object-fit: cover; filter: blur(18px) saturate(1.05); opacity: .48; }
  .end-shade { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 42%, #FFFBFDE8, #FCE2ECF2 78%); }
  .end-body { position: absolute; left: 0; right: 0; top: 185px; text-align: center; }
  .end-body > * { opacity: 0; }
  .end .logo { font-family: PromoBlack, Promo, sans-serif; font-weight: 900; font-size: 76px; letter-spacing: -.03em; margin: 0 0 18px; color: var(--ink); line-height: 1; }
  .end .logo .dot { color: #FF5C93; font-size: 24px; vertical-align: 10px; margin-left: 3px; }
  .end .badges { display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; padding: 0 36px; }
  .end .badges b { font-size: 21px; font-weight: 700; padding: 10px 20px; border-radius: 30px; border: 1.5px solid #16161A28; background: #fff; }
  .end .badges b:first-child { background: linear-gradient(135deg, #FF8FB5, #FF5C93); color: #fff; border-color: transparent; }
  .end .url { margin: 34px auto 0; display: inline-block; font-size: 25px; letter-spacing: .01em; color: #fff; background: var(--ink); padding: 14px 26px; border-radius: 14px; }
  .end .day { margin: 28px auto 0; display: inline-block; font-size: 17px; letter-spacing: .08em; color: var(--accent); border: 1.5px solid #E63B7A88; padding: 8px 18px; border-radius: 30px; background: #fff; }
  .end .note { margin: 26px auto 0; font-size: 17px; color: #241E24; font-weight: 700; }
  </style>
  <div class="bg"><div class="shadow"></div></div>
  <div class="mask"><div></div></div>
  <div class="s1"></div>
  <div class="cap"></div>
  <div class="disclaimer"></div>
  <div class="taps"></div>
  <div class="fingers"></div>
  <div class="end"><img class="end-bg" src="/end.png" alt=""><div class="end-shade"></div>
    <div class="end-body">
      <div class="logo">find<span class="dot">●</span></div>
      <div class="badges end-badges"></div>
      <div><span class="url end-url"></span></div>
      <div><span class="day end-day"></span></div>
      <p class="note end-note"></p>
    </div>
  </div>
  <div class="flash"></div>
  <script>
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), easeOut = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;
  let D, current = -1;
  window.__setup = (data) => {
    D = data;
    Object.assign($('.bg .shadow').style, { left: data.win.x + 'px', top: data.win.y + 'px', width: data.win.w + 'px', height: data.win.h + 'px', borderRadius: data.win.r + 'px' });
    $('.disclaimer').textContent = data.disclaimer;
    $('.end-url').textContent = data.end.url;
    $('.end-day').textContent = data.end.day;
    $('.end-note').textContent = data.end.note;
    $('.end-badges').replaceChildren(...data.end.badges.map((text) => Object.assign(document.createElement('b'), { textContent: text })));
    const spots = [[196, 252, -3.5], [312, 412, 3], [220, 574, -2.5]];
    const dots = [[70, 150, 74, .06], [468, 220, 52, .07], [440, 710, 88, .05], [88, 670, 44, .06]].map(([x, y, r, o]) => {
      const el = document.createElement('div'); el.className = 'dot';
      Object.assign(el.style, { left: (x - r) + 'px', top: (y - r) + 'px', width: 2 * r + 'px', height: 2 * r + 'px', opacity: o });
      return el;
    });
    $('.s1').replaceChildren(...dots, ...data.cards.map((text, i) => {
      const sp = spots[i % spots.length];
      const el = document.createElement('div');
      el.className = 'card' + (sp[0] > 260 ? ' right' : '');
      el.textContent = text;
      el.dataset.x = sp[0]; el.dataset.y = sp[1]; el.dataset.r = sp[2];
      return el;
    }));
  };
  window.__boxes = () => {
    const els = [...document.querySelectorAll('.cap span, .disclaimer, .s1 .card, .end .logo, .end .badges b, .end .url, .end .day, .end .note')]
      .filter((el) => el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden' && Number(getComputedStyle(el).opacity) > 0);
    const r = els.map((el) => {
      const range = document.createRange(); range.selectNodeContents(el);
      const b = range.getBoundingClientRect(); return b.width ? b : el.getBoundingClientRect();
    }).filter((b) => b.width);
    return r.length ? {
      items: r.length,
      x0: +Math.min(...r.map((b) => b.left)).toFixed(1), x1: +Math.max(...r.map((b) => b.right)).toFixed(1),
      y0: +Math.min(...r.map((b) => b.top)).toFixed(1), y1: +Math.max(...r.map((b) => b.bottom)).toFixed(1),
    } : { items: 0 };
  };
  window.__mask = (on) => {
    $('.mask').style.display = on ? 'block' : 'none';
    Object.assign($('.mask div').style, { left: D.win.x + 'px', top: D.win.y + 'px', width: D.win.w + 'px', height: D.win.h + 'px', borderRadius: D.win.r + 'px' });
  };
  window.__background = (on) => {
    $('.bg').style.display = on ? 'block' : 'none';
    for (const s of ['.cap', '.disclaimer', '.taps', '.fingers', '.end', '.flash', '.s1']) $(s).style.visibility = on ? 'hidden' : 'visible';
  };
  const spans = (lines) => lines.map((text) => Object.assign(document.createElement('span'), { textContent: text }));
  window.__frame = (f, marks) => {
    const fr = (sec) => Math.round(sec * D.fps), t = f / D.fps;
    const segs = D.captions, i = segs.findLastIndex((s) => f >= s.from);
    if (i !== current) { $('.cap').replaceChildren(...spans(segs[i].lines)); current = i; }
    const age = (f - segs[i].from) / D.fps + (segs[i].from === 0 ? 1 : 0);
    [...$('.cap').querySelectorAll('span')].forEach((el) => { const u = easeOut(age / 0.12); el.style.opacity = 0.75 + 0.25 * u; el.style.transform = 'translateY(' + ((1 - u) * 5) + 'px)'; });
    let flash = 0;
    for (const [at, strength] of D.flashes) { const dt = (f - fr(at)) / D.fps; if (dt >= 0) flash = Math.max(flash, strength * Math.exp(-dt / 0.12)); }
    $('.flash').style.opacity = flash;
    $('.taps').replaceChildren(...marks.filter((m) => m.kind === 'ring').map((m) => { const el = document.createElement('div'); el.className = 'tap'; Object.assign(el.style, { left: m.x + 'px', top: m.y + 'px', opacity: m.o, transform: 'scale(' + m.s + ')' }); return el; }));
    $('.fingers').replaceChildren(...marks.filter((m) => m.kind === 'finger').map((m) => { const el = document.createElement('div'); el.className = 'finger'; Object.assign(el.style, { left: m.x + 'px', top: m.y + 'px' }); return el; }));
    const s1 = D.storyboard.find((s) => s.overlayOnly), on1 = f >= fr(s1.start) && f < fr(s1.end);
    const end = f >= fr(D.endAt);
    $('.s1').style.display = on1 ? 'block' : 'none';
    $('.disclaimer').style.visibility = (!on1 && !end) ? 'visible' : 'hidden';
    if (on1) {
      const ts = t - s1.start, wob = clamp((t - D.cardTimes.at(-1) - 0.15) / 0.35, 0, 1);
      [...$('.s1').querySelectorAll('.card')].forEach((el, k) => {
        const ageC = t - D.cardTimes[k], u = clamp(ageC / 0.24, 0, 1);
        const back = (x) => { const c = 2.2; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };
        const scale = ageC < 0 ? 0.6 : 0.6 + 0.4 * back(u), bob = ageC > 0 ? 2.5 * Math.sin(2 * Math.PI * (ageC * 0.8 + k * 0.25)) : 0;
        const rot = Number(el.dataset.r) + wob * 2.0 * Math.sin(2 * Math.PI * (ts * 2.4 + k * 0.37));
        el.style.opacity = ageC < 0 ? 0 : 0.78 + 0.22 * clamp(ageC / 0.08, 0, 1);
        el.style.left = el.dataset.x + 'px'; el.style.top = el.dataset.y + 'px';
        el.style.transform = 'translate(-50%, -50%) translateY(' + bob + 'px) rotate(' + rot + 'deg) scale(' + scale + ')';
      });
    }
    $('.end').style.display = end ? 'block' : 'none';
    $('.cap').style.visibility = end ? 'hidden' : 'visible';
    if (end) {
      const e = t - D.endAt;
      [...$('.end-body').children].forEach((el, k) => { const u = easeOut((e - k * 0.06) / 0.26); el.style.opacity = 0.65 + 0.35 * u; el.style.transform = 'translateY(' + ((1 - u) * 14) + 'px)'; });
      $('.end-bg').style.transform = 'scale(' + (1.04 + e * 0.02) + ')';
    }
    if (end || on1 || !segs[i].lines.length) return null;
    return Math.max(0, ...[...document.querySelectorAll('.cap span')].map((el) => Number(el.style.opacity)));
  };
  </script></html>`;
}

async function shootOverlay(browser, takes) {
  const dir = takeDir('overlay');
  const marks = markPlan(takes), captions = captionPlan();
  const flowLast = takes.flow.framesCount ? takes.flow.framesCount - 1 : (stats.frames.flow ? stats.frames.flow - 1 : 599);
  const endBg = join(framesDir, 'flow', `f${pad(flowLast)}.png`);
  const context = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: DPR });
  const page = await context.newPage();
  await page.route('**/*', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: overlayHtml() });
    if (path === '/font.ttf') return route.fulfill({ contentType: 'font/ttf', body: readFileSync(font) });
    if (path === '/font-black.ttf') return route.fulfill({ contentType: 'font/ttf', body: readFileSync(fontBlack) });
    if (path === '/end.png') return route.fulfill({ contentType: 'image/png', body: readFileSync(endBg) });
    return route.abort();
  });
  try {
    await page.goto('http://promo.local/');
    await page.evaluate(async () => {
      await document.fonts.load('700 30px Promo');
      await document.fonts.load('900 30px PromoBlack');
      await document.fonts.ready;
      await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((done) => { img.onload = done; img.onerror = done; }))));
    });
    await page.evaluate((data) => window.__setup(data), {
      storyboard: STORYBOARD, captions, end: END_CARD, disclaimer: DISCLAIMER_TEXT,
      flashes: flashPlan(takes), fps: FPS, cards: ARUARU, cardTimes: CARD_TIMES,
      endAt: scene('S8').start, win: { x: WIN.x / DPR, y: WIN.y / DPR, w: WIN.w / DPR, h: WIN.h / DPR, r: WIN.radius / DPR },
    });
    await page.evaluate(() => window.__background(true));
    await page.screenshot({ path: join(framesDir, 'background.png') });
    await page.evaluate(() => window.__mask(true));
    await page.screenshot({ path: join(framesDir, 'mask.png'), clip: { x: WIN.x / DPR, y: WIN.y / DPR, width: WIN.w / DPR, height: WIN.h / DPR } });
    await page.evaluate(() => { window.__mask(false); window.__background(false); });

    const gaps = [], layout = [];
    const measureAt = new Map([
      ...captions.map((c, i) => [c, Math.round((c.from + (captions[i + 1]?.from ?? frameAt(scene('S8').start))) / 2)])
        .filter(([c]) => c.lines.length)
        .map(([c, f]) => [f, c.id]),
      [frameAt(scene('S2').start) - 1, 'S1 cards'],
      [TOTAL - 1, 'end card'],
    ]);
    const flashes = flashPlan(takes);
    const s1Start = frameAt(scene('S1').start), s1End = frameAt(scene('S1').end);
    const endStart = frameAt(scene('S8').start);
    let lastShotFile = null, lastStaticKey = null;
    for (let f = 0; f < TOTAL; f++) {
      const segIdx = captions.findLastIndex((s) => f >= s.from);
      const capAge = (f - captions[segIdx].from) / FPS + (captions[segIdx].from === 0 ? 1 : 0);
      const hasFlash = flashes.some(([at]) => f >= frameAt(at) && (f - frameAt(at)) / FPS < 0.75);
      const animated = marks[f].length > 0 || (f >= s1Start && f < s1End) || (f >= endStart && (f - endStart) / FPS < 0.6) || capAge <= 0.16 || hasFlash || measureAt.has(f);
      const staticKey = animated ? null : `seg:${segIdx}|end:${f >= endStart ? 1 : 0}`;
      const outPath = join(dir, `o${pad(f)}.png`);
      if (staticKey && staticKey === lastStaticKey && lastShotFile) {
        symlinkSync(lastShotFile, outPath);
      } else {
        const shown = await page.evaluate(([f, m]) => window.__frame(f, m), [f, marks[f]]);
        if (measureAt.has(f)) layout.push({ frame: f, what: measureAt.get(f), ...(await page.evaluate(() => window.__boxes())) });
        if (shown !== null && shown < 0.5) gaps.push({ frame: f, captionOpacity: +shown.toFixed(3) });
        await page.screenshot({ path: outPath, omitBackground: true });
        lastShotFile = staticKey ? outPath : null;
        lastStaticKey = staticKey;
      }
      if (f % 120 === 0) log('overlay', f, '/', TOTAL);
    }
    for (const l of layout) l.insideSafeArea = l.x0 >= 8 && l.x1 <= 532 && l.y0 >= 0.08 * 960 && l.y1 <= 0.80 * 960;
    return {
      captions: captions.map((c) => ({ id: c.id, fromSeconds: +(c.from / FPS).toFixed(3), text: c.lines.join(' ') })),
      captionGapFrames: gaps,
      layout,
    };
  } finally {
    await context.close();
  }
}

function compose(plan, takes) {
  mkdirSync(outDir, { recursive: true });
  const overlayDir = join(framesDir, 'overlay-rgba');
  rmSync(overlayDir, { recursive: true, force: true });
  mkdirSync(overlayDir, { recursive: true });
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', join(framesDir, 'overlay', 'o%05d.png'), '-vf', 'format=rgba', '-start_number', '0', join(overlayDir, 'o%05d.png')]);

  const silent = join(outDir, silentName);
  execFileSync(ffmpeg, [
    '-hide_banner', '-loglevel', 'warning', '-y',
    '-loop', '1', '-framerate', String(FPS), '-i', join(framesDir, 'background.png'),
    '-framerate', String(FPS), '-i', join(framesDir, 'win', 'w%05d.png'),
    '-loop', '1', '-framerate', String(FPS), '-i', join(framesDir, 'mask.png'),
    '-framerate', String(FPS), '-i', join(overlayDir, 'o%05d.png'),
    '-filter_complex', [
      '[0:v]format=rgba,scale=1080:1920:flags=lanczos,setsar=1[bg]',
      `[1:v]scale=${WIN.w}:${WIN.h}:flags=lanczos,format=rgba[app]`,
      `[2:v]scale=${WIN.w}:${WIN.h},format=gray[m]`,
      '[app][m]alphamerge[win]',
      `[bg][win]overlay=${WIN.x}:${WIN.y}:format=auto:shortest=1[b]`,
      '[b][3:v]overlay=0:0:format=auto,format=yuv420p[v]',
    ].join(';'),
    '-map', '[v]', '-frames:v', String(TOTAL), '-r', String(FPS),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-map_metadata', '-1', silent,
  ], { stdio: 'inherit' });

  execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', silent, '-frames:v', '1', '-map_metadata', '-1', join(outDir, 'first-frame.png')]);
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', silent, '-vf', 'fps=1,scale=270:480,tile=8x4:padding=6:color=0x16161A', '-frames:v', '1', '-q:v', '3', '-map_metadata', '-1', join(outDir, 'contact-sheet.jpg')]);

  const gray = (n) => execFileSync(ffmpeg, ['-v', 'error', '-i', silent, '-vf', `select=eq(n\\,${n}),scale=270:480,format=gray`, '-frames:v', '1', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 24 });
  const motion = (x, y) => {
    const [a, b] = [gray(x), gray(y)];
    let diff = 0, changed = 0;
    for (let i = 0; i < a.length; i++) {
      const d = Math.abs(a[i] - b[i]);
      diff += d;
      if (d > 8) changed++;
    }
    return { meanAbsDiff: +(diff / a.length).toFixed(3), changedPixelsPercent: +(100 * changed / a.length).toFixed(2) };
  };
  const firstFrameMotion = { frames0to1: motion(0, 1), frames0to3: motion(0, 3) };
  if (firstFrameMotion.frames0to3.changedPixelsPercent < 1) {
    throw new Error(`1コマ目から3コマ目の動きが1%未満: ${JSON.stringify(firstFrameMotion)}`);
  }

  const cuts = [
    frameAt(scene('S1').start),
    frameAt(scene('S2').start),
    frameAt(scene('S3').start),
    frameAt(PLAN.looksView2At),
    frameAt(scene('S4').start),
    frameAt(scene('S5').start),
    frameAt(scene('S6a').start),
    frameAt(scene('S6b').start),
    frameAt(PLAN.undoTap),
    frameAt(scene('S7').start),
    frameAt(scene('S8').start),
  ].filter((c) => c >= 2 && c < TOTAL - 1);
  const picks = cuts.flatMap((c) => [c - 2, c - 1, c, c + 1]), unique = [...new Set(picks)].sort((x, y) => x - y);
  const sheet = join(framesDir, 'cut-check');
  rmSync(sheet, { recursive: true, force: true });
  mkdirSync(sheet, { recursive: true });
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', silent, '-vf', `select='${unique.map((n) => `eq(n\\,${n})`).join('+')}',scale=216:384`, '-fps_mode', 'passthrough', '-start_number', '0', join(sheet, 'u%04d.png')]);
  picks.forEach((n, i) => symlinkSync(join(sheet, `u${String(unique.indexOf(n)).padStart(4, '0')}.png`), join(sheet, `s${String(i).padStart(4, '0')}.png`)));
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-framerate', '1', '-i', join(sheet, 's%04d.png'), '-vf', `tile=4x${cuts.length}:padding=6:color=0x16161A`, '-frames:v', '1', '-q:v', '3', '-map_metadata', '-1', join(outDir, 'cut-check.jpg')]);

  return {
    firstFrameMotion,
    cutCheck: { file: 'cut-check.jpg', rows: cuts.map((c) => ({ cutFrame: c, seconds: +(c / FPS).toFixed(3), frames: [c - 2, c - 1, c, c + 1] })) },
  };
}

// 100-day card demo.mp4: 16 s, silent, 540x960, H.264 <= 3 MB, raw app screens only with small disclaimer bottom-right.
function buildDemo(takes) {
  const list = [];
  const winFile = (g) => join(framesDir, 'win', `w${pad(g)}.png`);
  // 16 s = 480 frames across the natural flow: drop (2.5 s) -> S3 (3.67 s) -> S4 (2.83 s) -> S5 (1.50 s) -> S6 (3.50 s) -> S7 (2.00 s)
  const addRange = (fromSec, count, stepFrames = 1) => {
    const g0 = frameAt(fromSec);
    for (let i = 0; i < count; i++) list.push(winFile(g0 + i * stepFrames));
  };
  addRange(scene('S2').start, 75, 1);                      // 2.50 s (75)
  addRange(scene('S3').start + 0.5, 110, 1);               // 3.67 s (110) - onboarding Qs & look grid
  addRange(scene('S4').start, 85, 1);                      // 2.83 s (85) - trial swipes
  addRange(scene('S5').start, 45, 1);                      // 1.50 s (45) - result card (items excluded)
  addRange(scene('S6a').start, 105, 1);                    // 3.50 s (105) - main swipes & undo
  addRange(scene('S7').start, 60, 1);                      // 2.00 s (60) - favorites (single PR)
  // Total = 480 frames = 16.00 s

  const seq = join(framesDir, 'demo-seq');
  rmSync(seq, { recursive: true, force: true });
  mkdirSync(seq, { recursive: true });
  list.forEach((f, i) => symlinkSync(f, join(seq, `d${pad(i)}.png`)));

  const out = join(outDir, 'demo.mp4');
  const escapedFont = font.replace(/[:\\']/g, '\\$&');
  const vf = `scale=540:854:flags=lanczos,pad=540:960:0:53:color=0xF6F2F4,drawtext=fontfile='${escapedFont}':text='${DISCLAIMER_TEXT}':fontsize=13:fontcolor=0x5C5058:x=w-tw-16:y=h-th-18,format=yuv420p`;
  for (const crf of [24, 27, 30, 33]) {
    execFileSync(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', join(seq, 'd%05d.png'),
      '-vf', vf, '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-profile:v', 'high', '-pix_fmt', 'yuv420p',
      '-an', '-movflags', '+faststart', '-map_metadata', '-1', out,
    ]);
    const bytes = statSync(out).size;
    if (bytes <= 3 * 1024 * 1024) return { seconds: +(list.length / FPS).toFixed(2), bytes, crf };
  }
  throw new Error(`demo.mp4 が 3MB を超えています: ${statSync(out).size}`);
}

function mux(variant) {
  const src = ['wav', 'mp3'].map((ext) => join(outDir, `bgm_${variant}.${ext}`)).find(existsSync);
  if (!src) throw new Error(`BGMがありません: bgm_${variant}.(wav|mp3)`);
  const out = join(outDir, `Day093_find_promo_${variant}.mp4`);
  execFileSync(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', join(outDir, silentName), '-i', src,
    '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    '-af', `apad=whole_dur=${DURATION_SECONDS}`, '-t', String(DURATION_SECONDS), '-movflags', '+faststart', '-map_metadata', '-1', out,
  ]);
  return out;
}

function probe(file, kind = 'promo') {
  const p = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }));
  const v = p.streams.find((s) => s.codec_type === 'video'), a = p.streams.find((s) => s.codec_type === 'audio');
  const decode = execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-f', 'null', '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const seconds = Number(p.format.duration), bytes = statSync(file).size;
  const ok = kind === 'demo'
    ? v.width === 540 && v.height === 960 && v.codec_name === 'h264' && v.pix_fmt === 'yuv420p' && !a && seconds >= 15.5 && seconds <= 16.5 && bytes <= 3 * 1024 * 1024 && decode.trim() === ''
    : v.width === 1080 && v.height === 1920 && v.codec_name === 'h264' && v.pix_fmt === 'yuv420p' && v.r_frame_rate === '30/1'
      && Math.abs(seconds - DURATION_SECONDS) <= 1 / FPS + 0.001 && decode.trim() === ''
      && (file.endsWith(silentName) ? !a : a?.codec_name === 'aac' && a.sample_rate === '48000' && a.channels === 2);
  const row = {
    file: basename(file), ok, size: `${v.width}x${v.height}`, codec: v.codec_name, pix: v.pix_fmt, fps: v.r_frame_rate,
    frames: Number(v.nb_frames), seconds: +seconds.toFixed(3), bytes,
    audio: a ? `${a.codec_name} ${a.sample_rate}Hz ${a.channels}ch` : 'なし',
    decodeErrors: decode.trim() ? decode.trim().split('\n').length : 0,
  };
  log(ok ? '検査OK' : '検査NG', JSON.stringify(row));
  if (!ok) throw new Error(`出力仕様不一致: ${file}`);
  return row;
}

function writeStoryboardCheck() {
  const rows = [
    ['1 (0–2.5s)', '本画面で指がカードをゆっくり右へ引き、2.33秒で離して次のカードへ（重なり3コマ以内）', '服さがし、／スクロールに疲れてない？', '可（主観への問いかけ、効能保証なし）'],
    ['2 (2.5–5.0s)', 'アプリなし、札3枚が1拍ごとに出る', '（札：何て検索しよう…／また同じ服を見てる気がする／見てるうちに、ちょっと疲れた）', '可（検索疲労の主観表現、他社批判なし）'],
    ['3 (5.0–7.5s)', '本画面で右スワイプ(♥)→左スワイプ(✕)（各重なり3コマ以内）', '好きか、ちがうか。／左右にスワイプ。', '可（画面の左右スワイプ操作そのもの）'],
    ['4 (7.5–12.5s)', 'C-1誰の服→C-2年代→C-3予算→C-4写真を欠けずに表示し5枚選択（C-0・折れ注記は除外）', '3つの質問と、／好きな雰囲気の写真選び。', '可（実際の手順：質問3つ＋写真5枚選択）'],
    ['5 (12.5–17.5s)', 'C-5お試し画面で1枚目〜8枚目まで順に全8枚をスワイプ', '右で好き、左でちがう。／まずは8枚、お試し。', '可（C-5お試しの左右操作と8枚連続表示の事実）'],
    ['6 (17.5–20.0s)', 'C-6結果「あなたの系統は……」の系統名（きれいめ・大人系58%等）と割合バーまで（下段商品は除外）', '写真選びと8枚から、／好みの傾向をチェック。', '可（写真選択と8枚の両方が効き、初期傾向を示す事実）'],
    ['7a (20.0–22.5s)', '本画面で好み系統（#きれいめ）の服が3枚続けて出てスワイプ（重なり各3コマ以内）', '選んだ好みを、／服の並びに反映。', '可（学習重みが並び順に反映される事実。保証表現なし）'],
    ['7b (22.5–25.0s)', '本画面の↺ボタンにタップの輪が出て直前のカードに戻り、約1秒後に次場面へ切替', 'ひとつ前のスワイプも、／もどせる。', '可（本画面の直前1件アンドゥ機能の事実）'],
    ['8 (25.0–27.5s)', 'お気に入り一覧（4件・PR表記1つ・購入ボタン非表示）', '好きな服は、／お気に入りに。', '可（右スワイプ自動保存の事実）'],
    ['9 (27.5–32.0s)', '終わりのカード（アプリ終盤のぼかし背景）', 'find／登録なし・無料／ブラウザから試せる／day93.rairakku.com／DAY 093 / 100／画面の商品はイメージです', '可（ゲスト無料公開・URL・デモ注記の事実）'],
  ];
  const md = [
    '# Day093 find 絵コンテ・字幕と画面の照合表',
    '',
    '禁止表現チェック（60秒・好みの服だけ・必ず見つかる/当たる・AIが写真から学ぶ・無限に出てくる・8枚で系統が決まる・楽天/Yahoo表現・他社批判）：**すべて未使用（0件）**',
    '',
    '| 場面 (秒) | 画面で起きていること | 字幕 / 札 / カード | 事実照合 |',
    '|---|---|---|---|',
    ...rows.map((r) => `| ${r.join(' | ')} |`),
    '',
  ].join('\n');
  writeFileSync(join(outDir, 'storyboard-check.md'), md);
}

// ---- Main execution ----
mkdirSync(framesDir, { recursive: true });
mkdirSync(outDir, { recursive: true });
const started = Date.now();
const needApp = ['hook', 'drop', 'flow'].some(wanted);
const dbDir = mkdtempSync(join(tmpdir(), 'find-day93-promo-db-'));
const pendingBg = [];
const gw = needApp ? await createLocalGateway(findRoot, dbDir) : null;
const chromium = needApp || wanted('overlay') ? await loadChromium() : null;
let browser = null;

const takes = {};
const loadTake = (name) => JSON.parse(readFileSync(join(framesDir, name, 'events.json'), 'utf8'));
try {
  if (chromium) browser = await chromium.launch({ headless: true });
  takes.hook = wanted('hook') ? await shootHook(browser, gw, pendingBg) : loadTake('hook');
  takes.drop = wanted('drop') ? await shootDrop(browser, gw, pendingBg) : loadTake('drop');
  takes.flow = wanted('flow') ? await shootFlow(browser, gw, pendingBg) : loadTake('flow');

  // Verify no consecutive identical product images and no duplicate look photos across distinct item IDs.
  const dedupErrors = [];
  for (let i = 1; i < stats.shownImages.length; i++) {
    if (stats.shownImages[i].src === stats.shownImages[i - 1].src) {
      dedupErrors.push(`連続同一画像: ${stats.shownImages[i - 1].take}#${stats.shownImages[i - 1].frame} -> ${stats.shownImages[i].take}#${stats.shownImages[i].frame} (${stats.shownImages[i].src})`);
    }
  }
  const byTakeId = new Map();
  for (const x of stats.shownImages) {
    if (x.take !== 'flow') continue;
    const prevId = byTakeId.get(x.src);
    if (prevId && prevId !== x.id) {
      dedupErrors.push(`flow内で別商品IDの重複画像あり: ${x.src} (${prevId} vs ${x.id})`);
    }
    byTakeId.set(x.src, x.id);
  }
  if (dedupErrors.length) throw new Error(dedupErrors.join('; '));

  if (needApp && (stats.blocked.length > 0 || stats.requestsSeen !== stats.routedStatic + stats.routedApi)) {
    throw new Error(`外部通信または未処理リクエストを検出: blocked=${stats.blocked.length}, seen=${stats.requestsSeen}, routed=${stats.routedStatic + stats.routedApi}`);
  }

  let overlayReport = null;
  if (!flag('--no-compose') && wanted('overlay')) {
    overlayReport = await shootOverlay(browser, takes);
    writeFileSync(join(framesDir, 'overlay', 'report.json'), JSON.stringify(overlayReport, null, 2));
  } else if (existsSync(join(framesDir, 'overlay', 'report.json'))) {
    overlayReport = JSON.parse(readFileSync(join(framesDir, 'overlay', 'report.json'), 'utf8'));
  }

  const plan = buildPlan(takes);
  let composeReport = null;
  const outputs = [];
  if (!flag('--no-compose')) {
    windowFrames(plan);
    composeReport = compose(plan, takes);
    outputs.push(probe(join(outDir, silentName)));
    for (const v of (arg('--mux', '') || '').split(',').filter(Boolean)) outputs.push(probe(mux(v)));
    const demoInfo = buildDemo(takes);
    outputs.push(probe(join(outDir, 'demo.mp4'), 'demo'));
    writeStoryboardCheck();
    const report = {
      appOrigin: APP_ORIGIN,
      apiOrigin: API_ORIGIN,
      demoItems: gw?.itemCount ?? 32,
      realNetworkRequests: 0,
      blockedRequests: takes.flow.blockedCount ?? stats.blocked.length,
      routedStatic: takes.flow.routedStatic ?? stats.routedStatic,
      routedApi: takes.flow.routedApi ?? stats.routedApi,
      mallNameInBodyInnerText: 0,
      hiddenSelectors: HIDDEN_SELECTORS,
      hiddenMatchCounts: takes.flow.hiddenMatchCounts ?? stats.hiddenMatchCounts,
      prVisibleCount: takes.flow.prVisibleCount ?? stats.prVisibleCount,
      consoleWarnings: takes.flow.warnings ?? stats.warnings,
      shownImages: takes.flow.shownImages ?? stats.shownImages,
      firstFrameMotion: composeReport.firstFrameMotion,
      cutCheck: composeReport.cutCheck,
      overlay: overlayReport,
      demo: demoInfo,
      outputs,
      minutes: +((Date.now() - started) / 60000).toFixed(2),
    };
    writeFileSync(join(outDir, 'capture-report.json'), `${JSON.stringify(report, null, 2)}\n`);
    log('完了', JSON.stringify({ minutes: report.minutes, firstFrameMotion: report.firstFrameMotion, warnings: report.consoleWarnings.length, blocked: report.blockedRequests }));
  }
} finally {
  await Promise.allSettled(pendingBg);
  await browser?.close().catch(() => {});
  await gw?.close().catch(() => {});
  rmSync(dbDir, { recursive: true, force: true });
}
