// OWNER: tests
// 竜の動きの E2E：自動プレイ（?playtest=basic）で、見た目のクリップが遊びの側の状態どおりに切り替わるか（window.__dragonAnim）。
// 環境変数 DR_ANIM_LOG にファイルの道のりを渡すと、時刻ごとの状態とクリップの重みを JSON Lines で書き出す（周の証拠用）。
import { writeFileSync } from 'node:fs';
import { collectErrors, expect, test, type Page } from './fixtures';

interface Probe {
  frames: number;
  dominant: string;
  weights: Record<string, number>;
  seen: Record<string, number>;
  agree: Record<string, { frames: number; matched: number }>;
  maxWeightStep: number;
  maxWeightRate: number;
  rateFrames: number;
  starts: Record<string, number>;
  lod: number;
}

interface Sample {
  t: number;
  phase: string;
  mode: string;
  action: string;
  speed: number;
  bot: string | null;
  dominant: string;
  weights: Record<string, number>;
}

async function sample(page: Page): Promise<{ s: Sample; probe: Probe | null }> {
  return page.evaluate(() => {
    const st = window.__state!;
    const p = (window as unknown as { __dragonAnim?: Probe }).__dragonAnim ?? null;
    const s = {
      t: st.t,
      phase: st.phase,
      mode: st.dragon.mode,
      action: st.dragon.action,
      speed: Math.round(st.dragon.speed * 10) / 10,
      bot: st.bot,
      dominant: p?.dominant ?? 'none',
      weights: p ? { ...p.weights } : {},
    };
    return { s, probe: p ? JSON.parse(JSON.stringify(p)) : null };
  });
}

test('自動プレイ（8倍速で3分）で、歩き・飛行・着地・炎・爪・尾・咆哮のクリップが遊びの状態どおりに切り替わる', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = collectErrors(page);
  await page.goto('/?playtest=basic&speed=8&q=low');
  await page.waitForFunction(() => (window.__state !== undefined && window.__state.phase === 'playing') || typeof window.__appError === 'string', null, { timeout: 60_000 });
  expect(await page.evaluate(() => window.__appError ?? null)).toBeNull();
  const log: Sample[] = [];
  let probe: Probe | null = null;
  const deadline = Date.now() + 260_000;
  while (Date.now() < deadline) {
    const r = await sample(page);
    log.push(r.s);
    probe = r.probe;
    if (r.s.phase === 'result') break;
    await page.waitForTimeout(120);
  }
  const out = process.env.DR_ANIM_LOG;
  if (out) {
    writeFileSync(out, log.map((s) => JSON.stringify(s)).join('\n') + '\n');
    writeFileSync(out.replace(/\.jsonl$/, '') + '-probe.json', JSON.stringify(probe, null, 2));
  }
  expect(probe).not.toBeNull();
  const p = probe!;
  expect(log[log.length - 1].phase).toBe('result');
  // 見た目の側で、どのクリップも一度は目立った（重み 0.5 超）
  for (const clip of ['walk', 'fly', 'land', 'breath', 'claw', 'tail', 'roar', 'dive']) expect(p.seen[clip], clip).toBeGreaterThan(0);
  expect(p.seen.fly + p.seen.glide).toBeGreaterThan(20);
  // 遊びの側で始まった回数（離陸・着地・炎・爪・尾・咆哮）が、見た目の側でも数えられている
  for (const k of ['takeoff', 'land', 'breath', 'claw', 'tail', 'roar']) expect(p.starts[k], k).toBeGreaterThanOrEqual(1);
  // 遊びの側の状態（技・空中・急降下・着地・歩き・立ち止まり）と、見えているクリップが合っている割合
  for (const [key, a] of Object.entries(p.agree)) {
    if (a.frames < 5) continue;
    expect(a.matched / a.frames, `${key}: ${a.matched}/${a.frames}`).toBeGreaterThanOrEqual(0.85);
  }
  expect(errors).toEqual([]);
});

test('等倍の自動プレイでは、クリップの重みが時間をかけて変わる（1コマで切り替えない）', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.goto('/?playtest=basic&speed=1&q=low');
  await page.waitForFunction(() => (window.__state !== undefined && window.__state.phase === 'playing') || typeof window.__appError === 'string', null, { timeout: 60_000 });
  // 着地 → 最寄りのビルへ歩く → 炎 → 爪、までの間（ゲーム内の約25秒）
  await page.waitForFunction(() => window.__state!.t > 25, null, { timeout: 90_000, polling: 250 });
  const p = await page.evaluate(() => (window as unknown as { __dragonAnim?: Probe }).__dragonAnim!);
  const out = process.env.DR_ANIM_LOG;
  if (out) writeFileSync(out.replace(/\.jsonl$/, '') + '-1x-probe.json', JSON.stringify(p, null, 2));
  expect(p.rateFrames).toBeGreaterThan(300);
  // いちばん速い正しい切り替え（一度きりのクリップの入り）で約21/秒。1コマで切り替えると30/秒以上になる
  expect(p.maxWeightRate).toBeLessThan(28);
  expect(p.starts.land).toBeGreaterThanOrEqual(1);
  expect(p.starts.breath).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});
