/**
 * スマホ横（844×390）：達成した直後も、左下の親指の位置からなぞればすぐ動ける（round4 の F1）。
 * 以前は達成のたびに一覧が開いて左の列を覆い、親指が一覧に当たって約3秒スティックが効かなかった。
 * 状態は window.__SY__（?debug=1 のときだけ出る）で読む。
 */
import { expect, test, type Page } from '@playwright/test';

interface Player {
  pos: { x: number; z: number };
  achieved: string[];
  prompt: { label: string } | null;
}
interface SyApi {
  state(): { screen: string; phase: string | null; players: Player[] };
  seed(n: number): void;
  cpu(on: boolean): void;
  teleport(slot: number, x: number, z: number): void;
  face(slot: number, yaw: number): void;
}

const api = (page: Page) => ({
  state: () => page.evaluate(() => (window as unknown as { __SY__: SyApi }).__SY__.state()),
});

test.use({ viewport: { width: 844, height: 390 } });

test('スマホ横：達成した直後に左下(110,300)からなぞると、0.5秒で2m以上動く', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'タッチで遊ぶスマホの試験');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const sy = api(page);

  await page.goto('/?debug=1');
  await page.waitForFunction(() => '__SY__' in window);
  await page.evaluate(() => (window as unknown as { __SY__: SyApi }).__SY__.seed(20261006));
  await page.getByRole('button', { name: /ひとりで/ }).first().click();
  await page.getByRole('button', { name: /ふつう/ }).first().click();
  const start = page.getByRole('button', { name: /^(はじめる|スタート)/ });
  if ((await sy.state()).screen === 'setup' && (await start.count()) > 0) await start.first().click();
  await expect.poll(async () => (await sy.state()).screen, { timeout: 30_000 }).toBe('playing');
  await page.evaluate(() => (window as unknown as { __SY__: SyApi }).__SY__.cpu(false));
  await expect.poll(async () => (await sy.state()).phase, { timeout: 15_000 }).toBe('playing');

  // 缶ピラミッドの「蹴る」が出る所から1回で崩して達成する
  await page.evaluate(() => {
    const a = (window as unknown as { __SY__: SyApi }).__SY__;
    a.teleport(0, 3.5, 7.0);
    a.face(0, Math.PI);
  });
  await expect.poll(async () => (await sy.state()).players[0]!.prompt?.label ?? '').toBe('蹴る');
  await page.getByTestId('btn-action').tap();
  await expect.poll(async () => (await sy.state()).players[0]!.achieved, { timeout: 6_000 }).toContain('pyramid');

  // 横画面では一覧は開かない（見出しが光るだけ）
  await expect(page.getByTestId('hud-list').locator('button').first()).toHaveAttribute('aria-expanded', 'false');

  // すぐに左下の親指の位置からなぞる（その位置にある要素へ、指と同じ pointer イベントを送る）
  const before = (await sy.state()).players[0]!.pos;
  await page.evaluate(() => {
    const target = document.elementFromPoint(110, 300) as HTMLElement;
    const opts = { pointerId: 11, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true };
    target.dispatchEvent(new PointerEvent('pointerdown', { ...opts, clientX: 110, clientY: 300 }));
    (window as unknown as { __syDragTarget: HTMLElement }).__syDragTarget = target;
    let y = 300;
    const step = (): void => {
      y = Math.min(370, y + 24);
      target.dispatchEvent(new PointerEvent('pointermove', { ...opts, clientX: 110, clientY: y }));
      if (y < 370) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  await page.waitForTimeout(500);
  const after = (await sy.state()).players[0]!.pos;
  await page.evaluate(() => {
    const target = (window as unknown as { __syDragTarget: HTMLElement }).__syDragTarget;
    target.dispatchEvent(new PointerEvent('pointerup', { pointerId: 11, pointerType: 'touch', bubbles: true }));
  });
  const moved = Math.hypot(after.x - before.x, after.z - before.z);
  expect(moved, `なぞって0.5秒で動いた距離 ${moved.toFixed(2)}m`).toBeGreaterThanOrEqual(2);
  // 下（南）へなぞったので、南（z が増える向き）へ動いた
  expect(after.z).toBeGreaterThan(before.z);

  // 重なりの片付け（round4 の F5）：放送の字幕は上の帯の下、コンボはジャンプのボタンより上
  const pa = await page.getByTestId('hud-pa').boundingBox();
  expect(pa!.y).toBeLessThan(390 * 0.3);
  const jump = await page.getByTestId('btn-jump').boundingBox();
  const comboBox = await page.getByTestId('hud-combo').boundingBox();
  if (comboBox && jump) expect(comboBox.y + comboBox.height).toBeLessThanOrEqual(jump.y);

  await page.screenshot({ path: testInfo.outputPath('landscape-after-achieve.png') });
  expect(errors).toEqual([]);
});
