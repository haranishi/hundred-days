// 開発サーバー（tools/serve.mjs・本番と同じCSP）に対して E2E を流す設定。Chromium と WebKit の両方。
// 使い方: DAY096_BASE=/ npx playwright test --config day-096-ux-recipe/tools/playwright.dev.config.mjs
import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT || 5196);

export default defineConfig({
  testDir: '../../tests/e2e',
  testMatch: 'day-096.spec.mjs',
  timeout: 40_000,
  workers: 1,
  reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${port}`, headless: true, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: { command: `node day-096-ux-recipe/tools/serve.mjs --port ${port}`, url: `http://127.0.0.1:${port}`, reuseExistingServer: true, timeout: 10_000, cwd: '../..' },
});
