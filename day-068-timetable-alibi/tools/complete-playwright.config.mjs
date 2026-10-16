import {defineConfig} from '@playwright/test';
import {fileURLToPath} from 'node:url';
export default defineConfig({
 testDir:'../tests',testMatch:'complete-story.spec.mjs',timeout:45000,workers:1,retries:0,reporter:'list',
 outputDir:fileURLToPath(new URL('../../test-results/day068/complete-browser',import.meta.url)),
 use:{baseURL:'http://127.0.0.1:5418',headless:true,browserName:process.env.DAY68_BROWSER==='webkit'?'webkit':'chromium',channel:process.env.DAY68_BROWSER==='webkit'?undefined:'chrome',viewport:{width:1440,height:1000},trace:'retain-on-failure'},
 webServer:{command:'node day-068-timetable-alibi/tools/serve.mjs',cwd:fileURLToPath(new URL('../../',import.meta.url)),url:'http://127.0.0.1:5418/',reuseExistingServer:true,timeout:10000}
});
