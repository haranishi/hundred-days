// OWNER: core
import { boot, collectErrors, expect, state, test, waitGameSeconds } from './fixtures';

test('板戸を使って通路を開き、攻略段階が進む。Rで初期状態へ戻る', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, '?autostart=1&seed=1&god=1');
  await page.evaluate(() => window.__game!.teleport(-33, -10.9, 270));
  await page.waitForFunction(() => window.__state?.mission.interaction === '竹林の板戸を開く');
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__state?.interactions.find((v) => v.id === 'bamboo-door')?.used);
  await expect(page.getByTestId('mission-message')).toContainText('板戸を開いた');
  await page.keyboard.down('KeyW');
  await waitGameSeconds(page, 1.4);
  await page.keyboard.up('KeyW');
  expect((await state(page)).player.z).toBeLessThan(-12.5);
  await expect(page.getByTestId('mission-stage')).toContainText('3 / 4');
  await page.keyboard.press('KeyR');
  await page.waitForFunction(() => window.__state?.t < 0.8);
  expect((await state(page)).interactions.every((v) => !v.used)).toBe(true);
  expect(errors).toEqual([]);
});

test('消灯の操作で灯りと状態が変わり、作業に成功した表示が出る', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, '?autostart=1&seed=1&god=1');
  await page.evaluate(() => window.__game!.teleport(-2.8, -9.5, 270));
  await page.waitForFunction(() => window.__state?.mission.interaction === '中門の灯籠を消す');
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__state?.interactions.find((v) => v.id === 'lamp-center-w')?.used);
  await expect(page.getByTestId('mission-message')).toContainText('消灯');
  expect(errors).toEqual([]);
});

test('Fで信長以外へ正面攻撃でき、1撃でよろめき、2撃で制圧できる', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, '?autostart=1&seed=1&god=1');
  // 表門左の番兵の正面。間合いと視線は通常の判定、godは検証中の敗北だけを防ぐ。
  await page.evaluate(() => window.__game!.teleport(-1.5, 29.5, 270));
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => window.__state?.guards.some((g) => g.id === 'omote-l' && g.state === 'stagger'));
  await expect(page.getByTestId('mission-message')).toContainText('命中');
  await waitGameSeconds(page, 0.5);
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => window.__state?.guards.find((g) => g.id === 'omote-l')?.down);
  expect((await state(page)).takedowns).toBe(1);
  await expect(page.getByTestId('mission-message')).toContainText('制圧');
  expect((await state(page)).outcome).toBeNull();
  expect(errors).toEqual([]);
});

test('発見中の番兵は1撃で永久停止せず、よろめき後に追跡へ戻る', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, '?autostart=1&seed=1&god=1');
  await page.evaluate(() => window.__game!.teleport(-1.5, 29.5, 270));
  await page.waitForFunction(() => window.__state?.phase === 'alert');
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => window.__state?.guards.find((g) => g.id === 'omote-l')?.state === 'stagger');
  await page.waitForFunction(() => window.__state?.guards.find((g) => g.id === 'omote-l')?.state === 'chase');
  expect((await state(page)).guards.find((g) => g.id === 'omote-l')!.down).toBe(false);
  expect(errors).toEqual([]);
});
