// 公開入口と実rendererを使う。Chromiumは実タッチ、WebKitは実ポインタ操作で確認する。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const repo = fileURLToPath(new URL('../../', import.meta.url));
const { chromium, webkit } = createRequire(resolve(repo, 'day-056-dragon-rush/source/package.json'))('playwright');
const engine = process.env.MOBILE_BROWSER || 'chromium';
const port = process.env.MOBILE_VERIFY_PORT || '5356';
const url = process.env.PUBLIC_VERIFY_URL || `http://127.0.0.1:${port}`;
const out = resolve(repo, `.social-output/day056-mobile-${engine}`);
await mkdir(out, { recursive: true });
let server;
if (!process.env.PUBLIC_VERIFY_URL) {
  server = spawn(process.execPath, ['scripts/serve-dist.mjs'], { cwd: repo,
    env: { ...process.env, PLAYWRIGHT_PORT: port }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((done, reject) => { server.stdout.once('data', done); server.once('error', reject);
    server.once('exit', code => reject(new Error(`server ${code}`))); });
}
let browser, context;
try {
  browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true,
    ...(engine === 'chromium' ? { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] } : {}) });
  context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const policy = (await readFile(resolve(repo, 'dist/_headers'), 'utf8'))
    .split('/day-056-dragon-rush/*')[1]?.split('\n\n')[0]?.match(/Content-Security-Policy: (.+)/)?.[1];
  assert.ok(policy);
  if (!process.env.PUBLIC_VERIFY_URL) await context.route('**/day-056-dragon-rush/**', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': policy } });
  });
  const page = await context.newPage();
  const cdp = engine === 'chromium' ? await context.newCDPSession(page) : null;
  const viewport = async size => {
    await page.setViewportSize(size);
    if (cdp) await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  };
  const errors = [], hosts = new Set();
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') { errors.push(m.text()); console.log(`BROWSER ERROR ${m.text()}`); } });
  page.on('request', r => { if (/^https?:/.test(r.url())) hosts.add(new URL(r.url()).origin); });
  const phase = value => page.waitForFunction(p => window.__state?.phase === p, value, { timeout: 180_000 });
  const state = () => page.evaluate(() => window.__state);
  const check = (name, condition) => { assert.ok(condition, name); console.log(`PASS ${name}`); };
  await page.goto(`${url}/day-056-dragon-rush/`);
  for (const [width, height] of [[390, 844], [768, 1024], [1440, 900]]) {
    await viewport({ width, height });
    check(`landing width ${width}`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: resolve(out, `landing-${width}.png`), fullPage: true });
  }
  await viewport({ width: 844, height: 390 });
  await page.locator('#start').click();
  await phase('ready');
  await page.locator('#boot-status').waitFor({ state: 'hidden' });
  const device = await page.evaluate(() => ({ quality: window.__app.settings.quality,
    coarse: matchMedia('(pointer: coarse)').matches, touches: navigator.maxTouchPoints, classes: document.body.className }));
  console.log(JSON.stringify(device));
  check('mobile low quality', device.quality === 'low');
  await page.screenshot({ path: resolve(out, 'ready.png') });
  check('start panel does not overlap cards', await page.evaluate(() => {
    const panel = document.querySelector('.dr-start').getBoundingClientRect();
    const cards = document.querySelector('.dr-start-dock').getBoundingClientRect();
    return panel.bottom <= cards.top;
  }));
  await page.locator('[data-testid="creature-cards"] [data-creature="kurenai"]').click();
  await phase('playing');
  await page.locator('[data-testid="touch-controls"]').waitFor({ state: 'visible' });
  const points = new Map();
  async function down(id, selector, dx = 0, dy = 0) {
    await page.locator(selector).waitFor({ state: 'visible' });
    const rect = await page.locator(selector).boundingBox(); assert.ok(rect, selector);
    const point = { id, x: rect.x + rect.width / 2 + dx, y: rect.y + rect.height / 2 + dy, radiusX: 2, radiusY: 2 };
    if (cdp) { points.set(id, point); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [...points.values()] }); }
    else { await page.mouse.move(point.x, point.y); await page.mouse.down(); }
  }
  async function up(id, cancel = false) {
    if (cdp) { if (cancel) points.clear(); else points.delete(id);
      await cdp.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [...points.values()] }); }
    else await page.mouse.up();
  }
  const before = await state();
  await down(1, '[data-touch="move"]', 0, -40);
  if (cdp) await down(2, '[data-touch="breath"]');
  await page.waitForTimeout(2000);
  const moving = await state();
  check('movement changes position', Math.hypot(moving.dragon.x - before.dragon.x, moving.dragon.z - before.dragon.z) > 1);
  if (cdp) check('movement + attack simultaneously', moving.events['dragon.breath.start'] > (before.events['dragon.breath.start'] || 0));
  await up(1, true);
  await page.waitForTimeout(500);
  check('cancel releases held UI', await page.locator('.is-held').count() === 0);
  for (const id of ['breath', 'claw', 'tail', 'ascend', 'descend', 'sprint', 'special']) {
    await down(3, `[data-touch="${id}"]`); await page.waitForTimeout(450); await up(3);
    await page.waitForTimeout(120);
  }
  const priorLook = await page.evaluate(() => window.__app.camera.quaternion.toArray());
  await down(4, '[data-touch="look"]');
  if (cdp) { points.get(4).x += 45; await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [...points.values()] }); }
  else await page.mouse.move((await page.locator('[data-touch="look"]').boundingBox()).x + 90, 100, { steps: 4 });
  await up(4); await page.waitForTimeout(200);
  const nextLook = await page.evaluate(() => window.__app.camera.quaternion.toArray());
  check('look changes camera', nextLook.some((value, i) => Math.abs(value - priorLook[i]) > 0.001));
  await page.screenshot({ path: resolve(out, 'playing-844.png') });
  await viewport({ width: 667, height: 375 });
  await page.screenshot({ path: resolve(out, 'playing-667.png') });
  check('44px targets and safe viewport', await page.locator('.dr-touch button:visible, [data-touch="move"], [data-touch="look"]').evaluateAll(nodes =>
    nodes.every(n => { const r = n.getBoundingClientRect(); return r.width >= 44 && r.height >= 44 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; })));
  await page.getByRole('button', { name: '一時停止', exact: true }).click(); await phase('paused');
  const elapsed = (await state()).elapsed; await page.waitForTimeout(900);
  check('pause freezes timer', (await state()).elapsed === elapsed);
  await page.locator('#game-links [data-share]').click(); await page.locator('#share-dialog').waitFor({ state: 'visible' });
  await page.screenshot({ path: resolve(out, 'share-paused.png') });
  await page.locator('#share-close').click();
  await page.getByRole('button', { name: '再開', exact: true }).click(); await phase('playing');
  await down(5, '[data-touch="breath"]');
  await viewport({ width: 390, height: 844 }); await phase('paused');
  if (cdp) { points.clear(); await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); }
  else await page.mouse.up();
  await page.locator('.dr-rotate').waitFor({ state: 'visible' });
  check('portrait clears held input', await page.locator('.is-held').count() === 0);
  await page.screenshot({ path: resolve(out, 'portrait-paused.png') });
  await viewport({ width: 844, height: 390 });
  await page.getByRole('button', { name: '再開', exact: true }).click(); await phase('playing');
  await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await phase('paused');
  check('blur pauses', (await state()).phase === 'paused');
  await page.getByRole('button', { name: 'やり直し', exact: true }).click(); await phase('playing');
  check('restart resets clock', (await state()).elapsed < 2);
  const results = [];
  // 既存の検証用URLで実シミュレーションを早回し。状態・スコアは直接書き換えない。
  // WebKitで旧ページの音読み込みを途中で破棄しない。試験の画面移動前に通信を待つ。
  await page.getByRole('button', { name: '一時停止', exact: true }).click(); await phase('paused');
  await page.waitForLoadState('networkidle', { timeout: 60_000 });
  check('normal play has no errors', errors.length === 0);
  await page.goto(`${url}/day-056-dragon-rush/?speed=16`);
  await page.locator('#start').click(); await phase('ready');
  await page.locator('#boot-status').waitFor({ state: 'hidden' });
  await page.locator('[data-testid="creature-cards"] [data-creature="kurenai"]').click(); await phase('playing');
  for (const creature of ['kurenai', 'raiyoku', 'homuratsuno']) {
    if (creature !== 'kurenai') {
      await page.locator(`[data-testid="result-cards"] [data-creature="${creature}"]`).click(); await phase('playing');
    }
    await down(8, '[data-touch="breath"]'); await page.waitForTimeout(1800); await up(8);
    await phase('result');
    const result = await state();
    check(`${creature} real result`, result.creature.id === creature && result.elapsed >= 180);
    results.push(result);
    await page.screenshot({ path: resolve(out, `result-${creature}.png`) });
  }
  const gl = await page.evaluate(() => window.__app.renderer.getContext().getError());
  await writeFile(resolve(out, 'results.json'), JSON.stringify({ engine, errors, hosts: [...hosts], gl, results }, null, 2) + '\n');
  check('WebGL error = 0', gl === 0);
  check('no console/page errors', errors.length === 0);
  check('same-origin requests only', hosts.size === 1 && hosts.has(new URL(url).origin));
} finally {
  await context?.unrouteAll({ behavior: 'wait' });
  await browser?.close(); server?.kill('SIGTERM');
}
