// Day088 "Bouquet Studio" promo video (vertical 1080x1920, 30 fps, 32 s), shot frame by frame from the real app.
// The page clock (requestAnimationFrame, performance.now, Date.now, setTimeout, CSS/Web Animations) is frozen and advanced
// by 1/30 s per frame, so the 3D flowers, the falling petals and the gift's opening are captured without dropped frames.
// The app is shown in a rounded window (0.8x, the same 864x1320 rectangle in every scene) on a soft gradient; captions sit in the
// band above it. The app runs under its production address (https://day88.rairakku.com): every request to that origin is answered
// from the local build by the route handler, and nothing reaches the network, so the link in the finished screen is the real one.
// Captions, tap rings, the finger, the S1 question cards and the end card are frames composited by ffmpeg. Push-ins and the short
// "pop" on a tap are crops of the real frames (a camera), never drawn into the app.
//
// Usage (the built site is served read-only by the app's own scripts/serve.mjs):
//   node render-promo.mjs --site-dir <built site> --app-dir <app repo> --frames-dir <work dir> --out-dir <output dir>
//   --photo <jpg>                      the photo put behind the bouquet in S4 (or PROMO_PHOTO)
//   --only studio,gift,overlay,cards   re-shoot only these (others reuse earlier frames; gift needs the studio's link)
//   --compose-only                     no shooting, only compositing and encoding
//   --no-compose                       shoot only
//   --mux a,b                          also mux <out-dir>/bgm_{a,b}.(wav|mp3) into Day088_bouquet-studio_promo_{a,b}.mp4
// Paths can also come from PROMO_SITE_DIR / PROMO_APP_DIR / PROMO_FRAMES_DIR / PROMO_OUT_DIR. Fonts: PROMO_FONT, PROMO_FONT_BLACK.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { APP_ORIGIN, BAR, BEAT, DOUBTS, DURATION_SECONDS, END_CARD, GIFT, HOOK, PHOTO, STORYBOARD, STUDIO_ACTIONS, STUDIO_CAMERA, STUDIO_PRESET_TAB, STUDIO_START, TAP_CUES, MUSIC_CUES, bar } from './timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const flag = (name) => process.argv.includes(name);
const need = (value, what) => { if (!value) throw new Error(`${what} を指定してください（引数か環境変数）`); return resolve(value); };
const siteDir = need(arg('--site-dir', process.env.PROMO_SITE_DIR), '--site-dir');
const appDir = need(arg('--app-dir', process.env.PROMO_APP_DIR), '--app-dir');
const framesDir = need(arg('--frames-dir', process.env.PROMO_FRAMES_DIR), '--frames-dir');
const outDir = need(arg('--out-dir', process.env.PROMO_OUT_DIR), '--out-dir');
const photoFile = resolve(arg('--photo', process.env.PROMO_PHOTO) || '');
const font = process.env.PROMO_FONT || join(homedir(), 'Library/Fonts/ZenKakuGothicNew-Bold.ttf');
const fontBlack = process.env.PROMO_FONT_BLACK || join(homedir(), 'Library/Fonts/ZenKakuGothicNew-Black.ttf');
const { chromium } = await import(pathToFileURL(join(appDir, 'node_modules/playwright/index.mjs')).href);
const FPS = 30, TOTAL = Math.round(DURATION_SECONDS * FPS);
// The app window inside the 1080x1920 frame (output pixels): 0.8x, rounded, low in the frame; captions above it.
// One rectangle for every scene (x=108, y=380, 864x1320, bottom edge 1700).
const WIN = { x: 108, y: 380, w: 864, h: 1320, radius: 40, scale: 0.8 };
const DPR = 2, APP_H = Math.round(WIN.h / WIN.scale / DPR);   // 825 CSS px of app fill the window
// The Studio is shot at CSS 540x825, so it fills the window as it is.
const VIEW = { width: 540, height: APP_H };
// The gift page is shot at CSS 540x960 (its own layout) and shown down to CSS y=825: the gap between the line under the message
// card and the page footer (the app's own share buttons and a long note), so no cut text line sits on the window edge.
const GIFT_VIEW = { width: 540, height: 960 }, GIFT_CUT_CSS = APP_H;
const SRC = { w: VIEW.width * DPR, h: APP_H * DPR };   // every window frame is 1080x1650 before the 0.8x scale
const port = Number(arg('--port', 4688));
const base = `http://127.0.0.1:${port}`;
const frameAt = (seconds) => Math.round(seconds * FPS);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
if (!existsSync(join(siteDir, 'index.html')) || !existsSync(join(siteDir, 'gift/index.html'))) throw new Error(`--site-dir は公開用ビルド（index.html と gift/ を含む）を指す: ${siteDir}`);
const needPhoto = () => { if (!existsSync(photoFile) || !statSync(photoFile).isFile()) throw new Error(`背景の写真を --photo（か PROMO_PHOTO）で渡してください: ${photoFile}`); };

// Takes. S1 has no app (overlay only). The Studio runs from just before bar 2 until the cut to the gift; the gift take (the link
// made in the Studio) is shot from its own t=0 and mapped in compose() once the real opening frame is known. The hook (S0) is a
// slice of the same gift take, just after its opening starts.
const CUT_FRAME = frameAt(GIFT.cutInAt), OPEN_FRAME = frameAt(GIFT.openAt), END_FRAME = frameAt(GIFT.revealEnd);
const HOOK_END = frameAt(bar(1)), HOOK_SLICE = frameAt(HOOK.sliceFromOpen);
const TAKES = { studio: { from: frameAt(STUDIO_START), to: CUT_FRAME } };
const only = (arg('--only', '') || '').split(',').filter(Boolean);
const wanted = (take) => !flag('--compose-only') && (!only.length || only.includes(take));
// The plain variant (--no-camera): the real screen is never cropped or zoomed (no drag push-in, tap pop or card-reading move), so no
// button or line is ever cut by the window; only the hook keeps its slow push-in. Use a separate --out-dir and shoot the overlay again.
const NO_CAMERA = flag('--no-camera');

// ---- Frozen page clock (installed before any page script). __promoFreeze stops it, __promoStep(ms) advances it. ----
// Until the freeze, Date.now() returns a fixed value: the Studio seeds its mood arrangements from Date.now() at start-up,
// so a fixed value gives the same "かわいい" bouquet on every run.
const FIXED_EPOCH = 1762560000000;
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
// The gift page starts its 1.8 s auto-open timer as soon as it is visible. Loading and the 3D set-up run in real time,
// so the page reports 'hidden' (document.visibilityState only; the 3D renderer reads document.hidden and keeps drawing)
// until the clock is frozen, then becomes visible and the app's own timer runs on the frozen clock.
const HIDE_UNTIL_READY = `(() => {
  let visible = false;
  Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get() { return visible ? 'visible' : 'hidden'; } });
  window.__promoShow = () => { visible = true; document.dispatchEvent(new Event('visibilitychange')); };
})();`;

// ---- Server (the app's static server on the built copy) and browser (one at a time: GPU Metal for the 3D flowers). ----
const stats = { blocked: [], warnings: [], frames: {}, takes: {}, gl: null, routed: 0, realNetworkRequests: 0 };
const launch = () => chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
async function startServer() {
  const server = spawn(process.execPath, [join(appDir, 'scripts/serve.mjs'), siteDir, String(port)], { cwd: appDir, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${base}/`, { redirect: 'error' })).ok) return server; } catch { /* starting */ } await sleep(200); }
  server.kill(); throw new Error(`配信が起動しない: ${base}`);
}

// Requests to the production origin are answered from the local server (Node fetch -> route.fulfill); data:/blob: stay in the
// page; anything else is aborted and counted. Nothing is ever continued to the network (realNetworkRequests counts it if it were).
const HOP = ['content-encoding', 'content-length', 'transfer-encoding', 'connection'];
async function newContext(browser, take, { viewport = VIEW, mobile = true, clock = true } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: DPR, hasTouch: mobile, isMobile: mobile, locale: 'ja-JP', reducedMotion: 'no-preference', serviceWorkers: 'block' });
  if (clock) await context.addInitScript(CLOCK);
  await context.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    const u = new URL(url);
    if (u.origin === APP_ORIGIN) {
      const r = await fetch(`${base}${u.pathname}${u.search}`, { method: route.request().method(), headers: { accept: route.request().headers().accept ?? '*/*' }, redirect: 'error' });   // a redirect would leave the local server: refuse it
      stats.routed++;
      const headers = Object.fromEntries([...r.headers].filter(([k]) => !HOP.includes(k)));
      return route.fulfill({ status: r.status, headers, body: Buffer.from(await r.arrayBuffer()) });
    }
    stats.blocked.push(url); return route.abort();
  });
  context.on('request', (request) => { const url = request.url(); if (!url.startsWith('data:') && !url.startsWith('blob:')) stats.requestsSeen = (stats.requestsSeen ?? 0) + 1; });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (!['warning', 'error'].includes(message.type())) return;
    if (/GPU stall due to ReadPixels/.test(message.text())) return;
    stats.warnings.push(`${take}: ${message.type()}: ${message.text().slice(0, 300)}`);
  });
  page.on('pageerror', (error) => stats.warnings.push(`${take}: pageerror: ${error.message}`));
  return { context, page };
}
const settle = (page, n = 3) => page.evaluate((n) => { for (let i = 0; i < n; i++) window.__promoStep(0); }, n);
// Two 1/60 s ticks per video frame: the app's 3D quality governor drops shadow quality when frames take longer than 28 ms,
// so stepping 33 ms at once would look like a slow 30 Hz device. At 60 Hz it renders as on an ordinary phone.
const step = (page) => page.evaluate(() => { window.__promoStep(1000 / 60); window.__promoStep(1000 / 60); });
const rect = (page, selector) => page.evaluate((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r && r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height } : null; }, selector);
const tid = (id) => `[data-testid="${id}"]`;
function takeDir(take) { const dir = join(framesDir, take); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true }); return dir; }
const shoot = (page, dir, index) => page.screenshot({ path: join(dir, `f${String(index).padStart(5, '0')}.png`), type: 'png', timeout: 120000 });
async function waitReady(page, timeout = 60000) {
  await page.waitForFunction(() => { const s = [...document.querySelectorAll('svg[data-renderer-state]')]; return s.length && s.every((el) => el.dataset.rendererState === 'ready'); }, null, { timeout });
}
async function glRenderer(page) {
  return page.evaluate(() => { const c = document.createElement('canvas').getContext('webgl2'); const e = c?.getExtension('WEBGL_debug_renderer_info'); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : null; });
}
async function poll(page, fn, arg, what, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await page.evaluate(fn, arg)) return; await settle(page, 1); await sleep(30); }
  throw new Error(`待っても起きない: ${what}`);
}

// ---- Take 1: the Studio. ----
// Map each storyboard intent to the real element (data-testid) and to a check that it really happened.
const STUDIO_TARGETS = {
  '見本': 'tab-auto', 'かわいい': 'mood-cute', '元気': 'mood-lively', '包み紙': 'tab-wrap', 'リボン': 'tab-ribbon',
  '背景': 'tab-bg', '写真': 'bg-photo', '贈る': 'send', 'プレビュー': 'preview', 'リンクを作る': 'make-link',
};
const COLOR_PICKS = ['wrap-color-lavender'];   // the 「色」 tap: clearly different from the cute bouquet's wrap
const TYPE_FIELDS = ['to-name', 'from-name', 'message'];
const CHAR_SECONDS = 0.07;
const DRAFT = { bg: 1, photo: null, occasion: 1, wrap: { style: 0, color: 0 }, ribbon: { style: 0, color: 0 }, items: [], to: { name: '', honorific: 0 }, from: { name: '', honorific: 0 }, message: '' };

async function shootStudio(browser) {
  const { context, page } = await newContext(browser, 'studio');
  const { from, to } = TAKES.studio, dir = takeDir('studio');
  const events = { taps: [], fingers: [], typing: [], petals: [], notes: [] };
  try {
    await context.addInitScript((d) => { if (!sessionStorage.getItem('__seeded')) { localStorage.setItem('bouquet-studio:v1:draft', d); sessionStorage.setItem('__seeded', '1'); } }, JSON.stringify(DRAFT));
    await page.goto(`${APP_ORIGIN}/`);
    stats.gl = await glRenderer(page);
    log('GL', stats.gl);
    await waitReady(page);
    // Off camera: open the 見本 tab and bring the mood buttons into view inside its panel (never shown being done).
    await page.locator(tid(STUDIO_TARGETS[STUDIO_PRESET_TAB])).tap();
    await page.evaluate(() => { const p = document.getElementById('studio-panel-auto'); const m = document.querySelector('[data-testid="mood-cute"]'); const d = m.getBoundingClientRect().bottom - p.getBoundingClientRect().bottom + 8; if (d > 0) p.scrollTop += d; });
    await sleep(800);   // the canvas fade-in (250 ms) and the tab change finish in real time
    if (await page.evaluate(() => document.querySelectorAll('[data-testid="canvas"] .head[data-id]').length)) throw new Error('空の花束で始まっていない');
    await page.evaluate(() => window.__promoFreeze());
    await settle(page);
    events.notes.push(`governor at freeze: ${await page.evaluate(() => document.querySelector('[data-testid="canvas"]').dataset.governorStage)}`);
    events.stage = await rect(page, tid('canvas'));   // the bouquet stage: the pivot of the drag push-in
    const cdp = await context.newCDPSession(page);
    const t0 = Date.now() / 1000;
    const touch = (type, p, g) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y, id: 7, radiusX: 9, radiusY: 9, force: 1 }] : [], timestamp: t0 + g / FPS });
    // Actions keyed by frame. Colors take the next pick in order; typing expands into one insert per character.
    let colorIndex = 0, typeIndex = 0;
    const plan = new Map();
    for (const action of STUDIO_ACTIONS) {
      const g = frameAt(action.at);
      if (action.kind === 'tap') plan.set(g, { ...action, target: action.label === '色' ? COLOR_PICKS[colorIndex++] : STUDIO_TARGETS[action.label] });
      else if (action.kind === 'type') plan.set(g, { ...action, field: TYPE_FIELDS[typeIndex++] });
      else plan.set(g, action);
    }
    const chars = new Map();   // frame -> [text]
    let drag = null;
    const downs = new Map([...plan].filter(([, a]) => a.kind === 'tap').map(([g, a]) => [g - TAP_DOWN, g]));
    let pending = null;
    for (let g = from; g < to; g++) {
      const action = plan.get(g);
      if (downs.has(g)) pending = await touchDown(page, plan.get(downs.get(g)), g, touch);
      if (action?.kind === 'tap') { await doTap(page, action, g, events, touch, pending); pending = null; }
      if (action?.kind === 'type') {
        const field = action.field;
        const at = await rect(page, tid(field));
        if (!at || at.y < 0 || at.y > VIEW.height) await page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'nearest' }), tid(field));
        const p = await rect(page, tid(field));
        events.taps.push({ frame: g, label: field, x: p.x, y: p.y, w: p.w, h: p.h, soft: true });
        await page.touchscreen.tap(p.x, p.y);
        await poll(page, (s) => document.activeElement === document.querySelector(s), tid(field), `${field} にフォーカス`);
        [...action.text].forEach((ch, i) => { const f = g + 1 + Math.round(i * CHAR_SECONDS * FPS); chars.set(f, [...(chars.get(f) ?? []), ch]); });
        events.typing.push({ frame: g, field, text: action.text });
      }
      for (const ch of chars.get(g) ?? []) await page.keyboard.insertText(ch);
      if (action?.kind === 'drag') drag = await startDrag(page, action, g, touch, events);
      if (drag) drag = await moveDrag(drag, g, touch, events);
      await step(page);
      await shoot(page, dir, g - from);
      const petals = await page.evaluate(() => Number(document.querySelector('[data-testid="canvas"]')?.getAttribute('data-petals') ?? 0));
      if (petals) events.petals.push({ frame: g, petals });
      if ((g - from) % 30 === 0) log('studio', g - from, '/', to - from);
    }
    events.link = await page.evaluate((s) => document.querySelector(s)?.value ?? null, tid('link-output'));
    if (!events.link || !/\/gift\/#v1\./.test(events.link)) throw new Error(`リンクが作れていない: ${events.link}`);
    events.storage = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith('bouquet-studio')).map((k) => [k, localStorage.getItem(k)])));
    events.renderer = await page.evaluate(() => { const s = document.querySelector('[data-testid="canvas"]'); return { state: s.dataset.rendererState, governor: s.dataset.governorStage }; });
    stats.frames.studio = to - from;
    stats.takes.studio = { taps: events.taps.filter((t) => !t.soft).map((t) => ({ seconds: +(t.frame / FPS).toFixed(3), label: t.label })), petalsMax: Math.max(0, ...events.petals.map((p) => p.petals)), renderer: events.renderer };
    writeFileSync(join(dir, 'events.json'), JSON.stringify(events, null, 1));
    return events;
  } finally { await context.close(); }
}

// A tap is a real touch: the finger goes down TAP_DOWN frames before it lifts (the app reacts on the lift = the cue). The ring is
// drawn from the finger-down, on the real element, while the old screen is still up.
const TAP_DOWN = 3;
async function touchDown(page, action, g, touch) {
  const s = tid(action.target);
  let at = await rect(page, s);
  if (!at || at.y > VIEW.height - 10 || at.y < 0 || at.x < 0 || at.x > VIEW.width) {
    // Out of view inside a scrolling panel (not the page): scroll that panel in the same frame.
    await page.evaluate((s) => {
      const el = document.querySelector(s); if (!el) return;
      let box = el.parentElement; while (box && !(box.scrollHeight > box.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(box).overflowY)) && !(box.scrollWidth > box.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(box).overflowX))) box = box.parentElement;
      if (!box || box === document.documentElement || box === document.body) return;
      const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
      if (box.scrollHeight > box.clientHeight + 1) box.scrollTop += r.top - b.top - 40;
      if (box.scrollWidth > box.clientWidth + 1 && (r.right > b.right || r.left < b.left)) box.scrollLeft += r.left - b.left - 24;
    }, s);
    at = await rect(page, s);
  }
  if (!at || at.y > VIEW.height || at.y < 0) throw new Error(`押す部品が見えない: ${action.target}（${g}コマ目） ${JSON.stringify(at)}`);
  await touch('touchStart', at, g);
  return { ...at, downFrame: g };
}
async function doTap(page, action, g, events, touch, at) {
  if (!at) throw new Error(`指が下りていない: ${action.target}（${g}コマ目）`);
  const s = tid(action.target);
  events.taps.push({ frame: g, downFrame: at.downFrame, label: action.label, target: action.target, x: at.x, y: at.y, w: at.w, h: at.h, changesScreen: ['send', 'preview', 'make-link'].includes(action.target) });
  if (action.target === 'bg-photo') {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 10000 }), touch('touchEnd', null, g)]);
    await chooser.setFiles(photoFile);
    await poll(page, () => document.querySelector('[data-testid="bg-photo"]')?.getAttribute('aria-pressed') === 'true' && !!document.querySelector('.canvas-host > canvas.photo-bg'), null, '写真が背景に入る', 20000);
  } else {
    await touch('touchEnd', null, g);
    const checks = {
      'mood-cute': () => document.querySelectorAll('[data-testid="canvas"] .head[data-id]').length > 4,
      'send': () => document.querySelector('[data-testid="send-sheet"]')?.open,
      'preview': () => document.querySelector('[data-testid="send-sheet"]')?.dataset.step === '2',
      'make-link': () => /\/gift\/#v1\./.test(document.querySelector('[data-testid="link-output"]')?.value ?? ''),
    };
    const check = checks[action.target] ?? ((s) => { const el = document.querySelector(s); return el?.getAttribute('aria-selected') === 'true' || el?.getAttribute('aria-pressed') === 'true'; });
    await poll(page, check, s, `${action.label}（${action.target}）が効く`);
  }
  await settle(page, 1);
  if (action.target === 'make-link') {
    // The finished screen: the link and every visible text must carry the production address, never the local server.
    const seen = await page.evaluate(() => ({ origin: location.origin, link: document.querySelector('[data-testid="link-output"]').value,
      text: document.body.innerText, values: [...document.querySelectorAll('input, textarea')].map((el) => el.value).join('\n') }));
    const local = /127\.0\.0\.1|localhost/i;
    stats.finishedScreen = { appOrigin: seen.origin, linkOutputPrefix: seen.link.slice(0, seen.link.indexOf('#') + 4), localAddressInText: local.test(seen.text), localAddressInValues: local.test(seen.values) };
    if (seen.origin !== APP_ORIGIN || !seen.link.startsWith(`${APP_ORIGIN}/gift/#v1.`) || local.test(seen.text) || local.test(seen.values)) throw new Error(`完成画面に本番以外の住所: ${JSON.stringify(stats.finishedScreen)}`);
  }
}

// The drag: one finger on the big flower nearest the middle, a long move to the right (first 55 %), then a fast shake (the app
// drops petals when the flower moves faster than its threshold; the touch timestamps follow the video clock, so the speed is the
// one seen on screen). The shake swings one amplitude per frame (a 4-frame cycle), fast enough for 3 petals per shake event.
const DRAG = { dx: 135, moveShare: 0.55, shake: 48 };
async function startDrag(page, action, g, touch, events) {
  const start = await page.evaluate(() => {
    const svg = document.querySelector('[data-testid="canvas"]'), ctm = svg.getScreenCTM(), p = svg.createSVGPoint();
    // Only a big-petalled flower (its petals are what falls): not greens, かすみ草 or ラベンダー, whose falling bits are hard to see.
    const heads = [...svg.querySelectorAll('.head[data-id]')].filter((el) => /^(ガーベラ|バラ|カーネーション|コスモス|ひまわり|チューリップ)/.test(el.getAttribute('aria-label') ?? '')).map((el) => { const m = el.getAttribute('transform').match(/translate\(([^)]*)\)/)[1].split(/[\s,]+/).map(Number); const s = (el.getAttribute('transform').match(/scale\(([^)]*)\)/)?.[1] ?? '1').split(/[\s,]+/).map(Number); return { id: el.dataset.id, label: el.getAttribute('aria-label'), x: m[0], y: m[1], scale: Math.abs(s[1] ?? s[0]) }; });
    // A big flower in the middle of the bouquet: among the heads near the centre, the largest first.
    // Vivid petals first (white or pale pink petals vanish against the pink background), then the flower nearest the middle.
    const vivid = (h) => (/コーラル|赤|オレンジ|黄/.test(h.label) ? 0 : /ピーチ|ピンク/.test(h.label) ? 1 : 2);
    const near = heads.filter((h) => Math.hypot(h.x - 500, h.y - 330) < 190);
    heads.sort((a, b) => (near.includes(b) - near.includes(a)) || (vivid(a) - vivid(b)) || (Math.hypot(a.x - 500, a.y - 330) - Math.hypot(b.x - 500, b.y - 330)));
    for (const h of heads) {
      for (const [dx, dy] of [[0, 0], [10, 0], [-10, 0], [0, 10], [0, -10]]) {
        p.x = h.x + dx; p.y = h.y + dy; const q = p.matrixTransform(ctm);
        if (document.elementFromPoint(q.x, q.y)?.closest?.('.head[data-id]')?.dataset.id === h.id) return { id: h.id, label: h.label, x: q.x, y: q.y };
      }
    }
    return null;
  });
  if (!start) throw new Error('ドラッグする花が見つからない');
  const frames = Math.round(action.durationSeconds * FPS);
  // Move toward the roomier side of the bouquet stage, as far as the stage allows (the shake stays inside it too).
  const box = await rect(page, tid('canvas'));
  const left = start.x - (box.x - box.w / 2) - DRAG.shake - 24, right = (box.x + box.w / 2) - start.x - DRAG.shake - 24;
  const dx = right >= left ? Math.min(DRAG.dx, right) : -Math.min(DRAG.dx, left);
  events.notes.push(`drag ${start.id} (${start.label}) from ${start.x.toFixed(1)},${start.y.toFixed(1)} over ${frames} frames`);
  events.notes.push(`drag dx ${dx.toFixed(1)} (stage ${box.w.toFixed(0)}px wide)`);
  return { from: g, frames, start, dx, last: null };
}
async function moveDrag(drag, g, touch, events) {
  const i = g - drag.from, moveFrames = Math.round(drag.frames * DRAG.moveShare), u = Math.min(1, i / moveFrames);
  const e = u * u * (3 - 2 * u);
  const k = i - moveFrames, shakeFrames = drag.frames - moveFrames - 2;
  const shake = k > 0 && k < shakeFrames ? DRAG.shake * Math.sin((Math.PI / 2) * k) : 0;
  const p = { x: drag.start.x + drag.dx * e + shake, y: drag.start.y - 26 * Math.sin(Math.PI * e) + (k > 0 && k < shakeFrames ? 10 * Math.cos((Math.PI / 2) * k) : 0) };
  if (i === 0) await touch('touchStart', p, g);
  else if (i >= drag.frames) { await touch('touchEnd', null, g); return null; }
  else await touch('touchMove', p, g);
  events.fingers.push({ frame: g, points: [p] });
  return drag;
}

// ---- Take 2: the gift page, opened from the link made in take 1 in a new browser context. ----
// The page reports 'hidden' until SHOW_K (the app's 1.8 s auto-open timer has not started), becomes visible, and 1.0 s later a
// finger (CDP touch) goes down on 押して開く and lifts PRESS_HOLD frames later: the app opens on that tap. The frame the opening
// starts (teaser gone) is put on bar(8). If the tap did not open it, the take falls back to the app's own auto-open (no ring drawn).
const SHOW_K = 50, PRESS_K = SHOW_K + Math.round(GIFT.showBeforePressSeconds * FPS);
async function shootGift(browser, link) {
  const take = 'gift', framesAfterOpen = END_FRAME - OPEN_FRAME;
  const { context, page } = await newContext(browser, take, { viewport: GIFT_VIEW });
  const dir = takeDir(take), states = [];
  let press = null;
  try {
    await context.addInitScript(HIDE_UNTIL_READY);
    await page.goto(link);
    await waitReady(page);
    await sleep(800);
    await page.evaluate(() => window.__promoFreeze());
    await settle(page);
    const cdp = await context.newCDPSession(page);
    const t0 = Date.now() / 1000;
    let k = 0, openK = null, cardK = null;
    const total = () => (openK === null ? Infinity : openK + framesAfterOpen + 2);
    for (; k < total() && k < 420; k++) {
      if (k === SHOW_K) await page.evaluate(() => window.__promoShow());
      if (k === PRESS_K - GIFT.pressHoldFrames) {
        // The hint 押して開く (pointer-events: none: the touch reaches the stage's own open button under it).
        const hint = await rect(page, '.gift-teaser-hint');
        if (!hint) throw new Error('押して開く が見えない');
        press = { x: hint.x, y: hint.y, downK: k, upK: PRESS_K, opened: false };
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: hint.x, y: hint.y, id: 3, radiusX: 9, radiusY: 9, force: 1 }], timestamp: t0 + k / FPS });
      }
      if (k === PRESS_K) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: t0 + k / FPS });
        // The click of the tap arrives asynchronously: wait for it in real time without advancing the page clock.
        const t1 = Date.now();
        while (Date.now() - t1 < 3000 && await page.evaluate(() => document.querySelector('.gift-stage')?.dataset.teaser !== 'false')) { await settle(page, 0); await sleep(30); }
        press.opened = await page.evaluate(() => document.querySelector('.gift-stage')?.dataset.teaser === 'false');
      }
      await step(page);
      const s = await page.evaluate(() => ({ teaser: document.querySelector('.gift-stage')?.dataset.teaser, card: getComputedStyle(document.querySelector('.gift-card-region')).opacity }));
      if (openK === null && s.teaser === 'false') openK = k;
      if (cardK === null && openK !== null && Number(s.card) >= 0.5) cardK = k;
      states.push({ k, ...s });
      await shoot(page, dir, k);
      if (k % 30 === 0) log(take, k, s);
    }
    if (openK === null) throw new Error('受け取り画面が開かない');
    // The finger counts only if the opening started on the frame of the tap (not from the app's own timer).
    if (press) press.opened = press.opened && openK === PRESS_K;
    const renderer = await page.evaluate(() => { const s = document.querySelector('svg[data-renderer-state]'); return { state: s.dataset.rendererState, governor: s.dataset.governorStage }; });
    // The window's cut line must fall between the last line under the card and the footer, and the card must be whole.
    const layout = await page.evaluate(() => Object.fromEntries([['card', '.gift-card-region'], ['actions', '.gift-actions'], ['note', '.gift-message-note'], ['footer', '.gift-footer'], ['stage', '.gift-stage']]
      .map(([k, s]) => { const r = document.querySelector(s)?.getBoundingClientRect(); return [k, r ? { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), left: +r.left.toFixed(1), right: +r.right.toFixed(1) } : null]; })));
    const cutOk = layout.card.bottom < GIFT_CUT_CSS && layout.note.bottom <= GIFT_CUT_CSS && layout.footer.top >= GIFT_CUT_CSS;
    if (!cutOk) throw new Error(`受け取り画面の切り位置が合わない: ${JSON.stringify(layout)}`);
    const events = { openK, cardK, frames: k, states, renderer, layout, cutOk, cutCss: GIFT_CUT_CSS, link: link.slice(0, link.indexOf('#') + 4), press,
      showK: SHOW_K, openAfterVisibleSeconds: +((openK - SHOW_K) / FPS).toFixed(3), cardAfterOpenSeconds: cardK === null ? null : +((cardK - openK) / FPS).toFixed(3) };
    stats.frames[take] = k;
    stats.takes[take] = { openK, cardK, press, openedByTap: !!press?.opened, openAfterVisibleSeconds: events.openAfterVisibleSeconds, cardAfterOpenSeconds: events.cardAfterOpenSeconds, renderer, layout, cutOk, cutCss: GIFT_CUT_CSS, link: events.link };
    writeFileSync(join(dir, 'events.json'), JSON.stringify(events, null, 1));
    if (openK - (OPEN_FRAME - CUT_FRAME) < 0) throw new Error(`切替前の閉じた花束のコマが足りない（openK=${openK}）`);
    return events;
  } finally { await context.close(); }
}

// ---- Card assets: a PC-width still of the finished bouquet on the photo (no captions, no frame). ----
async function shootCards(browser, studioEvents) {
  const { context, page } = await newContext(browser, 'cards', { viewport: { width: 1200, height: 750 }, mobile: false });
  try {
    await context.addInitScript((items) => { if (!sessionStorage.getItem('__seeded')) { for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v); sessionStorage.setItem('__seeded', '1'); } }, studioEvents.storage);
    await page.goto(`${APP_ORIGIN}/`);
    await waitReady(page);
    await sleep(1500);
    const png = join(framesDir, 'cards-pc.png');
    await page.screenshot({ path: png });
    return png;
  } finally { await context.close(); }
}

// ---- Overlay frames (captions, tap rings, finger, flashes, end card) and the static background, transparent PNGs. ----
// Every cut gets the same short white flash: hook -> S1, S1 -> the Studio window, finished screen -> gift, gift -> end card.
const FLASHES = [[bar(1), 0.35], [STUDIO_START, 0.55], [GIFT.cutInAt, 0.4], [bar(11), 0.3]];
// Captions as segments in video frames: a scene starts its caption at `captionAt` (else its start); a scene with the same lines as
// the one before keeps the caption on screen (no re-entry). Notes: the small grey line under a caption.
function captionPlan() {
  const segments = [];
  for (const sc of STORYBOARD) {
    const key = sc.lines.join('\n');
    if (segments.length && segments.at(-1).key === key) continue;
    segments.push({ id: sc.id, from: frameAt(sc.captionAt ?? sc.start), lines: sc.lines, key });
  }
  const notes = STORYBOARD.filter((sc) => sc.note).map((sc) => ({ from: frameAt(sc.note.at), to: frameAt(sc.end), text: sc.note.text }));
  return { segments, notes };
}
// Tap rings and the finger, per video frame, already mapped through the window camera (they sit on the real pressed point).
// A ring appears on the frame of the press and is gone after STUDIO_CAMERA.ringSeconds; it never outlives its screen.
function markPlan() {
  const studio = takeEvents('studio'), gift = takeEvents('gift'), marks = Array.from({ length: TOTAL }, () => []);
  const ring = (g0, p, soft, until = TOTAL) => {
    for (let g = g0; g < Math.min(TOTAL, until); g++) {
      const u = (g - g0) / FPS / STUDIO_CAMERA.ringSeconds;
      if (u >= 1) break;
      const at = toOverlay(g, p);
      if (at) marks[g].push({ kind: 'ring', ...at, o: +((1 - u) ** 2).toFixed(3), s: +(0.6 + 0.7 * (1 - (1 - u) ** 3)).toFixed(3), soft: !!soft });
    }
  };
  for (const t of studio.taps) ring(t.downFrame ?? t.frame, t, t.soft, t.changesScreen ? t.frame : TOTAL);
  for (const f of studio.fingers) for (const p of f.points) { const at = toOverlay(f.frame, p); if (at) marks[f.frame].push({ kind: 'finger', ...at }); }
  let giftPress = null;
  if (gift.press?.opened) {
    const g = (k) => OPEN_FRAME + (k - gift.openK);
    for (let k = gift.press.downK; k < gift.press.upK; k++) { const at = toOverlay(g(k), gift.press); if (at) marks[g(k)].push({ kind: 'finger', ...at }); }
    ring(g(gift.press.downK), gift.press, false);
    giftPress = { fingerDownSeconds: +(g(gift.press.downK) / FPS).toFixed(3), liftSeconds: +(g(gift.press.upK) / FPS).toFixed(3) };
  }
  // Report: the last frame any ring is visible after each tap, and that none is left at a cut.
  stats.rings = { lastRingFrame: Math.max(...marks.flatMap((m, g) => (m.some((x) => x.kind === 'ring') ? [g] : []))),
    ringsAtCuts: [CUT_FRAME, frameAt(bar(11)), TAKES.studio.from].map((c) => ({ frame: c, rings: marks[c].filter((x) => x.kind === 'ring').length })), giftPress };
  return marks;
}
async function shootOverlay(browser) {
  const dir = takeDir('overlay');
  const marks = markPlan(), captions = captionPlan();
  stats.captions = captions.segments.map((c) => ({ id: c.id, fromSeconds: +(c.from / FPS).toFixed(3), text: c.lines.join(' ') }));
  const endBackground = join(framesDir, 'gift', `f${String(lastGiftFrame()).padStart(5, '0')}.png`);
  const context = await browser.newContext({ viewport: GIFT_VIEW, deviceScaleFactor: DPR })   // the full 540x960 frame (= 1080x1920);
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
  await page.evaluate((data) => window.__setup(data), { storyboard: STORYBOARD, captions, end: END_CARD, flashes: FLASHES, total: TOTAL, fps: FPS, doubts: DOUBTS, beat: BEAT, studioStart: STUDIO_START, win: { x: WIN.x / DPR, y: WIN.y / DPR, w: WIN.w / DPR, h: WIN.h / DPR, r: WIN.radius / DPR } });
  // The static background (gradient + the window's shadow) and the window mask, shot once without transparency. One shape for all scenes.
  await page.evaluate(() => window.__background(true));
  await page.screenshot({ path: join(framesDir, 'background.png') });
  await page.evaluate(() => window.__mask(true));
  await page.screenshot({ path: join(framesDir, 'mask.png'), clip: { x: WIN.x / DPR, y: WIN.y / DPR, width: WIN.w / DPR, height: WIN.h / DPR } });
  await page.evaluate(() => { window.__mask(false); window.__background(false); });
  const gaps = [];
  for (let f = 0; f < TOTAL; f++) {
    const shown = await page.evaluate(([f, m]) => window.__frame(f, m), [f, marks[f]]);
    if (shown !== null && shown < 0.5) gaps.push({ frame: f, captionOpacity: +shown.toFixed(3) });
    await page.screenshot({ path: join(dir, `o${String(f).padStart(5, '0')}.png`), omitBackground: true });
  }
  stats.frames.overlay = TOTAL;
  stats.captionGapFrames = gaps;   // frames whose caption is less than half visible (should be empty)
  await context.close();
}

function overlayHtml() {
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><style>
  @font-face { font-family: Promo; src: url(/font.ttf); font-weight: 700; }
  @font-face { font-family: PromoBlack; src: url(/font-black.ttf); font-weight: 900; }
  :root { --ink: #3B2A3F; --accent: #C03A63; --soft: #FFF8F2; }
  html, body { margin: 0; width: 540px; height: 960px; overflow: hidden; background: transparent; font-family: Promo, sans-serif; color: var(--ink); }
  .bg { position: absolute; inset: 0; display: none; background: linear-gradient(170deg, #FFF8F2 0%, #FDEFEF 45%, #FDE4EC 100%); }
  .bg .shadow { position: absolute; background: #fff; box-shadow: 0 10px 30px rgba(59, 42, 63, .16), 0 2px 6px rgba(59, 42, 63, .10); }
  .bg .petal { position: absolute; border-radius: 60% 0 60% 0; background: #C03A63; opacity: .08; }
  .mask { position: absolute; inset: 0; display: none; background: #000; }
  .mask div { position: absolute; background: #fff; }
  .cap { position: absolute; left: 12px; right: 12px; top: 76px; height: 100px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
  .note { position: absolute; left: 12px; right: 12px; top: 172px; text-align: center; font-family: Promo, sans-serif; font-weight: 700; font-size: 14px; line-height: 16px; color: #6E5F70; white-space: nowrap; opacity: 0; }
  .cap span { display: block; font-family: PromoBlack, Promo, sans-serif; font-weight: 900; font-size: 34px; line-height: 1.28; letter-spacing: .02em; white-space: nowrap; }
  .cap span:last-child { color: var(--accent); }
  .cap span:only-child { color: var(--ink); font-size: 38px; }
  .flash { position: absolute; inset: 0; background: #fff8f2; opacity: 0; }
  .s1 { position: absolute; inset: 0; display: none; overflow: hidden; background: radial-gradient(ellipse at 50% 45%, #FFF8F2 0%, #FDEFEF 45%, #FDE4EC 80%); }
  .s1 .dot { position: absolute; border-radius: 50%; background: #C03A63; }
  .s1 .doubt { position: absolute; transform-origin: 50% 50%; white-space: nowrap; font-family: Promo, sans-serif; font-weight: 700; font-size: 26px; letter-spacing: .02em;
    color: var(--ink); background: #fff; border: 2px solid #C03A63; border-radius: 999px; padding: 13px 26px; box-shadow: 0 8px 20px rgba(59, 42, 63, .16); opacity: 0; }
  .tap { position: absolute; width: 50px; height: 50px; margin: -25px; border-radius: 50%; border: 3px solid #fff; background: rgba(192, 58, 99, .32);
    box-shadow: 0 0 0 2.5px rgba(59, 42, 63, .5), 0 0 14px rgba(59, 42, 63, .3); box-sizing: border-box; opacity: 0; }
  .tap.soft { background: rgba(192, 58, 99, .18); }
  .finger { position: absolute; width: 58px; height: 58px; margin: -29px; border-radius: 50%; background: rgba(255, 255, 255, .45); border: 3px solid rgba(255, 255, 255, .95);
    box-shadow: 0 0 0 5px rgba(192, 58, 99, .28), 0 4px 16px rgba(59, 42, 63, .35); box-sizing: border-box; }
  .end { position: absolute; inset: 0; display: none; overflow: hidden; background: #FFF8F2; }
  .end-bg { position: absolute; inset: -40px; width: calc(100% + 80px); height: calc(100% + 80px); object-fit: cover; filter: blur(16px) saturate(1.05); opacity: .6; }
  .end-shade { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 45%, #fff8f2d9, #fde4ecf0 75%); }
  .end-body { position: absolute; left: 0; right: 0; top: 190px; text-align: center; }
  .end-body > * { opacity: 0; }
  .end .pill { display: inline-block; font-size: 14px; letter-spacing: .2em; color: var(--accent); border: 1.5px solid #C03A6399; padding: 8px 16px; border-radius: 30px; background: #fff; }
  .end .logo { display: block; margin: 26px auto 0; width: 70px; height: 70px; }
  .end h1 { font-family: PromoBlack, Promo, sans-serif; font-size: 60px; letter-spacing: .01em; margin: 10px 0 10px; font-weight: 900; color: var(--ink); }
  .end .sub { font-size: 27px; margin: 0 0 30px; color: var(--ink); font-weight: 700; }
  .end .badges { display: flex; justify-content: center; gap: 9px; flex-wrap: wrap; padding: 0 40px; }
  .end .badges b { font-size: 19px; font-weight: 700; padding: 9px 16px; border-radius: 30px; border: 1.5px solid #3B2A3F33; background: #fff; }
  .end .badges b:first-child { background: var(--accent); color: #fff; border-color: var(--accent); }
  .end .url { margin: 38px auto 0; display: inline-block; font-size: 23px; letter-spacing: .01em; color: #fff; background: var(--ink); padding: 14px 22px; border-radius: 14px; }
  </style>
  <div class="bg"><div class="shadow"></div></div>
  <div class="mask"><div></div></div>
  <div class="s1"></div>
  <div class="cap prev"></div>
  <div class="cap cur"></div>
  <div class="note"></div>
  <div class="taps"></div>
  <div class="fingers"></div>
  <div class="end"><img class="end-bg" src="/end.png" alt=""><div class="end-shade"></div>
    <div class="end-body"><div class="pill end-day"></div>
      <svg class="logo" viewBox="0 0 64 64" aria-hidden="true"><path d="M18 30 L32 58 L46 30 Z" fill="#F4B6C8" stroke="#3B2A3F" stroke-width="2" stroke-linejoin="round"/>
        <circle cx="24" cy="22" r="9" fill="#F28BA8"/><circle cx="40" cy="22" r="9" fill="#F06FA0"/><circle cx="32" cy="14" r="9" fill="#C03A63"/>
        <path d="M27 36 q5 6 10 0" fill="none" stroke="#C03A63" stroke-width="3" stroke-linecap="round"/></svg>
      <h1 class="end-title"></h1><p class="sub end-sub"></p><div class="badges end-badges"></div><div><span class="url end-url"></span></div></div></div>
  <div class="flash"></div>
  <script>
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), easeOut = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;
  let D, current = -1;
  window.__setup = (data) => {
    D = data;
    Object.assign($('.bg .shadow').style, { left: data.win.x + 'px', top: data.win.y + 'px', width: data.win.w + 'px', height: data.win.h + 'px', borderRadius: data.win.r + 'px' });
    $('.end-day').textContent = data.end.day; $('.end-title').textContent = data.end.title; $('.end-sub').textContent = data.end.sub;
    $('.end-badges').replaceChildren(...data.end.badges.map((text) => Object.assign(document.createElement('b'), { textContent: text })));
    $('.end-url').textContent = data.end.url;
    // S1: soft round dots (simple shapes only) and the doubts, piling up left / right inside the safe area (below the caption,
    // above 80 % of the height), a little overlapped and tilted, so the screen fills up.
    const dots = [[70, 300, 90, .05], [470, 250, 60, .06], [440, 690, 110, .045], [90, 640, 50, .06], [280, 760, 36, .05]].map(([x, y, r, o]) => {
      const el = document.createElement('div'); el.className = 'dot'; Object.assign(el.style, { left: (x - r) + 'px', top: (y - r) + 'px', width: 2 * r + 'px', height: 2 * r + 'px', opacity: o }); return el; });
    const spots = [[190, 236, -5], [345, 296, 4], [175, 362, 3], [370, 424, -4], [205, 490, -2.5], [385, 552, 5], [170, 618, 3.5], [350, 686, -4]];
    $('.s1').replaceChildren(...dots, ...data.doubts.map((text, i) => { const sp = spots[i % spots.length]; const el = document.createElement('div'); el.className = 'doubt'; el.textContent = text; el.dataset.x = sp[0]; el.dataset.y = sp[1]; el.dataset.r = sp[2]; return el; }));
  };
  window.__mask = (on, h = D.win.h) => {
    $('.mask').style.display = on ? 'block' : 'none';
    Object.assign($('.mask div').style, { left: D.win.x + 'px', top: D.win.y + 'px', width: D.win.w + 'px', height: h + 'px', borderRadius: D.win.r + 'px' });
  };
  window.__background = (on, h = D.win.h) => {
    $('.bg').style.display = on ? 'block' : 'none';
    $('.bg .shadow').style.height = h + 'px';
    for (const s of ['.cap.cur', '.cap.prev', '.note', '.taps', '.fingers', '.end', '.flash', '.s1']) $(s).style.visibility = on ? 'hidden' : 'visible';
  };
  const spans = (lines) => lines.map((text) => Object.assign(document.createElement('span'), { textContent: text }));
  window.__frame = (f, marks) => {
    const fr = (sec) => Math.round(sec * D.fps);
    // Captions: the new one fades in while the old one fades out on the same frames (never an empty frame between them).
    const segs = D.captions.segments, i = segs.findLastIndex((s) => f >= s.from);
    if (i !== current) {
      $('.cap.prev').replaceChildren(...(i > 0 ? spans(segs[i - 1].lines) : []));
      $('.cap.cur').replaceChildren(...spans(segs[i].lines));
      current = i;
    }
    const age = (f - segs[i].from) / D.fps + (segs[i].from === 0 ? 1 : 0);
    // The new caption is already 75 % visible on the frame of the change; the old one shows only on that frame, faint (20 %).
    [...$('.cap.cur').querySelectorAll('span')].forEach((el) => { const u = easeOut(age / 0.12); el.style.opacity = 0.75 + 0.25 * u; el.style.transform = 'translateY(' + ((1 - u) * 5) + 'px)'; });
    const first = Math.round(age * D.fps) === 0 && segs[i].from > 0;
    [...$('.cap.prev').querySelectorAll('span')].forEach((el) => { el.style.opacity = first ? 0.2 : 0; el.style.transform = 'translateY(-4px)'; });
    const note = D.captions.notes.find((n) => f >= n.from && f < n.to + fr(0.2));
    if (note) { $('.note').textContent = note.text; $('.note').style.opacity = f < note.to ? easeOut((f - note.from) / D.fps / 0.25) : 1 - easeOut((f - note.to) / D.fps / 0.16); }
    else $('.note').style.opacity = 0;
    let flash = 0;
    for (const [at, strength] of D.flashes) { const dt = (f - fr(at)) / D.fps; if (dt >= 0) flash = Math.max(flash, strength * Math.exp(-dt / 0.12)); }
    $('.flash').style.opacity = flash;
    // Rings and fingers come already placed (node maps them through the window camera of this frame).
    $('.taps').replaceChildren(...marks.filter((m) => m.kind === 'ring').map((m) => { const el = document.createElement('div'); el.className = 'tap' + (m.soft ? ' soft' : ''); Object.assign(el.style, { left: m.x + 'px', top: m.y + 'px', opacity: m.o, transform: 'scale(' + m.s + ')' }); return el; }));
    $('.fingers').replaceChildren(...marks.filter((m) => m.kind === 'finger').map((m) => { const el = document.createElement('div'); el.className = 'finger'; el.style.left = m.x + 'px'; el.style.top = m.y + 'px'; return el; }));
    // S1: the overlay covers the whole frame (no app window). A doubt pops in every half beat with a small overshoot (about 0.25 s);
    // in the second half they all wobble a little. Gone on the frame the Studio window appears (under the flash).
    const s1 = D.storyboard.find((s) => s.overlayOnly), on1 = f >= fr(s1.start) && f < fr(D.studioStart);
    $('.s1').style.display = on1 ? 'block' : 'none';
    if (on1) {
      const ts = (f - fr(s1.start)) / D.fps, wob = clamp((ts - 1.2) / 0.5, 0, 1);
      [...$('.s1').querySelectorAll('.doubt')].forEach((el, i) => {
        const every = Math.min(D.beat / 2, (D.studioStart - s1.start - 0.4) / Math.max(1, D.doubts.length - 1));
        const t = (f - fr(s1.start + i * every)) / D.fps, u = clamp(t / 0.25, 0, 1);
        const back = (x) => { const c = 2.2; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };
        const scale = t < 0 ? 0.6 : 0.6 + 0.4 * back(u), bob = t > 0 ? 3 * Math.sin(2 * Math.PI * (t * 0.8 + i * 0.25)) : 0;
        const rot = Number(el.dataset.r) + wob * 2.5 * Math.sin(2 * Math.PI * (ts * 2.6 + i * 0.37));
        el.style.opacity = t < 0 ? 0 : clamp(t / 0.08, 0, 1);
        el.style.left = el.dataset.x + 'px'; el.style.top = el.dataset.y + 'px';
        el.style.transform = 'translate(-50%, -50%) translateY(' + bob + 'px) rotate(' + rot + 'deg) scale(' + scale + ')';
      });
    }
    // The end card is a cut (opaque from its first frame, under the flash like every other cut): no frame shows two pictures.
    const endAt = D.storyboard.find((s) => s.music === 'resolve').start, end = f >= fr(endAt);
    $('.end').style.display = end ? 'block' : 'none';
    for (const s of ['.cap.cur', '.cap.prev', '.note']) $(s).style.visibility = end ? 'hidden' : 'visible';
    if (end) {
      const e = (f - fr(endAt)) / D.fps;
      [...$('.end-body').children].forEach((el, i) => { const u = easeOut((e - i * 0.05) / 0.25); el.style.opacity = 0.65 + 0.35 * u; el.style.transform = 'translateY(' + ((1 - u) * 14) + 'px)'; });
      $('.end-bg').style.transform = 'scale(' + (1.04 + e * 0.02) + ')';
    }
    // For the report: how much caption is on screen in this frame (the largest line opacity), null under the end card.
    return end ? null : Math.max(0, ...[...document.querySelectorAll('.cap span')].map((el) => Number(el.style.opacity)));
  };
  </script></html>`;
}

// ---- Compose ----
// ffmpeg / ffprobe: FFMPEG / FFPROBE, else the first one on PATH.
const which = (name, env) => process.env[env] || execFileSync('/bin/sh', ['-c', `command -v ${name}`], { encoding: 'utf8' }).trim();
const ffmpeg = which('ffmpeg', 'FFMPEG'), ffprobe = which('ffprobe', 'FFPROBE');
const silentName = 'Day088_bouquet-studio_promo_silent.mp4';
// Read once per run (only after the takes are shot: overlay and compose come last).
const eventsCache = new Map();
const takeEvents = (take) => { if (!eventsCache.has(take)) eventsCache.set(take, JSON.parse(readFileSync(join(framesDir, take, 'events.json'), 'utf8'))); return eventsCache.get(take); };
const lastGiftFrame = () => takeEvents('gift').frames - 1;
const fname = (dir, i) => join(framesDir, dir, `f${String(i).padStart(5, '0')}.png`);
const smooth = (u) => { const x = Math.max(0, Math.min(1, u)); return x * x * (3 - 2 * x); };
// The camera on the window: the real frame is cropped and scaled (zoom >= 1) around a pivot { px, py } in source pixels
// (1080x1650 = CSS 540x825 at DPR 2). A point p of the app maps to pivot + (p - pivot) * zoom; the crop never leaves the frame.
const camera = (zoom, px, py) => ({ zoom, px, py });
// Studio camera at video frame g: the drag push-in (stage centre) and the short pop on every tap (the pressed point).
function studioCamera(g, studio) {
  if (NO_CAMERA) return camera(1, SRC.w / 2, SRC.h / 2);
  const C = STUDIO_CAMERA, drag = STUDIO_ACTIONS.find((a) => a.kind === 'drag');
  const next = STUDIO_ACTIONS.find((a) => a.kind === 'tap' && a.at > drag.at);
  const inFrom = frameAt(drag.at) - frameAt(C.dragInSeconds) + 3, outTo = frameAt(next.at) - 2;
  const u = smooth((g - inFrom) / frameAt(C.dragInSeconds)) * (1 - smooth((g - (outTo - frameAt(C.dragOutSeconds))) / frameAt(C.dragOutSeconds)));
  const stage = studio.stage;
  if (u > 0.0005 && stage) return camera(1 + (C.dragZoom - 1) * u, stage.x * DPR, stage.y * DPR);
  for (const t of studio.taps) {
    const dt = (g - t.frame) / FPS;
    if (dt >= 0 && dt < C.popSeconds) return camera(1 + (C.popZoom - 1) * Math.sin(Math.PI * dt / C.popSeconds), t.x * DPR, t.y * DPR);
  }
  return camera(1, SRC.w / 2, SRC.h / 2);
}
// Gift camera: pivot on the window's bottom edge. Closed bouquet 1 -> closedZoom. After the message card has been seen whole, the camera
// reads it: it moves to the window's bottom-left corner at GIFT.read.zoom (the card's first lines large), then pushes in slowly up to
// GIFT.read.zoomEnd until the end card. The crop never leaves the frame (a pivot inside the frame keeps it inside).
function giftCamera(g, gift) {
  if (NO_CAMERA) return camera(1, SRC.w / 2, SRC.h);
  const cardG = OPEN_FRAME + (gift.cardK ?? gift.openK + 108) - gift.openK;
  const closed = 1 + (GIFT.closedZoom - 1) * smooth((g - CUT_FRAME) / (OPEN_FRAME - CUT_FRAME));
  const R = GIFT.read, from = cardG + frameAt(R.holdSeconds), settled = from + frameAt(R.moveSeconds);
  if (g < from) return camera(closed, SRC.w / 2, SRC.h);
  const u = smooth((g - from) / frameAt(R.moveSeconds));
  const v = smooth((g - settled) / Math.max(1, END_FRAME - settled));
  const zoom = GIFT.closedZoom + (R.zoom - GIFT.closedZoom) * u + (R.zoomEnd - R.zoom) * v;
  // The visible bottom edge rises from the window's bottom to just above the action buttons (their words would be cut by the right
  // edge of a zoomed view), so no button or note is half visible; the card sits at the bottom of the picture. The pivot that gives a
  // zoom z and a visible bottom B (source px) is (B - SRC.h / z) / (1 - 1 / z).
  const aboveButtons = ((gift.layout?.actions?.top ?? 687) - R.aboveButtonsCss) * DPR;
  const bottom = SRC.h + (aboveButtons - SRC.h) * u;
  return camera(zoom, (SRC.w / 2) * (1 - u), (bottom - SRC.h / zoom) / (1 - 1 / zoom));
}
// What the window shows at video frame g: { take, k, zoom, px, py } (take null = no window, S1 / under the end card).
function plan(g) {
  const s1 = STORYBOARD.find((s) => s.overlayOnly);
  const gift = takeEvents('gift');
  // S0: the gift take just after its opening starts, pushed in on the window's top edge (the small app name stays whole).
  if (g < HOOK_END) return { take: 'gift', k: gift.openK + HOOK_SLICE + g, ...camera(HOOK.zoom[0] + (HOOK.zoom[1] - HOOK.zoom[0]) * g / (HOOK_END - 1), SRC.w / 2, 0) };
  if (g < TAKES.studio.from) return { take: null, scene: s1.id };
  if (g < TAKES.studio.to) return { take: 'studio', k: g - TAKES.studio.from, ...studioCamera(g, takeEvents('studio')) };
  if (g >= END_FRAME) return { take: null, scene: 'end' };
  return { take: 'gift', k: gift.openK + (g - OPEN_FRAME), ...giftCamera(g, gift) };
}
// Every window frame becomes 1080x1650 (one size for the whole sequence, so ffmpeg never rebuilds the graph mid-stream):
// the Studio is shot at that size; a gift frame (1080x1920) is cut at CSS y=825. A camera move is cropped at 2x for sub-pixel steps.
function windowFrames() {
  const dir = join(framesDir, 'win');
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const made = new Map(), rows = [];
  let last = null;
  for (let g = 0; g < TOTAL; g++) {
    const p = plan(g), out = join(dir, `w${String(g).padStart(5, '0')}.png`);
    rows.push({ g, take: p.take, k: p.k ?? null, zoom: p.zoom ? +p.zoom.toFixed(4) : null, px: p.take ? +p.px.toFixed(1) : null, py: p.take ? +p.py.toFixed(1) : null });
    if (!p.take) { symlinkSync(last ?? fname('studio', 0), out); continue; }
    const file = fname(p.take, p.k);
    if (!existsSync(file)) throw new Error(`コマがありません: ${file}（先にそのテイクを撮る）`);
    if (p.take === 'studio' && Math.abs(p.zoom - 1) < 1e-6) { symlinkSync(file, out); last = file; continue; }
    const key = `${file}@${p.zoom.toFixed(5)}@${p.px.toFixed(1)}@${p.py.toFixed(1)}`;
    if (made.has(key)) { symlinkSync(made.get(key), out); continue; }
    const w = 2 * SRC.w / p.zoom, h = 2 * SRC.h / p.zoom, x = 2 * p.px * (1 - 1 / p.zoom), y = 2 * p.py * (1 - 1 / p.zoom);
    execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', file, '-vf', `scale=${2 * SRC.w}:-1:flags=bicubic,crop=${w.toFixed(2)}:${h.toFixed(2)}:${x.toFixed(2)}:${y.toFixed(2)},scale=${SRC.w}:${SRC.h}:flags=lanczos,format=rgb24`, out]);
    made.set(key, out); last = out;
  }
  writeFileSync(join(dir, 'plan.json'), JSON.stringify(rows));
  return rows;
}
// An app point (CSS px of the shot: 540 wide) at video frame g -> overlay CSS px (540x960 of the 1080x1920 frame), through the
// camera of that frame. null when the camera has moved it outside the window.
function toOverlay(g, p) {
  const c = plan(g);
  if (!c.take) return null;
  const sx = c.px + (p.x * DPR - c.px) * c.zoom, sy = c.py + (p.y * DPR - c.py) * c.zoom;
  if (sx < 0 || sx > SRC.w || sy < 0 || sy > SRC.h) return null;
  return { x: (WIN.x + sx * WIN.scale) / DPR, y: (WIN.y + sy * WIN.scale) / DPR };
}
function compose() {
  const rows = windowFrames();
  mkdirSync(outDir, { recursive: true });
  // Every overlay frame to rgba: an opaque frame (S1, the end card) is saved as rgb24, and a pixel format change in the middle
  // of an image sequence makes ffmpeg rebuild the filter graph and drop the overlay on 1-2 frames (Day083).
  const overlayDir = join(framesDir, 'overlay-rgba');
  rmSync(overlayDir, { recursive: true, force: true }); mkdirSync(overlayDir, { recursive: true });
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', join(framesDir, 'overlay', 'o%05d.png'),
    '-vf', 'format=rgba', '-start_number', '0', join(overlayDir, 'o%05d.png')]);
  const silent = join(outDir, silentName);
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'warning', '-y',
    '-loop', '1', '-framerate', String(FPS), '-i', join(framesDir, 'background.png'),
    '-framerate', String(FPS), '-i', join(framesDir, 'win', 'w%05d.png'),
    '-loop', '1', '-framerate', String(FPS), '-i', join(framesDir, 'mask.png'),   // the rounded window (white inside, black outside)
    '-framerate', String(FPS), '-i', join(overlayDir, 'o%05d.png'),
    '-filter_complex', [
      '[0:v]format=rgba,scale=1080:1920:flags=lanczos,setsar=1[bg]',
      `[1:v]scale=${WIN.w}:${WIN.h}:flags=lanczos,format=rgba[app]`,
      `[2:v]scale=${WIN.w}:${WIN.h},format=gray[m]`,
      '[app][m]alphamerge[win]',
      `[bg][win]overlay=${WIN.x}:${WIN.y}:format=auto:shortest=1[b]`,
      '[b][3:v]overlay=0:0:format=auto,format=yuv420p[v]'].join(';'),
    '-map', '[v]', '-frames:v', String(TOTAL), '-r', String(FPS),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-map_metadata', '-1', silent], { stdio: 'inherit' });
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', silent, '-frames:v', '1', '-map_metadata', '-1', join(outDir, 'first-frame.png')]);
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', silent, '-vf', 'fps=1,scale=270:480,tile=8x4:padding=6:color=0x3B2A3F', '-frames:v', '1', '-q:v', '3', '-map_metadata', '-1', join(outDir, 'contact-sheet.jpg')]);
  // The first frame must already be moving: compare frames 0 and 1 / 3 of the encoded video (mean absolute difference, 0..255).
  const gray = (n) => execFileSync(ffmpeg, ['-v', 'error', '-i', silent, '-vf', `select=eq(n\\,${n}),scale=270:480,format=gray`, '-frames:v', '1', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 24 });
  const motion = (x, y) => { const [a, b] = [gray(x), gray(y)]; let diff = 0, changed = 0; for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); diff += d; if (d > 8) changed++; } return { meanAbsDiff: +(diff / a.length).toFixed(3), changedPixelsPercent: +(100 * changed / a.length).toFixed(2) }; };
  stats.firstFrameMotion = { frames0to1: motion(0, 1), frames0to3: motion(0, 3) };
  if (stats.firstFrameMotion.frames0to1.meanAbsDiff === 0) throw new Error('1コマ目と2コマ目が同じ（動いていない）');
  // Hook stillness: the smallest frame-to-frame change over the hook (every frame must move).
  const hookMotion = [];
  for (let n = 0; n < HOOK_END - 1; n += 8) hookMotion.push({ frame: n, ...motion(n, n + 1) });
  stats.hookMotion = { minMeanAbsDiff: Math.min(...hookMotion.map((m) => m.meanAbsDiff)), samples: hookMotion };
  // Every cut (and the drop), 2 frames before and 2 after (one row each), to look for half-way states at the joins.
  const cuts = [HOOK_END, TAKES.studio.from, frameAt(MUSIC_CUES.dropAt), CUT_FRAME, OPEN_FRAME, frameAt(bar(11))];
  const picks = cuts.flatMap((c) => [c - 2, c - 1, c, c + 1]);
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', silent, '-vf', `select='${picks.map((n) => `eq(n\\,${n})`).join('+')}',scale=270:480,tile=4x${cuts.length}:padding=6:color=0x3B2A3F`,
    '-vsync', '0', '-frames:v', '1', '-q:v', '3', '-map_metadata', '-1', join(outDir, 'cut-check.jpg')]);
  stats.cutCheck = { file: 'cut-check.jpg', rows: cuts.map((c) => ({ cutFrame: c, seconds: +(c / FPS).toFixed(3), frames: [c - 2, c - 1, c, c + 1] })) };
  const gift = takeEvents('gift');
  stats.cardZoom = { mode: 'reading', closedZoom: GIFT.closedZoom, readZoom: GIFT.read.zoom, readZoomEnd: GIFT.read.zoomEnd, pivot: 'bottom edge, then the bottom-left corner' };
  // The window rectangle per scene (one shape everywhere; S1 and the end card cover it with the overlay).
  stats.windowByScene = STORYBOARD.map((sc) => {
    const span = rows.filter((r) => r.g >= frameAt(sc.start) && r.g < frameAt(sc.end));
    const shown = span.filter((r) => r.take);
    return { id: sc.id, name: sc.name, window: shown.length ? { x: WIN.x, y: WIN.y, w: WIN.w, h: WIN.h, bottom: WIN.y + WIN.h } : null,
      takes: [...new Set(shown.map((r) => r.take))], zoom: shown.length ? [Math.min(...shown.map((r) => r.zoom)), Math.max(...shown.map((r) => r.zoom))] : null };
  });
}

// demo.mp4 for the 100-day list: the real screens only (no captions, rings or window), 540x960 (the 540x825 app centred on the
// page colour), 15-18 s. Studio from just before the mood to the photo at 1x, the sending part at 3x, then the gift opening.
function demo() {
  const list = [];
  const w = (g) => join(framesDir, 'win', `w${String(g).padStart(5, '0')}.png`);
  for (let g = frameAt(bar(2)) - 6; g < frameAt(bar(5)); g++) list.push(w(g));
  for (let g = frameAt(bar(5)); g < CUT_FRAME; g += 3) list.push(w(g));
  for (let g = OPEN_FRAME - 10; g < OPEN_FRAME + 165; g++) list.push(w(g));
  const dir = join(framesDir, 'demo-seq');
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  list.forEach((file, i) => symlinkSync(file, join(dir, `d${String(i).padStart(5, '0')}.png`)));
  const out = join(outDir, 'demo.mp4');
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', join(dir, 'd%05d.png'),
    '-vf', 'scale=540:825:flags=lanczos,pad=540:960:0:67:color=0xFFF8F2,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-an', '-movflags', '+faststart', '-map_metadata', '-1', out]);
  return { seconds: +(list.length / FPS).toFixed(2), bytes: statSync(out).size };
}
function screenshotWebp(png) {
  const out = join(outDir, 'screenshot.webp');
  for (const q of [82, 74, 66, 58, 50]) {
    execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', png, '-vf', 'scale=1200:750:flags=lanczos', '-c:v', 'libwebp', '-quality', String(q), '-map_metadata', '-1', out]);
    if (statSync(out).size <= 150 * 1024) return { quality: q, bytes: statSync(out).size };
  }
  throw new Error('screenshot.webp が150KBに収まらない');
}

function mux(variant) {
  const src = ['wav', 'mp3'].map((ext) => join(outDir, `bgm_${variant}.${ext}`)).find(existsSync);
  const out = join(outDir, `Day088_bouquet-studio_promo_${variant}.mp4`);
  if (!src) throw new Error(`BGMがありません: ${join(outDir, `bgm_${variant}.(wav|mp3)`)}`);
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', join(outDir, silentName), '-i', src,
    '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    '-af', `apad=whole_dur=${DURATION_SECONDS}`, '-t', String(DURATION_SECONDS), '-movflags', '+faststart', '-map_metadata', '-1', out]);
  return out;
}
function probe(file, kind = 'promo') {
  const p = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }));
  const v = p.streams.find((s) => s.codec_type === 'video'), a = p.streams.find((s) => s.codec_type === 'audio');
  const decode = execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-f', 'null', '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const seconds = Number(p.format.duration), bytes = statSync(file).size;
  let ok;
  if (kind === 'demo') ok = v.width === 540 && v.height === 960 && v.codec_name === 'h264' && v.pix_fmt === 'yuv420p' && !a && seconds >= 15 && seconds <= 18 && bytes <= 1.5 * 1024 * 1024 && decode.trim() === '';
  else {
    const silent = file.endsWith(silentName);
    ok = v.width === 1080 && v.height === 1920 && v.codec_name === 'h264' && v.pix_fmt === 'yuv420p' && v.r_frame_rate === '30/1'
      && Math.abs(seconds - DURATION_SECONDS) <= 1 / FPS + 0.001 && decode.trim() === ''
      && (silent ? !a : a?.codec_name === 'aac' && a.sample_rate === '48000' && a.channels === 2);
  }
  const row = { file: basename(file), ok, size: `${v.width}x${v.height}`, codec: v.codec_name, profile: v.profile, pix: v.pix_fmt, fps: v.r_frame_rate, frames: Number(v.nb_frames),
    seconds: +seconds.toFixed(3), bytes, audio: a ? `${a.codec_name} ${a.sample_rate}Hz ${a.channels}ch` : 'なし', decodeErrors: decode.trim() ? decode.trim().split('\n').length : 0 };
  log(ok ? '検査OK' : '検査NG', JSON.stringify(row));
  if (!ok) throw new Error(`出力が仕様と違います: ${file}`);
  return row;
}

// ---- Run (one browser at a time) ----
mkdirSync(framesDir, { recursive: true });
const started = Date.now(), timings = {};
const needApp = ['studio', 'gift', 'cards'].some(wanted);
if (wanted('studio')) needPhoto();
const server = needApp ? await startServer() : null;
let browser = null;
const timed = async (name, fn) => { const t0 = Date.now(); const r = await fn(); timings[name] = +((Date.now() - t0) / 60000).toFixed(1); return r; };
const extras = {};
try {
  if (needApp || wanted('overlay')) browser = await launch();
  let studio = existsSync(join(framesDir, 'studio', 'events.json')) ? JSON.parse(readFileSync(join(framesDir, 'studio', 'events.json'), 'utf8')) : null;
  if (wanted('studio')) studio = await timed('studio', () => shootStudio(browser));
  if (wanted('gift')) { if (!studio?.link) throw new Error('先に studio を撮る（リンクが要る）'); await timed('gift', () => shootGift(browser, studio.link)); }
  if (wanted('cards')) extras.cardsPng = await timed('cards', () => shootCards(browser, studio));
  if (!flag('--no-compose') && wanted('overlay')) await timed('overlay', () => shootOverlay(browser));
} finally {
  await browser?.close().catch(() => {});
  server?.kill();
}
const outputs = [];
if (!flag('--no-compose')) {
  compose();
  outputs.push(probe(join(outDir, silentName)));
  for (const variant of (arg('--mux', '') || '').split(',').filter(Boolean)) outputs.push(probe(mux(variant)));
  extras.demo = demo();
  outputs.push(probe(join(outDir, 'demo.mp4'), 'demo'));
  const cardsPng = extras.cardsPng ?? join(framesDir, 'cards-pc.png');
  if (existsSync(cardsPng)) extras.screenshot = screenshotWebp(cardsPng);
}
const previous = existsSync(join(framesDir, 'capture-report.json')) ? JSON.parse(readFileSync(join(framesDir, 'capture-report.json'), 'utf8')) : {};
const allTakes = { ...previous.takes, ...stats.takes };
delete allTakes.hook; delete allTakes.hookLink;   // the hook is cut from the gift take: an older report's own hook take must not be carried over
const tapsMeasured = (allTakes.studio?.taps ?? []).map((t) => t.seconds);
const tapDrift = TAP_CUES.map((cue) => ({ cue, nearest: tapsMeasured.reduce((best, t) => (Math.abs(t - cue) < Math.abs(best - cue) ? t : best), Infinity) }))
  .map((c) => ({ ...c, driftFrames: Math.round(Math.abs(c.nearest - c.cue) * FPS) }));
const gift = allTakes.gift;
const visual = gift ? {
  drop: { cue: MUSIC_CUES.dropAt, moodTapSeconds: (allTakes.studio?.taps ?? []).find((t) => t.label === 'かわいい')?.seconds ?? null },
  bloom: { cue: MUSIC_CUES.bloomAt, openStartsAtVideoSeconds: +(OPEN_FRAME / FPS).toFixed(3), note: 'gift の開き始め（teaser が消えた最初のコマ）を bloom のコマに置いている' },
  messageCardAtVideoSeconds: gift.cardK == null ? null : +((OPEN_FRAME + gift.cardK - gift.openK) / FPS).toFixed(3),
  messageCardHeldSeconds: gift.cardK == null ? null : +((END_FRAME - (OPEN_FRAME + gift.cardK - gift.openK)) / FPS).toFixed(3),
  messageCardZoomHeldSeconds: gift.cardK == null ? null : +((END_FRAME - (OPEN_FRAME + gift.cardK - gift.openK) - frameAt(GIFT.read.holdSeconds + GIFT.read.moveSeconds)) / FPS).toFixed(3),
  cardZoom: stats.cardZoom ?? previous.visualCues?.cardZoom ?? null,
  openedByTap: !!gift.openedByTap,
  makeLinkTapSeconds: (allTakes.studio?.taps ?? []).find((t) => t.label === 'リンクを作る')?.seconds ?? null,
  finishedScreenSeconds: (() => { const t = (allTakes.studio?.taps ?? []).find((x) => x.label === 'リンクを作る'); return t ? +((CUT_FRAME - frameAt(t.seconds)) / FPS).toFixed(3) : null; })(),
  cutToGiftSeconds: +(CUT_FRAME / FPS).toFixed(3),
} : null;
// Where the music really hits: the 10 ms window with the largest loudness rise within ±0.25 s of a cue, in each BGM file.
function onset(wavFile, cue) {
  const buf = readFileSync(wavFile);
  let o = 12, rate = 48000, channels = 2, data = null;
  while (o + 8 <= buf.length) { const id = buf.toString('ascii', o, o + 4), n = buf.readUInt32LE(o + 4); if (id === 'fmt ') { channels = buf.readUInt16LE(o + 10); rate = buf.readUInt32LE(o + 12); } if (id === 'data') { data = buf.subarray(o + 8, o + 8 + n); break; } o += 8 + n + (n % 2); }
  const win = Math.round(rate * 0.01), rms = (i0) => { let sum = 0; for (let i = i0; i < i0 + win; i++) for (let c = 0; c < channels; c++) { const v = data.readInt16LE((i * channels + c) * 2) / 32768; sum += v * v; } return Math.sqrt(sum / (win * channels)) + 1e-9; };
  let best = { rise: -Infinity, at: null };
  for (let t = cue - 0.25; t <= cue + 0.25; t += 0.005) { const i = Math.round(t * rate); const rise = 20 * Math.log10(rms(i) / rms(i - win)); if (rise > best.rise) best = { rise, at: t }; }
  return { cue, measured: +best.at.toFixed(3), riseDb: +best.rise.toFixed(1), offsetFrames: +((best.at - cue) * FPS).toFixed(2) };
}
const musicSync = ['a', 'b'].map((v) => join(outDir, `bgm_${v}.wav`)).filter(existsSync).map((file) => ({ file: basename(file), drop: onset(file, MUSIC_CUES.dropAt), bloom: onset(file, MUSIC_CUES.bloomAt) }));
const size = (dir) => readdirSync(dir, { withFileTypes: true }).reduce((sum, e) => sum + (e.isDirectory() ? size(join(dir, e.name)) : e.isFile() ? statSync(join(dir, e.name)).size : 0), 0);
const report = { seconds: DURATION_SECONDS, fps: FPS, width: 1080, height: 1920, beat: BEAT, bar: BAR, capture: `CSS ${VIEW.width}x${VIEW.height}, DPR ${DPR}, touch, ANGLE Metal`, window: WIN, giftCutCss: GIFT_CUT_CSS,
  appOrigin: stats.finishedScreen?.appOrigin ?? previous.appOrigin, linkOutputPrefix: stats.finishedScreen?.linkOutputPrefix ?? previous.linkOutputPrefix,
  finishedScreen: stats.finishedScreen ?? previous.finishedScreen, photo: PHOTO.source,
  realNetworkRequests: needApp ? Math.max(0, (stats.requestsSeen ?? 0) - stats.routed - stats.blocked.length) : previous.realNetworkRequests,
  routedToLocalBuild: needApp ? stats.routed : previous.routedToLocalBuild,
  windowByScene: stats.windowByScene ?? previous.windowByScene, hookMotion: stats.hookMotion ?? previous.hookMotion,
  captions: stats.captions ?? previous.captions, rings: stats.rings ?? previous.rings, captionGapFrames: stats.captionGapFrames ?? previous.captionGapFrames,
  gl: stats.gl ?? previous.gl, framesShot: { ...previous.framesShot, ...stats.frames }, takes: allTakes, tapCueDrift: tapDrift, visualCues: visual, musicSync,
  minutes: +((Date.now() - started) / 60000).toFixed(1), minutesByTake: Object.fromEntries(Object.entries({ ...previous.minutesByTake, ...timings }).filter(([k]) => k !== 'hook')), cutCheck: stats.cutCheck ?? previous.cutCheck,
  blockedRequests: stats.blocked.length, blocked: stats.blocked.slice(0, 20), consoleWarnings: stats.warnings.length ? stats.warnings : previous.consoleWarnings ?? [],
  firstFrameMotion: stats.firstFrameMotion ?? previous.firstFrameMotion, demo: extras.demo ?? previous.demo, screenshot: extras.screenshot ?? previous.screenshot, outputs, framesBytes: size(framesDir) };
writeFileSync(join(framesDir, 'capture-report.json'), JSON.stringify(report, null, 2) + '\n');
if (!flag('--no-compose')) writeFileSync(join(outDir, 'capture-report.json'), JSON.stringify(report, null, 2) + '\n');
log('完了', JSON.stringify({ minutes: report.minutes, minutesByTake: report.minutesByTake, blocked: report.blockedRequests, warnings: report.consoleWarnings.length, firstFrameMotion: report.firstFrameMotion }));
