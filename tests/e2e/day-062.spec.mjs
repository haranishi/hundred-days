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

test('位置情報を許可すると現在地から最寄り駅と徒歩分数を自動設定できる', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  // 渋谷駅周辺 (ハチ公前付近) の緯度経度
  await context.setGeolocation({ latitude: 35.6591, longitude: 139.7005 });

  await page.goto(PATH);
  const btnLocate = page.locator('#btn-locate');
  await btnLocate.click();

  // 最寄り駅として渋谷駅がセットされる
  await expect(page.locator('#geo-status-note')).toContainText('渋谷駅');
  await expect(page.locator('#display-station-name')).toContainText('渋谷駅');
  await expect(page.locator('#display-train-time')).toContainText('23:52');

  // 周辺候補ボタンが表示される
  const candidateBox = page.locator('#geo-candidates');
  await expect(candidateBox).toBeVisible();
  const candidateBtns = candidateBox.locator('.geo-candidate-btn');
  expect(await candidateBtns.count()).toBeGreaterThanOrEqual(1);

  // 候補の駅をクリックして切り替えできる
  await candidateBtns.first().click();
  await expect(page.locator('#geo-status-note')).toContainText('切り替えました');
});

