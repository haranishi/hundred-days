import { expect, test } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WORLD } from '../../day-070-flip-court/lib/config.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CANONICAL = 'https://hundred-days.pages.dev/day-070-flip-court/';
let server;
let sourceUrl;
const observations = new WeakMap();

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });

test.beforeAll(async () => {
  server = spawn(process.execPath, ['day-070-flip-court/tools/serve.mjs'], {
    cwd: ROOT, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  sourceUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Day070 source preview did not start')), 10_000);
    let output = '';
    server.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/day-070-flip-court\//);
      if (match) { clearTimeout(timeout); resolve(match[0]); }
    });
    server.once('error', (error) => { clearTimeout(timeout); reject(error); });
    server.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Source preview exited: ${code}`)); });
  });
});

test.afterAll(async () => {
  if (server && server.exitCode === null) {
    const stopped = new Promise((resolve) => server.once('exit', resolve));
    server.kill('SIGTERM');
    await stopped;
  }
});

test.afterEach(async ({ page }) => {
  const seen = observations.get(page);
  if (!seen || page.isClosed()) return;
  expect(seen.errors, 'page/console errors').toEqual([]);
  expect(seen.badResponses, 'HTTP errors').toEqual([]);
  expect(seen.outside, 'external requests').toEqual([]);
  expect(await page.evaluate(() => window.day070Test.violations), 'CSP violations').toEqual([]);
  expect(await page.locator('body').innerText()).not.toMatch(/\bundefined\b|\bNaN\b|\[object /);
});

async function open(page, { canvasFailure = null, native = true } = {}) {
  const seen = { errors: [], badResponses: [], outside: [] };
  observations.set(page, seen);
  page.on('pageerror', (error) => seen.errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') seen.errors.push(message.text()); });
  page.on('response', (response) => {
    if (response.status() >= 400) seen.badResponses.push(`${response.status()} ${response.url()}`);
  });
  const origin = new URL(sourceUrl).origin;
  await page.route('**/*', (route) => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    seen.outside.push(route.request().url());
    return route.abort();
  });
  await page.clock.install({ time: new Date('2026-10-18T15:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-18T15:00:01Z'));
  await page.addInitScript(({ failure, enableNative }) => {
    // Test-only browser API probes: the application exposes no model or debug globals.
    window.day070Test = { violations: [], copies: [], fallback: [], native: [], copyMode: 'ok', fallbackOk: false, nativeMode: 'abort' };
    Math.random = () => 1 / 0x100000000;
    document.addEventListener('securitypolicyviolation', (event) => {
      day070Test.violations.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      async writeText(text) {
        day070Test.copies.push(text);
        if (day070Test.copyMode === 'fail') throw new Error('Clipboard rejected by test');
      },
    } });
    document.execCommand = (command) => { day070Test.fallback.push(command); return day070Test.fallbackOk; };
    Object.defineProperty(navigator, 'share', { configurable: true, value: enableNative ? async (data) => {
      day070Test.native.push(data);
      if (day070Test.nativeMode === 'abort') throw new DOMException('Cancelled by test', 'AbortError');
      if (day070Test.nativeMode === 'fail') throw new Error('Native share rejected by test');
    } : undefined });
    if (failure) HTMLCanvasElement.prototype.getContext = function () {
      if (failure === 'throw') throw new Error('Canvas blocked by test');
      return null;
    };
  }, { failure: canvasFailure, enableNative: native });
  const response = await page.goto(sourceUrl);
  expect(response.headers()['content-security-policy']).toContain("script-src 'self'");
  await expect(page.locator('#share .share')).toHaveCount(1);
  await page.evaluate(() => {
    document.addEventListener('keydown', (event) => { day070Test.lastKey = { code: event.code, repeat: event.repeat }; });
    document.querySelector('#court').addEventListener('pointermove', (event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      day070Test.pointer = { clientX: event.clientX, left: rect.left, width: rect.width, worldX: (event.clientX - rect.left) / rect.width * 600 };
    });
    const request = requestAnimationFrame.bind(window);
    const cancel = cancelAnimationFrame.bind(window);
    const pending = new Set();
    day070Test.raf = { pending, max: 0 };
    window.requestAnimationFrame = (callback) => {
      const id = request((time) => { pending.delete(id); callback(time); });
      pending.add(id);
      day070Test.raf.max = Math.max(day070Test.raf.max, pending.size);
      return id;
    };
    window.cancelAnimationFrame = (id) => { pending.delete(id); cancel(id); };
  });
}

const phase = (page) => page.locator('#app').getAttribute('data-phase');
const focus = (page) => page.evaluate(() => document.activeElement.id);
const pending = (page) => page.evaluate(() => day070Test.raf.pending.size);
const near = (actual, expected, tolerance = 4) => expect(Math.abs(actual - expected)).toBeLessThan(tolerance);
const bitmap = (page) => page.locator('#court').evaluate((canvas) => canvas.toDataURL());
const snapshot = (page) => page.evaluate(() => ({
  bitmap: document.querySelector('#court').toDataURL(),
  time: document.querySelector('#timer').textContent,
  player: document.querySelector('#player-score').textContent,
  cpu: document.querySelector('#cpu-score').textContent,
}));

async function start(page) {
  await page.locator('#start').click();
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'countdown');
  await page.clock.runFor(950); // Establish RAF timestamps before any fastForward.
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'playing');
  await expect(page.locator('#timer')).toHaveText('60');
  expect(await focus(page)).toBe('court');
}

async function paddle(page) {
  return page.locator('#court').evaluate((canvas, world) => {
    const pixels = canvas.getContext('2d').getImageData(0, Math.round(world.playerY / world.height * canvas.height), canvas.width, 1).data;
    let sum = 0; let count = 0;
    for (let x = 0; x < canvas.width; x += 1) {
      const p = x * 4;
      if (pixels[p] > 190 && pixels[p + 1] > 110 && pixels[p + 2] < 150) { sum += x; count += 1; }
    }
    if (!count) throw new Error('Player paddle is not drawn');
    return sum / count / canvas.width * world.width;
  }, WORLD);
}

async function board(page) {
  return page.locator('#court').evaluate((canvas, world) => {
    const ctx = canvas.getContext('2d');
    const colors = [[56, 107, 91], [239, 168, 102], [132, 195, 173]];
    return Array.from({ length: 36 }, (_, cell) => {
      const votes = [0, 0, 0];
      for (const [dx, dy] of [[20, 20], [66, 20], [20, 66], [66, 66]]) {
        const x = world.gridX + cell % 6 * world.cellSize + dx;
        const y = world.gridY + Math.floor(cell / 6) * world.cellSize + dy;
        const pixel = ctx.getImageData(Math.round(x / world.width * canvas.width), Math.round(y / world.height * canvas.height), 1, 1).data;
        const distances = colors.map((color) => color.reduce((sum, value, i) => sum + (value - pixel[i]) ** 2, 0));
        votes[distances.indexOf(Math.min(...distances))] += 1;
      }
      return votes.indexOf(Math.max(...votes));
    });
  }, WORLD);
}

async function point(page, x, y = WORLD.playerY) {
  const rect = await page.locator('#court').boundingBox();
  return { x: rect.x + x / WORLD.width * rect.width, y: rect.y + y / WORLD.height * rect.height };
}

async function mouseTo(page, x, y) {
  const p = await point(page, x, y);
  await page.mouse.move(p.x, p.y);
}

const capture = (page) => page.locator('#court').evaluate((canvas) => {
  for (let id = 0; id < 10; id += 1) if (canvas.hasPointerCapture(id)) return id;
  return null;
});

async function finish(page) {
  await page.clock.fastForward(62_000);
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'result');
  await expect(page.locator('#timer')).toHaveText('0');
  expect(await pending(page)).toBe(0);
}

test('solo intro → cue → exact deadline → immutable result → fresh rematch uses one RAF', async ({ page }) => {
  await open(page);
  await expect(page.locator('#intro-panel')).toContainText('挟んで反転');
  await expect(page.locator('#intro-panel')).toContainText('1人でCPUと60秒');
  await expect(page.locator('#pause')).toBeDisabled();
  await page.clock.runFor(4000);
  expect(await phase(page)).toBe('intro');
  await expect(page.locator('#timer')).toHaveText('60');
  await start(page);
  expect(await board(page)).toEqual([...Array(18).fill(2), ...Array(18).fill(1)]);
  await page.keyboard.down('ArrowLeft');
  await page.clock.fastForward(59_800);
  expect(await phase(page)).toBe('playing');
  await page.clock.runFor(300);
  expect(await phase(page)).toBe('result');
  const result = await snapshot(page);
  expect(result.time).toBe('0');
  const player = Number(await page.locator('#result-player').textContent());
  const cpu = Number(await page.locator('#result-cpu').textContent());
  expect(player + cpu).toBe(36);
  await expect(page.locator('#result-title')).toHaveText(player === cpu ? '引き分け！' : player > cpu ? 'あなたの勝ち！' : 'CPUの勝ち！');
  expect(await focus(page)).toBe('replay');
  expect(await pending(page)).toBe(0);
  await page.clock.runFor(5000);
  await page.keyboard.press('ArrowRight');
  expect(await snapshot(page)).toEqual(result);
  await page.locator('#replay').click();
  expect(await phase(page)).toBe('countdown');
  await expect(page.locator('#timer')).toHaveText('60');
  await expect(page.locator('#player-score')).toHaveText('18');
  await expect(page.locator('#cpu-score')).toHaveText('18');
  await page.clock.runFor(1100);
  near(await paddle(page), 300); // ArrowLeft was still physically held at the previous deadline.
  await page.keyboard.up('ArrowLeft');
  await page.locator('#start').dispatchEvent('click'); // Delayed obsolete start cannot spawn another loop.
  await page.clock.runFor(100);
  expect(await page.evaluate(() => ({ max: day070Test.raf.max, pending: day070Test.raf.pending.size }))).toEqual({ max: 1, pending: 1 });
});

test('arrow/A/D holds, release, opposite keys and modified shortcuts operate the drawn paddle', async ({ page }) => {
  await open(page); await start(page);
  await page.keyboard.down('ArrowRight'); await page.clock.runFor(120);
  const right = await paddle(page); expect(right).toBeGreaterThan(360); expect(right).toBeLessThan(420);
  await page.keyboard.up('ArrowRight'); await page.clock.runFor(160); near(await paddle(page), right);
  await page.keyboard.down('a'); await page.clock.runFor(110);
  const left = await paddle(page); expect(left).toBeLessThan(right - 55);
  await page.keyboard.down('d'); await page.clock.runFor(110); near(await paddle(page), left);
  await page.keyboard.up('a'); await page.clock.runFor(110); expect(await paddle(page)).toBeGreaterThan(left + 55);
  await page.keyboard.up('d');
  const before = await paddle(page);
  await page.keyboard.down('Control'); await page.keyboard.down('a'); await page.clock.runFor(110);
  await page.keyboard.up('a'); await page.keyboard.up('Control'); near(await paddle(page), before);
});

test('native capture maps CSS coordinates, clamps, releases and rejects other pointers; Chromium also drags real touch', async ({ page, browserName, context }) => {
  await open(page); await start(page);
  await mouseTo(page, 280); await page.mouse.down(); await mouseTo(page, 420); near(await paddle(page), 420);
  await mouseTo(page, 800, 500); near(await paddle(page), 502); await page.mouse.up();
  await mouseTo(page, 150); near(await paddle(page), 502);
  await mouseTo(page, 300); await page.mouse.down();
  const id = await capture(page); expect(id).not.toBeNull();
  await page.locator('#court').evaluate((canvas, pointerId) => {
    canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: pointerId + 30, isPrimary: false, clientX: 1, bubbles: true }));
  }, id);
  near(await paddle(page), 300);
  await page.locator('#court').dispatchEvent('pointercancel', { pointerId: id });
  await mouseTo(page, 420); near(await paddle(page), 300); await page.mouse.up();
  await mouseTo(page, 300); await page.mouse.down(); await mouseTo(page, 301);
  const nextId = await capture(page); expect(nextId).not.toBeNull();
  await page.locator('#court').evaluate((canvas, pointerId) => canvas.releasePointerCapture(pointerId), nextId);
  await mouseTo(page, 450); near(await paddle(page), 301); await page.mouse.up();
  if (browserName === 'chromium') {
    const cdp = await context.newCDPSession(page);
    const touch = async (x) => ({ ...await point(page, x), id: 1 });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [await touch(250)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [await touch(440)] }); near(await paddle(page), 440);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.clock.runFor(100); near(await paddle(page), 440);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [await touch(350)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await page.clock.runFor(100); near(await paddle(page), 350);
    await cdp.detach();
  }
});

test('partial countdown and playing pause freeze all drawn state; resume clears held inputs and paused time', async ({ page }) => {
  await open(page); await page.locator('#start').click(); await page.clock.runFor(200);
  await page.locator('#pause').click(); expect(await phase(page)).toBe('paused'); expect(await focus(page)).toBe('resume');
  let frozen = await snapshot(page); await page.clock.runFor(7000); expect(await snapshot(page)).toEqual(frozen); expect(await pending(page)).toBe(0);
  await page.locator('#resume').click(); expect(await focus(page)).toBe('court'); await page.clock.runFor(400); expect(await phase(page)).toBe('countdown');
  await page.clock.runFor(500); expect(await phase(page)).toBe('playing'); await expect(page.locator('#timer')).toHaveText('60');
  await page.keyboard.down('ArrowRight'); await page.clock.runFor(100);
  await page.locator('#pause').click(); frozen = await snapshot(page); const held = await paddle(page);
  await page.clock.runFor(15000); expect(await snapshot(page)).toEqual(frozen); expect(await pending(page)).toBe(0);
  await page.locator('#resume').click(); await page.clock.runFor(100); near(await paddle(page), held);
  await expect(page.locator('#timer')).toHaveText(frozen.time); await page.keyboard.up('ArrowRight');
  await page.clock.runFor(1100); expect(Number(await page.locator('#timer').textContent())).toBeLessThan(Number(frozen.time));
});

test('help/share pause, close and Escape restore the clicked origin, and close never resumes play', async ({ page, browserName }) => {
  await open(page); await start(page);
  await page.locator('#help .help-icon').click(); expect(await phase(page)).toBe('paused');
  const frozen = await snapshot(page); await page.keyboard.down('ArrowLeft'); await page.clock.runFor(4000); await page.keyboard.up('ArrowLeft');
  expect(await snapshot(page)).toEqual(frozen);
  await page.locator('#help-dialog [data-close]').click(); expect(await focus(page)).toBe('help'); expect(await phase(page)).toBe('paused');
  await page.clock.runFor(1000); expect(await snapshot(page)).toEqual(frozen);
  await page.locator('#help').click();
  expect(await page.evaluate(() => { document.querySelector('#help-dialog [data-close]').click(); return document.activeElement.id; })).toBe('help');
  await page.locator('#resume').click(); await page.clock.runFor(100);
  await page.locator('#share-open span').click(); expect(await phase(page)).toBe('paused');
  await page.keyboard.press('Escape'); await expect(page.locator('#share-dialog')).not.toBeVisible();
  expect(await focus(page)).toBe('share-open'); expect(await phase(page)).toBe('paused');
  await page.locator('#resume').click();
  await page.keyboard.press(browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab');
  expect(await focus(page)).toBe('pause');
  const outline = await page.locator('#pause').evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(outline).not.toBe('none');
});

test('blur and hidden lifecycle event integration freeze the whole match and require manual resume', async ({ page }) => {
  await open(page); await start(page);
  await page.keyboard.down('d'); await page.clock.runFor(80);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect(await phase(page)).toBe('paused'); const blurred = await snapshot(page); const x = await paddle(page);
  await page.clock.runFor(9000); expect(await snapshot(page)).toEqual(blurred);
  await page.evaluate(() => window.dispatchEvent(new Event('focus'))); expect(await phase(page)).toBe('paused');
  await page.locator('#resume').click(); await page.clock.runFor(100); near(await paddle(page), x); await page.keyboard.up('d');
  const beforeHidden = await snapshot(page);
  // Explicit lifecycle integration only. Headless tab switching does not establish OS visibility on every host.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange')); delete document.hidden;
  });
  expect(await phase(page)).toBe('paused'); await page.clock.runFor(5000); expect(await snapshot(page)).toEqual(beforeHidden);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); expect(await phase(page)).toBe('paused');
  await page.locator('#resume').click(); await page.clock.runFor(1100); expect(await phase(page)).toBe('playing');
});

test('CPU rally, player return and misses advance through the UI and keep territory-only scores', async ({ page }) => {
  await open(page); await start(page);
  await mouseTo(page, 300); await page.mouse.down();
  const events = []; let previous = '';
  for (let tick = 0; tick < 100; tick += 1) {
    const ball = await page.locator('#court').evaluate((canvas) => {
      const w = canvas.width; const h = canvas.height;
      const data = canvas.getContext('2d').getImageData(0, 0, w, h).data;
      const seen = new Uint8Array(w * h);
      const white = (i) => data[i * 4] > 245 && data[i * 4 + 1] > 235 && data[i * 4 + 2] > 210;
      let best = null;
      for (let i = 0; i < w * h; i += 1) {
        if (seen[i] || !white(i)) continue;
        const queue = [i]; seen[i] = 1;
        let n = 0; let sx = 0; let sy = 0; let minX = w; let maxX = 0; let minY = h; let maxY = 0;
        for (let head = 0; head < queue.length; head += 1) {
          const at = queue[head]; const x = at % w; const y = Math.floor(at / w);
          n += 1; sx += x; sy += y; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          for (const next of [at - 1, at + 1, at - w, at + w]) {
            if (next >= 0 && next < w * h && !seen[next] && white(next) && Math.abs(next % w - x) <= 1) { seen[next] = 1; queue.push(next); }
          }
        }
        const width = (maxX - minX + 1) / w * 600; const height = (maxY - minY + 1) / h * 760;
        if (width >= 8 && width < 25 && height >= 8 && height < 25 && n > 15 && (!best || n > best.n)) best = { x: sx / n / w * 600, y: sy / n / h * 760, n };
      }
      return best;
    });
    if (ball && ball.y > 440) await mouseTo(page, ball.x);
    await page.clock.runFor(80);
    const text = await page.locator('#feedback').textContent();
    if (text !== previous) { previous = text; events.push(text); }
    if (events.filter((event) => event.startsWith('自分の着地')).length >= 2) break;
  }
  await page.mouse.up();
  expect(events.some((event) => event.startsWith('CPUの着地'))).toBe(true);
  expect(events.filter((event) => event.startsWith('自分の着地')).length).toBeGreaterThanOrEqual(2);
  expect(events.some((event) => /\d+マス反転 \/ \d+マス変化/.test(event))).toBe(true);
  const cells = await board(page);
  await expect(page.locator('#player-score')).toHaveText(String(cells.filter((owner) => owner === 1).length));
  await expect(page.locator('#cpu-score')).toHaveText(String(cells.filter((owner) => owner === 2).length));
  await mouseTo(page, 98); await page.mouse.down(); await page.mouse.up();
  let miss = false;
  for (let tick = 0; tick < 160; tick += 1) {
    await page.clock.runFor(80);
    if ((await page.locator('#feedback').textContent()).includes('がミス')) { miss = true; break; }
  }
  expect(miss, 'A missed return must be observable').toBe(true);
  const afterMiss = await board(page); await page.clock.runFor(400); expect(await board(page)).toEqual(afterMiss);
  await page.clock.runFor(2600); await expect(page.locator('#feedback')).toContainText('の着地'); expect(await phase(page)).toBe('playing');
});

test('360/390/768/1440 and both landscape sizes preserve the court, state, coordinate mapping and usable controls', async ({ page }) => {
  await open(page);
  const sizes = [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }, { width: 844, height: 390 }, { width: 640, height: 360 }];
  const layout = async (state) => {
    const data = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      court: document.querySelector('#court').getBoundingClientRect().toJSON(),
      buttons: [...document.querySelectorAll('button')].filter((button) => button.checkVisibility()).map((button) => ({ id: button.id, width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })),
      panel: document.querySelector('.state-panel:not([hidden])')?.getBoundingClientRect().toJSON(),
    }));
    expect(data.overflow, `${state} horizontal overflow`).toBe(false);
    expect(data.court.width).toBeGreaterThan(200); expect(data.court.x).toBeGreaterThanOrEqual(0);
    expect(data.court.right).toBeLessThanOrEqual((await page.viewportSize()).width + 1);
    for (const button of data.buttons) { expect(button.width, `${state} ${button.id} width`).toBeGreaterThanOrEqual(44); expect(button.height, `${state} ${button.id} height`).toBeGreaterThanOrEqual(44); }
    if (data.panel && (await page.viewportSize()).height <= 390) {
      expect(data.panel.top).toBeGreaterThanOrEqual(0); expect(data.panel.bottom).toBeLessThanOrEqual((await page.viewportSize()).height + 1);
    }
  };
  for (const size of sizes) { await page.setViewportSize(size); await layout('intro'); }
  await page.setViewportSize({ width: 390, height: 844 }); await start(page);
  await page.clock.runFor(1300);
  const cells = await board(page); const time = await page.locator('#timer').textContent();
  for (const size of sizes) {
    await page.setViewportSize(size); await layout('playing'); expect(await board(page)).toEqual(cells); await expect(page.locator('#timer')).toHaveText(time);
    await mouseTo(page, 200); await page.mouse.down(); await mouseTo(page, 400);
    const input = await page.evaluate(() => day070Test.pointer);
    // Native mouse coordinates may be rounded by the browser; compare the actual delivered position.
    near(await paddle(page), input.worldX, Math.max(4, 600 / input.width)); await page.mouse.up();
  }
  await page.locator('#pause').click();
  for (const size of sizes) { await page.setViewportSize(size); await layout('pause'); }
  await page.locator('#resume').click(); await page.clock.runFor(100); await finish(page);
  for (const size of sizes) {
    await page.setViewportSize(size); await layout('result'); await page.locator('#result-share').click();
    const dialog = await page.locator('#share-dialog').boundingBox(); expect(dialog.x).toBeGreaterThanOrEqual(0); expect(dialog.x + dialog.width).toBeLessThanOrEqual(size.width + 1);
    for (const button of await page.locator('#share .share__button').all()) { const rect = await button.boundingBox(); expect(rect.width).toBeGreaterThanOrEqual(44); expect(rect.height).toBeGreaterThanOrEqual(44); }
    await page.locator('#share-dialog [data-close]').click(); expect(await focus(page)).toBe('result-share');
  }
});

test('canonical metadata, X/LINE, clipboard success/fallback/failure and native cancel/failure/retry preserve the result', async ({ page }) => {
  await open(page); await start(page); await finish(page); const result = await snapshot(page);
  const head = await page.evaluate(() => ({ canonical: document.querySelector('link[rel="canonical"]').href, title: document.title, description: document.querySelector('meta[name="description"]').content, ogTitle: document.querySelector('meta[property="og:title"]').content, ogDescription: document.querySelector('meta[property="og:description"]').content, ogImage: document.querySelector('meta[property="og:image"]').content, ogUrl: document.querySelector('meta[property="og:url"]').content }));
  expect(head.canonical).toBe(CANONICAL); expect(head.ogUrl).toBe(CANONICAL); expect(head.ogTitle).toBe(head.title); expect(head.ogDescription).toBe(head.description); expect(head.ogImage).toBe(`${CANONICAL}og.png`);
  await page.locator('#result-share').click();
  const x = new URL(await page.getByRole('link', { name: 'Xで投稿', exact: true }).getAttribute('href'));
  const line = new URL(await page.getByRole('link', { name: 'LINEで送る', exact: true }).getAttribute('href'));
  expect(x.origin).toBe('https://x.com'); expect(x.pathname).toBe('/intent/post'); expect(x.searchParams.get('url')).toBe(CANONICAL); expect(x.searchParams.get('text')).toContain('フリップコート');
  expect(line.origin).toBe('https://social-plugins.line.me'); expect(line.searchParams.get('url')).toBe(CANONICAL);
  const copy = page.getByRole('button', { name: 'リンクをコピー', exact: true });
  await copy.click(); await expect(page.locator('.share__said')).toHaveText('コピーしました'); expect(await page.evaluate(() => day070Test.copies)).toEqual([CANONICAL]);
  await page.evaluate(() => { day070Test.copyMode = 'fail'; day070Test.fallbackOk = true; });
  await copy.click(); await expect(page.locator('.share__said')).toHaveText('コピーしました');
  await page.evaluate(() => { day070Test.fallbackOk = false; });
  await copy.click(); await expect(page.locator('.share__said')).toContainText('URLを選んでコピー');
  expect(await page.evaluate(() => day070Test.fallback)).toEqual(['copy', 'copy']);
  await expect(page.locator('#share-url')).toHaveValue(CANONICAL); await expect(page.locator('#share-url')).toHaveAttribute('readonly', '');
  await page.locator('#share-url').click(); await page.keyboard.press('ControlOrMeta+A');
  expect(await page.locator('#share-url').evaluate((input) => [input.selectionStart, input.selectionEnd])).toEqual([0, CANONICAL.length]);
  for (const mode of ['abort', 'fail', 'ok']) {
    await page.evaluate((value) => { day070Test.nativeMode = value; }, mode);
    await page.getByRole('button', { name: '共有…', exact: true }).click();
    await page.clock.runFor(20); expect(await snapshot(page)).toEqual(result); await expect(copy).toBeEnabled();
  }
  expect(await page.evaluate(() => day070Test.native.map((data) => data.url))).toEqual([CANONICAL, CANONICAL, CANONICAL]);
  await page.evaluate(() => { day070Test.copyMode = 'ok'; }); await copy.click(); await expect(page.locator('.share__said')).toHaveText('コピーしました');
  await page.locator('#share-dialog [data-close]').click(); expect(await phase(page)).toBe('result'); expect(await snapshot(page)).toEqual(result);
});

test('without native share, links/copy remain available and the loaded CPU game completes offline', async ({ page, context }) => {
  await open(page, { native: false }); await page.locator('#share-open').click();
  await expect(page.getByRole('button', { name: '共有…', exact: true })).toHaveCount(0);
  await expect(page.locator('#share a')).toHaveCount(2); await expect(page.getByRole('button', { name: 'リンクをコピー', exact: true })).toBeEnabled();
  await page.locator('#share-dialog [data-close]').click(); await context.setOffline(true);
  await start(page); await finish(page); await page.locator('#replay').click(); await page.clock.runFor(1100); expect(await phase(page)).toBe('playing');
});

for (const canvasFailure of ['null', 'throw']) {
  test(`Canvas ${canvasFailure} shows an actionable alert, blocks start and keeps help usable`, async ({ page }) => {
    await open(page, { canvasFailure });
    await expect(page.locator('#start')).toBeDisabled(); await expect(page.locator('#unsupported')).toBeVisible();
    await expect(page.locator('#unsupported')).toContainText('再読み込み'); await expect(page.locator('#unsupported')).toContainText('別のブラウザー');
    await page.locator('#start').dispatchEvent('click'); expect(await phase(page)).toBe('intro'); expect(await pending(page)).toBe(0);
    await page.locator('#help').click(); await expect(page.locator('#help-dialog')).toBeVisible();
    await page.locator('#help-dialog [data-close]').click(); expect(await focus(page)).toBe('help');
  });
}

test('reduced motion keeps gameplay and controls while removing decorative transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await open(page); await start(page);
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  const duration = await page.locator('#start').evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(duration.split(',').every((value) => parseFloat(value) <= 0.001)).toBe(true);
  await page.keyboard.down('ArrowRight'); await page.clock.runFor(100); await page.keyboard.up('ArrowRight'); expect(await paddle(page)).toBeGreaterThan(350);
  await page.clock.runFor(1500); await expect(page.locator('#feedback')).toContainText('の着地');
  await page.locator('#pause').click(); const frozen = await bitmap(page); await page.clock.runFor(1000); expect(await bitmap(page)).toBe(frozen);
});

for (const transition of ['rematch', 'resume']) {
  test(`held key auto-repeat cannot revive input after ${transition}`, async ({ page }) => {
    await open(page); await start(page);
    await page.keyboard.down('ArrowRight'); await page.clock.runFor(80);
    if (transition === 'rematch') {
      await finish(page); await page.locator('#replay').click(); await page.clock.runFor(1100);
    } else {
      await page.locator('#pause').click(); await page.locator('#resume').click(); await page.clock.runFor(100);
    }
    const before = await paddle(page);
    await page.keyboard.down('ArrowRight'); // The same physical key remains down: Playwright emits repeat=true.
    const key = await page.evaluate(() => day070Test.lastKey);
    expect(key).toEqual({ code: 'ArrowRight', repeat: true });
    await page.clock.runFor(100);
    const after = await paddle(page);
    await test.info().attach('held-key-repeat', { body: JSON.stringify({ transition, key, before, after }), contentType: 'application/json' });
    near(after, before);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.down('ArrowRight'); await page.clock.runFor(80); await page.keyboard.up('ArrowRight');
    expect(await paddle(page)).toBeGreaterThan(before + 40);
  });
}
