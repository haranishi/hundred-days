import { defineConfig, devices } from '@playwright/test'

// ひとりで・ふたりでの E2E。vite preview（ビルド済みの dist）を相手にする。
// 公開ページ（共通の共有欄・OGP・本番と同じCSP）の確認は、リポジトリ直下の tests/e2e/day-058.spec.mjs が受け持つ。
const port = Number(process.env.E2E_PORT || 5322)

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /\.spec\.ts$/,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: { command: `npx vite build && npx vite preview --port ${port} --strictPort`, port, reuseExistingServer: true, timeout: 120_000 },
})
