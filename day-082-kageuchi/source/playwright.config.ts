// OWNER: core
// E2E：中核のページだけをビルド（KAGE_PAGES=index → dist-core）し、プレビュー（5403）を GPU のブラウザで確かめる。
// ブラウザは tools/lib/browser.mjs が決める（KAGE_BROWSER=chromium|webkit|auto。既定 auto＝画面がロック中なら webkit）。
import { defineConfig } from '@playwright/test';
import { launchArgs, resolveBrowser } from './tools/lib/browser.mjs';

const PORT = Number(process.env.E2E_PORT ?? 5403);
const OUT_DIR = 'dist-core';

// 親とワーカーの両方で読まれるので、親で決めたブラウザを環境変数に書いて、ワーカーも同じものを使う
const picked = process.env.KAGE_E2E_BROWSER ? { name: process.env.KAGE_E2E_BROWSER, reason: '親で決めた' } : resolveBrowser();
const BROWSER = picked as { name: 'chromium' | 'webkit'; reason: string };
process.env.KAGE_E2E_BROWSER = BROWSER.name;
if (process.env.TEST_WORKER_INDEX === undefined) console.log(`E2E のブラウザ: ${BROWSER.name}（${BROWSER.reason}）`);

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    browserName: BROWSER.name,
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1280, height: 720 },
    launchOptions: { args: launchArgs(BROWSER.name) },
  },
  webServer: {
    command: `KAGE_PAGES=index npx vite build --logLevel warn --outDir ${OUT_DIR} && npx vite preview --outDir ${OUT_DIR} --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
