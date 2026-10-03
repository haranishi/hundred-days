// OWNER: tools
// 検証の道具（撮影・自動プレイ・性能・音・E2E）が開くブラウザを、ここ1か所で決める。
//   DR_BROWSER=chromium|webkit|auto（既定 auto）。auto は「画面がロック中なら webkit、そうでなければ chromium」
// 画面がロックされている（ioreg の IOConsoleLocked が Yes）と、Playwright の Chromium は起動直後に落ちる。
// caffeinate でも防げない。WebKit はロック中でも起動し、WebGL2 を実機の GPU（ANGLE の Metal）で描ける。
// Playwright の依存を持たないので、playwright.config.ts からも読める。
import { spawnSync } from 'node:child_process';

/** Chromium で GPU を使う起動引数。Chromium だけのスイッチなので、WebKit には渡さない。 */
export const GPU_ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];
/** Chromium で垂直同期とフレームレートの上限を外す引数（計測用）。WebKit には同じものが無い。 */
export const UNCAPPED_ARGS = ['--disable-gpu-vsync', '--disable-frame-rate-limit'];
/** Chromium で、操作なしでも音を出させる引数。Playwright の WebKit は、はじめから操作なしで音が出る。 */
export const AUTOPLAY_ARGS = ['--autoplay-policy=no-user-gesture-required'];

const NAMES = ['chromium', 'webkit'];

/** mac の画面がロック中か。mac 以外と、ioreg が読めないときは false。 */
export function screenLocked() {
  if (process.platform !== 'darwin') return false;
  const r = spawnSync('ioreg', ['-n', 'Root', '-d1'], { encoding: 'utf8', timeout: 10_000 });
  return /"IOConsoleLocked"\s*=\s*Yes/.test(r.stdout ?? '');
}

/** 使うブラウザ（name）と、そう決めた理由（reason、記録用）。DR_BROWSER が知らない値なら止める。 */
export function resolveBrowser(env = process.env) {
  const want = String(env.DR_BROWSER ?? '').trim().toLowerCase() || 'auto';
  if (want !== 'auto' && !NAMES.includes(want)) throw new Error(`DR_BROWSER は chromium・webkit・auto のどれか（いま "${env.DR_BROWSER}"）`);
  const locked = screenLocked();
  if (want === 'auto') return { name: locked ? 'webkit' : 'chromium', reason: locked ? 'auto・画面がロック中' : 'auto' };
  if (want === 'chromium' && locked) return { name: want, reason: 'DR_BROWSER=chromium・画面がロック中なので起動しないはず' };
  return { name: want, reason: `DR_BROWSER=${want}` };
}

/** そのブラウザに渡す起動引数。uncapped（垂直同期を外す）と autoplay（操作なしで音）は Chromium でだけ意味がある。 */
export function launchArgs(name, { uncapped = false, autoplay = false } = {}) {
  if (name !== 'chromium') return [];
  return [...GPU_ARGS, ...(uncapped ? UNCAPPED_ARGS : []), ...(autoplay ? AUTOPLAY_ARGS : [])];
}
