import { expect, test } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CASES, EPILOGUE, stageOf } from '../../day-071-kage-shogen/lib/cases.js';
import { readingOf, witnessOf } from '../../day-071-kage-shogen/lib/deduction.js';
import { hitTest, propScreenRect } from '../../day-071-kage-shogen/lib/hit.js';
import { createTransform } from '../../day-071-kage-shogen/lib/transform.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CANONICAL = 'https://hundred-days.pages.dev/day-071-kage-shogen/';
const STORAGE_KEY = 'kage-shogen:v1';
const observations = new WeakMap();
let server;
let sourceUrl;

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });

test.beforeAll(async () => {
  server = spawn(process.execPath, ['day-071-kage-shogen/tools/serve.mjs'], {
    cwd: ROOT, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  sourceUrl = await new Promise((resolve, reject) => {
    let output = '';
    let errors = '';
    const timeout = setTimeout(() => reject(new Error(`Day071 source preview did not start: ${errors}`)), 10_000);
    server.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/day-071-kage-shogen\//);
      if (match) { clearTimeout(timeout); resolve(match[0]); }
    });
    server.stderr.on('data', (chunk) => { errors += chunk; });
    server.once('error', (error) => { clearTimeout(timeout); reject(error); });
    server.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Day071 source preview exited: ${code}: ${errors}`));
    });
  });
});

test.afterAll(async () => {
  if (server && server.exitCode === null && server.signalCode === null) {
    const stopped = new Promise((resolve) => server.once('exit', resolve));
    server.kill('SIGTERM');
    await stopped;
  }
});

test.afterEach(async ({ page }) => {
  const seen = observations.get(page);
  if (!seen || page.isClosed()) return;
  expect(seen.errors, 'page/console errors').toEqual([]);
  expect(seen.badResponses, 'HTTP errors').toEqual([]);
  expect(seen.outside, 'external requests').toEqual([]);
  expect(await page.evaluate(() => window.day071Test.violations), 'CSP violations').toEqual([]);
  expect(await page.locator('body').innerText()).not.toMatch(/\bundefined\b|\bNaN\b|\[object/);
});

async function open(page, { unlocked = 0, canvasFailure = null, failureCanvas = null, storageFailure = null, native = true } = {}) {
  const seen = { errors: [], badResponses: [], outside: [] };
  observations.set(page, seen);
  page.on('pageerror', (error) => seen.errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') seen.errors.push(message.text()); });
  page.on('response', (response) => {
    if (response.status() >= 400) seen.badResponses.push(`${response.status()} ${response.url()}`);
  });
  const origin = new URL(sourceUrl).origin;
  await page.route('**/*', (route) => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    seen.outside.push(route.request().url());
    return route.abort();
  });
  const cleared = Object.fromEntries(CASES.slice(0, unlocked).map((caseDef) => [caseDef.id, { stars: 3 }]));
  await page.addInitScript(({ key, clearedCases, failure, canvasId, storageMode, enableNative }) => {
    // Test-only browser API probes; the application exposes no model or debug globals.
    window.day071Test = {
      violations: [], copies: [], fallback: [], native: [], pointer: {},
      copyMode: 'ok', fallbackOk: false, nativeMode: 'abort',
    };
    document.addEventListener('securitypolicyviolation', (event) => {
      window.day071Test.violations.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      async writeText(text) {
        window.day071Test.copies.push(text);
        if (window.day071Test.copyMode === 'fail') throw new Error('Clipboard rejected by test');
      },
    } });
    document.execCommand = (command) => {
      window.day071Test.fallback.push(command);
      return window.day071Test.fallbackOk;
    };
    Object.defineProperty(navigator, 'share', { configurable: true, value: enableNative ? async (data) => {
      window.day071Test.native.push(data);
      if (window.day071Test.nativeMode === 'abort') throw new DOMException('Cancelled by test', 'AbortError');
      if (window.day071Test.nativeMode === 'fail') throw new Error('Native share rejected by test');
    } : undefined });
    if (failure) {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...args) {
        if (canvasId && this.id !== canvasId) return getContext.apply(this, args);
        if (failure === 'throw') throw new Error('Canvas blocked by test');
        return null;
      };
    }
    if (storageMode === 'getter') {
      Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('Storage blocked by test'); } });
    } else {
      // Do not overwrite a newly cleared night when the test reloads the page.
      if (Object.keys(clearedCases).length && localStorage.getItem(key) === null) {
        localStorage.setItem(key, JSON.stringify({ v: 1, cleared: clearedCases, last: null }));
      }
      if (storageMode === 'write') Storage.prototype.setItem = () => { throw new Error('Storage write blocked by test'); };
    }
    document.addEventListener('DOMContentLoaded', () => {
      const wall = document.getElementById('wall');
      for (const type of ['pointerdown', 'pointermove']) wall.addEventListener(type, (event) => {
        window.day071Test.pointer[type] = { x: event.clientX, y: event.clientY, id: event.pointerId };
      });
    });
  }, {
    key: STORAGE_KEY, clearedCases: cleared, failure: canvasFailure, canvasId: failureCanvas,
    storageMode: storageFailure, enableNative: native,
  });
  const response = await page.goto(sourceUrl);
  expect(response.headers()['content-security-policy']).toContain("script-src 'self'");
  expect(response.headers()['content-security-policy']).toContain("style-src 'self'");
  await expect(page.locator('#case-list [data-case-id]')).toHaveCount(5);
  await expect(page.locator('#share').getByRole('button', { name: 'リンクをコピー', exact: true, includeHidden: true })).toHaveCount(1);
}

const expectPhase = (page, phase) => expect(page.locator('#app')).toHaveAttribute('data-phase', phase);
const lampValue = async (page) => Number(await page.locator('#lamp-readout').getAttribute('data-ly'));
const itemValue = async (page) => {
  const text = await page.locator('#item-readout').textContent();
  const match = /横 (-?\d+)cm/.exec(text);
  expect(match, `item readout: ${text}`).not.toBeNull();
  return Number(match[1]);
};
const startArrangement = (index) => ({
  ly: CASES[index].stage.lamp.start,
  xs: Object.fromEntries(CASES[index].stage.props.map((prop) => [prop.id, prop.x.start])),
});

async function start(page, index = 0) {
  await page.locator(`[data-case-id="${CASES[index].id}"]`).click();
  await expectPhase(page, 'briefing');
  await expect(page.locator('#briefing-title')).toHaveText(`第${index + 1}夜　${CASES[index].title}`);
  await expect(page.locator('#briefing-title')).toBeFocused();
  await page.locator('#start-case').click();
  await expectPhase(page, 'stage');
  await expect(page.locator('#app')).toHaveAttribute('data-case', CASES[index].id);
  await expect(page.locator('#wall')).toBeFocused();
}

async function moveTo(page, id, target) {
  await page.locator(`#item-select [data-item="${id}"]`).click();
  const current = id === 'lamp' ? await lampValue(page) : await itemValue(page);
  const delta = Math.round(target) - current;
  const key = id === 'lamp' ? delta > 0 ? 'ArrowUp' : 'ArrowDown' : delta > 0 ? 'ArrowRight' : 'ArrowLeft';
  await page.locator('#wall').focus();
  for (let i = 0; i < Math.floor(Math.abs(delta) / 5); i += 1) await page.keyboard.press(`Shift+${key}`);
  for (let i = 0; i < Math.abs(delta) % 5; i += 1) await page.keyboard.press(key);
}

async function reproduce(page, index = 0) {
  const { stage } = CASES[index];
  await moveTo(page, 'lamp', stage.lamp.solution);
  for (const prop of stage.props.filter((prop) => prop.x.min < prop.x.max)) await moveTo(page, prop.id, prop.x.solution);
  await expectPhase(page, 'solved');
  await expect(page.locator('#reading-text')).toHaveText(readingOf(CASES[index]));
  await expect(page.locator('#to-deduction')).toBeFocused();
}

async function finish(page, index = 0) {
  await page.locator('#to-deduction').click();
  await expectPhase(page, 'deduction');
  await expect(page.locator('#deduction-title')).toBeFocused();
  await page.locator(`[data-suspect-id="${CASES[index].culprit}"] .accuse`).click();
  await expectPhase(page, 'verdict');
  await expect(page.locator('#next-case')).toBeFocused();
}

async function wallSpace(page) {
  await page.locator('#wall').scrollIntoViewIfNeeded();
  const box = await page.locator('#wall').boundingBox();
  expect(box).not.toBeNull();
  return { box, transform: createTransform(box.width, box.height) };
}

async function dragItem(page, index, arrangement, id, dx, dy) {
  const { box, transform } = await wallSpace(page);
  const stage = stageOf(CASES[index]);
  let point;
  if (id === 'lamp') point = transform.toScreen(stage.lamp.x, arrangement.ly);
  else {
    const prop = stage.props.find((candidate) => candidate.id === id);
    const rect = propScreenRect(transform, prop, arrangement.xs[id]);
    point = { x: rect.cx, y: rect.cy };
  }
  expect(hitTest(transform, stage, arrangement, point.x, point.y)).toBe(id);
  await page.mouse.move(box.x + point.x, box.y + point.y);
  await page.mouse.down();
  await page.mouse.move(box.x + point.x + dx * transform.scale, box.y + point.y - dy * transform.scale, { steps: 4 });
  await page.mouse.up();
  return { box, transform, pointer: await page.evaluate(() => window.day071Test.pointer) };
}

test('home shows five nights, locks, total and synchronous help focus restoration', async ({ page }) => {
  await open(page);
  await expect(page.locator('#title')).toHaveText('影証言');
  await expect(page.locator('#home-title')).toContainText('証言の嘘を暴け。');
  await expect(page.locator('#case-list [data-locked="true"]')).toHaveCount(4);
  await expect(page.locator('[data-case-id="rack"]')).toHaveAttribute('data-locked', 'false');
  await expect(page.locator('#total-stars')).toHaveText('0');
  await expect(page.locator('#back')).toBeHidden();
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  await page.locator('[data-case-id="hat"]').click({ force: true });
  await expectPhase(page, 'home');
  await expect(page.locator('#feedback')).toHaveText('前の夜を解決すると開きます');
  await page.locator('#help').click();
  await expect(page.locator('#help-dialog')).toBeVisible();
  expect(await page.evaluate(() => {
    document.querySelector('#help-dialog [data-close]').click();
    return document.activeElement.id;
  })).toBe('help');
  await page.locator('#help').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#help-dialog')).toBeHidden();
  await expect(page.locator('#help')).toBeFocused();
});

test('night one finishes by keyboard, refutes an alibi suspect locally and opens night two', async ({ page }) => {
  await open(page);
  await start(page);
  await expect(page.locator('#item-select [data-item]')).toHaveCount(1);
  await expect(page.locator('#lamp-readout')).toHaveAttribute('data-ly', '150');
  await expect(page.locator('#band-text')).toHaveText(CASES[0].coach);
  await expect(page.locator('#clues')).toHaveAttribute('open', '');
  await expect(page.locator('#stage-clues [data-kind]')).toHaveCount(5);
  await expect(page.locator('#stage-clues [data-kind="witness"]')).toContainText(witnessOf(CASES[0]).quote);
  for (let i = 0; i < 10; i += 1) await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#lamp-readout')).toHaveAttribute('data-ly', '99');
  await expectPhase(page, 'solved');
  await expect(page.locator('#reading-text')).toContainText('165cm');
  await expect(page.locator('#to-deduction')).toBeFocused();
  await page.locator('#to-deduction').click();
  await expectPhase(page, 'deduction');
  expect(await page.locator('#deduction-clues [data-kind]').evaluateAll((nodes) => nodes.map((node) => node.dataset.kind))).toEqual(['rule', 'alibi', 'result']);
  await page.locator('[data-suspect-id="hinata"] .accuse').click();
  await expect(page.locator('#deduction-message')).toBeVisible();
  await expect(page.locator('[data-suspect-id="hinata"] #deduction-message')).toHaveCount(1);
  await expect(page.locator('#deduction-message')).toContainText(CASES[0].clues.find((clue) => clue.kind === 'alibi').text);
  await expect(page.locator('[data-suspect-id="hinata"] .accuse')).toBeDisabled();
  await expect(page.locator('[data-suspect-id="hinata"]')).toContainText('ちがう');
  await page.locator('[data-suspect-id="moriyama"] .accuse').click();
  await expectPhase(page, 'verdict');
  await expect(page.locator('#verdict-stars')).toContainText('星2つ');
  await expect(page.locator('#verdict-stars')).toContainText('誤った推理があった');
  await expect(page.locator('#deduction-message')).toBeHidden();
  expect(await page.locator('#deduction-message').evaluate((node) => node.previousElementSibling.id)).toBe('suspect-list');
  await page.locator('#next-case').click();
  await expectPhase(page, 'briefing');
  await expect(page.locator('#app')).toHaveAttribute('data-case', 'hat');
});

test('cleared stars and the next unlocked night survive reload', async ({ page }) => {
  await open(page);
  await start(page);
  await reproduce(page);
  await finish(page);
  await page.reload();
  await expectPhase(page, 'home');
  await expect(page.locator('[data-case-id="rack"] [role="img"]')).toHaveAttribute('aria-label', '星3つ中3つ');
  await expect(page.locator('[data-case-id="hat"]')).toHaveAttribute('data-locked', 'false');
  await expect(page.locator('#total-stars')).toHaveText('3');
});

test('lamp drag is relative, uses the display scale and ignores empty wall space', async ({ page }) => {
  await open(page, { unlocked: 1 });
  await start(page, 1);
  await expect(page.locator('#item-select [data-item]')).toHaveCount(1);
  const arrangement = startArrangement(1);
  const { transform, box, pointer } = await dragItem(page, 1, arrangement, 'lamp', 0, 20);
  const expected = Math.round(arrangement.ly - (pointer.pointermove.y - pointer.pointerdown.y) / transform.scale);
  expect(await lampValue(page)).toBe(expected);
  expect(expected).toBeGreaterThan(arrangement.ly);
  arrangement.ly = expected;
  const point = transform.toScreen(15, 175);
  expect(hitTest(transform, stageOf(CASES[1]), arrangement, point.x, point.y)).toBeNull();
  await page.mouse.move(box.x + point.x, box.y + point.y);
  await page.mouse.down();
  await page.mouse.move(box.x + point.x + 30, box.y + point.y + 40);
  await page.mouse.up();
  expect(await lampValue(page)).toBe(expected);
});

test('movable props use chips, arrow keys and dragging; reset returns the starting arrangement', async ({ page }) => {
  await open(page, { unlocked: 2 });
  await start(page, 2);
  await expect(page.locator('#band-text')).toHaveText(CASES[2].coach);
  await page.locator('#item-select [data-item="hat"]').click();
  await expect(page.locator('#band-text')).toHaveText(CASES[2].coach);
  await expect(page.locator('#nudge-minus')).toHaveText('左へ');
  await expect(page.locator('#nudge-plus')).toHaveText('右へ');
  await page.locator('#wall').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#band-text')).not.toHaveText(CASES[2].coach);
  await expect(page.locator('#item-readout')).toHaveText('帽子 横 31cm');
  const arrangement = startArrangement(2);
  arrangement.xs.hat = 31;
  const { transform, pointer } = await dragItem(page, 2, arrangement, 'hat', 20, 0);
  expect(await itemValue(page)).toBe(Math.round(31 + (pointer.pointermove.x - pointer.pointerdown.x) / transform.scale));
  await page.locator('#reset-stage').click();
  await expect(page.locator('#item-readout')).toHaveText('帽子 横 30cm');
  await expect(page.locator('#lamp-readout')).toHaveAttribute('data-ly', '150');
  await expect(page.locator('#band-text')).toHaveText(CASES[2].coach);
  await expect(page.locator('#feedback')).toHaveText('はじめからにしました');
  await page.locator('#back').click();
  await start(page);
  const { box, transform: firstTransform } = await wallSpace(page);
  const fixed = CASES[0].stage.props[0];
  const point = firstTransform.toScreen(fixed.x.start, fixed.y);
  expect(hitTest(firstTransform, stageOf(CASES[0]), startArrangement(0), point.x, point.y)).toBeNull();
  await page.mouse.move(box.x + point.x, box.y + point.y);
  await page.mouse.down();
  await page.mouse.move(box.x + point.x - 30, box.y + point.y + 30);
  await page.mouse.up();
  expect(await lampValue(page)).toBe(150);
});

test('night three finishes with the lamp and all movable props, awarding three stars', async ({ page }) => {
  await open(page, { unlocked: 2 });
  await start(page, 2);
  await reproduce(page, 2);
  await finish(page, 2);
  await expect(page.locator('#verdict-stars')).toContainText('星3つ（ガイド・ヒント・誤答なし）');
  await expect(page.locator('#verdict-stars [role="img"]')).toHaveAttribute('aria-label', '星3つ中3つ');
});

test('night five requires both decoy shadows to leave before success and reaches the epilogue', async ({ page }) => {
  await open(page, { unlocked: 4 });
  await start(page, 4);
  const { stage } = CASES[4];
  await moveTo(page, 'lamp', stage.lamp.solution);
  for (const prop of stage.props.filter((prop) => !prop.decoy)) await moveTo(page, prop.id, prop.x.solution);
  await expect(page.locator('#band-text')).toContainText('関係ない道具の影が残っている');
  await page.waitForTimeout(1500); // Longer than the solve hold plus the normal success animation.
  await expectPhase(page, 'stage');
  for (const prop of stage.props.filter((prop) => prop.decoy)) await moveTo(page, prop.id, prop.x.solution);
  await expectPhase(page, 'solved');
  await finish(page, 4);
  await expect(page.locator('#next-case')).toHaveText('エピローグへ →');
  await page.locator('#next-case').click();
  await expectPhase(page, 'epilogue');
  await expect(page.locator('#epilogue-title')).toHaveText(EPILOGUE.title);
  await expect(page.locator('#epilogue-title')).toBeFocused();
  await expect(page.locator('#epilogue-stars')).toHaveText('合計 15 / 15');
  await expect(page.locator('#epilogue-recap li')).toHaveCount(5);
  for (const caseDef of CASES) await expect(page.locator('#epilogue-recap')).toContainText(caseDef.title);
  await page.locator('#epilogue-share').click();
  await expect(page.locator('#share-dialog')).toBeVisible();
  await page.locator('#share-dialog [data-close]').click();
  await expect(page.locator('#epilogue-share')).toBeFocused();
  await page.locator('#restart').click();
  await expectPhase(page, 'home');
});

test('paid guide and hints preserve their use across reset and reduce stars by category', async ({ page }) => {
  await open(page, { unlocked: 1 });
  await start(page, 1);
  await expect(page.locator('#guide-toggle')).toHaveText('ガイドを重ねる（★−1）');
  await page.locator('#guide-toggle').click();
  await expect(page.locator('#guide-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#guide-toggle')).toHaveText('ガイドを消す');
  await expect(page.locator('#feedback')).toHaveText('ガイドを使ったので、この夜の星が1つ減ります');
  await page.locator('#hint').click();
  await expect(page.locator('#hint-text')).toHaveText(`ヒント1：${CASES[1].hints[0]}`);
  await expect(page.locator('#hint')).toHaveText('次のヒント');
  await page.locator('#hint').click();
  await expect(page.locator('#hint-text')).toHaveText(`ヒント2：${CASES[1].hints[1]}`);
  await page.locator('#reset-stage').click();
  await expect(page.locator('#guide-toggle')).toHaveAttribute('aria-pressed', 'true');
  await reproduce(page, 1);
  await finish(page, 1);
  await expect(page.locator('#verdict-stars')).toContainText('星1つ（ガイドを使った・ヒントを使った）');
});

test('share copy fallback, failure and native cancellation retain the solved progress', async ({ page }) => {
  await open(page);
  await start(page);
  await reproduce(page);
  await finish(page);
  const progress = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  const verdict = await page.locator('#verdict-text').textContent();
  await page.locator('#share-open').click();
  await expect(page.locator('#share-dialog')).toBeVisible();
  const share = page.locator('#share');
  const x = new URL(await share.getByRole('link', { name: 'Xで投稿', exact: true }).getAttribute('href'));
  const line = new URL(await share.getByRole('link', { name: 'LINEで送る', exact: true }).getAttribute('href'));
  expect(x.origin).toBe('https://x.com');
  expect(x.pathname).toBe('/intent/post');
  expect(x.searchParams.get('url')).toBe(CANONICAL);
  expect(x.searchParams.get('text')).toContain('影証言');
  expect(line.origin).toBe('https://social-plugins.line.me');
  expect(line.searchParams.get('url')).toBe(CANONICAL);
  const copy = share.getByRole('button', { name: 'リンクをコピー', exact: true });
  await copy.click();
  await expect(share.getByRole('status')).toHaveText('コピーしました');
  expect(await page.evaluate(() => window.day071Test.copies)).toEqual([CANONICAL]);
  await page.evaluate(() => { window.day071Test.copyMode = 'fail'; window.day071Test.fallbackOk = true; });
  await copy.click();
  await expect(share.getByRole('status')).toHaveText('コピーしました');
  await page.evaluate(() => { window.day071Test.fallbackOk = false; });
  await copy.click();
  await expect(share.getByRole('status')).toContainText('URLを選んでコピー');
  await expect(page.locator('#share-url')).toHaveValue(CANONICAL);
  await expect(page.locator('#share-url')).toHaveAttribute('readonly', '');
  expect(await page.evaluate(() => window.day071Test.fallback)).toEqual(['copy', 'copy']);
  for (const mode of ['abort', 'fail', 'ok']) {
    await page.evaluate((value) => { window.day071Test.nativeMode = value; }, mode);
    await share.getByRole('button', { name: '共有…', exact: true }).click();
    await expect(copy).toBeEnabled();
    await expectPhase(page, 'verdict');
    await expect(page.locator('#verdict-text')).toHaveText(verdict);
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(progress);
  }
  expect(await page.evaluate(() => window.day071Test.native.map((data) => data.url))).toEqual([CANONICAL, CANONICAL, CANONICAL]);
  await page.locator('#share-dialog [data-close]').click();
  await expect(page.locator('#share-open')).toBeFocused();
});

test('share links and copy remain available without a native sheet', async ({ page }) => {
  await open(page, { native: false });
  await page.locator('#share-open').click();
  await expect(page.locator('#share').getByRole('button', { name: '共有…', exact: true })).toHaveCount(0);
  await expect(page.locator('#share').getByRole('link')).toHaveCount(2);
  await expect(page.locator('#share').getByRole('button', { name: 'リンクをコピー', exact: true })).toBeEnabled();
});

for (const failure of [
  { canvasFailure: 'null' }, { canvasFailure: 'throw' }, { canvasFailure: 'null', failureCanvas: 'side-view' },
]) {
  test(`Canvas failure ${JSON.stringify(failure)} blocks every case and keeps help available`, async ({ page }) => {
    await open(page, failure);
    await expect(page.locator('#unsupported')).toBeVisible();
    await expect(page.locator('[data-case-id="rack"]')).toHaveAttribute('aria-disabled', 'true');
    await page.locator('[data-case-id="rack"]').click({ force: true });
    await expectPhase(page, 'home');
    await page.locator('#help').click();
    await expect(page.locator('#help-dialog')).toBeVisible();
    await page.locator('#help-dialog [data-close]').click();
    await expect(page.locator('#help')).toBeFocused();
  });
}

test('a throwing storage getter still allows all five nights and the epilogue', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, { storageFailure: 'getter' });
  await expect(page.locator('#storage-note')).toBeVisible();
  for (let index = 0; index < CASES.length; index += 1) {
    if (index === 0) await start(page, index);
    else {
      await expectPhase(page, 'briefing');
      await page.locator('#start-case').click();
    }
    await reproduce(page, index);
    await finish(page, index);
    await expect(page.locator('#storage-note')).toBeVisible();
    await page.locator('#next-case').click();
  }
  await expectPhase(page, 'epilogue');
  await expect(page.locator('#epilogue-stars')).toHaveText('合計 15 / 15');
});

test('failed storage writes show the notice and retain progress in memory', async ({ page }) => {
  await open(page, { storageFailure: 'write' });
  await start(page);
  await expect(page.locator('#storage-note')).toBeVisible();
  await reproduce(page);
  await finish(page);
  await page.locator('#to-home').click();
  await expect(page.locator('#total-stars')).toHaveText('3');
  await expect(page.locator('[data-case-id="hat"]')).toHaveAttribute('data-locked', 'false');
});

for (const width of [360, 390, 768, 1440]) {
  test(`width ${width} has no home/stage/deduction overflow and keeps stage buttons at least 44px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await open(page);
    const fits = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await fits();
    await start(page);
    await fits();
    const buttons = await page.locator('#stage-panel button').evaluateAll((nodes) => nodes.filter((node) => node.checkVisibility()).map((node) => ({ id: node.id || node.dataset.item, height: node.getBoundingClientRect().height })));
    for (const button of buttons) expect(button.height, button.id).toBeGreaterThanOrEqual(44);
    await reproduce(page);
    await page.locator('#to-deduction').click();
    await expectPhase(page, 'deduction');
    await fits();
    await page.locator('[data-suspect-id="hinata"] .accuse').click();
    await fits();
  });
}

test('reduced motion reaches solved with no decorative stamp animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await start(page);
  await reproduce(page);
  expect(await page.locator('#stamp').evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
  await expectPhase(page, 'solved');
});

test('radio chips rove focus and keyboard nudges move exactly once without scrolling unused axes', async ({ page }) => {
  await open(page, { unlocked: 2 });
  await start(page, 2);
  await page.locator('#item-select [data-item="lamp"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#item-select [data-item="hat"]')).toBeFocused();
  await expect(page.locator('#item-select [data-item="hat"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#item-select [data-item="lamp"]')).toHaveAttribute('tabindex', '-1');
  await page.locator('#nudge-plus').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#item-readout')).toHaveText('帽子 横 31cm');
  await page.keyboard.press('Space');
  await expect(page.locator('#item-readout')).toHaveText('帽子 横 32cm');
  await page.locator('#wall').focus();
  await page.keyboard.press('Control+ArrowRight');
  await expect(page.locator('#item-readout')).toHaveText('帽子 横 32cm');
  const prevented = await page.locator('#wall').evaluate((canvas) => {
    const event = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
    canvas.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(true);
  await expect(page.locator('#item-readout')).toHaveText('帽子 横 32cm');
});

test('a second pointer cannot move a captured drag and cancel ends it', async ({ page }) => {
  await open(page, { unlocked: 1 });
  await start(page, 1);
  const { box, transform } = await wallSpace(page);
  const point = transform.toScreen(CASES[1].stage.lamp.x, CASES[1].stage.lamp.start);
  await page.mouse.move(box.x + point.x, box.y + point.y);
  await page.mouse.down();
  const id = await page.evaluate(() => window.day071Test.pointer.pointerdown.id);
  await page.locator('#wall').dispatchEvent('pointerdown', { pointerId: id + 20, isPrimary: false, button: 0, clientX: box.x + point.x, clientY: box.y + point.y });
  await page.locator('#wall').dispatchEvent('pointermove', { pointerId: id + 20, isPrimary: false, clientX: box.x + point.x, clientY: box.y + point.y - 40 });
  expect(await lampValue(page)).toBe(45);
  await page.locator('#wall').dispatchEvent('pointercancel', { pointerId: id });
  await page.mouse.move(box.x + point.x, box.y + point.y - 30);
  await page.mouse.up();
  expect(await lampValue(page)).toBe(45);
});

test('long press repeats after its delay, stops on leaving and adds no pointer click step', async ({ page }) => {
  await open(page);
  await start(page);
  const button = page.locator('#nudge-plus');
  await button.scrollIntoViewIfNeeded();
  const box = await button.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  expect(await lampValue(page)).toBe(151);
  await expect.poll(() => lampValue(page)).toBeGreaterThan(152);
  await page.mouse.move(box.x - 10, box.y - 10);
  const stopped = await lampValue(page);
  await page.waitForTimeout(250);
  expect(await lampValue(page)).toBe(stopped);
  await page.mouse.up();
  expect(await lampValue(page)).toBe(stopped);
  await button.click();
  expect(await lampValue(page)).toBe(Math.min(165, stopped + 1));
});

for (const interrupt of ['dialog', 'blur', 'hidden', 'reset', 'home']) {
  test(`${interrupt} cancels the pending solve and old timers cannot change a fresh night`, async ({ page }) => {
    await open(page);
    await start(page);
    // Apply all keystrokes and interrupt in one task, before the real 350ms hold can fire.
    await page.evaluate((action) => {
      const wall = document.getElementById('wall');
      for (let i = 0; i < 10; i += 1) wall.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true, cancelable: true }));
      wall.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
      if (action === 'dialog') document.getElementById('help').click();
      if (action === 'blur') window.dispatchEvent(new Event('blur'));
      if (action === 'hidden') {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
      }
      if (action === 'reset') document.getElementById('reset-stage').click();
      if (action === 'home') document.getElementById('back').click();
    }, interrupt);
    await page.waitForTimeout(1500);
    await expectPhase(page, interrupt === 'home' ? 'home' : 'stage');
    if (interrupt === 'dialog') {
      await page.locator('#help-dialog [data-close]').click();
      await expect(page.locator('#help')).toBeFocused();
    }
    if (interrupt === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    if (interrupt === 'hidden') await page.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    if (interrupt !== 'home') await page.locator('#back').click();
    await start(page);
    await page.waitForTimeout(1500);
    await expectPhase(page, 'stage');
    expect(await lampValue(page)).toBe(150);
  });
}

test('a dialog during the confirmed success animation finishes the result and restores its origin', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await open(page);
  await start(page);
  await moveTo(page, 'lamp', 99);
  await expect(page.locator('#hint')).toBeDisabled();
  await page.locator('#help').click();
  await expect(page.locator('#help-dialog')).toBeVisible();
  await page.locator('#help-dialog [data-close]').click();
  await expectPhase(page, 'solved');
  await expect(page.locator('#help')).toBeFocused();
  await page.waitForTimeout(1500);
  await expect(page.locator('#help')).toBeFocused();
});

test('deduction exclusions do not judge, the stool stays in clue order and its hint costs one star', async ({ page }) => {
  await open(page, { unlocked: 3 });
  await start(page, 3);
  await reproduce(page, 3);
  await expect(page.locator('#reading-text')).toContainText('踏み台20cm');
  await page.locator('#to-deduction').click();
  expect(await page.locator('#deduction-clues [data-kind]').evaluateAll((nodes) => nodes.map((node) => node.dataset.kind))).toEqual(['rule', 'stool', 'alibi', 'result']);
  const exclude = page.locator('[data-suspect-id="kiritani"] .exclude');
  await exclude.click();
  await expect(exclude).toHaveAttribute('aria-pressed', 'true');
  await expectPhase(page, 'deduction');
  await page.locator('#deduction-hint').click();
  await expect(page.locator('#deduction-hint-text')).toHaveText(CASES[3].deductionHint);
  await expect(page.locator('#deduction-hint')).toBeDisabled();
  await page.locator('[data-suspect-id="kiritani"] .accuse').click();
  await expectPhase(page, 'verdict');
  await expect(page.locator('#verdict-stars')).toContainText('星2つ（ヒントを使った）');
});

test('replaying keeps the best stars and progress reset requires confirmation', async ({ page }) => {
  await open(page, { unlocked: 1 });
  await start(page);
  await page.locator('#hint').click();
  await reproduce(page);
  await finish(page);
  await expect(page.locator('#verdict-stars')).toContainText('星2つ');
  await page.locator('#to-home').click();
  await expect(page.locator('[data-case-id="rack"] [role="img"]')).toHaveAttribute('aria-label', '星3つ中3つ');
  await page.locator('#reset-progress').click();
  await expect(page.locator('#reset-dialog')).toBeVisible();
  await page.locator('#reset-cancel').click();
  await expect(page.locator('#reset-progress')).toBeFocused();
  await expect(page.locator('#total-stars')).toHaveText('3');
  await page.locator('#reset-progress').click();
  await page.locator('#reset-confirm').click();
  await expect(page.locator('#reset-dialog')).toBeHidden();
  await expect(page.locator('#reset-progress')).toBeFocused();
  await expect(page.locator('#total-stars')).toHaveText('0');
  await expect(page.locator('[data-case-id="hat"]')).toHaveAttribute('data-locked', 'true');
  await page.reload();
  await expect(page.locator('#total-stars')).toHaveText('0');
});
