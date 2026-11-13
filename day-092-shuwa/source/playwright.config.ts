import { defineConfig, devices } from '@playwright/test';

const PORT = 4330;
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${PORT}/`, trace: 'retain-on-failure' },
  webServer: {
    command: `npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    { name: 'phone-chromium', testIgnore: /camera\.spec/, use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    { name: 'phone-webkit', testIgnore: /camera\.spec/, use: { ...devices['iPhone 14'] } },
    { name: 'desktop-chromium', testIgnore: /camera\.spec/, use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    // 偽カメラは Chromium だけの起動引数で動く
    {
      name: 'camera-chromium', testMatch: /camera\.spec/,
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, permissions: ['camera'],
        launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } },
    },
  ],
});
