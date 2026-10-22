/* Day74 の画面を、状態ごと・幅ごとに撮る（UI採点の材料）。リポジトリ直下で実行する。
     npm run build && PLAYWRIGHT_PORT=4180 node scripts/serve-dist.mjs   （別の端末で）
     SHOTS_BASE=http://127.0.0.1:4180 node .agent-harness/runs/day074-link-dokumi/shoot.mjs
   通信は page.route で差し替える（手書きの観測データ）。撮る前に、終わりのある動きの完了を待つ。 */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

const base = `${process.env.SHOTS_BASE || 'http://127.0.0.1:4180'}/day-074-link-dokumi/`;
const out = '.agent-harness/runs/day074-link-dokumi/shots';
const fixture = (name) => readFileSync(`day-074-link-dokumi/tests/fixtures/${name}`, 'utf8');
mkdirSync(out, { recursive: true });

async function settle(page) {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
    .map((animation) => animation.finished.catch(() => null))));
}

const STATES = {
  async idle() {},
  async checking(page) {
    await page.route('**/api/day-074/trace**', () => {}); // 返さない＝調べている途中のまま
    await page.locator('#url-input').fill('【お知らせ】お荷物をお預かりしています。https://parcel-notice.jp/track?id=8841 から確認してください');
    await page.locator('#check-button').click();
    await page.waitForSelector('#app[data-phase="checking"]');
  },
  async 'result-danger'(page) {
    await page.locator('.sample-chip[data-sample="lookalike"]').click();
    await page.waitForSelector('#app[data-phase="result"]');
  },
  async 'result-ok'(page) {
    await page.locator('.sample-chip[data-sample="clean"]').click();
    await page.waitForSelector('#app[data-phase="result"]');
  },
  async owner(page) {
    await page.locator('.sample-chip[data-sample="legacy"]').click();
    await page.waitForSelector('#app[data-phase="result"]');
    await page.locator('#tab-owner').click();
    await page.locator('#panel-owner .finding').first().locator('summary').click();
  },
  async 'failed-429'(page) {
    await page.route('**/api/day-074/trace**', (route) => route.fulfill({
      status: 429, headers: { 'content-type': 'application/json', 'Retry-After': '42' }, body: '{"error":"rate_limited"}'
    }));
    await page.locator('#url-input').fill('https://parcel-notice.jp/track');
    await page.locator('#check-button').click();
    await page.waitForSelector('#app[data-phase="failed"]');
  }
};

const browser = await chromium.launch();
for (const width of [390, 768, 1440]) {
  for (const [name, act] of Object.entries(STATES)) {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
    await page.route('**/api/day-074/around**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: fixture('around-clean.json') }));
    await page.goto(base);
    await page.waitForSelector('#app[data-ready="true"]', { timeout: 15000 });
    await act(page);
    await page.waitForTimeout(300);
    await settle(page);
    const disabled = name === 'checking' ? { animations: 'disabled' } : {};
    await page.screenshot({ path: `${out}/${name}-${width}.png`, fullPage: true, ...disabled });
    // 最初の1画面（スクロールなし）。結果は、帯が画面の上に来た位置で撮る
    await page.screenshot({ path: `${out}/${name}-${width}-view.png`, ...disabled });
    console.log(`${name}-${width}`, await page.evaluate(() => document.documentElement.scrollWidth));
    await page.close();
  }
}
await browser.close();
