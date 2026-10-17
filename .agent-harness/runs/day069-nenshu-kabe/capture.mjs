// Day069 の撮影。dist/ を配信しているサーバーに繋いで撮る（確認のあいだだけ published にしてビルドした配信物）。
// 使い方：
//   node .agent-harness/runs/day069-nenshu-kabe/capture.mjs <outDir> [port]          … 評価用（390・1440の幅、主要な状態）
//   node .agent-harness/runs/day069-nenshu-kabe/capture.mjs --og [port]               … 一覧・OGP用の screenshot.webp（1200×750）
// 動きの途中を撮らないよう「動きを減らす」設定で撮る。日付は2026-10-17に固定する（給料日の初期値と2027年の帯のため）。
import { chromium, webkit } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const og = args.includes('--og');
const port = args.find((a) => /^\d+$/.test(a)) || '4180';
const outDir = og ? 'day-069-nenshu-kabe' : args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a));
const engine = args.includes('--webkit') ? webkit : chromium;
if (!outDir) { console.error('usage: capture.mjs <outDir> [port] | --og [port]'); process.exit(1); }
const URL_ = `http://127.0.0.1:${port}/day-069-nenshu-kabe/`;
mkdirSync(outDir, { recursive: true });

const browser = await engine.launch({ headless: true });
const shots = [];

async function openPage({ width, height, touch }) {
  const context = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: og ? 1 : 2, hasTouch: touch, isMobile: touch,
    locale: 'ja-JP', reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.clock.install({ time: new Date('2026-10-17T03:00:00Z') });
  await page.goto(URL_, { waitUntil: 'load' });
  await page.locator('html[data-ready="true"]').waitFor();
  return { context, page };
}

async function fill(page, values) {
  await page.getByRole('button', { name: '自分の数字を入れる', exact: true }).click();
  await page.locator('#age-band').selectOption(values.ageBand);
  await page.locator('#student').setChecked(values.student);
  for (const [id, value] of Object.entries({
    'paid-so-far': values.paidSoFar, 'hourly-wage': values.hourlyWage,
    'remaining-paydays': values.remainingPaydays, 'hours-per-payday': values.hoursPerPayday,
  })) await page.locator(`#${id}`).fill(String(value));
}

async function shoot(page, name, { fullPage = false } = {}) {
  const path = join(outDir, `${name}.png`);
  // 全体の画像では画面下の固定バーがページの途中に焼き込まれるので隠す（固定バーは画面の高さの画像で見る）
  if (fullPage) {
    await page.addStyleTag({ content: '#result-jump { visibility: hidden !important; }' });
    // スクロールしたまま全体を撮ると、追従する入力欄がずれて写るので先頭に戻す
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  await page.screenshot({ path, fullPage });
  if (fullPage) await page.addStyleTag({ content: '#result-jump { visibility: visible !important; }' });
  shots.push(path);
}

if (og) {
  const { context, page } = await openPage({ width: 1200, height: 750, touch: false });
  const png = join(outDir, '.shot.png');
  await page.screenshot({ path: png });
  execFileSync('cwebp', ['-q', '82', '-metadata', 'none', png, '-o', join(outDir, 'screenshot.webp')], { stdio: ['ignore', 'ignore', 'pipe'] });
  rmSync(png, { force: true });
  shots.push(join(outDir, 'screenshot.webp'));
  await context.close();
} else {
  for (const size of [{ width: 390, height: 844, touch: true, tag: '390' }, { width: 1440, height: 900, touch: false, tag: '1440' }]) {
    // 1. 例（ファーストビューと全体）
    let { context, page } = await openPage(size);
    await shoot(page, `${size.tag}-01-example-first-view`);
    await shoot(page, `${size.tag}-02-example-full`, { fullPage: true });
    // 2. 自分の数字：住民税の下端だけ越えた・予定で越える壁がある状態。折りたたみを1つ開く
    await fill(page, { ageBand: 'a19_22', student: true, paidSoFar: 1_150_000, hourlyWage: 1_150, remainingPaydays: 2, hoursPerPayday: 90 });
    await page.locator('[data-wall="parent-income-tax-full"] details.wall-source > summary').click();
    // 折りたたみを開くとそこまでスクロールするので、ファーストビューは先頭に戻してから撮る
    await page.evaluate(() => window.scrollTo(0, 0));
    await shoot(page, `${size.tag}-03-own-first-view`);
    // 入力欄の途中を見ている画面（スマホでは画面下に「結果を見る」の固定バーが出る）
    await page.locator('#hourly-wage').focus();
    await page.locator('#hourly-wage').evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await shoot(page, `${size.tag}-03b-own-editing`);
    await shoot(page, `${size.tag}-04-own-full`, { fullPage: true });
    // 3. 健康保険の区画まで動かした画面
    await page.locator('#health-title').scrollIntoViewIfNeeded();
    await shoot(page, `${size.tag}-05-health`);
    // 4. 入力の誤り
    await page.locator('#paid-so-far').fill('12万');
    await page.locator('#hours-per-payday').scrollIntoViewIfNeeded();
    await shoot(page, `${size.tag}-06-invalid`);
    await context.close();
    // 5. 18歳・学生でない（壁の数が減る）
    ({ context, page } = await openPage(size));
    await fill(page, { ageBand: 'a18', student: false, paidSoFar: 600_000, hourlyWage: 1_100, remainingPaydays: 3, hoursPerPayday: 60 });
    await shoot(page, `${size.tag}-07-age18-full`, { fullPage: true });
    await context.close();
  }
}

await browser.close();
console.log(shots.join('\n'));
