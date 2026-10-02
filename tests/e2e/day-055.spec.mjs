import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(import.meta.url);
const appDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../day-055-kyaraben');
const fixture = (name) => ({
  name,
  mimeType: 'image/png',
  buffer: readFileSync(resolve(appDir, 'tests/fixtures', name)),
});

const APP = '/day-055-kyaraben/';

async function open(page) {
  await page.goto(APP);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
}

const snap = (page) => page.evaluate(() => window.__kyaraben.snapshot());

async function idle(page, cond = 'true') {
  await page.waitForFunction((expr) => {
    const s = window.__kyaraben.snapshot();
    return !s.busy && s.state !== 'processing' && Function('s', `return (${expr})`)(s);
  }, cond);
  return snap(page);
}

async function useSample(page, which = 'neko') {
  const name = which === 'neko' ? 'サンプルで試す' : 'こどもの絵のサンプル';
  await page.getByRole('button', { name, exact: true }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  return idle(page);
}

async function choose(page, group, value, cond) {
  await page.locator(`input[name="${group}"][value="${value}"]`).check();
  return idle(page, cond ?? `s.${group} === '${value}'`);
}

test('読み込みから操作まで、console エラーが無く、外へ通信しない', async ({ page, baseURL }) => {
  const errors = [];
  const outside = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => {
    const url = r.url();
    if (!url.startsWith(baseURL) && !url.startsWith('data:') && !url.startsWith('blob:')) outside.push(url);
  });
  await open(page);
  await useSample(page, 'neko');
  await choose(page, 'box', 'adult');
  await useSample(page, 'kodomo');
  await page.locator('#file').setInputFiles(fixture('hiyoko.png'));
  await idle(page, "s.state === 'ready'");
  expect(errors).toEqual([]);
  expect(outside).toEqual([]);
});

test('サンプルを押すと3秒以内に設計図が出る', async ({ page }) => {
  await open(page);
  const started = Date.now();
  await page.getByRole('button', { name: 'サンプルで試す', exact: true }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready', { timeout: 3000 });
  expect(Date.now() - started).toBeLessThan(3000);
  const s = await idle(page);
  expect(s.materials.length).toBeGreaterThanOrEqual(3);
  expect(s.steps.night).toBeGreaterThanOrEqual(2);
  expect(s.steps.morning).toBeGreaterThanOrEqual(3);
  expect(s.templates.length).toBeGreaterThanOrEqual(2);
  const colors = await page.evaluate(() => {
    const c = document.getElementById('preview');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4 * 37) if (d[i + 3] > 0) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    return seen.size;
  });
  expect(colors).toBeGreaterThan(30);
  await expect(page.locator('#materials li')).toHaveCount(s.materials.length);
  await expect(page.locator('#templates svg')).toHaveCount(s.templates.length);
});

test('弁当箱を大人にすると、ご飯の量が増える', async ({ page }) => {
  await open(page);
  const before = await useSample(page, 'neko');
  const after = await choose(page, 'box', 'adult');
  expect(after.riceG).toBeGreaterThan(before.riceG);
  expect(after.charMm.w).toBeGreaterThan(before.charMm.w);
  await expect(page.locator('#rice-total')).toContainText(`${after.riceG}g`);
});

test('黄色の層をチーズにすると、アレルゲンに乳が出る', async ({ page }) => {
  await open(page);
  const before = await useSample(page, 'kodomo');
  expect(before.layers.map((l) => l.family)).toContain('yellow');
  expect(before.allergens).not.toContain('乳');
  await page.locator('select[data-family="yellow"]').selectOption('cheese');
  const after = await idle(page, "s.layers.some((l) => l.family === 'yellow' && l.food === 'cheese')");
  expect(after.allergens).toContain('乳');
  await expect(page.locator('#allergy')).toContainText('乳');
});

test('幅390pxで横スクロールが出ず、押せる所は44px以上', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await useSample(page, 'neko');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('button, .btn, select, .seg span, .check, .share__button, input[type="range"]')]
      .filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
      .map((el) => [el.textContent.trim().slice(0, 20) || el.id, Math.round(el.getBoundingClientRect().height)])
      .filter(([, h]) => h < 44),
  );
  expect(small).toEqual([]);
});
