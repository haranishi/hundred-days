import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve('.agent-harness/runs/day063-cycle2/shots');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });

// 1. 3幅（390px, 768px, 1280px）でスタート画面撮影
for (const width of [390, 768, 1280]) {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  await page.goto('http://127.0.0.1:4173/day-063-dark-patterns/');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${outDir}/start-${width}px.png` });
  await page.close();
}

// 2. モバイル（390px）で各ステージ画面とリザルト画面を撮影
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto('http://127.0.0.1:4173/day-063-dark-patterns/');
await page.waitForTimeout(300);

// スタートクリック
await page.locator('#btn-start-game').click();
await page.waitForTimeout(1400); // カットイン終了待機
await page.screenshot({ path: `${outDir}/stage1-mobile.png` });

// ステージ1の引き留めダイアログを発生させて撮影
await page.locator('#chk-opt-sub').click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${outDir}/stage1-retention-dialog.png` });

// 解除して看破
await page.locator('#btn-remove-sub').click();
await page.locator('#btn-stage1-subtle').click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${outDir}/stage1-cleared-modal.png` });
await page.locator('#btn-next-stage').click();
await page.waitForTimeout(1400);

// ステージ2
await page.screenshot({ path: `${outDir}/stage2-mobile.png` });
await page.locator('#btn-reject-confirmshame').click();
await page.waitForTimeout(300);
await page.locator('#btn-next-stage').click();
await page.waitForTimeout(1400);

// ステージ3（トースト待ち）
await page.waitForTimeout(2200);
await page.screenshot({ path: `${outDir}/stage3-toast-mobile.png` });
await page.locator('input[value="freecancel"]').check();
await page.locator('#btn-hotel-submit').click();
await page.waitForTimeout(300);
await page.locator('#btn-next-stage').click();
await page.waitForTimeout(1400);

// ステージ4
await page.locator('input[value="leave"]').check();
await page.locator('#btn-real-cancel').click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${outDir}/stage4-final-trick-mobile.png` });
await page.locator('#btn-final-leave').click();
await page.waitForTimeout(300);
await page.locator('#btn-next-stage').click();
await page.waitForTimeout(1400);

// ステージ5
await page.locator('.accordion-summary').click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${outDir}/stage5-accordion-mobile.png` });
await page.locator('#chk-safe-plan').check();
await page.locator('#btn-sub-start').click();
await page.waitForTimeout(300);
await page.locator('#btn-next-stage').click();
await page.waitForTimeout(500);

// リザルト画面
await page.screenshot({ path: `${outDir}/result-mobile.png` });

await browser.close();
console.log('All harness shots captured successfully.');
