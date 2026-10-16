import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
export default defineConfig({
  testDir:'../tests',testMatch:'browser.spec.mjs',timeout:30000,
  fullyParallel:false,workers:1,retries:0,reporter:'list',
  outputDir:fileURLToPath(new URL('../../test-results/day068/browser',import.meta.url)),
  use:{baseURL:'http://127.0.0.1:5418',headless:true,browserName:process.env.DAY68_BROWSER==='webkit'?'webkit':'chromium',channel:process.env.DAY68_BROWSER==='webkit'?undefined:'chrome',viewport:{width:1440,height:900},trace:'retain-on-failure'},
  webServer:{command:'node day-068-timetable-alibi/tools/serve.mjs',cwd:root,url:'http://127.0.0.1:5418/',reuseExistingServer:true,timeout:10000}
});
