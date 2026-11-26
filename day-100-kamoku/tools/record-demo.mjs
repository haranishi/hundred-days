/* Day100 の一覧用の動画（demo.mp4・540×960）と画像（screenshot.webp・1200×750）を撮る。
   WASM は file:// で読めないので、組み立てた dist/ を HTTP で配って撮る（scripts/record-demo.mjs は使えない）。
   使い方: npm run build のあとに node day-100-kamoku/tools/record-demo.mjs
   Playwright・ffmpeg・cwebp が要る。撮ったら、動画と画像を目で確かめる。 */

import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const dayDir = join(root, 'day-100-kamoku');
const { chromium } = await import('@playwright/test');

const server = spawn(process.execPath, ['scripts/serve-dist.mjs'], { cwd: root, env: { ...process.env, PLAYWRIGHT_PORT: '0' } });
const origin = await new Promise((resolve, reject) => {
  server.stdout.on('data', (chunk) => {
    const found = String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/);
    if (found) resolve(found[0]);
  });
  server.on('exit', () => reject(new Error('配信用のサーバーが起動できません')));
});
const url = `${origin}/day-100-kamoku/`;
const work = mkdtempSync(join(tmpdir(), 'day100-demo-'));
const pause = (page, ms) => page.waitForTimeout(ms);
const base = { locale: 'ja-JP', timezoneId: 'Asia/Tokyo', colorScheme: 'light' };

async function open(page) {
  await page.goto(url);
  await page.locator('main h1').filter({ hasText: 'ホーム' }).waitFor();
}

try {
  const browser = await chromium.launch({ headless: true });

  const still = await browser.newContext({ ...base, viewport: { width: 1200, height: 750 } });
  const shot = await still.newPage();
  await open(shot);
  await pause(shot, 600);
  const png = join(work, 'home.png');
  await shot.screenshot({ path: png });
  execFileSync('cwebp', ['-quiet', '-q', '86', png, '-o', join(dayDir, 'screenshot.webp')]);
  await still.close();

  const view = { width: 540, height: 960 };
  const movie = await browser.newContext({ ...base, viewport: view, recordVideo: { dir: work, size: view } });
  const page = await movie.newPage();
  const started = Date.now();
  await open(page);
  const ready = (Date.now() - started) / 1000; // 読み込みの時間は、あとで切り落とす
  await pause(page, 2200);
  await page.getByRole('navigation', { name: 'よく使う画面' }).getByRole('link', { name: '登録' }).click();
  const form = page.locator('form.entry-form');
  await form.waitFor();
  await pause(page, 600);
  await form.getByLabel('金額').pressSequentially('3300', { delay: 120 });
  await form.getByRole('combobox', { name: /科目/ }).click();
  await page.keyboard.insertText('しょうもう');
  await pause(page, 700);
  await page.keyboard.press('Enter');
  await pause(page, 400);
  await form.getByLabel('摘要').pressSequentially('コピー用紙', { delay: 100 });
  await pause(page, 500);
  await page.getByRole('button', { name: /保存して続ける/ }).click();
  const toast = page.locator('.toast').filter({ hasText: 'を登録しました' });
  await toast.waitFor();
  await pause(page, 1300);
  await toast.getByRole('button').last().click(); // 閉じる。残すと、このあとの画面に重なる
  await page.getByRole('navigation', { name: 'よく使う画面' }).getByRole('link', { name: '仕訳帳' }).click();
  await page.locator('main h1').filter({ hasText: '仕訳帳' }).waitFor();
  await page.getByText('コピー用紙').first().waitFor();
  await pause(page, 2200);
  await page.evaluate(() => { location.hash = '#/reports/income-statement?month=2026-09'; });
  await page.locator('.report-title').filter({ hasText: '2026年9月' }).waitFor();
  await pause(page, 1600);
  await page.mouse.wheel(0, 420);
  await pause(page, 1800);
  await page.getByRole('navigation', { name: 'よく使う画面' }).getByRole('link', { name: 'ホーム' }).click();
  await page.locator('main h1').filter({ hasText: 'ホーム' }).waitFor();
  await pause(page, 900);
  await page.mouse.wheel(0, 700);
  await pause(page, 1600);
  await movie.close();
  await browser.close();

  const webm = readdirSync(work).find((name) => name.endsWith('.webm'));
  execFileSync('ffmpeg', [
    '-v', 'error', '-y', '-ss', ready.toFixed(2), '-i', join(work, webm),
    '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-an',
    '-movflags', '+faststart', join(dayDir, 'demo.mp4'),
  ]);
  console.log('screenshot.webp と demo.mp4 を書き出しました。目で確かめてください');
} finally {
  server.kill('SIGTERM');
  rmSync(work, { recursive: true, force: true });
}
