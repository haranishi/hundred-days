import { test, expect } from '@playwright/test';

/* OriCube（Day087）。折りの計算の正しさは day-087-oricube/tests の単体試験が持つ。
   ここでは、実ブラウザで「紙が描かれる・手順を進められる・視点を回せる・スマホの指で操作できる」を確かめる。
   3Dの描画は ?gfx=test（軽い描画）で開く。再生の時間は実時間なので、描画の遅さには左右されない。 */

const base = '/day-087-oricube/';
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function open(page, query = '', { paused = true } = {}) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}?debug=1&gfx=test${paused ? '&paused=1' : ''}${query ? `&${query}` : ''}`);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  return errors;
}
const state = (page) => page.evaluate(() => window.__oricube.state());
const rendered = (page) => expect.poll(async () => (await state(page)).viewer?.renders ?? 0, { timeout: 20_000 }).toBeGreaterThan(0);

test('opens on step 1 of the paper plane with a drawn 3D view and no errors', async ({ page }) => {
  const errors = await open(page);
  await expect(page.locator('#app')).toHaveAttribute('data-webgl', 'true');
  const declared = await page.evaluate(() => window.__oricube.models.map((m) => m.name));
  expect(declared[0]).toBe('紙飛行機');
  expect(declared).toEqual(expect.arrayContaining(['紙飛行機', '白鳥', '立方体の箱']));
  await expect(page.locator('.pick-card')).toHaveCount(declared.length);
  await expect(page.locator('.tab')).toHaveCount(0);
  await expect(page.locator('#pick-name')).toHaveText('紙飛行機');
  await expect(page.locator('#step-no')).toHaveText('手順 1');
  await expect(page.locator('#step-title')).not.toHaveText('読み込み中');
  await expect(page.locator('#view')).toBeVisible();
  await rendered(page);
  expect(errors).toEqual([]);
});

test('steps move by next, previous and the slider, and the text follows', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: /次へ/ }).click();
  await expect(page.locator('#step-no')).toHaveText('手順 2');
  const second = await page.locator('#step-title').innerText();
  await page.getByRole('button', { name: /次へ/ }).click();
  await expect(page.locator('#step-no')).toHaveText('手順 3');
  await page.getByRole('button', { name: /前へ/ }).click();
  await expect(page.locator('#step-title')).toHaveText(second);
  await page.locator('#scrub').fill('5.5');
  await expect(page.locator('#step-no')).toHaveText('手順 6');
  await expect(page.locator('#live')).toContainText('手順6');
  expect((await state(page)).playing).toBe(false);
});

test('the last steps play to the completion card and offer another model', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, 's=8&t=0');
  await page.getByRole('button', { name: '2倍' }).click();
  await page.locator('#play').click();
  await expect(page.locator('#done')).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('#done-title')).toHaveText('紙飛行機の完成');
  await expect(page.locator('#step-no')).toHaveText('手順 9');
  const next = await page.evaluate(() => window.__oricube.models[1].name);
  await expect(page.locator('#other')).toHaveText(`${next}へ`);
  await page.locator('#other').click();
  await expect(page.locator('#pick-name')).toHaveText(next);
  await expect(page.locator('#step-no')).toHaveText('手順 1');
});

test('each model opens on its own first step', async ({ page }) => {
  await open(page);
  const names = await page.locator('.pick-card .pick-card-name').allTextContents();
  expect(names).toEqual(await page.evaluate(() => window.__oricube.models.map((m) => m.name)));
  for (const name of names) {
    await page.locator('#pick-open').click();
    await page.locator('.pick-card', { hasText: name }).click();
    await expect(page.locator('#picker')).toBeHidden();
    await expect(page.locator('#pick-name')).toHaveText(name);
    await expect(page.locator('.pick-card[aria-current="true"] .pick-card-name')).toHaveText(name);
    await expect(page.locator('#step-no')).toHaveText('手順 1');
    await expect(page.locator('#step-text')).not.toBeEmpty();
  }
});

test('view buttons move the camera and the layer spread toggles', async ({ page }) => {
  await open(page, 'm=swan&s=5&t=1');
  await rendered(page);
  await page.getByRole('button', { name: '真上' }).click();
  await expect.poll(async () => (await state(page)).viewer.phi, { timeout: 5_000 }).toBeLessThan(0.05);
  await page.getByRole('button', { name: '斜め' }).click();
  await expect.poll(async () => (await state(page)).viewer.phi, { timeout: 5_000 }).toBeGreaterThan(0.8);
  const spread = page.locator('#explode');
  await expect(spread).toHaveAttribute('aria-pressed', 'false');
  await spread.click();
  await expect(spread).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await state(page)).viewer.explode, { timeout: 5_000 }).toBeGreaterThan(10);
  await spread.click();
  await expect.poll(async () => (await state(page)).viewer.explode, { timeout: 5_000 }).toBeLessThan(2);
});

test('the cube box raises four walls and ends as a one-third-high open cube', async ({ page }) => {
  const errors = await open(page, 'm=tray&s=4&t=0.5');
  await rendered(page);
  expect((await state(page)).model).toBe('tray');
  const box = await page.evaluate(() => {
    const f = window.__oricube.model.frame(4, 1, { explode: 0 });
    const size = f.bounds.max.map((v, i) => v - f.bounds.min[i]);
    return { size, floor: f.bounds.min[1] };
  });
  // 底は1/3四方、壁の高さも1/3（ひれは壁の外側に沿うので、外形はほぼ立方体）
  expect(box.size[1]).toBeGreaterThan(0.33);
  expect(box.size[1]).toBeLessThan(0.34);
  expect(box.size[0]).toBeLessThan(0.36);
  expect(box.size[2]).toBeLessThan(0.36);
  expect(Math.abs(box.floor)).toBeLessThan(0.01);
  expect(errors).toEqual([]);
});

test('keyboard moves steps and toggles playback', async ({ page }) => {
  await open(page);
  await page.locator('body').press('ArrowRight');
  await expect(page.locator('#step-no')).toHaveText('手順 2');
  await page.locator('body').press('ArrowLeft');
  await expect(page.locator('#step-no')).toHaveText('手順 1');
  await page.locator('body').press(' ');
  await expect.poll(async () => (await state(page)).playing).toBe(true);
  await page.locator('body').press(' ');
  await expect.poll(async () => (await state(page)).playing).toBe(false);
});

test('reduced motion does not autoplay and shows each step at its end pose', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, '', { paused: false });
  const s = await state(page);
  expect(s.reduced).toBe(true);
  expect(s.playing).toBe(false);
  expect(s.t).toBe(1);
});

test('without WebGL the steps are still readable as a list', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      return /webgl/i.test(String(type)) ? null : original.call(this, type, ...rest);
    };
  });
  await page.goto(`${base}?gfx=test&paused=1`);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#nogl')).toBeVisible();
  await expect(page.locator('#nogl-why')).not.toBeEmpty();
  expect(await page.locator('#nogl-list li').count()).toBeGreaterThanOrEqual(9);
  await page.getByRole('button', { name: /次へ/ }).click();
  await expect(page.locator('#step-no')).toHaveText('手順 2');
});

test.describe('phone', () => {
  test.use(phone);

  async function metrics(page) {
    return page.evaluate(() => {
      const overflow = document.documentElement.scrollWidth - window.innerWidth;
      const small = [...document.querySelectorAll('#app button, #app input[type="range"]')]
        .filter((el) => el.offsetParent !== null)
        .map((el) => ({ id: el.id || el.className || el.textContent.trim(), ...(({ width, height }) => ({ width, height }))(el.getBoundingClientRect()) }))
        .filter((r) => r.height < 43.5 || r.width < 43.5);
      return { overflow, small };
    });
  }

  test('portrait and landscape fit without sideways scroll and keep 44px controls', async ({ page }) => {
    await open(page);
    await rendered(page);
    for (const size of [{ width: 390, height: 844 }, { width: 360, height: 740 }, { width: 844, height: 390 }, { width: 667, height: 375 }]) {
      await page.setViewportSize(size);
      await page.waitForTimeout(250);
      const m = await metrics(page);
      expect(m.overflow, `${size.width}x${size.height} sideways overflow`).toBeLessThanOrEqual(0);
      expect(m.small, `${size.width}x${size.height} controls under 44px`).toEqual([]);
    }
  });

  test('one finger turns the view and two fingers zoom it', async ({ page, context }) => {
    await open(page, 'm=plane&s=9&t=1');
    await rendered(page);
    const box = await page.locator('#view').boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 3;
    const cdp = await context.newCDPSession(page);
    const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });

    const before = (await state(page)).viewer;
    await touch('touchStart', [{ x: cx, y: cy, id: 1 }]);
    for (let i = 1; i <= 8; i++) await touch('touchMove', [{ x: cx + i * 14, y: cy, id: 1 }]);
    await touch('touchEnd', [{ x: cx + 8 * 14, y: cy, id: 1 }]);
    await expect.poll(async () => Math.abs((await state(page)).viewer.theta - before.theta), { timeout: 5_000 }).toBeGreaterThan(0.15);

    const zoomFrom = (await state(page)).viewer.distance;
    const pair = (spread) => [{ x: cx - spread, y: cy, id: 1 }, { x: cx + spread, y: cy, id: 2 }];
    await touch('touchStart', pair(30));
    for (let i = 1; i <= 8; i++) await touch('touchMove', pair(30 + i * 14));
    await touch('touchEnd', pair(30 + 8 * 14));
    await expect.poll(async () => (await state(page)).viewer.distance, { timeout: 5_000 }).toBeLessThan(zoomFrom * 0.9);
  });

  test('a button tapped with a second finger still works while the first finger drags the view', async ({ page, context }) => {
    await open(page, 'm=plane&s=2&t=0');
    await rendered(page);
    const view = await page.locator('#view').boundingBox();
    const play = await page.locator('#play').boundingBox();
    const cdp = await context.newCDPSession(page);
    const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
    const first = { x: view.x + view.width / 2, y: view.y + view.height / 2, id: 1 };
    const second = { x: play.x + play.width / 2, y: play.y + play.height / 2, id: 2 };

    expect((await state(page)).playing).toBe(false);
    await touch('touchStart', [first]);
    await touch('touchMove', [{ ...first, x: first.x + 20 }]);
    await touch('touchStart', [{ ...first, x: first.x + 20 }, second]);
    await touch('touchEnd', [second]);
    await touch('touchEnd', [{ ...first, x: first.x + 20 }]);
    await expect.poll(async () => (await state(page)).playing, { timeout: 5_000 }).toBe(true);
  });

  test('tapping play and pause with a finger works and an idle view stops drawing', async ({ page }) => {
    await open(page, 'm=swan&s=2&t=0');
    await rendered(page);
    await page.locator('#play').tap();
    await expect.poll(async () => (await state(page)).playing).toBe(true);
    await page.locator('#play').tap();
    await expect.poll(async () => (await state(page)).playing).toBe(false);
    // 止めたあとも、カメラの寄せや慣性が落ち着くまでは描く。落ち着いたら描き直さない。
    await expect.poll(async () => (await state(page)).viewer.running, { timeout: 10_000 }).toBe(false);
    const a = (await state(page)).viewer.renders;
    await page.waitForTimeout(700);
    expect((await state(page)).viewer.renders).toBe(a);
  });
});

// ---- 完成の見せ方（UI担当が追加） ----
test('on completion the camera refits to the final pose of the box', async ({ page }) => {
  await open(page, 'm=tray&s=5&t=0');
  await rendered(page);
  const before = (await state(page)).viewer.fitDistance;
  await page.evaluate(() => window.__oricube.setProgress(4, 1));
  await expect.poll(async () => (await state(page)).finished).toBe(true);
  const after = (await state(page)).viewer.fitDistance;
  expect(after).toBeLessThan(before * 0.95);
  await expect.poll(async () => (await state(page)).viewer.distance, { timeout: 8_000 }).toBeLessThan(before * 0.95);
});

test('on completion the model turns slowly once and then stops redrawing', async ({ page }) => {
  await open(page, 'm=swan&s=6&t=0.99');
  await rendered(page);
  await page.evaluate(() => window.__oricube.setProgress(5, 1));
  const start = (await state(page)).viewer.theta;
  await expect.poll(async () => Math.abs((await state(page)).viewer.theta - start), { timeout: 5_000 }).toBeGreaterThan(0.3);
  await expect.poll(async () => (await state(page)).viewer.running, { timeout: 10_000, intervals: [500] }).toBe(false);
  const a = await state(page);
  expect(a.viewer.spinning).toBe(false);
  await page.waitForTimeout(700);
  expect((await state(page)).viewer.renders).toBe(a.viewer.renders);
});

test('touching the view stops the completion turn', async ({ page }) => {
  await open(page, 'm=plane&s=9&t=1');
  await rendered(page);
  await expect.poll(async () => (await state(page)).viewer.spinning).toBe(true);
  await page.getByRole('button', { name: '真上' }).click();
  expect((await state(page)).viewer.spinning).toBe(false);
});

test('reduced motion does not turn the finished model', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, 'm=plane&s=9&t=1');
  await rendered(page);
  const a = (await state(page)).viewer;
  await page.waitForTimeout(1_500);
  const b = (await state(page)).viewer;
  expect(b.spinning).toBe(false);
  expect(Math.abs(b.theta - a.theta)).toBeLessThan(1e-6);
});

test('spreading the layers from straight above tilts the view so the gaps show', async ({ page }) => {
  await open(page, 'm=plane&s=5&t=0&view=top');
  await rendered(page);
  expect((await state(page)).viewer.phi).toBeLessThan(0.05);
  await page.locator('#explode').click();
  await expect.poll(async () => (await state(page)).viewer.phi, { timeout: 5_000 }).toBeGreaterThan(0.85);
  await expect.poll(async () => (await state(page)).viewer.running, { timeout: 10_000 }).toBe(false);
  const tilted = (await state(page)).viewer.phi;
  await page.locator('#explode').click();
  await page.waitForTimeout(600);
  expect(Math.abs((await state(page)).viewer.phi - tilted)).toBeLessThan(0.02);
});

// ---- 第1回の評価を受けた直し（UI担当が追加） ----
test('the completion shows a single filled button, the next model', async ({ page }) => {
  await open(page, 'm=plane&s=9&t=1');
  await expect(page.locator('#done')).toBeVisible();
  await expect(page.locator('#again')).toHaveCount(0);
  const filled = await page.locator('.btn.primary:visible, .btn.play:not(.is-done):visible').count();
  expect(filled).toBe(1);
  await expect(page.locator('#play')).toHaveClass(/is-done/);
  await expect(page.locator('#other')).toBeVisible();
});

test('the completion turn makes exactly one lap and ends at the starting angle', async ({ page }) => {
  await open(page, 'm=swan&s=6&t=0.99');
  await rendered(page);
  await expect.poll(async () => (await state(page)).viewer.running, { timeout: 10_000 }).toBe(false);
  const before = (await state(page)).viewer;
  await page.evaluate(() => window.__oricube.setProgress(5, 1));
  await expect.poll(async () => Math.abs((await state(page)).viewer.theta - before.theta), { timeout: 5_000 }).toBeGreaterThan(0.3);
  await expect.poll(async () => (await state(page)).viewer.spinning, { timeout: 12_000, intervals: [400] }).toBe(false);
  const after = (await state(page)).viewer;
  const lap = Math.PI * 2;
  const dTheta = Math.abs((((after.theta - before.theta) % lap) + lap + Math.PI) % lap - Math.PI);
  expect(dTheta).toBeLessThan(1e-3);
  expect(Math.abs(after.phi - before.phi)).toBeLessThan(1e-3);
});

test('without WebGL the play and speed controls hide and the list follows the steps', async ({ page }) => {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return /webgl/i.test(type) ? null : orig.call(this, type, ...rest); };
  });
  await page.goto(`${base}?debug=1`);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#play')).toBeHidden();
  await expect(page.locator('#speed')).toBeHidden();
  expect((await state(page)).playing).toBe(false);
  await expect(page.locator('#nogl-list li').nth(0)).toHaveAttribute('aria-current', 'step');
  await page.getByRole('button', { name: /次へ/ }).click();
  await expect(page.locator('#nogl-list li').nth(1)).toHaveAttribute('aria-current', 'step');
});

test('pressing a step in the step list moves to the start of that step', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page);
  const link = page.locator('.step-link[data-i="4"]');
  await expect(link).toBeVisible();
  await link.click();
  const s = await state(page);
  expect([s.step, s.t]).toEqual([4, 0]);
  await expect(link).toHaveAttribute('aria-current', 'step');
  await expect(page.locator('#step-no')).toHaveText('手順 5');
});

test('stop at each step pauses at the end of every step and play moves on', async ({ page }) => {
  test.setTimeout(60_000);
  await open(page, 'm=swan&s=1&t=0');
  const toggle = page.locator('#step-stop');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '2倍' }).click();
  await page.locator('#play').click();
  await expect.poll(async () => { const s = await state(page); return [s.step, s.t, s.playing]; }, { timeout: 20_000 }).toEqual([0, 1, false]);
  await page.locator('#play').click();
  const s = await state(page);
  expect([s.step, s.playing]).toEqual([1, true]);
});

test('the legend shows only the line kinds the step uses', async ({ page }) => {
  await open(page, 'm=plane&s=9&t=0');
  await expect(page.locator('#legend')).toBeHidden();
  await open(page, 'm=swan&s=4&t=0');
  await expect(page.locator('#legend li[data-kind="reverse"]')).toBeVisible();
  await expect(page.locator('#legend')).toContainText('中割り折り');
  await open(page, 'm=plane&s=4&t=0');
  await expect(page.locator('#legend li[data-kind="mountain"]')).toBeVisible();
  await expect(page.locator('#legend li[data-kind="valley"]')).toHaveCount(0);
});

test.describe('phone framing', () => {
  test.use(phone);
  test('the paper fills about two thirds of the view on a phone', async ({ page }) => {
    await open(page, 'm=plane&s=1&t=0');
    await rendered(page);
    await expect.poll(async () => (await state(page)).viewer.running, { timeout: 10_000 }).toBe(false);
    const c = (await state(page)).viewer.coverage;
    const fill = Math.max(c.w, c.h);
    expect(fill).toBeGreaterThanOrEqual(0.6);
    expect(fill).toBeLessThanOrEqual(0.72);
  });
});

// ---- 作品の一覧（第2弾。UI担当が追加） ----
test.describe('model picker', () => {
  test('opens as a modal dialog on the current model, keeps playing, and Esc returns focus', async ({ page }) => {
    await open(page, 'm=swan&s=2&t=0');
    await page.locator('#play').click();
    const opener = page.locator('#pick-open');
    await opener.click();
    const dialog = page.getByRole('dialog', { name: '作品を選ぶ' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(page.locator('.pick-card[aria-current="true"]')).toHaveAttribute('data-id', 'swan');
    await expect(page.locator('.pick-card[aria-current="true"]')).toBeFocused();
    // The model behind keeps moving while the list is open
    const t0 = (await state(page)).t;
    await expect.poll(async () => (await state(page)).t, { timeout: 5_000 }).toBeGreaterThan(t0);
    expect((await state(page)).playing).toBe(true);
    // Arrow keys belong to the list, not to the steps behind it
    await page.keyboard.press('ArrowRight');
    expect((await state(page)).step).toBe(1);
    // Tab stays inside the dialog
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.getElementById('picker').contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    expect((await state(page)).model).toBe('swan');
  });

  test('the close button and a tap outside both close it', async ({ page }) => {
    await open(page);
    await page.locator('#pick-open').click();
    await page.getByRole('button', { name: '閉じる' }).click();
    await expect(page.locator('#picker')).toBeHidden();
    await expect(page.locator('#pick-open')).toBeFocused();
    await page.locator('#pick-open').click();
    await expect(page.locator('#picker')).toBeVisible();
    await page.mouse.click(4, 400);
    await expect(page.locator('#picker')).toBeHidden();
  });

  test('choosing a model starts it from the first step and plays', async ({ page }) => {
    await open(page, 'm=plane&s=6&t=0.5');
    await page.locator('#pick-open').click();
    await page.locator('.pick-card[data-id="tray"]').click();
    await expect(page.locator('#picker')).toBeHidden();
    const s = await state(page);
    expect([s.model, s.step, s.playing]).toEqual(['tray', 0, true]);
    await expect(page.locator('#pick-name')).toHaveText('立方体の箱');
    // Focus goes to play, so Space plays instead of opening the list again
    await expect(page.locator('#play')).toBeFocused();
  });

  test('with reduced motion a chosen model shows the end of its first step without playing', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await page.locator('#pick-open').click();
    await page.locator('.pick-card[data-id="swan"]').click();
    const s = await state(page);
    expect([s.model, s.step, s.t, s.playing]).toEqual(['swan', 0, 1, false]);
  });

  test('every card shows a picture, a name, the difficulty and the time, in list order', async ({ page }) => {
    await open(page);
    const models = await page.evaluate(() => window.__oricube.models.map((m) => ({ id: m.id, name: m.name, level: m.level, minutes: m.minutes })));
    await page.locator('#pick-open').click();
    const cards = page.locator('.pick-card');
    await expect(cards).toHaveCount(models.length);
    for (const [i, m] of models.entries()) {
      const card = cards.nth(i);
      await expect(card).toHaveAttribute('data-id', m.id);
      await expect(card.locator('.pick-card-name')).toHaveText(m.name);
      await expect(card.locator('.pick-stars')).toHaveText('★'.repeat(m.level));
      await expect(card).toContainText(`約${m.minutes}分`);
      await expect.poll(() => card.locator('img').evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
    }
  });

  test('the completion card goes to the next model in the list and wraps to the first', async ({ page }) => {
    await open(page);
    const ids = await page.evaluate(() => window.__oricube.models.map((m) => m.id));
    const last = ids.at(-1);
    await page.goto(`${base}?debug=1&gfx=test&m=${last}&s=99&t=1`);
    await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('#done')).toBeVisible();
    await expect(page.locator('#other')).toHaveText(`${await page.evaluate(() => window.__oricube.models[0].name)}へ`);
    await page.locator('#done-pick').click();
    await expect(page.locator('#picker')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#done-pick')).toBeFocused();
    await page.locator('#other').click();
    expect((await state(page)).model).toBe(ids[0]);
  });
});

test.describe('model picker on a phone', () => {
  test.use(phone);

  test('a finger tap chooses a model from the bottom sheet', async ({ page, context }) => {
    await open(page, 'm=plane&s=4&t=0');
    await page.locator('#pick-open').tap();
    const sheet = page.locator('#picker');
    await expect(sheet).toBeVisible();
    // Measure after the slide-in has settled
    await expect.poll(() => sheet.evaluate((el) => el.getAnimations().length)).toBe(0);
    const box = await sheet.boundingBox();
    // A sheet from the bottom, about three quarters of the screen
    expect(box.y + box.height).toBeGreaterThan(843);
    expect(box.height / 844).toBeGreaterThan(0.6);
    expect(box.height / 844).toBeLessThan(0.85);
    const card = await page.locator('.pick-card[data-id="swan"]').boundingBox();
    const cdp = await context.newCDPSession(page);
    const p = { x: card.x + card.width / 2, y: card.y + card.height / 2, id: 1 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(sheet).toBeHidden();
    const s = await state(page);
    expect([s.model, s.step]).toEqual(['swan', 0]);
  });

  test('ten cards fit 390px without sideways scroll and every control is at least 44px', async ({ page }) => {
    await open(page);
    // Stand-in for the full set: copy the cards up to ten (test only)
    await page.evaluate(() => {
      const list = document.getElementById('picker-list');
      const items = [...list.children];
      for (let k = 0; list.children.length < 10; k++) list.append(items[k % items.length].cloneNode(true));
    });
    for (const size of [{ width: 390, height: 844 }, { width: 360, height: 740 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size);
      await page.locator('#pick-open').tap();
      await expect(page.locator('#picker')).toBeVisible();
      const m = await page.evaluate(() => {
        const dialog = document.getElementById('picker');
        const list = document.getElementById('picker-list');
        const controls = [...dialog.querySelectorAll('button')].map((el) => el.getBoundingClientRect());
        const lr = list.getBoundingClientRect();
        return {
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          listOverflowX: list.scrollWidth - list.clientWidth,
          dialogRight: dialog.getBoundingClientRect().right - window.innerWidth,
          small: controls.filter((r) => r.width < 44 || r.height < 44).length,
          seen: [...list.querySelectorAll('.pick-card')].filter((c) => c.getBoundingClientRect().top < lr.bottom - 40).length,
        };
      });
      const tag = `${size.width}x${size.height}`;
      expect(m.overflow, tag).toBeLessThanOrEqual(0);
      expect(m.listOverflowX, tag).toBeLessThanOrEqual(0);
      expect(m.dialogRight, tag).toBeLessThanOrEqual(0.5);
      expect(m.small, tag).toBe(0);
      // Most of the ten are in view without scrolling
      expect(m.seen, tag).toBeGreaterThanOrEqual(9);
      await page.keyboard.press('Escape');
      await expect(page.locator('#picker')).toBeHidden();
    }
  });
});

test.describe('every model', () => {
  test('reaches its completion card at the last step without errors', async ({ page }) => {
    const errors = await open(page);
    const models = await page.evaluate(() => window.__oricube.models.map((m) => ({ id: m.id, name: m.name, steps: m.steps.length })));
    expect(models.length).toBeGreaterThanOrEqual(9);
    for (const m of models) {
      await page.goto(`${base}?debug=1&gfx=test&paused=1&m=${m.id}&s=99&t=1`);
      await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
      await expect(page.locator('#pick-name')).toHaveText(m.name);
      await expect(page.locator('#step-no')).toHaveText(`手順 ${m.steps}`);
      await expect(page.locator('#done')).toBeVisible();
      await rendered(page);
    }
    expect(errors).toEqual([]);
  });

  test('a heavy model says it is being prepared, then opens', async ({ page }) => {
    const errors = await open(page);
    await page.evaluate(() => {
      window.__loadingSeen = [];
      const el = document.getElementById('loading');
      new MutationObserver(() => { if (!el.hidden) window.__loadingSeen.push(el.textContent); })
        .observe(el, { attributes: true, childList: true, characterData: true, subtree: true });
    });
    await page.locator('#pick-open').click();
    await page.locator('.pick-card[data-id="crane"]').click();
    await expect.poll(async () => (await state(page)).model, { timeout: 60_000 }).toBe('crane');
    await expect(page.locator('#loading')).toBeHidden();
    expect(await page.evaluate(() => window.__loadingSeen)).toContain('鶴を準備しています…');
    await expect(page.locator('#pick-name')).toHaveText('鶴');
    await expect(page.locator('#step-no')).toHaveText('手順 1');
    expect(errors).toEqual([]);
  });
});

// ---- 第2弾の画面評価（1周目）を受けた直し（UI担当が追加） ----
const VIEW_PHI = { flat: 0.5, iso: 0.93, side: Math.PI / 2 - 0.1, top: 0.0001 };
const phiNear = (page, name) => expect.poll(async () => Math.abs((await state(page)).viewer.phi - VIEW_PHI[name]), { timeout: 15_000 }).toBeLessThan(0.03);
const settled = (page) => expect.poll(async () => (await state(page)).viewer.viewMoving, { timeout: 15_000 }).toBe(false);

test.describe('the view each step recommends', () => {
  test.setTimeout(120_000);

  test('the crane opened on its last step is seen from the side', async ({ page }) => {
    await open(page, 'm=crane&s=10&t=1');
    await rendered(page);
    await phiNear(page, 'side');
    expect((await state(page)).viewer.userMoved).toBe(false);
  });

  test('stepping through the crane moves the camera flat, then iso, then flat', async ({ page }) => {
    await open(page, 'm=crane&s=1');
    await rendered(page);
    await phiNear(page, 'flat');
    const next = page.locator('#next');
    await next.click(); await next.click();
    await expect(page.locator('#step-no')).toHaveText('手順 3');
    await phiNear(page, 'iso');
    await next.click(); await next.click();
    await expect(page.locator('#step-no')).toHaveText('手順 5');
    await phiNear(page, 'flat');
  });

  test('after the person drags the view, steps no longer move it', async ({ page }) => {
    await open(page, 'm=crane&s=1');
    await rendered(page);
    await settled(page);
    const box = await page.locator('#view').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(box.x + box.width / 2 + i * 12, box.y + box.height / 2 + i * 8);
    await page.mouse.up();
    await expect.poll(async () => (await state(page)).viewer.running, { timeout: 15_000 }).toBe(false);
    const before = (await state(page)).viewer;
    expect(before.userMoved).toBe(true);
    await page.locator('#next').click(); await page.locator('#next').click();
    await expect(page.locator('#step-no')).toHaveText('手順 3');
    await page.waitForTimeout(800);
    const after = (await state(page)).viewer;
    // Only the fitting may nudge it a little; it is not sent to the step's view (iso)
    expect(Math.abs(after.phi - before.phi)).toBeLessThan(0.02);
    expect(Math.abs(after.theta - before.theta)).toBeLessThan(0.02);
    expect(Math.abs(after.phi - VIEW_PHI.iso)).toBeGreaterThan(0.05);
  });

  test('a view= link holds for every step', async ({ page }) => {
    await open(page, 'm=crane&s=1&view=top');
    await rendered(page);
    await phiNear(page, 'top');
    for (let i = 0; i < 4; i++) await page.locator('#next').click();
    await expect(page.locator('#step-no')).toHaveText('手順 5');
    await page.waitForTimeout(800);
    expect((await state(page)).viewer.phi).toBeLessThan(0.03);
  });

  test('the top button holds, and reset returns to the current step’s view and resumes following', async ({ page }) => {
    await open(page, 'm=crane&s=3');
    await rendered(page);
    await phiNear(page, 'iso');
    await page.getByRole('button', { name: '真上' }).click();
    await phiNear(page, 'top');
    await page.locator('#next').click(); await page.locator('#next').click();
    await expect(page.locator('#step-no')).toHaveText('手順 5');
    await page.waitForTimeout(800);
    expect((await state(page)).viewer.phi).toBeLessThan(0.03);
    await page.getByRole('button', { name: '視点を元に戻す' }).click();
    await phiNear(page, 'flat'); // step 5 recommends flat, not the first step's view
    expect((await state(page)).viewer.userMoved).toBe(false);
    await page.locator('#prev').click(); await page.locator('#prev').click();
    await expect(page.locator('#step-no')).toHaveText('手順 3');
    await phiNear(page, 'iso');
  });
});

test.describe('keys and focus', () => {
  test('after choosing from the list, focus is on play and Space plays', async ({ page }) => {
    await open(page);
    await page.locator('#pick-open').click();
    await page.locator('.pick-card[data-id="heart"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#picker')).toBeHidden();
    await expect(page.locator('#play')).toBeFocused();
    const before = (await state(page)).playing;
    await page.keyboard.press(' ');
    await expect.poll(async () => (await state(page)).playing).toBe(!before);
    await expect(page.locator('#picker')).toBeHidden();
  });

  test('Space on a focused button presses only that button, once', async ({ page }) => {
    await open(page, 'm=swan&s=2&t=0');
    await page.locator('#next').click();
    await expect(page.locator('#step-no')).toHaveText('手順 3');
    await expect(page.locator('#next')).toBeFocused();
    await page.keyboard.press(' ');
    await expect(page.locator('#step-no')).toHaveText('手順 4');
    await page.keyboard.press('Enter');
    await expect(page.locator('#step-no')).toHaveText('手順 5');
    await page.waitForTimeout(300);
    const s = await state(page);
    expect([s.step, s.playing]).toEqual([4, false]);
  });

  test('when next reaches the end and turns off, focus moves to play instead of the page', async ({ page }) => {
    await open(page, 'm=swan&s=6&t=0');
    await page.locator('#next').click();
    await expect(page.locator('#done')).toBeVisible();
    await expect(page.locator('#play')).toBeFocused();
  });

  test('arrow keys, Home and End move between the cards', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, 'm=swan');
    await page.locator('#pick-open').click();
    const ids = await page.evaluate(() => window.__oricube.models.map((m) => m.id));
    const cols = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.pick-card')];
      const top = cards[0].getBoundingClientRect().top;
      return cards.filter((c) => Math.abs(c.getBoundingClientRect().top - top) < 2).length;
    });
    expect(cols).toBeGreaterThan(1);
    const focusedId = () => page.evaluate(() => document.activeElement?.dataset?.id);
    const at = ids.indexOf('swan');
    expect(await focusedId()).toBe('swan');
    await page.keyboard.press('ArrowRight');
    expect(await focusedId()).toBe(ids[at + 1]);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowUp');
    expect(await focusedId()).toBe(ids[at - cols]);
    await page.keyboard.press('ArrowDown');
    expect(await focusedId()).toBe('swan');
    await page.keyboard.press('Home');
    expect(await focusedId()).toBe(ids[0]);
    await page.keyboard.press('ArrowLeft');
    expect(await focusedId()).toBe(ids[0]);
    await page.keyboard.press('End');
    expect(await focusedId()).toBe(ids.at(-1));
    expect((await state(page)).model).toBe('swan');
    await page.keyboard.press('Escape');
    await expect(page.locator('#pick-open')).toBeFocused();
  });
});

test.describe('switching models', () => {
  test('the spread is turned off for the new model', async ({ page }) => {
    await open(page, 'm=plane&s=5&t=0');
    await page.locator('#explode').click();
    await expect(page.locator('#explode')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#pick-open').click();
    await page.locator('.pick-card[data-id="heart"]').click();
    await expect(page.locator('#explode')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#explode')).toHaveText('重なりを広げる');
    const s = await state(page);
    expect([s.model, s.exploded]).toEqual(['heart', false]);
    expect(s.viewer.explode).toBeLessThan(1.01);
  });

  test('the address shows the new model and drops the old position', async ({ page }) => {
    await open(page, 'm=plane&s=6&t=0.5&explode=1&view=top');
    await page.locator('#pick-open').click();
    await page.locator('.pick-card[data-id="tray"]').click();
    await expect.poll(() => page.evaluate(() => new URLSearchParams(location.search).get('m'))).toBe('tray');
    const q = await page.evaluate(() => Object.fromEntries(new URLSearchParams(location.search)));
    expect(q).toEqual({ debug: '1', gfx: 'test', view: 'top', m: 'tray' });
    // A new model follows its own views again
    expect((await state(page)).viewer.userMoved).toBe(false);
  });
});

test.describe('the completion card on a phone on its side', () => {
  test.use(phone);
  for (const size of [{ width: 844, height: 390 }, { width: 667, height: 375 }]) {
    test(`does not cover the paper at ${size.width}x${size.height}`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize(size);
      await open(page, 'm=plane&s=9&t=1');
      await rendered(page);
      await expect(page.locator('#done')).toBeVisible();
      await expect.poll(async () => (await state(page)).viewer.running, { timeout: 15_000 }).toBe(false);
      const r = await page.evaluate(() => {
        const c = window.__oricube.state().viewer.paperRect;
        const canvas = document.getElementById('view').getBoundingClientRect();
        const card = document.querySelector('.done-card').getBoundingClientRect();
        const paper = { top: canvas.top + c.top * canvas.height, bottom: canvas.top + c.bottom * canvas.height, left: canvas.left + c.left * canvas.width, right: canvas.left + c.right * canvas.width };
        const overlap = paper.left < card.right && card.left < paper.right && paper.top < card.bottom && card.top < paper.bottom;
        return { overlap, paper, card: { top: card.top, bottom: card.bottom, left: card.left, right: card.right }, place: document.getElementById('app').dataset.donePlace, small: [...document.querySelectorAll('.done-card button')].filter((b) => { const x = b.getBoundingClientRect(); return x.width < 44 || x.height < 44; }).length };
      });
      expect(r.overlap, JSON.stringify(r)).toBe(false);
      expect(r.small).toBe(0);
    });
  }
});

test.describe('details on a phone', () => {
  test.use(phone);
  test('the header says what the app is, without growing, and stop-at-each-step is on the first screen', async ({ page }) => {
    for (const width of [360, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await open(page, 'm=swan&s=2');
      const r = await page.evaluate(() => {
        const box = (sel) => document.querySelector(sel).getBoundingClientRect();
        return { header: box('.top').height, sub: box('.brand-sub'), pick: box('#pick-open'), stop: box('#step-stop'), inner: innerHeight };
      });
      expect(r.sub.height, `${width}`).toBeGreaterThan(0);
      expect(r.sub.right, `${width}`).toBeLessThan(r.pick.left);
      expect(r.header, `${width}`).toBeLessThanOrEqual(65 + 14);
      expect(r.pick.height, `${width}`).toBeGreaterThanOrEqual(44);
      expect(r.stop.bottom, `${width}`).toBeLessThanOrEqual(r.inner);
    }
    await expect(page.locator('.brand-sub')).toHaveText('折り紙の折り方を3Dで見る');
  });

  test('the current card says 選択中 in words, and only that card', async ({ page }) => {
    await open(page, 'm=tie');
    await page.locator('#pick-open').tap();
    await expect(page.locator('.pick-badge:visible')).toHaveCount(1);
    await expect(page.locator('.pick-card[data-id="tie"] .pick-badge')).toBeVisible();
    await expect(page.locator('.pick-card[data-id="tie"] .pick-badge')).toHaveText('選択中');
  });

  test('the paper swatches are round and sit on their own line under the paper', async ({ page }) => {
    await open(page, 'm=crane&s=2');
    const r = await page.evaluate(() => {
      const label = document.querySelector('#paper-info > span').getBoundingClientRect();
      const dots = [...document.querySelectorAll('.swatch i')].map((i) => ({ top: i.getBoundingClientRect().top, radius: getComputedStyle(i).borderRadius, w: i.getBoundingClientRect().width }));
      return { labelBottom: label.bottom, dots };
    });
    expect(r.dots).toHaveLength(2);
    for (const d of r.dots) { expect(d.top).toBeGreaterThanOrEqual(r.labelBottom - 1); expect(d.radius).toBe('50%'); expect(d.w).toBe(14); }
  });
});
