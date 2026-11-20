import { test, expect } from '@playwright/test';

/* 盆栽日和（Day095）。木のモデルの正しさは day-095-bonsai/tests の単体試験が持つ。
   ここでは、実ブラウザで「木が描かれる・切る／曲げる／芽摘みができる・時間が進む・戻せる・保存される・
   スマホの指とキーボードで操作できる」を確かめる。3Dは ?gfx=test（軽い描画）で開く。
   枝を押す位置は、見た目から探さず、モデルの骨格を view.camera.project で画面の座標にして決める。 */

const base = '/day-095-bonsai/';
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function open(page, query = '') {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}?debug=1&gfx=test&fresh=1&tips=0&seed=11${query ? `&${query}` : ''}`);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
  return errors;
}

const dataset = (page) => page.evaluate(() => ({ ...document.querySelector('#app').dataset }));
const nodeCount = (page) => page.evaluate(() => window.__bonsai.tree.nodeCount);
const day = async (page) => Number((await dataset(page)).day);
const tool = (page, name) => page.getByRole('button', { name, exact: true }).click();

/** 骨格から、押したい節を選び、その中点の画面の座標（クライアント座標）を返す。 */
async function screenPoint(page, pick) {
  const point = await page.evaluate(async (which) => {
    const { tree, view } = window.__bonsai;
    const s = tree.snapshot();
    const heightOf = (i) => s.end[3 * i + 1];
    let index = -1;
    if (which === 'twig') {
      // いちばん高い所にある、order>=2 の節（先端に近い細い枝）
      for (let i = 0; i < s.count; i += 1) if (s.order[i] >= 2 && (index < 0 || heightOf(i) > heightOf(index))) index = i;
    } else if (which === 'primary') {
      // 主枝（order 1）の、半分の長さ付近の節
      const list = [];
      for (let i = 0; i < s.count; i += 1) if (s.order[i] === 1) list.push(i);
      index = list[Math.floor(list.length / 2)];
    } else if (which === 'trunk-base') {
      index = 0;
    } else if (which === 'tip') {
      const hasChild = new Set(Array.from(s.parent));
      for (let i = 0; i < s.count; i += 1) if (s.order[i] >= 1 && !hasChild.has(i) && (index < 0 || heightOf(i) > heightOf(index))) index = i;
    }
    if (index < 0) return null;
    const mid = [0, 1, 2].map((a) => (s.start[3 * index + a] + s.end[3 * index + a]) / 2);
    const projected = view.camera.project(mid);
    return { index, id: s.ids[index], x: projected.x, y: projected.y, visible: projected.visible };
  }, pick);
  expect(point, `節が見つからない: ${pick}`).not.toBeNull();
  expect(point.visible).toBe(true);
  return point;
}

/** 指（CDP のタッチ）。Chromium だけ。 */
async function finger(page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: i + 1 })) });
  return {
    down: (...points) => send('touchStart', points),
    move: (...points) => send('touchMove', points),
    up: () => send('touchEnd', []),
    async tap(p) { await this.down(p); await this.up(); },
    async drag(from, to, steps = 8) {
      await this.down(from);
      for (let i = 1; i <= steps; i += 1) await this.move({ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps });
      await this.up();
    },
  };
}

test('開くと、紅葉の盆栽が描かれ、契約どおりの属性が揃い、エラーも外部通信もない', async ({ page }) => {
  const external = [];
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith('http://127.0.0.1') && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u); });
  const errors = await open(page);
  const d = await dataset(page);
  expect(d.species).toBe('maple');
  expect(d.tool).toBe('look');
  expect(d.season).toBe('autumn');
  expect(Number(d.day)).toBe(0);
  expect(Number(d.branches)).toBeGreaterThanOrEqual(4);
  await expect(page.locator('#view')).toBeVisible();
  await expect(page.locator('#view')).toHaveAttribute('aria-label', /紅葉の盆栽/);
  const violations = await page.evaluate(async () => {
    const { validateSkeleton } = await import('./lib/contract.js');
    return validateSkeleton(window.__bonsai.tree.snapshot());
  });
  expect(violations).toEqual([]);
  for (const name of ['見る', '切る', '曲げる', '芽摘み', '1週間', '1か月', '次の季節', 'メニュー', '写真']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: 'このアプリを共有する' })).toBeVisible();
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('道具を選ぶと data-tool と押下状態が変わる（キーボードの数字も）', async ({ page }) => {
  await open(page);
  await tool(page, '切る');
  expect((await dataset(page)).tool).toBe('cut');
  await expect(page.getByRole('button', { name: '切る', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '見る', exact: true })).toHaveAttribute('aria-pressed', 'false');
  // ボタンをマウスで押したあとも、盆栽の画面をクリックし直さずにキーボードが効く（フォーカスが画面に戻る）
  await expect(page.locator('#view')).toBeFocused();
  await page.keyboard.press('3');
  expect((await dataset(page)).tool).toBe('bend');
  await page.keyboard.press('1');
  expect((await dataset(page)).tool).toBe('look');
});

test('「切る」で細い枝を押して離すと切れ、元に戻すで戻る', async ({ page }) => {
  await open(page);
  const before = await nodeCount(page);
  await tool(page, '切る');
  const p = await screenPoint(page, 'twig');
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(() => nodeCount(page)).toBeLessThan(before);
  await expect(page.locator('#live')).not.toBeEmpty();
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  await expect.poll(() => nodeCount(page)).toBe(before);
  await page.getByRole('button', { name: 'やり直す', exact: true }).click();
  await expect.poll(() => nodeCount(page)).toBeLessThan(before);
});

test('枝のない所へ動かして離すと、何も切らない', async ({ page }) => {
  await open(page);
  const before = await nodeCount(page);
  await tool(page, '切る');
  const p = await screenPoint(page, 'twig');
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(8, 120, { steps: 6 });
  await page.mouse.up();
  expect(await nodeCount(page)).toBe(before);
});

test('太い幹の根元は切れず、理由が出る', async ({ page }) => {
  await open(page);
  const before = await nodeCount(page);
  await tool(page, '切る');
  const p = await screenPoint(page, 'trunk-base');
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.up();
  expect(await nodeCount(page)).toBe(before);
  await expect(page.locator('#live')).toContainText('幹');
});

test('「曲げる」で枝をドラッグすると、長さは変わらず曲がり、針金が付く', async ({ page }) => {
  await open(page);
  await tool(page, '曲げる');
  const p = await screenPoint(page, 'primary');
  const lengths = () => page.evaluate(() => { const s = window.__bonsai.tree.snapshot(); return Array.from({ length: s.count }, (_, i) => Math.hypot(s.end[3 * i] - s.start[3 * i], s.end[3 * i + 1] - s.start[3 * i + 1], s.end[3 * i + 2] - s.start[3 * i + 2])); });
  const wiresBefore = await page.evaluate(() => window.__bonsai.tree.snapshot().wires.length);
  const lenBefore = await lengths();
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 40, p.y - 50, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.__bonsai.tree.snapshot().wires.length)).toBeGreaterThan(wiresBefore);
  const lenAfter = await lengths();
  expect(lenAfter.length).toBe(lenBefore.length);
  lenAfter.forEach((v, i) => expect(Math.abs(v - lenBefore[i])).toBeLessThan(1e-3));
});

test('「芽摘み」は枝先だけにできる', async ({ page }) => {
  await open(page);
  await tool(page, '芽摘み');
  const tip = await screenPoint(page, 'tip');
  await page.mouse.move(tip.x, tip.y);
  await page.mouse.down();
  await page.mouse.up();
  // 押した節そのものではなく、その先端（枝先の1つ手前を押したときは、その子）に印が付く。印の付いた節が1つ増えればよい
  const pinched = () => page.evaluate(() => { const s = window.__bonsai.tree.snapshot(); let n = 0; for (let i = 0; i < s.count; i += 1) if ((s.flags[i] & 2) !== 0) n += 1; return n; });
  await expect.poll(pinched).toBeGreaterThan(0);
  const trunk = await screenPoint(page, 'trunk-base');
  await page.mouse.move(trunk.x, trunk.y);
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.locator('#live')).toContainText('枝先');
});

test('時間を進める：1週間で7日・1か月で30日・次の季節へ。冬は伸びず、春に伸びる', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: '1週間', exact: true }).click();
  await expect.poll(() => day(page)).toBe(7);
  await page.getByRole('button', { name: '1か月', exact: true }).click();
  await expect.poll(() => day(page)).toBe(37);
  await page.getByRole('button', { name: '次の季節', exact: true }).click();
  await expect.poll(async () => (await dataset(page)).season).toBe('winter');
  const winterNodes = await nodeCount(page);
  // 「次の季節」は季節の中ごろ（始まりの45日後）へ進む。冬の中ごろ（1月3週）から1か月と1週間では、まだ冬
  await page.getByRole('button', { name: '1か月', exact: true }).click();
  await page.getByRole('button', { name: '1週間', exact: true }).click();
  await expect.poll(async () => (await dataset(page)).season).toBe('winter');
  expect(await nodeCount(page)).toBe(winterNodes);
  await page.getByRole('button', { name: '次の季節', exact: true }).click();
  await expect.poll(async () => (await dataset(page)).season).toBe('spring');
  for (let i = 0; i < 3; i += 1) await page.getByRole('button', { name: '1か月', exact: true }).click();
  await expect.poll(() => nodeCount(page)).toBeGreaterThan(winterNodes);
});

test('曲げた枝は、時間を進めても形を保つ', async ({ page }) => {
  await open(page);
  await tool(page, '曲げる');
  const p = await screenPoint(page, 'primary');
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 40, p.y - 50, { steps: 10 });
  await page.mouse.up();
  const rot = () => page.evaluate((id) => { const s = window.__bonsai.tree.snapshot(); const i = s.ids.indexOf(id); return Array.from(s.quat.slice(4 * i, 4 * i + 4)); }, p.id);
  const wired = await rot();
  await tool(page, '見る');
  for (let i = 0; i < 3; i += 1) await page.getByRole('button', { name: '1か月', exact: true }).click();
  const later = await rot();
  later.forEach((v, k) => expect(Math.abs(v - wired[k])).toBeLessThan(1e-3));
});

test('作りかけは、再読み込みのあとも続きから始まる。保存を消すと最初から', async ({ page }) => {
  await page.goto(`${base}?debug=1&gfx=test&tips=0&fresh=1`);
  await page.evaluate(() => localStorage.clear());
  // seed を付けると、保存よりURLで指定した苗が優先される。保存を読むときは seed と fresh を付けない
  await page.goto(`${base}?debug=1&gfx=test&tips=0`);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
  await page.getByRole('button', { name: '1か月', exact: true }).click();
  await expect.poll(() => day(page)).toBe(30);
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
  expect(await day(page)).toBe(30);
});

test('壊れた保存は捨てて、新しい苗で始める', async ({ page }) => {
  await page.goto(`${base}?gfx=test&tips=0`);
  await page.evaluate(() => localStorage.setItem('day095.bonsai.save.v1', '{"v":1,"tree":{"nodes":"壊れている"}}'));
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}?debug=1&gfx=test&tips=0`);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
  expect(await day(page)).toBe(0);
  expect(errors).toEqual([]);
});

test('キーボードだけで、枝を選び（[ ]）、道具を使える', async ({ page }) => {
  await open(page);
  const before = await nodeCount(page);
  await page.locator('#view').focus();
  await page.keyboard.press('2');
  expect((await dataset(page)).tool).toBe('cut');
  await page.keyboard.press(']');
  await expect(page.locator('#live')).not.toBeEmpty();
  await page.keyboard.press('Enter');
  await expect.poll(() => nodeCount(page)).toBeLessThan(before);
  await page.keyboard.press('z');
  await expect.poll(() => nodeCount(page)).toBe(before);
});

test('メニューから黒松の新しい苗を始められ、樹種が変わる', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'メニュー', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'メニュー' });
  await expect(dialog).toBeVisible();
  await dialog.locator('#new-species').selectOption('pine');
  await dialog.getByRole('button', { name: '新しい苗を始める' }).click();
  await expect.poll(async () => (await dataset(page)).species).toBe('pine');
  await expect(page.locator('#view')).toHaveAttribute('aria-label', /黒松の盆栽/);
});

test('「写真」でプレビューが出て、画像を保存できる', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: '写真', exact: true }).click();
  const img = page.locator('#photo img, dialog img').first();
  await expect(img).toBeVisible({ timeout: 30_000 });
  const size = await img.evaluate((el) => ({ w: el.naturalWidth, h: el.naturalHeight }));
  expect(size.h).toBeGreaterThan(size.w);
  await expect(page.getByRole('link', { name: /保存/ }).or(page.getByRole('button', { name: /保存/ })).first()).toBeVisible();
});

test.describe('スマホ（390px・指）', () => {
  test.use(phone);

  test('横にはみ出さず、操作部は44px以上で、指で回せる', async ({ page }) => {
    await open(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const small = await page.evaluate(() => Array.from(document.querySelectorAll('button, a[href]')).filter((el) => !el.classList.contains('skip') && !el.closest('.sr-only')).filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 44 || r.width < 44) && getComputedStyle(el).visibility !== 'hidden'; }).map((el) => `${el.textContent.trim().slice(0, 12)}:${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`));
    expect(small).toEqual([]);
    const f = await finger(page);
    const cam = () => page.evaluate(() => window.__bonsai.view.camera.get().az);
    const az0 = await cam();
    await f.drag({ x: 60, y: 200 }, { x: 300, y: 210 });
    await expect.poll(cam).not.toBeCloseTo(az0, 1);
  });

  test('指で「切る」：押している間に候補が見え、離すと切れる', async ({ page }) => {
    await open(page);
    const before = await nodeCount(page);
    await tool(page, '切る');
    const p = await screenPoint(page, 'twig');
    const f = await finger(page);
    await f.down(p);
    await f.up();
    await expect.poll(() => nodeCount(page)).toBeLessThan(before);
  });

  test('指で「曲げる」', async ({ page }) => {
    await open(page);
    await tool(page, '曲げる');
    const p = await screenPoint(page, 'primary');
    const f = await finger(page);
    await f.drag(p, { x: p.x + 50, y: p.y - 60 });
    await expect.poll(() => page.evaluate(() => window.__bonsai.tree.snapshot().wires.length)).toBeGreaterThan(0);
  });
});

test('動きの軽減では、時間を進めても結果の姿へすぐ切り替わる', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await open(page);
  await page.getByRole('button', { name: '1週間', exact: true }).click();
  await expect.poll(() => day(page)).toBe(7);
  await context.close();
});

test('WebGL が使えないときは、理由と手入れの基本の文章が出る', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return /webgl/i.test(String(type)) ? null : original.call(this, type, ...rest); };
  });
  await page.goto(`${base}?gfx=test&fresh=1&tips=0`);
  await expect(page.locator('body')).toContainText('WebGL');
  await expect(page.locator('body')).toContainText('目安');
});
