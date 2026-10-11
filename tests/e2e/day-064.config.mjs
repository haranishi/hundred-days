import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  testDir: '.',
  testMatch: 'day-064.spec.mjs',
  projects: [
    { name: 'checks', grepInvert: /@experience/ },
    { name: 'experience', grep: /@experience/ },
  ],
  outputDir: '../../test-results/day064',
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: fileURLToPath(new URL(`../../docs/day064/verification/${process.env.DAY064_EVIDENCE_DIR || 'purpose-ui'}/${process.env.DAY064_BROWSER_REPORT || 'browser-results.json'}`, import.meta.url)) }]],
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:5464/day-064-breach-atlas/',
    headless: true,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: 'npm run preview',
    cwd: fileURLToPath(new URL('../../day-064-breach-atlas/source/', import.meta.url)),
    url: 'http://127.0.0.1:5464/day-064-breach-atlas/',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
