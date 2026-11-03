// OWNER: core
// タッチ操作の E2E（電話の横向き 844×390・hasTouch・isMobile）。2026-11-03 スマホ対応で新設（tasks 2.4・3.1 の最小限）。
// 指は e2e/touch-helper.ts（Chromium は CDP の本物のタッチ、それ以外は PointerEvent の代替）。どの試験もコンソールのエラー0・外部への通信0。
import type { Page } from '@playwright/test';
import { boot, collectErrors, expect, state, test, waitGameSeconds, waitScreen } from './fixtures';
import { Fingers, center } from './touch-helper';

const PHONE = { width: 844, height: 390 };
/** スティック領域の中（左下）と、視点領域の中（右の中ほど。ボタンの群れと一時停止を避ける）。 */
const STICK = { x: 150, y: 280 };
const LOOK = { x: 560, y: 150 };

/** 外への通信（127.0.0.1 以外）を数える。 */
function collectExternal(page: Page): string[] {
  const out: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if ((u.protocol === 'http:' || u.protocol === 'https:') && u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') out.push(r.url());
  });
  return out;
}

async function touchInfo(page: Page) {
  return page.evaluate(() => window.__touch!.info()!);
}

test.describe('タッチ操作（電話の横向き）', () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  test('タッチ層が出て、クリックで視点をつかむ案内は出ない。歩くの目印がある', async ({ page }) => {
    const errors = collectErrors(page);
    const ext = collectExternal(page);
    await boot(page, '?touch=1&autostart=1&seed=3');
    await expect(page.locator('html')).toHaveClass(/kg-touch/);
    await expect(page.getByTestId('touch-layer')).toBeVisible();
    await expect(page.locator('.kg-lockhint')).toBeHidden();
    await expect(page.locator('.kg-stick-hint')).toContainText('歩く');
    for (const id of ['touch-btn-action', 'touch-btn-crouch', 'touch-btn-stone', 'touch-btn-attack', 'touch-btn-pause']) {
      const box = (await page.getByTestId(id).boundingBox())!;
      expect(box.width, id).toBeGreaterThanOrEqual(44);
      expect(box.height, id).toBeGreaterThanOrEqual(44);
      // 画面の中に収まる
      expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width);
      expect(box.y + box.height).toBeLessThanOrEqual(PHONE.height);
    }
    expect((await page.getByTestId('touch-btn-action').boundingBox())!.width).toBeGreaterThanOrEqual(64);
    // ボタン同士が重ならない
    const boxes = await page.locator('.kg-tbtn').evaluateAll((els) => els.filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.getBoundingClientRect().toJSON() as DOMRect));
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        expect(overlap, `${i}と${j}`).toBe(false);
      }
    // 最初のタッチで音が始まる
    expect(await page.evaluate(() => window.__audio!.started)).toBe(false);
    const f = await Fingers.create(page);
    await f.tap(2, LOOK.x, LOOK.y);
    await page.waitForFunction(() => window.__audio!.started === true);
    // 3つの電話サイズで、キャンバスが見えている大きさと 1px 以内で一致し、ページが動かない
    for (const size of [PHONE, { width: 667, height: 375 }, { width: 568, height: 320 }]) {
      await page.setViewportSize(size);
      await page.waitForTimeout(150);
      const fit = await page.evaluate(() => {
        const r = document.getElementById('game')!.getBoundingClientRect();
        return { dw: Math.abs(r.width - innerWidth), dh: Math.abs(r.height - innerHeight), sx: scrollX, sy: scrollY, iw: innerWidth };
      });
      expect(fit.iw, `${size.width}`).toBe(size.width);
      expect(fit.dw, `${size.width}`).toBeLessThanOrEqual(1);
      expect(fit.dh, `${size.width}`).toBeLessThanOrEqual(1);
      expect(fit.sx).toBe(0);
      expect(fit.sy).toBe(0);
    }
    expect(errors).toEqual([]);
    expect(ext).toEqual([]);
  });

  test('スティックを上へ倒すと前へ歩き、離すと止まる。外の輪まで倒すと走り、戻すと歩き', async ({ page }) => {
    const errors = collectErrors(page);
    const ext = collectExternal(page);
    await boot(page, '?touch=1&autostart=1&seed=3&god=1');
    const f = await Fingers.create(page);
    const s0 = await state(page);
    await f.down(1, STICK.x, STICK.y);
    await expect(page.locator('.kg-stick-hint')).toBeHidden();
    await expect(page.locator('.kg-stick-ring')).toBeVisible();
    await f.move(1, STICK.x, STICK.y - 50);
    // 指の動きはコマに合わせて届くので、届くまで待つ
    await expect.poll(async () => (await touchInfo(page)).stick.y).toBeGreaterThan(0.85);
    const ti = await touchInfo(page);
    expect(ti.stick.down).toBe(true);
    expect(ti.stick.run).toBe(false);
    await waitGameSeconds(page, 1);
    const s1 = await state(page);
    expect(Math.hypot(s1.player.x - s0.player.x, s1.player.z - s0.player.z)).toBeGreaterThan(0.8);
    // 北を向いて始まるので、前へ歩くと z が減る
    expect(s1.player.z).toBeLessThan(s0.player.z);
    expect(s1.player.stance).not.toBe('run');
    // 外の輪（1.4R＝約73px）を越える
    await f.move(1, STICK.x, STICK.y - 85);
    await expect.poll(async () => (await touchInfo(page)).stick.run).toBe(true);
    await expect(page.getByTestId('touch-stick')).toHaveClass(/kg-run/);
    await expect(page.locator('.kg-stick-knob')).toHaveText('走る');
    await page.waitForFunction(() => window.__state!.player.stance === 'run', null, { timeout: 5_000 });
    // 1.25R（65px）より内へ戻すと歩き
    await f.move(1, STICK.x, STICK.y - 55);
    await expect.poll(async () => (await touchInfo(page)).stick.run).toBe(false);
    await page.waitForFunction(() => window.__state!.player.stance !== 'run', null, { timeout: 5_000 });
    await f.up(1);
    await expect.poll(async () => (await touchInfo(page)).stick).toMatchObject({ x: 0, y: 0, run: false, down: false });
    await waitGameSeconds(page, 0.8);
    expect((await state(page)).player.speed).toBeLessThan(0.05);
    await expect(page.locator('.kg-stick-hint')).toBeVisible();
    expect(errors).toEqual([]);
    expect(ext).toEqual([]);
  });

  test('右をなぞると視点が回る。スティックと視点を2本の指で同時に動かせる', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, '?touch=1&autostart=1&seed=3&god=1');
    const f = await Fingers.create(page);
    const y0 = (await state(page)).camera.yaw;
    await f.down(2, LOOK.x, LOOK.y);
    await f.move(2, LOOK.x + 150, LOOK.y, 10);
    await f.up(2);
    await page.waitForFunction((y) => Math.abs(window.__state!.camera.yaw - y) > 5, y0);
    // 右へなぞると、マウスで右へ動かしたときと同じ向きへ回る
    const y1 = (await state(page)).camera.yaw;
    await page.evaluate(() => window.__input!.look(150 * 1.2, 0));
    await page.waitForFunction((y) => Math.abs(window.__state!.camera.yaw - y) > 1, y1);
    const y2 = (await state(page)).camera.yaw;
    expect(Math.sign(y1 - y0)).toBe(Math.sign(y2 - y1));
    // 2本の指
    const s0 = await state(page);
    await f.down(1, STICK.x, STICK.y);
    await f.down(2, LOOK.x, LOOK.y);
    await f.move(1, STICK.x, STICK.y - 50, 3);
    await f.move(2, LOOK.x - 120, LOOK.y, 8);
    await waitGameSeconds(page, 0.8);
    const ti = await touchInfo(page);
    expect(ti.stick.down).toBe(true);
    expect(ti.stick.y).toBeGreaterThan(0.8);
    const s1 = await state(page);
    expect(Math.abs(s1.camera.yaw - s0.camera.yaw)).toBeGreaterThan(5);
    expect(Math.hypot(s1.player.x - s0.player.x, s1.player.z - s0.player.z)).toBeGreaterThan(0.5);
    await f.up(2);
    // 視点の指だけを離しても、スティックの指は残る（4.3 追加：試験の指の離し方の誤りを直した確認）
    await expect.poll(async () => (await touchInfo(page)).stick.down).toBe(true);
    await f.up(1);
    await expect.poll(async () => (await touchInfo(page)).stick.down).toBe(false);
    // タッチ層が受けた pointer イベントは、指の分だけ数えられ、マウスは0（4.3 追加）
    const ev = (await touchInfo(page)).events;
    expect(ev.touch).toBeGreaterThan(20);
    expect(ev.mouse).toBe(0);
    expect(errors).toEqual([]);
  });

  test('しゃがむ・攻撃・当て身（討つ）の各ボタンで状態が変わる', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, '?touch=1&autostart=1&seed=1&god=1');
    const f = await Fingers.create(page);
    // しゃがむ（切り替え）。文字でも分かる
    await f.tapEl(1, 'touch-btn-crouch');
    await page.waitForFunction(() => window.__state!.player.crouch === true);
    await expect(page.getByTestId('touch-btn-crouch')).toHaveText('立つ');
    await expect(page.getByTestId('touch-btn-crouch')).toHaveAttribute('aria-pressed', 'true');
    await f.tapEl(1, 'touch-btn-crouch');
    await page.waitForFunction(() => window.__state!.player.crouch === false);
    await expect(page.getByTestId('touch-btn-crouch')).toHaveText('しゃがむ');
    // 攻撃（表門左の番兵の正面）
    await page.evaluate(() => window.__game!.teleport(-1.5, 29.5, 270));
    await waitGameSeconds(page, 0.2);
    await f.tapEl(1, 'touch-btn-attack');
    await page.waitForFunction(() => window.__state?.guards.some((g) => g.id === 'omote-l' && g.state === 'stagger'), null, { timeout: 5_000 });
    // 当て身：何もないときは「当て身」が薄い
    await page.evaluate(() => window.__game!.teleport(-14, 37.5, 270));
    await waitGameSeconds(page, 0.3);
    await expect(page.getByTestId('touch-btn-action')).toHaveText('当て身');
    await expect(page.getByTestId('touch-btn-action')).toHaveClass(/kg-dim/);
    // 信長の背後へ置くと「討つ」に変わり、押せば討ち取りの演出へ
    await page.waitForFunction(
      () => {
        const nb = window.__state!.guards.find((g) => g.id === 'nobunaga');
        if (!nb) return false;
        if (window.__state!.player.prompt === 'assassinate') return true;
        const v = (nb.view * Math.PI) / 180;
        window.__game!.teleport(nb.x - Math.cos(v) * 1.0, nb.z - Math.sin(v) * 1.0, nb.view);
        return false;
      },
      null,
      { timeout: 10_000, polling: 200 },
    );
    await expect(page.getByTestId('touch-btn-action')).toHaveText('討つ');
    await expect(page.getByTestId('touch-btn-action')).toHaveClass(/kg-ready/);
    await f.tapEl(1, 'touch-btn-action');
    await waitScreen(page, 'finale', 10_000);
    // 遊ぶ画面を出たら、タッチ層は隠れる
    await expect(page.getByTestId('touch-layer')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('小石の3経路：長押しで投げる／ちょん押し→投げる／ちょん押し→やめる（減らない）', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, '?touch=1&autostart=1&seed=1&god=1');
    await page.evaluate(() => window.__game!.teleport(-14, 33.5, 270));
    const f = await Fingers.create(page);
    const stone = page.getByTestId('touch-btn-stone');
    await expect(stone).toContainText('小石');
    await expect(page.locator('.kg-tbtn-count')).toHaveText('5');
    // ① 長押し（250ms 以上）→ 離して投げる
    await f.downEl(1, 'touch-btn-stone');
    await expect(stone).toContainText('はなす');
    await expect(page.getByTestId('touch-btn-aim-cancel')).toBeVisible();
    await page.waitForTimeout(450);
    await f.up(1);
    await page.waitForFunction(() => window.__state!.stonesUsed === 1, null, { timeout: 10_000 });
    expect((await touchInfo(page)).aim).toBe('idle');
    await expect(page.getByTestId('touch-btn-aim-cancel')).toBeHidden();
    // ② ちょん押し → ねらいを保つ → もう一度押して投げる
    await f.tapEl(1, 'touch-btn-stone');
    await expect.poll(async () => (await touchInfo(page)).aim).toBe('latched');
    await expect(stone).toContainText('投げる');
    await expect(page.getByTestId('touch-btn-aim-cancel')).toBeVisible();
    await expect(page.locator('.kg-aimhint')).toHaveClass(/kg-on/);
    await waitGameSeconds(page, 0.4);
    expect((await state(page)).stonesUsed).toBe(1);
    await f.tapEl(1, 'touch-btn-stone');
    await page.waitForFunction(() => window.__state!.stonesUsed === 2, null, { timeout: 10_000 });
    // ③ ちょん押し → やめる＝投げない
    await waitGameSeconds(page, 0.3);
    await f.tapEl(1, 'touch-btn-stone');
    await expect.poll(async () => (await touchInfo(page)).aim).toBe('latched');
    await expect(page.locator('.kg-aimhint')).toHaveClass(/kg-on/);
    // 投げられる狙いになってから（ここで離せば投げる状態で）やめる
    await waitGameSeconds(page, 0.4);
    await expect(page.locator('.kg-aimhint')).not.toContainText('投げられない');
    await f.tapEl(1, 'touch-btn-aim-cancel');
    await expect.poll(async () => (await touchInfo(page)).aim).toBe('idle');
    await expect(page.locator('.kg-aimhint')).not.toHaveClass(/kg-on/);
    await waitGameSeconds(page, 0.6);
    const s = await state(page);
    expect(s.stonesUsed).toBe(2);
    expect(s.player.stones).toBe(3);
    await expect(page.locator('.kg-tbtn-count')).toHaveText('3');
    expect(errors).toEqual([]);
  });

  test('攻撃は、カメラが別の向きでも、間合いの中の番兵へ自動で向いて当たる（タッチ）', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, '?touch=1&autostart=1&seed=1&god=1');
    const g = (await state(page)).guards.find((x) => x.id === 'omote-l')!;
    // 番兵の北 1.3m に立ち、カメラ（と体）は北向き＝番兵に背を向ける。間合い（1.65m）の中
    await page.evaluate(([x, z]) => window.__game!.teleport(x, z - 1.3, 270), [g.x, g.z]);
    const f = await Fingers.create(page);
    await f.tapEl(1, 'touch-btn-attack');
    await page.waitForFunction(() => window.__state?.guards.some((x) => x.id === 'omote-l' && x.state === 'stagger'), null, { timeout: 15_000 });
    await expect(page.getByTestId('mission-message')).toContainText('命中');
    expect(errors).toEqual([]);
  });

  test('攻撃は、間合い（1.65m）の外なら空振りのまま（向きを補助しても、距離の規則は変わらない）', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, '?touch=1&autostart=1&seed=1&god=1');
    const g = (await state(page)).guards.find((x) => x.id === 'omote-l')!;
    await page.evaluate(([x, z]) => window.__game!.teleport(x, z - 1.9, 270), [g.x, g.z]);
    const f = await Fingers.create(page);
    await f.tapEl(1, 'touch-btn-attack');
    await expect(page.getByTestId('mission-message')).toContainText('空振り', { timeout: 15_000 });
    expect((await state(page)).guards.find((x) => x.id === 'omote-l')!.state).not.toBe('stagger');
    expect(errors).toEqual([]);
  });

  test('一時停止ボタンは、小石を狙っている最中でも止める。再開しても投げない', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, '?touch=1&autostart=1&seed=1&god=1');
    await page.evaluate(() => window.__game!.teleport(-14, 33.5, 270));
    const f = await Fingers.create(page);
    await f.tapEl(1, 'touch-btn-stone');
    await expect(page.locator('.kg-aimhint')).toHaveClass(/kg-on/);
    await waitGameSeconds(page, 0.4);
    await expect(page.locator('.kg-aimhint')).not.toContainText('投げられない');
    await f.tapEl(2, 'touch-btn-pause');
    await waitScreen(page, 'pause');
    await expect(page.getByTestId('screen-pause')).toBeVisible();
    await expect(page.getByTestId('touch-layer')).toBeHidden();
    await f.tapEl(1, 'btn-resume');
    await waitScreen(page, 'play');
    await waitGameSeconds(page, 0.6);
    const s = await state(page);
    expect(s.stonesUsed).toBe(0);
    expect(s.player.stones).toBe(5);
    expect((await touchInfo(page)).aim).toBe('idle');
    await expect(page.locator('.kg-aimhint')).not.toHaveClass(/kg-on/);
    expect(errors).toEqual([]);
  });

  test('狙い中に縦向きにすると、案内が出て止まる。横に戻して再開しても小石は減らない', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, '?touch=1&autostart=1&seed=1&god=1');
    await page.evaluate(() => window.__game!.teleport(-14, 33.5, 270));
    const f = await Fingers.create(page);
    await f.tapEl(1, 'touch-btn-stone');
    await expect(page.locator('.kg-aimhint')).toHaveClass(/kg-on/);
    await waitGameSeconds(page, 0.4);
    await expect(page.locator('.kg-aimhint')).not.toContainText('投げられない');
    await page.setViewportSize({ width: 390, height: 844 });
    await waitScreen(page, 'pause');
    await expect(page.getByTestId('rotate-prompt')).toBeVisible();
    await expect(page.getByTestId('rotate-prompt')).toContainText('スマホを横向きにしてください');
    await page.setViewportSize(PHONE);
    await expect(page.getByTestId('rotate-prompt')).toBeHidden();
    await expect(page.getByTestId('screen-pause')).toBeVisible();
    expect((await state(page)).screen).toBe('pause');
    await f.tapEl(1, 'btn-resume');
    await waitScreen(page, 'play');
    await waitGameSeconds(page, 0.6);
    const s = await state(page);
    expect(s.stonesUsed).toBe(0);
    expect(s.player.stones).toBe(5);
    expect(errors).toEqual([]);
  });

  test('窓を離れた（blur）とき、狙っていれば投げずにやめる。止めはしない', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, '?touch=1&autostart=1&seed=3&god=1');
    const f = await Fingers.create(page);
    // ちょん押しで狙いを保つ
    const c = await f.downEl(1, 'touch-btn-stone');
    await page.waitForTimeout(60);
    await f.up(1);
    await expect.poll(() => page.evaluate(() => window.__touch!.info()!.aim)).toBe('latched');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect.poll(() => page.evaluate(() => window.__touch!.info()!.aim)).toBe('idle');
    await waitGameSeconds(page, 0.5);
    const s = await state(page);
    expect(s.stonesUsed).toBe(0);
    expect(s.player.stones).toBe(5);
    expect(s.screen).toBe('play'); // blur は止めない
    expect(c.x).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('指が取り消される（pointercancel）と、スティックは0に戻り、押しっぱなしの小石は投げずにやめて、ボタンの見た目も戻る', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, '?touch=1&autostart=1&seed=3&god=1');
    const f = await Fingers.create(page);
    // ① スティックを倒して歩いている最中に取り消される
    await f.down(1, STICK.x, STICK.y);
    await f.move(1, STICK.x, STICK.y - 50);
    await expect.poll(async () => (await touchInfo(page)).stick.y).toBeGreaterThan(0.85);
    await f.cancel(1);
    await expect.poll(async () => (await touchInfo(page)).stick).toMatchObject({ x: 0, y: 0, run: false, down: false });
    await expect(page.locator('.kg-stick-hint')).toBeVisible();
    // ② 小石を押しっぱなし（狙い中）のときに取り消される：投げず、石は減らず、押された見た目と文字が戻る
    const stone = page.getByTestId('touch-btn-stone');
    await f.downEl(1, 'touch-btn-stone');
    await expect.poll(async () => (await touchInfo(page)).aim).toBe('hold');
    await expect(stone).toHaveClass(/kg-down/);
    await f.cancel(1);
    await expect.poll(async () => (await touchInfo(page)).aim).toBe('idle');
    await expect(stone).not.toHaveClass(/kg-down/);
    await expect(stone).toContainText('小石');
    await waitGameSeconds(page, 0.5);
    const s = await state(page);
    expect(s.stonesUsed).toBe(0);
    expect(s.player.stones).toBe(5);
    expect(s.screen).toBe('play');
    expect(errors).toEqual([]);
  });

  test('小石を押しっぱなしのまま一時停止しても、再開したとき小石ボタンは押された見た目のままではない', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, '?touch=1&autostart=1&seed=3&god=1');
    const f = await Fingers.create(page);
    const stone = page.getByTestId('touch-btn-stone');
    await f.downEl(1, 'touch-btn-stone');
    await expect.poll(async () => (await touchInfo(page)).aim).toBe('hold');
    await expect(stone).toHaveClass(/kg-down/);
    await f.tapEl(2, 'touch-btn-pause'); // 2本目の指で一時停止
    await waitScreen(page, 'pause');
    await f.up(1);
    await f.tapEl(1, 'btn-resume');
    await waitScreen(page, 'play');
    await expect(stone).not.toHaveClass(/kg-down/);
    await expect(stone).toContainText('小石');
    expect((await touchInfo(page)).aim).toBe('idle');
    expect((await state(page)).stonesUsed).toBe(0);
    expect(errors).toEqual([]);
  });

  test('離した合図（pointerup・pointercancel）が届かなかった指が残っても、次に触れた1本目の指でスティックが効く', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, '?touch=1&autostart=1&seed=3&god=1');
    const f = await Fingers.create(page, { synthetic: true }); // 離す合図だけを落とすので、PointerEvent の代替で送る
    await f.down(1, STICK.x, STICK.y);
    await f.move(1, STICK.x, STICK.y - 50);
    await expect.poll(async () => (await touchInfo(page)).stick.y).toBeGreaterThan(0.85);
    f.forget(1); // 離した合図が届かなかった
    // 他に触れている指は無い（isPrimary）ので、残っていた記録は古い。新しい指を受ける
    await f.down(2, STICK.x + 20, STICK.y);
    await f.move(2, STICK.x + 20, STICK.y - 50);
    await expect.poll(async () => (await touchInfo(page)).stick.y).toBeGreaterThan(0.85);
    await f.up(2);
    await expect.poll(async () => (await touchInfo(page)).stick).toMatchObject({ x: 0, y: 0, down: false });
    expect(errors).toEqual([]);
  });

  test('同じボタンを2本の指で押しても1つに数える：2本目を離しても、1本目が押している間は押したまま', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, '?touch=1&autostart=1&seed=3&god=1');
    const f = await Fingers.create(page);
    const crouch = page.getByTestId('touch-btn-crouch');
    await f.downEl(1, 'touch-btn-crouch');
    await expect(crouch).toHaveClass(/kg-down/);
    await f.downEl(2, 'touch-btn-crouch'); // 同じボタンへ2本目（数えない）
    await f.up(2);
    await expect(crouch).toHaveClass(/kg-down/); // 1本目はまだ押している
    await f.up(1);
    await expect(crouch).not.toHaveClass(/kg-down/);
    expect(errors).toEqual([]);
  });

  test('物理キーの R でやり直しても、タッチの押しっぱなし（スティック・ねらい）は新しい回へ持ち越さない', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, '?touch=1&autostart=1&seed=3&god=1');
    const f = await Fingers.create(page);
    await f.down(1, STICK.x, STICK.y);
    await f.move(1, STICK.x, STICK.y - 50);
    await expect.poll(async () => (await touchInfo(page)).stick.y).toBeGreaterThan(0.85);
    await f.tapEl(2, 'touch-btn-stone'); // ちょん押しでねらいを保つ
    await expect.poll(async () => (await touchInfo(page)).aim).toBe('latched');
    await page.keyboard.press('KeyR'); // キーボードもあるタブレットなど
    await expect.poll(async () => (await touchInfo(page)).stick).toMatchObject({ x: 0, y: 0, down: false });
    expect((await touchInfo(page)).aim).toBe('idle');
    await waitGameSeconds(page, 0.5);
    const s = await state(page);
    expect(s.screen).toBe('play');
    expect(s.stonesUsed).toBe(0);
    expect(s.player.speed).toBeLessThan(0.05); // 新しい回はスティックを倒していないので動かない
    expect(errors).toEqual([]);
  });

  test('他の指が画面に触れたままでも、一時停止の「再開する」「はじめからやり直す」が効く（2本目の指は click にならない）', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, '?touch=1&autostart=1&seed=3&god=1');
    const f = await Fingers.create(page);
    const s0 = await state(page);
    await f.down(1, STICK.x, STICK.y); // 左の親指がスティックに乗ったまま
    await f.move(1, STICK.x, STICK.y - 50);
    await waitGameSeconds(page, 1);
    expect(Math.hypot((await state(page)).player.x - s0.player.x, (await state(page)).player.z - s0.player.z)).toBeGreaterThan(0.8); // 歩いた
    await f.tapEl(2, 'touch-btn-pause'); // 右の親指で一時停止
    await waitScreen(page, 'pause');
    await f.tapEl(2, 'btn-resume'); // 左の指は触れたまま、右の親指で再開
    await waitScreen(page, 'play');
    await f.tapEl(2, 'touch-btn-pause');
    await waitScreen(page, 'pause');
    await f.tapEl(2, 'btn-restart'); // 同じく、はじめからやり直す
    await waitScreen(page, 'play');
    await waitGameSeconds(page, 0.3);
    const s1 = await state(page);
    expect(Math.hypot(s1.player.x - s0.player.x, s1.player.z - s0.player.z)).toBeLessThan(0.5); // 開始地点へ戻った＝新しい回
    await f.up(1);
    expect(errors).toEqual([]);
  });

  test('ページが隠れたら止まり、狙っていれば投げずにやめる', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, '?touch=1&autostart=1&seed=1&god=1');
    await page.evaluate(() => window.__game!.teleport(-14, 33.5, 270));
    const f = await Fingers.create(page);
    await f.tapEl(1, 'touch-btn-stone');
    await waitGameSeconds(page, 0.4);
    await expect(page.locator('.kg-aimhint')).not.toContainText('投げられない');
    // アプリの切り替え・画面を消したとき（document.hidden）を作る
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitScreen(page, 'pause');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await f.tapEl(1, 'btn-resume');
    await waitScreen(page, 'play');
    await waitGameSeconds(page, 0.6);
    expect((await state(page)).stonesUsed).toBe(0);
    expect(errors).toEqual([]);
  });

  test('描画の文脈を失うと、案内と読み込み直しのボタンが出る', async ({ page }) => {
    await boot(page, '?touch=1&autostart=1&seed=3');
    await page.waitForFunction(() => window.__viewReady === true, null, { timeout: 60_000 });
    const ok = await page.evaluate(() => {
      const c = document.getElementById('game') as HTMLCanvasElement;
      const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null;
      const ext = gl?.getExtension('WEBGL_lose_context');
      ext?.loseContext();
      return !!ext;
    });
    test.skip(!ok, 'WEBGL_lose_context が無いブラウザ');
    await expect(page.getByTestId('ctx-lost')).toBeVisible();
    await expect(page.getByTestId('ctx-lost')).toContainText('描画が止まりました。読み込み直してください');
    await expect(page.getByTestId('btn-reload')).toHaveText('読み込み直す');
    await waitScreen(page, 'pause');
  });

  test('?touch=0 なら、タッチの部品も縦向きの案内も無く、HUD のキー一覧と視点をつかむ案内が今まで通り出る', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, '?touch=0&autostart=1&seed=3');
    await expect(page.locator('html')).not.toHaveClass(/kg-touch/);
    await expect(page.getByTestId('touch-layer')).toHaveCount(0);
    await expect(page.locator('.kg-keys')).toBeVisible();
    await expect(page.locator('.kg-lockhint')).toBeVisible();
    // 縦向きにしても止まらず、案内も出ない
    await page.setViewportSize({ width: 390, height: 844 });
    await waitGameSeconds(page, 0.3);
    expect((await state(page)).screen).toBe('play');
    await expect(page.getByTestId('rotate-prompt')).toHaveCount(0);
    expect(await page.evaluate(() => window.__touch!.active())).toBe(false);
    expect(errors).toEqual([]);
  });
});

test.describe('初回タッチでの切り替え（タッチ非対応のデスクトップ設定）', () => {
  test('最初はタッチの部品が無く、touch の pointerdown で読み込み直さずに入る', async ({ page }) => {
    const errors = collectErrors(page);
    const ext = collectExternal(page);
    await boot(page, '?autostart=1&seed=3');
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(false);
    await expect(page.locator('html')).not.toHaveClass(/kg-touch/);
    await expect(page.getByTestId('touch-layer')).toHaveCount(0);
    await page.waitForFunction(() => window.__viewReady === true, null, { timeout: 60_000 });
    // タッチの前は、デスクトップの描画（標準・AOあり）のまま
    expect(await page.evaluate(() => ({ tier: window.__quality!.tier(), ao: window.__quality!.ao() }))).toEqual({ tier: 0, ao: true });
    // 読み込み直していないことの目印（読み込み直すと消える。2026-11-03 独立レビュー：ゲーム内時刻の比較は読み直しでも通りうる）
    await page.evaluate(() => {
      (window as unknown as { __noReloadMark: number }).__noReloadMark = 7;
    });
    // タッチ非対応の設定では CDP のタッチを受けないので、PointerEvent（pointerType=touch）を送る
    const f = await Fingers.create(page, { synthetic: true });
    await f.tap(1, 640, 300);
    await expect(page.locator('html')).toHaveClass(/kg-touch/);
    await expect(page.getByTestId('touch-layer')).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __noReloadMark?: number }).__noReloadMark)).toBe(7);
    // 触れる端末の描画（やや軽い・AOなし）へ下がり、自動の引き下げが始まる
    await expect.poll(() => page.evaluate(() => window.__quality!.tier())).toBe(1);
    expect(await page.evaluate(() => ({ ao: window.__quality!.ao(), adaptive: window.__quality!.adaptive() }))).toEqual({ ao: false, adaptive: false });
    expect(await page.evaluate(() => window.__touch!.active())).toBe(true);
    // 入ったあとは、スティックで歩ける
    const s0 = await state(page);
    const c = await center(page, 'touch-stick-zone');
    await f.down(1, c.x, c.y);
    await f.move(1, c.x, c.y - 50);
    await waitGameSeconds(page, 0.8);
    await f.up(1);
    const s1 = await state(page);
    expect(Math.hypot(s1.player.x - s0.player.x, s1.player.z - s0.player.z)).toBeGreaterThan(0.5);
    // キーボードも今まで通り効く
    await page.keyboard.press('Escape');
    await waitScreen(page, 'pause');
    expect(errors).toEqual([]);
    expect(ext).toEqual([]);
  });
});

// ================================================================ A2（tasks 3.2・4.1）：スマホ向けの HUD・文言・各画面・画質
/** 監査する画面サイズ（横向き）。 */
const AUDIT_SIZES = [
  { width: 568, height: 320 },
  { width: 667, height: 375 },
  { width: 844, height: 390 },
  { width: 932, height: 430 },
  { width: 1024, height: 768 },
];
/** 画面にキー名・マウスの操作が出ていないか（src/ui/text.ts の hasKeyName と同じ式）。 */
const KEY_NAME = /Enter|Esc|Shift|Ctrl|WASD|W A S D|右クリック|ホイール|マウス|(?<![A-Za-z])[EFQRCMWASD](?![A-Za-z])/;

interface Box {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  font: number;
}

/** 遊ぶ画面で見えている HUD の塊とタッチ部品の外接矩形、見える範囲（安全域を引いた visualViewport）、文字の最小の大きさ。 */
async function hudBoxes(page: Page): Promise<{ boxes: Box[]; area: { x0: number; y0: number; x1: number; y1: number }; minFont: number; minPromptFont: number; radar: number }> {
  return page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.position = 'fixed';
    probe.style.paddingTop = 'env(safe-area-inset-top, 0px)';
    probe.style.paddingRight = 'env(safe-area-inset-right, 0px)';
    probe.style.paddingBottom = 'env(safe-area-inset-bottom, 0px)';
    probe.style.paddingLeft = 'env(safe-area-inset-left, 0px)';
    document.body.append(probe);
    const cs = getComputedStyle(probe);
    const safe = { t: parseFloat(cs.paddingTop), r: parseFloat(cs.paddingRight), b: parseFloat(cs.paddingBottom), l: parseFloat(cs.paddingLeft) };
    probe.remove();
    const vv = window.visualViewport!;
    const shown = (e: Element): boolean => {
      const s = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0 && r.width > 0 && r.height > 0 && !e.closest('.kg-hidden');
    };
    const groups: [string, string][] = [
      ['左上', '.kg-hud-tl'],
      ['右上', '.kg-hud-tr'],
      ['明るさ', '.kg-hud-bl'],
      ['寺の構え', '.kg-hud-tc'],
      ['いまできること', '.kg-prompt.kg-on'],
      ['狙いの案内', '.kg-aimhint.kg-on'],
      ['操作のヒント', '.kg-touchhint.kg-on'],
      ['逃げ方', '.kg-alert-tip.kg-on'],
      ['歩くの目印', '.kg-stick-hint'],
    ];
    const boxes: { name: string; x: number; y: number; w: number; h: number; font: number }[] = [];
    for (const [name, sel] of groups)
      for (const e of document.querySelectorAll(sel)) {
        // HUD は遊ぶ画面のときだけ出る。祖先が隠れていれば数えない
        if (!shown(e) || (e.closest('.kg-hud') && !e.closest('.kg-hud')!.classList.contains('kg-on'))) continue;
        const r = e.getBoundingClientRect();
        boxes.push({ name, x: r.x, y: r.y, w: r.width, h: r.height, font: parseFloat(getComputedStyle(e).fontSize) });
      }
    for (const e of document.querySelectorAll('.kg-tbtn')) {
      if (!shown(e)) continue;
      const r = e.getBoundingClientRect();
      boxes.push({ name: `ボタン:${(e as HTMLElement).dataset.testid}`, x: r.x, y: r.y, w: r.width, h: r.height, font: 14 });
    }
    // HUD の中の文字（直に文字を持つ見える要素）の最小の大きさ
    let minFont = 99;
    for (const e of document.querySelectorAll('.kg-hud.kg-on *')) {
      if (!shown(e)) continue;
      const hasText = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim() !== '');
      if (hasText) minFont = Math.min(minFont, parseFloat(getComputedStyle(e).fontSize));
    }
    let minPromptFont = 99;
    for (const e of document.querySelectorAll('.kg-prompt.kg-on, .kg-aimhint.kg-on')) minPromptFont = Math.min(minPromptFont, parseFloat(getComputedStyle(e).fontSize));
    const radar = document.querySelector('[data-testid="radar"]')!.getBoundingClientRect().width;
    return { boxes, area: { x0: safe.l, y0: safe.t, x1: vv.width - safe.r, y1: vv.height - safe.b }, minFont, minPromptFont, radar };
  });
}

/** 重なり0・見える範囲の内側・文字の大きさを確かめる。 */
async function auditHud(page: Page, label: string, expectNames: string[] = []): Promise<void> {
  const a = await hudBoxes(page);
  const names = a.boxes.map((b) => b.name);
  for (const n of ['左上', '右上', '明るさ', ...expectNames]) expect(names, `${label}: ${n} が見えている`).toContain(n);
  for (const b of a.boxes) {
    expect(b.x, `${label}: ${b.name} の左`).toBeGreaterThanOrEqual(a.area.x0 - 0.5);
    expect(b.y, `${label}: ${b.name} の上`).toBeGreaterThanOrEqual(a.area.y0 - 0.5);
    expect(b.x + b.w, `${label}: ${b.name} の右`).toBeLessThanOrEqual(a.area.x1 + 0.5);
    expect(b.y + b.h, `${label}: ${b.name} の下`).toBeLessThanOrEqual(a.area.y1 + 0.5);
  }
  for (let i = 0; i < a.boxes.length; i++)
    for (let j = i + 1; j < a.boxes.length; j++) {
      const p = a.boxes[i];
      const q = a.boxes[j];
      const overlap = p.x < q.x + q.w - 0.5 && q.x < p.x + p.w - 0.5 && p.y < q.y + q.h - 0.5 && q.y < p.y + p.h - 0.5;
      expect(overlap, `${label}: ${p.name} と ${q.name} が重なる`).toBe(false);
    }
  expect(a.minFont, `${label}: HUD の文字は 12px 以上`).toBeGreaterThanOrEqual(12);
  if (a.minPromptFont < 99) expect(a.minPromptFont, `${label}: いまできることは 14px 以上`).toBeGreaterThanOrEqual(14);
  expect(a.radar, `${label}: レーダーは 112〜128px`).toBeGreaterThanOrEqual(112);
  expect(a.radar, `${label}: レーダーは 112〜128px`).toBeLessThanOrEqual(128);
}

/** 画面の大きさを変えて、描き直しを待つ。 */
async function resizeTo(page: Page, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60)))));
}

test.describe('スマホ向けの HUD と各画面（A2）', () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  test('重なりの監査：568×320〜1024×768 で HUD とタッチ部品が重ならず、安全域の内側に収まる（開始直後・発見中・狙い中）', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, '?touch=1&autostart=1&seed=1&god=1');
    await page.waitForFunction(() => window.__viewReady === true, null, { timeout: 60_000 });
    // 開始直後：操作のヒントが出ている間に、全部の大きさを見る
    await expect(page.getByTestId('touch-hint')).toHaveClass(/kg-on/);
    for (const size of AUDIT_SIZES) {
      await resizeTo(page, size);
      await auditHud(page, `開始 ${size.width}×${size.height}`, ['操作のヒント', '歩くの目印']);
    }
    // 発見中（寺の構えの帯・逃げ方の案内・いまできること）
    await resizeTo(page, PHONE);
    await page.evaluate(() => window.__game!.teleport(0, 33.5, 270));
    await page.evaluate(() => window.__input!.down('KeyW'));
    await page.waitForFunction(() => window.__state!.phase === 'alert', null, { timeout: 20_000 });
    await page.evaluate(() => window.__input!.up('KeyW'));
    await page.evaluate(() => window.__game!.freeze(true));
    await expect(page.locator('.kg-alert-tip')).toHaveClass(/kg-on/);
    for (const size of AUDIT_SIZES) {
      await resizeTo(page, size);
      await auditHud(page, `発見 ${size.width}×${size.height}`, ['寺の構え', '逃げ方']);
    }
    // 狙い中（ちょん押しで保つ。「投げる」と「やめる」・狙いの案内）
    await resizeTo(page, PHONE);
    await page.evaluate(() => window.__game!.freeze(false));
    await page.evaluate(() => window.__game!.teleport(-14, 33.5, 270));
    await waitGameSeconds(page, 0.3);
    const f = await Fingers.create(page);
    await f.tapEl(1, 'touch-btn-stone');
    await expect.poll(async () => (await touchInfo(page)).aim).toBe('latched');
    await waitGameSeconds(page, 0.4);
    await page.evaluate(() => window.__game!.freeze(true));
    for (const size of AUDIT_SIZES) {
      await resizeTo(page, size);
      await auditHud(page, `狙い ${size.width}×${size.height}`, ['狙いの案内', 'ボタン:touch-btn-aim-cancel']);
    }
    expect(errors).toEqual([]);
  });

  test('タッチのとき、タイトルから結果まで、画面の文にキー名が無い。一時停止に音の入切と画質', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, '?touch=1&seed=1&god=1');
    const uiText = (): Promise<string> => page.locator('#ui').evaluate((e) => (e as HTMLElement).innerText);
    const noKeys = async (where: string): Promise<void> => {
      const t = await uiText();
      expect(t.match(KEY_NAME)?.[0] ?? null, `${where}: ${t.slice(0, 400)}`).toBeNull();
    };
    await waitScreen(page, 'title');
    await noKeys('タイトル');
    const f = await Fingers.create(page);
    await f.tapEl(1, 'btn-start');
    await waitScreen(page, 'select');
    await noKeys('選択');
    // 遊べる札は、選択の画面に入ったとき見える所までスクロールされている
    await expect(page.getByTestId('stage-honnoji')).toBeInViewport();
    await f.tapEl(1, 'stage-honnoji');
    await waitScreen(page, 'briefing');
    await noKeys('説明');
    await expect(page.locator('.kg-brief-controls')).toContainText('左をなぞる');
    await expect(page.getByTestId('btn-begin')).toHaveText('出陣する');
    await page.getByTestId('btn-begin').scrollIntoViewIfNeeded();
    await f.tapEl(1, 'btn-begin');
    await waitScreen(page, 'play');
    await noKeys('遊ぶ');
    // 一時停止：音の入切（文字で状態）と画質の名前
    await f.tapEl(1, 'touch-btn-pause');
    await waitScreen(page, 'pause');
    await noKeys('一時停止');
    await expect(page.getByTestId('btn-resume')).toHaveText('再開する');
    await expect(page.getByTestId('btn-mute')).toContainText('音：入');
    expect(await page.evaluate(() => window.__quality!.label())).toBe('やや軽い');
    await expect(page.getByTestId('quality-label')).toHaveText('画質　やや軽い');
    await f.tapEl(1, 'btn-mute');
    await expect(page.getByTestId('btn-mute')).toContainText('音：切');
    expect(await page.evaluate(() => window.__audio!.muted)).toBe(true);
    await f.tapEl(1, 'btn-mute');
    await expect(page.getByTestId('btn-mute')).toContainText('音：入');
    for (const id of ['btn-resume', 'btn-restart', 'btn-to-select', 'btn-mute']) expect((await page.getByTestId(id).boundingBox())!.height, id).toBeGreaterThanOrEqual(44);
    await f.tapEl(1, 'btn-resume');
    await waitScreen(page, 'play');
    await page.evaluate(() => window.__game!.lose());
    await waitScreen(page, 'gameover', 30_000);
    await noKeys('討たれた');
    await expect(page.getByTestId('btn-retry')).toHaveText('やり直す');
    await f.tapEl(1, 'btn-retry');
    await waitScreen(page, 'play');
    await page.evaluate(() => window.__game!.win());
    await waitScreen(page, 'result', 40_000);
    await noKeys('結果');
    await expect(page.getByTestId('btn-again')).toHaveText('もう一度');
    expect(errors).toEqual([]);
  });

  test('キーボード（touch=0）の文言と画面は今まで通り（キー名が出て、音・画質・注記・ヒントは無い）', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, '?touch=0&seed=1');
    await expect(page.locator('.kg-keyhint')).toHaveText('Enter でも進める');
    await expect(page.locator('.kg-keyhint')).toBeVisible();
    await page.getByTestId('btn-start').click();
    await page.getByTestId('stage-honnoji').click();
    await waitScreen(page, 'briefing');
    await expect(page.getByTestId('btn-begin')).toHaveText('出陣する（Enter）');
    await expect(page.locator('.kg-brief-controls')).toContainText('W A S D');
    await expect(page.getByTestId('portrait-note')).toHaveCount(0);
    await page.getByTestId('btn-begin').click();
    await waitScreen(page, 'play');
    await expect(page.getByTestId('touch-hint')).toBeHidden();
    await expect(page.locator('.kg-objective-detail')).toBeVisible();
    await page.evaluate(() => window.__input!.tap('Escape'));
    await waitScreen(page, 'pause');
    await expect(page.getByTestId('btn-resume')).toHaveText('再開する（Esc）');
    await expect(page.getByTestId('btn-mute')).toHaveCount(0);
    await expect(page.getByTestId('quality-label')).toHaveCount(0);
    // 画質：デスクトップでは段階を変えない
    const q = await page.evaluate(() => ({ tier: window.__quality!.tier(), history: window.__quality!.history(), adaptive: window.__quality!.adaptive(), explicit: window.__quality!.explicit() }));
    expect(q).toEqual({ tier: 0, history: [], adaptive: false, explicit: false });
    expect(errors).toEqual([]);
  });

  test('遊び始めの操作のヒント：最初の遊びで出て 8 秒以内に消え、やり直しでは出ない。歩いて見回すと早く消える', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, '?touch=1&autostart=1&seed=1&god=1');
    await page.waitForFunction(() => window.__viewReady === true, null, { timeout: 60_000 });
    const hint = page.getByTestId('touch-hint');
    await expect(hint).toHaveClass(/kg-on/);
    await expect(hint).toContainText('左をなぞって歩く');
    await expect(hint).toContainText('いちばん外の輪まで倒すと走る');
    const t0 = Date.now();
    await expect(hint).not.toHaveClass(/kg-on/, { timeout: 9_000 });
    await expect(hint).toBeHidden({ timeout: 2_000 });
    expect(Date.now() - t0).toBeLessThan(8_000);
    // やり直し（一時停止→はじめから）では出ない
    const f = await Fingers.create(page);
    await f.tapEl(1, 'touch-btn-pause');
    await waitScreen(page, 'pause');
    await f.tapEl(1, 'btn-restart');
    await waitScreen(page, 'play');
    await page.waitForTimeout(500);
    await expect(hint).not.toHaveClass(/kg-on/);
    // 読み込み直すと、また出る。スティックで歩いて、視点をなぞると、早く消える
    await boot(page, '?touch=1&autostart=1&seed=1&god=1');
    await page.waitForFunction(() => window.__viewReady === true, null, { timeout: 60_000 });
    await expect(hint).toHaveClass(/kg-on/);
    const t1 = Date.now();
    const f2 = await Fingers.create(page);
    await f2.down(1, STICK.x, STICK.y);
    await f2.move(1, STICK.x, STICK.y - 40);
    await f2.down(2, LOOK.x, LOOK.y);
    await f2.move(2, LOOK.x + 60, LOOK.y);
    await f2.up(2);
    await f2.up(1);
    await expect(hint).not.toHaveClass(/kg-on/, { timeout: 2_000 });
    expect(Date.now() - t1).toBeLessThan(5_000);
    expect(errors).toEqual([]);
  });

  test('小石ボタンを押したまま指を動かすと視点が回り、離すと投げる', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, '?touch=1&autostart=1&seed=1&god=1');
    await page.evaluate(() => window.__game!.teleport(-14, 33.5, 270));
    await waitGameSeconds(page, 0.3);
    const f = await Fingers.create(page);
    const c = await f.downEl(1, 'touch-btn-stone');
    await expect.poll(async () => (await touchInfo(page)).aim).toBe('hold');
    await waitGameSeconds(page, 0.2);
    const yaw0 = (await state(page)).camera.yaw;
    await f.move(1, c.x - 70, c.y, 8);
    await waitGameSeconds(page, 0.3);
    const yaw1 = (await state(page)).camera.yaw;
    expect(Math.abs(yaw1 - yaw0), '視点の向きが変わる').toBeGreaterThan(2);
    expect((await state(page)).stonesUsed).toBe(0);
    await f.up(1);
    await page.waitForFunction(() => window.__state!.stonesUsed === 1, null, { timeout: 10_000 });
    expect((await touchInfo(page)).aim).toBe('idle');
    expect(errors).toEqual([]);
  });

  test('物理キーとタッチが同じキー（Q）を持つ：タッチを離しても、物理キーを押している間は投げない', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, '?touch=1&autostart=1&seed=1&god=1');
    await page.evaluate(() => window.__game!.teleport(-14, 33.5, 270));
    await waitGameSeconds(page, 0.3);
    await page.keyboard.down('KeyQ');
    await expect(page.locator('.kg-aimhint')).toHaveClass(/kg-on/);
    const f = await Fingers.create(page);
    // 長押しで離す＝タッチだけなら投げる操作。物理の Q が押したままなので、まだ投げない
    await f.downEl(1, 'touch-btn-stone');
    await page.waitForTimeout(400);
    await f.up(1);
    await waitGameSeconds(page, 0.5);
    let s = await state(page);
    expect(s.stonesUsed).toBe(0);
    await expect(page.locator('.kg-aimhint')).toHaveClass(/kg-on/);
    // 物理の Q を離すと投げる
    await page.keyboard.up('KeyQ');
    await page.waitForFunction(() => window.__state!.stonesUsed === 1, null, { timeout: 10_000 });
    s = await state(page);
    expect(s.player.stones).toBe(4);
    expect(errors).toEqual([]);
  });

  test('小さい横向き画面（568×320）で、各画面が収まり、ボタンが 44px 以上で、指でスクロールして押せる。共有欄が主ボタンに重ならない', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 568, height: 320 });
    await boot(page, '?touch=1&seed=1&god=1');
    await page.waitForFunction(() => window.__viewReady === true, null, { timeout: 60_000 });
    const noOverlap = async (a: string, b: string): Promise<void> => {
      const p = (await page.locator(a).boundingBox())!;
      const q = (await page.locator(b).boundingBox())!;
      const overlap = p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height;
      expect(overlap, `${a} と ${b}`).toBe(false);
    };
    /** ボタンを見える所までスクロールし、高さ44以上・画面の内側にあることを確かめる。 */
    const reach = async (id: string): Promise<void> => {
      const b = page.getByTestId(id);
      await b.scrollIntoViewIfNeeded();
      const box = (await b.boundingBox())!;
      expect(box.height, id).toBeGreaterThanOrEqual(44);
      expect(box.y, id).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height, id).toBeLessThanOrEqual(320);
      expect(box.x + box.width, id).toBeLessThanOrEqual(568);
    };
    await reach('btn-start');
    await expect(page.locator('#share')).toBeVisible();
    await noOverlap('[data-testid="btn-start"]', '#share');
    const f = await Fingers.create(page);
    await f.tapEl(1, 'btn-start');
    await waitScreen(page, 'select');
    await expect(page.getByTestId('stage-honnoji')).toBeInViewport();
    await reach('btn-to-title');
    await reach('stage-honnoji');
    await f.tapEl(1, 'stage-honnoji');
    await waitScreen(page, 'briefing');
    // 説明は画面より長い：指で縦になぞるとスクロールし、出陣のボタンは常に押せる
    const sc = page.getByTestId('screen-briefing');
    const tall = await sc.evaluate((e) => ({ sh: e.scrollHeight, ch: e.clientHeight, ta: getComputedStyle(e).touchAction, ov: getComputedStyle(e).overflowY }));
    expect(tall.sh).toBeGreaterThan(tall.ch);
    expect(tall.ta).toBe('pan-y');
    expect(tall.ov).toBe('auto');
    await reach('btn-begin');
    await sc.evaluate((e) => (e.scrollTop = e.scrollHeight));
    await reach('btn-begin');
    await f.tapEl(1, 'btn-begin');
    await waitScreen(page, 'play');
    await f.tapEl(1, 'touch-btn-pause');
    await waitScreen(page, 'pause');
    for (const id of ['btn-resume', 'btn-restart', 'btn-to-select', 'btn-mute']) await reach(id);
    await f.tapEl(1, 'btn-resume');
    await waitScreen(page, 'play');
    await page.evaluate(() => window.__game!.lose());
    await waitScreen(page, 'gameover', 30_000);
    for (const id of ['btn-retry', 'btn-go-select']) await reach(id);
    await f.tapEl(1, 'btn-retry');
    await waitScreen(page, 'play');
    await page.evaluate(() => window.__game!.win());
    await waitScreen(page, 'result', 40_000);
    await reach('btn-again');
    await noOverlap('[data-testid="btn-again"]', '#share');
    await reach('btn-rs-select');
    await noOverlap('[data-testid="btn-rs-select"]', '#share');
    // 横にはみ出さない
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && scrollX === 0)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('明るさの帯：構え・段の字が枠の内側に収まり、枠の位置と幅は状態（立つ・しゃがむ／闇・薄明・灯り）で変わらない（568×320・844×390）', async ({ page }) => {
    const errors = collectErrors(page);
    for (const size of [
      { width: 568, height: 320 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(size);
      await boot(page, '?touch=1&autostart=1&seed=3&god=1');
      const frames = new Set<string>();
      const seen = new Set<string>();
      const spots = [
        [-14, 37.5, 270, false],
        [-7, 31.5, 0, true],
        [-2, 33, 0, true],
        [-33, -10, 270, true],
      ] as const;
      for (const [x, z, yaw, crouch] of spots) {
        await page.evaluate(([px, pz, py, pc]) => {
          window.__game!.teleport(px, pz, py);
          window.__game!.setCrouch(pc);
        }, [x, z, yaw, crouch] as const);
        await waitGameSeconds(page, 0.4);
        const r = await page.evaluate(() => {
          const bl = document.querySelector('.kg-hud-bl')!.getBoundingClientRect();
          const st = document.querySelector('.kg-stance')!;
          const ti = document.querySelector('.kg-tier')!;
          const pad = parseFloat(getComputedStyle(document.querySelector('.kg-hud-bl')!).paddingLeft);
          const sb = st.getBoundingClientRect();
          const tb = ti.getBoundingClientRect();
          return {
            text: `${st.textContent}／${ti.textContent}`,
            frame: `${Math.round(bl.left)}|${Math.round(bl.width)}`,
            stanceInside: st.scrollWidth <= st.clientWidth + 1 && sb.left >= bl.left + pad - 1,
            tierInside: ti.scrollWidth <= ti.clientWidth + 1 && tb.right <= bl.right - pad + 1,
            apart: sb.right <= tb.left + 0.5,
          };
        });
        expect(r.stanceInside, `${size.width}px ${r.text}：構えの字が枠の内側`).toBe(true);
        expect(r.tierInside, `${size.width}px ${r.text}：段の字が枠の内側`).toBe(true);
        expect(r.apart, `${size.width}px ${r.text}：構えと段の字が重ならない`).toBe(true);
        frames.add(r.frame);
        seen.add(r.text);
      }
      expect(frames.size, `${size.width}px：枠の位置と幅が状態で変わらない（${[...seen].join(' ・ ')}）`).toBe(1);
      expect(seen.size, `${size.width}px：構えと段が複数の組み合わせを通った`).toBeGreaterThanOrEqual(3);
    }
    expect(errors).toEqual([]);
  });

  test('568×320：討たれた・結果の画面は、スクロールしなくても全部のボタンが収まり、位の一言（影・梟・狐・猪）が統計の欄に食い込まない', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 568, height: 320 });
    await boot(page, '?touch=1&autostart=1&seed=1&god=1');
    const inside = async (id: string): Promise<void> => {
      const b = (await page.getByTestId(id).boundingBox())!;
      expect(b.height, id).toBeGreaterThanOrEqual(44);
      expect(b.y, `${id} の上端`).toBeGreaterThanOrEqual(0);
      expect(b.y + b.height, `${id} の下端（スクロールなしで画面の内側）`).toBeLessThanOrEqual(320);
      expect(b.x + b.width, id).toBeLessThanOrEqual(568);
    };
    // 討たれた：いちばん長い文（原因・捕まった様子・助言）に差し替えても、2つのボタンとも画面の内側
    await page.evaluate(() => window.__game!.lose());
    await waitScreen(page, 'gameover', 30_000);
    await page.evaluate(() => {
      const body = document.querySelector('.kg-go-body')!;
      const lines: [string, string][] = [
        ['kg-go-cause', '表門の番兵（左）に、薄明の中で走っていたところを、3.0m 先から見られた。'],
        ['kg-go-capture', '表門の番兵（左）の槍に突かれた（0.7m）。'],
        ['kg-go-hint', '走ると遠くまで見える。番兵の近くでは歩くか、しゃがめ。'],
      ];
      body.replaceChildren(
        ...lines.map(([cls, t]) => {
          const p = document.createElement('p');
          p.className = cls;
          // ui.ts の phraseSpans と同じ区切り（タッチのときは句ごとの箱）
          p.append(
            ...t
              .split(/(?<=[／。、・])|(?=（)/)
              .filter(Boolean)
              .map((part) => {
                const sp = document.createElement('span');
                sp.className = 'kg-ph';
                sp.textContent = part;
                return sp;
              }),
          );
          return p;
        }),
      );
    });
    await page.getByTestId('screen-gameover').evaluate((e) => (e.scrollTop = 0));
    await inside('btn-retry');
    await inside('btn-go-select');
    const f = await Fingers.create(page);
    await f.tapEl(1, 'btn-retry');
    await waitScreen(page, 'play');
    // 結果：位の一言を4種類に差し替えて、統計の欄・パネルの外へ食い込まないことを測る
    await page.evaluate(() => window.__game!.win());
    await waitScreen(page, 'result', 40_000);
    await page.getByTestId('screen-result').evaluate((e) => (e.scrollTop = 0));
    for (const text of ['誰にも気づかれず、誰も倒さず。影のごとく討った。', '闇を見通し、一度も見つからなかった。', '一度は見つかったが、知恵で切り抜けた。', '力ずくの突破だった。次は闇と灯りを読め。']) {
      const r = await page.evaluate((t) => {
        const box = document.querySelector('.kg-rank-text')!;
        box.replaceChildren(
          ...t
            .split(/(?<=。)/)
            .filter(Boolean)
            .map((line) => {
              const row = document.createElement('div');
              row.append(
                ...line
                  .split(/(?<=、)/)
                  .filter(Boolean)
                  .map((part) => {
                    const sp = document.createElement('span');
                    sp.className = 'kg-ph';
                    sp.textContent = part;
                    return sp;
                  }),
              );
              return row;
            }),
        );
        const stats = document.querySelector('.kg-rs-stats')!.getBoundingClientRect();
        const panel = document.querySelector('.kg-result .kg-panel-wide')!.getBoundingClientRect();
        let right = -1;
        let left = 1e9;
        for (const sp of box.querySelectorAll('.kg-ph')) {
          const b = sp.getBoundingClientRect();
          right = Math.max(right, b.right);
          left = Math.min(left, b.left);
        }
        return { right, left, statsLeft: stats.left, panelLeft: panel.left, panelRight: panel.right };
      }, text);
      expect(r.right, `${text}：統計の欄（左端 ${r.statsLeft}）に食い込まない`).toBeLessThanOrEqual(r.statsLeft);
      expect(r.left, `${text}：パネルの左の外へ出ない`).toBeGreaterThanOrEqual(r.panelLeft);
      await inside('btn-again');
      await inside('btn-rs-select');
    }
    expect(errors).toEqual([]);
  });

  test('縦向き：タイトル・選択・説明は使えて「横向きで遊びます」の注記が出る。遊ぶ画面では横向きの案内（絵と2行）', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page, '?touch=1&seed=1&god=1');
    await expect(page.getByTestId('screen-title').getByTestId('portrait-note')).toBeVisible();
    await expect(page.getByTestId('screen-title').getByTestId('portrait-note')).toHaveText('スマホは横向きで遊びます');
    const f = await Fingers.create(page);
    await f.tapEl(1, 'btn-start');
    await waitScreen(page, 'select');
    await expect(page.getByTestId('screen-select').getByTestId('portrait-note')).toBeVisible();
    await page.getByTestId('stage-honnoji').scrollIntoViewIfNeeded();
    await f.tapEl(1, 'stage-honnoji');
    await waitScreen(page, 'briefing');
    await expect(page.getByTestId('screen-briefing').getByTestId('portrait-note')).toBeVisible();
    // 横にはみ出さない
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByTestId('btn-begin').scrollIntoViewIfNeeded();
    await f.tapEl(1, 'btn-begin');
    // 縦のまま出陣すると止まって案内
    await waitScreen(page, 'pause');
    const rp = page.getByTestId('rotate-prompt');
    await expect(rp).toBeVisible();
    await expect(rp.locator('.kg-rotate-phone')).toBeVisible();
    await expect(rp.locator('.kg-notice-main')).toHaveText('スマホを横向きにしてください');
    await expect(rp.locator('.kg-notice-sub')).toHaveText('横にすると、続きから遊べます');
    expect(await rp.locator('.kg-notice-main').evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(22);
    // 横にすると注記と案内は消え、一時停止から再開できる
    await page.setViewportSize(PHONE);
    await expect(rp).toBeHidden();
    await expect(page.getByTestId('screen-pause')).toBeVisible();
    await f.tapEl(1, 'btn-resume');
    await waitScreen(page, 'play');
    expect(errors).toEqual([]);
  });

  test('動きを減らす設定では、横向きの案内の絵は回らない', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page, '?touch=1&autostart=1&seed=1&god=1');
    await expect(page.getByTestId('rotate-prompt')).toBeVisible();
    expect(await page.locator('.kg-rotate-phone').evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
  });
});

test.describe('デスクトップの描画は変わらない（タッチ切）', () => {
  test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });

  test('?touch=0 は標準（AOあり・画素比1.5）のまま、段階を一度も変えない', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, '?touch=0&autostart=1&seed=1');
    await page.waitForFunction(() => window.__viewReady === true, null, { timeout: 60_000 });
    await waitGameSeconds(page, 0.5);
    expect(await page.evaluate(() => ({ tier: window.__quality!.tier(), ao: window.__quality!.ao(), pr: window.__quality!.pixelRatio(), history: window.__quality!.history(), adaptive: window.__quality!.adaptive() }))).toEqual({ tier: 0, ao: true, pr: 1.5, history: [], adaptive: false });
    expect(errors).toEqual([]);
  });
});

test.describe('描画の段階（__quality）', () => {
  // 画素比3の端末。isMobile の既定（画素比1）だと、段階を変えなくても「画素比 ≤ 1.25」が通ってしまう（2026-11-03 独立レビュー）
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });

  test('タッチでは「やや軽い」から始まり、自動操作では引き下げない。?quality= は段階を決め、引き下げない', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, '?touch=1&autostart=1&seed=1');
    await page.waitForFunction(() => window.__viewReady === true, null, { timeout: 60_000 });
    let q = await page.evaluate(() => ({ tier: window.__quality!.tier(), id: window.__quality!.id(), ao: window.__quality!.ao(), adaptive: window.__quality!.adaptive(), pr: window.__quality!.pixelRatio() }));
    // 実際の描画の状態：画素比は 3 でなく段階の上限（1.25）、AO の段は止まっている
    expect(q).toMatchObject({ tier: 1, id: 'mid', ao: false, adaptive: false, pr: 1.25 });
    for (const [id, tier, pr, ao] of [['high', 0, 1.5, true], ['low', 2, 1, false], ['min', 3, 0.75, false]] as const) {
      await boot(page, `?touch=1&autostart=1&seed=1&quality=${id}`);
      await page.waitForFunction(() => window.__viewReady === true, null, { timeout: 60_000 });
      q = await page.evaluate(() => ({ tier: window.__quality!.tier(), id: window.__quality!.id(), ao: window.__quality!.ao(), adaptive: window.__quality!.adaptive(), pr: window.__quality!.pixelRatio() }));
      expect(q).toMatchObject({ tier, id, adaptive: false, pr, ao });
      expect(await page.evaluate(() => window.__quality!.explicit())).toBe(true);
      await waitGameSeconds(page, 0.3);
    }
    expect(errors).toEqual([]);
  });

  test('?adaptive=1 なら自動操作でも、止まり続けると1段下げる（上げない）', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, '?touch=1&autostart=1&seed=1&adaptive=1');
    await page.waitForFunction(() => window.__viewReady === true, null, { timeout: 60_000 });
    expect(await page.evaluate(() => window.__quality!.adaptive())).toBe(true);
    expect(await page.evaluate(() => window.__quality!.tier())).toBe(1);
    // 起動後の待ち（3秒）を過ぎてから、主スレッドを 300ms ずつ止める（250ms 超のコマが窓に4回＝止まり続けている）
    await page.waitForTimeout(3_300);
    for (let i = 0; i < 6 && (await page.evaluate(() => window.__quality!.tier())) === 1; i++) {
      await page.evaluate(() => {
        const t = performance.now();
        while (performance.now() - t < 300) {
          /* 止める */
        }
      });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    }
    await expect.poll(() => page.evaluate(() => window.__quality!.tier())).toBe(2);
    const h = await page.evaluate(() => window.__quality!.history());
    expect(h.length).toBe(1);
    expect(h[0]).toMatchObject({ from: 1, to: 2 });
    expect(await page.evaluate(() => window.__quality!.label())).toBe('軽い');
    // 軽くなっても、上げ戻さない
    await page.waitForTimeout(1_500);
    expect(await page.evaluate(() => window.__quality!.tier())).toBe(2);
    expect(errors).toEqual([]);
  });
});
