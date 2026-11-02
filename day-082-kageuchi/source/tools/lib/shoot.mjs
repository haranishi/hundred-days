// OWNER: tools（共通。撮影・自動プレイ・E2E が使う）
// GPU を使うブラウザを開き、ページの window.__shotReady が立ったら撮る。
// ソフトウェア描画（SwiftShader・llvmpipe）に落ちていたら、その時点で失敗として止める。
import { chromium, webkit } from '@playwright/test';
import { launchArgs, resolveBrowser } from './browser.mjs';

/** ブラウザを開く。返り値の name は 'chromium' か 'webkit'。 */
export async function openBrowser({ uncapped = false, autoplay = false } = {}) {
  const pick = resolveBrowser();
  const type = pick.name === 'webkit' ? webkit : chromium;
  const browser = await type.launch({ args: launchArgs(pick.name, { uncapped, autoplay }) });
  return { browser, name: pick.name, reason: pick.reason };
}

/** WebGL の描画器の名前。ソフトウェア描画なら例外を投げる。 */
export async function assertGpu(page) {
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return 'no-webgl2';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  });
  if (/swiftshader|llvmpipe|software|no-webgl2/i.test(renderer)) {
    throw new Error(`GPU で描けていない（${renderer}）。撮影を止める`);
  }
  return renderer;
}

/** url を開いて __shotReady を待ち、outPath に撮る。ページの console.error も集めて返す。 */
export async function shoot(page, url, outPath, { timeout = 90_000 } = {}) {
  const errors = [];
  const onConsole = (m) => {
    if (m.type() === 'error') errors.push(m.text());
  };
  const onError = (e) => errors.push(String(e));
  page.on('console', onConsole);
  page.on('pageerror', onError);
  try {
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__shotReady === true, null, { timeout, polling: 100 });
    await page.screenshot({ path: outPath });
  } finally {
    page.off('console', onConsole);
    page.off('pageerror', onError);
  }
  return { errors };
}
