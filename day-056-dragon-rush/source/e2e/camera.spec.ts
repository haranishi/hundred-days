// OWNER: tests
// r05-camera の E2E：遊ぶカメラが、着地で揺れ・画角の跳ね・沈み込みを出すこと、網点を画面の範囲（体と照準のまわり）に絞っていること、
// 自動プレイの間にカメラが瓦礫の山の中へ入らないこと。カメラの値は window.__app.camera.userData.follow（camera/followCam.ts）から読む。
// r06-camera2：寄せたカメラ・網点の窓越しでも照準の建物が画面の中央に写る建物と同じこと（体験の採点 B2）、連鎖の数と怒りの帯が右下の隅にあること。
import { collectErrors, expect, test, type Page } from './fixtures';

async function waitState(page: Page, fn: string, timeout = 60_000): Promise<void> {
  await page.waitForFunction(`(window.__state !== undefined && (${fn})) || typeof window.__appError === 'string'`, null, { timeout, polling: 50 });
  expect(await page.evaluate(() => window.__appError ?? null)).toBeNull();
}

interface FollowLog {
  t: number;
  type: string;
  deg: number;
  kick: number;
  sink: number;
}

test('紅竜の急降下の着地で、揺れ0.5〜1°・画角の跳ね3〜5°・約0.3秒遅れの沈み込みが出る', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?playtest=script&q=low&speed=1&creature=kurenai');
  await waitState(page, "window.__state.phase === 'playing' && window.__state.t > 0.3");
  // 画角と高さを毎コマ記録する
  await page.evaluate(() => {
    const rec: { t: number; fov: number; sink: number; kick: number; shake: number }[] = [];
    (window as unknown as { __camRec: typeof rec }).__camRec = rec;
    const loop = (): void => {
      const cam = (window.__app as { camera: { fov: number; userData: { follow?: { sinkM: number; kickDeg: number; shakeDeg: number } } } }).camera;
      const f = cam.userData.follow;
      if (window.__state && f) rec.push({ t: performance.now(), fov: cam.fov, sink: f.sinkM, kick: f.kickDeg, shake: f.shakeDeg });
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  await page.evaluate(() => window.__input!.hold('Shift', 6000));
  await waitState(page, "window.__state.events['dragon.land'] >= 1", 30_000);
  await page.waitForTimeout(1200);
  const log = await page.evaluate(() => ((window.__app as { camera: { userData: { follow: { log: FollowLog[] } } } }).camera.userData.follow.log));
  const land = log.find((e) => e.type === 'dragon.land');
  expect(land).toBeDefined();
  expect(land!.deg).toBeGreaterThanOrEqual(0.5);
  expect(land!.deg).toBeLessThanOrEqual(1);
  expect(land!.kick).toBeGreaterThanOrEqual(3);
  expect(land!.kick).toBeLessThanOrEqual(5);
  expect(land!.sink).toBeGreaterThan(1);
  const rec = await page.evaluate(() => (window as unknown as { __camRec: { t: number; fov: number; sink: number; kick: number; shake: number }[] }).__camRec);
  expect(Math.max(...rec.map((r) => r.kick))).toBeGreaterThan(2.5);
  expect(Math.max(...rec.map((r) => r.shake))).toBeGreaterThan(0.4);
  // 沈み込みのいちばん深いコマは、沈み始めて 0.2〜0.45 秒後
  const startIdx = rec.findIndex((r) => r.sink < -0.05);
  const deepest = rec.reduce((a, b) => (b.sink < a.sink ? b : a));
  expect(startIdx).toBeGreaterThanOrEqual(0);
  const lag = (deepest.t - rec[startIdx].t) / 1000;
  expect(deepest.sink).toBeLessThan(-1);
  expect(lag).toBeGreaterThan(0.12);
  expect(lag).toBeLessThan(0.45);
  expect(errors).toEqual([]);
});

test('網点は、遊んでいる間は画面の範囲（体の外接矩形と照準の円）だけで間引く', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?playtest=basic&q=low&speed=4&creature=homuratsuno');
  await waitState(page, "window.__state.phase === 'playing' && window.__state.t > 3");
  const u = await page.evaluate(() => {
    const dmg = (window.__app as { cityView: { damage: { uniforms: { uOccBox: { value: { x: number; y: number; z: number; w: number } }; uOccAim: { value: { x: number; y: number; z: number; w: number } } } } } }).cityView.damage;
    return { box: { ...dmg.uniforms.uOccBox.value }, aim: { ...dmg.uniforms.uOccAim.value } };
  });
  // r06-camera2：uOccAim.w は透かし方（1〜2＝四角い窓と壁全体へ広げる度合い、3〜4＝怪獣の形と面全体へ広げる度合い）。0（建物ごと透かす）にはしない
  expect(u.aim.w).toBeGreaterThanOrEqual(1);
  expect(u.aim.w).toBeLessThanOrEqual(4);
  expect(u.aim.x).toBeCloseTo(1280 / 720, 2);
  expect(u.box.z).toBeGreaterThan(0);
  expect(u.box.w).toBeGreaterThan(0);
  expect(u.box.z).toBeLessThanOrEqual(0.46 + 1e-6);
  expect(u.box.w).toBeLessThanOrEqual(0.42 + 1e-6);
  expect(Math.abs(u.box.x)).toBeLessThan(1.5);
  expect(Math.abs(u.box.y)).toBeLessThan(1.5);
  expect(errors).toEqual([]);
});

for (const creature of ['kurenai', 'homuratsuno'] as const) {
  test(`${creature}：自動プレイ（4倍速・ゲーム内60秒）の間、カメラは瓦礫の山の中へ入らない`, async ({ page }) => {
    test.setTimeout(180_000);
    const errors = collectErrors(page);
    await page.goto(`/?playtest=basic&q=low&speed=4&creature=${creature}`);
    await waitState(page, "window.__state.phase === 'playing'");
    // 0.1秒ごとに、カメラの真下の山の表面（fx/rubble.ts の heapHeight と同じ式・置いた山の行列から）とカメラの高さを比べる
    const result = await page.evaluate(async () => {
      const heap = (u: number, v: number): number => {
        const e = Math.max(Math.abs(u), Math.abs(v)) * 2;
        const q = 0.85 * e + 0.15 * Math.hypot(u, v) * 2;
        const base = Math.pow(Math.max(0, 1 - Math.pow(q, 3)), 0.55);
        const bump = 0.14 * Math.sin(u * 23.1 + v * 7.7) * Math.cos(v * 17.3 - u * 5.1) + 0.08 * Math.sin(u * 51 + v * 43) + 0.12 * Math.sin(u * 6.1 + 1.3) * Math.cos(v * 4.3 - 0.7);
        return Math.max(0, base * (0.92 + bump));
      };
      const app = window.__app as { scene: { getObjectByName(n: string): { count: number; instanceMatrix: { array: Float32Array } } | undefined }; camera: { position: { x: number; y: number; z: number } } };
      let samples = 0;
      let overHeaps = 0;
      let worst = Infinity;
      while ((window.__state?.t ?? 0) < 60) {
        await new Promise((r) => setTimeout(r, 25));
        const rubble = app.scene.getObjectByName('rubble');
        if (!rubble) continue;
        const M = rubble.instanceMatrix.array;
        const c = app.camera.position;
        let surf = -Infinity;
        for (let i = 0; i < rubble.count; i++) {
          const e = M.subarray(i * 16, i * 16 + 16);
          const sx = Math.hypot(e[0], e[1], e[2]);
          const sy = Math.hypot(e[4], e[5], e[6]);
          const sz = Math.hypot(e[8], e[9], e[10]);
          const dx = c.x - e[12];
          const dz = c.z - e[14];
          const u = (dx * (e[0] / sx) + dz * (e[2] / sx)) / sx;
          const v = (dx * (e[8] / sz) + dz * (e[10] / sz)) / sz;
          if (Math.abs(u) > 0.5 || Math.abs(v) > 0.5) continue;
          surf = Math.max(surf, e[13] + heap(u, v) * sy);
        }
        samples++;
        if (surf > -Infinity) {
          overHeaps++;
          worst = Math.min(worst, c.y - surf);
        }
      }
      return { samples, overHeaps, worst };
    });
    console.log(`${creature}: 標本 ${result.samples}・山の上 ${result.overHeaps}・山の表面からの最小の高さ ${Number.isFinite(result.worst) ? result.worst.toFixed(2) : '-'}m`);
    expect(result.samples).toBeGreaterThan(100);
    if (result.overHeaps > 0) expect(result.worst).toBeGreaterThan(0.5);
    expect(errors).toEqual([]);
  });
}

test('寄せたカメラ・網点の窓越しでも、照準の建物は画面の中央に写る建物と同じ（体験の採点 r05 の B2）', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await page.goto('/?q=low&creature=kurenai');
  await waitState(page, "window.__state.phase === 'ready'");
  await page.mouse.click(300, 200);
  await waitState(page, "window.__state.phase === 'playing' && window.__state.t > 0.8");
  // 体験の採点役の再現手順：視点を右へ30°ずつ12回 → W＋Shift で急降下して着地 → 視点を右へ回しながら照準を確かめる
  const look = (deg: number): Promise<void> => page.evaluate((u) => window.__input!.look(u, 0), deg / 0.126);
  for (let i = 0; i < 12; i++) {
    await look(30);
    await page.waitForTimeout(150);
  }
  await page.keyboard.down('w');
  await page.keyboard.down('Shift');
  await waitState(page, "window.__state.dragon.mode === 'ground'", 30_000);
  await page.keyboard.up('Shift');
  await page.keyboard.up('w');
  await page.waitForTimeout(1200);
  let compared = 0;
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(450);
    await page.evaluate(() => window.__play!.freeze(true));
    await page.waitForTimeout(120);
    // 画面の中央の光線（追うカメラの位置と向き）に最初に写る建物：網点の対象（透かす度合い 0.5 以上）と崩れ始めた建物は透けるので飛ばす
    const r = await page.evaluate(() => {
      type Mass = { rect: { x0: number; x1: number; z0: number; z1: number }; y0: number; y1: number };
      const app = window.__app as {
        camera: { position: { x: number; y: number; z: number }; matrixWorld: { elements: number[] } };
        city: { buildings: { id: number; masses: Mass[] }[] };
        cityView: { damage: { data: Float32Array } };
      };
      const e = app.camera.matrixWorld.elements;
      const o = app.camera.position;
      const d = { x: -e[8], y: -e[9], z: -e[10] };
      const data = app.cityView.damage.data;
      let best = -1;
      let bestT = 700;
      for (const b of app.city.buildings) {
        if (data[b.id * 28 + 16] >= 0.5 || data[b.id * 28 + 6] > 0) continue;
        for (const m of b.masses) {
          let t0 = 0;
          let t1 = 700;
          let ok = true;
          for (const [p, v, lo, hi] of [[o.x, d.x, m.rect.x0, m.rect.x1], [o.y, d.y, m.y0, m.y1], [o.z, d.z, m.rect.z0, m.rect.z1]] as [number, number, number, number][]) {
            if (Math.abs(v) < 1e-9) {
              if (p < lo || p > hi) ok = false;
              continue;
            }
            let a = (lo - p) / v;
            let c = (hi - p) / v;
            if (a > c) [a, c] = [c, a];
            t0 = Math.max(t0, a);
            t1 = Math.min(t1, c);
          }
          if (ok && t0 <= t1 && t0 > 0 && t0 < bestT) {
            bestT = t0;
            best = b.id;
          }
        }
      }
      // 地面（遊びの地面の高さ）が先なら、建物は写らない
      const s = window.__state!;
      const gy = s.dragon.y - s.dragon.altitude;
      const tg = d.y < -1e-6 ? (gy - o.y) / d.y : Infinity;
      if (tg < bestT) best = -1;
      return { center: best, aim: s.aim.building };
    });
    await page.evaluate(() => window.__play!.freeze(false));
    expect(r.aim, `向き ${i * 30}°`).toBe(r.center);
    compared++;
    await look(30);
  }
  expect(compared).toBe(12);
  expect(errors).toEqual([]);
});

test('連鎖の数と怒りの帯は右下の隅（下の中央の怪獣の足もとに重ねない）', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?playtest=basic&q=low&speed=4&creature=homuratsuno');
  await waitState(page, "window.__state.phase === 'playing' && window.__state.t > 2");
  const box = await page.getByTestId('combo-rage').boundingBox();
  const vp = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThan(vp.width * 0.6);
  expect(box!.y).toBeGreaterThan(vp.height * 0.75);
  // 下の中央の帯（横の真ん中の3分の1）に掛からない
  expect(box!.x).toBeGreaterThan((vp.width * 2) / 3);
  expect(errors).toEqual([]);
});
