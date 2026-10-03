// OWNER: tests
// E2E：本番ビルドをプレビューで配り、GPU を使うブラウザで読み込みと撮影モードを確かめる。
// ブラウザは tools/lib/browser.mjs が決める（DR_BROWSER=chromium|webkit|auto。既定 auto＝画面がロック中なら webkit）。
import { defineConfig } from '@playwright/test';
import { launchArgs, resolveBrowser } from './tools/lib/browser.mjs';

// r01-city：並行する担当とぶつからないよう、E2E_PORT（ポート）と DR_OUT_DIR（ビルドの置き場所）で変えられる
const PORT = Number(process.env.E2E_PORT ?? 5303);
const OUT_DIR = process.env.DR_OUT_DIR ?? '../game';

// この設定は親とワーカーの両方で読まれる。親で決めた答えを環境変数に書いて、
// ワーカー（と e2e/fixtures.ts）が途中でロックの状態が変わっても同じブラウザを使うようにする
const BROWSER = resolveBrowser() as { name: 'chromium' | 'webkit'; reason: string };
process.env.DR_BROWSER = BROWSER.name;
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
    command: `npx vite build --logLevel warn --outDir ${OUT_DIR} && npx vite preview --outDir ${OUT_DIR} --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
