import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT || 4173);

export default defineConfig({
  testDir: './tests/e2e',
  // Day64's source/Wasm checks use their own build and preview server.
  // Cross-app tests still cover its published files here.
  testIgnore: 'day-064.spec.mjs',
  timeout: 30_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  // CIで E2E_TIMING_FILE があるときだけ、テストごとの所要時間をJSONで残す。
  // 分割の時間配分（scripts/e2e-shards.mjs）の元になる。手元の実行は変わらない。
  reporter: process.env.CI
    ? [
        ['github'],
        ['html', { open: 'never' }],
        ...(process.env.E2E_TIMING_FILE
          ? [['json', { outputFile: process.env.E2E_TIMING_FILE }]]
          : []),
      ]
    : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node scripts/serve-dist.mjs',
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 10_000,
  },
});
