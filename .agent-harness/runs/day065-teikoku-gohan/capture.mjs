// Day65 実ブラウザ撮影スクリプト。画面の状態ごとに、幅を変えて撮る（見た目の採点に使う）。
// 使い方: node capture.mjs <outDir> [port] [--widths=390,320] [--motion]
//   <port> のサーバーが、リポジトリのルート（または dist/）を配信していること。
//   既定は「動きを減らす」設定で撮る（アニメの途中を撮らないため）。--motion を付けると通常の動き。
//   走行中の画面（03-running / 09-l4-run-*）だけは、常に通常の動きで撮る。
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const outDir = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a));
const port = args.find((a) => /^\d+$/.test(a)) || '4570';
const withMotion = args.includes('--motion');
const widthsArg = args.find((a) => a.startsWith('--widths='));
const onlyWidths = widthsArg ? widthsArg.slice(9).split(',').map(Number) : null;
if (!outDir) { console.error('usage: node capture.mjs <outDir> [port] [--widths=390,320] [--motion]'); process.exit(1); }
const BASE = `http://127.0.0.1:${port}/day-065-teikoku-gohan/`;
mkdirSync(outDir, { recursive: true });

const SIZES = [
  { w: 390, h: 844, touch: true },
  { w: 375, h: 667, touch: true },
  { w: 320, h: 568, touch: true },
  { w: 844, h: 390, touch: true },
  { w: 768, h: 1024, touch: false },
  { w: 1440, h: 900, touch: false },
];

const browser = await chromium.launch({ headless: true });
const report = [];

for (const s of SIZES.filter((x) => !onlyWidths || onlyWidths.includes(x.w))) {
  const mk = (motion) => browser.newContext({
    viewport: { width: s.w, height: s.h }, hasTouch: s.touch, isMobile: s.touch, deviceScaleFactor: 1,
    reducedMotion: motion ? 'no-preference' : 'reduce',
  });
  const ctx = await mk(withMotion);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console:' + m.text()); });
  await page.goto(BASE);
  await page.waitForSelector('html[data-ready="true"]');

  const tag = `${s.w}x${s.h}`;
  const shot = async (name, full = false) => {
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${outDir}/${tag}-${name}.png`, fullPage: full });
  };
  const overflow = async (name) => {
    const v = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    report.push(`${tag} ${name}: 横はみ出し ${v}px`);
  };
  const step = async (label, fn) => { try { await fn(); } catch (e) { report.push(`${tag} ${label}: 失敗 ${String(e.message).split('\n')[0]}`); } };
  const chip = (n) => page.getByRole('button', { name: new RegExp(`^面${n} `) });
  const train = (dish) => page.getByRole('button', { name: new RegExp(`${dish}の列車。`) });
  const sw = (label) => page.getByRole('button', { name: label, exact: true });
  const depart = () => page.getByRole('button', { name: '発車', exact: true }).click();
  const skip = () => page.getByRole('button', { name: 'スキップ', exact: true }).click();
  // 発車して結果が出るまで。動きを減らす設定ではスキップが無く、すぐ結果が出る
  const departAndResult = async () => {
    await depart();
    await page.waitForSelector('#btn-skip:not([hidden]), #result:not([hidden])');
    if (await page.locator('#btn-skip').isVisible().catch(() => false)) await skip();
    await page.waitForSelector('#result:not([hidden])');
  };
  const failTwiceThenSample = async () => {
    for (let i = 0; i < 2; i++) {
      await departAndResult();
      if (i === 0) await page.getByRole('button', { name: '組み直す' }).click();
    }
    await shot('sample-offer');
    await page.getByRole('button', { name: '見本のダイヤを見る' }).click();
  };

  // 面1
  await step('00-start', async () => { await shot('00-start'); await shot('00-start-full', true); await overflow('00-start'); });
  await step('howto', async () => { await page.getByRole('button', { name: 'あそびかた' }).click(); await shot('13-howto'); await page.getByRole('button', { name: 'とじる' }).first().click(); });
  await step('01', async () => { await train('焼きにんじん').click(); await shot('01-l1-selected'); await overflow('01-l1-selected'); });
  await step('02', async () => { await sw('分岐 切る駅へ').click(); await shot('02-l1-switched'); });
  await step('03 running', async () => {
    // 走行中だけは通常の動きで見たいので、動きを減らす設定のときは別の文脈で撮る
    if (!withMotion) {
      const mctx = await mk(true); const mp = await mctx.newPage(); await mp.goto(BASE); await mp.waitForSelector('html[data-ready="true"]');
      await mp.getByRole('button', { name: /焼きにんじんの列車。/ }).click();
      await mp.getByRole('button', { name: '分岐 切る駅へ', exact: true }).click();
      await mp.getByRole('button', { name: '発車', exact: true }).click();
      await mp.waitForTimeout(1500); await mp.screenshot({ path: `${outDir}/${tag}-03-l1-running.png` });
      await mp.waitForTimeout(1800); await mp.screenshot({ path: `${outDir}/${tag}-03b-l1-running-late.png` });
      await mctx.close();
    } else {
      await depart(); await page.waitForTimeout(1500); await shot('03-l1-running'); await page.waitForTimeout(1800); await shot('03b-l1-running-late');
    }
  });
  await step('04 result', async () => {
    await departAndResult();
    await shot('04-l1-result'); await shot('04-l1-result-full', true); await overflow('04-l1-result');
  });

  // 面2：遅れて失敗→見本
  await step('05 l2', async () => {
    await chip(2).click();
    for (const dish of ['焼きにんじん', 'ステーキ']) { await train(dish).click(); await sw('分岐 切る駅へ').click(); }
    await shot('05a-l2-edit');
    await departAndResult();
    await shot('05-l2-fail'); await shot('05-l2-fail-full', true); await overflow('05-l2-fail');
    await page.getByRole('button', { name: '組み直す' }).click();
    await failTwiceThenSample().catch(() => {});
  });
  await step('07 sample applied', async () => { await shot('07-l2-sample-applied'); await departAndResult(); await shot('07b-l2-sample-result', true); });

  // 面3：分岐が多い面
  await step('08 l3', async () => {
    await chip(3).click(); await shot('08a-l3-initial');
    await train('ひと口ステーキ').click(); await shot('08-l3-selected'); await overflow('08-l3-selected');
  });
  // 面4：焦げ
  await step('09 l4', async () => {
    await chip(4).click(); await shot('09a-l4-initial');
    await train('ステーキ').click();
    await sw('分岐 焼く駅（3分）へ').click();
    await shot('09b-l4-selected');
    const mctx = withMotion ? null : await mk(true);
    const p2 = withMotion ? page : await mctx.newPage();
    if (!withMotion) {
      await p2.goto(BASE); await p2.waitForSelector('html[data-ready="true"]');
      await p2.getByRole('button', { name: /^面4 / }).click();
      await p2.getByRole('button', { name: /ステーキの列車。/ }).click();
      await p2.getByRole('button', { name: '分岐 焼く駅（3分）へ', exact: true }).click();
    }
    await p2.getByRole('button', { name: '発車', exact: true }).click();
    for (const [ms, name] of [[2600, 'a'], [2600, 'b'], [2600, 'c'], [2600, 'd']]) {
      await p2.waitForTimeout(ms); await p2.screenshot({ path: `${outDir}/${tag}-09-l4-run-${name}.png` });
    }
    if (mctx) await mctx.close();
    if (withMotion) { await skip(); await page.waitForSelector('#result:not([hidden])'); await page.getByRole('button', { name: '組み直す' }).click(); }
  });
  await step('10 l4 result', async () => {
    await departAndResult();
    await shot('10-l4-burnt-result'); await shot('10-l4-burnt-result-full', true); await overflow('10-l4-burnt-result');
  });
  // 面5・面6
  await step('11 l5', async () => { await chip(5).click(); await shot('11-l5-initial'); await train('ローストビーフ').click(); await shot('11b-l5-selected'); });
  await step('12 l6', async () => { await chip(6).click(); await shot('12-l6-initial'); await shot('12-l6-initial-full', true); await overflow('12-l6-initial'); await train('角煮').click(); await shot('12b-l6-selected'); });
  await step('13 l6 result', async () => {
    await page.getByRole('button', { name: /^面6 / }).click();
    await failTwiceThenSample().catch(() => {});
    await departAndResult();
    await shot('13-l6-sample-result'); await shot('13-l6-sample-result-full', true); await overflow('13-l6-sample-result');
  });
  // 共有の窓
  await step('14 share', async () => { await page.getByRole('button', { name: 'このアプリを共有する' }).click(); await shot('14-share'); await page.getByRole('button', { name: 'とじる' }).last().click(); });

  if (errors.length) report.push(`${tag} コンソールのエラー: ${errors.slice(0, 5).join(' | ')}`);
  await ctx.close();
}
await browser.close();
writeFileSync(`${outDir}/capture-report.txt`, report.join('\n') + '\n');
console.log(report.join('\n') || '（記録なし）');
