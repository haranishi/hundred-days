import { expect, test } from '@playwright/test';

test.describe('Day 007 web piano', () => {
  test('Given the app, when a mapped PC key is held, then the matching note is shown and released', async ({ page }) => {
    await page.goto('/day-007-web-piano/');

    await expect(page.locator('.key')).toHaveCount(25);
    await expect(page.locator('#current-note')).toHaveText('—');

    await page.keyboard.down('z');
    await expect(page.locator('#current-note')).toHaveText('C4');
    await expect(page.locator('#current-frequency')).toHaveText('261.6 Hz');
    await expect(page.locator('[data-midi="60"]')).toHaveClass(/is-active/);

    await page.keyboard.up('z');
    await expect(page.locator('[data-midi="60"]')).not.toHaveClass(/is-active/);
  });

  test('Given sustain is enabled, when a note is released, then it remains active until sustain is disabled', async ({ page }) => {
    await page.goto('/day-007-web-piano/');

    await page.keyboard.press('Space');
    await expect(page.locator('#sustain')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('z');
    await expect(page.locator('[data-midi="60"]')).toHaveClass(/is-active/);

    await page.keyboard.press('Space');
    await expect(page.locator('#sustain')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('[data-midi="60"]')).not.toHaveClass(/is-active/);
  });

  test('Given an unsupported key, when it is pressed, then no note is selected', async ({ page }) => {
    await page.goto('/day-007-web-piano/');

    await page.keyboard.press('a');
    await expect(page.locator('#current-note')).toHaveText('—');
    await expect(page.locator('.key.is-active')).toHaveCount(0);
  });
});

test('Given the portfolio, when Day 007 demo is inspected, then the audio demo asset is published', async ({ page, request }) => {
  await page.goto('/');

  const demoButton = page.getByRole('button', { name: /Day 007.*ひといきピアノ.*再生/ });
  await expect(demoButton).toHaveAttribute(
    'data-demo',
    './day-007-web-piano/demo-with-audio.mp4',
  );

  const response = await request.get('/day-007-web-piano/demo-with-audio.mp4');
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toBe('video/mp4');
  expect((await response.body()).byteLength).toBeGreaterThan(100_000);
});
