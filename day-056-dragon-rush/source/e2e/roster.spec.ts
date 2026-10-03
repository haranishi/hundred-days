// OWNER: tests
// 怪獣を選ぶ E2E（r03-roster、docs/CHARACTERS.md の UX5）：初回は1クリックで紅竜が始まる／始める前に数字キーで選べ、選んだ怪獣は保存される／
// 結果の画面から2秒以内に別の怪獣で始まる／R で同じ怪獣でやり直す／怪獣ごとの自己ベストが出る。?creature= で撮影と自動プレイが3体とも動く。
// 環境変数 R03_E2E_OUT に JSON の道のりを渡すと、測った数字を書き出す（周の報告用）。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { collectErrors, expect, test, type Page } from './fixtures';

const OUT = process.env.R03_E2E_OUT;

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

test('初回は紅竜が選ばれた札が3枚並び、どこをクリックしても1回で紅竜が始まる', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?q=low');
  await waitState(page, "window.__state.phase === 'ready'");
  const cards = page.getByTestId('creature-cards');
  await expect(cards.locator('.dr-card')).toHaveCount(3);
  await expect(cards).toHaveAttribute('data-selected', 'kurenai');
  await expect(cards.locator('.dr-card.dr-sel')).toContainText('紅竜');
  expect(await page.evaluate(() => window.__state!.creature.id)).toBe('kurenai');
  // 札の外（題の上）をクリックする
  await page.getByTestId('start-overlay').click({ position: { x: 40, y: 40 } });
  await waitState(page, "window.__state.phase === 'playing'", 5_000);
  expect(await page.evaluate(() => window.__state!.creature.id)).toBe('kurenai');
  expect(errors).toEqual([]);
});

// r05-play（体験の採点 r04 の B4）：画面のちょうど中央に雷翼の札があり、初めての人が中央をクリックすると雷翼で始まっていた。
// 札は画面の下に置き、中央の広い範囲（横 30〜70%・縦 30〜62%）には札を置かない。何も選んでいない人が中央を押すと紅竜で始まり、札を押すとその怪獣で始まる。
test('画面の中央には札が無く、何も選んでいない人が中央をクリックすると紅竜で始まる。札を押すとその怪獣で始まる', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  const fresh = async (): Promise<void> => {
    await page.goto('/?q=low');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await waitState(page, "window.__state.phase === 'ready'");
    await expect(page.getByTestId('creature-cards')).toHaveAttribute('data-selected', 'kurenai');
  };
  const cardAt = (x: number, y: number): Promise<string | null> =>
    page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest('.dr-card')?.getAttribute('data-creature') ?? null, [x, y] as const);
  const started: Record<string, string> = {};
  for (const size of [
    { width: 1600, height: 900 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(size);
    await fresh();
    // 中央の範囲（横 30〜70%・縦 30〜62% を 9×9 点）に札が無い
    const onCard: string[] = [];
    for (let i = 0; i <= 8; i++) {
      for (let j = 0; j <= 8; j++) {
        const x = Math.round(size.width * (0.3 + 0.05 * i));
        const y = Math.round(size.height * (0.3 + 0.04 * j));
        const c = await cardAt(x, y);
        if (c) onCard.push(`${x},${y}:${c}`);
      }
    }
    expect(onCard, `${size.width}×${size.height} の中央に札がある`).toEqual([]);
    // 中央をクリックすると紅竜
    await page.mouse.click(size.width / 2, size.height / 2);
    await waitState(page, "window.__state.phase === 'playing'", 5_000);
    started[`${size.width}x${size.height}.center`] = await page.evaluate(() => window.__state!.creature.id);
    expect(started[`${size.width}x${size.height}.center`]).toBe('kurenai');
  }
  // 札を押すと、その怪獣で始まる（1600×900）
  await page.setViewportSize({ width: 1600, height: 900 });
  for (const id of ['raiyoku', 'homuratsuno', 'kurenai'] as const) {
    await fresh();
    const box = await page.getByTestId('creature-cards').locator(`[data-creature="${id}"]`).boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await waitState(page, `window.__state.phase === 'playing' && window.__state.creature.id === '${id}'`, 15_000);
    started[`card.${id}`] = id;
  }
  note('startClicks', started);
  expect(errors).toEqual([]);
});

test('始める前に数字キーで選べ（3 で焔角）、クリックでその怪獣が始まる。選んだ怪獣は保存され、読み込み直しても続く', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?q=low');
  await waitState(page, "window.__state.phase === 'ready'");
  await page.keyboard.press('Digit3');
  await waitState(page, "window.__state.creature.id === 'homuratsuno'", 15_000);
  await expect(page.getByTestId('creature-cards')).toHaveAttribute('data-selected', 'homuratsuno');
  // 飛べない焔角は、地面に立って待つ
  expect(await page.evaluate(() => window.__state!.dragon.mode)).toBe('ground');
  await page.getByTestId('start-overlay').click({ position: { x: 40, y: 40 } });
  await waitState(page, "window.__state.phase === 'playing'", 5_000);
  expect(await page.evaluate(() => window.__state!.creature.id)).toBe('homuratsuno');
  const saved = await page.evaluate(() => JSON.parse(window.localStorage.getItem('dragon-rampage.prefs') ?? '{}') as { creature?: string });
  expect(saved.creature).toBe('homuratsuno');
  // 遊んでいる途中の数字キーは効かない（点の比べ方がぶれるので、途中では選び直せない）
  await page.keyboard.press('Digit2');
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__state!.creature.id)).toBe('homuratsuno');
  await page.reload();
  await waitState(page, "window.__state.phase === 'ready'");
  expect(await page.evaluate(() => window.__state!.creature.id)).toBe('homuratsuno');
  await expect(page.getByTestId('creature-cards')).toHaveAttribute('data-selected', 'homuratsuno');
  expect(errors).toEqual([]);
});

test('結果の画面から2秒以内に別の怪獣で始まり、R で同じ怪獣でやり直す。自己ベストは怪獣ごと', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = collectErrors(page);
  await page.goto('/?playtest=basic&speed=16&q=low');
  await waitState(page, "window.__state.phase === 'result'", 120_000);
  await expect(page.getByTestId('result-records')).toContainText('紅竜ではじめて');
  await expect(page.getByTestId('result-cards').locator('.dr-card')).toHaveCount(3);
  // 数字キー 2 で雷翼：結果の画面から、すぐ雷翼で始まる
  let t0 = Date.now();
  await page.keyboard.press('Digit2');
  // r05：16倍速では t<1 が実時間で約62ms しか続かず、負荷が高いと50msおきの見張りが取りこぼした。直前は結果の画面なので、
  // 遊びに戻っていれば新しく始まった回。ゲーム内8秒（実時間0.5秒）までを始まりとみなす
  await waitState(page, "window.__state.phase === 'playing' && window.__state.creature.id === 'raiyoku' && window.__state.t < 8", 2_000);
  const switchMs = Date.now() - t0;
  note('resultToOtherCreatureMs', switchMs);
  expect(switchMs).toBeLessThan(2_000);
  await waitState(page, "window.__state.phase === 'result'", 120_000);
  await expect(page.getByTestId('result-records')).toContainText('雷翼ではじめて');
  // R は同じ怪獣（雷翼）でやり直す
  t0 = Date.now();
  await page.keyboard.press('KeyR');
  await waitState(page, "window.__state.phase === 'playing' && window.__state.creature.id === 'raiyoku' && window.__state.t < 8", 2_000);
  note('resultRestartSameMs', Date.now() - t0);
  await waitState(page, "window.__state.phase === 'result'", 120_000);
  const lines = await page.getByTestId('result-overlay').locator('.dr-best').allTextContents();
  note('raiyokuSecondRunLines', lines);
  expect(lines.join('\n')).toContain('雷翼の自己ベスト');
  expect(lines.join('\n')).toContain('前回より');
  const rec = await page.evaluate(() => JSON.parse(window.localStorage.getItem('dragon-rampage.records') ?? '{}') as { monsters?: Record<string, { plays: number }> });
  note('recordPlays', { kurenairyu: rec.monsters?.kurenairyu?.plays, raiyoku: rec.monsters?.raiyoku?.plays });
  expect(rec.monsters?.kurenairyu?.plays).toBe(1);
  expect(rec.monsters?.raiyoku?.plays).toBe(2);
  // 札の下に、怪獣ごとの最高が出る
  await expect(page.getByTestId('result-cards').locator('[data-creature="kurenai"] .dr-card-best')).toContainText('最高');
  await expect(page.getByTestId('result-cards').locator('[data-creature="raiyoku"] .dr-card-best')).toContainText('最高');
  await expect(page.getByTestId('result-cards').locator('[data-creature="homuratsuno"] .dr-card-best')).toHaveText('');
  expect(errors).toEqual([]);
});

test('?creature= で雷翼と焔角の撮影（street・breath）と自動プレイが動き、技の出来事が出る', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  for (const [creature, shot] of [
    ['raiyoku', 'breath'],
    ['homuratsuno', 'street'],
  ] as const) {
    await page.goto(`/?shot=${shot}&creature=${creature}&q=low`);
    await page.waitForFunction(() => window.__shotReady === true || typeof window.__appError === 'string', null, { timeout: 90_000 });
    expect(await page.evaluate(() => window.__appError ?? null)).toBeNull();
  }
  // r04-roster2：焔角は45秒まで流し、押し倒したビルが隣を巻き込むドミノが起きていること（自動プレイでは最初の巻き込みが38秒前後）、
  // 雷翼では起きないことも見る
  for (const [creature, ev, until] of [
    ['raiyoku', 'lightning.hop', 20],
    ['homuratsuno', 'lava.impact', 45],
  ] as const) {
    await page.goto(`/?playtest=basic&speed=8&q=low&creature=${creature}`);
    await waitState(page, `window.__state.phase === 'playing' && window.__state.t > ${until}`, 60_000);
    const s = await page.evaluate(() => window.__state!);
    expect(s.creature.id).toBe(creature);
    expect(s.events[ev] ?? 0).toBeGreaterThan(0);
    if (creature === 'homuratsuno') expect(s.creature.stats.dominoTilts).toBeGreaterThan(0);
    else expect(s.creature.stats.dominoPasses).toBe(0);
    note(`${creature}.at${until}s`, { events: s.events, stats: s.creature.stats });
  }
  expect(errors).toEqual([]);
});

test('知らない怪獣の名前は起動エラーとして報告される', async ({ page }) => {
  await page.goto('/?creature=gold3heads');
  await page.waitForFunction(() => typeof window.__appError === 'string' || window.__appReady === true, null, { timeout: 60_000 });
  expect(await page.evaluate(() => window.__appError ?? '')).toContain('未知の怪獣');
});
