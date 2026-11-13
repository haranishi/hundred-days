import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createDefaultProgress } from '../../src/store/schema';
import { guardPointerLock } from './pointerlock';

// 組み込み先と同じ階層で、ルート直下の参照を404にして検証する。
test('100日の下の階層でもPWAの範囲・アイコン・オフライン画面が使える', async ({ page, context }) => {
  const prefix = '/100days/day-092-tekotoba/';
  const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
  const mime: Record<string, string> = { html: 'text/html', js: 'application/javascript', css: 'text/css', webmanifest: 'application/manifest+json', png: 'image/png', svg: 'image/svg+xml', woff2: 'font/woff2' };
  const server = createServer(async (request, response) => {
    const path = new URL(request.url!, 'http://localhost').pathname;
    if (!path.startsWith(prefix)) { response.writeHead(404); response.end(); return; }
    try {
      const file = resolve(dist, decodeURIComponent(path.slice(prefix.length)) || 'index.html');
      if (!file.startsWith(dist.endsWith(sep) ? dist : `${dist}${sep}`)) throw new Error('outside');
      const body = await readFile(file); response.setHeader('Content-Type', mime[file.split('.').at(-1)!] ?? 'application/octet-stream'); response.end(body);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${address.port}${prefix}`;
  try {
    await guardPointerLock(page);
    const state = createDefaultProgress(); state.settings.onboarded = true;
    await page.addInitScript(value => localStorage.setItem('tekotoba:v1', JSON.stringify(value)), state);
    await page.goto(`${base}#/about`);
    await page.evaluate(async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })); });
    expect(await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)).toBe(base);
    const manifestUrl = await page.locator('link[rel="manifest"]').getAttribute('href');
    const manifest = await (await context.request.get(new URL(manifestUrl!, base).href)).json();
    for (const icon of manifest.icons) expect((await context.request.get(new URL(icon.src, base).href)).ok()).toBe(true);
    await context.setOffline(true); await page.reload();
    await expect(page.getByRole('heading', { name: 'このアプリについて', exact: true })).toBeVisible();
    await page.getByRole('link', { name: '図鑑', exact: true }).click(); await page.locator('a[href="#/dict/kana-a"]').click();
    await expect(page.getByRole('heading', { name: '自分で作るときのコツ' })).toBeVisible();
  } finally { await context.setOffline(false); await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); }
});
