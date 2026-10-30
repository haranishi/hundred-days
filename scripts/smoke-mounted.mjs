import { chromium } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { once } from 'node:events';
import { createMountedServer, optionsFromArgs } from './serve-mounted.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const { prefix, port } = optionsFromArgs();
// --base <URL> を付けると、手元のサーバーを立てず、公開済みのURL（プレビュー・本番）を同じ検査にかける。
const baseIndex = process.argv.indexOf('--base');
const remoteBase = baseIndex > 0 ? process.argv[baseIndex + 1] : '';
const server = remoteBase ? null : createMountedServer({ prefix });
if (server) {
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
}
let browser;
const errors = [];
try {
  // 検査でGA4に送らない（一覧ページには本物の測定IDが入っている）。DNSで止めると、閉じる瞬間の送信もすり抜けない。
  // HOST_MAP=ホスト=IP は、この回線のDNSが新しいドメインを引けないときの向き先の差し替え（本番の検査用）。
  const rules = ['MAP *.google-analytics.com ~NOTFOUND', 'MAP *.googletagmanager.com ~NOTFOUND'];
  if (process.env.HOST_MAP) rules.unshift(`MAP ${process.env.HOST_MAP.split('=')[0]} ${process.env.HOST_MAP.split('=')[1]}`);
  browser = await chromium.launch({ args: [`--host-resolver-rules=${rules.join(', ')}`] });
  // 公開先に当てる検査は、UAの末尾に印を付ける（アクセス解析の急増を、自分の検査と見分けるため）
  const probe = await browser.newContext();
  const userAgent = `${await (await probe.newPage()).evaluate(() => navigator.userAgent)} hosting-verify`;
  await probe.close();
  const base = remoteBase ? remoteBase.replace(/\/*$/, '/') : `http://127.0.0.1:${server.address().port}${prefix}/`;
  const days = readdirSync(root).filter(name => /^day-\d{3}-/.test(name)).sort().filter(name => {
    const meta = JSON.parse(readFileSync(join(root, name, 'meta.json'), 'utf8'));
    return meta.status === 'published' && !meta.externalUrl && meta.mount !== false;
  });
  for (const path of ['', ...days.map(day => day + '/')]) {
    const context = await browser.newContext({ userAgent });
    const page = await context.newPage();
    const label = path || 'index';
    const favicon = url => new URL(url).pathname.endsWith('/favicon.ico');
    const allowedFavicon404 = new Set();
    const analyticsHost = url => /(^|\.)(google-analytics|googletagmanager)\.com$/.test(new URL(url).hostname);
    page.on('requestfailed', request => {
      if (analyticsHost(request.url())) return;
      errors.push(`${label}: requestfailed ${request.url()} ${request.failure()?.errorText}`);
    });
    page.on('response', response => {
      if (response.status() >= 400) {
        if (response.status() === 404 && favicon(response.url())) allowedFavicon404.add(response.url());
        else errors.push(`${label}: HTTP ${response.status()} ${response.url()}`);
      }
    });
    page.on('console', message => {
      if (message.type() === 'error') {
        const url = message.location().url;
        // Chromium also reports favicon HTTP failures in the console.
        if (allowedFavicon404.has(url) || (url && analyticsHost(url))) return;
        errors.push(`${label}: console ${message.text()}`);
      }
    });
    page.on('pageerror', error => errors.push(`${label}: pageerror ${error.message}`));
    try { await page.goto(base + path, { waitUntil: 'load', timeout: 30000 }); }
    catch (error) { errors.push(`${label}: navigation ${error.message}`); }
    await page.waitForTimeout(1000);
    await context.close();
    console.log(`checked ${label}`);
  }
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`mounted smoke (${remoteBase || prefix || '/'}) passed`);
