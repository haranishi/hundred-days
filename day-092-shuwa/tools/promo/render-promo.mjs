// Day092 "てことば" promo video (vertical 1080x1920, 30 fps, 32 s), shot frame by frame from the real app.
// Software WebGL cannot keep up with real time, so the page clock (requestAnimationFrame, performance.now, Date.now,
// setTimeout, CSS/Web Animations) is frozen and advanced by 1/30 s per frame (two 1/60 s ticks, like a 60 Hz phone).
// The app is shot at CSS 540x760, DPR 2, and placed under a caption band (timeline.mjs APP). Captions, tap rings, the
// finger, the marks of bars 1-2 (arrows and the small window) and the end card are transparent frames composited by ffmpeg.
//
// Usage (from the repository root; the app is served read-only from a built dist copy):
//   node day-092-shuwa/tools/promo/render-promo.mjs --site-dir <.../dist> --frames-dir <work dir> --out-dir <output dir> --mux a,b
//   --only sign,inset,word,quiz,pairs,spell,dict,result,overlay   re-shoot only these (others reuse earlier frames)
//   --compose-only                                                no shooting, only overlay compositing and encoding
//   --no-compose                                                  shoot only
//   --mux a,b                                                     also mux <out-dir>/bgm_{a,b}.wav (video stream copied)
// Paths can also come from PROMO_SITE_DIR / PROMO_FRAMES_DIR / PROMO_OUT_DIR. Fonts: PROMO_FONT, PROMO_FONT_BLACK.
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { APP, BEAT, CAMERA, DICT, DURATION_SECONDS, END_CARD, INSET, MARKS, QUIZ, RESULT, SHAPE_CUES, SIGN, SPELL, STORYBOARD, TAKES, TAPS, TAP_CUES, TYPING, WORD, bar } from './timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const { chromium } = await import(pathToFileURL(join(root, 'node_modules/playwright-core/index.mjs')).href);
const FPS = 30, TOTAL = Math.round(DURATION_SECONDS * FPS);
const VIEW = { width: APP.width, height: APP.height }, DPR = 2;
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const flag = (name) => process.argv.includes(name);
const need = (value, what) => { if (!value) throw new Error(`${what} を指定してください（引数か環境変数）`); return resolve(value); };
const siteDir = need(arg('--site-dir', process.env.PROMO_SITE_DIR), '--site-dir');
const framesDir = need(arg('--frames-dir', process.env.PROMO_FRAMES_DIR), '--frames-dir');
const outDir = need(arg('--out-dir', process.env.PROMO_OUT_DIR), '--out-dir');
const font = process.env.PROMO_FONT || join(homedir(), 'Library/Fonts/ZenKakuGothicNew-Bold.ttf');
const fontBlack = process.env.PROMO_FONT_BLACK || join(homedir(), 'Library/Fonts/ZenKakuGothicNew-Black.ttf');
const port = Number(arg('--port', 4392));
const base = `http://127.0.0.1:${port}`;
const appPath = '/day-092-shuwa/';
const frameAt = (seconds) => Math.round(seconds * FPS);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
if (basename(siteDir) !== 'dist' || !existsSync(join(siteDir, 'day-092-shuwa/index.html'))) throw new Error(`--site-dir は day-092-shuwa を含む dist を指す: ${siteDir}`);
// The window's visible part: the post UI hides the bottom 20% of the 1920 px frame (CSS y 768 of 960 = app y 568).
const VISIBLE_BOTTOM = 768 - APP.top;
// A fixed "now" for the page (Date.now() after the freeze): the result screen's elapsed time is computed from it.
const EPOCH = Date.UTC(2026, 10, 13, 3, 0, 0);

// Which frames of the final video each take fills. "inset" is not in the sequence: its one frame fills the small window.
// The spell take shoots longer than its place in the video: SPELL.skip leaves out the still end of "り".
const TAKE_FRAMES = Object.fromEntries(Object.entries(TAKES).map(([take, t]) => [take, { from: frameAt(t.from), to: frameAt(t.to) }]));
const SKIP = { from: frameAt(SPELL.skip.from), frames: frameAt(SPELL.skip.seconds) };   // take-time frame where the cut starts
const takeToVideo = (take, g) => take !== 'spell' || g < SKIP.from ? g : g >= SKIP.from + SKIP.frames ? g - SKIP.frames : null;
const ALL = [...Object.keys(TAKES), 'inset'];
const only = (arg('--only', '') || '').split(',').filter(Boolean);
const wanted = (take) => !flag('--compose-only') && (!only.length || only.includes(take));

// ---- Frozen page clock (installed before any page script). __promoFreeze stops it, __promoStep(ms) advances it. ----
const CLOCK = `(() => {
  const realNow = performance.now.bind(performance), realRAF = requestAnimationFrame.bind(window), realCancel = cancelAnimationFrame.bind(window);
  const realDate = Date.now, realSet = setTimeout.bind(window), realClear = clearTimeout.bind(window);
  let virt = null, base = 0, queue = new Map(), id = 1e6, timers = new Map(), seen = new WeakSet();
  performance.now = () => virt ?? realNow();
  Date.now = () => virt === null ? realDate() : Math.round(base + virt);
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
  window.__promoFreeze = (epoch) => { if (virt === null) { virt = realNow(); base = epoch - virt; } return virt; };
  window.__promoStep = (ms) => {
    virt += ms;
    for (const [h, t] of [...timers].sort((x, y) => x[1].at - y[1].at)) if (t.at <= virt) { timers.delete(h); t.cb(...t.rest); }
    const q = [...queue.values()]; queue = new Map();
    for (const cb of q) cb(virt);
    syncAnimations(ms);
    return q.length;
  };
})();`;

// ---- Seeded local state (the same format the app saves). Sound and vibration off: the BGM carries the sound. ----
// Every take starts from the same record: lesson 1 finished yesterday (a 1-day streak), no experience points yet today.
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TODAY = new Date(), YESTERDAY = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() - 1);
const progressState = () => {
  const y = ymd(YESTERDAY);
  const s = { version: 1,
    settings: { dominant: 'right', dailyGoal: 20, sound: false, vibration: false, camera: false, reduceMotion: false, onboarded: true, startCourse: 'kana' },
    items: {}, lessons: { 'kana-unit-1-lesson-1': 1 }, xpByDay: { [y]: 10 }, streak: { current: 1, longest: 1, lastDate: y }, achievements: { 'first-lesson': y } };
  for (const id of ['kana-a', 'kana-i', 'kana-u']) s.items[id] = { box: 1, due: ymd(TODAY), correct: 2, wrong: 0, introducedAt: y };
  return s;
};
// Lesson 2 (え・お) in the order the app's lesson builder makes: intros, 4-choice questions, pairs, reading, spelling, try it.
const L2 = 'kana-unit-1-lesson-2';
const e2 = (n, rest) => ({ id: `${L2}-exercise-${n}`, ...rest });
const LESSON2 = [
  e2(1, { kind: 'intro', itemId: 'kana-e' }),
  e2(2, { kind: 'signToLabel', itemId: 'kana-e', options: ['kana-e', 'kana-ri', 'kana-ki', 'kana-o'], correctAnswer: 'kana-e' }),
  e2(3, { kind: 'intro', itemId: 'kana-o' }),
  e2(4, { kind: 'signToLabel', itemId: 'kana-o', options: ['kana-ho', 'kana-o', 'kana-e', 'kana-ki'], correctAnswer: 'kana-o' }),
  e2(5, { kind: 'labelToSign', itemId: 'kana-o', options: ['kana-e', 'kana-ho', 'kana-o', 'kana-ki'], correctAnswer: 'kana-o' }),
  e2(6, { kind: 'labelToSign', itemId: 'kana-e', options: ['kana-ki', 'kana-e', 'kana-o', 'kana-ri'], correctAnswer: 'kana-e' }),
  e2(7, { kind: 'pairs', itemIds: ['kana-e', 'kana-o', 'kana-a', 'kana-i'], signOrder: ['kana-a', 'kana-o', 'kana-i', 'kana-e'], labelOrder: ['kana-o', 'kana-e', 'kana-i', 'kana-a'] }),
  e2(8, { kind: 'readFingerspelling', word: { kana: 'あお', meaning: '青' }, sequence: ['kana-a', 'kana-o'], options: ['あお', 'いえ', 'うえ', 'あい'], correctAnswer: 'あお' }),
  e2(9, { kind: 'spellWord', word: { kana: 'あお', meaning: '青' }, options: ['kana-o', 'kana-e', 'kana-a', 'kana-u'], correctAnswer: ['kana-a', 'kana-o'] }),
  e2(10, { kind: 'tryIt', itemId: 'kana-e' }),
];
function savedSession(index, { value = null, started }) {
  const records = LESSON2.slice(0, index).map((e) => ({ exerciseId: e.id, correct: true }));
  const queue = LESSON2.slice(index + 1), session = { queue, current: LESSON2[index], records, answered: false, total: queue.length + records.length + 1 };
  return { version: 1, lessonId: L2, route: `#/lesson/${L2}`, session, exercises: LESSON2, value, started, cameraSuccess: false, matchedWithCamera: false, wordNoticeShown: false };
}
const PAIRS = LESSON2[6];
const SESSIONS = {
  quiz: savedSession(4, { started: EPOCH - 120000 }),
  pairs: savedSession(6, { started: EPOCH - 170000, value: { matched: ['kana-a', 'kana-i'], hadMismatch: false, mismatches: [] } }),
  // The result screen shows Date.now() minus `started`; the lesson is finished right at the freeze (Date.now() = EPOCH).
  result: savedSession(9, { started: EPOCH - RESULT.seconds * 1000 }),
};

// ---- Server (the repository's dist server, run inside the dist copy's parent) and browser. ----
const stats = { blocked: [], swStubbed: 0, warnings: [], driverNotes: 0, frames: {}, takes: {} };
const launch = () => chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function startServer() {
  const server = spawn(process.execPath, [join(root, 'scripts/serve-dist.mjs')], { cwd: dirname(siteDir), env: { ...process.env, PLAYWRIGHT_PORT: String(port) }, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${base}${appPath}`)).ok) return server; } catch { /* starting */ } await sleep(200); }
  server.kill(); throw new Error(`配信が起動しない: ${base}`);
}

async function newContext(browser, take) {
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: DPR, hasTouch: true, isMobile: true, locale: 'ja-JP',
    reducedMotion: 'no-preference', serviceWorkers: 'block' });
  await context.addInitScript(CLOCK);
  await context.addInitScript(({ state, session }) => {
    if (sessionStorage.getItem('promo-seeded')) return;
    localStorage.clear();
    localStorage.setItem('tekotoba:v1', JSON.stringify(state));
    if (session) localStorage.setItem('tekotoba:session:v1', JSON.stringify(session));
    sessionStorage.setItem('promo-seeded', 'yes');
  }, { state: progressState(), session: SESSIONS[take] ?? null });
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== base) { stats.blocked.push(url.href); return route.abort(); }
    // The offline cache (service worker) is not part of what is shown: its registration script is answered with nothing.
    if (url.pathname === `${appPath}registerSW.js`) { stats.swStubbed++; return route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: '' }); }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (!['warning', 'error'].includes(message.type())) return;
    // A browser graphics performance note printed on every screenshot (GPU readback), not an app warning.
    if (/GL Driver Message .*GPU stall due to ReadPixels/.test(message.text())) { stats.driverNotes++; return; }
    stats.warnings.push(`${take}: ${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => stats.warnings.push(`${take}: pageerror: ${error.message}`));
  const cdp = await context.newCDPSession(page);
  return { context, page, cdp };
}
const settle = (page, n = 3) => page.evaluate((n) => { for (let i = 0; i < n; i++) window.__promoStep(0); }, n);
const step = (page) => page.evaluate(() => { window.__promoStep(1000 / 60); window.__promoStep(1000 / 60); });
const freeze = async (page) => { await page.evaluate((epoch) => window.__promoFreeze(epoch), EPOCH); await settle(page); };
const ready = (page) => page.waitForFunction(() => document.querySelector('.hand-view')?.dataset.status === 'ready', null, { timeout: 180000 });
// Targets: a CSS selector, or "button:<text>", "tab:<text>", "view:self|viewer" (the hand's view switch), "pair:<side>:<id>".
const pairSelector = (side, id) => {
  const order = side === 'sign' ? PAIRS.signOrder : PAIRS.labelOrder;
  return `.pairs__column:nth-of-type(${side === 'sign' ? 1 : 2}) > button:nth-of-type(${order.indexOf(id) + 1})`;
};
const resolveTarget = (spec) => spec.startsWith('pair:') ? pairSelector(...spec.split(':').slice(1)) : spec;
const FIND = `(spec) => {
  const text = (el) => el.textContent.replace(/\\s+/g, '');
  const [kind, value] = spec.includes(':') && !/^[.#\\[]/.test(spec) ? [spec.slice(0, spec.indexOf(':')), spec.slice(spec.indexOf(':') + 1)] : ['css', spec];
  if (kind === 'css') return document.querySelector(value);
  if (kind === 'view') return [...document.querySelectorAll('.hand-view__switch button')].find((b) => text(b) === (value === 'self' ? '自分から見る' : '相手から見る'));
  if (kind === 'tab') return [...document.querySelectorAll('.course-tab')].find((b) => text(b) === value);
  return [...document.querySelectorAll('button')].find((b) => text(b) === value && b.getClientRects().length);
}`;
const rect = (page, spec) => page.evaluate(([find, s]) => { const el = (0, eval)(find)(s); const r = el && getComputedStyle(el).visibility !== 'hidden' ? el.getBoundingClientRect() : null; return r && r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null; }, [FIND, resolveTarget(spec)]);
const press = (page, spec) => page.evaluate(([find, s]) => {
  const el = (0, eval)(find)(s);
  if (!el) throw new Error(`見つからない: ${s}`);
  if (el.disabled) throw new Error(`押せない状態: ${s}`);
  if (el.tagName === 'INPUT') el.focus(); else el.click();
}, [FIND, resolveTarget(spec)]);
// Scroll the page so that an element's top sits at `top` (CSS px from the window's top), as a finger would leave it.
const scrollTo = (page, selector, top) => page.evaluate(([s, top]) => { const r = document.querySelector(s).getBoundingClientRect(); window.scrollTo(0, Math.max(0, window.scrollY + r.top - top)); return Math.round(window.scrollY); }, [selector, top]);
function takeDir(take) { const dir = join(framesDir, take); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true }); return dir; }
const shoot = (page, dir, index) => page.screenshot({ path: join(dir, `f${String(index).padStart(5, '0')}.png`), type: 'png', timeout: 120000 });
const touchOf = (cdp) => (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y, id: 3, radiusX: 9, radiusY: 9, force: 1 }] : [] });
const ease = (u) => u * u * (3 - 2 * u);
const waitReady = (page, fn, arg) => page.waitForFunction(fn, arg, { timeout: 180000 });
const imagesDone = () => [...document.images].every((i) => i.complete) && !document.querySelector('.thumbnail--fallback');
const box = (r) => r && { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) };

// What each take records per frame (for the report and the storyboard check).
const STATE = {
  sign: () => { const v = document.querySelector('.hand-view'); const reset = [...document.querySelectorAll('.hand-view__btn')].find((b) => b.textContent.trim() === '向きを戻す');
    return { status: v?.dataset.status, perspective: v?.dataset.perspective, rotated: !!reset && !reset.disabled }; },
  inset: () => ({ perspective: document.querySelector('.hand-view')?.dataset.perspective }),
  word: () => { const v = document.querySelector('.hand-view'); return { status: v?.dataset.status, label: document.querySelector('.sign-label')?.textContent, notice: !!document.querySelector('.sign-notice') }; },
  quiz: () => ({ header: document.querySelector('.lesson__header .small')?.textContent, selected: document.querySelector('.choice--selected')?.dataset.option ?? null,
    correct: document.querySelector('.choice--correct')?.dataset.option ?? null, feedback: document.querySelector('.feedback h2')?.textContent ?? null }),
  pairs: () => ({ header: document.querySelector('.lesson__header .small')?.textContent, matched: document.querySelectorAll('.pairs .pair-choice--matched').length,
    status: document.querySelector('.pair-status')?.textContent ?? null, feedback: document.querySelector('.feedback h2')?.textContent ?? null }),
  spell: () => ({ input: document.querySelector('#spell-input')?.value, current: document.querySelector('.spell-character[aria-current="step"]')?.textContent ?? null,
    status: document.querySelector('.spell-player [role="status"]')?.textContent ?? null, ready: document.querySelector('.spell-player .hand-view')?.dataset.status ?? null,
    topbar: document.querySelector('.topbar__streak')?.getAttribute('aria-label') ?? null, goal: document.querySelector('.topbar__goal strong')?.textContent ?? null }),
  dict: () => ({ tab: document.querySelector('.course-tab[aria-pressed="true"]')?.textContent, count: document.querySelector('.collection > p.small')?.textContent,
    fallback: document.querySelectorAll('.thumbnail--fallback').length }),
  result: () => ({ route: location.hash, xp: document.querySelector('.result-stats .stat strong span')?.textContent ?? null, accuracy: document.querySelectorAll('.result-stats .stat strong')[1]?.textContent ?? null,
    streak: document.querySelector('.streak-card strong')?.textContent ?? null, streakText: document.querySelector('.streak-card p')?.textContent ?? null,
    topbar: document.querySelector('.topbar__streak')?.getAttribute('aria-label') ?? null, goal: document.querySelector('.topbar__goal strong')?.textContent ?? null }),
};
const state = (page, take) => page.evaluate(`({ ...(${STATE[take]})(), scrollY: Math.round(scrollY) })`);
// Thumbnails come from a cache once drawn; when a tab switch shows cached ones, let them land before the shot.
async function settleThumbnails(page) {
  for (let i = 0; i < 40; i++) {
    if (await page.evaluate(imagesDone)) return i;
    await settle(page, 2); await sleep(25);
  }
  throw new Error('一覧の小さな画像がそろわない');
}
// A finger swipe up (CDP touch), slowing to a stop before lifting so the page does not fling on.
async function swipeFrame(touch, sw, g, x, y0, events) {
  if (g < sw.f0 || g > sw.f1) return;
  const e = ease((g - sw.f0) / (sw.f1 - sw.f0)), p = { x, y: y0 + sw.dy * e };
  await touch(g === sw.f0 ? 'touchStart' : g === sw.f1 ? 'touchEnd' : 'touchMove', g === sw.f1 ? null : p);
  if (g < sw.f1) events.fingers.push({ frame: g, points: [p] });
  await sleep(30);
}

// ---- One take: open the page in its state, freeze, then step through its frames with taps, typing, drags and swipes. ----
async function shootTake(browser, take) {
  const { context, page, cdp } = await newContext(browser, take);
  const span = take === 'inset' ? { from: 0, to: 1 } : TAKE_FRAMES[take];
  const from = span.from, to = span.to + (take === 'spell' ? SKIP.frames : 0), dir = takeDir(take), touch = touchOf(cdp);
  const events = { taps: [], fingers: [], states: [], letters: [], notes: [], geometry: {} };
  const tapAt = Object.fromEntries(TAPS.filter((t) => t.take === take).map((t) => [frameAt(t.at), t]));
  const typeAt = take === 'spell' ? Object.fromEntries(TYPING.map((t) => [frameAt(t.at), t.char])) : {};
  const drags = take === 'sign' ? SIGN.drags.map((d) => ({ ...d, f0: frameAt(d.from), f1: frameAt(d.to) })) : [];
  const dictSwipe = take === 'dict' ? { ...DICT.swipe, f0: frameAt(DICT.swipe.from), f1: frameAt(DICT.swipe.to) } : null;
  try {
    if (take === 'sign' || take === 'inset' || take === 'word') {
      const spec = take === 'word' ? WORD : SIGN;
      await page.goto(`${base}${appPath}${spec.hash}`);
      await ready(page);
      if (take === 'word') {
        // Close the first-time notice with its own "i" button (as a user would), so the face and both hands show.
        await page.evaluate(() => document.querySelector('.sign-info')?.click());
        await waitReady(page, () => !document.querySelector('.sign-notice'));
      }
      if (take === 'inset') await press(page, 'view:self');
      events.notes.push({ scrollY: await scrollTo(page, spec.anchor, spec.anchorTop) });
      await sleep(300);
      await freeze(page);
      if (take === 'sign') {
        // "ゆっくり" before frame 0, so the hand is mid-way through forming "あ" on frame 0 (formation 0.9 s at half speed).
        const preroll = frameAt(1.8 - SIGN.slowLandsAt);
        await press(page, 'button:ゆっくり');
        for (let i = 0; i < preroll; i++) await step(page);
        events.notes.push({ prerollFrames: preroll, pressed: 'ゆっくり' });
        // The places the camera and the marks are built on (app CSS px, after the scroll).
        // (向きを戻す keeps its place while hidden, so its box is read even before the hand is turned.)
        events.geometry = { stage: box(await rect(page, '.hand-view__stage')),
          reset: box(await page.evaluate(() => [...document.querySelectorAll('.hand-view__btn')].find((b) => b.textContent.trim() === '向きを戻す')?.getBoundingClientRect().toJSON())),
          card: box(await page.evaluate(() => document.querySelector('.card.prose')?.getBoundingClientRect().toJSON())), switch: box(await rect(page, '.hand-view__switch')) };
      }
      if (take === 'inset') await settle(page, 4);
    } else if (['quiz', 'pairs', 'result'].includes(take)) {
      await page.goto(`${base}${appPath}#/lesson/${L2}`);
      await waitReady(page, () => [...document.querySelectorAll('button')].some((b) => b.textContent.startsWith('続きから')));
      await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.startsWith('続きから')).click());
      if (take === 'result') {
        // Answer the last question ("やってみよう", self-checked with できた) and press つづける off screen. The result screen is
        // scrolled (before the scene) so the streak card shows and the mascot is fully above the window.
        await ready(page);
        await press(page, 'button:できた');
        await waitReady(page, () => [...document.querySelectorAll('.lesson__footer button')].some((b) => b.textContent.includes('つづける') && !b.disabled));
        await sleep(450);
        await freeze(page);
        await press(page, 'button:つづける');
        await waitReady(page, () => document.querySelector('main.result'));
        await settle(page);
        events.notes.push({ scrollY: await scrollTo(page, RESULT.anchor, RESULT.anchorTop) });
        events.geometry = { mascot: box(await page.evaluate(() => document.querySelector('main.result > :first-child')?.getBoundingClientRect().toJSON())),
          streak: box(await rect(page, '.streak-card')) };
      } else {
        await waitReady(page, take === 'quiz' ? () => document.querySelectorAll('.choices .thumbnail img').length === 4 : () => document.querySelectorAll('.pairs .thumbnail img').length === 4);
        await waitReady(page, imagesDone);
        await sleep(300);
        await freeze(page);
      }
    } else if (take === 'spell') {
      // Open a dictionary page first (as a user coming from the dictionary), so the 3D part is loaded before the name is played.
      await page.goto(`${base}${appPath}#/dict/kana-a`);
      await ready(page);
      await page.evaluate(() => { location.hash = '#/spell'; });
      await page.waitForSelector('#spell-input');
      await sleep(300);
      await freeze(page);
    } else if (take === 'dict') {
      await page.goto(`${base}${appPath}#/dict`);
      await page.waitForSelector('.catalog-grid');
      // Draw every tab's small images once (they are cached), then come back to 指文字 and scroll the tabs into the window.
      for (const tab of ['数字', 'あいさつ', '指文字']) { await press(page, `tab:${tab}`); await waitReady(page, imagesDone); }
      events.notes.push({ scrollY: await scrollTo(page, '.course-tabs', DICT.anchorTop) });
      await sleep(300);
      await freeze(page);
    }
    let prevLetter = null;
    for (let g = from; g < to; g++) {
      const tap = tapAt[g];
      if (tap) {
        const at = await rect(page, tap.target);
        if (!at) throw new Error(`押す部品が見えない: ${tap.target}（${g}コマ目）`);
        if (at.top < 0 || at.bottom > VISIBLE_BOTTOM) events.notes.push({ frame: g, outsideVisible: tap.label, top: Math.round(at.top), bottom: Math.round(at.bottom) });
        events.taps.push({ frame: g, label: tap.label, target: tap.target, noLead: !!tap.noLead, x: at.x, y: at.y, w: at.w, h: at.h, scrollY: await page.evaluate(() => Math.round(scrollY)) });
        await press(page, tap.target);
        await settle(page, 1);
      }
      if (typeAt[g]) { await page.keyboard.insertText(typeAt[g]); await settle(page, 1); }
      // Turn the 3D hand with one finger, to the left only, touching the right side of the fist (the thumb stays visible).
      for (const d of drags) {
        if (g < d.f0 || g > d.f1) continue;
        const stage = d.stage ??= await rect(page, '.hand-view__stage');
        const e = ease((g - d.f0) / (d.f1 - d.f0)), x0 = stage.x + SIGN.fingerStart[0];
        const p = { x: x0 + d.dx * e, y: stage.y + SIGN.fingerStart[1] - 8 * Math.sin(Math.PI * e) };
        await touch(g === d.f0 ? 'touchStart' : g === d.f1 ? 'touchEnd' : 'touchMove', g === d.f1 ? null : p);
        if (g < d.f1) events.fingers.push({ frame: g, points: [p] });
      }
      if (dictSwipe) await swipeFrame(touch, dictSwipe, g, VIEW.width * 0.62, 560, events);
      await step(page);
      if (take === 'dict' || take === 'pairs' || take === 'quiz') await settleThumbnails(page);
      const s = await state(page, take);
      // A ring belongs to what was pressed: it ends when the page jumps (scrolls), the route changes, or the pressed
      // control goes away, so it never sits on something else.
      for (const t of events.taps) if (t.endFrame === undefined && g - t.frame < 15 && (Math.abs(s.scrollY - t.scrollY) > 20 || !(await rect(page, t.target)))) t.endFrame = g;
      if (take === 'spell' && s.current && s.current !== prevLetter) { events.letters.push({ frame: g, char: s.current }); prevLetter = s.current; }
      await shoot(page, dir, g - from);
      events.states.push({ frame: g, ...s });
      if ((g - from) % 30 === 0) log(take, g - from, '/', to - from, JSON.stringify(s));
    }
    // Events in video frames (the spell take leaves out SPELL.skip; nothing is pressed inside the part left out).
    for (const list of [events.taps, events.fingers, events.letters]) for (const e of list) {
      e.frame = takeToVideo(take, e.frame);
      if (e.endFrame !== undefined) e.endFrame = takeToVideo(take, e.endFrame) ?? e.frame + 1;
    }
    events.letters.forEach((l) => { l.seconds = +(l.frame / FPS).toFixed(3); });
    stats.frames[take] = to - from;
    stats.takes[take] = { taps: events.taps.map((t) => ({ seconds: +(t.frame / FPS).toFixed(3), label: t.label, ...(t.endFrame ? { ringEndsAt: +(t.endFrame / FPS).toFixed(3) } : {}) })),
      letters: events.letters, notes: events.notes, geometry: events.geometry, first: events.states[0], last: events.states.at(-1) };
    writeFileSync(join(dir, 'events.json'), JSON.stringify(events, null, 1));
  } finally { await context.close(); }
}

// ---- Camera on the sign take: crops of the shot frames (in app CSS px), the same for the overlay and for compose. ----
function cameraPlan() {
  const g = JSON.parse(readFileSync(join(framesDir, 'sign', 'events.json'), 'utf8')).geometry;
  if (!g?.stage || !g.reset || !g.card) throw new Error('sign の寸法がありません（先に sign を撮る）');
  // Bars 1-3: the whole window, cut off just above the description card (filled with the page colour below).
  const maskY = g.card.top - CAMERA.maskAboveCard;
  if (maskY <= g.switch.bottom + 4) throw new Error(`説明カードを隠すと切替ボタンも隠れる: ${maskY}`);
  // The turn: the bottom edge just above the 3D view's bottom edge, the left edge left of the thumb, the right edge at
  // "向きを戻す"; the height follows the window's aspect (the part above the page top is filled with the page colour).
  const right = g.reset.right, left = g.stage.left + CAMERA.turn.thumbMargin, bottom = g.stage.bottom - CAMERA.turn.aboveStageBottom;
  const w = right - left, h = w * APP.height / APP.width, top = bottom - h;
  if (g.reset.bottom > bottom) throw new Error('向きを戻すが寄りの外に出る');
  return { maskY, from: frameAt(CAMERA.turn.from), turn: { x: left, y: top, w, h, scale: APP.width / w } };
}
// App CSS point -> window point for a sign-take frame (identity before the turn, the turn's crop after).
const camPoint = (plan, f, p) => {
  if (!plan || f < plan.from || f >= TAKE_FRAMES.sign.to) return p;
  const c = plan.turn; return { x: (p.x - c.x) * c.scale, y: (p.y - c.y) * c.scale };
};

// ---- Overlay frames (captions, tap rings, finger, the marks of bars 1-2, end card), transparent PNGs. ----
const CUTS = Object.values(TAKES).map((t) => t.from).filter((t) => t > 0);
async function shootOverlay(browser) {
  const dir = takeDir('overlay'), plan = cameraPlan();
  const takeOf = (f) => Object.entries(TAKE_FRAMES).find(([, r]) => f >= r.from && f < r.to)?.[0];
  const events = Object.keys(TAKES).flatMap((take) => {
    const file = join(framesDir, take, 'events.json');
    return existsSync(file) ? [JSON.parse(readFileSync(file, 'utf8'))] : [];
  });
  // App coordinates -> window (through the camera) -> overlay coordinates (the window starts at APP.top). A ring stays
  // inside its own take's frames (it never shows on the scene before its press).
  const taps = events.flatMap((e) => e.taps).map((t) => { const p = camPoint(plan, t.frame, t), r = TAKE_FRAMES[takeOf(t.frame)];
    return { ...t, x: p.x, y: p.y + APP.top, scale: plan && t.frame >= plan.from && t.frame < TAKE_FRAMES.sign.to ? plan.turn.scale : 1, takeFrom: r.from, takeTo: r.to }; });
  const fingers = Object.fromEntries(events.flatMap((e) => e.fingers).map((f) => [f.frame, f.points.map((p) => { const q = camPoint(plan, f.frame, p); return { x: q.x, y: q.y + APP.top }; })]));
  const icon = readFileSync(join(siteDir, 'day-092-shuwa/favicon.svg'), 'utf8');
  if (!existsSync(join(framesDir, 'inset', 'f00000.png'))) throw new Error('小窓のコマがありません（先に inset を撮る）');
  const context = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.route('**/*', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: overlayHtml(icon) });
    if (path === '/font.ttf') return route.fulfill({ contentType: 'font/ttf', body: readFileSync(font) });
    if (path === '/font-black.ttf') return route.fulfill({ contentType: 'font/ttf', body: readFileSync(fontBlack) });
    if (path === '/inset.png') return route.fulfill({ contentType: 'image/png', body: readFileSync(join(framesDir, 'inset', 'f00000.png')) });
    stats.blocked.push(route.request().url()); return route.abort();
  });
  await page.goto('http://promo.local/');
  await page.evaluate(async () => { await document.fonts.load('700 30px Promo'); await document.fonts.load('900 30px PromoBlack'); await document.fonts.ready; });
  await page.evaluate((data) => window.__setup(data), { storyboard: STORYBOARD, taps, fingers, end: END_CARD, total: TOTAL, fps: FPS, appTop: APP.top,
    marks: MARKS, inset: INSET, dropAt: bar(2) });
  await page.evaluate(() => document.querySelector('.inset img').decode());
  const overflow = await page.evaluate(() => window.__overflow());
  if (overflow.length) throw new Error(`字幕が1行に収まらない: ${overflow.join(' / ')}`);
  for (let f = 0; f < TOTAL; f++) {
    await page.evaluate((f) => window.__frame(f), f);
    await page.screenshot({ path: join(dir, `o${String(f).padStart(5, '0')}.png`), omitBackground: true });
  }
  stats.captionBoxes = await page.evaluate(() => window.__boxes());
  stats.frames.overlay = TOTAL;
  await context.close();
}

function overlayHtml(icon) {
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><style>
  @font-face { font-family: Promo; src: url(/font.ttf); font-weight: 700; }
  @font-face { font-family: PromoBlack; src: url(/font-black.ttf); font-weight: 900; }
  :root { --ink: #1F2544; --blue: #4C5FD5; --bg: #FFF9F0; --accent: #FF8A3D; }
  html, body { margin: 0; width: 540px; height: 960px; overflow: hidden; background: transparent; font-family: PromoBlack, Promo, sans-serif; color: var(--ink); }
  .cap { position: absolute; left: 10px; right: 10px; top: 80px; height: 112px; display: flex; flex-direction: column; justify-content: center; align-items: center; }
  .cap span { display: block; font-size: 34px; line-height: 1.3; font-weight: 900; letter-spacing: .02em; white-space: nowrap; }
  .cap span:last-child { color: var(--blue); }
  .cap.big span { font-size: 40px; line-height: 1.24; }
  .edge { position: absolute; left: 0; right: 0; height: 14px; background: linear-gradient(rgba(31, 37, 68, .10), rgba(31, 37, 68, 0)); }
  .edge::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 1px; background: rgba(31, 37, 68, .14); }
  .tap { position: absolute; width: 62px; height: 62px; margin: -31px; border-radius: 50%; border: 3.5px solid #fff; background: rgba(255, 138, 61, .28);
    box-shadow: 0 0 0 3px rgba(31, 37, 68, .5), 0 0 14px rgba(31, 37, 68, .25); box-sizing: border-box; opacity: 0; }
  .finger { position: absolute; width: 64px; height: 64px; margin: -32px; border-radius: 50%; border: 4px solid rgba(255, 255, 255, .95);
    box-shadow: 0 0 0 3px rgba(76, 95, 213, .55), inset 0 0 0 3px rgba(76, 95, 213, .25); box-sizing: border-box; }
  svg.marks { position: absolute; inset: 0; overflow: visible; }
  .pill { position: absolute; transform: translate(-50%, -50%); white-space: nowrap; font-family: Promo, sans-serif; font-weight: 700; font-size: 16px; line-height: 1;
    padding: 6px 10px 7px; border-radius: 20px; background: #fff; color: var(--ink); box-shadow: 0 1px 0 rgba(31, 37, 68, .12), 0 3px 10px rgba(31, 37, 68, .16); opacity: 0; }
  .inset { position: absolute; overflow: hidden; border-radius: 14px; border: 3px solid #fff; box-shadow: 0 0 0 1.5px rgba(31, 37, 68, .18), 0 8px 22px rgba(31, 37, 68, .22); background: var(--bg); opacity: 0; box-sizing: content-box; }
  .inset img { position: absolute; display: block; }
  .end { position: absolute; inset: 0; display: none; overflow: hidden; background: radial-gradient(ellipse at 50% 40%, #fffdf8, #fff9f0 55%, #f7efe2); }
  .end-body { position: absolute; left: 0; right: 0; top: 136px; text-align: center; }
  .end-body > * { opacity: 0; }
  .end .pillday { display: inline-block; font-size: 14px; letter-spacing: .2em; color: var(--blue); border: 1.5px solid #4c5fd599; padding: 8px 16px; border-radius: 30px; background: #fff; }
  .end .logo { display: block; margin: 24px auto 0; width: 76px; height: 76px; }
  .end .logo svg { width: 100%; height: 100%; }
  .end h1 { font-family: PromoBlack, Promo, sans-serif; font-size: 72px; letter-spacing: .04em; margin: 12px 0 6px; font-weight: 900; color: var(--ink); }
  .end .sub { font-family: Promo, sans-serif; font-weight: 700; font-size: 25px; margin: 0 0 28px; color: var(--ink); white-space: nowrap; }
  .end .badges { display: flex; justify-content: center; gap: 9px; flex-wrap: wrap; padding: 0 30px; }
  .end .badges b { font-family: Promo, sans-serif; font-size: 18px; font-weight: 700; padding: 9px 15px; border-radius: 30px; border: 1.5px solid #1f254440; background: #fff; }
  .end .badges b:first-child { background: var(--blue); color: #fff; border-color: var(--blue); }
  .end .url { font-family: Promo, sans-serif; font-weight: 700; margin: 34px auto 0; display: inline-block; font-size: 21px; letter-spacing: .01em; color: #fff; background: var(--ink); padding: 14px 20px; border-radius: 14px; }
  </style>
  <div class="cap"></div>
  <div class="edge"></div>
  <div class="inset"><img src="/inset.png" alt=""></div>
  <svg class="marks" viewBox="0 0 540 960" width="540" height="960"></svg>
  <div class="pill pill-viewer"></div><div class="pill pill-self"></div><div class="pill pill-inset"></div>
  <div class="taps"></div>
  <div class="fingers"></div>
  <div class="end"><div class="end-body"><div class="pillday end-day"></div>
      <div class="logo">${icon}</div>
      <h1 class="end-title"></h1><p class="sub end-sub"></p><div class="badges end-badges"></div><div><span class="url end-url"></span></div></div></div>
  <script>
  const $ = (s) => document.querySelector(s);
  const NS = 'http://www.w3.org/2000/svg';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), easeOut = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;
  let D, current = null, arrows = {};
  const lines = (scene) => scene.lines.map((text) => Object.assign(document.createElement('span'), { textContent: text }));
  // An arrow (white outline, orange stroke, head) from a to b, drawn in by "progress" 0..1.
  function makeArrow(width) {
    const g = document.createElementNS(NS, 'g'), under = document.createElementNS(NS, 'path'), line = document.createElementNS(NS, 'path'), head = document.createElementNS(NS, 'path');
    under.setAttribute('stroke', '#fff'); under.setAttribute('stroke-width', width + 5); line.setAttribute('stroke', '#FF8A3D'); line.setAttribute('stroke-width', width);
    for (const p of [under, line]) { p.setAttribute('fill', 'none'); p.setAttribute('stroke-linecap', 'round'); }
    head.setAttribute('fill', '#FF8A3D'); head.setAttribute('stroke', '#fff'); head.setAttribute('stroke-width', 2.5); head.setAttribute('stroke-linejoin', 'round');
    g.append(under, line, head); $('svg.marks').append(g);
    return { set(a, b, progress, opacity) {
      const t = clamp(progress, 0, 1), end = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const d = 'M' + a.join(' ') + 'L' + end.join(' ');
      under.setAttribute('d', d); line.setAttribute('d', d);
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), L = width * 2.6, W = width * 1.7, tip = [end[0] + Math.cos(ang) * L * 0.55, end[1] + Math.sin(ang) * L * 0.55];
      const back = [tip[0] - Math.cos(ang) * L, tip[1] - Math.sin(ang) * L], n = [-Math.sin(ang) * W, Math.cos(ang) * W];
      head.setAttribute('d', 'M' + tip.join(' ') + 'L' + (back[0] + n[0]) + ' ' + (back[1] + n[1]) + 'L' + (back[0] - n[0]) + ' ' + (back[1] - n[1]) + 'Z');
      head.style.opacity = t > 0.6 ? 1 : 0; g.style.opacity = opacity;
    } };
  }
  const app = (p) => [p[0], p[1] + D.appTop];
  const pillAt = (el, p, text, opacity) => { el.textContent = text; el.style.left = p[0] + 'px'; el.style.top = (p[1] + D.appTop) + 'px'; el.style.opacity = opacity; };
  window.__setup = (data) => {
    D = data;
    $('.edge').style.top = data.appTop + 'px';
    $('.end-day').textContent = data.end.day; $('.end-title').textContent = data.end.title; $('.end-sub').textContent = data.end.sub;
    $('.end-badges').replaceChildren(...data.end.badges.map((text) => Object.assign(document.createElement('b'), { textContent: text })));
    $('.end-url').textContent = data.end.url;
    $('.taps').replaceChildren(...data.taps.map((tap) => { const el = document.createElement('div'); el.className = 'tap'; el.style.left = tap.x + 'px'; el.style.top = tap.y + 'px'; return el; }));
    // The small window: the inset take's frame, scaled so the crop fills the box.
    const I = data.inset, s = I.box.w / I.crop.w, box = $('.inset');
    Object.assign(box.style, { left: I.box.x + 'px', top: (I.box.y + data.appTop) + 'px', width: I.box.w + 'px', height: (I.crop.h * s) + 'px' });
    Object.assign($('.inset img').style, { width: (540 * s) + 'px', height: (760 * s) + 'px', left: (-I.crop.x * s) + 'px', top: (-I.crop.y * s) + 'px' });
    D.insetScale = s;
    arrows = { viewer: makeArrow(7), self: makeArrow(7), inset: makeArrow(4.5) };
  };
  // Every caption line must fit on one line inside the band (checked before shooting).
  window.__overflow = () => D.storyboard.flatMap((scene) => {
    $('.cap').replaceChildren(...lines(scene)); $('.cap').classList.toggle('big', !!scene.big);
    return [...$('.cap').children].filter((el) => el.getBoundingClientRect().width > 520).map((el) => el.textContent);
  });
  window.__boxes = () => D.storyboard.filter((s) => s.lines.length).map((scene) => {
    $('.cap').replaceChildren(...lines(scene)); $('.cap').classList.toggle('big', !!scene.big);
    const r = [...$('.cap').children].map((el) => el.getBoundingClientRect());
    return { id: scene.id, top: Math.round(Math.min(...r.map((b) => b.top))), bottom: Math.round(Math.max(...r.map((b) => b.bottom))), widest: Math.round(Math.max(...r.map((b) => b.width))) };
  });
  window.__frame = (f) => {
    // Scene changes and the end card are compared in whole frames, the same rounding as the cuts.
    const t = f / D.fps, fr = (sec) => Math.round(sec * D.fps), scene = D.storyboard.findLast((s) => f >= fr(s.start)) ?? D.storyboard[0];
    if (current !== scene.id) {
      current = scene.id;
      $('.cap').replaceChildren(...lines(scene));
      $('.cap').classList.toggle('big', !!scene.big);
    }
    // The first scene is fully visible from frame 0 (the first frame is the post's thumbnail). Later captions start 0.1 s
    // into their fade on the cut frame, so no frame shows an empty band (the old caption is gone on the same frame).
    const age = (f - fr(scene.start)) / D.fps + (f === 0 || scene.start === 0 ? 0.4 : 0.1);
    [...$('.cap').querySelectorAll('span')].forEach((el, i) => { const u = easeOut((age - i * 0.05) / 0.22); el.style.opacity = u; el.style.transform = 'translateY(' + ((1 - u) * 14) + 'px)'; });
    // Bars 1-2: the chart's view gets an arrow along its thumb (drawn while the hand forms; it points right); in bar 2 the
    // small window shows your own view with its arrow (pointing left). On the switch the big arrow turns with the hand.
    const M = D.marks, I = D.inset, drop = fr(D.dropAt);
    const vOn = f < drop;
    arrows.viewer.set(app(M.viewer.from), app(M.viewer.to), (t - M.viewer.drawFrom) / (M.viewer.drawTo - M.viewer.drawFrom), vOn && t >= M.viewer.drawFrom ? 1 : 0);
    pillAt($('.pill-viewer'), M.viewer.labelAt, M.viewer.label, vOn ? easeOut((t - M.viewer.drawTo) / 0.2) : 0);
    const sFade = clamp((fr(M.self.hideAt) - f) / 4.5, 0, 1), sOn = f >= drop && f < fr(M.self.hideAt);
    arrows.self.set(app(M.self.from), app(M.self.to), (t - D.dropAt) / 0.2, sOn ? sFade : 0);
    pillAt($('.pill-self'), M.self.labelAt, M.self.label, sOn ? sFade * easeOut((t - D.dropAt) / 0.15) : 0);
    const k = f - fr(I.start), iOn = k >= 0 && f < drop + 5, iFade = f < drop ? easeOut((t - I.start) / 0.2) : clamp((drop + 5 - f) / 5, 0, 1);
    const box = $('.inset'); box.style.opacity = iOn ? iFade : 0; box.style.transform = 'scale(' + (0.92 + 0.08 * (iOn ? iFade : 0)) + ')';
    const s = D.insetScale, map = (p) => [I.box.x + (p[0] - I.crop.x) * s, I.box.y + (p[1] - I.crop.y) * s + D.appTop];
    arrows.inset.set(map(M.self.from), map(M.self.to), (t - I.start) / 0.25, iOn ? iFade : 0);
    pillAt($('.pill-inset'), [I.box.x + I.box.w / 2, I.box.y + I.crop.h * s + 18], I.label, iOn ? iFade : 0);
    // Tap rings: from 0.13 s before the press (the finger arriving) to 0.4 s after, only inside the press's own take, and
    // never past a page jump or the pressed control going away.
    [...$('.taps').children].forEach((el, i) => { const T = D.taps[i], dt = (f - T.frame) / D.fps;
      const on = dt >= (T.noLead ? 0 : -0.135) && dt < 0.4 && f >= T.takeFrom && f < T.takeTo && (T.endFrame === undefined || f < T.endFrame);
      const u = clamp((dt + 0.05) / 0.45, 0, 1); el.style.opacity = on ? (dt < 0 ? 0.85 : 1 - u ** 1.6) : 0;
      el.style.transform = 'scale(' + (dt < 0 ? 0.62 + (dt + 0.135) : 0.65 + u * 0.75) * Math.min(T.scale, 1.25) + ')'; });
    const pts = D.fingers[f] || [];
    $('.fingers').replaceChildren(...pts.map((p) => { const el = document.createElement('div'); el.className = 'finger'; el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; return el; }));
    const endAt = D.storyboard.find((s) => s.music === 'resolve').start, end = f >= fr(endAt);
    $('.end').style.display = end ? 'block' : 'none';
    $('.cap').style.visibility = end ? 'hidden' : 'visible';
    if (end) {
      // Everything is readable within 0.25 s of the cut (no fade from blank).
      const e = (f - fr(endAt)) / D.fps + 0.08;
      [...$('.end-body').children].forEach((el, i) => { const u = easeOut((e - i * 0.025) / 0.16); el.style.opacity = u; el.style.transform = 'translateY(' + ((1 - u) * 12) + 'px)'; });
    }
  };
  </script></html>`;
}

// ---- Compose: lay the shot frames in final order under the caption band, composite the overlay, encode, and check. ----
const ffmpeg = process.env.FFMPEG || 'ffmpeg', ffprobe = process.env.FFPROBE || 'ffprobe';
const silentName = 'Day092_tekotoba_promo_silent.mp4';
const BAND_COLOR = '0xFFF9F0';
const lastResult = () => join(framesDir, 'result', `f${String(TAKE_FRAMES.result.to - TAKE_FRAMES.result.from - 1).padStart(5, '0')}.png`);
// Video frame -> shot frame (camera frames for the sign take when `camera`; the spell take skips SPELL.skip).
function sourceFrame(g, camera = false) {
  for (const [take, { from, to }] of Object.entries(TAKE_FRAMES)) {
    if (g < from || g >= to) continue;
    let k = g - from;
    if (take === 'spell' && g >= SKIP.from) k += SKIP.frames;
    return join(framesDir, camera && take === 'sign' ? 'camera' : take, `f${String(k).padStart(5, '0')}.png`);
  }
  return lastResult();   // under the end card (fully covered)
}
// The sign take through the camera: bars 1-3 cut off above the description card; the turn cropped and scaled.
function camera(plan) {
  const dir = join(framesDir, 'camera'), px = (v) => Math.round(v * DPR);
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const W = APP.width * DPR, H = APP.height * DPR, n = TAKE_FRAMES.sign.to - TAKE_FRAMES.sign.from, c = plan.turn;
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(FPS), '-start_number', '0', '-i', join(framesDir, 'sign', 'f%05d.png'),
    '-frames:v', String(plan.from), '-vf', `drawbox=x=0:y=${px(plan.maskY)}:w=${W}:h=${H - px(plan.maskY)}:color=${BAND_COLOR}:t=fill`, '-start_number', '0', join(dir, 'f%05d.png')]);
  const padTop = Math.max(0, -px(c.y));
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(FPS), '-start_number', String(plan.from), '-i', join(framesDir, 'sign', 'f%05d.png'),
    '-frames:v', String(n - plan.from), '-vf', `pad=${W}:${H + padTop}:0:${padTop}:color=${BAND_COLOR},crop=${px(c.w)}:${px(c.h)}:${px(c.x)}:${px(c.y) + padTop},scale=${W}:${H}:flags=lanczos`,
    '-start_number', String(plan.from), join(dir, 'f%05d.png')]);
  const made = readdirSync(dir).filter((f) => f.endsWith('.png')).length;
  if (made !== n) throw new Error(`カメラのコマ数が違う: ${made} / ${n}`);
  return { maskY: Math.round(plan.maskY), turnFrom: +(plan.from / FPS).toFixed(3), turn: { x: +c.x.toFixed(1), y: +c.y.toFixed(1), w: +c.w.toFixed(1), h: +c.h.toFixed(1), scale: +c.scale.toFixed(3) } };
}
function compose() {
  const plan = cameraPlan();
  stats.camera = camera(plan);
  const seq = join(framesDir, 'seq');
  rmSync(seq, { recursive: true, force: true }); mkdirSync(seq, { recursive: true });
  for (let g = 0; g < TOTAL; g++) {
    const file = sourceFrame(g, true);
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
    '-filter_complex', `[0:v]format=rgba,pad=1080:1920:0:${APP.top * 2}:color=${BAND_COLOR},setsar=1[b];[b][1:v]overlay=0:0:format=auto,format=yuv420p[v]`,
    '-map', '[v]', '-t', String(DURATION_SECONDS), '-r', String(FPS),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-map_metadata', '-1', silent], { stdio: 'inherit' });
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', silent, '-frames:v', '1', '-map_metadata', '-1', join(outDir, 'first-frame.png')]);
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', silent, '-vf', 'fps=1,scale=270:480,tile=8x4:padding=6:color=0x1F2544', '-frames:v', '1', '-q:v', '3', '-map_metadata', '-1', join(outDir, 'contact-sheet.jpg')]);
  // The first frame must already be moving: compare frames 0 and 3 of the encoded video (mean absolute difference, 0..255).
  const gray = (n) => execFileSync(ffmpeg, ['-v', 'error', '-i', silent, '-vf', `select=eq(n\\,${n}),scale=270:480,format=gray`, '-frames:v', '1', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 24 });
  const [a, b] = [gray(0), gray(3)];
  let diff = 0, changed = 0;
  for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); diff += d; if (d > 8) changed++; }
  stats.firstFrameMotion = { meanAbsDiff: +(diff / a.length).toFixed(3), changedPixelsPercent: +(100 * changed / a.length).toFixed(2) };
  if (100 * changed / a.length < 1) throw new Error(`1コマ目とコマ3の差が1%未満（${stats.firstFrameMotion.changedPixelsPercent}%）`);
  // Every cut (the drop, the turn's close-up, the takes, the end card), 2 frames before and 2 after, one row each.
  const cuts = [...new Set([frameAt(bar(2)), plan.from, ...CUTS.map(frameAt), frameAt(STORYBOARD.at(-1).start)])].sort((x, y) => x - y);
  const picks = cuts.flatMap((c) => [c - 2, c - 1, c, c + 1]);
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', silent, '-vf', `select='${picks.map((n) => `eq(n\\,${n})`).join('+')}',scale=270:480,tile=4x${cuts.length}:padding=6:color=0x1F2544`,
    '-vsync', '0', '-frames:v', '1', '-q:v', '3', '-map_metadata', '-1', join(outDir, 'cut-check.jpg')]);
  stats.cutCheck = { file: 'cut-check.jpg', rows: cuts.map((c) => ({ cutFrame: c, seconds: +(c / FPS).toFixed(3), frames: [c - 2, c - 1, c, c + 1] })) };
  stats.stillSeconds = stillSeconds(silent);
  return [silent];
}
// Counts frames whose app window (below the band) is identical to the previous one; the end card is reported apart.
function stillSeconds(file) {
  const raw = execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-vf', `crop=1080:${1920 - APP.top * 2}:0:${APP.top * 2},scale=135:190,format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 });
  const size = 135 * 190, frames = raw.length / size, endFrom = frameAt(STORYBOARD.at(-1).start);
  let still = 0, stillEnd = 0, run = 0, runs = [];
  for (let n = 1; n < frames; n++) {
    let moved = 0;
    for (let i = 0; i < size; i++) if (Math.abs(raw[n * size + i] - raw[(n - 1) * size + i]) > 2) moved++;
    if (moved === 0) { if (n >= endFrom) stillEnd++; else { still++; run++; } }
    if ((moved !== 0 || n === endFrom) && run) { if (run >= 15) runs.push({ from: +((n - run) / FPS).toFixed(2), seconds: +(run / FPS).toFixed(2) }); run = 0; }
  }
  return { beforeEndCard: +(still / FPS).toFixed(2), endCard: +(stillEnd / FPS).toFixed(2), runsOverHalfSecond: runs };
}
// demo.mp4 for the 100-day list: the real screens only (no captions, rings, marks or cards), 540x960, 16 s, silent.
// The hand forming, the switch and the turn, the slow sign, the quiz and pairs, and the name being spelled.
const DEMO = [[0, 1.0], [4.8, 10.333], [10.333, 13.333], [13.333, 16.0], [17.2, 21.0]].map(([a, b]) => [frameAt(a), frameAt(b)]);
function demo() {
  const list = DEMO.flatMap(([a, b]) => Array.from({ length: b - a }, (_, i) => sourceFrame(a + i))).slice(0, 16 * FPS);
  if (list.length < 16 * FPS) throw new Error(`demo のコマが足りない: ${list.length}`);
  const dir = join(framesDir, 'demo-seq');
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  list.forEach((file, i) => symlinkSync(file, join(dir, `d${String(i).padStart(5, '0')}.png`)));
  const out = join(outDir, 'demo.mp4');
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', join(dir, 'd%05d.png'),
    '-vf', `scale=540:760:flags=lanczos,pad=540:960:0:100:color=${BAND_COLOR},format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-an', '-movflags', '+faststart', '-map_metadata', '-1', out]);
  return { seconds: +(list.length / FPS).toFixed(2), bytes: statSync(out).size, segments: DEMO.map(([a, b]) => [+(a / FPS).toFixed(2), +(b / FPS).toFixed(2)]) };
}
function mux(variant) {
  const wav = join(outDir, `bgm_${variant}.wav`), out = join(outDir, `Day092_tekotoba_promo_${variant}.mp4`);
  if (!existsSync(wav)) throw new Error(`BGMがありません: ${wav}（promo-audio.mjs --variant ${variant}）`);
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', join(outDir, silentName), '-i', wav,
    '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    '-af', `apad=whole_dur=${DURATION_SECONDS}`, '-t', String(DURATION_SECONDS), '-movflags', '+faststart', '-map_metadata', '-1', out]);
  return out;
}
function probe(file, kind = 'promo') {
  const p = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }));
  const v = p.streams.find((s) => s.codec_type === 'video'), a = p.streams.find((s) => s.codec_type === 'audio');
  const decode = execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-f', 'null', '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const seconds = Number(p.format.duration), bytes = statSync(file).size, frames = Number(v.nb_read_frames ?? v.nb_frames);
  let ok;
  if (kind === 'demo') ok = v.width === 540 && v.height === 960 && v.codec_name === 'h264' && v.pix_fmt === 'yuv420p' && v.r_frame_rate === '30/1' && !a
    && Math.abs(seconds - 16) <= 0.05 && bytes <= 3 * 1024 * 1024 && decode.trim() === '';
  else {
    const silent = file.endsWith(silentName);
    ok = v.width === 1080 && v.height === 1920 && v.codec_name === 'h264' && v.pix_fmt === 'yuv420p' && v.r_frame_rate === '30/1' && frames === TOTAL
      && Math.abs(seconds - DURATION_SECONDS) <= 0.05 && decode.trim() === ''
      && (silent ? !a : a?.codec_name === 'aac' && a.sample_rate === '48000' && a.channels === 2);
  }
  const row = { file: basename(file), ok, size: `${v.width}x${v.height}`, codec: v.codec_name, profile: v.profile, pix: v.pix_fmt, fps: v.r_frame_rate, frames,
    seconds: +seconds.toFixed(3), bytes, audio: a ? `${a.codec_name} ${a.sample_rate}Hz ${a.channels}ch` : 'なし', decodeErrors: decode.trim() ? decode.trim().split('\n').length : 0 };
  log(ok ? '検査OK' : '検査NG', JSON.stringify(row));
  if (!ok) throw new Error(`出力が仕様と違います: ${file}`);
  return row;
}

// ---- Run ----
mkdirSync(framesDir, { recursive: true });
const started = Date.now(), timings = {};
const needApp = ALL.some(wanted);
const server = needApp ? await startServer() : null;
let browser = null;
const timed = async (name, fn) => { const t0 = Date.now(); await fn(); timings[name] = +((Date.now() - t0) / 60000).toFixed(1); };
const extras = {};
try {
  // One browser at a time; the takes run one after another in fresh contexts.
  const overlayWanted = !flag('--no-compose') && !flag('--compose-only') && (!only.length || only.includes('overlay') || needApp);
  if (needApp || overlayWanted) browser = await launch();
  for (const take of ALL) if (wanted(take)) await timed(take, () => shootTake(browser, take));
  if (!flag('--no-compose')) {
    if (overlayWanted) await timed('overlay', () => shootOverlay(browser));
    await browser?.close(); browser = null;
    compose();
    extras.demo = demo();
  }
} finally {
  await browser?.close().catch(() => {});
  server?.kill();
}
const outputs = [];
if (!flag('--no-compose')) {
  outputs.push(probe(join(outDir, silentName)));
  for (const variant of (arg('--mux', '') || '').split(',').filter(Boolean)) outputs.push(probe(mux(variant)));
  outputs.push(probe(join(outDir, 'demo.mp4'), 'demo'));
}
// Sound cues in timeline.mjs vs what the capture measured: the hook's shape lands at the press time + 1.8 s; each letter
// of the name starts when the app moves its highlight (in video time, after the part left out).
const previous = existsSync(join(framesDir, 'capture-report.json')) ? JSON.parse(readFileSync(join(framesDir, 'capture-report.json'), 'utf8')) : {};
const allTakes = { ...previous.takes, ...stats.takes };
const measuredShapes = [SIGN.slowLandsAt, ...(allTakes.spell?.letters ?? []).map((l) => l.seconds)].sort((x, y) => x - y);
const drift = (cues, measured) => cues.map((cue) => ({ cue, nearest: measured.reduce((best, t) => (Math.abs(t - cue) < Math.abs(best - cue) ? t : best), Infinity) }))
  .map((c) => ({ ...c, driftFrames: Math.round(Math.abs(c.nearest - c.cue) * FPS) }));
const shapeCueDrift = drift(SHAPE_CUES, measuredShapes);
if (shapeCueDrift.some((c) => c.driftFrames > 2)) log('注意: SHAPE_CUES と実測がずれています', JSON.stringify(shapeCueDrift));
const tapCueDrift = drift(TAP_CUES, Object.values(allTakes).flatMap((t) => t.taps ?? []).map((t) => t.seconds));
const size = (dir) => readdirSync(dir, { withFileTypes: true }).reduce((sum, e) => sum + (e.isDirectory() ? size(join(dir, e.name)) : e.isFile() ? statSync(join(dir, e.name)).size : 0), 0);
const hash = (file) => existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 16) : null;
const report = { seconds: DURATION_SECONDS, fps: FPS, width: 1080, height: 1920, beat: BEAT, capture: `app CSS ${VIEW.width}x${VIEW.height}, DPR ${DPR}, under a ${APP.top * 2}px caption band`,
  run: flag('--compose-only') ? 'compose-only' : only.length ? `only ${only.join(',')}` : 'full',
  framesShot: { ...previous.framesShot, ...stats.frames }, takes: allTakes, measuredShapes, shapeCueDrift, tapCueDrift,
  minutes: +((Date.now() - started) / 60000).toFixed(1), minutesByTake: { ...previous.minutesByTake, ...timings },
  camera: stats.camera ?? previous.camera, cutCheck: stats.cutCheck ?? previous.cutCheck, stillSeconds: stats.stillSeconds ?? previous.stillSeconds, captionBoxes: stats.captionBoxes ?? previous.captionBoxes,
  blockedRequests: stats.blocked.length, blocked: stats.blocked.slice(0, 20), serviceWorkerScriptStubbed: stats.swStubbed || previous.serviceWorkerScriptStubbed || 0,
  consoleWarnings: needApp ? stats.warnings : previous.consoleWarnings ?? [], gpuReadbackNotes: needApp ? stats.driverNotes : previous.gpuReadbackNotes ?? 0,
  firstFrameMotion: stats.firstFrameMotion ?? previous.firstFrameMotion, demo: extras.demo ?? previous.demo, outputs,
  sha256: Object.fromEntries(['Day092_tekotoba_promo_a.mp4', 'Day092_tekotoba_promo_b.mp4', silentName, 'demo.mp4'].map((f) => [f, hash(join(outDir, f))])),
  framesBytes: size(framesDir) };
writeFileSync(join(framesDir, 'capture-report.json'), JSON.stringify(report, null, 2) + '\n');
if (!flag('--no-compose')) writeFileSync(join(outDir, 'capture-report.json'), JSON.stringify(report, null, 2) + '\n');
log('完了', JSON.stringify({ minutes: report.minutes, minutesByTake: report.minutesByTake, blocked: report.blockedRequests, warnings: report.consoleWarnings.length,
  firstFrameMotion: report.firstFrameMotion, stillSeconds: report.stillSeconds }));
