import { test, expect } from '@playwright/test';

const appUrl = 'https://hakoniwa-map.haranishi.workers.dev/japan/';

for (const width of [390, 768, 1440]) {
  test(`Day51の外部公開アプリを一覧から開ける (${width}px)`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 900 });
    await context.route(`${appUrl}**`, route => route.fulfill({
      contentType: 'text/html', body: '<title>ハコニワ — Day51</title><h1>全国マップ</h1>',
    }));
    await page.goto('/');
    const card = page.locator('article[data-day="051"]');
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('309,253施設');
    const screenshot = card.locator('img');
    await expect(screenshot).toBeVisible();
    /* 一覧のスクショは loading="lazy"。新しいDayが上に増えるとカードが下へずれ、
       390px幅では読み込みの範囲の外に出る（Day 053 を足したときに落ちた）。人と同じくカードまで下げてから測る */
    await screenshot.scrollIntoViewIfNeeded();
    await expect(screenshot).toHaveJSProperty('naturalWidth', 1440);
    const link = card.getByRole('link', { name: /紹介ページを開く/ });
    await expect(link).toHaveAttribute('href', appUrl);
    await expect(link).toHaveAttribute('rel', 'noopener');
    const popupEvent = page.waitForEvent('popup');
    await link.click();
    const popup = await popupEvent;
    await expect(popup).toHaveURL(appUrl);
    await popup.close();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
