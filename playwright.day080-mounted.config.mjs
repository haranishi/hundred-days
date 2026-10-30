import {defineConfig} from '@playwright/test';
import base from './playwright.config.mjs';
const port=Number(process.env.DAY080_MOUNT_PORT||4181);
process.env.DAY080_MOUNT_TEST='1';
export default defineConfig({...base,testMatch:'day-080.spec.mjs',use:{...base.use,baseURL:`http://127.0.0.1:${port}`},webServer:{command:`node scripts/serve-mounted.mjs --prefix /100days --port ${port}`,url:`http://127.0.0.1:${port}/100days/`,reuseExistingServer:!process.env.CI,timeout:10000}});
