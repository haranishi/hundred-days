/**
 * ひとりで1試合（desktop と mobile）：タイトル→ひとりで→ふつう→試合が始まる→キーボード（mobile はタッチのスティック）でキャラが動く
 * →一時停止→ベルの前へ teleport して連打→点が入る→試食台で食べる→店員に捕まってサービスカウンターへ戻される→forceEnd→結果が出る。
 * コンソールのエラー0件・外部への通信0件。
 * 状態は window.__SY__（?debug=1 のときだけ出る）で読む。
 */
import { expect, test, type Page } from '@playwright/test';
import { storeLayout } from '../../src/shared/layout/store';

interface SyState {
  screen: string;
  phase: string | null;
  timeLeft: number | null;
  players: {
    slot: number;
    score: number;
    pos: { x: number; z: number };
    prompt: { label: string } | null;
    caught: number;
    progress: Record<string, number>;
    screen: { foot: { x: number; y: number }; head: { x: number; y: number } } | null;
  }[];
  npcs: { id: number; role: string; state: string; pos: { x: number; z: number } }[];
  fps: number;
  drawCalls: number;
  triangles: number;
}

interface SyApi {
  state(): SyState;
  teleport(slot: number, x: number, z: number): void;
  setTimeScale(n: number): void;
  heat(slot: number, value: number): void;
  cpu(on: boolean): void;
}


const state = (page: Page): Promise<SyState> => page.evaluate(() => (window as unknown as { __SY__: { state(): SyState } }).__SY__.state());

/** 店のデータ（src/shared/layout/store.ts）の立ち位置：ベルの前・試食台の前・サービスカウンター（捕まった人が戻される所） */
const BELL = { x: -0.6, z: 9.78 };
const SAMPLES = { x: 15.0, z: -8.7 };
const SERVICE = storeLayout().places.service;

test('ひとりで1試合：動いて、ベルと試食で点が入り、店員に捕まって戻され、結果が出る', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'mobile';
  const errors: string[] = [];
  const external: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol === 'data:' || u.protocol === 'blob:') return;
    if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') external.push(r.url());
  });

  await page.goto('/?debug=1');
  await page.waitForFunction(() => '__SY__' in window);
  await page.evaluate(() => (window as unknown as { __SY__: { seed(n: number): void } }).__SY__.seed(20261006));

  // タイトル → ひとりで → ふつう（画面の担当が作る画面。ボタンの名前で探す）
  await page.getByRole('button', { name: /ひとりで/ }).first().click();
  await page.getByRole('button', { name: /ふつう/ }).first().click();
  const start = page.getByRole('button', { name: /^(はじめる|スタート)/ });
  if ((await state(page)).screen === 'setup' && (await start.count()) > 0) await start.first().click();
  await expect.poll(async () => (await state(page)).screen, { timeout: 30_000 }).toBe('playing');
  const listHead = page.getByTestId('hud-list').locator('button').first();
  // カウントダウンの3秒は、画面に「やっちゃダメ10個」を2列の札で見せる。札は自分のキャラに重ねない（round3 の C6）
  const st0 = await state(page);
  if (st0.phase === 'countdown') {
    const intro = page.getByTestId('hud-intro');
    await expect(intro).toBeVisible();
    await expect(intro.locator('.syh-intro-card')).toHaveCount(10);
    const sc = (await state(page)).players[0]!.screen!;
    const body = { x0: sc.foot.x - 34, x1: sc.foot.x + 34, y0: sc.head.y - 26, y1: sc.foot.y };
    for (const box of await intro.locator('.syh-intro-card').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect))) {
      const overlap = box.left < body.x1 && box.right > body.x0 && box.top < body.y1 && box.bottom > body.y0;
      expect(overlap, `札がキャラに重なる ${JSON.stringify(box)} ${JSON.stringify(body)}`).toBe(false);
    }
    // スマホはスティックの出し方を左下に
    if (mobile) await expect(page.getByTestId('hud-stick-hint')).toBeVisible();
  }
  await expect.poll(async () => (await state(page)).phase, { timeout: 15_000 }).toBe('playing');
  // 「スタート！」で札は見出しへ吸い込まれて消える
  await expect(page.getByTestId('hud-intro')).toBeHidden({ timeout: 3_000 });
  // 試合が始まると、スマホでは畳んで「近く：〇〇 ↑」を1件だけ出す
  if (mobile) {
    await expect(listHead).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('hud-next')).toBeVisible();
    await expect(page.getByTestId('hud-next')).toContainText('近く：');
  }

  // 動く：PC はキーボード、スマホはタッチのスティック
  const before = (await state(page)).players[0]!.pos;
  if (mobile) {
    await page.evaluate(() => {
      const zone = document.querySelector<HTMLElement>('[data-testid=stick-zone]')!;
      const r = zone.getBoundingClientRect();
      const x = r.left + r.width * 0.5;
      const y = r.top + r.height * 0.6;
      const opts = { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true };
      zone.dispatchEvent(new PointerEvent('pointerdown', { ...opts, clientX: x, clientY: y }));
      zone.dispatchEvent(new PointerEvent('pointermove', { ...opts, clientX: x, clientY: y - 70 }));
    });
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      const zone = document.querySelector<HTMLElement>('[data-testid=stick-zone]')!;
      zone.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, pointerType: 'touch', bubbles: true }));
    });
  } else {
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1000);
    await page.keyboard.up('KeyW');
  }
  const after = (await state(page)).players[0]!.pos;
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(1.5);
  // 上（北）へ動いた
  expect(after.z).toBeLessThan(before.z);

  // スマホのボタンは指で押せる大きさ（アクション96px以上、ダッシュとジャンプ64px以上）
  if (mobile) {
    for (const [id, min] of [
      ['btn-action', 96],
      ['btn-dash', 64],
      ['btn-jump', 64],
    ] as const) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box, id).not.toBeNull();
      expect(Math.min(box!.width, box!.height), id).toBeGreaterThanOrEqual(min);
    }
  }

  // 一時停止（PC は Esc、スマホは右上のボタン）→ つづける
  if (mobile) await page.getByTestId('btn-pause').tap();
  else await page.keyboard.press('Escape');
  await expect.poll(async () => (await state(page)).screen).toBe('paused');
  await page.getByRole('button', { name: /つづける/ }).first().click();
  await expect.poll(async () => (await state(page)).screen).toBe('playing');

  // ベルの前へ移して連打する
  await page.evaluate(({ x, z }) => (window as unknown as { __SY__: { teleport(s: number, x: number, z: number): void } }).__SY__.teleport(0, x, z), BELL);
  await expect.poll(async () => (await state(page)).players[0]!.prompt?.label ?? '').toBe('鳴らす');
  const score0 = (await state(page)).players[0]!.score;
  for (let i = 0; i < 12; i++) {
    if (mobile) await page.getByTestId('btn-action').tap();
    else await page.keyboard.press('KeyJ');
    await page.waitForTimeout(160);
  }
  await expect.poll(async () => (await state(page)).players[0]!.score).toBeGreaterThan(score0);
  await expect(page.getByTestId('hud-me')).toContainText(/[1-9]/);

  // ベル以外の悪事を1つ：試食台の前で連打して食べる
  await page.evaluate(({ x, z }) => (window as unknown as { __SY__: SyApi }).__SY__.teleport(0, x, z), SAMPLES);
  await expect.poll(async () => (await state(page)).players[0]!.prompt?.label ?? '').toBe('食べる');
  for (let i = 0; i < 4; i++) {
    if (mobile) await page.getByTestId('btn-action').tap();
    else await page.keyboard.press('KeyJ');
    await page.waitForTimeout(220);
  }
  await expect.poll(async () => (await state(page)).players[0]!.progress.samples ?? 0).toBeGreaterThanOrEqual(2);

  // 店員に捕まって、サービスカウンターへ戻される（開店20秒は追わないので、時間を早めて待つ）
  await page.evaluate(() => {
    const api = (window as unknown as { __SY__: SyApi }).__SY__;
    api.cpu(false);
    api.setTimeScale(5);
  });
  await expect.poll(async () => (await state(page)).timeLeft ?? 999, { timeout: 30_000 }).toBeLessThan(98);
  await page.evaluate(() => {
    const api = (window as unknown as { __SY__: SyApi }).__SY__;
    api.setTimeScale(1);
    const clerk = api.state().npcs.find((n) => n.role === 'clerk')!;
    api.heat(0, 90);
    api.teleport(0, clerk.pos.x + 0.7, clerk.pos.z);
  });
  // 見つかった瞬間：店員がいる側の画面の端が赤く光り「見つかった！」（round3 の C3）
  await expect(page.getByTestId('hud-found')).toBeVisible({ timeout: 3_000 });
  await expect(page.getByTestId('hud-found')).toContainText('見つかった！');
  await expect.poll(async () => (await state(page)).players[0]!.caught, { timeout: 10_000 }).toBe(1);
  // 捕まった帯が出て、0.6秒つかまれてからサービスカウンターへ戻される
  await expect(page.getByTestId('hud-caught')).toBeVisible();
  await expect(page.getByTestId('hud-caught')).toContainText('つかまった！');
  await expect
    .poll(async () => {
      const back = (await state(page)).players[0]!.pos;
      return Math.hypot(back.x - SERVICE.x, back.z - SERVICE.z);
    }, { timeout: 3_000 })
    .toBeLessThan(1);

  // PC の HUD の小さい字は12px 以上（round4 の F6）
  if (!mobile) {
    const sizes = await page.evaluate(() =>
      ['.syh-heat-label', '.syh-timer small', '.syh-pts small', '.syh-cpu'].map((sel) => {
        const el = document.querySelector(sel);
        return { sel, px: el ? parseFloat(getComputedStyle(el).fontSize) : 99 };
      }),
    );
    for (const s of sizes) expect(s.px, s.sel).toBeGreaterThanOrEqual(12);
  }

  // 描画の重さ（docs/04 の予算）
  const st = await state(page);
  expect(st.drawCalls).toBeLessThanOrEqual(150);
  expect(st.triangles).toBeLessThanOrEqual(300_000);

  // 試合を終わらせる → 結果
  await page.evaluate(() => (window as unknown as { __SY__: { forceEnd(): void } }).__SY__.forceEnd());
  await expect.poll(async () => (await state(page)).screen, { timeout: 15_000 }).toBe('results');
  await expect(page.locator('#screens')).toContainText(/位|荒らし度|点/);
  await page.screenshot({ path: testInfo.outputPath(`results-${testInfo.project.name}.png`) });

  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
