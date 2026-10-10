import { test, expect } from '@playwright/test';

const PATH = '/day-063-dark-patterns/';

test('初期スタート画面が正常に表示される', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(PATH);
  await expect(page.getByRole('heading', { name: '解約ボタンは、どれ？' })).toBeVisible();
  await expect(page.locator('#btn-start-game')).toBeVisible();

  expect(errors).toEqual([]);
});

test('全5ステージを完全看破してリザルトSランクに到達する', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(PATH);
  await page.locator('#btn-start-game').click();

  // STAGE 1: 単品購入で看破
  await expect(page.locator('#hud-stage-text')).toContainText('1 / 5');
  await page.locator('#btn-stage1-subtle').click();
  await expect(page.locator('#modal-cleared')).toHaveClass(/active/);
  await page.locator('#btn-next-stage').click();

  // STAGE 2: 屈辱的リンクをクリックして看破
  await expect(page.locator('#hud-stage-text')).toContainText('2 / 5');
  await page.locator('#btn-reject-confirmshame').click();
  await expect(page.locator('#modal-cleared')).toHaveClass(/active/);
  await page.locator('#btn-next-stage').click();

  // STAGE 3: キャンセル無料プランを選択して看破
  await expect(page.locator('#hud-stage-text')).toContainText('3 / 5');
  await page.locator('input[value="freecancel"]').check();
  await page.locator('#btn-hotel-submit').click();
  await expect(page.locator('#modal-cleared')).toHaveClass(/active/);
  await page.locator('#btn-next-stage').click();

  // STAGE 4: 二重否定に「はい」を選び、最終確認で「退会する」を押して看破
  await expect(page.locator('#hud-stage-text')).toContainText('4 / 5');
  await page.locator('input[value="leave"]').check();
  await page.locator('#btn-real-cancel').click();
  await expect(page.locator('#btn-final-leave')).toBeVisible();
  await page.locator('#btn-final-leave').click();
  await expect(page.locator('#modal-cleared')).toHaveClass(/active/);
  await page.locator('#btn-next-stage').click();

  // STAGE 5: Web即時解約トグルをONにして無料体験開始
  await expect(page.locator('#hud-stage-text')).toContainText('5 / 5');
  await page.locator('.accordion-summary').click();
  await page.locator('#chk-safe-plan').check();
  await page.locator('#btn-sub-start').click();
  await expect(page.locator('#modal-cleared')).toHaveClass(/active/);
  await page.locator('#btn-next-stage').click();

  // 最終リザルト画面
  await expect(page.locator('#screen-result')).toHaveClass(/active/);
  await expect(page.locator('#result-total-damage')).toContainText('¥0');
  await expect(page.locator('#result-rank-letter')).toContainText(/S|A/);
  await expect(page.locator('#btn-share-x')).toBeVisible();

  expect(errors).toEqual([]);
});
