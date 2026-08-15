import { expect, test } from '@playwright/test';

const TOKYO = { latitude: 35.6812, longitude: 139.7671 };

test.describe('Day 008 vending radar (geolocation granted)', () => {
  test.use({ geolocation: TOKYO, permissions: ['geolocation'] });

  test('Given a granted location, when searching, then nearby machines appear on the radar and list', async ({ page }) => {
    await page.goto('/day-008-vending-radar/');

    await page.getByRole('button', { name: /現在地からさがす/ }).click();
    await expect(page.locator('#results')).toBeVisible({ timeout: 20_000 });

    const items = page.locator('#result-list li');
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(1);
    expect(count).toBeLessThanOrEqual(10);

    const first = (await items.first().innerText()).replace(/\s+/g, ' ');
    expect(first).toMatch(/(北東|南東|南西|北西|北|南|東|西)/);
    expect(first).toMatch(/約\d+(\.\d+)?(m|km)/);

    await expect(page.locator('#radar')).toBeVisible();
    await expect(page.locator('footer')).toContainText('収録');
    await expect(page.locator('footer')).toContainText('OpenStreetMap contributors');

    const mapLink = page.locator('#result-list a.map-link').first();
    await expect(mapLink).toHaveAttribute('href', /^https:\/\/www\.google\.com\/maps\?q=\d+\.\d+,\d+\.\d+$/);
  });

  test('Given a search result, when a list item is selected, then the row is highlighted', async ({ page }) => {
    await page.goto('/day-008-vending-radar/');
    await page.getByRole('button', { name: /現在地からさがす/ }).click();
    await expect(page.locator('#results')).toBeVisible({ timeout: 20_000 });

    await page.locator('.result-select').first().click();
    await expect(page.locator('.result-item').first()).toHaveClass(/is-selected/);
  });
});

test.describe('Day 008 vending radar (geolocation denied)', () => {
  test('Given no location permission, when searching, then station fallback finds machines', async ({ page }) => {
    await page.goto('/day-008-vending-radar/');

    await page.getByRole('button', { name: /現在地からさがす/ }).click();
    await expect(page.locator('#station-panel')).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: '東京駅' }).click();
    await expect(page.locator('#results')).toBeVisible({ timeout: 20_000 });
    expect(await page.locator('#result-list li').count()).toBeGreaterThanOrEqual(1);
  });
});

test('Given the portfolio, when Day 008 assets are inspected, then data, demo, and screenshot are published', async ({ page, request }) => {
  await page.goto('/');
  const demoButton = page.getByRole('button', { name: /Day 008.*じはんきレーダー.*再生/ });
  await expect(demoButton).toHaveAttribute('data-demo', './day-008-vending-radar/demo.mp4');

  const data = await request.get('/day-008-vending-radar/data/vending.json');
  expect(data.ok()).toBe(true);
  const parsed = await data.json();
  expect(parsed.count).toBeGreaterThan(10_000);
  expect(parsed.count).toBe(parsed.points.length);

  const demo = await request.get('/day-008-vending-radar/demo.mp4');
  expect(demo.ok()).toBe(true);
  expect((await demo.body()).byteLength).toBeGreaterThan(100_000);

  const shot = await request.get('/day-008-vending-radar/screenshot.webp');
  expect(shot.ok()).toBe(true);
});
