// 実ブラウザの証拠を生成する。tools/cache は配信・Git追跡の対象外。
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setup, sampleSituation, sampleBreakdown, sampleDocuments } from '../demo-scenario.mjs';
import { CHARGES, CONCERNS } from '../lib/model.js';

const out = fileURLToPath(new URL('./cache/verification/', import.meta.url));
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'ja-JP' });
  const server = await setup(page);
  await sampleSituation(page); await page.locator('#next').click(); await sampleBreakdown(page);
  await page.locator('#next').click(); await sampleDocuments(page);
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.locator('[data-step="0"]').click(); await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${out}${width}-start.png` });
    await page.locator('#preview').click(); await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}${width}-memo.png` });
    console.log(JSON.stringify(await page.evaluate(() => ({
      width: innerWidth, horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      memoBody: getComputedStyle(document.querySelector('.memo-facts')).fontSize,
      labels: [...document.querySelectorAll('input,select')].every((e) => e.labels?.length),
    }))));
  }
  await page.pdf({ path: `${out}memo-typical.pdf`, printBackground: true, preferCSSPageSize: true });
  await page.locator('[data-step="1"]').click();
  for (const [id] of CHARGES) { await page.locator(`#charge-${id}`).check(); await page.locator(`#amount-${id}`).fill('999999999'); }
  for (const [id] of CONCERNS) await page.locator(`[data-concern="${id}"]`).check();
  await page.pdf({ path: `${out}memo-maximum.pdf`, printBackground: true, preferCSSPageSize: true });
  await page.locator('#amount-cleaning').fill('-10'); await page.locator('#next').click();
  await page.screenshot({ path: `${out}390-error.png` });
  await page.locator('#amount-cleaning').fill('40000');
  await page.locator('#reset').click(); await page.screenshot({ path: `${out}390-reset.png` });
  await page.keyboard.press('Escape');
  console.log('PDF・3画面幅・エラー・全消去の確認画像を作成しました。');
  server.close();
} finally { await browser.close(); }
