// og.png（1200×630）を、実際の3D表示から作り直す（配信しない開発用）。
//   node day-087-oricube/tools/make-og.mjs [出力先] [?クエリ]
// 先に静的サーバーでリポジトリのルートを配信し、ポートを PORT に渡す（既定 4189）。
// Playwright はリポジトリの node_modules のものを使う。生成後は必ず画像を目視する。
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '../../package.json'));
const { chromium } = require('@playwright/test');
const out = process.argv[2] || join(here, '../og.png');
const query = process.argv[3] || '';
const port = process.env.PORT || '4189';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(`http://127.0.0.1:${port}/day-087-oricube/tools/og.html${query}`);
await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 30000 });
await page.screenshot({ path: out });
await browser.close();
console.log('wrote', out);
