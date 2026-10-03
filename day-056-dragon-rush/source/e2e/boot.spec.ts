// OWNER: tests
// 読み込み・コンソールエラー0・撮影モードの準備（60秒以内）・コマ撮りの契約を確かめる。
import { collectErrors, expect, test } from './fixtures';

test('既定のページが読み込まれ、コンソールにエラーが出ない', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await page.waitForFunction(() => window.__appReady === true || typeof window.__appError === 'string', null, { timeout: 60_000 });
  expect(await page.evaluate(() => window.__appError ?? null)).toBeNull();
  await expect(page.locator('#app canvas')).toHaveCount(1);
  await expect(page.getByTestId('hud')).toBeVisible();
  // 数コマ回してからも、エラーが出ていないこと
  await page.waitForTimeout(1500);
  expect(errors).toEqual([]);
});

test('?shot=overview が60秒以内に準備完了し、HUD を消している', async ({ page }) => {
  const errors = collectErrors(page);
  const started = Date.now();
  await page.goto('/?shot=overview');
  await page.waitForFunction(() => window.__shotReady === true || typeof window.__appError === 'string', null, { timeout: 60_000 });
  const elapsed = Date.now() - started;
  expect(await page.evaluate(() => window.__appError ?? null)).toBeNull();
  expect(elapsed).toBeLessThan(60_000);
  const info = await page.evaluate(() => window.__shotInfo);
  expect(info).toBeDefined();
  expect(info!.name).toBe('overview');
  expect(info!.calls).toBeGreaterThan(20);
  expect(info!.triangles).toBeGreaterThan(10_000);
  expect(info!.gpu).not.toMatch(/swiftshader|llvmpipe|software/i);
  await expect(page.getByTestId('hud')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('?film はコマを1つずつ進め、__filmFrame を更新する', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?film=overview&frames=3&drive=ext');
  await page.waitForFunction(() => window.__filmReady === true || typeof window.__appError === 'string', null, { timeout: 60_000 });
  expect(await page.evaluate(() => window.__appError ?? null)).toBeNull();
  expect(await page.evaluate(() => window.__filmFrame)).toBe(-1);
  const frames: number[] = [];
  for (let i = 0; i < 4; i++) frames.push(await page.evaluate(() => window.__filmStep!()));
  expect(frames).toEqual([0, 1, 2, -1]);
  expect(await page.evaluate(() => window.__filmFrame)).toBe(2);
  expect(errors).toEqual([]);
});

// r05-dusk：撮影の構図と標本で、太陽を別々に置かない（全部同じ夕方の高さと色）。値は調べもの用の口（window.__app）から読む
test('撮影の構図と標本は、同じ夕方の太陽（仰角 12.5°・橙の光）で撮る', async ({ page }) => {
  const errors = collectErrors(page);
  const suns: { name: string; dir: number[]; color: number[] }[] = [];
  for (const query of ['shot=overview', 'shot=street', 'specimen=raiyoku&clip=idle&shot=street']) {
    await page.goto(`/?${query}`);
    await page.waitForFunction(() => window.__shotReady === true || typeof window.__appError === 'string', null, { timeout: 60_000 });
    expect(await page.evaluate(() => window.__appError ?? null)).toBeNull();
    suns.push({
      name: query,
      ...(await page.evaluate(() => {
        const a = window.__app as { atmosphere: { sunDir: { x: number; y: number; z: number }; sunColor: { r: number; g: number; b: number } } };
        return { dir: [a.atmosphere.sunDir.x, a.atmosphere.sunDir.y, a.atmosphere.sunDir.z], color: [a.atmosphere.sunColor.r, a.atmosphere.sunColor.g, a.atmosphere.sunColor.b] };
      })),
    });
  }
  for (const s of suns.slice(1)) {
    expect(s.dir, s.name).toEqual(suns[0].dir);
    expect(s.color, s.name).toEqual(suns[0].color);
  }
  const [x, y, z] = suns[0].dir;
  expect((Math.asin(y / Math.hypot(x, y, z)) * 180) / Math.PI).toBeCloseTo(12.5, 1);
  // 夕方の光：赤 > 緑 > 青で、緑は赤の 2/3 未満・青は赤の半分未満（橙。r04 までの光は緑が赤の 0.70 で黄色寄りだった）
  const [r, g, b] = suns[0].color;
  expect(g).toBeGreaterThan(b);
  expect(g / r).toBeLessThan(0.66);
  expect(b / r).toBeLessThan(0.5);
  expect(errors).toEqual([]);
});

// r06-light：日陰に回る補助光は空の上の青紫から取り（地平の帯と琥珀の街は入れない）、怪獣の材質には影と逆光の中の補助光と縁の光が入る。
// GPU で実際に組まれたシェーダーの中身を読んで確かめる（three の塊の名前が変わって差し替えが外れても気づけるように）
test('撮影の構図と標本は、補助光を空の上の青紫から取り、怪獣の材質に怪獣の光が入る', async ({ page }) => {
  const errors = collectErrors(page);
  for (const query of ['shot=street', 'specimen=homuratsuno&clip=idle&shot=street']) {
    await page.goto(`/?${query}`);
    await page.waitForFunction(() => window.__shotReady === true || typeof window.__appError === 'string', null, { timeout: 60_000 });
    expect(await page.evaluate(() => window.__appError ?? null)).toBeNull();
    const r = await page.evaluate(() => {
      type Prog = { program: WebGLProgram };
      const a = window.__app as {
        atmosphere: { ambientAt(n: number[]): number[] };
        renderer: { getContext(): WebGL2RenderingContext; info: { programs: Prog[] | null } };
      };
      const gl = a.renderer.getContext();
      const fragments = (a.renderer.info.programs ?? []).map((p) => {
        const shaders = gl.getAttachedShaders(p.program) ?? [];
        const frag = shaders.find((sh) => gl.getShaderParameter(sh, gl.SHADER_TYPE) === gl.FRAGMENT_SHADER);
        return frag ? (gl.getShaderSource(frag) ?? '') : '';
      });
      const kit = fragments.filter((f) => f.includes('atmoApplyFog(gl_FragColor.rgb'));
      return {
        up: a.atmosphere.ambientAt([0, 1, 0]),
        side: a.atmosphere.ambientAt([1, 0, 0]),
        kit: kit.length,
        kitAmbient: kit.filter((f) => f.includes('iblIrradiance += atmoAmbient(')).length,
        kitOldIbl: kit.filter((f) => f.includes('iblIrradiance += getIBLIrradiance( geometryNormal )')).length,
        monster: fragments.filter((f) => f.includes('mFillCol') && f.includes('csmSunIn')).length,
      };
    });
    // 補助光は青（青 > 緑 > 赤）。上を向いた面も横を向いた面も
    for (const e of [r.up, r.side]) {
      expect(e[2], query).toBeGreaterThan(e[1]);
      expect(e[1], query).toBeGreaterThan(e[0]);
    }
    expect(r.kit, query).toBeGreaterThan(3);
    expect(r.kitAmbient, query).toBe(r.kit);
    expect(r.kitOldIbl, query).toBe(0);
    expect(r.monster, query).toBeGreaterThan(0);
  }
  expect(errors).toEqual([]);
});

test('知らないショット名は起動エラーとして報告される', async ({ page }) => {
  await page.goto('/?shot=nonexistent');
  await page.waitForFunction(() => typeof window.__appError === 'string' || window.__shotReady === true, null, { timeout: 60_000 });
  expect(await page.evaluate(() => window.__appError ?? '')).toContain('未知のショット名');
});
