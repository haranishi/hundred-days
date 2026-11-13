// Day091 "バーチャルオフィス" promo video (vertical 1080x1920, 30 fps, 32 s), recorded in real time from the production site.
// The app syncs over WebSocket, so its clock cannot be frozen (Day088's frame-by-frame method). Instead three phones (browser
// contexts) join one real office and act on a schedule, while the phone on camera is captured continuously with CDP screenshots
// (about 35-40 per second, 1080x1920, PNG, each with its time). Every action is logged with its time; a shot list (timeline.mjs)
// maps video time to capture time at real speed, and each video frame takes the capture nearest to its time.
// The app window is the real screen, cropped and scaled (a camera); captions, tap rings, flashes, the S1 cards and the end card are
// transparent overlay frames composited by ffmpeg. Nothing is drawn into the app and no request is rewritten.
//
//   node render-promo.mjs --frames-dir <work dir> --out-dir <output dir> [--mux a,b]
//   --only main,alone,overlay   shoot only these (the others reuse the earlier recordings)
//   --compose-only              no shooting, only window frames, compositing and encoding
//   --no-compose                shoot only
// Paths can also come from PROMO_FRAMES_DIR / PROMO_OUT_DIR. Fonts: PROMO_FONT, PROMO_FONT_BLACK. Playwright: the repository's
// node_modules, or PLAYWRIGHT=<path to playwright/index.mjs>. ffmpeg / ffprobe: FFMPEG / FFPROBE, else PATH.
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { ALONE, APP_ORIGIN, ARUARU, CARD_TIMES, DURATION_SECONDS, END_CARD, FLASHES, LINES, MUSIC_CUES, PEOPLE, PLAN, SEATED_STATUS, SHOTS, STORYBOARD, TAP_CUES, WINDOW_AT, beat, scene } from './timeline.mjs';

const execFileP = promisify(execFile);
const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const flag = (name) => args.includes(name);
const need = (value, what) => { if (!value) throw new Error(`${what} を指定してください（引数か環境変数）`); return resolve(value); };
const framesDir = need(arg('--frames-dir', process.env.PROMO_FRAMES_DIR), '--frames-dir');
const outDir = need(arg('--out-dir', process.env.PROMO_OUT_DIR), '--out-dir');
const font = process.env.PROMO_FONT || join(homedir(), 'Library/Fonts/ZenKakuGothicNew-Bold.ttf');
const fontBlack = process.env.PROMO_FONT_BLACK || join(homedir(), 'Library/Fonts/ZenKakuGothicNew-Black.ttf');
const only = (arg('--only', '') || '').split(',').filter(Boolean);
const wanted = (part) => !flag('--compose-only') && (!only.length || only.includes(part));
const which = (name, env) => process.env[env] || execFileSync('/bin/sh', ['-c', `command -v ${name}`], { encoding: 'utf8' }).trim();
const ffmpeg = which('ffmpeg', 'FFMPEG'), ffprobe = which('ffprobe', 'FFPROBE');
async function loadChromium() {
  const mod = process.env.PLAYWRIGHT ? await import(pathToFileURL(resolve(process.env.PLAYWRIGHT)).href) : await import('playwright');
  return mod.chromium ?? mod.default.chromium;
}

const FPS = 30, TOTAL = Math.round(DURATION_SECONDS * FPS), DPR = 2;
const SCREEN = { width: 540, height: 1020 };   // the phone: the map reaches its full 420 px height from about 1019 px
const REC = { width: 540, height: 960 };       // recorded: the top of the screen (1080x1920 px)
const FRAME = { width: 540, height: 825 };     // shown in the window (header, buttons and the whole map, which ends at ~815)
const WIN = { x: 108, y: 380, w: 864, h: 1320, radius: 40 };   // 0.8x, one rectangle for every scene
const SRC = { w: FRAME.width * DPR, h: FRAME.height * DPR };    // window frames are 1080x1650
const CONTEXT = { viewport: SCREEN, deviceScaleFactor: DPR, isMobile: true, hasTouch: true, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', reducedMotion: 'no-preference' };
const silentName = 'Day091_virtual-office_promo_silent.mp4';

const T0 = performance.now();
const now = () => (performance.now() - T0) / 1000;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const until = async (t) => { for (;;) { const d = t - now(); if (d <= 0) return; await sleep(d > 0.03 ? (d - 0.015) * 1000 : 2); } };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
// Socket addresses carry the device secret (k=); office ids are not secret but are left out of the records too.
const redact = (text) => String(text).replace(/([?&]k=)[^&\s"'<>]*/gi, '$1<redacted>').replace(/\/o\/[A-Za-z0-9_-]{16}/g, '/o/<id>');
const pad = (n) => String(n).padStart(5, '0');
const r4 = (x) => +x.toFixed(4);
const clamp01 = (u) => Math.max(0, Math.min(1, u));
const smooth = (u) => { const x = clamp01(u); return x * x * (3 - 2 * x); };
const stats = { console: [], hosts: {}, sockets: [], recorder: {} };

// ---- Takes: an event log, the recordings of the phones on camera, and geometry snapshots for the camera and the checks. ----
class Take {
  constructor(name) { this.name = name; this.events = []; this.frames = {}; this.geo = {}; this.checks = {}; this.notes = []; }
  mark(name, data = {}) { const t = now(); this.events.push({ name, t: r4(t), ...data }); return t; }
  t(name) { const e = this.events.find((x) => x.name === name); if (!e) throw new Error(`記録に ${name} が無い（${this.name}）`); return e.t; }
  toJSON() { return { name: this.name, events: this.events, frames: this.frames, geo: this.geo, checks: this.checks, notes: this.notes, network: this.network, console: this.console, recorder: this.recorder }; }
  static load(name) {
    const file = join(framesDir, name, 'events.json');
    if (!existsSync(file)) throw new Error(`先に ${name} を撮る: ${file}`);
    return Object.assign(new Take(name), JSON.parse(readFileSync(file, 'utf8')));
  }
}

// Continuous capture of one page: CDP screenshots back to back, each stamped with the middle of its request.
class Recorder {
  constructor(take, who, context, page) { Object.assign(this, { take, who, context, page }); this.dir = join(framesDir, take.name, who); this.frames = []; this.errors = 0; this.writes = []; }
  async start() {
    rmSync(this.dir, { recursive: true, force: true }); mkdirSync(this.dir, { recursive: true });
    this.cdp = await this.context.newCDPSession(this.page);
    this.running = true; this.loop = this.run();
    while (!this.frames.length) await sleep(10);
  }
  async run() {
    while (this.running) {
      const t0 = now();
      const shot = this.cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: REC.width, height: REC.height, scale: DPR }, optimizeForSpeed: true })
        .then((r) => r.data, (error) => { this.errors++; this.lastError = redact(error.message).slice(0, 120); return null; });
      const data = await Promise.race([shot, sleep(200).then(() => 'stalled')]);
      if (data === 'stalled') {
        // A capture asked for while the page navigates never comes back; a new session captures the new page at once.
        (this.stalls ??= []).push(r4(t0));
        const old = this.cdp;
        this.cdp = await this.context.newCDPSession(this.page).catch(() => old);
        if (this.cdp !== old) old.detach().catch(() => {});
        continue;
      }
      if (!data) { await sleep(15); continue; }
      const t1 = now(), n = this.frames.length;
      this.frames.push({ n, t: r4((t0 + t1) / 2), ms: +((t1 - t0) * 1000).toFixed(1) });
      this.writes.push(writeFile(join(this.dir, `f${pad(n)}.png`), Buffer.from(data, 'base64')));
      if (this.writes.length > 64) await Promise.all(this.writes.splice(0, 32));
    }
  }
  async stop() {
    if (!this.running) return;
    this.running = false; await this.loop; await Promise.all(this.writes); await this.cdp.detach().catch(() => {});
    this.take.frames[this.who] = this.frames;
    const span = this.frames.at(-1).t - this.frames[0].t, gaps = this.frames.slice(1).map((f, i) => f.t - this.frames[i].t).sort((a, b) => a - b);
    stats.recorder[`${this.take.name}/${this.who}`] = { frames: this.frames.length, seconds: +span.toFixed(2), fps: +((this.frames.length - 1) / span).toFixed(1), medianGapMs: +(1000 * gaps[gaps.length >> 1]).toFixed(1), maxGapMs: +(1000 * gaps.at(-1)).toFixed(1), errors: this.errors, stallsAt: this.stalls ?? [], lastError: this.lastError ?? null };
    log(`rec ${this.take.name}/${this.who}`, JSON.stringify(stats.recorder[`${this.take.name}/${this.who}`]));
  }
}

function watch(page, who, take) {
  page.on('console', (m) => { if (['warning', 'error'].includes(m.type()) && !/GPU stall due to ReadPixels/.test(m.text())) stats.console.push(`${take.name}/${who}: ${m.type()}: ${redact(m.text()).slice(0, 240)}`); });
  page.on('pageerror', (error) => stats.console.push(`${take.name}/${who}: pageerror: ${redact(error.message).slice(0, 240)}`));
  page.on('request', (request) => { const u = new URL(request.url()); if (u.protocol.startsWith('http')) stats.hosts[u.host] = (stats.hosts[u.host] ?? 0) + 1; });
  page.on('websocket', (ws) => { const u = new URL(ws.url()); stats.sockets.push({ take: take.name, who, host: u.host, path: u.pathname, room: u.searchParams.get('room') }); });
}
async function phone(browser, take, who) {
  const context = await browser.newContext(CONTEXT);
  if (who === 'A') await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: APP_ORIGIN });   // 「リンクをコピー」
  const page = await context.newPage();
  watch(page, who, take);
  take.pages[who] = { context, page, cdp: await context.newCDPSession(page) };
  return page;
}
const rectOf = (page, selector) => page.evaluate((s) => { const el = document.querySelector(s); const r = el?.getBoundingClientRect(); return r && r.width ? { x: r.x, y: r.y, w: r.width, h: r.height } : null; }, selector);
// A real touch (CDP): the finger goes down `hold` before the lift; the app reacts on the lift (click), which is the logged time.
async function tap(take, who, selector, name, { at = now() + 0.05, hold = 0.1, onCamera = true, scroll = false } = {}) {
  const { page, cdp } = take.pages[who];
  if (scroll) await page.locator(selector).first().scrollIntoViewIfNeeded();
  const box = await rectOf(page, selector);
  if (!box) throw new Error(`押す部品が無い: ${who} ${selector}`);
  const p = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  if (onCamera && (p.y < 0 || p.y > FRAME.height)) throw new Error(`押す部品が窓の外: ${name} y=${p.y.toFixed(0)}`);
  await until(at - hold);
  const down = now();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1, radiusX: 8, radiusY: 8, force: 1 }] });
  await until(down + hold);
  const t = now();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  take.events.push({ name, kind: 'tap', who, t: r4(t), down: r4(down), late: r4(t - at), x: +p.x.toFixed(1), y: +p.y.toFixed(1), w: +box.w.toFixed(1), h: +box.h.toFixed(1), onCamera });
  return t;
}
// The color is a <select>: Playwright chooses the option (the page gets the same input/change events); the ring marks the field.
async function pick(take, who, selector, value, name, { at }) {
  const { page } = take.pages[who];
  const box = await rectOf(page, selector);
  await until(at);
  const t = now();
  await page.locator(selector).selectOption(value);
  take.events.push({ name, kind: 'tap', who, t: r4(t), down: r4(t - 0.1), late: r4(t - at), x: +(box.x + box.w / 2).toFixed(1), y: +(box.y + box.h / 2).toFixed(1), w: +box.w.toFixed(1), h: +box.h.toFixed(1), onCamera: true, select: value });
}
async function typeText(take, who, text, name, { at, every = 0.07 }) {
  for (const [i, ch] of [...text].entries()) { await until(at + i * every); await take.pages[who].cdp.send('Input.insertText', { text: ch }); }
  take.mark(name, { who, text });
}
async function waitFor(page, fn, arg, what, timeout = 15000) {
  const end = Date.now() + timeout;
  for (;;) {
    try { await page.waitForFunction(fn, arg, { timeout: Math.max(1, end - Date.now()), polling: 16 }); return; }
    catch (error) {
      // A wait that started while the page was navigating loses its document; wait again on the new one.
      if (/context was destroyed|navigat/i.test(error.message) && Date.now() < end) { await sleep(30); continue; }
      throw new Error(`待っても起きない: ${what}（${redact(error.message).split('\n')[0].slice(0, 120)}）`);
    }
  }
}
// What is on the phone (page CSS px): the map, every person, every name label (with its bubble) and the open dialogs.
const geometry = (page) => page.evaluate(() => {
  const box = (el) => { const r = el?.getBoundingClientRect(); return r && r.width ? { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) } : null; };
  const canvas = box(document.querySelector('#game canvas')), vo = window.__vo;
  const players = vo?.players ? Object.values(vo.players()).map((p) => {
    const s = vo.screenPoint({ x: p.x, y: p.y });
    return { name: p.name, x: p.x, y: p.y, seated: Boolean(p.seatId), status: p.status, screen: canvas && s ? { x: +(canvas.x + s.x * canvas.w / s.width).toFixed(1), y: +(canvas.y + s.y * canvas.h / s.height).toFixed(1) } : null };
  }) : [];
  const labels = [...document.querySelectorAll('#labels .name-label, #labels .npc-label')].map((l) => ({
    text: l.querySelector('.name')?.textContent ?? l.textContent.split('\n')[0], status: l.querySelector('.status')?.textContent ?? l.textContent.split('\n')[1] ?? '',
    npc: l.classList.contains('npc-label'), visible: getComputedStyle(l).visibility === 'visible', rect: box(l),
    bubble: l.querySelector('.chat-bubble')?.textContent ?? null, reaction: l.querySelector('.reaction-bubble')?.textContent ?? null,
    bubbleRect: box(l.querySelector('.chat-bubble, .reaction-bubble')),
  }));
  const open = [...document.querySelectorAll('[role="dialog"], .join-dialog')].filter((d) => !d.hidden && getComputedStyle(d).display !== 'none').map((d) => d.id);
  return { scrollY: window.scrollY, path: location.pathname.replace(/\/o\/[A-Za-z0-9_-]{16}/, '/o/<id>'), room: document.querySelector('#room-title')?.textContent ?? null,
    members: document.querySelector('.link-room-members')?.textContent ?? null, canvas, players, labels, open, pong: box(document.querySelector('#pong-canvas')),
    presence: document.querySelector('#link-presence')?.hidden === false ? document.querySelector('#link-presence').textContent : null,
    arrival: document.querySelector('#room-arrival')?.hidden === false ? document.querySelector('#arrival-title')?.textContent : null };
});
// A name label counts as on the map when its box is inside the map (the app bug makes seated labels run far below it).
const labelsOnMap = (g) => g.labels.filter((l) => !l.npc && l.visible && l.rect && g.canvas && l.rect.y >= g.canvas.y - 40 && l.rect.y + l.rect.h <= g.canvas.y + g.canvas.h + 4).map((l) => l.text);
// The join dialog is ready when it is a fixed overlay, the fonts are in and the name field has stopped moving: right after the page
// changes, the office's styles can still be arriving and the field sits far down (it was measured at y=969 once).
async function waitJoinDialog(page, what) {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    const ok = await page.evaluate(() => new Promise((done) => {
      const d = document.querySelector('#join-dialog'), i = document.querySelector('#display-name');
      if (!d || d.hidden || !i?.value || document.fonts.status !== 'loaded' || getComputedStyle(d).position !== 'fixed') return done(false);
      const a = i.getBoundingClientRect();
      requestAnimationFrame(() => requestAnimationFrame(() => { const b = i.getBoundingClientRect(); done(a.y === b.y && a.x === b.x && b.y > 0 && b.bottom < innerHeight && document.querySelector('#join-submit').getBoundingClientRect().bottom < innerHeight); }));
    })).catch(() => false);
    if (ok) return;
    await sleep(30);
  }
  throw new Error(`待っても起きない: ${what}`);
}
async function prepareGuest(take, who, url) {
  const { page } = take.pages[who];
  await page.goto(url, { waitUntil: 'networkidle' });
  await waitJoinDialog(page, `${who} の名前を入れる画面`);
  await page.locator('#display-name').fill(PEOPLE[who].name);
  await page.locator('#avatar-color').selectOption(PEOPLE[who].color);
  take.mark(`${who}Ready`);
}

// ---- Take 1 (main): あなた (A, on camera), さくら (B) and はると (C) in one new office. ----
async function takeMain(browser) {
  const take = new Take('main'); take.pages = {};
  const A = await phone(browser, take, 'A'), B = await phone(browser, take, 'B'), C = await phone(browser, take, 'C');
  const rec = {};
  try {
    await A.goto(`${APP_ORIGIN}/`, { waitUntil: 'networkidle' });
    await A.evaluate(() => document.fonts.ready.then(() => true));
    await sleep(800);
    rec.A = new Recorder(take, 'A', take.pages.A.context, A); await rec.A.start();
    await sleep(1200);
    // S2: 「オフィスを作る」 on the drop, then the name, the color and 「入る」.
    await tap(take, 'A', '#link-create', 'createTap', { at: now() + 0.3 });
    await A.waitForURL(/\/o\/[A-Za-z0-9_-]{16}$/, { timeout: 15000 });
    const officeUrl = A.url();
    const guests = Promise.all([prepareGuest(take, 'B', officeUrl), prepareGuest(take, 'C', officeUrl)]);
    guests.catch(() => {});   // awaited below; an earlier failure must not be hidden by the guests' pages closing
    await waitJoinDialog(A, '名前を入れる画面');
    const joinReady = take.mark('joinReady', { guestName: await A.evaluate(() => document.querySelector('#display-name').value) });
    const j0 = joinReady + 0.55, j = (v) => j0 + (v - PLAN.nameTap);
    await tap(take, 'A', '#display-name', 'nameTap', { at: j0 });
    await until(j(PLAN.nameTap) + 0.08);
    await A.keyboard.press('ControlOrMeta+A');
    for (const [i, ch] of [...PEOPLE.A.name].entries()) { await until(j(PLAN.nameKeys[i])); await take.pages.A.cdp.send('Input.insertText', { text: ch }); }
    take.mark('nameTyped', { value: await A.evaluate(() => document.querySelector('#display-name').value) });
    await pick(take, 'A', '#avatar-color', PEOPLE.A.color, 'colorPick', { at: j(PLAN.colorPick) });
    await tap(take, 'A', '#join-submit', 'joinTap', { at: j(PLAN.joinTap) });
    await waitFor(A, () => window.__vo?.connected?.() && !document.querySelector('#invite-dialog')?.hidden, null, 'オフィスに入り招待の画面が出る（429 なら1分待つ）', 20000);
    const ready = take.mark('officeReady');
    take.geo.invite = await geometry(A);
    // S3: copy the link; さくら and はると open it on their phones and press 入る (they appear on A's map).
    const w = (v) => ready + 0.06 + (v - PLAN.officeReady);
    await guests;
    await tap(take, 'A', '#invite-dialog [data-share-copy]', 'copyTap', { at: w(PLAN.copyTap) });
    const copied = await A.evaluate(async () => ({ text: await navigator.clipboard.readText().catch(() => null), field: document.querySelector('#invite-url')?.value, status: document.querySelector('#invite-dialog [data-share-status]')?.textContent }));
    take.checks.copiedLinkIsTheOffice = copied.text === officeUrl && copied.field === officeUrl;
    take.checks.copyStatus = copied.status;
    take.checks.linkPrefix = `${APP_ORIGIN}/o/` + '<16 chars>';
    await tap(take, 'A', '#invite-close', 'closeTap', { at: w(PLAN.closeTap) });
    await tap(take, 'B', '#join-submit', 'bJoin', { at: w(PLAN.bJoin), onCamera: false });
    await tap(take, 'C', '#join-submit', 'cJoin', { at: w(PLAN.cJoin), onCamera: false });
    await until(w(PLAN.cJoin) + 0.7);
    take.geo.arrivals = await geometry(A);
    await until(w(scene('S3').end) + 0.3);
    take.geo.endOfS3 = await geometry(A);
    // Off camera: a status for everyone, so seated labels stay on the map (timeline.mjs SEATED_STATUS).
    if (SEATED_STATUS) for (const who of ['B', 'C', 'A']) {
      await tap(take, who, `[data-manual-status="${SEATED_STATUS}"]`, `${who}Status`, { onCamera: false, scroll: true });
      await take.pages[who].page.evaluate(() => window.scrollTo(0, 0));
      await sleep(300);
    }
    await sleep(1200);
    take.geo.beforeDesk = await geometry(A);
    // S4: everyone to a desk; はると 会議中, さくら 👋, あなた おはよう！ (typed in the chat below the window).
    const d0 = now() + 0.4;
    await tap(take, 'A', '[data-destination="desk"]', 'deskTap', { at: d0 });
    await tap(take, 'B', '[data-destination="desk"]', 'bDesk', { at: d0 + 0.3, onCamera: false });
    await tap(take, 'C', '[data-destination="desk"]', 'cDesk', { at: d0 + 0.6, onCamera: false });
    await waitFor(A, () => { const p = Object.values(window.__vo.players()); return p.length === 3 && p.every((x) => x.seatId); }, null, '3人がデスクに座る', 15000);
    const seated = take.mark('allSeated');
    await C.locator('[data-manual-status="meeting"]').scrollIntoViewIfNeeded();
    await B.locator('[data-reaction="wave"]').scrollIntoViewIfNeeded();
    const m0 = Math.max(seated + 0.4, d0 + (PLAN.cMeeting - PLAN.deskTap)), m = (v) => m0 + (v - PLAN.cMeeting);
    await tap(take, 'C', '[data-manual-status="meeting"]', 'cMeeting', { at: m0, onCamera: false });
    await tap(take, 'B', '[data-reaction="wave"]', 'bWave', { at: m(PLAN.bWave), onCamera: false });
    await tap(take, 'A', '#chat-input', 'aChatFocus', { at: m(PLAN.aChatFocus), onCamera: false });
    await typeText(take, 'A', LINES.hello, 'aHelloTyped', { at: m(PLAN.aChatFocus) + 0.12 });
    await tap(take, 'A', '#chat-form button[type="submit"]', 'aHello', { at: m(PLAN.aChatSend), onCamera: false });
    await sleep(450);
    take.geo.trioSocial = await geometry(A);
    await until(m(scene('S4').end) + 0.3);
    // Hook (recorded now, shown first): new lines once the S4 bubbles are gone.
    const h0 = Math.max(now() + 1.2, take.t('aHello') + 5.6), h = (v) => h0 + (v - PLAN.hookStart);
    await B.evaluate(() => window.scrollTo(0, 0));
    await C.locator('[data-reaction="like"]').scrollIntoViewIfNeeded();
    await tap(take, 'B', '#chat-input', 'bChatFocus', { at: h0 - 0.7, onCamera: false });
    await until(h0 - 0.5); await take.pages.B.cdp.send('Input.insertText', { text: LINES.hookB });
    await tap(take, 'B', '#chat-form button[type="submit"]', 'hookStart', { at: h0, onCamera: false });
    await tap(take, 'C', '[data-reaction="like"]', 'cLike', { at: h(PLAN.hookLike), onCamera: false });
    await tap(take, 'A', '#chat-input', 'aReplyFocus', { at: h(PLAN.hookReplyFocus), onCamera: false });
    await typeText(take, 'A', LINES.hookA, 'aReplyTyped', { at: h(PLAN.hookReplyFocus) + 0.1, every: 0.06 });
    await tap(take, 'A', '#chat-form button[type="submit"]', 'aReply', { at: h(PLAN.hookReply), onCamera: false });
    await sleep(350);
    take.geo.trioHook = await geometry(A);
    await until(h(scene('S0').end) + 0.3);
    // S5. さくら goes to 会議室 first (A then finds a colleague at the table; a lone visitor would get NPCs there).
    await tap(take, 'B', '[data-manual-status="meeting"]', 'bMeetingStatus', { onCamera: false, scroll: true });
    await B.evaluate(() => window.scrollTo(0, 0));
    await sleep(700);
    await tap(take, 'B', '#rooms-open', 'bRooms', { onCamera: false });
    await B.locator('#rooms-dialog:not([hidden])').waitFor({ timeout: 5000 });
    await sleep(300);
    await tap(take, 'B', '#switch-room-list a[href$="/meeting"]', 'bToMeeting', { onCamera: false });
    await waitFor(A, () => Object.keys(window.__vo.players()).length === 2, null, 'さくらが執務室を出る', 15000);
    const left = take.mark('bLeftOffice');
    await B.waitForURL(/\/meeting$/, { timeout: 20000 });
    await waitFor(B, () => window.__vo?.connected?.(), null, 'さくらが会議室に入る', 20000);
    await sleep(600);
    await tap(take, 'B', '[data-destination="meeting"]', 'bTable', { onCamera: false });
    await waitFor(B, () => Boolean(window.__vo.self()?.seatId), null, 'さくらが会議テーブルに座る', 15000);
    take.mark('bAtTable');
    // A: the coffee bar, then the door to 会議室 (「部屋を移動」→「会議室へ移動」: A walks to the door and the page moves).
    const c0 = Math.max(now() + 0.5, left + 4.5, take.t('aReply') + 5.6);
    await tap(take, 'A', '[data-destination="coffee"]', 'coffeeTap', { at: c0 });
    await waitFor(A, () => !window.__vo.navigation().active && document.querySelector('#location-label')?.textContent === 'コーヒーバー', null, 'コーヒーバーに着く', 10000);
    const atCoffee = take.mark('coffeeArrived');
    take.geo.coffee = await geometry(A);
    const r0 = atCoffee + (PLAN.roomsTap - PLAN.coffeeArrived);
    await tap(take, 'A', '#rooms-open', 'roomsTap', { at: r0 });
    await A.locator('#rooms-dialog:not([hidden])').waitFor({ timeout: 5000 });
    take.geo.rooms = await geometry(A);
    await tap(take, 'A', '#switch-room-list a[href$="/meeting"]', 'meetingTap', { at: r0 + (PLAN.meetingTap - PLAN.roomsTap) });
    await A.waitForURL(/\/meeting$/, { timeout: 20000 });
    take.mark('meetingNavigated');
    await waitFor(A, () => window.__vo?.connected?.() && !document.querySelector('#room-arrival')?.hidden, null, '会議室に着く', 20000);
    take.mark('meetingReady');
    await sleep(250);
    take.geo.meetingGeo = await geometry(A);
    await sleep(1400);
    await rec.A.stop();
    // Ping-pong with the NPC on はると's phone.
    await C.evaluate(() => window.scrollTo(0, 0));
    rec.C = new Recorder(take, 'C', take.pages.C.context, C); await rec.C.start();
    await tap(take, 'C', '#pingpong-open', 'cPong', { onCamera: false });
    await waitFor(C, () => !document.querySelector('#pingpong-dialog')?.hidden, null, '卓球の画面が開く', 15000);
    take.mark('pongOpen');
    await sleep(700);
    const s0 = await tap(take, 'C', '#pong-serve', 'serveTap', { at: now() + 0.3 });
    take.geo.pongGeo = await geometry(C);
    await playPong(take, s0 + 2.6);
    await rec.C.stop();
    take.checks.labelsOnMap = Object.fromEntries(['beforeDesk', 'trioSocial', 'trioHook', 'meetingGeo'].map((k) => [k, labelsOnMap(take.geo[k])]));
  } finally {
    for (const r of Object.values(rec)) await r.stop().catch(() => {});
    for (const { context } of Object.values(take.pages)) await context.close().catch(() => {});
  }
  delete take.pages;
  return take;
}
// はると's paddle follows the ball (read from the canvas pixels; the pointer moves over the table as a mouse would).
async function playPong(take, end) {
  const { page, cdp } = take.pages.C;
  let moves = 0;
  while (now() < end) {
    const ball = await page.evaluate(() => {
      const c = document.querySelector('#pong-canvas'); if (!c) return null;
      const { data } = c.getContext('2d').getImageData(0, 0, c.width, c.height);
      let sx = 0, n = 0;
      for (let y = 14; y < c.height - 14; y += 2) for (let x = 14; x < c.width - 14; x += 2) { const i = (y * c.width + x) * 4; if (data[i] > 250 && data[i + 1] > 240 && data[i + 2] > 212 && data[i + 2] < 232) { sx += x; n++; } }
      const r = c.getBoundingClientRect();
      return n ? { x: r.left + (sx / n) * r.width / c.width, y: r.top + r.height * 0.93 } : null;
    });
    if (ball) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: ball.x, y: ball.y }); moves++; }
    await sleep(20);
  }
  take.checks.pong = { moves, ...(await page.evaluate(() => ({ score: document.querySelector('#pong-score')?.textContent, rally: document.querySelector('#pong-rally')?.textContent, state: document.querySelector('#pong-state')?.textContent }))) };
}

// ---- Take 2 (alone): a new office with one person; the NPC colleagues work at their desks. ----
async function takeAlone(browser) {
  const take = new Take('alone'); take.pages = {};
  const D = await phone(browser, take, 'D');
  let rec = null;
  try {
    await D.goto(`${APP_ORIGIN}/`, { waitUntil: 'networkidle' });
    await tap(take, 'D', '#link-create', 'dCreate', { onCamera: false });
    await D.waitForURL(/\/o\/[A-Za-z0-9_-]{16}$/, { timeout: 15000 });
    await waitJoinDialog(D, 'ひとりのオフィスで名前を入れる画面');
    await D.locator('#display-name').fill(PEOPLE.A.name);
    await D.locator('#avatar-color').selectOption(PEOPLE.A.color);
    await tap(take, 'D', '#join-submit', 'dJoin', { onCamera: false });
    await waitFor(D, () => window.__vo?.connected?.() && !document.querySelector('#invite-dialog')?.hidden, null, 'ひとりのオフィスに入る（429 なら1分待つ）', 20000);
    await sleep(500);
    await tap(take, 'D', '#invite-close', 'dClose', { onCamera: false });
    await waitFor(D, () => document.querySelector('#room-arrival')?.hidden, null, '到着の案内が消える', 8000);
    // A click on the floor walks there (a touch would take one step): the aisle between TEAM A and TEAM B.
    const point = await D.evaluate((tile) => { const p = window.__vo.screenPoint(tile), r = document.querySelector('#game canvas').getBoundingClientRect(); return { x: r.x + p.x * r.width / p.width, y: r.y + p.y * r.height / p.height }; }, ALONE.tile);
    await D.mouse.click(point.x, point.y);
    take.mark('dWalk', { tile: ALONE.tile });
    await waitFor(D, (t) => { const s = window.__vo.self(); return s && s.x === t.x && s.y === t.y && !window.__vo.navigation().active; }, ALONE.tile, '通路まで歩く', 12000);
    await waitFor(D, () => [...document.querySelectorAll('#labels .npc-label')].filter((l) => getComputedStyle(l).visibility === 'visible').length >= 2, null, 'NPCの同僚が2人見える', 15000);
    await sleep(1000);
    rec = new Recorder(take, 'D', take.pages.D.context, D); await rec.start();
    await sleep(400);
    take.mark('aloneReady');
    take.geo.aloneGeo = await geometry(D);
    await sleep(2300);
    await rec.stop();
    take.checks.npcLabels = take.geo.aloneGeo.labels.filter((l) => l.npc && l.visible).map((l) => `${l.text} / ${l.status}`);
  } finally {
    await rec?.stop().catch(() => {});
    for (const { context } of Object.values(take.pages)) await context.close().catch(() => {});
  }
  delete take.pages;
  return take;
}
function saveTake(take) {
  // The take keeps what its pages asked the network for (hosts and socket paths only, never the k= value) and their console warnings.
  take.network = { hosts: { ...stats.hosts }, sockets: [...stats.sockets] }; take.console = [...stats.console];
  take.recorder = Object.fromEntries(Object.entries(stats.recorder).filter(([k]) => k.startsWith(`${take.name}/`)));
  stats.hosts = {}; stats.sockets = []; stats.console = [];
  mkdirSync(join(framesDir, take.name), { recursive: true }); writeFileSync(join(framesDir, take.name, 'events.json'), JSON.stringify(take, null, 1));
}

// ---- Shots: video time -> capture time, and the camera on the 540x825 frame. ----
const frameOf = (t) => Math.round(t * FPS);
function resolveShots(takes) {
  const plan = SHOTS.map((s) => {
    const take = takes[s.take], [name, video, lead = 0] = s.anchor;
    const frames = take.frames[s.page];
    if (!frames?.length) throw new Error(`録画がありません: ${s.take}/${s.page}`);
    return { ...s, f0: frameOf(s.from), f1: frameOf(s.to), anchorT: take.t(name) + lead, anchorVideo: video, frames, geo: s.geo ? take.geo[s.geo] : null, takeName: take.name };
  });
  plan.forEach((shot, i) => {
    if (!shot.untilPageChanges) return;
    const last = lastFrameBeforeChange(shot);
    const f1 = Math.min(shot.f1, Math.floor((shot.anchorVideo + last.t - shot.anchorT) * FPS + 1e-6) + 1);
    shot.pageChange = { lastGoodSeconds: r4(last.t - shot.anchorT), f1 };
    shot.f1 = f1;
    if (plan[i + 1]) plan[i + 1].f0 = f1;
  });
  return plan;
}
// The first recorded frame after the anchor whose top band (the app header) differs from the anchor's frame: the page navigates.
function lastFrameBeforeChange(shot) {
  const band = (f) => [...execFileSync(ffmpeg, ['-v', 'error', '-i', join(framesDir, shot.takeName, shot.page, `f${pad(f.n)}.png`), '-vf', 'crop=1080:120:0:0,scale=1:1,format=rgb24', '-f', 'rawvideo', '-'])];
  const after = shot.frames.filter((f) => f.t >= shot.anchorT - 0.1 && f.t <= shot.anchorT + 1.5);
  const ref = band(after[0]);
  for (let i = 1; i < after.length; i++) if (band(after[i]).reduce((sum, c, k) => sum + Math.abs(c - ref[k]), 0) > 40) return after[i - 1];
  throw new Error(`${shot.id}: 画面が切り替わらない`);
}
const shotAt = (plan, g) => plan.find((s) => g >= s.f0 && g < s.f1) ?? null;
const captureTime = (shot, v) => shot.anchorT + (v - shot.anchorVideo);
function nearest(frames, t) {
  let lo = 0, hi = frames.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (frames[mid].t <= t) lo = mid; else hi = mid; }
  return Math.abs(frames[lo].t - t) <= Math.abs(frames[hi].t - t) ? frames[lo] : frames[hi];
}
// Focus points (frame CSS px). Labels and bubbles sit above the people, so the people's centre is moved up a little.
function focusPoint(shot, focus, point) {
  const g = shot.geo, centre = { x: FRAME.width / 2, y: FRAME.height / 2 };
  if (point) return { x: point[0], y: point[1] };
  if (focus === 'screen' || !g) return centre;
  // The box around the people (feet and heads) and their labels and bubbles, as the recording saw them.
  const boxes = [];
  if (focus === 'trio' || focus === 'entrance') for (const p of g.players ?? []) if (p.screen) boxes.push({ x: p.screen.x - 14, y: p.screen.y - 40, w: 28, h: 56 });
  if (focus === 'trio' || focus === 'entrance' || focus === 'labels') for (const l of g.labels ?? []) {
    if (!l.visible || !l.rect || (focus !== 'labels' && l.npc) || !g.canvas || l.rect.y > g.canvas.y + g.canvas.h) continue;
    boxes.push(l.rect); if (l.bubbleRect) boxes.push(l.bubbleRect);
  }
  if (boxes.length) {
    const x0 = Math.min(...boxes.map((b) => b.x)), x1 = Math.max(...boxes.map((b) => b.x + b.w)), y0 = Math.min(...boxes.map((b) => b.y)), y1 = Math.max(...boxes.map((b) => b.y + b.h));
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
  }
  if (focus === 'pong' && g.pong) return { x: g.pong.x + g.pong.w / 2, y: g.pong.y + g.pong.h / 2 };
  if (g.canvas) return { x: g.canvas.x + g.canvas.w / 2, y: g.canvas.y + g.canvas.h / 2 };
  return centre;
}
function cameraAt(shot, v) {
  const keys = shot.camera, k = keys.findLastIndex((c) => c.at <= v + 1e-9);
  const a = keys[Math.max(0, k)], b = keys[Math.min(keys.length - 1, Math.max(0, k) + 1)];
  const x = b === a ? 0 : clamp01((v - a.at) / (b.at - a.at)), u = a.ease === 'out' ? 1 - (1 - x) ** 2 : a.ease === 'linear' ? x : smooth(x);
  const fa = focusPoint(shot, a.focus, a.point), fb = focusPoint(shot, b.focus, b.point);
  // A zoom never cuts the focused group: it is capped so the group's box fits with a margin.
  const cap = (f, z, fit = 0.9) => (f.box ? Math.max(1, Math.min(z, fit * Math.min(FRAME.width / f.box.w, FRAME.height / f.box.h))) : z);
  const za = cap(fa, a.zoom, a.fit), zb = cap(fb, b.zoom, b.fit);
  const zoom = za + (zb - za) * u, w = FRAME.width / zoom, h = FRAME.height / zoom, cx = fa.x + (fb.x - fa.x) * u;
  // A view held by its lower edge keeps that edge while it zooms (the edge stays off the text lines).
  const yOf = (f, kf, z) => (kf.bottom !== undefined ? kf.bottom - FRAME.height / z / 2 : f.y);
  const cy = a.bottom !== undefined && b.bottom !== undefined ? a.bottom + (b.bottom - a.bottom) * u - h / 2 : yOf(fa, a, za) + (yOf(fb, b, zb) - yOf(fa, a, za)) * u;
  return { zoom, x: Math.max(0, Math.min(FRAME.width - w, cx - w / 2)), y: Math.max(0, Math.min(FRAME.height - h, cy - h / 2)), w, h };
}
// A page point at video time v -> overlay CSS px (540x960), through the camera; null outside the window.
function toOverlay(shot, v, p) {
  const c = cameraAt(shot, v), u = (p.x - c.x) / c.w, w = (p.y - c.y) / c.h;
  if (u < 0 || u > 1 || w < 0 || w > 1) return null;
  return { x: (WIN.x + u * WIN.w) / DPR, y: (WIN.y + w * WIN.h) / DPR };
}
// ---- The office link in the invitation dialog: its ID (after /o/) is covered by a band in the overlay, never in the app. ----
// The field is found in each recorded frame (the app's white input with a 2 px gray border). Its text is the app's monospaced pixel
// font (PixelMplus12 at 13 px: 6.5 px per character, 12 px padding), so the ID starts 29 characters in ("https://day91.rairakku.com/o/").
// The band follows the field when the dialog re-centres after 「コピーしました」 appears.
const ID_MASK = { prefixChars: 29, charPx: 6.5, padPx: 12, column: 430 };
const fieldCache = new Map();
function inviteField(file) {
  if (fieldCache.has(file)) return fieldCache.get(file);
  const raw = (vf) => execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-vf', `${vf},format=rgb24`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 26 });
  const white = (b, i) => b[3 * i] >= 250 && b[3 * i + 1] >= 250 && b[3 * i + 2] >= 250;
  const gray = (b, i) => b[3 * i] > 70 && b[3 * i] < 125 && b[3 * i + 1] > 80 && b[3 * i + 1] < 135 && b[3 * i + 2] > 88 && b[3 * i + 2] < 145;
  const H = REC.height * DPR, W = REC.width * DPR, cx = ID_MASK.column * DPR, col = raw(`crop=1:${H}:${cx}:0`);
  let found = null;
  for (let y = 0, start = -1; y <= H && !found; y++) {
    const on = y < H && white(col, y);
    if (on && start < 0) start = y;
    if (!on && start >= 0) { if (y - start >= 70 && y - start <= 92 && start > 0 && gray(col, start - 1) && y < H && gray(col, y)) found = [start, y - 1]; start = -1; }
  }
  if (found) {
    // The interior row just under the top border (no text there): white from the left border to the right one.
    const row = raw(`crop=${W}:1:0:${found[0] + 3}`);
    let l = cx, r = cx;
    while (l > 0 && white(row, l - 1)) l--;
    while (r < W - 1 && white(row, r + 1)) r++;
    found = r - l + 1 > 700 && r - l + 1 < 760 && gray(row, l - 1) && gray(row, r + 1) ? { x: l / DPR, y: found[0] / DPR, w: (r - l + 1) / DPR, h: (found[1] - found[0] + 1) / DPR } : null;
  }
  fieldCache.set(file, found);
  return found;
}
const idBand = (f) => ({ x0: f.x + ID_MASK.padPx + ID_MASK.prefixChars * ID_MASK.charPx - 1, y0: f.y + 0.5, x1: f.x + f.w - 0.5, y1: f.y + f.h - 0.5 });
// The recorded frame shown at video frame g (null where no window is shown).
function sourceAt(plan, g) {
  const shot = shotAt(plan, g);
  if (!shot) return null;
  const v = g / FPS, tc = captureTime(shot, v), f = nearest(shot.frames, tc);
  return { shot, v, tc, frame: f, file: join(framesDir, shot.takeName, shot.page, `f${pad(f.n)}.png`) };
}
// Bands per video frame, in overlay CSS px (clipped to the window), with the font size the camera gives the field's text.
function maskPlan(plan, takes) {
  const masks = Array.from({ length: TOTAL }, () => []), report = { frames: [], missing: [] };
  for (let g = 0; g < TOTAL; g++) {
    const src = sourceAt(plan, g);
    if (!src || src.shot.takeName !== 'main' || src.shot.page !== 'A') continue;
    // The dialog is up from officeReady until the lift of 閉じる (a frame captured after the lift already shows the office). The
    // field is looked for only around that time: the join dialog's name field has the same white box and gray border.
    const take = takes.main, open = src.tc >= take.t('officeReady') + 0.04 && src.tc < take.t('closeTap') - 0.005;
    const near = src.tc >= take.t('officeReady') - 0.1 && src.tc <= take.t('closeTap') + 0.1;
    const field = near ? inviteField(src.file) : null;
    if (open && !field) report.missing.push(g);   // the dialog should be up here: a frame with an unmasked ID would show it
    if (!field) continue;
    const c = cameraAt(src.shot, src.v), b = idBand(field), k = WIN.w / c.w / DPR;
    const x0 = Math.max(WIN.x / DPR, (WIN.x + (b.x0 - c.x) * WIN.w / c.w) / DPR), x1 = Math.min((WIN.x + WIN.w) / DPR, (WIN.x + (b.x1 - c.x) * WIN.w / c.w) / DPR);
    const y0 = Math.max(WIN.y / DPR, (WIN.y + (b.y0 - c.y) * WIN.h / c.h) / DPR), y1 = Math.min((WIN.y + WIN.h) / DPR, (WIN.y + (b.y1 - c.y) * WIN.h / c.h) / DPR);
    if (x1 <= x0 || y1 <= y0) continue;
    masks[g].push({ x: +x0.toFixed(2), y: +y0.toFixed(2), w: +(x1 - x0).toFixed(2), h: +(y1 - y0).toFixed(2), fs: +(13 * k).toFixed(2) });
    report.frames.push({ g, field: { x: field.x, y: field.y }, out: { x: Math.round(x0 * DPR), y: Math.round(y0 * DPR), w: Math.round((x1 - x0) * DPR), h: Math.round((y1 - y0) * DPR) } });
  }
  return { masks, report };
}
async function pool(items, size, fn) { let i = 0; await Promise.all(Array.from({ length: size }, async () => { while (i < items.length) await fn(items[i++]); })); }

async function windowFrames(plan) {
  const dir = join(framesDir, 'win');
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const jobs = new Map(), rows = [], empty = [];
  for (let g = 0; g < TOTAL; g++) {
    const v = g / FPS, shot = shotAt(plan, g), out = join(dir, `w${pad(g)}.png`);
    if (!shot) { rows.push({ g, shot: null }); empty.push(out); continue; }
    const tc = captureTime(shot, v), f = nearest(shot.frames, tc), c = cameraAt(shot, v);
    const src = join(framesDir, shot.takeName, shot.page, `f${pad(f.n)}.png`);
    rows.push({ g, shot: shot.id, frame: f.n, dt: r4(f.t - tc), zoom: +c.zoom.toFixed(4), x: +c.x.toFixed(2), y: +c.y.toFixed(2) });
    const key = `${src}|${c.x.toFixed(2)}|${c.y.toFixed(2)}|${c.w.toFixed(3)}`;
    if (jobs.has(key)) jobs.get(key).links.push(out); else jobs.set(key, { src, c, out, links: [] });
  }
  // Crop on a 2x nearest-neighbour copy (half-pixel steps for slow moves), then scale to 1080x1650.
  await pool([...jobs.values()], 8, async ({ src, c, out, links }) => {
    const plain = Math.abs(c.zoom - 1) < 1e-6 && c.x < 1e-6 && c.y < 1e-6;
    const vf = plain ? `crop=${SRC.w}:${SRC.h}:0:0,format=rgb24`
      : `scale=${4 * REC.width}:${4 * REC.height}:flags=neighbor,crop=${Math.round(4 * c.w)}:${Math.round(4 * c.h)}:${Math.round(4 * c.x)}:${Math.round(4 * c.y)},scale=${SRC.w}:${SRC.h}:flags=lanczos,format=rgb24`;
    await execFileP(ffmpeg, ['-v', 'error', '-y', '-i', src, '-vf', vf, out]);
    for (const link of links) symlinkSync(out, link);
  });
  const any = join(dir, `w${pad(rows.find((r) => r.shot).g)}.png`);
  for (const out of empty) symlinkSync(any, out);
  writeFileSync(join(dir, 'plan.json'), JSON.stringify(rows));
  return rows;
}

// ---- Overlay (captions, tap rings, flashes, S1 cards, end card), transparent 540x960 CSS frames at DPR 2. ----
function captionPlan() {
  const segments = [];
  for (const sc of STORYBOARD) {
    const key = sc.lines.join('\n');
    if (segments.length && segments.at(-1).key === key) continue;
    segments.push({ id: sc.id, from: Math.round((sc.captionAt ?? sc.start) * FPS), lines: sc.lines, key });
  }
  return segments;
}
function flashPlan(plan) {
  return [...plan.filter((s) => s.flash).map((s) => [s.f0 / FPS, s.flash]), ...FLASHES].sort((a, b) => a[0] - b[0]);
}
// Rings: every on-camera tap, from the finger-down frame for 0.3 s, never past its shot; placed through that frame's camera.
function markPlan(plan, takes) {
  const marks = Array.from({ length: TOTAL }, () => []), rings = [];
  for (const shot of plan) {
    for (const e of takes[shot.takeName].events.filter((x) => x.kind === 'tap' && x.onCamera && x.who === shot.page)) {
      const vUp = shot.anchorVideo + (e.t - shot.anchorT), vDown = shot.anchorVideo + (e.down - shot.anchorT);
      if (frameOf(vUp) < shot.f0 || frameOf(vUp) >= shot.f1) continue;
      rings.push({ name: e.name, shot: shot.id, videoSeconds: +vUp.toFixed(3) });
      for (let g = Math.max(shot.f0, frameOf(vDown)); g < Math.min(shot.f1, frameOf(vDown + 0.3)); g++) {
        const v = g / FPS, at = toOverlay(shot, v, e);
        if (!at) continue;
        const u = (v - vDown) / 0.3;
        marks[g].push({ x: +at.x.toFixed(2), y: +at.y.toFixed(2), o: +((1 - u) ** 2).toFixed(3), s: +(0.62 + 0.68 * (1 - (1 - u) ** 3)).toFixed(3) });
      }
    }
  }
  return { marks, rings };
}
async function shootOverlay(browser, plan, takes) {
  const dir = join(framesDir, 'overlay');
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const { marks, rings } = markPlan(plan, takes), captions = captionPlan(), { masks, report: maskReport } = maskPlan(plan, takes);
  if (maskReport.missing.length) throw new Error(`招待の画面が出ているのにリンクの欄が見つからないコマ: ${maskReport.missing.join(', ')}`);
  // End card background: the last frame of the alone shot. Logo: the app's own icon (read once from the site).
  const alone = plan.find((s) => s.id === 'alone'), lastAlone = nearest(alone.frames, captureTime(alone, alone.to - 1 / FPS));
  const endBg = join(framesDir, alone.takeName, alone.page, `f${pad(lastAlone.n)}.png`);
  const logoFile = join(framesDir, 'logo.png');
  if (!existsSync(logoFile)) writeFileSync(logoFile, Buffer.from(await (await fetch(`${APP_ORIGIN}/assets/generated/logo-symbol.png`, { redirect: 'error' })).arrayBuffer()));
  const context = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: DPR });
  const page = await context.newPage();
  await page.route('**/*', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: overlayHtml() });
    if (path === '/font.ttf') return route.fulfill({ contentType: 'font/ttf', body: readFileSync(font) });
    if (path === '/font-black.ttf') return route.fulfill({ contentType: 'font/ttf', body: readFileSync(fontBlack) });
    if (path === '/end.png') return route.fulfill({ contentType: 'image/png', body: readFileSync(endBg) });
    if (path === '/logo.png') return route.fulfill({ contentType: 'image/png', body: readFileSync(logoFile) });
    return route.abort();
  });
  try {
    await page.goto('http://promo.local/');
    await page.evaluate(async () => { await document.fonts.load('700 30px Promo'); await document.fonts.load('900 30px PromoBlack'); await document.fonts.ready; await Promise.all([...document.images].map((img) => img.complete ? null : new Promise((done) => { img.onload = done; img.onerror = done; }))); });
    await page.evaluate((data) => window.__setup(data), { storyboard: STORYBOARD, captions, end: END_CARD, flashes: flashPlan(plan), fps: FPS, cards: ARUARU, cardTimes: CARD_TIMES, windowAt: WINDOW_AT, endAt: scene('S7').start, win: { x: WIN.x / DPR, y: WIN.y / DPR, w: WIN.w / DPR, h: WIN.h / DPR, r: WIN.radius / DPR } });
    await page.evaluate(() => window.__background(true));
    await page.screenshot({ path: join(framesDir, 'background.png') });
    await page.evaluate(() => window.__mask(true));
    await page.screenshot({ path: join(framesDir, 'mask.png'), clip: { x: WIN.x / DPR, y: WIN.y / DPR, width: WIN.w / DPR, height: WIN.h / DPR } });
    await page.evaluate(() => { window.__mask(false); window.__background(false); });
    const gaps = [], layout = [];
    // Where the text really sits (overlay CSS px): each caption in the middle of its time, all six cards, the end card.
    const measureAt = new Map([...captions.map((c, i) => [c, Math.round((c.from + (captions[i + 1]?.from ?? frameOf(scene('S7').start))) / 2)]).filter(([c]) => c.lines.length).map(([c, f]) => [f, c.id]),
      [frameOf(WINDOW_AT) - 1, 'S1 cards'], [TOTAL - 1, 'end card']]);
    for (let f = 0; f < TOTAL; f++) {
      const shown = await page.evaluate(([f, m, k]) => window.__frame(f, m, k), [f, marks[f], masks[f]]);
      if (measureAt.has(f)) layout.push({ frame: f, what: measureAt.get(f), ...(await page.evaluate(() => window.__boxes())) });
      if (shown !== null && shown < 0.5) gaps.push({ frame: f, captionOpacity: +shown.toFixed(3) });
      await page.screenshot({ path: join(dir, `o${pad(f)}.png`), omitBackground: true });
      if (f % 120 === 0) log('overlay', f, '/', TOTAL);
    }
    // Safe area: inside 8 px of the sides, below the top 8 % and above the bottom 20 % (the app UI of the posting apps).
    for (const l of layout) l.insideSafeArea = l.x0 >= 8 && l.x1 <= 532 && l.y0 >= 0.08 * 960 && l.y1 <= 0.8 * 960;
    return { captions: captions.map((c) => ({ id: c.id, fromSeconds: +(c.from / FPS).toFixed(3), text: c.lines.join(' ') })), captionGapFrames: gaps, rings, layout, idMask: maskReport };
  } finally { await context.close(); }
}

function overlayHtml() {
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><style>
  @font-face { font-family: Promo; src: url(/font.ttf); font-weight: 700; }
  @font-face { font-family: PromoBlack; src: url(/font-black.ttf); font-weight: 900; }
  :root { --ink: #2A2421; --accent: #D9480F; --cream: #FFF7EE; }
  html, body { margin: 0; width: 540px; height: 960px; overflow: hidden; background: transparent; font-family: Promo, sans-serif; color: var(--ink); }
  .bg { position: absolute; inset: 0; display: none; background: linear-gradient(172deg, #FFF8F0 0%, #FDEFE2 55%, #FBE3CE 100%); }
  .bg i { position: absolute; width: 8px; height: 8px; background: #D9480F; }
  .bg .shadow { position: absolute; background: #1F252E; box-shadow: 0 12px 32px rgba(42, 36, 33, .22), 0 2px 6px rgba(42, 36, 33, .14); }
  .mask { position: absolute; inset: 0; display: none; background: #000; }
  .mask div { position: absolute; background: #fff; }
  .cap { position: absolute; left: 12px; right: 12px; top: 78px; height: 100px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
  .cap span { display: block; font-family: PromoBlack, Promo, sans-serif; font-weight: 900; font-size: 34px; line-height: 1.28; letter-spacing: .02em; white-space: nowrap; }
  .cap span:last-child { color: var(--accent); }
  .cap span:only-child { color: var(--ink); }
  .flash { position: absolute; inset: 0; background: #FFF9F2; opacity: 0; }
  .s1 { position: absolute; inset: 0; display: none; overflow: hidden; background: linear-gradient(170deg, #EFF2F6 0%, #E3E8EF 60%, #D8DFE8 100%); }
  .s1 .dot { position: absolute; border-radius: 50%; background: #7D8B9B; }
  .s1 .card { position: absolute; transform-origin: 50% 50%; white-space: nowrap; font-family: Promo, sans-serif; font-weight: 700; font-size: 25px; letter-spacing: .02em;
    color: #2E3742; background: #fff; border: 2px solid #8C99A8; border-radius: 18px; padding: 14px 22px; box-shadow: 0 8px 18px rgba(46, 55, 66, .16); opacity: 0; }
  .s1 .card::after { content: ''; position: absolute; bottom: -9px; left: 28px; width: 14px; height: 14px; background: #fff; border-right: 2px solid #8C99A8; border-bottom: 2px solid #8C99A8; transform: rotate(45deg); }
  .s1 .card.right::after { left: auto; right: 28px; }
  .idmask { position: absolute; overflow: hidden; display: flex; align-items: center; background: #fff; color: #11161b; font-family: Promo, sans-serif; font-weight: 700; letter-spacing: .06em; white-space: nowrap; }
  .tap { position: absolute; width: 52px; height: 52px; margin: -26px; border-radius: 50%; border: 3px solid #fff; background: rgba(217, 72, 15, .3);
    box-shadow: 0 0 0 2.5px rgba(42, 36, 33, .5), 0 0 14px rgba(42, 36, 33, .3); box-sizing: border-box; }
  .end { position: absolute; inset: 0; display: none; overflow: hidden; background: var(--cream); }
  .end-bg { position: absolute; inset: -40px; width: calc(100% + 80px); height: calc(100% + 80px); object-fit: cover; filter: blur(14px) saturate(1.05); opacity: .55; }
  .end-shade { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 42%, #FFF8F0E6, #FBE3CEF2 78%); }
  .end-body { position: absolute; left: 0; right: 0; top: 178px; text-align: center; }
  .end-body > * { opacity: 0; }
  .end .logo { display: block; margin: 0 auto; width: 96px; height: 96px; image-rendering: pixelated; }
  .end h1 { font-family: PromoBlack, Promo, sans-serif; font-size: 50px; letter-spacing: .02em; margin: 16px 0 22px; font-weight: 900; color: var(--ink); }
  .end .badges { display: flex; justify-content: center; gap: 10px; }
  .end .badges b { font-size: 22px; font-weight: 700; padding: 10px 20px; border-radius: 30px; border: 1.5px solid #2A242133; background: #fff; }
  .end .badges b:first-child { background: var(--accent); color: #fff; border-color: var(--accent); }
  .end .url { margin: 34px auto 0; display: inline-block; font-size: 25px; letter-spacing: .01em; color: #fff; background: #1F252E; padding: 14px 24px; border-radius: 14px; }
  .end .day { margin: 30px auto 0; display: inline-block; font-size: 18px; letter-spacing: .08em; color: var(--accent); border: 1.5px solid #D9480F99; padding: 9px 18px; border-radius: 30px; background: #fff; }
  </style>
  <div class="bg"><div class="shadow"></div></div>
  <div class="mask"><div></div></div>
  <div class="s1"></div>
  <div class="cap"></div>
  <div class="idmasks"></div>
  <div class="taps"></div>
  <div class="end"><img class="end-bg" src="/end.png" alt=""><div class="end-shade"></div>
    <div class="end-body"><img class="logo" src="/logo.png" alt=""><h1 class="end-title"></h1><div class="badges end-badges"></div><div><span class="url end-url"></span></div><div><span class="day end-day"></span></div></div></div>
  <div class="flash"></div>
  <script>
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), easeOut = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;
  let D, current = -1;
  window.__setup = (data) => {
    D = data;
    Object.assign($('.bg .shadow').style, { left: data.win.x + 'px', top: data.win.y + 'px', width: data.win.w + 'px', height: data.win.h + 'px', borderRadius: data.win.r + 'px' });
    // A few pixel squares in the margins (the app is pixel art); never under the captions or the window.
    for (const [x, y, o] of [[22, 40, .14], [38, 56, .08], [506, 30, .12], [490, 50, .07], [24, 916, .12], [44, 932, .07], [500, 908, .13], [484, 928, .08]]) {
      const el = document.createElement('i'); Object.assign(el.style, { left: x + 'px', top: y + 'px', opacity: o }); $('.bg').append(el);
    }
    $('.end-title').textContent = data.end.title; $('.end-url').textContent = data.end.url; $('.end-day').textContent = data.end.day;
    $('.end-badges').replaceChildren(...data.end.badges.map((text) => Object.assign(document.createElement('b'), { textContent: text })));
    // S1: speech-bubble cards, left and right, inside the safe area (below 8% and above 80% of the height).
    const spots = [[188, 172, -4], [352, 268, 3], [186, 364, 2.5], [352, 460, -3], [196, 556, -2], [344, 652, 3.5]];
    const dots = [[64, 120, 70, .05], [470, 200, 46, .06], [452, 760, 90, .045], [84, 700, 40, .06], [290, 820, 30, .05]].map(([x, y, r, o]) => {
      const el = document.createElement('div'); el.className = 'dot'; Object.assign(el.style, { left: (x - r) + 'px', top: (y - r) + 'px', width: 2 * r + 'px', height: 2 * r + 'px', opacity: o }); return el; });
    $('.s1').replaceChildren(...dots, ...data.cards.map((text, i) => { const sp = spots[i % spots.length]; const el = document.createElement('div'); el.className = 'card' + (sp[0] > 270 ? ' right' : ''); el.textContent = text; el.dataset.x = sp[0]; el.dataset.y = sp[1]; el.dataset.r = sp[2]; return el; }));
  };
  window.__boxes = () => {
    const els = [...document.querySelectorAll('.cap span, .s1 .card, .end .logo, .end h1, .end .badges b, .end .url, .end .day')].filter((el) => el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden' && Number(getComputedStyle(el).opacity) > 0 && el.closest('.s1, .end, .cap').style.display !== 'none');
    // The text itself, not its block (the title is a full-width block): a range over the contents; images by their own box.
    const r = els.map((el) => { if (el.tagName === 'IMG') return el.getBoundingClientRect(); const range = document.createRange(); range.selectNodeContents(el); const b = range.getBoundingClientRect(); return b.width ? b : el.getBoundingClientRect(); }).filter((b) => b.width);
    return r.length ? { items: r.length, x0: +Math.min(...r.map((b) => b.left)).toFixed(1), x1: +Math.max(...r.map((b) => b.right)).toFixed(1), y0: +Math.min(...r.map((b) => b.top)).toFixed(1), y1: +Math.max(...r.map((b) => b.bottom)).toFixed(1) } : { items: 0 };
  };
  window.__mask = (on) => { $('.mask').style.display = on ? 'block' : 'none'; Object.assign($('.mask div').style, { left: D.win.x + 'px', top: D.win.y + 'px', width: D.win.w + 'px', height: D.win.h + 'px', borderRadius: D.win.r + 'px' }); };
  window.__background = (on) => { $('.bg').style.display = on ? 'block' : 'none'; for (const s of ['.cap', '.idmasks', '.taps', '.end', '.flash', '.s1']) $(s).style.visibility = on ? 'hidden' : 'visible'; };
  const spans = (lines) => lines.map((text) => Object.assign(document.createElement('span'), { textContent: text }));
  window.__frame = (f, marks, masks = []) => {
    const fr = (sec) => Math.round(sec * D.fps), t = f / D.fps;
    // Captions change on the frame of their picture: 75 % on that frame, then fully in 0.12 s. No old caption is left over.
    const segs = D.captions, i = segs.findLastIndex((s) => f >= s.from);
    if (i !== current) { $('.cap').replaceChildren(...spans(segs[i].lines)); current = i; }
    const age = (f - segs[i].from) / D.fps + (segs[i].from === 0 ? 1 : 0);
    [...$('.cap').querySelectorAll('span')].forEach((el) => { const u = easeOut(age / 0.12); el.style.opacity = 0.75 + 0.25 * u; el.style.transform = 'translateY(' + ((1 - u) * 5) + 'px)'; });
    let flash = 0;
    for (const [at, strength] of D.flashes) { const dt = (f - fr(at)) / D.fps; if (dt >= 0) flash = Math.max(flash, strength * Math.exp(-dt / 0.12)); }
    $('.flash').style.opacity = flash;
    // The office ID in the invitation's link field: a white band with dots over the field (the app itself is not touched).
    $('.idmasks').replaceChildren(...masks.map((m) => { const el = document.createElement('div'); el.className = 'idmask'; el.textContent = '••••••••'; Object.assign(el.style, { left: m.x + 'px', top: m.y + 'px', width: m.w + 'px', height: m.h + 'px', fontSize: m.fs + 'px', paddingLeft: (m.fs * 0.15) + 'px' }); return el; }));
    $('.taps').replaceChildren(...marks.map((m) => { const el = document.createElement('div'); el.className = 'tap'; Object.assign(el.style, { left: m.x + 'px', top: m.y + 'px', opacity: m.o, transform: 'scale(' + m.s + ')' }); return el; }));
    // S1: one card per beat with a small overshoot; all of them wobble a little once the screen is full. Gone under the flash
    // on the frame the app window appears.
    const s1 = D.storyboard.find((s) => s.overlayOnly), on1 = f >= fr(s1.start) && f < fr(D.windowAt);
    $('.s1').style.display = on1 ? 'block' : 'none';
    if (on1) {
      const ts = t - s1.start, wob = clamp((t - D.cardTimes.at(-1) - 0.2) / 0.4, 0, 1);
      [...$('.s1').querySelectorAll('.card')].forEach((el, k) => {
        const age = t - D.cardTimes[k], u = clamp(age / 0.24, 0, 1);
        const back = (x) => { const c = 2.2; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };
        const scale = age < 0 ? 0.6 : 0.6 + 0.4 * back(u), bob = age > 0 ? 2.5 * Math.sin(2 * Math.PI * (age * 0.8 + k * 0.25)) : 0;
        const rot = Number(el.dataset.r) + wob * 2.2 * Math.sin(2 * Math.PI * (ts * 2.4 + k * 0.37));
        el.style.opacity = age < 0 ? 0 : 0.75 + 0.25 * clamp(age / 0.08, 0, 1);
        el.style.left = el.dataset.x + 'px'; el.style.top = el.dataset.y + 'px';
        el.style.transform = 'translate(-50%, -50%) translateY(' + bob + 'px) rotate(' + rot + 'deg) scale(' + scale + ')';
      });
    }
    // The end card is a cut (opaque from its first frame, under the flash).
    const end = f >= fr(D.endAt);
    $('.end').style.display = end ? 'block' : 'none';
    $('.cap').style.visibility = end ? 'hidden' : 'visible';
    if (end) {
      const e = t - D.endAt;
      [...$('.end-body').children].forEach((el, k) => { const u = easeOut((e - k * 0.06) / 0.28); el.style.opacity = 0.6 + 0.4 * u; el.style.transform = 'translateY(' + ((1 - u) * 14) + 'px)'; });
      $('.end-bg').style.transform = 'scale(' + (1.04 + e * 0.02) + ')';
    }
    // For the report: the caption on screen (largest line opacity); null where no caption belongs (S1 cards, end card).
    if (end || on1 || !segs[i].lines.length) return null;
    return Math.max(0, ...[...document.querySelectorAll('.cap span')].map((el) => Number(el.style.opacity)));
  };
  </script></html>`;
}

// ---- Compose and encode. ----
function compose(plan, takes) {
  mkdirSync(outDir, { recursive: true });
  // Every overlay frame to rgba: an opaque frame (S1, the end card) would be saved as rgb24, and a pixel-format change inside an
  // image sequence makes ffmpeg rebuild the filter graph and drop the overlay on a frame or two.
  const overlayDir = join(framesDir, 'overlay-rgba');
  rmSync(overlayDir, { recursive: true, force: true }); mkdirSync(overlayDir, { recursive: true });
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', join(framesDir, 'overlay', 'o%05d.png'), '-vf', 'format=rgba', '-start_number', '0', join(overlayDir, 'o%05d.png')]);
  const silent = join(outDir, silentName);
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'warning', '-y',
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
      '[b][3:v]overlay=0:0:format=auto,format=yuv420p[v]'].join(';'),
    '-map', '[v]', '-frames:v', String(TOTAL), '-r', String(FPS),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-map_metadata', '-1', silent], { stdio: 'inherit' });
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', silent, '-frames:v', '1', '-map_metadata', '-1', join(outDir, 'first-frame.png')]);
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', silent, '-vf', 'fps=1,scale=270:480,tile=8x4:padding=6:color=0x2A2421', '-frames:v', '1', '-q:v', '3', '-map_metadata', '-1', join(outDir, 'contact-sheet.jpg')]);
  const gray = (n) => execFileSync(ffmpeg, ['-v', 'error', '-i', silent, '-vf', `select=eq(n\\,${n}),scale=270:480,format=gray`, '-frames:v', '1', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 24 });
  const motion = (x, y) => { const [a, b] = [gray(x), gray(y)]; let diff = 0, changed = 0; for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); diff += d; if (d > 8) changed++; } return { meanAbsDiff: +(diff / a.length).toFixed(3), changedPixelsPercent: +(100 * changed / a.length).toFixed(2) }; };
  const result = { firstFrameMotion: { frames0to1: motion(0, 1), frames0to3: motion(0, 3) } };
  if (result.firstFrameMotion.frames0to1.meanAbsDiff === 0) throw new Error('1コマ目と2コマ目が同じ（動いていない）');
  const hook = [];
  for (let n = 0; n < Math.round(scene('S0').end * FPS) - 1; n += 8) hook.push({ frame: n, ...motion(n, n + 1) });
  result.hookMotion = { minMeanAbsDiff: Math.min(...hook.map((m) => m.meanAbsDiff)), samples: hook };
  // Every cut (and the drop): the 2 frames before and the 2 after, one row each.
  const cuts = [...new Set([...plan.map((s) => s.f0), ...plan.map((s) => s.f1), frameOf(MUSIC_CUES.dropAt), frameOf(scene('S7').start)])].filter((c) => c >= 2 && c < TOTAL - 1).sort((a, b) => a - b);
  // Rows can share frames (the drop is 2 frames before the next cut): extract each frame once, then lay the rows out with repeats.
  const picks = cuts.flatMap((c) => [c - 2, c - 1, c, c + 1]), unique = [...new Set(picks)].sort((x, y) => x - y);
  const sheet = join(framesDir, 'cut-check');
  rmSync(sheet, { recursive: true, force: true }); mkdirSync(sheet, { recursive: true });
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', silent, '-vf', `select='${unique.map((n) => `eq(n\\,${n})`).join('+')}',scale=216:384`, '-fps_mode', 'passthrough', '-start_number', '0', join(sheet, 'u%04d.png')]);
  picks.forEach((n, i) => symlinkSync(join(sheet, `u${String(unique.indexOf(n)).padStart(4, '0')}.png`), join(sheet, `s${String(i).padStart(4, '0')}.png`)));
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-framerate', '1', '-i', join(sheet, 's%04d.png'), '-vf', `tile=4x${cuts.length}:padding=6:color=0x2A2421`, '-frames:v', '1', '-q:v', '3', '-map_metadata', '-1', join(outDir, 'cut-check.jpg')]);
  result.idMask = verifyIdMask(silent, maskPlan(plan, takes).report, overlayDir);
  result.cutCheck = { file: 'cut-check.jpg', rows: cuts.map((c) => ({ cutFrame: c, seconds: +(c / FPS).toFixed(3), frames: [c - 2, c - 1, c, c + 1], shot: plan.find((s) => s.f0 === c)?.id ?? (c === frameOf(scene('S7').start) ? 'end card' : c === frameOf(MUSIC_CUES.dropAt) ? 'drop' : c === frameOf(scene('S1').start) ? 'S1 cards' : null) })) };
  return result;
}

// Every frame that shows the invitation: the overlay's band is fully opaque over the ID, the ID text really is under it (the window
// frame has dark glyphs there), and the finished frame shows the band (white with dots), not the glyphs.
function verifyIdMask(video, report, overlayDir) {
  if (!report.frames.length) return { frames: 0, ok: false, note: '招待の画面が見つからない' };
  const a = report.frames[0].g, b = report.frames.at(-1).g, dir = join(framesDir, 'id-check');
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', video, '-vf', `select='between(n\\,${a}\\,${b})'`, '-fps_mode', 'passthrough', '-start_number', String(a), join(dir, 'v%05d.png')]);
  const crop = (file, r, fmt) => execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-vf', `crop=${r.w}:${r.h}:${r.x}:${r.y},format=${fmt}`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 24 });
  const rows = report.frames.map(({ g, out: edge }) => {
    // 2 px inside the band's edges (its edges fall between pixels and are blended; the ID starts 1 CSS px = 3 px inside).
    const out = { x: edge.x + 2, y: edge.y + 2, w: edge.w - 4, h: edge.h - 4 };
    const alpha = crop(join(overlayDir, `o${pad(g)}.png`), out, 'rgba'); let opaque = 0;
    for (let i = 3; i < alpha.length; i += 4) if (alpha[i] >= 250) opaque++;
    // The same rectangle in the window frame (1080x1650, before the 0.8x scale), where the ID glyphs are.
    const wr = { x: Math.round((out.x - WIN.x) * SRC.w / WIN.w), y: Math.round((out.y - WIN.y) * SRC.h / WIN.h), w: Math.round(out.w * SRC.w / WIN.w), h: Math.round(out.h * SRC.h / WIN.h) };
    const under = crop(join(framesDir, 'win', `w${pad(g)}.png`), wr, 'gray'), shown = crop(join(dir, `v${pad(g)}.png`), out, 'gray');
    const dark = (buf) => buf.reduce((n, v) => n + (v < 110), 0) / buf.length, whiteShare = shown.reduce((n, v) => n + (v > 230), 0) / shown.length;
    return { g, opaque: +(opaque / (alpha.length / 4)).toFixed(4), idGlyphsUnder: +dark(under).toFixed(4), shownDark: +dark(shown).toFixed(4), shownWhite: +whiteShare.toFixed(4) };
  });
  const ok = rows.every((r) => r.opaque >= 0.999 && r.idGlyphsUnder > 0.03 && r.shownWhite > 0.6);
  return { frames: rows.length, firstFrame: a, lastFrame: b, seconds: [+(a / FPS).toFixed(3), +((b + 1) / FPS).toFixed(3)], missingFieldFrames: report.missing,
    minOpaque: Math.min(...rows.map((r) => r.opaque)), minIdGlyphsUnder: Math.min(...rows.map((r) => r.idGlyphsUnder)), maxShownDark: Math.max(...rows.map((r) => r.shownDark)), minShownWhite: Math.min(...rows.map((r) => r.shownWhite)), ok };
}

// demo.mp4 for the 100-day list: the phone screen only (no captions, rings or window), 540x960, about 16 s.
function demo(takes) {
  const main = takes.main, alone = takes.alone, list = [], picks = [];
  const seg = (take, who, from, to, speed = 1) => { const frames = take.frames[who]; for (let t = from; t < to; t += speed / FPS) { const file = join(framesDir, take.name, who, `f${pad(nearest(frames, t).n)}.png`); list.push(file); picks.push({ take: take.name, who, t, file }); } };
  seg(main, 'A', main.t('createTap') - 0.6, main.t('createTap') + 0.03);
  seg(main, 'A', main.t('joinReady') + 0.15, main.t('joinTap') + 0.35);
  seg(main, 'A', main.t('officeReady') + 1.2, main.t('cJoin') + 1.2, 1.6);
  seg(main, 'A', main.t('deskTap') - 0.1, main.t('aHello') + 1.0, 1.6);
  seg(main, 'A', main.t('coffeeTap') - 0.05, main.t('meetingTap') + 0.3, 1.6);
  seg(main, 'A', main.t('meetingReady') + 0.08, main.t('meetingReady') + 1.2);
  seg(main, 'C', main.t('serveTap') - 0.1, main.t('serveTap') + 1.8);
  seg(alone, 'D', alone.t('aloneReady'), alone.t('aloneReady') + 2.0);
  // The invitation's ID is covered here too: the same band, burned into a copy of each frame that shows the dialog.
  const maskedDir = join(framesDir, 'demo-masked'), maskedFiles = new Map(), missing = [];
  rmSync(maskedDir, { recursive: true, force: true }); mkdirSync(maskedDir, { recursive: true });
  picks.forEach((p, i) => {
    if (p.take !== 'main' || p.who !== 'A') return;
    const open = p.t >= main.t('officeReady') + 0.04 && p.t < main.t('closeTap') - 0.005;
    const field = p.t >= main.t('officeReady') - 0.1 && p.t <= main.t('closeTap') + 0.1 ? inviteField(p.file) : null;   // not the join dialog's name field
    if (open && !field) missing.push(i);
    if (!field) return;
    if (!maskedFiles.has(p.file)) {
      const b = idBand(field), out = join(maskedDir, basename(p.file)), box = [b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0].map((v) => Math.round(v * DPR));
      execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', p.file, '-vf', `drawbox=x=${box[0]}:y=${box[1]}:w=${box[2]}:h=${box[3]}:color=white@1:t=fill,drawtext=fontfile=${font}:text='••••••••':fontsize=${13 * DPR}:fontcolor=0x11161b:x=${box[0] + 6}:y=${box[1] + box[3] / 2}-th/2`, out]);
      maskedFiles.set(p.file, out);
    }
    list[i] = maskedFiles.get(p.file);
  });
  if (missing.length) throw new Error(`demo: 招待の画面が出ているのにリンクの欄が見つからないコマ: ${missing.join(', ')}`);
  const dir = join(framesDir, 'demo-seq');
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  list.forEach((file, i) => symlinkSync(file, join(dir, `d${pad(i)}.png`)));
  const out = join(outDir, 'demo.mp4');
  for (const crf of [30, 33, 36]) {
    execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', join(dir, 'd%05d.png'),
      '-vf', 'scale=540:960:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', '-map_metadata', '-1', out]);
    if (statSync(out).size <= 1024 * 1024) return { seconds: +(list.length / FPS).toFixed(2), bytes: statSync(out).size, crf, idMaskedFrames: [...maskedFiles.keys()].length, idMaskedPicks: list.filter((f) => f.startsWith(maskedDir)).length };
  }
  return { seconds: +(list.length / FPS).toFixed(2), bytes: statSync(out).size, crf: 36, note: '1MBに収まらない', idMaskedPicks: list.filter((f) => f.startsWith(maskedDir)).length };
}
function mux(variant) {
  const src = ['wav', 'mp3'].map((ext) => join(outDir, `bgm_${variant}.${ext}`)).find(existsSync);
  if (!src) throw new Error(`BGMがありません: ${join(outDir, `bgm_${variant}.(wav|mp3)`)}`);
  const out = join(outDir, `Day091_virtual-office_promo_${variant}.mp4`);
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
  if (kind === 'demo') ok = v.width === 540 && v.height === 960 && v.codec_name === 'h264' && v.pix_fmt === 'yuv420p' && !a && seconds >= 15 && seconds <= 18 && decode.trim() === '';
  else {
    const silent = file.endsWith(silentName);
    ok = v.width === 1080 && v.height === 1920 && v.codec_name === 'h264' && v.pix_fmt === 'yuv420p' && v.r_frame_rate === '30/1'
      && Math.abs(seconds - DURATION_SECONDS) <= 1 / FPS + 0.001 && decode.trim() === '' && (silent ? !a : a?.codec_name === 'aac' && a.sample_rate === '48000' && a.channels === 2);
  }
  const row = { file: basename(file), ok, size: `${v.width}x${v.height}`, codec: v.codec_name, pix: v.pix_fmt, fps: v.r_frame_rate, frames: Number(v.nb_frames), seconds: +seconds.toFixed(3), bytes,
    audio: a ? `${a.codec_name} ${a.sample_rate}Hz ${a.channels}ch` : 'なし', decodeErrors: decode.trim() ? decode.trim().split('\n').length : 0 };
  log(ok ? '検査OK' : '検査NG', JSON.stringify(row));
  if (!ok) throw new Error(`出力が仕様と違います: ${file}`);
  return row;
}
// Where the music really hits: the 10 ms window with the largest loudness rise within ±0.25 s of a cue.
function onset(wavFile, cue) {
  const buf = readFileSync(wavFile);
  let o = 12, rate = 48000, channels = 2, data = null;
  while (o + 8 <= buf.length) { const id = buf.toString('ascii', o, o + 4), n = buf.readUInt32LE(o + 4); if (id === 'fmt ') { channels = buf.readUInt16LE(o + 10); rate = buf.readUInt32LE(o + 12); } if (id === 'data') { data = buf.subarray(o + 8, o + 8 + n); break; } o += 8 + n + (n % 2); }
  const win = Math.round(rate * 0.01), rms = (i0) => { let sum = 0; for (let i = i0; i < i0 + win; i++) for (let c = 0; c < channels; c++) { const x = data.readInt16LE((i * channels + c) * 2) / 32768; sum += x * x; } return Math.sqrt(sum / (win * channels)) + 1e-9; };
  let best = { rise: -Infinity, at: null };
  for (let t = cue - 0.25; t <= cue + 0.25; t += 0.005) { const i = Math.round(t * rate); const rise = 20 * Math.log10(rms(i) / rms(i - win)); if (rise > best.rise) best = { rise, at: t }; }
  return { cue, measured: +best.at.toFixed(3), riseDb: +best.rise.toFixed(1), offsetFrames: +((best.at - cue) * FPS).toFixed(2) };
}

// What each shot really shows and how well it is covered by the recording.
function shotReport(plan, rows, takes) {
  return plan.map((shot) => {
    const mine = rows.filter((r) => r.shot === shot.id), take = takes[shot.takeName];
    let repeats = 0; for (let i = 1; i < mine.length; i++) if (mine[i].frame === mine[i - 1].frame) repeats++;
    const taps = take.events.filter((e) => e.kind === 'tap' && e.who === shot.page && e.onCamera).map((e) => ({ name: e.name, videoSeconds: +(shot.anchorVideo + e.t - shot.anchorT).toFixed(3) })).filter((e) => frameOf(e.videoSeconds) >= shot.f0 && frameOf(e.videoSeconds) < shot.f1);
    const span = [captureTime(shot, shot.f0 / FPS), captureTime(shot, (shot.f1 - 1) / FPS)];
    return { id: shot.id, video: [+(shot.f0 / FPS).toFixed(3), +(shot.f1 / FPS).toFixed(3)], frames: [shot.f0, shot.f1 - 1], page: `${shot.takeName}/${shot.page}`, anchor: shot.anchor[0], capture: span.map((t) => +t.toFixed(3)), pageChange: shot.pageChange ?? undefined,
      shownFrames: mine.length, repeatedFrames: repeats, maxFrameOffsetMs: +(1000 * Math.max(...mine.map((r) => Math.abs(r.dt)))).toFixed(1), zoom: [Math.min(...mine.map((r) => r.zoom)), Math.max(...mine.map((r) => r.zoom))], taps };
  });
}
// The cut between two shots of the same recording: how much real time is skipped (0 = continuous).
function joins(plan) {
  return plan.slice(1).map((shot, i) => { const prev = plan[i]; if (prev.takeName !== shot.takeName || prev.page !== shot.page || prev.f1 !== shot.f0) return null;
    return { from: prev.id, to: shot.id, atSeconds: +(shot.f0 / FPS).toFixed(3), skippedSeconds: +(captureTime(shot, shot.f0 / FPS) - captureTime(prev, (prev.f1 - 1) / FPS) - 1 / FPS).toFixed(3) }; }).filter(Boolean);
}

// ---- Run (one browser at a time). ----
mkdirSync(framesDir, { recursive: true });
const timings = {};
const timed = async (name, fn) => { const t0 = Date.now(); const r = await fn(); timings[name] = +((Date.now() - t0) / 60000).toFixed(1); return r; };
let browser = null;
const extras = {};
try {
  const shootMain = wanted('main'), shootAlone = wanted('alone');
  if (shootMain || shootAlone || (!flag('--no-compose') && (wanted('overlay') || shootMain || shootAlone))) browser = await (await loadChromium()).launch();
  if (shootMain) saveTake(await timed('main', () => takeMain(browser)));
  if (shootAlone) saveTake(await timed('alone', () => takeAlone(browser)));
  if (!flag('--no-compose')) {
    const takes = { main: Take.load('main'), alone: Take.load('alone') };
    const plan = resolveShots(takes);
    if (browser && (wanted('overlay') || shootMain || shootAlone)) extras.overlay = await timed('overlay', () => shootOverlay(browser, plan, takes));
    extras.plan = plan; extras.takes = takes;
  }
} finally { await browser?.close().catch(() => {}); }

const outputs = [];
let report = existsSync(join(framesDir, 'capture-report.json')) ? JSON.parse(readFileSync(join(framesDir, 'capture-report.json'), 'utf8')) : {};
if (!flag('--no-compose')) {
  const { plan, takes } = extras;
  const rows = await timed('window', () => windowFrames(plan));
  const composed = compose(plan, takes);
  outputs.push(probe(join(outDir, silentName)));
  for (const variant of (arg('--mux', '') || '').split(',').filter(Boolean)) outputs.push(probe(mux(variant)));
  const demoInfo = demo(takes);
  outputs.push(probe(join(outDir, 'demo.mp4'), 'demo'));
  const main = takes.main, alone = takes.alone;
  const videoTimeOf = (name) => { for (const shot of plan) { const take = takes[shot.takeName]; const e = take.events.find((x) => x.name === name); if (!e) continue; const v = shot.anchorVideo + e.t - shot.anchorT; if (frameOf(v) >= shot.f0 && frameOf(v) < shot.f1) return +v.toFixed(3); } return null; };
  const tapCueDrift = TAP_CUES.map((cue) => { const name = Object.keys(PLAN).find((k) => PLAN[k] === cue); const v = videoTimeOf(name); return { name, cue, video: v, driftFrames: v === null ? null : +((v - cue) * FPS).toFixed(2) }; });
  const musicSync = ['a', 'b'].map((x) => join(outDir, `bgm_${x}.wav`)).filter(existsSync).map((file) => ({ file: basename(file), drop: onset(file, MUSIC_CUES.dropAt), endChord: onset(file, MUSIC_CUES.endChordAt) }));
  const g = main.geo;
  const said = (geo) => (geo?.labels ?? []).filter((l) => !l.npc).map((l) => ({ name: l.text, status: l.status, bubble: l.bubble, reaction: l.reaction, onMap: labelsOnMap(geo).includes(l.text) }));
  const onScreen = {
    S2_join: { guestNameBefore: main.events.find((e) => e.name === 'joinReady')?.guestName ?? null, typed: main.events.find((e) => e.name === 'nameTyped')?.value ?? null },
    S2_invite: { open: g.invite?.open, room: g.invite?.room, members: g.invite?.members },
    S3_arrivals: { members: g.arrivals?.members, presence: g.arrivals?.presence, people: g.arrivals?.players?.map((p) => p.name) },
    S3_end: { members: g.endOfS3?.members, people: g.endOfS3?.players?.map((p) => `${p.name}(${p.x},${p.y})`) },
    S4_social: { people: g.trioSocial?.players?.map((p) => `${p.name} ${p.seated ? '着席' : '立ち'} ${p.status}`), labels: said(g.trioSocial) },
    hook: { people: g.trioHook?.players?.map((p) => `${p.name} ${p.seated ? '着席' : '立ち'} ${p.status}`), labels: said(g.trioHook) },
    S5_coffee: { location: 'コーヒーバー', members: g.coffee?.members },
    S5_rooms: { open: g.rooms?.open },
    S5_meeting: { room: g.meetingGeo?.room, members: g.meetingGeo?.members, arrival: g.meetingGeo?.arrival, labels: said(g.meetingGeo) },
    S5_pong: main.checks.pong,
    S6_alone: { members: alone.geo.aloneGeo?.members, npc: alone.checks.npcLabels, labels: said(alone.geo.aloneGeo) },
  };
  const size = (dir) => readdirSync(dir, { withFileTypes: true }).reduce((sum, e) => sum + (e.isDirectory() ? size(join(dir, e.name)) : e.isFile() ? statSync(join(dir, e.name)).size : 0), 0);
  report = { seconds: DURATION_SECONDS, fps: FPS, width: 1080, height: 1920, bpm: +(720 / 7).toFixed(3), beat: +(7 / 12).toFixed(4), appOrigin: APP_ORIGIN,
    method: 'real-time CDP screenshots (PNG 1080x1920 of the top 540x960 CSS px of a 540x1020 phone, DPR 2), one per ~25 ms, resampled to 30 fps by time',
    window: WIN, frameShown: FRAME, seatedStatusWorkaround: SEATED_STATUS,
    recorder: { ...main.recorder, ...alone.recorder }, shots: shotReport(plan, rows, takes), joins: joins(plan), tapCueDrift, onScreen,
    checks: { main: main.checks, alone: alone.checks },
    captions: extras.overlay?.captions ?? report.captions, captionGapFrames: extras.overlay?.captionGapFrames ?? report.captionGapFrames, rings: extras.overlay?.rings ?? report.rings,
    ...composed, musicSync, demo: demoInfo, outputs,
    network: { main: main.network, alone: alone.network, note: '接続先の k= は記録しない。オフィスのIDは /o/<id> に伏せる' },
    consoleWarnings: [...(main.console ?? []), ...(alone.console ?? [])], layout: extras.overlay?.layout ?? report.layout, minutesByPart: { ...report.minutesByPart, ...timings }, framesBytes: size(framesDir) };
  writeFileSync(join(outDir, 'capture-report.json'), JSON.stringify(report, null, 2) + '\n');
} else report = { ...report, recorder: { ...report.recorder, ...stats.recorder }, minutesByPart: { ...report.minutesByPart, ...timings } };
writeFileSync(join(framesDir, 'capture-report.json'), JSON.stringify(report, null, 2) + '\n');
log('完了', JSON.stringify({ minutesByPart: report.minutesByPart, consoleWarnings: (report.consoleWarnings ?? []).length }));
