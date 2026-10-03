// 遅延する通信と実rendererで確認する。ゲーム状態を書き換えない。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const repo = fileURLToPath(new URL('../../', import.meta.url));
const { chromium, webkit } = createRequire(resolve(repo, 'day-056-dragon-rush/source/package.json'))('playwright');
const engine = process.env.LOADING_BROWSER || 'chromium';
const port = process.env.LOADING_VERIFY_PORT || '5359';
const url = process.env.PUBLIC_VERIFY_URL || `http://127.0.0.1:${port}`;
const out = resolve(repo, `.social-output/day056-loading-${engine}`);
await mkdir(out, { recursive: true });
let server, browser, context;
const releases = [];
const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); console.log(`PASS ${name}`); };
const gate = () => { let release; const promise = new Promise(resolve => { release = resolve; }); releases.push(release); return { promise, release }; };
try {
  if (!process.env.PUBLIC_VERIFY_URL) {
    server = spawn(process.execPath, ['scripts/serve-dist.mjs'], { cwd: repo,
      env: { ...process.env, PLAYWRIGHT_PORT: port }, stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise((done, reject) => { server.stdout.once('data', done); server.once('error', reject);
      server.once('exit', code => reject(new Error(`server ${code}`))); });
  }
  browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true,
    ...(engine === 'chromium' ? { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] } : {}) });
  context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const policy = (await readFile(resolve(repo, 'dist/_headers'), 'utf8'))
    .split('/day-056-dragon-rush/*')[1]?.split('\n\n')[0]?.match(/Content-Security-Policy: (.+)/)?.[1];
  assert.ok(policy);
  if (!process.env.PUBLIC_VERIFY_URL) await context.route('**/day-056-dragon-rush/**', async route => {
    // CSPは文書に付ける。素材の通信までfetch/fulfillで複製しない。
    if (route.request().resourceType() !== 'document') return route.continue();
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': policy } });
  });
  const page = await context.newPage(), errors = [], hosts = new Set();
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (/^https?:/.test(request.url())) hosts.add(new URL(request.url()).origin); });
  const entry = gate(), first = gate(), second = gate();
  await page.route('**/game/entry.json', async route => { await entry.promise; await route.fallback(); });
  await page.route('**/game/assets/dragon.glb', async route => { await first.promise; await route.fallback(); });
  await page.route('**/game/assets/raiyoku.glb', async route => { await second.promise; await route.fallback(); });
  const loading = page.getByTestId('loading-screen');
  const phase = value => page.waitForFunction(value => window.__state?.phase === value, value, { timeout: 180_000 });
  await page.goto(`${url}/day-056-dragon-rush/?speed=16`);
  await page.locator('#start').click(); await loading.waitFor({ state: 'visible' });
  check('entry pending: 0 of 5 steps', await loading.locator('progress').evaluate(node => node.value === 0 && node.max === 5));
  for (const [width, height] of [[390, 844], [768, 1024], [1440, 900], [667, 375], [844, 390]]) {
    await page.setViewportSize({ width, height });
    check(`loading within viewport ${width}x${height}`, await loading.locator('.dr-load-panel').evaluate(node => {
      const rect = node.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight;
    }));
    await page.screenshot({ path: resolve(out, `initial-${width}.png`) });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  check('reduced motion disables spinner', await loading.locator('.dr-load-spinner').evaluate(node => getComputedStyle(node).animationName === 'none'));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.keyboard.press('Tab');
  check('focus stays in loading', await loading.evaluate(node => node === document.activeElement));
  entry.release();
  await page.waitForFunction(() => document.querySelector('#boot-status progress')?.value === 2, null, { timeout: 60_000 });
  await page.waitForTimeout(1200);
  check('model pending: stays visible at 2 of 5', await loading.isVisible() && await loading.locator('progress').evaluate(node => node.value === 2));
  await page.screenshot({ path: resolve(out, 'model-pending.png') });
  first.release(); await phase('ready'); await loading.waitFor({ state: 'hidden' });
  check('initial load closes after controls and frame', await page.evaluate(() => Boolean(window.__appReady && window.__input && window.__app && !document.querySelector('#app').inert)));
  const before = await page.evaluate(() => localStorage.getItem('dragon-rampage.prefs'));
  await page.locator('[data-testid="creature-cards"] [data-creature="raiyoku"]').click();
  await loading.waitFor({ state: 'visible' }); await page.waitForTimeout(1000);
  check('switch model pending: 0 of 3 steps', await loading.locator('progress').evaluate(node => node.value === 0 && node.max === 3));
  check('old creature and preference remain until loaded', await page.evaluate(before => window.__state.creature.id === 'kurenai' && localStorage.getItem('dragon-rampage.prefs') === before, before));
  check('underlying controls inert', await page.locator('[data-testid="creature-cards"]').evaluate(node => Boolean(node.closest('[inert]'))));
  await page.keyboard.press('Digit3');
  check('keyboard cannot change creature during loading', await page.evaluate(() => window.__state.creature.id === 'kurenai'));
  await page.screenshot({ path: resolve(out, 'switch-pending.png') });
  second.release(); await phase('playing'); await loading.waitFor({ state: 'hidden' });
  check('new creature ready and preference committed', await page.evaluate(() => window.__state.creature.id === 'raiyoku' && JSON.parse(localStorage.getItem('dragon-rampage.prefs')).creature === 'raiyoku'));
  await phase('result');
  await page.locator('[data-testid="result-cards"] [data-creature="homuratsuno"]').click();
  await loading.waitFor({ state: 'visible' }); await phase('playing'); await loading.waitFor({ state: 'hidden' });
  check('result selection prepares city and switches third creature', await page.evaluate(() => window.__state.creature.id === 'homuratsuno' && window.__state.elapsed < 5));
  await page.getByRole('button', { name: '一時停止', exact: true }).click(); await phase('paused');
  await page.waitForLoadState('networkidle', { timeout: 60_000 });
  const gl = await page.evaluate(() => window.__app.renderer.getContext().getError());
  check('WebGL error = 0', gl === 0);
  check('normal loading and switching have no page/console errors', errors.length === 0);
  check('requests same origin', hosts.size === 1 && hosts.has(new URL(url).origin));
  // 本体取得の失敗は別ページで発生させ、正常操作のエラーと分けて記録する。
  const failed = await context.newPage();
  await failed.route('**/game/entry.json', route => route.fulfill({ status: 503, body: '' }));
  await failed.goto(`${url}/day-056-dragon-rush/`); await failed.locator('#start').click();
  await failed.waitForFunction(() => document.querySelector('#boot-status')?.dataset.phase === 'error');
  check('failure visible and reload focused', await failed.locator('.dr-load-reload').evaluate(node => !node.hidden && node === document.activeElement));
  await failed.screenshot({ path: resolve(out, 'error.png') });
  await failed.locator('.dr-load-reload').click();
  check('reload returns to usable landing', await failed.locator('#start').isEnabled());
  const switchFailed = await context.newPage();
  const failureErrors = [];
  const failedPreload = gate();
  switchFailed.on('pageerror', error => failureErrors.push(String(error)));
  // 背景の先読みで事前にcatchされないよう、前のモデルの先読みを止める。
  await switchFailed.route('**/game/assets/raiyoku.glb', async route => { await failedPreload.promise; await route.fallback(); });
  await switchFailed.route('**/game/assets/homuratsuno.glb', route => route.fulfill({ status: 503, body: '' }));
  await switchFailed.goto(`${url}/day-056-dragon-rush/?creature=kurenai`);
  await switchFailed.locator('#start').click();
  await switchFailed.waitForFunction(() => window.__state?.phase === 'ready', null, { timeout: 180_000 });
  await switchFailed.getByTestId('loading-screen').waitFor({ state: 'hidden' });
  const saved = await switchFailed.evaluate(() => localStorage.getItem('dragon-rampage.prefs'));
  await switchFailed.locator('[data-testid="creature-cards"] [data-creature="homuratsuno"]').click();
  await switchFailed.waitForFunction(() => document.querySelector('#boot-status')?.dataset.phase === 'error');
  check('failed creature switch preserves old creature and saved preference', await switchFailed.evaluate(saved => window.__state.creature.id === 'kurenai' && localStorage.getItem('dragon-rampage.prefs') === saved, saved));
  check(`failed switch offers reload without unhandled exception: ${JSON.stringify(failureErrors)}`, await switchFailed.locator('.dr-load-reload').isVisible() && failureErrors.length === 0);
  await switchFailed.screenshot({ path: resolve(out, 'switch-error.png') });
  failedPreload.release();
  await switchFailed.waitForLoadState('networkidle', { timeout: 60_000 });
  await writeFile(resolve(out, 'results.json'), JSON.stringify({ engine, url, checks, errors, hosts: [...hosts], gl }, null, 2) + '\n');
} finally {
  for (const release of releases) release();
  for (const page of context?.pages() ?? []) await page.unrouteAll({ behavior: 'wait' });
  await context?.unrouteAll({ behavior: 'wait' });
  await browser?.close(); server?.kill('SIGTERM');
}
