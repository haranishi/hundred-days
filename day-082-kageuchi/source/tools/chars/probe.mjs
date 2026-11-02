// OWNER: chars-art
// 調査用：確認ページを開き、撮影の準備が立ったら式を評価して JSON で出す（足や骨の数値を見るため）。
//   node tools/chars/probe.mjs "http://127.0.0.1:5407/chars.html?shot=lineup" "window.__lab.sc.actors.length"
import { chromium } from '@playwright/test';
import { launchArgs } from '../lib/browser.mjs';

const [url, expr] = process.argv.slice(2);
const browser = await chromium.launch({ args: launchArgs('chromium') });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => m.type() === 'error' && console.log('[console]', m.text()));
  page.on('pageerror', (e) => console.log('[pageerror]', String(e)));
  await page.goto(url);
  await page.waitForFunction(() => window.__shotReady === true || window.__filmReady === true || window.__perfResult !== undefined || typeof window.__labError === 'string', null, { timeout: 60000 });
  const err = await page.evaluate(() => window.__labError ?? null);
  if (err) console.log('[labError]', err);
  console.log(JSON.stringify(await page.evaluate(expr), null, 1));
} finally {
  await browser.close();
}
