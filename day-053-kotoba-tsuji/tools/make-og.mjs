// tools/og.html を 1200×630 で撮って assets/og.png を作る（リンクのカードに出る画像）。
// このリポジトリは Playwright を依存に入れないので、scripts/record-demo.mjs と同じく別のところから借りる。
//
//   PLAYWRIGHT=/path/to/playwright/index.js node day-053-kotoba-tsuji/tools/make-og.mjs
//
// 書体は同梱の woff2（../fonts/fonts.css）。file:// のページから書体を読めるよう、起動の引数で許す。
// 生成後は必ず画像を目視すること。
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const spec = process.env.PLAYWRIGHT || 'playwright';
const target = spec.startsWith('.') || spec.startsWith('/') ? pathToFileURL(resolve(spec)).href : spec;

let chromium;
try {
  const mod = await import(target);
  chromium = mod.chromium ?? mod.default?.chromium;
  if (!chromium) throw new Error('chromium が見つかりません');
} catch (error) {
  console.error(`Playwright を読み込めませんでした（${spec}）: ${error.message}`);
  console.error('例: PLAYWRIGHT=/path/to/playwright/index.js node day-053-kotoba-tsuji/tools/make-og.mjs');
  process.exit(1);
}

const out = join(APP, 'assets', 'og.png');
mkdirSync(join(APP, 'assets'), { recursive: true });
const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(join(APP, 'tools', 'og.html')).href, { waitUntil: 'load' });
  const fontOk = await page.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check('800 40px "Shippori Mincho B1"', 'ことば辻');
  });
  if (!fontOk) {
    console.error('同梱の書体を読めなかった（fonts/ に woff2 があるか確かめること）。撮らずに止める');
    process.exitCode = 1;
  } else {
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 630 } });
    console.log(`作成: ${out.slice(APP.length + 1)}`);
  }
} finally {
  await browser.close();
}
