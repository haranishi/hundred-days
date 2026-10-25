import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
export default defineConfig({testDir:'.',testMatch:'browser.spec.ts',timeout:30000,workers:1,use:{baseURL:'http://127.0.0.1:5178'},projects:[{name:'chromium',use:{...devices['Desktop Chrome']}},{name:'webkit',use:{...devices['Desktop Safari']}}],webServer:{cwd:fileURLToPath(new URL('../..', import.meta.url)),command:'npx vite --config tests/pdf/vite.config.ts --port 5178 --strictPort --force',url:'http://127.0.0.1:5178/tests/pdf/harness.html',reuseExistingServer:false}});
