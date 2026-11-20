// 評価者・確認者のための補助（開発・採点用。本番には出ない）。開発サーバーを内部で起こし、実ブラウザでアプリを開く。
// 使い方（評価者が短いスクリプトを書いて `node` で実行する。1本は3分以内に終わる量にする）:
//   import { launch } from './day-096-ux-recipe/tools/eval-helper.mjs';
//   const s = await launch({ device: 'phone', query: 'fresh=1&tips=0' });        // device: phone | tablet | pc
//   await s.page.getByRole('button', { name: /予約してもらう/ }).click();
//   console.log(await s.shot('目的を選んだ直後'));                                 // 画像のパスを返す。read_file で開いて見る
//   console.log(await s.tree());                                                  // いま見える要素の名前と役割（操作の手がかり）
//   await s.close();
// 画面の操作は Playwright の page（getByRole・getByLabel・getByText・keyboard・mouse・touchscreen）で行う。
import { chromium, webkit } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { startServer } from './serve.mjs';

const DEVICES = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true },
  tablet: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, hasTouch: true },
  pc: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};

export async function launch({ device = 'pc', query = 'fresh=1&tips=0', browser = 'chromium', out = './eval-shots', reducedMotion = false } = {}) {
  const server = await startServer({ port: 0 });
  const engine = browser === 'webkit' ? webkit : chromium;
  const b = await engine.launch();
  const spec = DEVICES[device] ?? DEVICES.pc;
  const context = await b.newContext({ ...spec, isMobile: device === 'phone' && browser === 'chromium', reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP違反: ${e.violatedDirective} ${e.blockedURI}`)));
  await page.goto(`${server.url}/?${query}`);
  await page.waitForSelector('#app[data-ready="true"]', { timeout: 20_000 });
  const dir = resolve(out);
  mkdirSync(dir, { recursive: true });
  let n = 0;
  return {
    page, context, errors, url: server.url,
    async shot(name, { full = false } = {}) {
      const file = `${dir}/${String(++n).padStart(2, '0')}-${name}.png`;
      await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'), null, { timeout: 5_000 }).catch(() => {});
      await page.screenshot({ path: file, fullPage: full });
      return file;
    },
    tree: () => page.locator('body').ariaSnapshot(),
    state: () => page.evaluate(() => window.__uxr?.getState?.() ?? null),
    async close() { await b.close(); await server.close(); },
  };
}
