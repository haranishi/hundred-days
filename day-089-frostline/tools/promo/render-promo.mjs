// Day089 "FROSTLINE" promo video (vertical 1080x1920, 30 fps, 30 s), shot frame by frame from the real game.
// The game has its own manual clock (window.__ginrei with ?debug=1: setManual / teleport / setInput / advance). Every take is
// stepped by exactly the game time of each video frame, waits two animation frames for the WebGPU canvas, then is shot as a JPEG.
// Inputs change only on the game's 1/120 s physics grid, so a take gives the same run however its frames are cut (the jump's
// slow motion included); the jump is checked by the physics before it is shot (trick name and a clean landing).
// The game is shot full-bleed at CSS 540x960, DPR 2 (its default high tier on a desktop browser), the on-screen buttons hidden as in the
// game's own demo tool (tools/shots/demo-capture.mjs); the speed readout and the game's messages stay. Captions, press rings,
// flashes, the S1 card and the end card are composited by ffmpeg. Only the local server is reachable; every other request is aborted
// and counted (no request leaves the machine), and no frame shows the local address (checked on the page text).
//
// Usage:
//   node render-promo.mjs --frames-dir <work dir> --out-dir <output dir> [--url http://127.0.0.1:5185/] [--app-dir <dir with playwright>]
//   --only hook,title,carve,jump,ski,map,vista,overlay   re-shoot only these (the others reuse their frames)
//   --compose-only     no shooting, only overlay-free compositing and encoding (needs every take and the overlay)
//   --no-compose       shoot only
//   --mux a,b          also mux <out-dir>/bgm_{a,b}.(wav|mp3) into Day089_frostline_promo_{a,b}.mp4
//   --clean            delete the frame folders after a successful compose (the SSD is small)
// Paths can also come from PROMO_FRAMES_DIR / PROMO_OUT_DIR / PROMO_URL / PROMO_APP_DIR. Fonts: PROMO_FONT, PROMO_FONT_BLACK.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BAR, BEAT, DOUBTS, DURATION_SECONDS, END_CARD, FLASHES, FPS, MUSIC_CUES, PRESSES, PUBLIC_URL, STEP, STORYBOARD, TAKES, bar, frameAt } from './timeline.mjs';

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const flag = (name) => process.argv.includes(name);
const need = (value, what) => { if (!value) throw new Error(`${what} を指定してください（引数か環境変数）`); return resolve(value); };
const framesDir = need(arg('--frames-dir', process.env.PROMO_FRAMES_DIR), '--frames-dir');
const outDir = need(arg('--out-dir', process.env.PROMO_OUT_DIR), '--out-dir');
const gameUrl = new URL(arg('--url', process.env.PROMO_URL || 'http://127.0.0.1:5185/'));
const font = process.env.PROMO_FONT || join(homedir(), 'Library/Fonts/ZenKakuGothicNew-Bold.ttf');
const fontBlack = process.env.PROMO_FONT_BLACK || join(homedir(), 'Library/Fonts/ZenKakuGothicNew-Black.ttf');
const TOTAL = Math.round(DURATION_SECONDS * FPS);
const VIEW = { width: 540, height: 960 }, DPR = 2;   // 1080x1920 frames
const GPU_ARGS = ['--enable-unsafe-webgpu', '--enable-features=WebGPU', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];
const OUT_NAME = (v) => `Day089_frostline_promo_${v}.mp4`;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const only = (arg('--only', '') || '').split(',').filter(Boolean);
const wanted = (name) => !flag('--compose-only') && (!only.length || only.includes(name));
const LOCAL = /127\.0\.0\.1|localhost|\[::1\]/i;

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* not next to this file: use --app-dir */ }
  const dir = arg('--app-dir', process.env.PROMO_APP_DIR);
  if (!dir) throw new Error('playwright が見つかりません。--app-dir に playwright を入れたフォルダ（ゲームのリポジトリなど）を渡してください');
  return import(pathToFileURL(join(resolve(dir), 'node_modules/playwright/index.mjs')).href);
}

// ---- Shooting --------------------------------------------------------------------------------------------------------------
const stats = { requests: 0, local: 0, blocked: [], warnings: [], takes: {}, frames: {}, localAddressSeen: [], backend: null };
function takeDir(take) { const dir = join(framesDir, take); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true }); return dir; }
const fname = (take, k) => join(framesDir, take, `f${String(k).padStart(5, '0')}.jpg`);

async function openGame(browser, take, gear) {
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: DPR, locale: 'ja-JP', reducedMotion: 'reduce', serviceWorkers: 'block' });
  // Only the local game server answers. Anything else is aborted before it is sent, and listed (it should stay empty).
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    if (new URL(url).origin === gameUrl.origin) { stats.local++; return route.continue(); }
    stats.blocked.push(url); return route.abort();
  });
  context.on('request', (request) => { if (!/^(data|blob):/.test(request.url())) stats.requests++; });
  // No on-screen hints (the setting), the gear of this take.
  await context.addInitScript((g) => localStorage.setItem('ginrei.settings.v1', JSON.stringify({ hints: false, gear: g })), gear);
  const page = await context.newPage();
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) stats.warnings.push(`${take}: ${m.type()}: ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => stats.warnings.push(`${take}: pageerror: ${e.message}`));
  const url = new URL(gameUrl); url.searchParams.set('debug', '1');
  const response = await page.goto(url.href, { waitUntil: 'load', timeout: 60000 });
  if (!response?.ok()) throw new Error(`ゲームを開けない: ${response?.status()} ${url.href}`);
  await page.waitForFunction(() => !!window.__ginrei, null, { timeout: 60000 });
  const info = await page.evaluate(() => window.__ginrei.ready);
  stats.backend = info;
  if (info?.backend !== 'webgpu' || info?.tier !== 'high') stats.warnings.push(`${take}: 描画が想定と違う ${JSON.stringify(info)}`);
  await page.evaluate(() => window.__ginrei.setManual(true));
  // The on-screen buttons (view, map, pause) are hidden, as in the game's own demo tool. The speed readout and messages stay.
  await page.addStyleTag({ content: '.controls { visibility: hidden !important; }' });
  // One frame: apply each [input, seconds] chunk, then wait two animation frames so the canvas shows the last draw.
  await page.evaluate(() => {
    window.__promoRun = (chunks) => new Promise((done) => {
      for (const [input, seconds] of chunks) { window.__ginrei.setInput(input); if (seconds > 1e-9) window.__ginrei.advance(seconds); }
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const s = window.__ginrei.state(), p = window.__ginrei.play();
        done({ mode: s.mode, kmh: +(s.speed * 3.6).toFixed(1), air: +s.air.time.toFixed(3), stage: p.stage,
          msg: document.querySelector('[data-message]')?.textContent ?? '', trick: p.trick ? { name: p.trick.name, score: p.trick.score, quality: p.trick.quality } : null });
      }));
    });
  });
  return { context, page };
}
// The page must never show the local address (the URL itself is never drawn by the game; this checks the visible text and fields).
async function checkLocal(page, take, k) {
  const seen = await page.evaluate(() => [document.body.innerText, ...[...document.querySelectorAll('input, textarea')].map((el) => el.value)].join('\n'));
  if (LOCAL.test(seen)) { stats.localAddressSeen.push({ take, k }); throw new Error(`手元の住所が画面の文字にある: ${take} ${k}`); }
}
// Inputs for each physics step n (game time n*STEP). Chunks for one frame from game time g0 to g1: a new chunk wherever the input
// changes, so every step runs with its own input whatever the frame length (step n runs when the clock reaches (n+1)*STEP).
const key = (i) => JSON.stringify(i);
function chunksFor(input, g0, g1) {
  const first = Math.floor(g0 / STEP + 1e-6), last = Math.floor(g1 / STEP + 1e-6) - 1;
  const out = []; let t = g0, cur = input(first * STEP);
  for (let n = first + 1; n <= last; n++) {
    const next = input(n * STEP);
    if (key(next) !== key(cur)) { out.push([cur, n * STEP - t]); t = n * STEP; cur = next; }
  }
  out.push([cur, g1 - t]);
  return out;
}
const shoot = (page, take, k) => page.screenshot({ path: fname(take, k), type: 'jpeg', quality: 92, timeout: 60000 });

// Game time of each frame of a take: real speed, or the jump's warp (see jumpWarp).
function framesOf(take) { return frameAt(TAKES[take].to) - frameAt(TAKES[take].from); }
async function runFrames(page, take, times, input, hooks = {}) {
  const dir = takeDir(take), rows = [];
  let g = 0;
  for (let k = 0; k < times.length; k++) {
    await hooks.before?.(k);
    // Frame 0: play from the teleport up to the take's start in 1/30 s frames, as a player would (the game's camera and its
    // frame blending settle exactly as in play; one long advance would leave the camera where a single huge frame puts it).
    let chunks;
    if (k === 0) {
      chunks = [];
      for (let a = 0; a < times[0] - 1e-9; a = Math.min(times[0], a + 1 / FPS)) chunks.push(...chunksFor(input, a, Math.min(times[0], a + 1 / FPS)));
      if (!chunks.length) chunks.push([input(0), 0]);
    } else chunks = chunksFor(input, g, times[k]);
    const r = await page.evaluate((c) => window.__promoRun(c), chunks);
    g = times[k];
    rows.push({ k, g: +g.toFixed(4), ...r });
    await shoot(page, take, k);
    await hooks.after?.(k, r);
    if (k === 0 || k === times.length - 1 || hooks.checkAt?.includes(k)) await checkLocal(page, take, k);
  }
  stats.frames[take] = times.length;
  writeFileSync(join(dir, 'events.json'), JSON.stringify(rows));
  return rows;
}
const realTimes = (take) => Array.from({ length: framesOf(take) }, (_, k) => TAKES[take].game + (k / FPS) * (TAKES[take].rate ?? 1));

// The physics of a run, step by step (no shots): the step on which the board leaves the snow and the step it lands.
async function physicsPass(page, take) {
  const t = TAKES[take], steps = Math.round(12 / STEP);
  const inputs = Array.from({ length: steps }, (_, n) => t.input(n * STEP));
  await page.evaluate((s) => window.__ginrei.teleport(s), t.spawn);
  const r = await page.evaluate((inputs) => {
    let takeoff = null, land = null, prev = window.__ginrei.state().mode, trick = null;
    for (let n = 0; n < inputs.length; n++) {
      window.__ginrei.setInput(inputs[n]); window.__ginrei.advance(1 / 120);
      const mode = window.__ginrei.state().mode;
      if (takeoff === null && mode === 'air' && prev !== 'air') takeoff = n;
      if (takeoff !== null && land === null && prev === 'air' && mode !== 'air') { land = n; trick = window.__ginrei.play().trick; }
      prev = mode;
      if (land !== null && n > land + 30) break;
    }
    return { takeoff, land, trick: trick && { name: trick.name, score: trick.score, quality: trick.quality }, mode: prev };
  }, inputs);
  if (r.takeoff === null || r.land === null) throw new Error(`${take}: 飛ばない・着地しない ${JSON.stringify(r)}`);
  return { takeoffGame: (r.takeoff + 1) * STEP, landGame: (r.land + 1) * STEP, ...r };
}
// The jump's time warp: real speed up to the take-off (on TAKES.jump.takeoffAt), slow motion inside the flight (a plateau with
// smooth ramps), real speed again into the landing (on TAKES.jump.landAt) and after it. g(v) = game seconds at video second v.
function jumpWarp(takeoffGame, landGame) {
  const t = TAKES.jump, vT = t.takeoffAt, vL = t.landAt, a0 = vT + t.slow.afterTakeoff, a1 = vL - t.slow.beforeLanding, r = t.slow.ramp;
  const smooth = (u) => { const x = Math.max(0, Math.min(1, u)); return x * x * (3 - 2 * x); };
  const w = (v) => (v <= a0 || v >= a1 ? 0 : smooth((v - a0) / r) * smooth((a1 - v) / r));
  const W = (v) => { let s = 0; const n = 2000, h = (v - vT) / n; for (let i = 0; i < n; i++) s += w(vT + (i + 0.5) * h) * h; return s; };
  const k = ((vL - vT) - (landGame - takeoffGame)) / W(vL);
  if (!(k >= 0 && k <= 0.8)) throw new Error(`スローの強さが範囲外: ${k}（飛んでいる時間 ${(landGame - takeoffGame).toFixed(3)} 秒）`);
  const g = (v) => (v <= vT ? takeoffGame - (vT - v) : v >= vL ? landGame + (v - vL) : takeoffGame + (v - vT) - k * W(v));
  return { g, slowest: +(1 - k).toFixed(3), plateau: [a0, a1] };
}

async function shootHook(browser) {
  const t = TAKES.hook, { context, page } = await openGame(browser, 'hook', t.gear);
  try {
    await page.locator('[data-start]').click();
    await page.waitForFunction(() => window.__ginrei.play().stage === 'ride');
    await page.evaluate((s) => window.__ginrei.teleport(s), t.spawn);
    const rows = await runFrames(page, 'hook', realTimes('hook'), t.input);
    const takeoff = rows.find((r) => r.mode === 'air');
    if (!takeoff || rows.at(-1).mode !== 'air') throw new Error('フックが飛んでいない、か、切る前に着地した');
    stats.takes.hook = { spawn: t.spawn, takeoffFrame: takeoff.k, kmhAtTakeoff: takeoff.kmh, lastFrameMode: rows.at(-1).mode };
  } finally { await context.close(); }
}
// Title: the static title screen (the game draws it on each advance), mouse down on 滑りはじめる, mouse up = the click = the start.
async function shootTitle(browser) {
  const t = TAKES.title, { context, page } = await openGame(browser, 'title', t.gear);
  const pressK = frameAt(t.pressAt) - frameAt(t.from), downK = pressK - t.downFrames;
  let button = null, started = null;
  try {
    const rows = await runFrames(page, 'title', Array.from({ length: framesOf('title') }, (_, k) => k / FPS), t.input, {
      checkAt: [downK, pressK],
      before: async (k) => {
        if (k === downK) {
          button = await page.evaluate(() => { const r = document.querySelector('[data-start]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height, text: document.querySelector('[data-start]').textContent }; });
          await page.mouse.move(button.x, button.y); await page.mouse.down();
        }
        if (k === pressK) {
          await page.mouse.up();
          // The click starts the ride (async in the game); wait for it in real time without advancing the game clock.
          const t0 = Date.now();
          while (Date.now() - t0 < 5000 && await page.evaluate(() => window.__ginrei.play().stage) !== 'ride') await sleep(20);
          started = await page.evaluate(() => window.__ginrei.play().stage);
          if (started !== 'ride') throw new Error('滑りはじめるを押しても始まらない');
        }
      },
    });
    const firstRide = rows.find((r) => r.stage === 'ride');
    stats.takes.title = { button, pressFrame: pressK, firstRideFrame: firstRide?.k ?? null, kmhAtEnd: rows.at(-1).kmh };
    if (firstRide?.k !== pressK) throw new Error(`押したコマで滑り出していない: ${firstRide?.k}`);
    writeFileSync(join(framesDir, 'title', 'press.json'), JSON.stringify({ button, downK, pressK }));
  } finally { await context.close(); }
}
async function shootCarve(browser) {
  const t = TAKES.carve, { context, page } = await openGame(browser, 'carve', t.gear);
  try {
    await page.locator('[data-start]').click();
    await page.waitForFunction(() => window.__ginrei.play().stage === 'ride');
    await page.evaluate((s) => window.__ginrei.teleport(s), t.spawn);
    const rows = await runFrames(page, 'carve', realTimes('carve'), t.input);
    // The brake starts on its frame (the board turns across: the game's 'skid'), and the speed really falls before the cut.
    const brakeK = frameAt(t.brakeAt) - frameAt(t.from), skidK = rows.find((r) => r.k >= brakeK && r.mode === 'skid')?.k ?? null;
    stats.takes.carve = { spawn: t.spawn, kmhMax: Math.max(...rows.map((r) => r.kmh)), kmhAtBrake: rows[brakeK].kmh, kmhAtEnd: rows.at(-1).kmh,
      skidFromVideoSeconds: skidK === null ? null : +((frameAt(t.from) + skidK) / FPS).toFixed(3), crashes: rows.filter((r) => r.mode === 'crash').length,
      messages: [...new Set(rows.map((r) => r.msg).filter(Boolean))] };
    if (skidK === null || skidK - brakeK > 3 || rows.at(-1).kmh > 0.5 * rows[brakeK].kmh) throw new Error(`ブレーキが絵コンテどおりに効いていない: ${JSON.stringify(stats.takes.carve)}`);
    if (stats.takes.carve.crashes) throw new Error('転んでいる');
  } finally { await context.close(); }
}
async function shootJump(browser) {
  const t = TAKES.jump, { context, page } = await openGame(browser, 'jump', t.gear);
  try {
    await page.locator('[data-start]').click();
    await page.waitForFunction(() => window.__ginrei.play().stage === 'ride');
    const physics = await physicsPass(page, 'jump');
    if (physics.trick?.name !== t.expect.trick || physics.trick?.quality !== t.expect.quality) throw new Error(`技が絵コンテと違う: ${JSON.stringify(physics)}`);
    const warp = jumpWarp(physics.takeoffGame, physics.landGame);
    const from = t.from, times = Array.from({ length: framesOf('jump') }, (_, k) => warp.g(from + k / FPS));
    await page.evaluate((s) => window.__ginrei.teleport(s), t.spawn);
    const rows = await runFrames(page, 'jump', times, t.input);
    const air = rows.filter((r) => r.mode === 'air'), landK = rows.findIndex((r, i) => i > 0 && rows[i - 1].mode === 'air' && r.mode !== 'air');
    const landed = rows[landK];
    const expectLandK = frameAt(t.landAt) - frameAt(from), expectTakeoffK = frameAt(t.takeoffAt) - frameAt(from);
    stats.takes.jump = { spawn: t.spawn, physics, slowest: warp.slowest, plateauVideoSeconds: warp.plateau.map((v) => +v.toFixed(3)),
      firstAirFrame: air[0]?.k, landFrame: landK, expectTakeoffFrame: expectTakeoffK, expectLandFrame: expectLandK,
      landVideoSeconds: +((frameAt(from) + landK) / FPS).toFixed(3), trick: landed?.trick, message: landed?.msg,
      messageUntilVideoSeconds: +((frameAt(from) + Math.max(...rows.filter((r) => r.msg).map((r) => r.k))) / FPS).toFixed(3) };
    if (landed?.trick?.name !== t.expect.trick || landed?.trick?.quality !== t.expect.quality) throw new Error(`撮った回の技が違う: ${JSON.stringify(stats.takes.jump)}`);
    if (Math.abs(landK - expectLandK) > 1 || Math.abs(air[0].k - expectTakeoffK) > 1) throw new Error(`踏み切り・着地のコマが絵コンテとずれた: ${JSON.stringify(stats.takes.jump)}`);
  } finally { await context.close(); }
}
async function shootSki(browser) {
  const t = TAKES.ski, { context, page } = await openGame(browser, 'ski', t.gear);
  try {
    await page.locator('[data-start]').click();
    await page.waitForFunction(() => window.__ginrei.play().stage === 'ride');
    const gear = await page.evaluate(() => window.__ginrei.state().gear);
    if (gear !== 'ski') throw new Error(`スキーになっていない: ${gear}`);
    await page.evaluate((s) => window.__ginrei.teleport(s), t.spawn);
    const rows = await runFrames(page, 'ski', realTimes('ski'), t.input);
    stats.takes.ski = { spawn: t.spawn, gear, kmh: [rows[0].kmh, rows.at(-1).kmh], crashes: rows.filter((r) => r.mode === 'crash').length };
    if (stats.takes.ski.crashes) throw new Error('スキーで転んでいる');
  } finally { await context.close(); }
}
// A press on a UI element: mouse down `downFrames` before, mouse up (= the click) on the press frame. Returns the element box.
async function press(page, selector, phase) {
  const box = await page.evaluate((s) => { const el = document.querySelector(s); const r = el?.getBoundingClientRect(); return r && r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height, text: el.textContent.trim() } : null; }, selector);
  if (!box) throw new Error(`押す部品が見えない: ${selector}`);
  if (phase === 'down') { await page.mouse.move(box.x, box.y); await page.mouse.down(); } else await page.mouse.up();
  return box;
}
async function shootMap(browser) {
  const t = TAKES.map, { context, page } = await openGame(browser, 'map', t.gear);
  const pressK = frameAt(t.pressAt) - frameAt(t.from), downK = pressK - t.downFrames, selector = `.map-pin[data-drop="${t.pick}"]`;
  let box = null;
  try {
    await page.locator('[data-start]').click();
    await page.waitForFunction(() => window.__ginrei.play().stage === 'ride');
    await page.evaluate(() => window.__promoRun([[{}, 1]]));   // one second down the forest trail (the map shows where you are)
    await page.keyboard.press('m');
    await page.evaluate(() => window.__promoRun([[{}, 1 / 30]]));
    if (await page.evaluate(() => window.__ginrei.play().stage) !== 'map') throw new Error('地図が開かない');
    const rows = await runFrames(page, 'map', Array.from({ length: framesOf('map') }, (_, k) => 2 + k / FPS), t.input, {
      checkAt: [pressK],
      before: async (k) => {
        if (k === downK) box = await press(page, selector, 'down');
        if (k === pressK) { await press(page, selector, 'up'); await page.waitForFunction((s) => document.querySelector(s)?.getAttribute('aria-pressed') === 'true', selector, { timeout: 5000 }); }
      },
    });
    const picked = await page.evaluate(() => document.querySelector('.map-details h3')?.textContent ?? '');
    stats.takes.map = { pick: t.pick, box, pressFrame: pressK, details: picked, stage: rows.at(-1).stage };
    if (!/山頂/.test(picked)) throw new Error(`地図で山頂を選べていない: ${picked}`);
    writeFileSync(join(framesDir, 'map', 'press.json'), JSON.stringify({ box, downK, pressK }));
  } finally { await context.close(); }
}
async function shootVista(browser) {
  const t = TAKES.vista, { context, page } = await openGame(browser, 'vista', t.gear);
  const pressK = frameAt(t.pressAt) - frameAt(t.from), downK = pressK - t.downFrames, selector = '[data-action="vista-next"]';
  let box = null; const names = [];
  try {
    await page.locator('[data-start]').click();
    await page.waitForFunction(() => window.__ginrei.play().stage === 'ride');
    await page.evaluate((i) => window.__ginrei.vista(i), t.view);
    // Let the view settle (the frame-blending of the renderer needs a few frames after a camera cut).
    await page.evaluate(() => window.__promoRun(Array.from({ length: 30 }, () => [{}, 1 / 30])));
    const name = () => page.evaluate(() => document.querySelector('[data-vista-name]')?.textContent ?? '');
    names.push(await name());
    const rows = await runFrames(page, 'vista', Array.from({ length: framesOf('vista') }, (_, k) => 2 + k / FPS), t.input, {
      checkAt: [pressK],
      before: async (k) => {
        if (k === downK) box = await press(page, selector, 'down');
        if (k === pressK) { await press(page, selector, 'up'); const t0 = Date.now(); while (Date.now() - t0 < 5000 && (await name()) === names[0]) await sleep(20); names.push(await name()); }
      },
    });
    stats.takes.vista = { views: names, box, pressFrame: pressK, stage: rows.at(-1).stage };
    if (names.length < 2 || names[0] === names[1]) throw new Error(`景色が切り替わらない: ${names}`);
    writeFileSync(join(framesDir, 'vista', 'press.json'), JSON.stringify({ box, downK, pressK, names }));
  } finally { await context.close(); }
}

// ---- Overlay (captions, press rings, flashes) and the two cards (S1, end) ---------------------------------------------------
// Captions sit in the band under the platform's top UI (top 8 % = CSS 77 px), CSS 92..212 (video 184..424), unless a scene moves it.
const CAPTION_TOP = 92;
function captionPlan() {
  const segments = [];
  for (const sc of STORYBOARD) {
    if (!sc.lines.length) continue;
    const key = sc.lines.join('\n');
    if (segments.length && segments.at(-1).key === key) { segments.at(-1).to = frameAt(sc.end); continue; }
    segments.push({ id: sc.id, from: frameAt(sc.start), to: frameAt(sc.end), lines: sc.lines, key, top: sc.captionTop ?? CAPTION_TOP, plate: !!sc.plate });
  }
  return segments;
}
// Rings: drawn from the mouse-down frame on the real element box; a press that changes the screen (the title) loses its ring on the
// frame of the click, the others fade over 0.27 s after the click.
function ringPlan() {
  const rings = Array.from({ length: TOTAL }, () => []);
  for (const p of PRESSES) {
    const file = join(framesDir, p.take, 'press.json');
    if (!existsSync(file)) throw new Error(`押した位置の記録がありません: ${file}（先に ${p.take} を撮る）`);
    const rec = JSON.parse(readFileSync(file, 'utf8')), b = rec.box ?? rec.button;
    const base = frameAt(TAKES[p.take].from), down = base + rec.downK, up = base + rec.pressK;
    const changes = p.take === 'title', fade = Math.round(0.27 * FPS);
    for (let f = down; f < (changes ? up : up + fade); f++) {
      const held = Math.min(1, (f - down + 1) / (up - down)), after = f >= up ? (f - up) / fade : 0;
      rings[f].push({ x: b.x, y: b.y, o: +((1 - after) ** 2).toFixed(3), s: +(0.55 + 0.35 * held + 0.5 * after).toFixed(3) });
    }
  }
  return rings;
}
function overlayHtml() {
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><style>
  @font-face { font-family: Promo; src: url(/font.ttf); font-weight: 700; }
  @font-face { font-family: PromoBlack; src: url(/font-black.ttf); font-weight: 900; }
  :root { --ink: #0b1a2a; --accent: #ff9a3d; --snow: #f4f8fb; }
  html, body { margin: 0; width: 540px; height: 960px; overflow: hidden; background: transparent; font-family: Promo, sans-serif; color: #fff; }
  .cap { position: absolute; left: 10px; right: 10px; top: 92px; height: 120px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
  .cap span { display: block; font-family: PromoBlack, Promo, sans-serif; font-weight: 900; font-size: 35px; line-height: 1.3; letter-spacing: .02em; white-space: nowrap;
    color: #fff; -webkit-text-stroke: 9px var(--ink); paint-order: stroke fill; text-shadow: 0 3px 14px rgba(5, 15, 25, .45); }
  .cap span:nth-child(2) { color: var(--accent); }
  .cap span:only-child { font-size: 40px; color: #fff; }
  .cap.plate span { background: rgba(11, 26, 42, .9); border-radius: 12px; padding: 0 14px; margin: 3px 0; -webkit-text-stroke: 0; text-shadow: none; font-size: 32px; }
  .flash { position: absolute; inset: 0; background: #fff; opacity: 0; }
  .ring { position: absolute; width: 56px; height: 56px; margin: -28px; border-radius: 50%; border: 3px solid #fff; background: rgba(255, 154, 61, .35);
    box-shadow: 0 0 0 2.5px rgba(11, 26, 42, .55), 0 0 16px rgba(11, 26, 42, .35); box-sizing: border-box; }
  /* cards (opaque, shot as the base frame) */
  .card { position: absolute; inset: 0; display: none; overflow: hidden; background: #0b1a2a; }
  .card .bg { position: absolute; inset: -60px; width: calc(100% + 120px); height: calc(100% + 120px); object-fit: cover; }
  .doubts .bg { filter: blur(10px) brightness(.8) saturate(.8); }
  .doubts .shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(11, 26, 42, .6), rgba(11, 26, 42, .2) 42%, rgba(11, 26, 42, .55)); }
  .doubt { position: absolute; transform-origin: 50% 50%; white-space: nowrap; font-family: Promo, sans-serif; font-weight: 700; font-size: 25px; letter-spacing: .03em;
    color: var(--ink); background: var(--snow); border-radius: 999px; padding: 12px 24px; box-shadow: 0 8px 22px rgba(0, 0, 0, .35); opacity: 0; }
  /* the last view of the game (the lake shore and the village), lightly blurred; the facts sit on a panel like the game's own */
  .end .bg { filter: blur(3px) brightness(.97) saturate(1.05); }
  .end .shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(11, 26, 42, .45), rgba(11, 26, 42, .08) 28%, rgba(11, 26, 42, .08) 72%, rgba(11, 26, 42, .5)); }
  .end-body { position: absolute; left: 26px; right: 26px; top: 190px; text-align: center; padding: 26px 16px 22px; border-radius: 22px;
    background: rgba(8, 17, 26, .82); border: 1px solid rgba(255, 255, 255, .3); box-shadow: 0 18px 40px rgba(0, 0, 0, .3); }
  .end-body > * { opacity: 0; }
  .pill { display: inline-block; font-size: 14px; letter-spacing: .22em; color: #fff; border: 1.5px solid rgba(255, 255, 255, .55); padding: 7px 16px; border-radius: 30px; }
  .end h1 { font-family: PromoBlack, Promo, sans-serif; font-weight: 900; font-size: 54px; letter-spacing: .12em; margin: 18px -.12em 4px 0; color: #fff; }
  .end .sub { font-size: 25px; margin: 0 0 30px; color: #fff; font-weight: 700; }
  .badges { display: flex; justify-content: center; gap: 9px; flex-wrap: wrap; max-width: 360px; margin: 0 auto; }
  .badges b { font-size: 18px; font-weight: 700; padding: 9px 15px; border-radius: 30px; border: 1.5px solid rgba(255, 255, 255, .5); background: rgba(11, 26, 42, .55); color: #fff; }
  .badges b:first-child { background: var(--accent); color: #16120d; border-color: var(--accent); }
  .url { margin: 30px auto 0; display: inline-block; font-size: 20px; letter-spacing: .01em; color: #16120d; background: #fff; padding: 13px 18px; border-radius: 14px; white-space: nowrap; }
  .note { margin-top: 18px; font-size: 14px; color: rgba(255, 255, 255, .78); }
  </style>
  <div class="card doubts"><img class="bg" src="/s1.jpg" alt=""><div class="shade"></div><div class="pile"></div></div>
  <div class="card end"><img class="bg" src="/end.jpg" alt=""><div class="shade"></div>
    <div class="end-body"><div><span class="pill end-day"></span></div><h1 class="end-title"></h1><p class="sub end-sub"></p><div class="badges end-badges"></div>
      <div><span class="url end-url"></span></div><p class="note end-note"></p></div></div>
  <div class="cap cur"></div>
  <div class="rings"></div>
  <div class="flash"></div>
  <script>
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), easeOut = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;
  let D, current = -1;
  window.__setup = (data) => {
    D = data;
    $('.end-day').textContent = data.end.day; $('.end-title').textContent = data.end.title; $('.end-sub').textContent = data.end.sub;
    $('.end-badges').replaceChildren(...data.end.badges.map((text) => Object.assign(document.createElement('b'), { textContent: text })));
    $('.end-url').textContent = data.end.url; $('.end-note').textContent = data.end.note;
    // S1: the doubts pile up left / right inside the safe area (under the caption, above 80 % of the height), a little tilted.
    const spots = [[150, 300, -5], [385, 362, 4], [160, 440, 3], [380, 520, -4], [175, 600, -2.5], [370, 680, 5]];
    $('.pile').replaceChildren(...data.doubts.map((text, i) => { const sp = spots[i % spots.length]; const el = document.createElement('div'); el.className = 'doubt'; el.textContent = text; el.dataset.x = sp[0]; el.dataset.y = sp[1]; el.dataset.r = sp[2]; return el; }));
  };
  // Overflow check: no caption, pill or end-card line may be wider than the frame (white-space: nowrap would cut it silently).
  // Boxes (pills, badges, the address plate) are measured as boxes; lines of text by the extent of their glyphs (a Range).
  window.__overflow = () => {
    const bad = [], textBox = (el) => { const range = document.createRange(); range.selectNodeContents(el); return range.getBoundingClientRect(); };
    const check = (el, r) => { if (r.width && (r.left < 8 || r.right > 532)) bad.push({ text: el.textContent, left: Math.round(r.left), right: Math.round(r.right) }); };
    for (const el of document.querySelectorAll('.doubt, .badges b, .url, .pill')) check(el, el.getBoundingClientRect());
    for (const el of document.querySelectorAll('.cap span, .end h1, .end .sub, .note')) check(el, textBox(el));
    return bad;
  };
  const spans = (lines) => lines.map((text) => Object.assign(document.createElement('span'), { textContent: text }));
  window.__caption = (lines) => { $('.cap.cur').replaceChildren(...spans(lines)); for (const el of document.querySelectorAll('.cap span')) el.style.opacity = 1; };
  // The card of frame f (opaque): S1 = the doubts, end = the end card. Returns false if f has no card.
  window.__card = (f, kind) => {
    for (const k of ['doubts', 'end']) $('.card.' + k).style.display = k === kind ? 'block' : 'none';
    for (const s of ['.cap.cur', '.rings', '.flash']) $(s).style.visibility = 'hidden';
    const sc = D.storyboard.find((s) => s.card === kind), t = (f - Math.round(sc.start * D.fps)) / D.fps, len = sc.end - sc.start;
    if (kind === 'doubts') {
      $('.doubts .bg').style.transform = 'scale(' + (1.02 + 0.05 * t / len) + ')';
      const every = Math.min(D.beat / 2, (len - 0.7) / Math.max(1, D.doubts.length - 1)), wob = clamp((t - 1.3) / 0.5, 0, 1);
      [...document.querySelectorAll('.doubt')].forEach((el, i) => {
        const u = t - 0.12 - i * every, p = clamp(u / 0.24, 0, 1);
        const back = (x) => { const c = 2.2; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };
        const scale = u < 0 ? 0.6 : 0.6 + 0.4 * back(p), bob = u > 0 ? 3 * Math.sin(2 * Math.PI * (u * 0.8 + i * 0.25)) : 0;
        const rot = Number(el.dataset.r) + wob * 2.5 * Math.sin(2 * Math.PI * (t * 2.4 + i * 0.37));
        el.style.opacity = u < 0 ? 0 : clamp(u / 0.08, 0, 1);
        el.style.left = el.dataset.x + 'px'; el.style.top = el.dataset.y + 'px';
        el.style.transform = 'translate(-50%, -50%) translateY(' + bob + 'px) rotate(' + rot + 'deg) scale(' + scale + ')';
      });
    } else {
      $('.end .bg').style.transform = 'scale(' + (1.04 + 0.02 * t) + ')';
      [...$('.end-body').children].forEach((el, i) => { const u = easeOut((t - i * 0.06) / 0.28); el.style.opacity = 0.6 + 0.4 * u; el.style.transform = 'translateY(' + ((1 - u) * 14) + 'px)'; });
    }
    return true;
  };
  window.__noCard = () => { for (const k of ['doubts', 'end']) $('.card.' + k).style.display = 'none'; for (const s of ['.cap.cur', '.rings', '.flash']) $(s).style.visibility = 'visible'; };
  // The transparent overlay of frame f: caption (the new one is already 75 % visible on the frame it changes: no empty frame between
  // captions), rings, flash. Returns the caption's largest opacity (null = no caption on this frame).
  window.__frame = (f, rings) => {
    const segs = D.captions, i = segs.findIndex((s) => f >= s.from && f < s.to);
    // No faint copy of the old caption on the change frame: with captions of different length or place it read as a glitch.
    if (i !== current) {
      $('.cap.cur').replaceChildren(...(i >= 0 ? spans(segs[i].lines) : []));
      if (i >= 0) { $('.cap.cur').style.top = segs[i].top + 'px'; $('.cap.cur').classList.toggle('plate', segs[i].plate); }
      current = i;
    }
    if (i >= 0) {
      const age = (f - segs[i].from) / D.fps + (segs[i].from === 0 ? 1 : 0);
      [...$('.cap.cur').querySelectorAll('span')].forEach((el) => { const u = easeOut(age / 0.12); el.style.opacity = 0.75 + 0.25 * u; el.style.transform = 'translateY(' + ((1 - u) * 5) + 'px)'; });
    }
    let flash = 0;
    for (const [at, strength] of D.flashes) { const dt = (f - Math.round(at * D.fps)) / D.fps; if (dt >= 0) flash = Math.max(flash, strength * Math.exp(-dt / 0.11)); }
    $('.flash').style.opacity = flash < 0.004 ? 0 : flash;
    $('.rings').replaceChildren(...rings.map((m) => { const el = document.createElement('div'); el.className = 'ring'; Object.assign(el.style, { left: m.x + 'px', top: m.y + 'px', opacity: m.o, transform: 'scale(' + m.s + ')' }); return el; }));
    return i >= 0 ? Math.max(0, ...[...$('.cap.cur').querySelectorAll('span')].map((el) => Number(el.style.opacity))) : null;
  };
  </script></html>`;
}
async function shootOverlay(browser) {
  const dir = takeDir('overlay'), cards = takeDir('cards');
  const captions = captionPlan(), rings = ringPlan();
  const s1Image = fname('hook', TAKES.hook.s1Frame), endImage = fname('vista', framesOf('vista') - 1);
  for (const f of [s1Image, endImage]) if (!existsSync(f)) throw new Error(`背景のコマがありません: ${f}`);
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: DPR });
  const page = await context.newPage();
  await page.route('**/*', (route) => {
    const path = new URL(route.request().url()).pathname;
    const files = { '/font.ttf': [font, 'font/ttf'], '/font-black.ttf': [fontBlack, 'font/ttf'], '/s1.jpg': [s1Image, 'image/jpeg'], '/end.jpg': [endImage, 'image/jpeg'] };
    if (path === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: overlayHtml() });
    if (files[path]) return route.fulfill({ contentType: files[path][1], body: readFileSync(files[path][0]) });
    stats.blocked.push(route.request().url()); return route.abort();
  });
  try {
    await page.goto('http://promo.local/');
    await page.evaluate(async () => { await document.fonts.load('700 30px Promo'); await document.fonts.load('900 30px PromoBlack'); await document.fonts.ready;
      await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((done) => { img.onload = done; img.onerror = done; })))); });
    const fontsOk = await page.evaluate(() => document.fonts.check('900 30px PromoBlack') && document.fonts.check('700 30px Promo'));
    if (!fontsOk) throw new Error('字幕の書体が読めない');
    await page.evaluate((data) => window.__setup(data), { storyboard: STORYBOARD, captions, end: END_CARD, flashes: FLASHES, fps: FPS, doubts: DOUBTS, beat: BEAT });
    // Every caption, the doubts and the end card must fit the frame.
    const overflow = [];
    for (const c of captions) { await page.evaluate((lines) => window.__caption(lines), c.lines); overflow.push(...await page.evaluate(() => window.__overflow())); }
    for (const kind of ['doubts', 'end']) {
      const sc = STORYBOARD.find((s) => s.card === kind);
      await page.evaluate(([f, k]) => window.__card(f, k), [frameAt(sc.end) - 1, kind]);
      overflow.push(...await page.evaluate(() => window.__overflow()));
    }
    if (overflow.length) throw new Error(`字幕・札がはみ出す: ${JSON.stringify(overflow)}`);
    // Cards: opaque JPEG base frames for S1 and the end card.
    for (const sc of STORYBOARD.filter((s) => s.card)) {
      for (let f = frameAt(sc.start); f < frameAt(sc.end); f++) {
        await page.evaluate(([f, k]) => window.__card(f, k), [f, sc.card]);
        await page.screenshot({ path: join(cards, `c${String(f).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92 });
      }
    }
    await page.evaluate(() => window.__noCard());
    const gaps = [];
    for (let f = 0; f < TOTAL; f++) {
      const shown = await page.evaluate(([f, r]) => window.__frame(f, r), [f, rings[f]]);
      const sc = STORYBOARD.find((s) => f >= frameAt(s.start) && f < frameAt(s.end));
      if (sc.lines.length && (shown === null || shown < 0.5)) gaps.push(f);
      await page.screenshot({ path: join(dir, `o${String(f).padStart(5, '0')}.png`), omitBackground: true });
    }
    stats.captionGapFrames = gaps;
    stats.captions = captions.map((c) => ({ id: c.id, fromSeconds: +(c.from / FPS).toFixed(3), toSeconds: +(c.to / FPS).toFixed(3), text: c.lines.join(' ') }));
    stats.rings = PRESSES.map((p) => ({ take: p.take, pressSeconds: p.at, frames: rings.flatMap((r, f) => (r.length && f >= frameAt(TAKES[p.take].from) && f < frameAt(TAKES[p.take].to) ? [f] : [])).length }));
    stats.frames.overlay = TOTAL;
  } finally { await context.close(); }
}

// ---- Compose -----------------------------------------------------------------------------------------------------------------
const which = (name, env) => process.env[env] || execFileSync('/bin/sh', ['-c', `command -v ${name}`], { encoding: 'utf8' }).trim();
const ffmpeg = which('ffmpeg', 'FFMPEG'), ffprobe = which('ffprobe', 'FFPROBE');
const silentName = OUT_NAME('silent');
// What fills video frame f: a take frame or a card frame.
function baseFrame(f) {
  const sc = STORYBOARD.find((s) => f >= frameAt(s.start) && f < frameAt(s.end));
  if (sc.card) return join(framesDir, 'cards', `c${String(f).padStart(5, '0')}.jpg`);
  return fname(sc.take, f - frameAt(TAKES[sc.take].from));
}
function compose() {
  const base = join(framesDir, 'base'); rmSync(base, { recursive: true, force: true }); mkdirSync(base, { recursive: true });
  for (let f = 0; f < TOTAL; f++) { const src = baseFrame(f); if (!existsSync(src)) throw new Error(`コマがありません: ${src}`); symlinkSync(src, join(base, `b${String(f).padStart(5, '0')}.jpg`)); }
  // Every overlay frame to rgba (a pixel-format change inside a sequence makes ffmpeg rebuild the graph and drop the overlay: Day083).
  const rgba = join(framesDir, 'overlay-rgba'); rmSync(rgba, { recursive: true, force: true }); mkdirSync(rgba, { recursive: true });
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', join(framesDir, 'overlay', 'o%05d.png'), '-vf', 'format=rgba', '-start_number', '0', join(rgba, 'o%05d.png')]);
  mkdirSync(outDir, { recursive: true });
  const silent = join(outDir, silentName);
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y',
    '-framerate', String(FPS), '-i', join(base, 'b%05d.jpg'),
    '-framerate', String(FPS), '-i', join(rgba, 'o%05d.png'),
    // The screenshots are full-range JPEG (sRGB); the video is limited range BT.709 (what players assume for HD), tagged as such.
    '-filter_complex', '[0:v]scale=1080:1920:flags=lanczos,format=rgba,setsar=1[b];[b][1:v]overlay=0:0:format=auto,scale=out_color_matrix=bt709:out_range=tv:flags=lanczos,format=yuv420p[v]',
    '-map', '[v]', '-frames:v', String(TOTAL), '-r', String(FPS),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-movflags', '+faststart', '-map_metadata', '-1', silent], { stdio: 'inherit' });
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', silent, '-frames:v', '1', '-map_metadata', '-1', join(outDir, 'first-frame.png')]);
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', silent, '-vf', 'fps=1,scale=270:480,tile=6x5:padding=6:color=0x0b1a2a', '-frames:v', '1', '-q:v', '3', '-map_metadata', '-1', join(outDir, 'contact-sheet.jpg')]);
  // The first frame must already move: mean absolute difference of frames 0 and 1 / 0 and 3 (0..255, grey, 270x480).
  const gray = (n) => execFileSync(ffmpeg, ['-v', 'error', '-i', silent, '-vf', `select=eq(n\\,${n}),scale=270:480,format=gray`, '-frames:v', '1', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 24 });
  const motion = (x, y) => { const [a, b] = [gray(x), gray(y)]; let diff = 0, changed = 0; for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); diff += d; if (d > 8) changed++; } return { meanAbsDiff: +(diff / a.length).toFixed(3), changedPixelsPercent: +(100 * changed / a.length).toFixed(2) }; };
  stats.firstFrameMotion = { frames0to1: motion(0, 1), frames0to3: motion(0, 3) };
  if (stats.firstFrameMotion.frames0to1.meanAbsDiff === 0) throw new Error('1コマ目と2コマ目が同じ（動いていない）');
  // Every cut, 2 frames before and 2 after, one row each.
  const cuts = [...new Set(STORYBOARD.slice(1).map((s) => frameAt(s.start)))];
  const picks = cuts.flatMap((c) => [c - 2, c - 1, c, c + 1]);
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', silent, '-vf', `select='${picks.map((n) => `eq(n\\,${n})`).join('+')}',scale=216:384,tile=4x${cuts.length}:padding=4:color=0x0b1a2a`,
    '-vsync', '0', '-frames:v', '1', '-q:v', '3', '-map_metadata', '-1', join(outDir, 'cut-check.jpg')]);
  stats.cutCheck = cuts.map((c) => ({ frame: c, seconds: +(c / FPS).toFixed(3) }));
}
function mux(variant) {
  const src = ['wav', 'mp3'].map((ext) => join(outDir, `bgm_${variant}.${ext}`)).find(existsSync);
  if (!src) throw new Error(`BGMがありません: ${join(outDir, `bgm_${variant}.(wav|mp3)`)}`);
  const out = join(outDir, OUT_NAME(variant));
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', join(outDir, silentName), '-i', src,
    '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    '-af', `apad=whole_dur=${DURATION_SECONDS}`, '-t', String(DURATION_SECONDS), '-movflags', '+faststart', '-map_metadata', '-1', out]);
  return out;
}
function probe(file) {
  const p = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }));
  const v = p.streams.find((s) => s.codec_type === 'video'), a = p.streams.find((s) => s.codec_type === 'audio');
  const decode = execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-f', 'null', '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const seconds = Number(p.format.duration), silent = file.endsWith(silentName);
  const ok = v.width === 1080 && v.height === 1920 && v.codec_name === 'h264' && v.pix_fmt === 'yuv420p' && v.r_frame_rate === '30/1'
    && Math.abs(seconds - DURATION_SECONDS) <= 1 / FPS + 0.001 && decode.trim() === '' && (silent ? !a : a?.codec_name === 'aac' && a.sample_rate === '48000' && a.channels === 2);
  const row = { file: basename(file), ok, size: `${v.width}x${v.height}`, codec: v.codec_name, pix: v.pix_fmt, fps: v.r_frame_rate, frames: Number(v.nb_frames),
    seconds: +seconds.toFixed(3), bytes: statSync(file).size, audio: a ? `${a.codec_name} ${a.sample_rate}Hz ${a.channels}ch` : 'なし', decodeErrors: decode.trim() ? decode.trim().split('\n').length : 0 };
  log(ok ? '検査OK' : '検査NG', JSON.stringify(row));
  if (!ok) throw new Error(`出力が仕様と違います: ${file}`);
  return row;
}

// ---- Run (one browser at a time) -------------------------------------------------------------------------------------------
mkdirSync(framesDir, { recursive: true });
const started = Date.now(), timings = {};
const SHOOT = { hook: shootHook, title: shootTitle, carve: shootCarve, jump: shootJump, ski: shootSki, map: shootMap, vista: shootVista };
const toShoot = Object.keys(SHOOT).filter(wanted);
let browser = null;
try {
  if (toShoot.length || (wanted('overlay') && !flag('--no-compose'))) {
    const { chromium } = await loadPlaywright();
    browser = await chromium.launch({ headless: true, args: GPU_ARGS });
  }
  for (const take of toShoot) {
    const t0 = Date.now(); log('撮影', take);
    await SHOOT[take](browser);
    timings[take] = +((Date.now() - t0) / 60000).toFixed(2);
  }
  if (wanted('overlay') && !flag('--no-compose')) { const t0 = Date.now(); log('重ね'); await shootOverlay(browser); timings.overlay = +((Date.now() - t0) / 60000).toFixed(2); }
} finally { await browser?.close().catch(() => {}); }
const outputs = [];
if (!flag('--no-compose')) {
  log('合成'); compose();
  outputs.push(probe(join(outDir, silentName)));
  for (const variant of (arg('--mux', '') || '').split(',').filter(Boolean)) outputs.push(probe(mux(variant)));
}
const reportFile = join(framesDir, 'capture-report.json');
const previous = existsSync(reportFile) ? JSON.parse(readFileSync(reportFile, 'utf8')) : {};
const size = (dir) => readdirSync(dir, { withFileTypes: true }).reduce((sum, e) => sum + (e.isDirectory() ? size(join(dir, e.name)) : e.isFile() ? statSync(join(dir, e.name)).size : 0), 0);
const report = { seconds: DURATION_SECONDS, fps: FPS, width: 1080, height: 1920, bpm: 60 / BEAT, bar: BAR, capture: `CSS ${VIEW.width}x${VIEW.height}, DPR ${DPR}, WebGPU (headless Chromium)`,
  gameUrl: gameUrl.origin, publicUrl: PUBLIC_URL, renderer: stats.backend ?? previous.renderer,
  // requests: everything the pages asked for; local: answered by the local game server; blocked: aborted before being sent.
  network: toShoot.length ? { requests: stats.requests, local: stats.local, blocked: stats.blocked.length, blockedUrls: stats.blocked.slice(0, 20) } : previous.network,
  localAddressSeen: toShoot.length ? stats.localAddressSeen : previous.localAddressSeen,
  takes: { ...previous.takes, ...stats.takes }, framesShot: { ...previous.framesShot, ...stats.frames },
  captions: stats.captions ?? previous.captions, captionGapFrames: stats.captionGapFrames ?? previous.captionGapFrames, rings: stats.rings ?? previous.rings,
  musicCues: MUSIC_CUES, firstFrameMotion: stats.firstFrameMotion ?? previous.firstFrameMotion, cutCheck: stats.cutCheck ?? previous.cutCheck,
  consoleWarnings: toShoot.length ? stats.warnings : previous.consoleWarnings ?? [], minutes: +((Date.now() - started) / 60000).toFixed(1),
  minutesByTake: { ...previous.minutesByTake, ...timings }, outputs, framesBytes: size(framesDir) };
writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
if (!flag('--no-compose')) writeFileSync(join(outDir, 'capture-report.json'), JSON.stringify(report, null, 2) + '\n');
if (flag('--clean') && !flag('--no-compose')) {
  for (const dir of [...Object.keys(SHOOT), 'overlay', 'overlay-rgba', 'cards', 'base']) rmSync(join(framesDir, dir), { recursive: true, force: true });
  log('コマを消した', framesDir);
}
log('完了', JSON.stringify({ minutes: report.minutes, network: report.network, warnings: report.consoleWarnings.length, firstFrameMotion: report.firstFrameMotion }));
