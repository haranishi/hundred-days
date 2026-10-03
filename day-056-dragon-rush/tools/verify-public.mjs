// 公開入口から実ゲームを起動し、配信と同じCSPで3体とworkletを確認する。
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const repo = fileURLToPath(new URL('../../', import.meta.url));
const app = 'day-056-dragon-rush';
const out = resolve(repo, '.social-output/day056-verification');
const require = createRequire(resolve(repo, 'package.json'));
const { chromium } = require('playwright');
const url = process.env.PUBLIC_VERIFY_URL || 'http://127.0.0.1:5310';
let server;
if (!process.env.PUBLIC_VERIFY_URL) {
  server = spawn(process.execPath, ['scripts/serve-dist.mjs'], {
    cwd: repo, env: { ...process.env, PLAYWRIGHT_PORT: '5310' }, stdio: ['ignore', 'pipe', 'inherit']
  });
  await new Promise((resolve, reject) => {
    server.stdout.once('data', resolve); server.once('error', reject); server.once('exit', code => reject(new Error(`server ${code}`)));
  });
}
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
await mkdir(out, { recursive: true });
try {
  const headers = await readFile(resolve(repo, 'dist/_headers'), 'utf8');
  const block = headers.split(`/${app}/*`)[1]?.split('\n\n')[0];
  const policy = block?.match(/Content-Security-Policy: (.+)/)?.[1];
  if (!policy) throw new Error('生成されたCSPが見つかりません');
  const results = [];
  for (const creature of ['kurenai', 'raiyoku', 'homuratsuno']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    if (!process.env.PUBLIC_VERIFY_URL) await context.route(`**/${app}/**`, async route => {
      const response = await route.fetch();
      await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': policy } });
    });
    const page = await context.newPage();
    const errors = [], hosts = new Set();
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('request', r => { if (/^https?:/.test(r.url())) hosts.add(new URL(r.url()).origin); });
    await page.goto(`${url}/${app}/?creature=${creature}&playtest=basic`);
    await page.screenshot({ path: resolve(out, `landing-${creature}.png`) });
    await page.locator('#start').click();
    await page.waitForFunction(() => window.__appError || window.__state?.phase === 'playing', null, { timeout: 180_000 });
    await page.waitForTimeout(4500);
    const state = await page.evaluate(() => ({ ready: window.__appReady, error: window.__appError ?? null,
      phase: window.__state?.phase, creature: window.__state?.creature, t: window.__state?.t,
      gpu: window.__app?.gpu, limiter: window.__audioLog?.limiter,
      cardImages: [...document.querySelectorAll('.dr-card-art')].map(n => n.style.getPropertyValue('--dr-art')) }));
    await page.screenshot({ path: resolve(out, `playing-${creature}.png`) });
    if (state.error || errors.length || state.phase !== 'playing' || state.limiter !== 'worklet')
      throw new Error(JSON.stringify({ creature, state, errors }));
    if (hosts.size !== 1 || !hosts.has(new URL(url).origin)) throw new Error('想定外の外部通信');
    results.push({ creature, ...state, errors, hosts: [...hosts] });
    console.log(`${creature}: playing / limiter=worklet / errors=0 / ${state.gpu}`);
    await context.unrouteAll({ behavior: 'wait' });
    await context.close();
  }
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await mobile.newPage(); await page.goto(`${url}/${app}/`);
  await page.screenshot({ path: resolve(out, 'landing-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'このアプリを共有する', exact: true }).click();
  await page.screenshot({ path: resolve(out, 'share-mobile.png') });
  await writeFile(resolve(out, 'results.json'), JSON.stringify({ policy, results }, null, 2) + '\n');
  await mobile.close();
} finally { await browser.close(); server?.kill('SIGTERM'); }
