// Day095 bonsai promo (1080x1920, 30 fps, 29.333 s), captured from the published build.
// See README.md for the capture, range, compose and mux commands.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NODE_FLAG } from '../../lib/contract.js';
import { BEAT, DURATION_SECONDS, END_CARD, FPS, PHOTO, SNIP_CUES, STORY, STORYBOARD, TAP_CUES, TRIO_SHOTS, WIRE_CUES, bar, frameAt } from './timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const TOTAL = frameAt(DURATION_SECONDS);
const VIEW = { width: 540, height: 960 }, DPR = 2;
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  if (i < 0) return fallback;
  const value = process.argv[i + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} に値を指定してください`);
  return value;
};
const flag = (name) => process.argv.includes(name);
const need = (value, what) => { if (!value) throw new Error(`${what} を指定してください（引数か環境変数）`); return resolve(value); };
const framesRoot = need(arg('--frames-dir', process.env.PROMO_FRAMES_DIR), '--frames-dir');
const outDir = need(arg('--out-dir', process.env.PROMO_OUT_DIR), '--out-dir');
const font = process.env.PROMO_FONT || join(homedir(), 'Library/Fonts/ZenKakuGothicNew-Bold.ttf');
const fontBlack = process.env.PROMO_FONT_BLACK || join(homedir(), 'Library/Fonts/ZenKakuGothicNew-Black.ttf');
const port = Number(arg('--port', 4292));
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('--port は 1〜65535');
const base = `http://127.0.0.1:${port}`;
const appPath = '/day-095-bonsai/';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const TAKES = {
  story: { from: 0, to: frameAt(STORY.end) },
  trio: { from: frameAt(TRIO_SHOTS[0].at), to: frameAt(PHOTO.at) },
  photo: { from: frameAt(PHOTO.at), to: frameAt(PHOTO.end) },
  overlay: { from: 0, to: TOTAL },
};
const appTakes = ['story', 'trio', 'photo'];
const only = arg('--only', '').split(',').filter(Boolean);
if (only.some((take) => !Object.hasOwn(TAKES, take))) throw new Error('--only は story,trio,photo,overlay から指定してください');
const framesArg = arg('--frames');
const range = framesArg?.match(/^(\d+)-(\d+)$/)?.slice(1).map(Number);
if (framesArg && (!range || range[0] > range[1] || range[1] >= TOTAL)) {
  throw new Error(`--frames は 0〜${TOTAL - 1} の開始-終了コマを指定してください`);
}
const first = range?.[0] ?? 0, last = (range?.[1] ?? TOTAL - 1) + 1;
const composeOnly = flag('--compose-only');
if (composeOnly && (range || only.length || flag('--no-compose'))) throw new Error('--compose-only は単独の撮影モードです');
const framesDir = range ? join(framesRoot, `preview-${framesArg}`) : framesRoot;
const noCompose = flag('--no-compose') || Boolean(range);
const lanes = Number(arg('--lanes', 2));
if (![1, 2].includes(lanes)) throw new Error('--lanes は 1 または 2');
const variants = arg('--mux', '').split(',').filter(Boolean);
if (variants.some((v) => !['a', 'b'].includes(v))) throw new Error('--mux は a,b から指定してください');
const wanted = (take) => !composeOnly && (!only.length || only.includes(take)) && first < TAKES[take].to && last > TAKES[take].from;
const needApp = appTakes.some(wanted);
const siteDir = needApp ? need(arg('--site-dir', process.env.PROMO_SITE_DIR), '--site-dir') : null;
if (siteDir && (basename(siteDir) !== 'dist' || !existsSync(join(siteDir, appPath, 'index.html')))) {
  throw new Error(`--site-dir は day-095-bonsai を含む dist を指してください (${siteDir})`);
}

// ---- Frozen page clock (installed before any page script). __promoFreeze stops it, __promoStep(ms) advances it. ----
const CLOCK = `(() => {
  const realNow = performance.now.bind(performance), realRAF = requestAnimationFrame.bind(window), realCancel = cancelAnimationFrame.bind(window);
  const realDate = Date.now, realSet = setTimeout.bind(window), realClear = clearTimeout.bind(window);
  let virt = null, queue = new Map(), pending = new Map(), id = 1e6, timers = new Map(), seen = new WeakSet();
  const offset = realDate() - realNow();
  performance.now = () => virt ?? realNow();
  Date.now = () => virt === null ? realDate() : Math.round(offset + virt);
  window.requestAnimationFrame = (cb) => {
    if (virt !== null) { queue.set(++id, cb); return id; }
    const h = realRAF((t) => { pending.delete(h); cb(t); });
    pending.set(h, cb);
    return h;
  };
  window.cancelAnimationFrame = (h) => { if (!queue.delete(h)) { pending.delete(h); realCancel(h); } };
  window.setTimeout = (cb, ms = 0, ...rest) => { if (virt === null || typeof cb !== 'function') return realSet(cb, ms, ...rest); timers.set(++id, { at: virt + Math.max(0, ms), cb, rest }); return id; };
  window.clearTimeout = (h) => { if (timers.has(h)) timers.delete(h); else realClear(h); };
  const syncAnimations = (ms) => {
    for (const a of document.getAnimations()) {
      if (!seen.has(a)) { seen.add(a); a.pause(); a.currentTime = ms; continue; }
      a.currentTime = (a.currentTime || 0) + ms;
    }
  };
  window.__promoFreeze = () => {
    if (virt !== null) return;
    virt = realNow();
    for (const [h, cb] of pending) { realCancel(h); queue.set(h, cb); }
    pending.clear();
    syncAnimations(0);
  };
  window.__promoHoldAnimations = () => syncAnimations(0);
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
async function launch() {
  const { chromium } = await import(pathToFileURL(join(root, 'node_modules/playwright-core/index.mjs')).href);
  return chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
}
async function startServer() {
  const server = spawn(process.execPath, [join(root, 'scripts/serve-dist.mjs')], {
    cwd: dirname(siteDir), env: { ...process.env, PLAYWRIGHT_PORT: String(port) }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  try {
    await new Promise((done, reject) => {
      const timeout = setTimeout(() => reject(new Error(`配信の起動がタイムアウト: ${base}`)), 10000);
      let stdout = '';
      server.stdout.on('data', (chunk) => {
        stdout += chunk;
        if (stdout.includes(`Serving dist at ${base}\n`)) { clearTimeout(timeout); done(); }
      });
      server.once('error', (error) => { clearTimeout(timeout); reject(error); });
      server.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`配信が終了しました (code ${code}): ${base}`)); });
    });
    return server;
  } catch (error) {
    server.kill();
    throw error;
  }
}

async function newContext(browser, take) {
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: DPR, hasTouch: true, isMobile: true, serviceWorkers: 'block', locale: 'ja-JP', reducedMotion: 'no-preference' });
  await context.addInitScript(CLOCK);
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (new URL(url).origin === base) return route.continue();
    stats.blocked.push(new URL(url).origin); return route.abort();
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
async function openApp(page, query) {
  await page.goto(`${base}${appPath}?${query}`);
  await page.waitForFunction(() => document.querySelector('#app')?.dataset.ready === 'true' && window.__bonsai, null, { timeout: 180000 });
  await page.evaluate(() => window.__promoFreeze());
}

const step = (page, ms = 1000 / FPS) => page.evaluate((ms) => window.__promoStep(ms), ms);
const stamp = (frame) => ({ frame, seconds: +(frame / FPS).toFixed(3) });
const atFrame = (frame) => `${stamp(frame).seconds.toFixed(3)}s / frame ${frame}`;
const frameName = (n, prefix = 'f') => `${prefix}${String(n).padStart(5, '0')}.png`;
const appFrame = (take, g) => join(framesDir, take, frameName(g - TAKES[take].from));
const endBackground = appFrame('trio', TAKES.trio.to - 1);   // the plum (clean), softly blurred under the end card
const shoot = (page, take, index) => page.screenshot({ path: appFrame(take, index), type: 'png', timeout: 120000 });
const camera = (page, pose) => page.evaluate((pose) => window.__bonsai.view.camera.set(pose, { animate: false }), pose);
const defaultTarget = (page) => page.evaluate(() => window.__bonsai.view.camera.get().target);

function easedCamera(from, to, u, target) {
  const e = u * u * (3 - 2 * u), mix = (a, b) => a + (b - a) * e;
  return { az: mix(from.az, to.az), pol: mix(from.pol, to.pol), dist: mix(from.dist, to.dist),
    target: (from.target ?? target).map((v, i) => mix(v, (to.target ?? target)[i])) };
}

function storyCamera(g, target) {
  const keys = STORY.cameraKeys;
  const to = keys.findIndex((key) => g < frameAt(key.at));
  if (to <= 0) return easedCamera(keys.at(-1), keys.at(-1), 0, target);
  const a = keys[to - 1], b = keys[to];
  return easedCamera(a, b, (g - frameAt(a.at)) / (frameAt(b.at) - frameAt(a.at)), target);
}

// A real finger tap (CDP touch events at the element's centre), not el.click(): a synthetic click counts as a keyboard activation,
// so the app would draw the canvas's keyboard focus ring in the video.
const makeTouch = (cdp) => (type, p) => cdp.send('Input.dispatchTouchEvent', {
  type, touchPoints: p ? [{ x: p.x, y: p.y, id: 1, radiusX: 9, radiusY: 9, force: 1 }] : [],
});

async function tap(page, events, g, { target, label }, touch) {
  const point = await page.evaluate((selector) => {
    const el = document.querySelector(selector);
    const r = el?.getBoundingClientRect();
    if (!r?.width || !r.height || el.disabled || getComputedStyle(el).visibility !== 'visible') return null;
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
  }, target);
  if (!point) throw new Error(`押せる部品が見つかりません (${atFrame(g)}) ${target}`);
  await touch('touchStart', point);
  await touch('touchEnd');
  await page.evaluate(() => window.__promoHoldAnimations());
  events.taps.push({ frame: g, label, ...point });
}

async function selectBranch(page, branch, avoid = [], node = null) {
  return page.evaluate(async ({ branch, avoid, node }) => {
    const { pickNode, subtreeIndices } = await import('./lib/pick.js');
    const { tree, view } = window.__bonsai;
    const s = tree.snapshot(), camera = view.camera;
    const canvas = document.querySelector('#view');
    const box = canvas.getBoundingClientRect(), centerX = box.left + box.width / 2;
    const children = new Set(s.parent);
    const at = (values, i) => Array.from(values.subarray(3 * i, 3 * i + 3));
    const cut = branch === 'cut-target';
    // A storyboard that names the node (STORY.actions[].node, chosen by looking at what the cut or the bend changes on screen):
    // find a place along that segment where the app's own picker returns exactly that node, so the finger lands where a real one would.
    if (node != null) {
      const index = Array.from(s.ids).indexOf(node);
      if (index < 0) throw new Error(`節 ${node} がありません (${branch})`);
      const a = at(s.start, index), b = at(s.end, index);
      for (const f of [.5, .8, .3, 1, .65, .15, .9]) {
        const world = a.map((v, axis) => v + f * (b[axis] - v));
        const { x, y, visible } = camera.project(world);
        if (!visible || x < box.left + 20 || x > box.right - 20 || y < box.top + 24 || y > box.bottom - 24) continue;
        if (document.elementFromPoint(x, y) !== canvas) continue;
        const hit = pickNode(s, camera.pickRay(x, y), { pxToWorld: camera.pxToWorld, tolerancePx: 14, padHit: true });
        if (hit?.index === index) return { id: node, index, x, y, world, score: 1 };
      }
      throw new Error(`節 ${node} を指で選べません (${branch})`);
    }
    const pads = new Map(Array.from(s.pads.node, (padNode, i) => [padNode, i]));
    const chains = new Map();
    for (let i = 0; i < s.count; i++) {
      if (s.order[i] !== 1) continue;
      if (!chains.has(s.chain[i])) chains.set(s.chain[i], []);
      chains.get(s.chain[i]).push(i);
    }
    // The cut must be seen: pick a primary branch whose outer part carries a good share of the leaves (4-12% of all pad
    // coverage), so a whole leafy arm lights up under the finger and then falls away (a single twig tip is too small to notice).
    const padCoverage = (pad) => s.pads.radius[pad] ** 2 * s.pads.density[pad];
    let totalCoverage = 0;
    for (let p = 0; p < s.pads.node.length; p++) totalCoverage += padCoverage(p);
    const candidates = [];
    for (let i = 0; i < s.count; i++) {
      if (s.order[i] !== 1) continue;
      const a = at(s.start, i), b = at(s.end, i), mid = a.map((v, axis) => (v + b[axis]) / 2);
      let coverage = 0;
      if (cut) {
        for (const n of subtreeIndices(s, i)) if (pads.has(n)) coverage += padCoverage(pads.get(n));
        coverage /= totalCoverage;
        if (coverage < .04 || coverage > .15) continue;
      }
      const chain = chains.get(s.chain[i]);
      const middle = cut ? 0 : Math.abs((chain.indexOf(i) + .5) / chain.length - .5);
      // Try the segment midpoint and nearby positions. The app's picker accounts for branches and pads in front.
      // A cut tries several points along the arm: the picker prefers whatever is in front, so the middle may belong to a neighbour.
      const along = (f) => a.map((v, axis) => v + f * (b[axis] - v));
      for (const world of cut ? [.5, 1, .3, .75].map(along) : [mid, a.map((v, axis) => .25 * v + .75 * b[axis])]) {
        const { x, y, visible } = camera.project(world);
        if (!visible || x < box.left + 22 || x > box.right - 22 || y < box.top + 22 || y > box.bottom - 22) continue;
        if (cut ? x <= box.left + box.width * .22 || y >= innerHeight * .62 : x >= centerX) continue;
        // A second and third cut must be different arms: keep clear of the places already cut.
        if (cut && avoid.some((p) => Math.hypot(p.x - x, p.y - y) < 95)) continue;
        if (document.elementFromPoint(x, y) !== canvas) continue;
        const hit = pickNode(s, camera.pickRay(x, y), {
          pxToWorld: camera.pxToWorld, tolerancePx: 14, padHit: cut,
        });
        if (hit?.index !== i) continue;
        const score = cut ? coverage : -middle;
        candidates.push({ id: s.ids[i], index: i, x, y, world, score });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    if (!candidates.length) throw new Error(`指で選べる枝が見つかりません (${branch})`);
    return candidates[0];
  }, { branch, avoid, node });
}

const pageState = (page) => page.evaluate(({ cut, wire }) => {
  const { tree, view } = window.__bonsai;
  const s = tree.snapshot(), d = document.querySelector('#app').dataset;
  const flagged = (flag) => Array.from(s.ids).filter((_, i) => s.flags[i] & flag);
  return { nodes: s.count, cut: flagged(cut), wired: flagged(wire), day: tree.day,
    species: d.species, season: d.season, tool: d.tool, camera: view.camera.get(), graphics: view.stats() };
}, { cut: NODE_FLAG.CUT, wire: NODE_FLAG.WIRED });

const newEvents = () => ({ taps: [], fingers: [], states: [] });
function saveTake(take, events, detail) {
  writeFileSync(join(framesDir, take, 'events.json'), JSON.stringify(events, null, 1));
  stats.takes[take] = { ...detail, taps: events.taps.map(({ frame, label, x, y }) => ({ ...stamp(frame), label, x, y })) };
}

async function shootStory(browser) {
  const { context, page } = await newContext(browser, 'story');
  const events = { ...newEvents(), snips: [], wires: [], branches: [], undo: [], seasons: [] };
  let through = -1;
  try {
    await openApp(page, STORY.query);
    const target = await defaultTarget(page);
    const touch = makeTouch(await context.newCDPSession(page));
    const actions = new Map(STORY.actions.map((action) => [frameAt(action.at), action]));
    let finger = null, drag = null, prev = await pageState(page), selected = null, fingerBranch = null;
    const picked = [];
    for (let g = 0; g < Math.min(last, TAKES.story.to); g++) {
      await camera(page, storyCamera(g, target));
      const action = actions.get(g);
      if (action) {
        log('story', atFrame(g), action.type, action.label ?? action.branch ?? '');
        switch (action.type) {
          case 'tap': await tap(page, events, g, action, touch); break;
          case 'finger-down': {
            await step(page, 0); // Update the camera matrices before projecting the target.
            selected = await selectBranch(page, action.branch, action.branch === 'cut-target' ? picked : [], action.node ?? null);
            if (action.branch === 'cut-target') picked.push({ x: selected.x, y: selected.y });
            fingerBranch = action.branch;
            events.branches.push({ ...stamp(g), branch: action.branch, ...selected });
            finger = { x: selected.x, y: selected.y };
            await touch('touchStart', finger);
            break;
          }
          case 'finger-move':
            drag = { from: finger, start: g, end: g + frameAt(action.over), dx: action.dx, dy: action.dy };
            break;
          case 'finger-up':
            await touch('touchEnd');
            finger = drag = null;
            break;
        }
      }
      if (finger && !drag && fingerBranch === 'cut-target' && selected?.world) {
        // The camera drifts a little under the cuts: the finger stays on its branch (and the app then cuts exactly that branch).
        await step(page, 0);
        const p = await page.evaluate((world) => { const { x, y } = window.__bonsai.view.camera.project(world); return { x, y }; }, selected.world);
        if (Math.hypot(p.x - finger.x, p.y - finger.y) > .4) { finger = p; await touch('touchMove', finger); }
      }
      if (drag) {
        const u = Math.min(1, (g - drag.start) / (drag.end - drag.start));
        finger = { x: drag.from.x + drag.dx * u, y: drag.from.y + drag.dy * u };
        await touch('touchMove', finger);
        if (g >= drag.end) drag = null;
      }
      if (finger) events.fingers.push({ frame: g, points: [finger] });
      await step(page);
      const s = await pageState(page);
      if (s.nodes < prev.nodes) events.snips.push({ ...stamp(g), before: prev.nodes, after: s.nodes,
        targetId: selected?.id, cutIds: s.cut.filter((id) => !prev.cut.includes(id)) });
      const addedWires = s.wired.filter((id) => !prev.wired.includes(id));
      if (addedWires.length) events.wires.push({ ...stamp(g), targetId: selected?.id, wiredIds: addedWires });
      if (action?.target === '#undo') events.undo.push({ ...stamp(g), before: prev.nodes, after: s.nodes });
      if (s.season !== prev.season) events.seasons.push({ ...stamp(g), from: prev.season, to: s.season, day: s.day });
      prev = s;
      through = g;
      if (g >= first) {
        await shoot(page, 'story', g);
        events.states.push({ frame: g, ...s });
      }
    }
  } finally {
    await context.close();
    const { snips, wires, branches, undo, seasons } = events;
    saveTake('story', events, { snips, wires, branches, undo, seasons, through });
  }
}

async function shootTrio(browser) {
  const events = { ...newEvents(), shots: [] };
  for (const shot of TRIO_SHOTS) {
    const start = frameAt(shot.at), end = start + frameAt(shot.beats * BEAT);
    if (first >= end || last <= start) continue;
    const { context, page } = await newContext(browser, `trio/${shot.id}`);
    try {
      log('trio', atFrame(start), 'open', shot.id);
      await openApp(page, shot.query);
      const target = await defaultTarget(page);
      events.shots.push({ species: shot.id, from: start, to: end });
      for (let g = start; g < Math.min(end, last); g++) {
        await camera(page, easedCamera(shot.orbit.from, shot.orbit.to, (g - start) / (end - start - 1), target));
        await step(page);
        if (g < first) continue;
        await shoot(page, 'trio', g);
        events.states.push({ frame: g, ...await pageState(page) });
      }
    } finally { await context.close(); }
  }
  saveTake('trio', events, { shots: events.shots });
}

async function waitForPhoto(page) {
  // Keep this timer in Node so the page clock can stay frozen during pixel encoding and image decode.
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const photo = await page.evaluate(() => {
      const img = document.querySelector('#photo-image');
      return !img.hidden && img.naturalWidth > 0 ? { width: img.naturalWidth, height: img.naturalHeight } : null;
    });
    if (photo) return photo;
    await sleep(100);
  }
  const status = await page.textContent('#photo-status');
  throw new Error(`写真の読み込みがタイムアウト: ${status}`);
}

async function shootPhoto(browser) {
  const { context, page } = await newContext(browser, 'photo');
  const events = newEvents();
  let photoReady = null;
  try {
    await openApp(page, PHOTO.query);
    const touch = makeTouch(await context.newCDPSession(page));
    for (let g = TAKES.photo.from; g < Math.min(last, TAKES.photo.to); g++) {
      if (g === frameAt(PHOTO.tapAt)) {
        log('photo', atFrame(g), 'tap 写真');
        const started = Date.now();
        await tap(page, events, g, { target: PHOTO.target, label: '写真' }, touch);
        const dimensions = await waitForPhoto(page);
        photoReady = { ...stamp(g), waitMs: Date.now() - started, ...dimensions };
        log('photo', atFrame(g), 'image ready', `${photoReady.waitMs}ms`);
      }
      await step(page);
      if (g < first) continue;
      await shoot(page, 'photo', g);
      events.states.push({ frame: g, ...await pageState(page) });
    }
  } finally {
    await context.close();
    saveTake('photo', events, { photoReady });
  }
}

// ---- Overlay frames, screenshot separately from the app with a transparent background. ----
const FLASHES = [
  ...[1, 2, 3, 4].map((n) => [bar(n), .16]),
  ...TRIO_SHOTS.map(({ at }) => [at, .12]),
  [PHOTO.at, .14], [PHOTO.end, .16],
];
const CAPTION_TOP = { S0: 146, S1: 152, S2: 152, S3: 152, S4: 152, S5a: 152, S5b: 152, S6: 152 };

async function shootOverlay(browser) {
  const fromRoot = (file) => [join(framesDir, file), join(framesRoot, file)].find(existsSync);
  const events = appTakes.flatMap((take) => {
    const file = fromRoot(join(take, 'events.json'));
    return file ? [JSON.parse(readFileSync(file, 'utf8'))] : [];
  });
  const taps = events.flatMap((e) => e.taps);
  const fingers = Object.fromEntries(events.flatMap((e) => e.fingers).map((f) => [f.frame, f.points]));
  const background = fromRoot(join('trio', basename(endBackground)));
  const hasEnd = last > frameAt(PHOTO.end);
  if (hasEnd && !background) throw new Error('終わりのカードには trio の最後のコマが必要です');
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: DPR, serviceWorkers: 'block' });
  try {
    const origin = 'http://promo.local';
    const page = await context.newPage();
    const assets = new Map([
      ['/font.ttf', ['font/ttf', font]], ['/font-black.ttf', ['font/ttf', fontBlack]],
    ]);
    if (hasEnd) assets.set('/end.png', ['image/png', background]);
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.origin === origin) {
        if (url.pathname === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: overlayHtml({ hasEnd }) });
        if (assets.has(url.pathname)) {
          const [contentType, path] = assets.get(url.pathname);
          return route.fulfill({ contentType, path });
        }
      }
      return route.abort();
    });
    await page.goto(origin);
    await page.evaluate(async (hasEnd) => {
      const fonts = await Promise.all([document.fonts.load('700 30px Promo'), document.fonts.load('900 30px PromoBlack')]);
      if (fonts.some((face) => !face.length)) throw new Error('字幕の書体を読み込めません');
      if (hasEnd) await document.querySelector('.end-bg').decode();
    }, hasEnd);
    await page.evaluate((data) => window.__setup(data), { storyboard: STORYBOARD, taps, fingers, end: END_CARD, flashes: FLASHES, total: TOTAL, fps: FPS, captionTop: CAPTION_TOP });
    for (let f = first; f < last; f++) {
      await page.evaluate((f) => window.__frame(f), f);
      await page.screenshot({ path: join(framesDir, 'overlay', frameName(f, 'o')), omitBackground: true, timeout: 120000 });
    }
  } finally { await context.close(); }
}
function overlayHtml({ hasEnd }) {
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><style>
  @font-face { font-family: Promo; src: url(/font.ttf); font-weight: 700; }
  @font-face { font-family: PromoBlack; src: url(/font-black.ttf); font-weight: 900; }
  :root { --ink: #2b2623; --paper: #f3eee3; --red: #b3402c; --moss: #4f6f45; }
  html, body { margin: 0; width: 540px; height: 960px; overflow: hidden; background: transparent; font-family: Promo, sans-serif; color: var(--ink); }
  .cap { position: absolute; left: 16px; right: 16px; text-align: center; }
  .cap span { display: inline-block; font-size: 31px; line-height: 1.24; font-weight: 700; letter-spacing: .02em; padding: 4px 15px 7px; margin: 3px 0; border-radius: 10px;
    background: rgba(243, 238, 227, .94); box-shadow: 0 2px 0 rgba(43, 38, 35, .12), 0 6px 18px rgba(43, 38, 35, .14); }
  .cap span:last-child { color: var(--red); }
  .cap.big span { font-family: PromoBlack, Promo, sans-serif; font-weight: 900; font-size: 38px; padding: 6px 14px 9px; }
  .bar { display: none; }   /* the posting apps draw their own seek bar */
  .flash { position: absolute; inset: 0; background: var(--paper); opacity: 0; }
  .tap { position: absolute; width: 66px; height: 66px; margin: -33px; border-radius: 50%; border: 3.5px solid #fff; background: rgba(179, 64, 44, .30);
    box-shadow: 0 0 0 3px rgba(43, 38, 35, .55), 0 0 16px rgba(43, 38, 35, .35); box-sizing: border-box; opacity: 0; }
  .finger { position: absolute; width: 48px; height: 48px; margin: -24px; border-radius: 50%; background: rgba(243, 238, 227, .12); border: 3px solid rgba(255, 255, 255, .95);
    box-shadow: 0 0 0 6px rgba(179, 64, 44, .25), 0 4px 18px rgba(43, 38, 35, .35); box-sizing: border-box; }
  .end { position: absolute; inset: 0; display: none; overflow: hidden; background: var(--paper); }
  .end-bg { position: absolute; inset: -40px; width: calc(100% + 80px); height: calc(100% + 80px); object-fit: cover; filter: blur(6px) saturate(1.08); opacity: .8; }
  .end-shade { position: absolute; inset: 0; background: radial-gradient(ellipse 78% 58% at 50% 45%, #f3eee3f0 0%, #f3eee3e4 62%, #f3eee3a6 100%); }
  .end-body { position: absolute; left: 0; right: 0; top: 150px; text-align: center; }
  .end-body > * { opacity: 0; }
  .end .pill { display: inline-block; font-size: 14px; letter-spacing: .2em; color: var(--red); border: 1.5px solid #b3402c99; padding: 8px 16px; border-radius: 30px; background: var(--paper); }
  .end .logo svg { display: block; margin: 26px auto 0; width: 64px; height: 64px; }
  .end h1 { font-family: PromoBlack, Promo, sans-serif; font-size: 72px; letter-spacing: .03em; margin: 10px 0 8px; font-weight: 900; color: var(--ink); }
  .end .sub { font-size: 27px; margin: 0 0 30px; color: var(--ink); }
  .end .cta { font-size: 25px; font-weight: 700; margin: 30px 0 0; color: var(--red); letter-spacing: .02em; }
  .end .badges { display: flex; justify-content: center; gap: 9px; flex-wrap: wrap; padding: 0 34px; }
  .end .badges b { font-size: 18px; font-weight: 700; padding: 9px 15px; border-radius: 30px; border: 1.5px solid #2b262340; background: var(--paper); }
  .end .badges b:first-child { background: var(--red); color: #fff; border-color: var(--red); }
  .end .url { margin: 20px auto 0; display: inline-block; font-size: 21px; letter-spacing: .01em; color: #fff; background: var(--moss); padding: 14px 20px; border-radius: 14px; }
  </style>
  <div class="cap"></div>
  <div class="taps"></div>
  <div class="fingers"></div>
  <div class="bar"></div>
  <div class="end"><img class="end-bg" ${hasEnd ? 'src="/end.png"' : ''} alt=""><div class="end-shade"></div>
    <div class="end-body"><div class="pill end-day"></div>
      <div class="logo">${readFileSync(join(here, '../../favicon.svg'), 'utf8')}</div>
      <h1 class="end-title"></h1><p class="sub end-sub"></p><div class="badges end-badges"></div><p class="cta end-cta"></p><div><span class="url end-url"></span></div></div></div>
  <div class="flash"></div>
  <script>
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), easeOut = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;
  let D, current = null;
  window.__setup = (data) => {
    D = data;
    $('.end-day').textContent = data.end.day; $('.end-title').textContent = data.end.title; $('.end-sub').textContent = data.end.sub;
    $('.end-badges').replaceChildren(...data.end.badges.map((text) => Object.assign(document.createElement('b'), { textContent: text })));
    $('.end-cta').textContent = data.end.cta || '';
    $('.end-url').textContent = data.end.url;
    $('.taps').replaceChildren(...data.taps.map((tap) => { const el = document.createElement('div'); el.className = 'tap'; el.style.left = tap.x + 'px'; el.style.top = tap.y + 'px'; return el; }));
  };
  window.__frame = (f) => {
    // Scene changes, flashes and the end card are compared in whole frames, the same rounding as the cuts.
    const fr = (sec) => Math.round(sec * D.fps), scene = D.storyboard.findLast((s) => f >= fr(s.start)) ?? D.storyboard[0];
    $('.bar').style.width = (100 * (f + 1) / D.total) + '%';
    if (current !== scene.id) {
      current = scene.id;
      $('.cap').replaceChildren(...scene.lines.map((text) => Object.assign(document.createElement('span'), { textContent: text })).flatMap((el, i, all) => i < all.length - 1 ? [el, document.createElement('br')] : [el]));
      $('.cap').style.top = (D.captionTop[scene.id] ?? 152) + 'px';
      $('.cap').classList.toggle('big', !!scene.big);
    }
    // The first scene is fully visible from frame 0 (the first frame is the post's thumbnail).
    const age = (f - fr(scene.start)) / D.fps + (f === 0 || scene.start === 0 ? 0.4 : 0.15);
    [...$('.cap').querySelectorAll('span')].forEach((el, i) => { const u = easeOut((age - i * 0.08) / 0.22); el.style.opacity = u; el.style.transform = 'translateY(' + ((1 - u) * 18) + 'px)'; });
    let flash = 0;
    for (const [at, strength] of D.flashes) { const dt = (f - fr(at)) / D.fps; if (dt >= 0) flash = Math.max(flash, strength * Math.exp(-dt / 0.09)); }
    $('.flash').style.opacity = flash;
    [...$('.taps').children].forEach((el, i) => { const dt = (f - D.taps[i].frame) / D.fps; const u = clamp(dt / 0.42, 0, 1);
      el.style.opacity = dt >= 0 ? Math.min(1, 2.2 * (1 - u)) : 0; el.style.transform = 'scale(' + (0.6 + u * 0.8) + ')'; });
    const pts = D.fingers[f] || [];
    $('.fingers').replaceChildren(...pts.map((p) => { const el = document.createElement('div'); el.className = 'finger'; el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; return el; }));
    const endAt = D.storyboard.find((s) => s.music === 'resolve').start, end = f >= fr(endAt);
    $('.end').style.display = end ? 'block' : 'none';
    $('.cap').style.visibility = end ? 'hidden' : 'visible';
    if (end) {
      const e = (f - fr(endAt)) / D.fps;
      [...$('.end-body').children].forEach((el, i) => { const u = easeOut((e + 0.1 - i * 0.03) / 0.2); el.style.opacity = u; el.style.transform = 'translateY(' + ((1 - u) * 16) + 'px)'; });
      $('.end-bg').style.transform = 'scale(' + (1.02 + e * 0.022) + ')';
    }
  };
  </script></html>`;
}

// ---- Compose: lay the shot frames in final order, composite the overlay, encode, and check. ----
const ffmpeg = process.env.FFMPEG || 'ffmpeg', ffprobe = process.env.FFPROBE || 'ffprobe';
const silentName = 'Day095_bonsai_promo_silent.mp4';
function compose() {
  const seq = join(framesDir, 'seq');
  rmSync(seq, { recursive: true, force: true }); mkdirSync(seq, { recursive: true });
  const source = (g) => {
    for (const take of appTakes) if (g >= TAKES[take].from && g < TAKES[take].to) return appFrame(take, g);
    return endBackground;   // under the end card
  };
  for (let g = 0; g < TOTAL; g++) {
    const file = source(g), overlay = join(framesDir, 'overlay', frameName(g, 'o'));
    if (!existsSync(overlay)) throw new Error(`重ねのコマがありません: ${overlay}`);
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
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', silent, '-vf', 'fps=1:round=up,scale=270:480,tile=8x4:padding=6:color=0xf3eee3', '-frames:v', '1', '-q:v', '3', '-map_metadata', '-1', join(outDir, 'contact-sheet.jpg')]);
  // Compare raw app frames so progress-bar movement cannot make a static shot pass.
  const gray = (n) => execFileSync(ffmpeg, ['-v', 'error', '-i', appFrame('story', n), '-vf', 'scale=270:480,format=gray', '-frames:v', '1', '-f', 'rawvideo', '-']);
  const [a, b] = [gray(0), gray(3)];
  let diff = 0, changed = 0;
  for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); diff += d; if (d > 8) changed++; }
  stats.firstFrameMotion = { meanAbsDiff: +(diff / a.length).toFixed(3), changedPixelsPercent: +(100 * changed / a.length).toFixed(2) };
  if (changed === 0) throw new Error('冒頭のアプリ映像に動きが見つかりません (frame 0, 3)');
  // Every cut, 2 frames before and 2 after (one row per cut), to look for half-way states at the joins.
  const cuts = [...new Set(FLASHES.map(([at]) => frameAt(at)))].sort((x, y) => x - y);
  const picks = cuts.flatMap((c) => [c - 2, c - 1, c, c + 1]);
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', silent, '-vf', `select='${picks.map((n) => `eq(n\\,${n})`).join('+')}',scale=270:480,tile=4x${cuts.length}:padding=6:color=0x2b2623`,
    '-vsync', '0', '-frames:v', '1', '-q:v', '3', '-map_metadata', '-1', join(outDir, 'cut-check.jpg')]);
  stats.cutCheck = { file: 'cut-check.jpg', rows: cuts.map((c) => ({ cutFrame: c, seconds: +(c / FPS).toFixed(3), frames: [c - 2, c - 1, c, c + 1] })) };
}
function mux(variant) {
  const wav = join(outDir, `bgm_${variant}.wav`), out = join(outDir, `Day095_bonsai_promo_${variant}.mp4`);
  if (!existsSync(wav)) throw new Error(`BGMがありません: ${wav}（promo-audio.mjs --variant ${variant}）`);
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', join(outDir, silentName), '-i', wav,
    '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    '-af', `apad=whole_dur=${DURATION_SECONDS}`, '-t', String(DURATION_SECONDS), '-movflags', '+faststart', '-map_metadata', '-1', out]);
  return out;
}
function probe(file) {
  const p = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }));
  const v = p.streams.find((s) => s.codec_type === 'video'), a = p.streams.find((s) => s.codec_type === 'audio');
  execFileSync(ffmpeg, ['-v', 'error', '-xerror', '-i', file, '-f', 'null', '-'], { stdio: 'pipe' });
  const silent = file.endsWith(silentName);
  const ok = v.width === 1080 && v.height === 1920 && v.codec_name === 'h264' && v.pix_fmt === 'yuv420p' && v.r_frame_rate === `${FPS}/1` && Number(v.nb_frames) === TOTAL
    && Math.abs(Number(p.format.duration) - DURATION_SECONDS) <= 0.05
    && (silent ? !a : a?.codec_name === 'aac' && a.sample_rate === '48000' && a.channels === 2);
  const row = { file: basename(file), ok, size: `${v.width}x${v.height}`, codec: v.codec_name, pix: v.pix_fmt, fps: v.r_frame_rate, frames: Number(v.nb_frames),
    seconds: +Number(p.format.duration).toFixed(3), audio: a ? `${a.codec_name} ${a.sample_rate}Hz ${a.channels}ch` : 'なし', decodeErrors: 0 };
  log(ok ? '検査OK' : '検査NG', JSON.stringify(row));
  if (!ok) throw new Error(`出力が仕様と違います: ${file}`);
  return row;
}


// ---- Run ----
const started = Date.now(), timings = {}, outputs = [];
const overlayWanted = wanted('overlay') || (!noCompose && needApp);
const shooters = { story: shootStory, trio: shootTrio, photo: shootPhoto, overlay: shootOverlay };
async function capture(browser, take) {
  const t0 = Date.now(), dir = join(framesDir, take);
  const from = Math.max(first, TAKES[take].from), to = Math.min(last, TAKES[take].to);
  log(take, 'start', atFrame(from), '–', atFrame(to - 1));
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  stats.frames[take] = 0;
  try {
    await shooters[take](browser);
    stats.frames[take] = to - from;
    log(take, 'end', atFrame(to - 1), `${stats.frames[take]} frames`);
  } catch (error) {
    stats.takes[take] = { ...stats.takes[take], error: error.message };
    log(take, 'failed', error.message);
    throw error;
  } finally {
    timings[take] = +((Date.now() - t0) / 60000).toFixed(2);
  }
}

async function captureLane(takes) {
  const selected = takes.filter(wanted);
  if (!selected.length) return;
  const browser = await launch();
  try { for (const take of selected) await capture(browser, take); }
  finally { await browser.close(); }
}

function cueDrift(cues, measured, through) {
  return cues.map((cue) => {
    const expectedFrame = frameAt(cue);
    const nearest = measured.reduce((best, row) => (
      !best || Math.abs(row.frame - expectedFrame) < Math.abs(best.frame - expectedFrame) ? row : best
    ), null);
    return { cue, expectedFrame, measured: nearest ? stamp(nearest.frame) : null,
      driftFrames: nearest ? nearest.frame - expectedFrame : null, checked: expectedFrame <= through };
  });
}

function saveReport() {
  const file = join(framesDir, 'capture-report.json');
  const previous = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const takes = { ...previous.takes, ...stats.takes };
  const story = takes.story ?? {};
  const snipCueDrift = cueDrift(SNIP_CUES, story.snips ?? [], story.through ?? -1);
  const wireCueDrift = cueDrift(WIRE_CUES, story.wires ?? [], story.through ?? -1);
  for (const [name, rows] of [['SNIP_CUES', snipCueDrift], ['WIRE_CUES', wireCueDrift]]) {
    if (rows.some((r) => r.checked && r.driftFrames !== 0)) log('注意', name, JSON.stringify(rows));
  }
  const taps = Object.values(takes).flatMap((t) => t.taps ?? []);
  const report = { seconds: DURATION_SECONDS, fps: FPS, width: VIEW.width * DPR, height: VIEW.height * DPR,
    beat: BEAT, capture: `CSS ${VIEW.width}x${VIEW.height}, DPR ${DPR}`, previewRange: range ?? null,
    framesShot: { ...previous.framesShot, ...stats.frames }, takes, snipCueDrift, wireCueDrift,
    tapCueDrift: cueDrift(TAP_CUES, taps, Math.max(story.through ?? -1, takes.photo?.photoReady?.frame ?? -1)),
    minutes: +((Date.now() - started) / 60000).toFixed(2), minutesByTake: { ...previous.minutesByTake, ...timings },
    cutCheck: stats.cutCheck ?? previous.cutCheck, firstFrameMotion: stats.firstFrameMotion ?? previous.firstFrameMotion,
    blockedRequests: stats.blocked.length, blocked: stats.blocked.slice(0, 20), consoleWarnings: stats.warnings, gpuReadbackNotes: stats.driverNotes,
    outputs,
  };
  const json = JSON.stringify(report, null, 2) + '\n';
  writeFileSync(file, json);
  if (!range) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'capture-report.json'), json);
  }
  log('capture-report', file);
}

mkdirSync(framesDir, { recursive: true });
const server = needApp ? await startServer() : null;
try {
  const jobs = lanes === 1 ? [captureLane(appTakes)] : [captureLane(['story']), captureLane(['trio', 'photo'])];
  const results = await Promise.allSettled(jobs);
  const failed = results.find((r) => r.status === 'rejected');
  if (failed) throw failed.reason;
  if (overlayWanted) {
    const browser = await launch();
    try { await capture(browser, 'overlay'); }
    finally { await browser.close(); }
  }
  if (!noCompose) {
    compose();
    outputs.push(probe(join(outDir, silentName)));
    for (const variant of variants) outputs.push(probe(mux(variant)));
  }
} finally {
  server?.kill();
  saveReport();
}
