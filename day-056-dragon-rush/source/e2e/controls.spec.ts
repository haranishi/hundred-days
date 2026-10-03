// OWNER: tests
// 操作性の E2E（r02-controls）：本物のキー入力の経路で、上下の操作・R の長押し・案内の順番・照準・設定の保存・結果の時刻と自己ベストを確かめる。
// 向き直りや張り付きの細かい秒数は tests/gameplay/controls.measure.test.ts（描画なし・刻みごと）で測る。
// 環境変数 R02_E2E_OUT に JSON の道のりを渡すと、測った数字を書き出す（周の報告用）。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { collectErrors, expect, test, type Page } from './fixtures';

const OUT = process.env.R02_E2E_OUT;

function note(key: string, value: unknown): void {
  if (!OUT) return;
  mkdirSync(path.dirname(OUT), { recursive: true });
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(readFileSync(OUT, 'utf8')) as Record<string, unknown>;
  } catch {
    data = {};
  }
  data[key] = value;
  writeFileSync(OUT, JSON.stringify(data, null, 2));
}

async function waitState(page: Page, fn: string, timeout = 60_000): Promise<void> {
  await page.waitForFunction(`(window.__state !== undefined && (${fn})) || typeof window.__appError === 'string'`, null, { timeout, polling: 50 });
  expect(await page.evaluate(() => window.__appError ?? null)).toBeNull();
}

/** ゲーム内の seconds 秒のあいだ、コマごとに高さを記録して、上下の速さ（m/s、上が正）を返す。 */
async function verticalRate(page: Page, seconds: number, skip: number): Promise<number> {
  return page.evaluate(
    ({ seconds, skip }) =>
      new Promise<number>((resolve) => {
        const s0 = window.__state!;
        let a: { t: number; alt: number } | null = null;
        const tick = (): void => {
          const s = window.__state!;
          if (!a && s.t - s0.t >= skip) a = { t: s.t, alt: s.dragon.altitude };
          if (a && s.t - s0.t >= seconds) return resolve((s.dragon.altitude - a.alt) / (s.t - a.t));
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    { seconds, skip },
  );
}

test('本物のキーで：Space 長押しは毎秒15〜20mで上がり続け、C は毎秒15m前後で降り、Shift を離すと0.5秒で滑空に戻る', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?playtest=script&q=low');
  await waitState(page, "window.__state.phase === 'playing' && window.__state.t > 0.3");
  await page.keyboard.down('Space');
  const climb = await verticalRate(page, 2.5, 1.0);
  await page.keyboard.up('Space');
  await page.keyboard.down('KeyC');
  const descend = -(await verticalRate(page, 2.5, 1.0));
  await page.keyboard.up('KeyC');
  // 急降下して、Shift を離してから落ちる速さが毎秒6m以下に戻るまで（ゲーム内の秒）
  await page.keyboard.down('ShiftLeft');
  await page.waitForTimeout(700);
  await page.keyboard.up('ShiftLeft');
  const recover = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const s0 = window.__state!;
        let prev = s0;
        const tick = (): void => {
          const s = window.__state!;
          const dt = s.t - prev.t;
          if (dt > 0) {
            const vy = (s.dragon.altitude - prev.dragon.altitude) / dt;
            if (vy >= -6 || s.dragon.mode !== 'air') return resolve(s.t - s0.t);
          }
          prev = s;
          if (s.t - s0.t > 5) return resolve(99);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
  note('climbHoldRate', climb);
  note('cDescendRate', descend);
  note('shiftReleaseToGlideSeconds', recover);
  expect(climb).toBeGreaterThanOrEqual(15);
  expect(climb).toBeLessThanOrEqual(20);
  expect(descend).toBeGreaterThanOrEqual(12);
  expect(descend).toBeLessThanOrEqual(18);
  expect(recover).toBeLessThanOrEqual(0.6);
  expect(errors).toEqual([]);
});

test('案内は「動く → 炎 → 爪 → 飛ぶ」の順に1行ずつ出て、始まりの照準は炎の届く所（明るい）', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?playtest=script&q=low');
  await waitState(page, "window.__state.phase === 'playing' && window.__state.t > 0.2");
  const coach = page.getByTestId('coach');
  const reticle = page.getByTestId('reticle');
  await expect(reticle).toHaveClass(/dr-reach/);
  expect(await page.evaluate(() => window.__state!.aim.reach)).toBe(true);
  const steps: { step: string; text: string }[] = [];
  const read = async (): Promise<void> => {
    const step = (await coach.getAttribute('data-step')) ?? 'none';
    const text = (await coach.textContent()) ?? '';
    if (steps.length === 0 || steps[steps.length - 1].step !== step) steps.push({ step, text });
  };
  await read();
  await page.evaluate(() => window.__input!.hold('w', 800));
  await waitState(page, "window.__state.coach === 'breath'", 10_000);
  await read();
  await page.evaluate(() => window.__input!.hold('left', 1500));
  await waitState(page, "window.__state.coach === 'claw'", 10_000);
  await read();
  await page.evaluate(() => window.__input!.tap('right'));
  // r05-play：爪を振っても、何かが崩れるまでは「飛ぶ」へ進まない（体験の採点 r04：傾いたビルを離れて最初の崩落が遅れた）。
  // 案内の文どおり、急降下して着地し、爪を振って崩す
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__state!.coach)).toBe('claw');
  await page.evaluate(() => window.__input!.hold('Shift', 6000));
  await waitState(page, "window.__state.dragon.mode === 'ground' || window.__state.dragon.mode === 'landing'", 30_000);
  for (let i = 0; i < 40 && (await page.evaluate(() => window.__state!.coach)) === 'claw'; i++) {
    await page.evaluate(() => window.__input!.tap('right'));
    await page.waitForTimeout(350);
  }
  await waitState(page, "window.__state.coach === 'fly'", 10_000);
  const flyAt = await page.evaluate(() => ({ t: window.__state!.t, firstCollapseAt: window.__state!.firstCollapseAt }));
  note('coachFlyAfterCollapse', flyAt);
  expect(flyAt.firstCollapseAt).not.toBeNull();
  await read();
  await page.evaluate(() => window.__input!.hold('Space', 800));
  await waitState(page, "window.__state.coach === 'rage'", 10_000);
  await read();
  note('coachOrder', steps);
  expect(steps.map((s) => s.step)).toEqual(['move', 'breath', 'claw', 'fly', 'none']);
  expect(steps[0].text).toContain('WASD');
  expect(steps[1].text).toContain('左クリック');
  expect(steps[2].text).toContain('右クリック');
  expect(steps[3].text).toContain('Space');
  // 空を見上げると、照準は暗くなる（炎が届かない）。r05-play：急降下した後で背の高いビルが近いので、上がってから、空が照準に来る向きを探す
  await page.evaluate(() => window.__input!.hold('Space', 3000));
  await page.waitForTimeout(3200);
  await page.evaluate(() => window.__input!.look(0, -3000));
  for (let i = 0; i < 6 && (await page.evaluate(() => window.__state!.aim.reach)); i++) {
    await page.evaluate(() => window.__input!.look(480, 0));
    await page.waitForTimeout(150);
  }
  await waitState(page, 'window.__state.aim.reach === false', 5_000);
  await expect(reticle).not.toHaveClass(/dr-reach/);
  expect(errors).toEqual([]);
});

test('遊んでいる途中の R は0.8秒の長押しでやり直し（短く押しても始め直さない）、進み具合が出る', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?playtest=script&q=low');
  await waitState(page, "window.__state.phase === 'playing' && window.__state.t > 1.5");
  const before = await page.evaluate(() => window.__state!.t);
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__state!.t)).toBeGreaterThan(before);
  await page.keyboard.down('KeyR');
  const started = Date.now();
  await expect(page.getByTestId('restart-hold')).toBeVisible();
  await waitState(page, 'window.__state.t < 0.5', 3_000);
  const held = (Date.now() - started) / 1000;
  await page.keyboard.up('KeyR');
  note('restartHoldSeconds', held);
  expect(held).toBeGreaterThanOrEqual(0.7);
  expect(held).toBeLessThan(1.6);
  await expect(page.getByTestId('restart-hold')).toBeHidden();
  expect(errors).toEqual([]);
});

test('一時停止の画面で感度と上下反転を変えると保存され、読み込み直しても残る。操作の表はキーと説明が別の列', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?playtest=script&q=low');
  await waitState(page, "window.__state.phase === 'playing'");
  await page.keyboard.press('Escape');
  await waitState(page, "window.__state.phase === 'paused'", 10_000);
  const slider = page.getByTestId('look-sensitivity');
  await expect(slider).toBeVisible();
  await slider.evaluate((el) => {
    const input = el as HTMLInputElement;
    input.value = '80';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.getByTestId('look-invert').check();
  const saved = await page.evaluate(() => JSON.parse(window.localStorage.getItem('dragon-rampage.prefs') ?? '{}') as { lookScale?: number; invertY?: boolean });
  expect(saved.lookScale).toBeGreaterThan(1.3);
  expect(saved.invertY).toBe(true);
  // 操作の表（バグ B3）：キーと説明が別の要素で、2列に並ぶ
  const rows = await page.getByTestId('pause-overlay').locator('.dr-keys').first().evaluate((g) => {
    const cells = [...g.children].map((c) => ({ cls: c.className, text: c.textContent ?? '', left: (c as HTMLElement).getBoundingClientRect().left }));
    return cells;
  });
  const keys = rows.filter((r) => r.cls.includes('dr-key') && !r.cls.includes('what'));
  const whats = rows.filter((r) => r.cls.includes('dr-key-what'));
  expect(keys.length).toBeGreaterThanOrEqual(10);
  expect(keys.length).toBe(whats.length);
  expect(new Set(whats.map((w) => Math.round(w.left))).size).toBe(1);
  expect(keys.find((k) => k.text === 'Q')).toBeDefined();
  await page.reload();
  await waitState(page, "window.__state.phase === 'playing'");
  await page.keyboard.press('Escape');
  await waitState(page, "window.__state.phase === 'paused'", 10_000);
  expect(Number(await page.getByTestId('look-sensitivity').inputValue())).toBe(80);
  await expect(page.getByTestId('look-invert')).toBeChecked();
  expect(errors).toEqual([]);
});

test('結果はゲーム内時刻の180.0秒で出て、自己ベストを記録する。2回目は前回との差が出て、結果の画面の R は1回で始まる', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  await page.goto('/?playtest=basic&speed=16&q=low');
  await waitState(page, "window.__state.phase === 'result'", 120_000);
  const endedAt = await page.evaluate(() => window.__state!.endedAt);
  note('resultAtGameSeconds', endedAt);
  expect(endedAt).not.toBeNull();
  expect(Math.abs(endedAt! - 180)).toBeLessThanOrEqual(0.1);
  await expect(page.getByTestId('result-records')).toContainText('はじめて');
  const t0 = Date.now();
  await page.keyboard.press('KeyR');
  // r05：16倍速では t<1 が実時間で約62ms しか続かず、負荷が高いと50msおきの見張りが取りこぼした。直前は結果の画面なので、
  // 遊びに戻っていれば新しく始まった回。ゲーム内8秒（実時間0.5秒）までを始まりとみなす
  await waitState(page, "window.__state.phase === 'playing' && window.__state.t < 8", 2_000);
  note('resultRestartMs', Date.now() - t0);
  await waitState(page, "window.__state.phase === 'result'", 120_000);
  const lines = await page.getByTestId('result-overlay').locator('.dr-best').allTextContents();
  note('resultRecordLines', lines);
  expect(lines.join('\n')).toContain('前回より');
  const rec = await page.evaluate(() => JSON.parse(window.localStorage.getItem('dragon-rampage.records') ?? '{}') as { monsters?: Record<string, { plays: number }> });
  expect(rec.monsters?.kurenairyu?.plays).toBe(2);
  expect(errors).toEqual([]);
});
