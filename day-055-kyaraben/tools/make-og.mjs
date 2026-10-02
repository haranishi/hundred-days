// og.png（1200×630）を tools/og-template.html から撮る。
// 撮ったら必ず画像を目で確かめてから公開する（文字の欠け・折り返しは撮ってみないと分からない）
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from './_browser.mjs';

const root = resolve(import.meta.dirname, '..');
const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, locale: 'ja-JP' });
  await page.goto(pathToFileURL(resolve(root, 'tools/og-template.html')).href, { waitUntil: 'load' });
  await page.screenshot({ path: resolve(root, 'og.png'), type: 'png' });
  console.log(`make-og: ${resolve(root, 'og.png')} を書きました（1200x630）。目で確かめてから公開すること`);
} finally {
  await browser.close();
}
