// OWNER: tests
// r03-fx の E2E：炎と煙と崩れ方の見た目の契約。
// ・breath の撮影：炎の層・窓の炎・煙が出て、白飛び（どれかの色が 250 以上の画素）が 1% 未満
// ・collapse の連番：崩れる建物を詳しい形（割れ目で上下に分けた形）で描き、コンクリ・外壁・ガラスの破片が出る
// ・collapse の最後（r04-fx2）：上の塊の板が下から順に潰れ、瓦礫の山が 0.4 秒以上かけて盛り上がる
import { createRequire } from 'node:module';
import { collectErrors, expect, test } from './fixtures';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs') as { PNG: { sync: { read(b: Buffer): { width: number; height: number; data: Buffer } } } };

function clippedRatio(buf: Buffer): number {
  const png = PNG.sync.read(buf);
  const n = png.width * png.height;
  let clipped = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (png.data[o] >= 250 || png.data[o + 1] >= 250 || png.data[o + 2] >= 250) clipped++;
  }
  return clipped / n;
}

test('breath：炎の層・窓の炎・煙が出て、白飛びが 1% 未満', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.goto('/?shot=breath');
  await page.waitForFunction(() => window.__shotReady === true || typeof window.__appError === 'string', null, { timeout: 90_000 });
  expect(await page.evaluate(() => window.__appError ?? null)).toBeNull();
  const fx = (await page.evaluate(() => window.__shotInfo?.fx)) as unknown as { flame: number; windowFlames: number; soft: number };
  expect(fx.flame).toBeGreaterThan(50);
  expect(fx.windowFlames).toBeGreaterThan(0);
  expect(fx.soft).toBeGreaterThan(10);
  expect(clippedRatio(await page.screenshot({ type: 'png' }))).toBeLessThan(0.01);
  expect(errors).toEqual([]);
});

test('collapse：崩れる建物を詳しい形で描き、コンクリ・外壁・ガラスの破片が出る', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.goto('/?film=collapse&frames=50&drive=ext&stride=2');
  await page.waitForFunction(() => window.__filmReady === true || typeof window.__appError === 'string', null, { timeout: 90_000 });
  expect(await page.evaluate(() => window.__appError ?? null)).toBeNull();
  let detailed = 0;
  for (let k = 0; k < 50; k++) {
    await page.evaluate(() => window.__filmStep!());
    const d = (await page.evaluate(() => window.__filmFx?.collapseDetail ?? 0)) as number;
    detailed = Math.max(detailed, d);
  }
  const fx = (await page.evaluate(() => window.__filmFx)) as { debrisSpawned: Record<'concrete' | 'facade' | 'glass', [number, number, number]> };
  expect(detailed).toBeGreaterThanOrEqual(1);
  for (const kind of ['concrete', 'facade', 'glass'] as const) {
    const [l, m, s] = fx.debrisSpawned[kind];
    expect(l + m + s).toBeGreaterThan(0);
  }
  const all = Object.values(fx.debrisSpawned);
  expect(all.reduce((s, v) => s + v[0], 0)).toBeGreaterThan(0);
  expect(all.reduce((s, v) => s + v[2], 0)).toBeGreaterThan(all.reduce((s, v) => s + v[0], 0));
  expect(errors).toEqual([]);
});

// r04-fx2：崩れの最後の段。上の塊は階ごとの板（3〜5枚）に割れ、下の板から順に潰れる。瓦礫の山は差し替えず、
// 0.4 秒以上かけて盛り上がる（規則は tests/fx/collapse.test.ts。ここでは画面の側の記録 __filmFx.collapse がつながっているかを見る）
test('collapse の最後：板が下から順に潰れ、瓦礫の山が時間をかけて盛り上がる', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  const frames = 90;
  const stride = 2;
  await page.goto(`/?film=collapse&frames=${frames}&drive=ext&stride=${stride}`);
  await page.waitForFunction(() => window.__filmReady === true || typeof window.__appError === 'string', null, { timeout: 90_000 });
  expect(await page.evaluate(() => window.__appError ?? null)).toBeNull();
  type Collapse = { slabs: number; crush: number[]; mound: number } | null;
  const starts: number[] = [];
  let slabs = 0;
  let t05 = -1;
  let t95 = -1;
  for (let k = 0; k < frames; k++) {
    await page.evaluate(() => window.__filmStep!());
    const c = (await page.evaluate(() => (window.__filmFx?.collapse ?? null) as unknown)) as Collapse;
    if (!c) continue;
    const t = (k * stride) / 60;
    slabs = c.slabs;
    c.crush.forEach((q, j) => {
      if (starts[j] === undefined && q > 0) starts[j] = t;
    });
    if (t05 < 0 && c.mound >= 0.05) t05 = t;
    if (t95 < 0 && c.mound >= 0.95) t95 = t;
  }
  expect(slabs).toBeGreaterThanOrEqual(3);
  expect(starts.length).toBe(slabs);
  for (let j = 1; j < slabs; j++) expect(starts[j]).toBeGreaterThan(starts[j - 1]);
  expect(t05).toBeGreaterThan(0);
  expect(t95).toBeGreaterThan(0);
  expect(t95 - t05).toBeGreaterThanOrEqual(0.4);
  expect(errors).toEqual([]);
});
