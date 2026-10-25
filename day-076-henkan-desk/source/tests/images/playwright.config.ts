import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: 'browser.spec.ts', fullyParallel: false,
  outputDir: '../../test-results/images', reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5176', channel: 'chrome', headless: true },
  webServer: { command: 'npm run dev -- --port 5176 --strictPort', url: 'http://127.0.0.1:5176/tests/images/harness.html', reuseExistingServer: true, timeout: 30_000 },
});
