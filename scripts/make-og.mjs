// static/assets/og.png（1200×630）を scripts/og-template.html から作り直す。
//
// このリポジトリは依存パッケージゼロを保つため、Playwright は依存に入れない。
// 別プロジェクトの Playwright を借りて実行する：
//
//   PLAYWRIGHT=/path/to/playwright/index.js node scripts/make-og.mjs
//
// 文言を変えるときは og-template.html を編集してから実行する。
// 生成後は必ず画像を目視すること（CLAUDE.md 公開前チェック②）。

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const template = join(root, 'scripts', 'og-template.html');
const out = join(root, 'static', 'assets', 'og.png');

const spec = process.env.PLAYWRIGHT || 'playwright';
// 絶対パス指定のときは file:// URL に直してから読み込む（このリポジトリには node_modules が無いため）
const target = spec.startsWith('.') || spec.startsWith('/') ? pathToFileURL(resolve(spec.replace(/^~/, process.env.HOME))).href : spec;

let chromium;
try {
  // CommonJS の playwright を動的importすると名前付きexportが出ないことがあるので default も見る
  const mod = await import(target);
  chromium = mod.chromium ?? mod.default?.chromium;
  if (!chromium) throw new Error('chromium が見つかりません');
} catch (e) {
  console.error(e.message);
  console.error(`Playwright を読み込めませんでした（${spec}）。`);
  console.error('例: PLAYWRIGHT=/path/to/playwright/index.js node scripts/make-og.mjs');
  process.exit(1);
}

if (!existsSync(template)) {
  console.error(`テンプレートが見つかりません: ${template}`);
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, locale: 'ja-JP' });
await page.goto(pathToFileURL(template).href, { waitUntil: 'networkidle' });
await page.screenshot({ path: out, type: 'png' });
await browser.close();

console.log(`make-og: ${out} を生成しました（1200x630）。目視してから公開すること`);
