// 撮影系スクリプト（render-promo.mjs / camera-study.mjs）で共有する、配信サーバー・仮想クロック・決定論テイク操作。
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FPS, TAKES, frameAt } from './timeline.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
export const ROOT = resolve(HERE, '../..');
export const DIST = resolve(ROOT, 'dist/client');
export const { chromium } = await import(pathToFileURL(join(ROOT, 'node_modules/playwright/index.mjs')).href);

export const VIEW = { width: 540, height: 960 };
export const DPR = 2;
export const GPU_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
export const LOCAL_RE = /127\.0\.0\.1|localhost|\[::1\]/i;
export const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.glb': 'model/gltf-binary',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
};

const which = (name) => execFileSync('/bin/sh', ['-c', `command -v ${name}`], { encoding: 'utf8' }).trim();
export const ffmpeg = process.env.FFMPEG || which('ffmpeg');
export const ffprobe = process.env.FFPROBE || which('ffprobe');

export const takeFramesCount = (take) => frameAt(TAKES[take].to) - frameAt(TAKES[take].from);
export function cleanDir(dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function startDistServer(port, distDir = DIST) {
  if (!existsSync(join(distDir, 'index.html'))) throw new Error(`dist/client が見つかりません: ${distDir}（先に npm run build）`);
  const origin = `http://127.0.0.1:${port}`;
  const srv = createServer((req, res) => {
    const pathname = new URL(req.url, origin).pathname;
    const f = join(distDir, pathname === '/' ? 'index.html' : pathname);
    if (!existsSync(f)) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    res.setHeader('Content-Type', MIME[extname(f)] || 'application/octet-stream');
    res.end(readFileSync(f));
  });
  return new Promise((r) => srv.listen(port, '127.0.0.1', () => r({ srv, origin })));
}

// 仮想クロックフック：ゲーム側 this.loop が握っている初期 rAF コールバックも逃さずキューで引き継ぐ
export const CLOCK_SCRIPT = `(() => {
  const rn = performance.now.bind(performance), rr = requestAnimationFrame.bind(window);
  const rd = Date.now, rs = setTimeout.bind(window), rl = clearTimeout.bind(window);
  let virt = null, base = 0, lastReal = 0, q = new Map(), id = 1e6, tm = new Map(), seen = new WeakSet();
  performance.now = () => virt ?? rn();
  Date.now = () => virt === null ? rd() : Math.round(base + virt);
  window.requestAnimationFrame = (cb) => {
    const h = ++id; q.set(h, cb);
    if (virt === null) rr((t) => { lastReal = t; if (virt !== null) return; const fn = q.get(h); if (!fn) return; q.delete(h); fn(t); });
    return h;
  };
  window.cancelAnimationFrame = (h) => { q.delete(h); };
  window.setTimeout = (cb, ms = 0, ...rest) => { if (virt === null || typeof cb !== 'function') return rs(cb, ms, ...rest); tm.set(++id, { at: virt + Math.max(0, ms), cb, rest }); return id; };
  window.clearTimeout = (h) => { if (tm.has(h)) tm.delete(h); else rl(h); };
  window.__promoFreeze = (ep) => { if (virt === null) { virt = Math.max(rn(), lastReal) + 1; base = ep - virt; } };
  window.__promoStep = (ms) => {
    virt += ms;
    for (const [h, t] of [...tm].sort((a, b) => a[1].at - b[1].at)) if (t.at <= virt) { tm.delete(h); t.cb(...t.rest); }
    const cbs = [...q.values()]; q = new Map();
    for (const cb of cbs) cb(virt);
    for (const a of document.getAnimations()) {
      if (!seen.has(a)) { seen.add(a); a.pause(); a.currentTime = ms; }
      else a.currentTime = (a.currentTime || 0) + ms;
    }
    return cbs.length;
  };
})();`;

export async function openMatch(browser, origin, take, { keepList = false, hideHud = true, compactBanner = false, seed = 20261117, level = 'normal', skipFriendly = false, cpuOn = false, viewport = VIEW, stats = null } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: DPR, locale: 'ja-JP', serviceWorkers: 'block' });
  await ctx.addInitScript(CLOCK_SCRIPT);
  await ctx.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    if (new URL(url).origin === origin) {
      if (stats) stats.local++;
      return route.continue();
    }
    if (stats) stats.blocked.push(url);
    return route.abort();
  });
  ctx.on('request', (r) => {
    if (stats && !/^(data|blob):/.test(r.url())) stats.requests++;
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => stats?.warnings.push(`${take}: pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') stats?.warnings.push(`${take}: console: ${m.text().slice(0, 240)}`);
  });
  await page.goto(`${origin}/?debug=1`, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForFunction(() => '__SY__' in window, null, { timeout: 60_000 });
  await page.evaluate((s) => window.__SY__.seed(s), seed);
  await page.getByRole('button', { name: /ひとりで/ }).first().click();
  const lvlName = level === 'hard' ? /本気/ : level === 'easy' ? /やさしい/ : /ふつう/;
  await page.getByRole('button', { name: lvlName }).first().click();
  await page.waitForFunction(() => window.__SY__.state().phase === 'playing', null, { timeout: 60_000 });

  if (hideHud) {
    const css = ['[data-testid="btn-pause"]', '[data-testid="hud-touch"]', '.syh-hint', keepList ? '' : '[data-testid="hud-list"]'].filter(Boolean).join(',');
    const bannerCss = compactBanner
      ? '\n.syh-center { top: 78px !important; gap: 3px !important; }\n.syh-banner { padding: 4px 12px !important; font-size: 13px !important; border-radius: 10px !important; }\n.syh-banner small { font-size: 10px !important; }'
      : '';
    await page.addStyleTag({ content: `${css} { display: none !important; }${bannerCss}` });
  }
  await page.evaluate(([preTicks, keepCpu]) => {
    if (!keepCpu) window.__SY__.cpu(false);
    window.__SY__.quality('high');
    window.__promoFreeze(Date.UTC(2026, 10, 17, 2, 0, 0));
    for (let i = 0; i < preTicks; i++) window.__promoStep(1000 / 60);
  }, [skipFriendly ? 1280 : 95, cpuOn]);
  return { ctx, page };
}

export const tick = (page, partialInput = null, ticks = 2) =>
  page.evaluate(([inp, n]) => {
    for (let i = 0; i < n; i++) {
      if (inp) window.__SY__.input(i === 0 ? inp : { ...inp, actionPressed: false, jump: false, dash: inp.dash }, 1);
      window.__promoStep(1000 / 60);
    }
    return window.__SY__.state();
  }, [partialInput, ticks]);

export function easeInOut(u) {
  const t = Math.max(0, Math.min(1, u));
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** 開始〜終了のカメラ姿勢を補間し、衝撃時の FOV キックと決定論的正弦波揺れを合成する */
export function evalCameraPose(u, anchor, spec, k = 0) {
  const e = easeInOut(u);
  const lerp3 = (a, b) => [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e];
  const off = lerp3(spec.startOffset, spec.endOffset);
  const lookOff = lerp3(spec.startLook, spec.endLook);
  let fov = spec.startFov + (spec.endFov - spec.startFov) * e;
  let sx = 0;
  let sy = 0;
  let sz = 0;
  if (spec.impactAtK != null) {
    const dt = k - spec.impactAtK;
    const dur = spec.impactFrames ?? 8;
    if (dt >= 0 && dt < dur) {
      const env = Math.exp(-dt * 0.42) * (1 - dt / dur);
      fov += (spec.fovPunch ?? 5) * env;
      const amp = (spec.shakeAmp ?? 0.14) * env;
      sx = amp * Math.sin(dt * 2.4 + 0.3);
      sy = amp * 0.75 * Math.cos(dt * 3.1 + 0.9);
      sz = amp * 0.5 * Math.sin(dt * 1.9 + 1.7);
    }
  }
  const pos = [
    Math.max(-17.3, Math.min(17.3, anchor[0] + off[0] + sx)),
    Math.min(spec.maxY ?? 2.6, Math.max(0.5, anchor[1] + off[1] + sy)),
    Math.max(-13.3, Math.min(13.3, anchor[2] + off[2] + sz)),
  ];
  const look = [anchor[0] + lookOff[0], anchor[1] + lookOff[1], anchor[2] + lookOff[2]];
  return { pos, look, fov };
}

export async function checkLocalText(page, take, k, stats = null) {
  const txt = await page.evaluate(() => [document.body.innerText, ...[...document.querySelectorAll('input,textarea')].map((e) => e.value)].join('\n'));
  if (LOCAL_RE.test(txt)) {
    stats?.localAddressSeen.push({ take, k });
    throw new Error(`ローカルアドレスが画面に露出: ${take} f${k}`);
  }
}

// 1) ピラミッド爆散
export async function runPyramid(browser, { origin, stats = null }, runFrames) {
  const n = takeFramesCount('pyramid');
  const { ctx, page } = await openMatch(browser, origin, 'pyramid', { stats });
  try {
    await page.evaluate(() => {
      window.__SY__.teleport(0, 3.5, 5.55);
      window.__SY__.face(0, Math.PI);
      window.__SY__.teleport(1, 14.5, -5.0);
    });
    await tick(page, null, 2);
    const kickF = Math.round(TAKES.pyramid.kickAt * FPS); // 打撃タイミングは timeline.mjs の kickAt を参照
    return await runFrames(page, 'pyramid', n, (k) => {
      if (k < kickF) return tick(page, { moveZ: -1, dash: true });
      if (k === kickF) return tick(page, { action: true, actionPressed: true });
      return tick(page, null);
    });
  } finally {
    await ctx.close();
  }
}

// 2) 棚なぎ払い
export async function runSweep(browser, { origin, stats = null }, runFrames) {
  const n = takeFramesCount('sweep');
  const { ctx, page } = await openMatch(browser, origin, 'sweep', { stats });
  try {
    await page.evaluate(() => {
      window.__SY__.teleport(0, 4.65, -1.0);
      window.__SY__.face(0, Math.PI / 2);
      window.__SY__.teleport(1, 14.5, -5.0);
    });
    await tick(page, null, 2);
    await tick(page, { action: true, actionPressed: true }, 16);
    await page.evaluate(() => {
      window.__SY__.teleport(0, 2.05, -0.5);
      window.__SY__.face(0, -Math.PI / 2);
    });
    await tick(page, null, 2);
    await tick(page, { action: true, actionPressed: true }, 16);
    return await runFrames(page, 'sweep', n, (k) => {
      const sweepHit = k === 2 || k === 18 || k === 34;
      if (sweepHit) return tick(page, { moveX: -0.75, moveZ: -0.66, dash: true, action: true, actionPressed: true }, 2);
      return tick(page, { moveX: -0.35, moveZ: -0.94, dash: true }, 2);
    });
  } finally {
    await ctx.close();
  }
}

// 3) カート爆走
export async function runCart(browser, { origin, stats = null }, runFrames) {
  const n = takeFramesCount('cart');
  const { ctx, page } = await openMatch(browser, origin, 'cart', { stats });
  try {
    await page.evaluate(() => {
      window.__SY__.teleport(0, 8.75, 11.4);
      window.__SY__.face(0, Math.PI);
      window.__SY__.teleport(1, 14.5, -5.0);
    });
    await tick(page, null, 2);
    await tick(page, { action: true, actionPressed: true }, 6);
    const mounted = await page.evaluate(() => window.__SY__.state().players[0].ridingCart);
    if (mounted == null) throw new Error('cart に乗れません');
    for (let i = 0; i < 20; i++) await tick(page, { moveZ: -1, moveX: -0.2, dash: true }, 2);
    for (let i = 0; i < 16; i++) await tick(page, { moveX: -1, moveZ: -0.1, dash: true }, 2);
    return await runFrames(page, 'cart', n, (k) => tick(page, { moveX: -1, moveZ: k < 28 ? 0.12 : -0.18, dash: true }));
  } finally {
    await ctx.close();
  }
}

// 4) スイカボウリング
export async function runBowling(browser, { origin, stats = null }, runFrames) {
  const n = takeFramesCount('bowling');
  const throwF = frameAt(TAKES.bowling.throwAt) - frameAt(TAKES.bowling.from); // 15
  const impactF = frameAt(TAKES.bowling.impactAt) - frameAt(TAKES.bowling.from); // 60
  let hitTick = null;
  const { ctx, page } = await openMatch(browser, origin, 'bowling', { stats });
  try {
    hitTick = await page.evaluate(() => {
      window.__SY__.teleport(0, 8.5, 4.9);
      window.__SY__.face(0, Math.PI);
      for (let i = 0; i < 4; i++) window.__promoStep(1000 / 60);
      window.__SY__.input({ action: true, actionPressed: true }, 1);
      for (let i = 0; i < 4; i++) window.__promoStep(1000 / 60);
      window.__SY__.teleport(0, 8.5, 0.5);
      window.__SY__.face(0, Math.PI);
      for (let i = 0; i < 4; i++) window.__promoStep(1000 / 60);
      window.__SY__.input({ action: true, actionPressed: true }, 1);
      for (let t = 1; t <= 180; t++) {
        window.__promoStep(1000 / 60);
        if (window.__SY__.state().stations.bowling.pinsDown >= 2) return t;
      }
      return null;
    });
    if (!hitTick) throw new Error('bowling ドライランでピンに命中しません');
  } finally {
    await ctx.close();
  }

  const { ctx: ctx2, page: p2 } = await openMatch(browser, origin, 'bowling', { stats });
  try {
    await p2.evaluate(() => {
      window.__SY__.teleport(0, 8.5, 4.9);
      window.__SY__.face(0, Math.PI);
    });
    await tick(p2, null, 2);
    await tick(p2, { action: true, actionPressed: true }, 3);
    await p2.evaluate(() => {
      window.__SY__.teleport(0, 8.5, 2.0);
      window.__SY__.face(0, Math.PI);
    });
    await tick(p2, null, 2);

    let doneTicks = 0;
    const flightFrames = impactF - throwF;
    const last = await runFrames(p2, 'bowling', n, async (k) => {
      if (k < throwF - 1) return tick(p2, { moveZ: -1, dash: true }, 2);
      if (k === throwF - 1) {
        await p2.evaluate(() => {
          window.__SY__.teleport(0, 8.5, 0.5);
          window.__SY__.face(0, Math.PI);
        });
        return tick(p2, { action: true, actionPressed: true }, 1);
      }
      if (k <= impactF) {
        const target = Math.round(((k - (throwF - 1)) / flightFrames) * hitTick);
        const delta = Math.max(0, target - doneTicks);
        doneTicks += delta;
        return tick(p2, null, Math.max(0, delta));
      }
      return tick(p2, null, 2);
    });
    return { last, hitTick };
  } finally {
    await ctx2.close();
  }
}

// 5) バナナの皮で転倒
export async function runBanana(browser, { origin, stats = null }, runFrames) {
  const n = takeFramesCount('banana');
  const { ctx, page } = await openMatch(browser, origin, 'banana', { skipFriendly: true, stats });
  try {
    const { clerkPos, peelPos } = await page.evaluate(() => {
      window.__SY__.teleport(0, -14.3, -5.2);
      window.__SY__.face(0, Math.PI);
      window.__SY__.teleport(1, 14.5, -5.0);
      for (let i = 0; i < 4; i++) window.__promoStep(1000 / 60);
      window.__SY__.input({ action: true, actionPressed: true }, 1);
      window.__promoStep(1000 / 60);
      window.__SY__.teleport(0, 14.0, -9.0);
      for (let t = 0; t < 1600; t++) {
        window.__promoStep(1000 / 60);
        const c = window.__SY__.state().npcs.find((npc) => npc.id === 0);
        if (c && Math.abs(c.pos.x + 12.0) < 0.7 && c.pos.z > -8.2 && c.pos.z < -5.8) break;
      }
      const c0 = window.__SY__.state().npcs.find((npc) => npc.id === 0);
      const peelZ = c0.pos.z + 4.3;
      const peelX = -12.0;
      const standZ = peelZ - 0.55;
      window.__SY__.teleport(0, peelX, standZ);
      window.__SY__.face(0, Math.PI);
      window.__promoStep(1000 / 60);
      window.__SY__.input({ action: true, actionPressed: true }, 1);
      window.__promoStep(1000 / 60);
      window.__SY__.teleport(0, 14.0, -9.0);
      window.__SY__.heat(0, 0);
      for (let w = 0; w < 54; w++) window.__promoStep(1000 / 60);
      const cNow = window.__SY__.state().npcs.find((npc) => npc.id === 0);
      const dz = peelZ - cNow.pos.z;
      const stepDir = dz >= 0 ? 1 : -1;
      const targetZ = Math.max(-9.8, Math.min(3.5, peelZ + stepDir * 2.6));
      window.__SY__.teleport(0, peelX, targetZ);
      window.__SY__.face(0, stepDir > 0 ? Math.PI : 0);
      window.__SY__.heat(0, 95);
      return { clerkPos: cNow.pos, peelPos: { x: peelX, z: peelZ } };
    });
    let slipFrame = null;
    const last = await runFrames(page, 'banana', n, async (k) => {
      const st = await tick(page, null, 2);
      if (slipFrame === null && (st.npcs.some((npc) => npc.state === 'slipped' || npc.anim === 'slip') || st.players[0].secrets?.includes('secret-staff-slip'))) {
        slipFrame = k;
      }
      return st;
    });
    return { last, clerkPos, peelPos, slipFrame };
  } finally {
    await ctx.close();
  }
}

// 6b) 冷凍ケースで涼む
export async function runFreezer(browser, { origin, stats = null }, runFrames, { viewport = VIEW, clip = null } = {}) {
  const n = takeFramesCount('freezer');
  const { ctx, page } = await openMatch(browser, origin, 'freezer', { viewport, stats });
  try {
    await page.evaluate(() => {
      window.__SY__.teleport(0, 0.1, -10.5);
      window.__SY__.face(0, Math.PI);
      window.__SY__.teleport(1, 14.5, 5.0);
    });
    await tick(page, null, 2);
    await tick(page, { action: true, actionPressed: true }, 3);
    await tick(page, { action: true }, 62);
    return await runFrames(page, 'freezer', n, () => tick(page, { action: true }, 2), clip);
  } finally {
    await ctx.close();
  }
}

// 6c) 悪事をつないで最高倍率×3.0
export async function runCombo(browser, { origin, stats = null }, runFrames) {
  const n = takeFramesCount('combo');
  const { ctx, page } = await openMatch(browser, origin, 'combo', { stats });
  try {
    await page.evaluate(() => {
      window.__SY__.teleport(0, 3.5, 5.15);
      window.__SY__.face(0, Math.PI);
      window.__SY__.teleport(1, 14.5, -5.0);
    });
    await tick(page, null, 2);
    await tick(page, { action: true, actionPressed: true }, 4);
    await page.evaluate(() => {
      window.__SY__.teleport(0, 2.35, -0.3);
      window.__SY__.face(0, -Math.PI / 2);
    });
    await tick(page, null, 2);
    await tick(page, { action: true, actionPressed: true }, 4);
    await page.evaluate(() => {
      window.__SY__.teleport(0, 15.0, -8.7);
      window.__SY__.face(0, Math.PI);
    });
    await tick(page, null, 2);
    await tick(page, { action: true, actionPressed: true }, 4);
    await page.evaluate(() => {
      window.__SY__.teleport(0, -0.6, 9.78);
      window.__SY__.face(0, 0);
    });
    await tick(page, null, 2);
    for (let b = 0; b < 15; b++) await tick(page, { action: true, actionPressed: true }, 6);
    return await runFrames(page, 'combo', n, (k) => {
      const ding = k % 5 === 0 && k < 40;
      return tick(page, ding ? { action: true, actionPressed: true } : null, 2);
    });
  } finally {
    await ctx.close();
  }
}

// 7) 店員追走
export async function runChase(browser, { origin, stats = null }, runFrames) {
  const n = takeFramesCount('chase');
  const caughtF = frameAt(TAKES.chase.caughtAt) - frameAt(TAKES.chase.from); // 84
  let bestStopK = 42;
  let bestTicksBefore = 0;
  let bestCatchF = null;
  const { ctx: probeCtx, page: probePage } = await openMatch(browser, origin, 'chase', { skipFriendly: true, stats });
  try {
    const res = await probePage.evaluate(() => {
      let extra = 0;
      for (let t = 0; t < 1600; t++) {
        window.__promoStep(1000 / 60);
        extra++;
        const c = window.__SY__.state().npcs.find((npc) => npc.id === 1);
        if (c && c.pos.x > 12.8 && c.pos.z > -7.5 && c.pos.z < -3.0) break;
      }
      const c1 = window.__SY__.state().npcs.find((npc) => npc.id === 1);
      window.__SY__.teleport(0, c1.pos.x, c1.pos.z + 3.2);
      window.__SY__.face(0, 0);
      window.__SY__.heat(0, 98);
      let caughtAtK = null;
      for (let k = 0; k < 120; k++) {
        for (let i = 0; i < 2; i++) {
          if (k < 40) window.__SY__.input({ moveZ: 1, dash: true }, 1);
          window.__promoStep(1000 / 60);
        }
        if (caughtAtK === null && window.__SY__.state().players[0].caught > 0) {
          caughtAtK = k;
          break;
        }
      }
      return { extra, caughtAtK };
    });
    bestTicksBefore = res.extra;
    bestCatchF = res.caughtAtK;
    if (res.caughtAtK !== null) bestStopK = Math.max(15, Math.min(72, 40 + Math.round((caughtF - res.caughtAtK) * 0.85)));
  } finally {
    await probeCtx.close();
  }

  const { ctx, page } = await openMatch(browser, origin, 'chase', { skipFriendly: true, stats });
  try {
    await page.evaluate((extra) => {
      for (let t = 0; t < extra; t++) window.__promoStep(1000 / 60);
      const c1 = window.__SY__.state().npcs.find((npc) => npc.id === 1);
      window.__SY__.teleport(0, c1.pos.x, c1.pos.z + 3.2);
      window.__SY__.face(0, 0);
      window.__SY__.heat(0, 98);
    }, bestTicksBefore);
    let catchFrame = null;
    const last = await runFrames(page, 'chase', n, async (k) => {
      const inp = k < bestStopK ? { moveZ: 1, dash: true } : null;
      const st = await tick(page, inp, 2);
      if (catchFrame === null && st.players[0].caught > 0) catchFrame = k;
      return st;
    });
    return { last, catchFrame, bestCatchF, bestStopK, caughtF };
  } finally {
    await ctx.close();
  }
}
