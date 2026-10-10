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

test('ゲーム開始、ステージ1の操作とスクショ撮影、看破モーダル', async ({ page }) => {
  await page.goto(PATH);

  // ゲーム開始
  await page.locator('#btn-start-game').click();

  // 捜査画面の表示
  await expect(page.locator('#screen-game')).toHaveClass(/active/);
  await expect(page.locator('#hud-stage-text')).toContainText('1 / 5');
  await expect(page.locator('#hud-damage-text')).toContainText('¥0');


  // ステージ1の単品購入ボタンをクリックして看破
  await page.locator('#btn-stage1-subtle').click();

  // 看破モーダルが表示されること
  const modal = page.locator('#modal-cleared');
  await expect(modal).toHaveClass(/active/);
  await expect(modal.locator('#modal-title')).toContainText('罠を見抜き、完全回避！');
  await expect(modal.locator('#modal-stage-damage')).toContainText('¥0');

  // 次へ進む
  await page.locator('#btn-next-stage').click();
  await expect(page.locator('#hud-stage-text')).toContainText('2 / 5');
});
