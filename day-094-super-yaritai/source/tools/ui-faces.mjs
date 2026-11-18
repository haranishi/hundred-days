// キャラの顔の画像を作り直す（画面と音の担当）。
// public/models/ch の GLB（Kenney Mini Characters・CC0）を three.js で胸から上だけ撮り、public/ui/chars/<名前>.png に書く。
// vite はこのスクリプトの中で 5342 番に起こして最後に止める。WebKit（画面ロック中でも動く）を使う。
// 使い方：node tools/ui-faces.mjs [--size=192] [--out=<フォルダ>]

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from '@playwright/test';
import { createServer } from 'vite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? '1']));
const SIZE = Number(args.get('size') || 192);
const OUT = resolve(ROOT, args.get('out') || 'public/ui/chars');
const PORT = Number(process.env.UI_FACES_PORT || 5342);
const browserType = process.env.SY_BROWSER === 'chromium' ? chromium : webkit;

// 写してある顔と同じ顔ぶれ（警官の帽子の male-c は使わない）
const FILES = [
  'character-female-a',
  'character-female-b',
  'character-female-c',
  'character-female-d',
  'character-female-e',
  'character-female-f',
  'character-male-a',
  'character-male-b',
  'character-male-d',
  'character-male-e',
  'character-male-f',
];

const server = await createServer({
  root: ROOT,
  configFile: resolve(ROOT, 'vite.config.ts'),
  server: { port: PORT, strictPort: true, host: '127.0.0.1' },
  logLevel: 'warn',
});
let browser = null;
let failed = false;
try {
  await server.listen();
  browser = await browserType.launch();
  const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`http://127.0.0.1:${PORT}/screens-preview.html?faces=1`);
  await page.waitForFunction(() => !!window.__FACES__, null, { timeout: 60_000 });
  await mkdir(OUT, { recursive: true });
  for (const file of FILES) {
    const res = await page.evaluate(async ([f, size]) => window.__FACES__.renderFace(f, size), [file, SIZE]);
    const b64 = res.dataUrl.replace(/^data:image\/png;base64,/, '');
    const buf = Buffer.from(b64, 'base64');
    if (buf.length < 2000) throw new Error(`${file}: 画像が小さすぎる（${buf.length}バイト）。描けていない`);
    await writeFile(resolve(OUT, `${file}.png`), buf);
    console.log(`  ${file}.png ${SIZE}px ${(buf.length / 1024).toFixed(1)}KB（動き：${res.animations.length}種）`);
  }
  if (errors.length) {
    failed = true;
    console.error('エラー', errors);
  }
} catch (e) {
  failed = true;
  console.error('止まった', e);
} finally {
  await browser?.close().catch(() => {});
  await server.close().catch(() => {});
  process.exitCode = failed ? 1 : 0;
}
