/* day-074-link-dokumi/og.svg を Chromium で 1200×630 の og.png に書き出す。リポジトリ直下で実行する。
     node .agent-harness/runs/day074-link-dokumi/render-og.mjs
   文字はシステムの明朝・ゴシック（macOS ならヒラギノ）で描く。書き出した画像は必ず目で確かめる。 */
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const source = resolve('day-074-link-dokumi/og.svg');
const target = resolve('day-074-link-dokumi/og.png');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(source).href);
await page.waitForTimeout(300);
await page.screenshot({ path: target, clip: { x: 0, y: 0, width: 1200, height: 630 } });
await browser.close();
console.log('wrote og.png');
