/* UI採点用に、状態ごとに「1画面ずつスクロールした実寸の画像」を撮る（全体を1枚に縮めると文字が読めないため）。
     npm run build && PLAYWRIGHT_PORT=4180 node scripts/serve-dist.mjs   （別の端末で）
     SHOTS_BASE=http://127.0.0.1:4180 SHOTS_OUT=<出力先> node .agent-harness/runs/day074-link-dokumi/shoot-tiles.mjs [幅 …]
   通信は page.route で差し替える（手書きの観測データ）。 */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

const base = `${process.env.SHOTS_BASE || 'http://127.0.0.1:4180'}/day-074-link-dokumi/`;
const out = process.env.SHOTS_OUT;
if (!out) throw new Error('SHOTS_OUT を指定する');
const widths = process.argv.slice(2).map(Number).filter(Boolean);
const fixture = (name) => readFileSync(`day-074-link-dokumi/tests/fixtures/${name}`, 'utf8');
mkdirSync(out, { recursive: true });

async function settle(page) {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
    .map((animation) => animation.finished.catch(() => null))));
}

// tiles: 何画面ぶん撮るか。scrollTo: 撮り始めの要素（省略すると先頭）
const STATES = {
  idle: { tiles: 3, async act() {} },
  checking: { tiles: 1, async act(page) {
    await page.route('**/api/day-074/trace**', () => {});
    await page.locator('#url-input').fill('【お知らせ】お荷物をお預かりしています。https://parcel-notice.jp/track?id=8841 から確認してください');
    await page.locator('#check-button').click();
    await page.waitForSelector('#app[data-phase="checking"]');
  } },
  'result-danger': { tiles: 3, async act(page) {
    await page.locator('.sample-chip[data-sample="lookalike"]').click();
    await page.waitForSelector('#app[data-phase="result"]');
  } },
  'result-ok': { tiles: 2, async act(page) {
    await page.locator('.sample-chip[data-sample="clean"]').click();
    await page.waitForSelector('#app[data-phase="result"]');
  } },
  owner: { tiles: 2, scrollTo: '#tab-owner', async act(page) {
    await page.locator('.sample-chip[data-sample="legacy"]').click();
    await page.waitForSelector('#app[data-phase="result"]');
    await page.locator('#tab-owner').click();
    await page.locator('#panel-owner .finding').first().locator('summary').click();
  } },
  'failed-429': { tiles: 1, async act(page) {
    await page.route('**/api/day-074/trace**', (route) => route.fulfill({
      status: 429, headers: { 'content-type': 'application/json', 'Retry-After': '42' }, body: '{"error":"rate_limited"}'
    }));
    await page.locator('#url-input').fill('https://parcel-notice.jp/track');
    await page.locator('#check-button').click();
    await page.waitForSelector('#app[data-phase="failed"]');
  } },
  how: { tiles: 2, scrollTo: '#how', async act() {} }
};

const browser = await chromium.launch();
for (const width of widths.length ? widths : [390, 768, 1440]) {
  const height = width === 390 ? 844 : 900;
  for (const [name, state] of Object.entries(STATES)) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.route('**/api/day-074/around**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: fixture('around-clean.json') }));
    await page.goto(base);
    await page.waitForSelector('#app[data-ready="true"]', { timeout: 15000 });
    await state.act(page);
    await page.waitForTimeout(300);
    await settle(page);
    const disabled = name === 'checking' ? { animations: 'disabled' } : {};
    if (state.scrollTo) await page.locator(state.scrollTo).first().evaluate((node) => node.scrollIntoView({ block: 'start' }));
    for (let tile = 1; tile <= state.tiles; tile++) {
      await page.waitForTimeout(150);
      await page.screenshot({ path: `${out}/${name}-${width}-${tile}.png`, ...disabled });
      await page.evaluate((step) => window.scrollBy(0, step), Math.round(height * 0.85));
    }
    await page.close();
  }
}
await browser.close();
console.log('done');
