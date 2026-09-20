import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', testMatch: 'day-044.spec.mjs', timeout: 30000,
  workers: 1, retries: 0, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:8444', headless: true, trace: 'retain-on-failure' },
  webServer: { command: 'node day-044-train-here/tools/serve.mjs', cwd: new URL('..', import.meta.url).pathname, url: 'http://127.0.0.1:8444/day-044-train-here/', reuseExistingServer: !process.env.CI },
});
