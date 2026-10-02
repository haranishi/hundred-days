// 撮影用のブラウザ。依存ゼロを保つため Playwright はルートの node_modules から借りる。
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const WEBKIT_PATH = process.env.WEBKIT_PATH || (process.env.HOME ? join(process.env.HOME, 'Library/Caches/ms-playwright/webkit-2359/pw_run.sh') : '');
const pw = await import(pathToFileURL(new URL('../../node_modules/playwright/index.mjs', import.meta.url).pathname).href);
const { chromium, webkit } = pw.chromium ? pw : pw.default;

export async function launch() {
  if (process.env.KYARABEN_BROWSER === 'webkit' && WEBKIT_PATH) return webkit.launch({ executablePath: WEBKIT_PATH });
  try {
    return await chromium.launch({ timeout: 20_000 });
  } catch (error) {
    if (WEBKIT_PATH) {
      console.warn(`Chromium が起動しないので WebKit で撮ります（${String(error.message).split('\n')[0]}）`);
      return webkit.launch({ executablePath: WEBKIT_PATH });
    }
    throw error;
  }
}
