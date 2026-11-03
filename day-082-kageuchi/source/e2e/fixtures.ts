// OWNER: core
// E2E の共通：コンソールのエラーと捕まらなかった例外を集める、起動を待つ、window.__state を読む。
// 共有欄の部品（shared/share.css・share.js）は、配信先の hundred-days が足すもので、ゲーム単体のプレビューには無い。
// 無いと 404 がコンソールのエラーに数えられ全件が落ちるので、隣のフォルダ（day-082-kageuchi/shared/）の実物を返す。
// 2026-11-03: hundred-days へ取り込んだあとの試験が、この食い違いで全件落ちていた（スマホ対応の基準線を取るときに見つけた）
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test as base, type Page } from '@playwright/test';

export { expect, type Page } from '@playwright/test';

const SHARED_DIR = fileURLToPath(new URL('../../shared/', import.meta.url));

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('**/shared/share.*', async (route) => {
      const name = new URL(route.request().url()).pathname.split('/').pop() ?? '';
      const file = `${SHARED_DIR}${name}`;
      if (!/^share\.(css|js)$/.test(name) || !existsSync(file)) {
        await route.fulfill({ status: 404, body: '' });
        return;
      }
      await route.fulfill({ body: readFileSync(file), contentType: name.endsWith('.css') ? 'text/css' : 'text/javascript' });
    });
    await use(page);
  },
});

/** WebKit が、移動で捨てる側の文書の取得の失敗に付ける文（遊びの中の失敗ではないので数えない）。 */
const LEAVING_FETCH = /^Fetch API cannot load .+ due to access control checks\.$/;

export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  const add = (text: string): void => {
    if (!LEAVING_FETCH.test(text)) errors.push(text);
  };
  page.on('console', (m) => {
    if (m.type() === 'error') add(m.text());
  });
  page.on('pageerror', (e) => add(String(e)));
  return errors;
}

/** 開いて、起動（__appReady）か起動の失敗（__appError）を待つ。 */
export async function boot(page: Page, query = ''): Promise<void> {
  await page.goto(`/${query}`);
  await page.waitForFunction(() => window.__appReady === true || typeof window.__appError === 'string', null, { timeout: 60_000 });
  const err = await page.evaluate(() => window.__appError ?? null);
  if (err) throw new Error(`起動に失敗: ${err}`);
}

export async function state(page: Page) {
  return page.evaluate(() => window.__state!);
}

/** ゲーム内時刻で、しばらく待つ（実時間の待ちより確か）。 */
export async function waitGameSeconds(page: Page, seconds: number, timeout = 30_000): Promise<void> {
  const t0 = await page.evaluate(() => window.__state!.t);
  await page.waitForFunction((t) => window.__state!.t >= t, t0 + seconds, { timeout, polling: 50 });
}

/** window.__state.screen がその画面になるまで待つ（__state は毎コマの終わりに書かれる）。 */
export async function waitScreen(page: Page, screen: string, timeout = 10_000): Promise<void> {
  await page.waitForFunction((s) => window.__state?.screen === s, screen, { timeout });
}
