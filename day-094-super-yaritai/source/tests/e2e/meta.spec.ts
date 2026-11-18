/**
 * OGP と canonical（シェアしたリンクがのっぺらぼうにならないように）。公開先の URL は src/client/site.ts と一致させる。
 */
import { expect, test } from '@playwright/test';
import { OG_IMAGE_URL, SITE_URL } from '../../src/client/site';

test('OGP・canonical のタグがあり、公開先の URL と一致する', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/スーパーやりたい放題/);
  const attr = (sel: string, name: string): Promise<string | null> => page.locator(sel).first().getAttribute(name);
  expect(await attr('link[rel="canonical"]', 'href')).toBe(SITE_URL);
  expect(await attr('meta[property="og:url"]', 'content')).toBe(SITE_URL);
  expect(await attr('meta[property="og:image"]', 'content')).toBe(OG_IMAGE_URL);
  for (const p of ['og:title', 'og:description', 'og:type', 'og:site_name']) {
    expect((await attr(`meta[property="${p}"]`, 'content'))?.length ?? 0, p).toBeGreaterThan(0);
  }
  expect(await attr('meta[name="twitter:card"]', 'content')).toBe('summary_large_image');
  expect((await attr('meta[name="description"]', 'content'))?.length ?? 0).toBeGreaterThan(20);
  expect(await attr('meta[name="viewport"]', 'content')).toContain('width=device-width');
  expect(await attr('link[rel="apple-touch-icon"]', 'href')).toBe('/apple-touch-icon.png');
  for (const path of ['/og.png', '/favicon.svg', '/apple-touch-icon.png', '/404.html']) {
    const res = await page.request.get(path);
    expect(res.status(), path).toBe(200);
  }
});

test('試験用の窓口 __SY__ は ?debug=1 のときだけ出る', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => '__SY__' in window)).toBe(false);
  await page.goto('/?debug=1');
  await page.waitForFunction(() => '__SY__' in window);
});
