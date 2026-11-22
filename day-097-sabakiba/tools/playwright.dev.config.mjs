// 開発サーバー（tools/serve.mjs・本番と同じCSP）に対して E2E を流す設定。Chromium と WebKit の両方。
// 使い方: DAY097_BASE=/ npx playwright test --config day-097-sabakiba/tools/playwright.dev.config.mjs
import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT || 5197);

export default defineConfig({
  testDir: '../../tests/e2e',
  testMatch: 'day-097.spec.mjs',
  timeout: 40_000,
  workers: 1,
  reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${port}`, headless: true, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: { command: `node day-097-sabakiba/tools/serve.mjs --port ${port}`, url: `http://127.0.0.1:${port}`, reuseExistingServer: true, timeout: 10_000, cwd: '../..' },
});
