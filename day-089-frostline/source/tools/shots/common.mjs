import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, webkit } from 'playwright';
import { parseArgs } from 'node:util';
export const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }];
export const GPU_ARGS = ['--enable-unsafe-webgpu', '--enable-features=WebGPU', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];
export function options(args = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    webgl: { type: 'boolean', default: false }, webkit: { type: 'boolean', default: false },
    url: { type: 'string' }, out: { type: 'string', default: join(tmpdir(), 'ginrei-shots') }, scenes: { type: 'string' },
  } });
  if (positionals.length > 1) throw Error('URLは1つだけ指定してください');
  if (values.webgl && values.webkit) throw Error('方式は1つだけ指定してください');
  const url = new URL(values.url ?? positionals[0] ?? 'http://127.0.0.1:5183/');
  url.searchParams.set('debug', '1');
  if (values.webgl) url.searchParams.set('webgl', '1');
  return { ...values, url: url.href, mode: values.webkit ? 'webkit' : values.webgl ? 'webgl2' : 'webgpu' };
}
export async function ready(page) {
  await page.waitForFunction(() => !!window.__ginrei, null, { timeout: 30000 });
  await page.evaluate(() => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('準備が30秒以内に終わりませんでした')), 30000);
    window.__ginrei.ready.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  }));
}
export async function begin(page) {
  await page.evaluate(() => window.__ginrei.setManual(true));
  await page.locator('[data-start]').click();
  await page.waitForFunction(() => document.querySelector('[data-screen="hud"]')?.hidden === false, null, { timeout: 10000 });
}
/** ブラウザは同時に1つ。例外のときにも必ず片付ける。 */
export async function session(config, viewport, callback, extra = {}) {
  let browser;
  const messages = [];
  try {
    browser = await (config.webkit ? webkit : chromium).launch({ headless: true, timeout: 30000, ...(config.webkit ? {} : { args: GPU_ARGS }) });
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, ...extra });
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    page.on('console', m => { if (['error', 'warning'].includes(m.type())) messages.push(`${m.type()}: ${m.text()}`); });
    page.on('pageerror', e => messages.push(`例外: ${e.message}`));
    const response = await page.goto(config.url, { waitUntil: 'load', timeout: 30000 });
    if (!response?.ok()) throw Error(`ページを開けませんでした: ${response?.status()}`);
    await ready(page);
    const result = await callback({ page, context });
    const errors = await page.evaluate(() => window.__ginrei.errors.slice());
    if (messages.length || errors.length) throw Error([...messages, ...errors].join('\n'));
    return result;
  } finally { await browser?.close(); }
}
export function fail(error) { console.error(String(error?.stack ?? error)); process.exitCode = 1; }
