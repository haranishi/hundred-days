import { defineConfig, devices } from '@playwright/test'

// E2E は3系統。
// - 既定（ひとりで）：vite preview（ビルド済みの dist/client）を相手にする
// - E2E_ONLINE=1（ネット対戦）：wrangler dev（画面＋Worker＋Durable Objects）を相手にする。online-*.spec.ts だけを流す
// - E2E_SPLIT=1（画面と Worker を別の origin に分けた構成）：tools/split-e2e.mjs が両方を起こす。split-*.spec.ts だけを流す
// 画面ロック中は Chromium が起動しないので、SY_BROWSER=webkit で WebKit に切り替える。
const online = process.env.E2E_ONLINE === '1'
const split = process.env.E2E_SPLIT === '1'
const port = Number(process.env.E2E_PORT || (online ? 8798 : 5332))
const browserName = process.env.SY_BROWSER === 'webkit' ? 'webkit' : 'chromium'

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: split ? /[\\/]split-[^\\/]*\.spec\.ts$/ : online ? /[\\/]online[^\\/]*\.spec\.ts$/ : /[\\/](?!online|split)[^\\/]*\.spec\.ts$/,
  // 担当ごとにポートを分けて並行で回すと、出力先が同じだと trace が消えて落ちる。ポートとブラウザで分ける
  outputDir: `test-results/${split ? 'split-' : online ? 'online-' : ''}${browserName}-${port}`,
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
    { name: 'mobile', use: { ...devices['Pixel 7'], browserName } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], browserName, viewport: { width: 1440, height: 900 } } },
  ],
  // 分割の構成は、画面と Worker を tools/split-e2e.mjs が起こすので、ここでは起こさない
  webServer: split
    ? undefined
    : online
    ? { command: `npx vite build && npx wrangler dev --local --port ${port}`, port, reuseExistingServer: true, timeout: 180_000 }
    : { command: `npx vite build && npx vite preview --port ${port} --strictPort`, port, reuseExistingServer: true, timeout: 180_000 },
})
