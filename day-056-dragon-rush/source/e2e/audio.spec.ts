// OWNER: tests
// 音の E2E：最初のクリックで音が起き、BGM が小節の頭で鳴り始め、出来事で効果音が鳴り、コンソールにエラーが出ないこと。
// 一時停止の画面に「全体・BGM・効果音」の音量があり、動かすと保存されること。一時停止の間は曲の時計が止まること（r02-audio）。
// 音そのものの検証は tools/audio-render.mjs。
import { collectErrors, expect, test } from './fixtures';

test('クリックで音が起き、BGM が始まり、着地や足音で効果音が鳴る（エラー0）', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.goto('/?q=low');
  await page.waitForFunction(() => window.__state?.phase === 'ready' || typeof window.__appError === 'string', null, { timeout: 60_000 });
  await page.getByTestId('start-overlay').click();
  await page.waitForFunction(() => window.__audioLog?.state === 'running' && window.__audioLog.music.started, null, { timeout: 30_000, polling: 200 });
  // 急降下で着地させ、歩いて足音を出す
  await page.evaluate(() => window.__input!.hold('Shift', 4000));
  await page.waitForFunction(() => window.__state?.dragon.mode === 'ground', null, { timeout: 30_000 });
  await page.evaluate(() => window.__input!.hold('KeyW', 2500));
  await page.waitForFunction(() => {
    const c = window.__audioLog?.counts ?? {};
    return (c.land ?? 0) + (c.landHeavy ?? 0) >= 1 && (c.stepFront ?? 0) + (c.stepHind ?? 0) >= 1;
  }, null, { timeout: 20_000, polling: 250 });
  const log = await page.evaluate(() => window.__audioLog!);
  expect(log.limiter).toBe('worklet');
  expect(log.failed).toBe(0);
  const played = log.entries.filter((e) => !e.dropped);
  expect(played.length).toBeGreaterThan(0);
  // 出来事を受けてから音が出るまで（出力の遅れを含む見積もり）が 50ms 以内
  for (const e of played) if (e.prop === 0) expect(e.skewMs).toBeLessThan(50);
  expect(errors).toEqual([]);
});

test('一時停止の画面に音量が3つ（全体・BGM・効果音）あり、動かすと保存される', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?playtest=script&q=low');
  await page.waitForFunction(() => window.__state?.phase === 'playing' || typeof window.__appError === 'string', null, { timeout: 60_000 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__state?.phase === 'paused', null, { timeout: 10_000 });
  for (const k of ['volume', 'bgm', 'sfx']) await expect(page.getByTestId(`volume-${k}`)).toBeVisible();
  await page.getByTestId('volume-bgm').evaluate((el) => {
    const input = el as HTMLInputElement;
    input.value = '30';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const saved = await page.evaluate(() => JSON.parse(window.localStorage.getItem('dragon-rampage.prefs') ?? '{}') as { bgm?: number });
  expect(saved.bgm).toBeCloseTo(0.3, 5);
  expect(errors).toEqual([]);
});

test('一時停止の間は曲の時計が止まり、再開すると止めた位置から続く', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.goto('/?q=low');
  await page.waitForFunction(() => window.__state?.phase === 'ready' || typeof window.__appError === 'string', null, { timeout: 60_000 });
  await page.getByTestId('start-overlay').click();
  await page.waitForFunction(() => window.__audioLog?.state === 'running' && window.__audioLog.music.started && window.__audioLog.music.position > 1.5, null, { timeout: 30_000, polling: 200 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__state?.phase === 'paused' && window.__audioLog?.music.paused === true, null, { timeout: 10_000, polling: 100 });
  const p1 = await page.evaluate(() => window.__audioLog!.music.position);
  await page.waitForTimeout(1500);
  const p2 = await page.evaluate(() => window.__audioLog!.music.position);
  // 止まっている間、曲の位置は進まない
  expect(Math.abs(p2 - p1)).toBeLessThan(0.02);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__state?.phase === 'playing' && window.__audioLog?.music.paused === false, null, { timeout: 10_000, polling: 100 });
  await page.waitForTimeout(2000);
  const music = await page.evaluate(() => window.__audioLog!.music);
  expect(music.position).toBeGreaterThan(p2 + 1);
  const last = music.pauses[music.pauses.length - 1];
  expect(last.resumedAt).not.toBeNull();
  // 止めた位置から続く（戻った時刻に、止めた位置が鳴るよう並べ直す）
  expect(Math.abs(last.pos - p1)).toBeLessThan(0.01);
  expect(errors).toEqual([]);
});
