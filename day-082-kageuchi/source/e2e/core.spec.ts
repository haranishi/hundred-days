// OWNER: core
// 中核の E2E：読み込み・画面の流れ・歩く・一時停止・明るい表門で見つかる・R でやり直す・撮影の構図が全部立つ。
import { boot, collectErrors, expect, state, test, waitGameSeconds, waitScreen } from './fixtures';

test('読み込みでエラーが出ず、タイトルが出る', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);
  await expect(page.getByTestId('screen-title')).toBeVisible();
  expect((await state(page)).screen).toBe('title');
  await expect(page.locator('#game')).toHaveCount(1);
  await page.waitForTimeout(1500);
  expect(errors).toEqual([]);
});

test('タイトル → ステージ選択 → 説明 → 遊ぶ', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);
  await page.getByTestId('btn-start').click();
  await expect(page.getByTestId('screen-select')).toBeVisible();
  await waitScreen(page, 'select');
  // 遊べない2枚は準備中として押せない
  await expect(page.getByTestId('stage-okehazama')).toBeDisabled();
  await expect(page.getByTestId('stage-sekigahara')).toBeDisabled();
  await page.getByTestId('stage-honnoji').click();
  await expect(page.getByTestId('screen-briefing')).toBeVisible();
  await waitScreen(page, 'briefing');
  await expect(page.getByText('敵は本能寺にあり')).toBeVisible();
  await expect(page.getByText('物見の報告')).toBeVisible();
  // r02-fix-play：見取り図（上が北）と、報告の場所の名前（表門・西の裏門・北東の塀）
  await expect(page.getByTestId('brief-map')).toBeVisible();
  await expect(page.locator('.kg-scout-place')).toHaveText(['表門', '西の裏門', '北東の塀']);
  await page.getByTestId('btn-begin').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  await waitScreen(page, 'play');
  const s = await state(page);
  expect(s.player.lightTier).toBe('dark');
  // レーダーの下に信長までの距離（開始地点からおよそ 58m）
  await expect(page.getByTestId('radar-target')).toHaveText(/信長\s*5\dm/);
  expect(errors).toEqual([]);
});

test('歩くと位置が変わる（W を押す・マウスで向きを変える）', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, '?autostart=1&seed=3');
  const s0 = await state(page);
  expect(s0.screen).toBe('play');
  await page.evaluate(() => window.__input!.down('KeyW'));
  await waitGameSeconds(page, 1);
  await page.evaluate(() => window.__input!.up('KeyW'));
  const s1 = await state(page);
  const moved = Math.hypot(s1.player.x - s0.player.x, s1.player.z - s0.player.z);
  expect(moved).toBeGreaterThan(1.2);
  // 北を向いて歩いたので、z が減る
  expect(s1.player.z).toBeLessThan(s0.player.z);
  // マウスの動き（look）でカメラの向きが回る
  await page.evaluate(() => window.__input!.look(400, 0));
  await page.waitForFunction((y) => Math.abs(window.__state!.camera.yaw - y) > 30, s1.camera.yaw);
  expect(errors).toEqual([]);
});

test('Esc で止まり、もう一度 Esc で戻る', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, '?autostart=1&seed=3');
  await waitGameSeconds(page, 0.3);
  await page.evaluate(() => window.__input!.tap('Escape'));
  await expect(page.getByTestId('screen-pause')).toBeVisible();
  await waitScreen(page, 'pause');
  const t0 = (await state(page)).t;
  await page.waitForTimeout(600);
  expect((await state(page)).t).toBe(t0);
  await page.evaluate(() => window.__input!.tap('Escape'));
  await page.waitForFunction(() => window.__state!.screen === 'play');
  await waitGameSeconds(page, 0.2);
  expect(errors).toEqual([]);
});

test('明るい表門へ立って入ると見つかり、討たれた画面に理由が出る。R で初めに戻る', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, '?autostart=1&seed=1');
  // 表門の外（篝火の明かりの縁）に立ち、北（門の中）へ歩いて入る
  await page.evaluate(() => window.__game!.teleport(0, 33.5, 270));
  await page.evaluate(() => window.__input!.down('KeyW'));
  await page.waitForFunction(() => window.__state!.phase === 'alert', null, { timeout: 20_000 });
  await page.evaluate(() => window.__input!.up('KeyW'));
  const found = await state(page);
  expect(found.discoveries).toBe(1);
  expect(found.firstDetect?.lightTier).toBe('lit');
  expect(found.firstDetect?.guardId).toMatch(/^omote-/);
  // r02-fix-play：発見に入ると、帯の下に逃げ方の案内が出る（この試みで一度だけ）。r03-fix-play：抜け方に合わせた文
  await expect(page.getByTestId('alert-tip')).toHaveClass(/kg-on/);
  await expect(page.getByTestId('alert-tip')).toHaveText('走って物陰へ。視線が切れたら、その場を離れてしゃがめ');
  await expect(page.getByTestId('screen-gameover')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('screen-gameover')).toContainText('表門の番兵');
  await expect(page.getByTestId('screen-gameover')).toContainText('灯り');
  // R：読み込み直さずに、初めから
  const navs: string[] = [];
  page.on('framenavigated', (f) => navs.push(f.url()));
  await page.evaluate(() => window.__input!.tap('KeyR'));
  await page.waitForFunction(() => window.__state!.screen === 'play' && window.__state!.t < 1);
  const s = await state(page);
  expect(s.discoveries).toBe(0);
  expect(s.phase).toBe('normal');
  expect(s.outcome).toBeNull();
  expect(Math.hypot(s.player.x + 14, s.player.z - 37.5)).toBeLessThan(0.5);
  await expect(page.getByTestId('alert-tip')).not.toHaveClass(/kg-on/);
  expect(navs).toEqual([]);
  expect(errors).toEqual([]);
});

test('発見中の帯：見られている間は朱で「見られている」、視線が切れると墨と金に変わり残りの秒が減る', async ({ page }) => {
  // r03-fix-play：体験の採点 1 位「見られている間『残り10秒』のまま止まっていることだけが手がかりで、気づきにくい」
  const errors = collectErrors(page);
  await boot(page, '?autostart=1&seed=1&god=1');
  const band = page.locator('.kg-phase');
  await page.evaluate(() => window.__game!.teleport(0, 33.5, 270));
  await page.waitForFunction(() => window.__state!.phase === 'alert', null, { timeout: 20_000 });
  await expect(band).toHaveAttribute('data-watch', 'seen');
  await expect(band).toContainText('見られている');
  // 番兵から見えない開始地点（闇）へ消える
  await page.evaluate(() => window.__game!.teleport(-14, 37.5, 270));
  await expect(band).toHaveAttribute('data-watch', 'unseen');
  await expect(band).toContainText('見られていない');
  const left0 = (await state(page)).phaseLeft;
  await waitGameSeconds(page, 1.5);
  const s1 = await state(page);
  expect(s1.phase).toBe('alert');
  expect(s1.alertUnseen).toBeGreaterThan(1);
  expect(s1.phaseLeft).toBeLessThan(left0 - 1);
  // 色も変わる（朱の帯 → 墨の帯）
  const bg = await band.evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(bg).toBe('rgba(16, 18, 26, 0.86)');
  expect(errors).toEqual([]);
});

test('小石の狙いは、右クリックか Esc で投げずにやめられる（Esc は止めない）。離せば投げるのは今のまま', async ({ page }) => {
  // r03-fix-play：体験の採点「Q を離すと必ず投げ、構え直すための取り消しがない」
  const errors = collectErrors(page);
  await boot(page, '?autostart=1&seed=1&god=1');
  await page.evaluate(() => window.__game!.teleport(-14, 33.5, 270));
  const hint = page.locator('.kg-aimhint');
  // 右クリックでやめる
  await page.evaluate(() => window.__input!.down('KeyQ'));
  await expect(hint).toHaveClass(/kg-on/);
  await expect(hint).toContainText('右クリックでやめる');
  await page.mouse.click(640, 360, { button: 'right' });
  await expect(hint).not.toHaveClass(/kg-on/);
  await page.evaluate(() => window.__input!.up('KeyQ'));
  await waitGameSeconds(page, 0.5);
  let s = await state(page);
  expect(s.player.stones).toBe(5);
  expect(s.stonesUsed).toBe(0);
  // Esc でやめる（一時停止にはならない）
  await page.evaluate(() => window.__input!.down('KeyQ'));
  await expect(hint).toHaveClass(/kg-on/);
  await page.evaluate(() => window.__input!.tap('Escape'));
  await expect(hint).not.toHaveClass(/kg-on/);
  await page.evaluate(() => window.__input!.up('KeyQ'));
  await waitGameSeconds(page, 0.5);
  s = await state(page);
  expect(s.screen).toBe('play');
  expect(s.stonesUsed).toBe(0);
  // 押し直して離せば、今までどおり投げる（狙いが塀越しの境内に届いてから離す）
  await page.evaluate(() => window.__input!.down('KeyQ'));
  await expect(hint).toContainText('右クリックでやめる');
  await page.evaluate(() => window.__input!.up('KeyQ'));
  await page.waitForFunction(() => window.__state!.stonesUsed === 1, null, { timeout: 10_000 });
  // 狙っていないときの Esc は、今までどおり一時停止
  await page.evaluate(() => window.__input!.tap('Escape'));
  await waitScreen(page, 'pause');
  expect(errors).toEqual([]);
});

test('水抜き穴に 12m まで近づくと、レーダーに印が出る', async ({ page }) => {
  // r03-fix-play：体験の採点 3 位「水抜き穴は 7m 手前でも塀の足元の小さな影で、レーダーにも出ない」
  const errors = collectErrors(page);
  await boot(page, '?autostart=1&seed=1&god=1');
  const radar = page.getByTestId('radar');
  await expect(radar).toHaveAttribute('data-marks', '');
  // 東の小路、穴の前 4m
  await page.evaluate(() => window.__game!.teleport(40, -27.1, 180));
  await expect(radar).toHaveAttribute('data-marks', 'hole');
  // 開始地点へ戻ると消える
  await page.evaluate(() => window.__game!.teleport(-14, 37.5, 270));
  await expect(radar).toHaveAttribute('data-marks', '');
  expect(errors).toEqual([]);
});

const SHOTS = ['title', 'start', 'gate', 'courtyard', 'bamboo', 'garden', 'nobunaga', 'finale', 'gameover', 'result'];

for (const name of SHOTS) {
  test(`?shot=${name} が準備完了になる`, async ({ page }) => {
    test.setTimeout(240_000);
    const errors = collectErrors(page);
    await page.goto(`/?shot=${name}`);
    // r01-integrate: art の表示はシェーダーの先作りと AO の積算を待ってから準備完了になる（混んだ機械では十数秒）
    await page.waitForFunction(() => window.__shotReady === true || typeof window.__appError === 'string', null, { timeout: 200_000 });
    expect(await page.evaluate(() => window.__appError ?? null)).toBeNull();
    const info = (await page.evaluate(() => window.__shotInfo!)) as { name: string; calls: number; gpu: string };
    expect(info.name).toBe(name);
    expect(info.calls).toBeGreaterThan(10);
    expect(info.gpu).not.toMatch(/swiftshader|llvmpipe|software/i);
    const want = name === 'title' ? 'title' : name === 'finale' ? 'finale' : name === 'gameover' ? 'gameover' : name === 'result' ? 'result' : 'play';
    expect((await state(page)).screen).toBe(want);
    expect(errors).toEqual([]);
  });
}

test('知らない構図の名前は、起動の失敗として出る', async ({ page }) => {
  await page.goto('/?shot=nonexistent');
  await page.waitForFunction(() => typeof window.__appError === 'string' || window.__shotReady === true, null, { timeout: 60_000 });
  expect(await page.evaluate(() => window.__appError ?? '')).toContain('未知のショット名');
});
