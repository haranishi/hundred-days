import { test, expect } from '@playwright/test';

const PATH = '/day-062-last-train/';

test('初期画面が正常に表示され、カウントダウンとステータスが動作する', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(PATH);
  await expect(page.getByRole('heading', { name: '終電サドンデス' })).toBeVisible();

  // 初期値の駅名と終電時刻
  await expect(page.locator('#display-station-name')).toContainText('新宿駅');
  await expect(page.locator('#display-train-time')).toContainText('23:55');

  // カウントダウン桁とデッドラインが表示されていること
  await expect(page.locator('#digit-minutes')).toBeVisible();
  await expect(page.locator('#val-deadline')).toBeVisible();
  await expect(page.locator('#val-loss-total')).toContainText('18 分');

  expect(errors).toEqual([]);
});

test('プリセット駅の変更とタイムロスの調整がリアルタイムに反映される', async ({ page }) => {
  await page.goto(PATH);

  // 渋谷駅を選択 (walkMinutes は 8分)
  await page.getByRole('button', { name: '渋谷駅' }).click();
  await expect(page.locator('#display-station-name')).toContainText('渋谷駅');
  await expect(page.locator('#display-train-time')).toContainText('23:52');

  // トイレ寄道チェック(+4分)を入れる
  const toiletCheck = page.locator('#check-toilet');
  await toiletCheck.check();
  // 渋谷駅(19分) + 4分(トイレ) = 23分
  await expect(page.locator('#val-loss-total')).toContainText('23 分');

  // 徒歩スライダーを15分に変更
  const slider = page.locator('#walk-slider');
  await slider.fill('15');
  // 23分 - 8分(渋谷徒歩) + 15分(新徒歩) = 30分
  await expect(page.locator('#val-loss-total')).toContainText('30 分');
});

test('脱出完了ボタンでモーダルが開きシェアリンクが生成される', async ({ page }) => {
  await page.goto(PATH);

  // 脱出完了ボタンをクリック
  await page.locator('#btn-escaped').click();

  // モーダルが表示される
  const modal = page.locator('#success-modal');
  await expect(modal).toHaveClass(/active/);
  await expect(modal.locator('#modal-title')).toContainText('脱出成功');

  // Xシェアリンクが生成されている
  const shareLink = modal.locator('#btn-modal-share');
  await expect(shareLink).toHaveAttribute('href', /twitter\.com\/intent\/tweet/);

  // 閉じるボタンで閉じる
  await modal.locator('#btn-modal-close').click();
  await expect(modal).not.toHaveClass(/active/);
});
