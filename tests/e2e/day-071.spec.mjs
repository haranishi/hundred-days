import { expect, test } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CASES, EPILOGUE, stageOf } from '../../day-071-kage-shogen/lib/cases.js';
import { readingOf, suspectsOf, witnessOf } from '../../day-071-kage-shogen/lib/deduction.js';
import { hitTest, propScreenRect } from '../../day-071-kage-shogen/lib/hit.js';
import { createSession, describeAssessment, useHint } from '../../day-071-kage-shogen/lib/stage.js';
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
// 開始の配置で、モデルが出す近さの言葉とヒント（1回目は名指し、2回目は考え方）。
const startLabel = (index) => describeAssessment(createSession(CASES[index])).label;
const startHints = (index) => {
  const session = createSession(CASES[index]);
  return [useHint(session), useHint(session)];
};

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
  // 最初の一言は注記の欄に出し、近さの欄はいつも近さの言葉を出す（一言に置き換えない）。
  await expect(page.locator('#note-text')).toHaveText(CASES[0].coach);
  await expect(page.locator('#note-text')).toHaveAttribute('data-kind', 'coach');
  await expect(page.locator('#band-text')).toHaveText(startLabel(0));
  // メーターの4つの目盛りは、モデルの満ち具合（0〜1）をそのまま --fill に持つ。
  const fills = describeAssessment(createSession(CASES[0])).fills.map((fill) => String(Math.round(fill * 1000) / 1000));
  expect(await page.locator('#meter i').evaluateAll((ticks) => ticks.map((tick) => tick.style.getPropertyValue('--fill')))).toEqual(fills);
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
  await expect(page.locator('#note-text')).toHaveText(CASES[2].coach);
  await expect(page.locator('#band-text')).toHaveText(startLabel(2));
  await page.locator('#item-select [data-item="hat"]').click();
  await expect(page.locator('#note-text')).toHaveText(CASES[2].coach);
  await expect(page.locator('#nudge-minus')).toHaveText('左へ');
  await expect(page.locator('#nudge-plus')).toHaveText('右へ');
  await page.locator('#wall').focus();
  await page.keyboard.press('ArrowRight');
  // 操作しても、一言は消えない（近さの欄とは別の欄）。
  await expect(page.locator('#note-text')).toHaveText(CASES[2].coach);
  await expect(page.locator('#band-text')).not.toHaveText(CASES[2].coach);
  await expect(page.locator('#item-readout')).toHaveText('帽子 横 31cm');
  const arrangement = startArrangement(2);
  arrangement.xs.hat = 31;
  const { transform, pointer } = await dragItem(page, 2, arrangement, 'hat', 20, 0);
  expect(await itemValue(page)).toBe(Math.round(31 + (pointer.pointermove.x - pointer.pointerdown.x) / transform.scale));
  await page.locator('#reset-stage').click();
  await expect(page.locator('#item-readout')).toHaveText('帽子 横 30cm');
  await expect(page.locator('#lamp-readout')).toHaveAttribute('data-ly', '150');
  await expect(page.locator('#note-text')).toHaveText(CASES[2].coach);
  await expect(page.locator('#band-text')).toHaveText(startLabel(2));
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
  // ヒントは交互：1回目はいまのずれの名指し、2回目はその夜の考え方。注記の欄に出す。
  const [first, second] = startHints(1);
  expect([first.kind, second.kind]).toEqual(['diagnosis', 'principle']);
  await expect(page.locator('#hint')).toHaveText('ヒント（★−1）');
  await page.locator('#hint').click();
  await expect(page.locator('#note-text')).toHaveText(`ヒント1：${first.text}`);
  await expect(page.locator('#note-text')).toHaveAttribute('data-kind', 'hint');
  await expect(page.locator('#feedback')).toHaveText(`ヒント1：${first.text}`);
  await expect(page.locator('#hint')).toHaveText('次のヒント');
  await page.locator('#hint').click();
  await expect(page.locator('#note-text')).toHaveText(`ヒント2：${second.text}`);
  expect(second.text).toBe(CASES[1].hints[0]);
  // 操作しても、ガイドを付け外ししても、ヒントの文は残る。
  await page.locator('#nudge-plus').click();
  await page.locator('#guide-toggle').click();
  await page.locator('#guide-toggle').click();
  await expect(page.locator('#note-text')).toHaveText(`ヒント2：${second.text}`);
  // 「はじめから」でヒントの文を消して一言へ戻す（使った回数は戻さない）。
  await page.locator('#reset-stage').click();
  await expect(page.locator('#note-text')).toHaveText(CASES[1].coach);
  await expect(page.locator('#note-text')).toHaveAttribute('data-kind', 'coach');
  await expect(page.locator('#hint')).toHaveText('次のヒント');
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
    // 開けない夜に「はじめる →」の強調を出さない。
    await expect(page.locator('#case-list .is-next')).toHaveCount(0);
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
  // 夜2以降の読みは灯りの高さまで。踏み台を引いて6割で割る計算はプレイヤーに任せ、答えの175cmは書かない。
  await expect(page.locator('#reading-text')).toHaveText(readingOf(CASES[3]));
  await expect(page.locator('#reading-text')).not.toContainText('175cm');
  await page.locator('#to-deduction').click();
  expect(await page.locator('#deduction-clues [data-kind]').evaluateAll((nodes) => nodes.map((node) => node.dataset.kind))).toEqual(['rule', 'stool', 'alibi', 'result']);
  const exclude = page.locator('[data-suspect-id="kiritani"] .exclude');
  await expect(exclude).toHaveText('外す ✕');
  await exclude.click();
  await expect(exclude).toHaveAttribute('aria-pressed', 'true');
  await expect(exclude).toHaveText('✕ 外した（戻す）');
  // 外した人も薄くしない（肩書き・証言の文字はそのまま読める濃さ）。
  expect(await page.locator('[data-suspect-id="kiritani"]').evaluate((card) => getComputedStyle(card).opacity)).toBe('1');
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

// ---- 改修1（独立評価の指摘）の回帰防止 ----
const HEIGHTS = { 360: 640, 390: 844, 768: 1024, 1440: 900 };
const CONTROL_IDS = ['nudge-minus', 'nudge-plus', 'hint', 'item-select'];

// 操作列の上端（ページの先頭からの位置。スクロールしても変わらない）。
const controlTops = (page) => page.evaluate((ids) => Object.fromEntries(ids.map((id) => [id, document.getElementById(id).getBoundingClientRect().top + window.scrollY])), CONTROL_IDS);
function expectStill(before, after, label) {
  for (const id of CONTROL_IDS) expect(Math.abs(after[id] - before[id]), `${label}: ${id}`).toBeLessThanOrEqual(1);
}
// 要素の中の文字が何行に並んでいるか（文字の矩形の上端を数える）。
const textLines = (page, selector) => page.locator(selector).evaluate((node) => {
  const range = document.createRange();
  range.selectNodeContents(node);
  const tops = [...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.top));
  return new Set(tops.map((top) => tops.find((other) => Math.abs(other - top) <= 3))).size;
});
async function expectInView(page, selector) {
  const box = await page.locator(selector).boundingBox();
  const viewport = page.viewportSize();
  expect(box, selector).not.toBeNull();
  expect(box.y, `${selector} top`).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height, `${selector} bottom`).toBeLessThanOrEqual(viewport.height);
}
const scrollY = (page) => page.evaluate(() => window.scrollY);

// 表示中の文で、行頭に数字・cm・＝・−が来ている所を探す（数字や単位の途中・日本語と数字のあいだの折り返し）。
const lineStartViolations = (page) => page.evaluate(() => {
  const blockOf = (element) => {
    let node = element;
    while (node && node !== document.body && getComputedStyle(node).display.startsWith('inline')) node = node.parentElement;
    return node;
  };
  const groups = new Map();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    const parent = text.parentElement;
    if (!parent || !text.data.trim() || parent.closest('.sr-only, script, style, noscript')) continue;
    if (!parent.checkVisibility({ checkVisibilityCSS: true })) continue;
    const block = blockOf(parent);
    if (!groups.has(block)) groups.set(block, []);
    for (let i = 0; i < text.data.length; i += 1) {
      if (/\s/.test(text.data[i])) continue;
      const range = document.createRange();
      range.setStart(text, i);
      range.setEnd(text, i + 1);
      const rect = [...range.getClientRects()].find((item) => item.width > 0 || item.height > 0);
      if (rect) groups.get(block).push({ ch: text.data[i], top: rect.top, height: rect.height });
    }
  }
  const found = [];
  for (const [block, chars] of groups) {
    for (let k = 1; k < chars.length; k += 1) {
      if (chars[k].top < chars[k - 1].top + chars[k - 1].height / 2) continue;
      const head = chars[k].ch + (chars[k + 1]?.ch ?? '');
      if (/^[0-9]/.test(head) || head === 'cm' || /^[＝−]/.test(head)) {
        found.push(`${block.id || block.className}: ${chars.slice(Math.max(0, k - 6), k).map((c) => c.ch).join('')}｜${chars.slice(k, k + 6).map((c) => c.ch).join('')}`);
      }
    }
  }
  return found;
});

for (const width of [360, 390, 768, 1440]) {
  test(`width ${width}: the control row stays put after the first drag or button, a chip switch and a two-line hint`, async ({ page }) => {
    await page.setViewportSize({ width, height: HEIGHTS[width] });
    await open(page, { unlocked: 4 });
    await start(page, 0);
    let before = await controlTops(page);
    await dragItem(page, 0, startArrangement(0), 'lamp', 0, -20);
    expect(await lampValue(page)).toBeLessThan(150);
    expectStill(before, await controlTops(page), 'first drag');
    before = await controlTops(page);
    await page.locator('#hint').click();
    await expect(page.locator('#note-text')).toHaveAttribute('data-kind', 'hint');
    expect(await textLines(page, '#note-text')).toBeLessThanOrEqual(2);
    expectStill(before, await controlTops(page), 'hint on night 1');
    await page.locator('#back').click();
    await start(page, 4);
    before = await controlTops(page);
    await page.locator('#nudge-plus').click();
    expect(await lampValue(page)).toBe(CASES[4].stage.lamp.start + 1);
    expectStill(before, await controlTops(page), 'first button');
    for (const id of ['umbrella', 'coat', 'bowler', 'globe', 'lamp']) {
      before = await controlTops(page);
      await page.locator(`#item-select [data-item="${id}"]`).click();
      await expect(page.locator(`#item-select [data-item="${id}"]`)).toHaveAttribute('aria-checked', 'true');
      expectStill(before, await controlTops(page), `chip ${id}`);
    }
    before = await controlTops(page);
    await page.locator('#hint').click();
    await expect(page.locator('#note-text')).toHaveAttribute('data-kind', 'hint');
    expect(await textLines(page, '#note-text')).toBeLessThanOrEqual(2);
    expectStill(before, await controlTops(page), 'hint on night 5');
  });
}

test('night five leaves the pushed-out decoys where the player put them when the success snaps', async ({ page }) => {
  await open(page, { unlocked: 4 });
  const { stage } = CASES[4];
  for (const [first, last, expected] of [
    [['bowler', 232], ['globe', 8], '地球儀 横 8cm'],
    [['globe', 8], ['bowler', 232], '山高帽 横 232cm'],
    [['bowler', 8], ['globe', 232], '地球儀 横 232cm'],
  ]) {
    await start(page, 4);
    await moveTo(page, 'lamp', stage.lamp.solution);
    for (const prop of stage.props.filter((item) => !item.decoy)) await moveTo(page, prop.id, prop.x.solution);
    await moveTo(page, ...first);
    await expectPhase(page, 'stage');
    await moveTo(page, ...last);
    await expectPhase(page, 'solved');
    // 正解へそろえるのは人影の道具と灯りだけ。邪魔な道具は置いた側の端に残る（左右が入れ替わらない）。
    await expect(page.locator('#item-readout')).toHaveText(expected);
    await page.locator('#back').click();
    await expectPhase(page, 'home');
  }
});

test('390×844: hints land in the note above the controls without scrolling, naming the worst offset first', async ({ page }) => {
  await open(page, { unlocked: 4 });
  for (const index of [0, 2, 3, 4]) {
    await start(page, index);
    expect(await scrollY(page)).toBe(0);
    const [first, second] = startHints(index);
    if (index === 0) expect(first.text).toBe('灯りが、だいぶ高い。下げてみよう。');
    await page.locator('#hint').click();
    await expect(page.locator('#note-text')).toHaveText(`ヒント1：${first.text}`);
    expect(await scrollY(page), `night ${index + 1}`).toBe(0);
    await expectInView(page, '#note-text');
    await page.locator('#hint').click();
    await expect(page.locator('#note-text')).toHaveText(`ヒント2：${second.text}`);
    expect(second.text).toBe(CASES[index].hints[0]);
    expect(await scrollY(page), `night ${index + 1}`).toBe(0);
    await expectInView(page, '#note-text');
    await page.locator('#back').click();
  }
});

test('the briefing sketch stays at least 200px wide from 560px to 1440px on every night', async ({ page }) => {
  await open(page, { unlocked: 4 });
  for (const width of [560, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (let index = 0; index < CASES.length; index += 1) {
      await page.locator(`[data-case-id="${CASES[index].id}"]`).click();
      await expectPhase(page, 'briefing');
      const box = await page.locator('#sketch-brief').boundingBox();
      expect(box.width, `${width}px night ${index + 1}`).toBeGreaterThanOrEqual(200);
      await page.locator('#back').click();
      await expectPhase(page, 'home');
    }
  }
});

for (const width of [360, 390]) {
  test(`width ${width}: verdict and epilogue never overflow sideways while their stamps land, and the epilogue buttons are in the first view`, async ({ page }) => {
    await page.setViewportSize({ width, height: HEIGHTS[width] });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await open(page, { unlocked: 4 });
    await page.evaluate(() => {
      window.day071Overflow = [];
      const app = document.getElementById('app');
      new MutationObserver(() => {
        const { phase } = app.dataset;
        if (phase !== 'verdict' && phase !== 'epilogue') return;
        const started = performance.now();
        const frame = () => {
          window.day071Overflow.push({ phase, scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth });
          if (performance.now() - started < 1000) requestAnimationFrame(frame);
        };
        frame();
      }).observe(app, { attributes: true, attributeFilter: ['data-phase'] });
    });
    await start(page, 4);
    await reproduce(page, 4);
    await finish(page, 4);
    await page.waitForTimeout(1100);
    await page.locator('#next-case').click();
    await expectPhase(page, 'epilogue');
    await page.waitForTimeout(1100);
    const frames = await page.evaluate(() => window.day071Overflow);
    for (const phase of ['verdict', 'epilogue']) expect(frames.filter((frame) => frame.phase === phase).length, phase).toBeGreaterThan(10);
    expect(frames.filter((frame) => frame.scrollWidth > frame.innerWidth)).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expectInView(page, '#epilogue-share');
    await expectInView(page, '#restart');
    // 順序：合計の星とボタンが先、夜ごとの振り返りはそのあと。
    expect(await page.locator('#epilogue-recap').evaluate((node) => node.previousElementSibling.classList.contains('verdict-actions'))).toBe(true);
    await expect(page.locator('#epilogue-recap .star-count')).toHaveText(['3/3', '3/3', '3/3', '3/3', '3/3']);
  });
}

test('nights three and five show two suspects of the matching height, and only the alibi tells them apart', async ({ page }) => {
  await open(page, { unlocked: 4 });
  for (const index of [2, 4]) {
    const caseDef = CASES[index];
    await start(page, index);
    await reproduce(page, index);
    await page.locator('#to-deduction').click();
    await expectPhase(page, 'deduction');
    const reading = readingOf(caseDef);
    await expect(page.locator('#deduction-clues [data-kind="result"] .clue-text')).toHaveText(reading);
    const culprit = suspectsOf(caseDef).find((suspect) => suspect.id === caseDef.culprit);
    expect(reading).not.toContain(`${culprit.height}cm`);
    const metas = await page.locator('#suspect-list .suspect-meta').allTextContents();
    expect(metas.filter((text) => text.endsWith(`・${culprit.height}cm`)), metas.join(' / ')).toHaveLength(2);
    const alibi = caseDef.clues.find((clue) => clue.kind === 'alibi');
    const [twin] = alibi.rulesOut;
    expect(suspectsOf(caseDef).find((suspect) => suspect.id === twin).height).toBe(culprit.height);
    await page.locator(`[data-suspect-id="${twin}"] .accuse`).click();
    await expect(page.locator(`[data-suspect-id="${twin}"] #deduction-message`)).toContainText(alibi.text);
    await expectPhase(page, 'deduction');
    await page.locator(`[data-suspect-id="${caseDef.culprit}"] .accuse`).click();
    await expectPhase(page, 'verdict');
    await page.locator('#to-home').click();
    await expectPhase(page, 'home');
  }
});

test('the case book highlights only the next night to open, keeps solved and locked nights readable', async ({ page }) => {
  await open(page);
  const expectNext = async (id) => {
    await expect(page.locator('#case-list .case-card.is-next')).toHaveCount(id ? 1 : 0);
    if (id) await expect(page.locator(`[data-case-id="${id}"] .case-state`)).toHaveText('はじめる →');
    const amber = await page.locator('#case-list .case-card').evaluateAll((cards) => cards
      .filter((card) => getComputedStyle(card).borderTopColor === 'rgb(255, 184, 77)').map((card) => card.dataset.caseId));
    expect(amber).toEqual(id ? [id] : []);
    const faded = await page.locator('#case-list .case-card').evaluateAll((cards) => cards.filter((card) => getComputedStyle(card).opacity !== '1').length);
    expect(faded).toBe(0);
  };
  await expectNext('rack');
  const setProgress = async (cleared) => {
    await page.evaluate(([key, value]) => localStorage.setItem(key, value), [STORAGE_KEY, JSON.stringify({ v: 1, cleared, last: null })]);
    await page.reload();
    await expect(page.locator('#case-list [data-case-id]')).toHaveCount(5);
  };
  await setProgress({ rack: { stars: 3 }, hat: { stars: 2 } });
  await expectNext('bag');
  await expect(page.locator('[data-case-id="hat"] .star-count')).toHaveText('2/3');
  await setProgress(Object.fromEntries(CASES.map((caseDef) => [caseDef.id, { stars: 3 }])));
  await expectNext(null);
});

for (const width of [360, 390, 768, 1440]) {
  test(`width ${width}: every phase fits the width and no line starts with a number, a unit or an operator`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width, height: HEIGHTS[width] });
    await open(page);
    const check = async (label) => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${label}: horizontal scroll`).toBe(true);
      expect(await lineStartViolations(page), label).toEqual([]);
    };
    await check('home');
    await page.locator('[data-case-id="rack"]').click();
    for (let index = 0; index < CASES.length; index += 1) {
      const caseDef = CASES[index];
      await expectPhase(page, 'briefing');
      await check(`briefing ${index + 1}`);
      await page.locator('#start-case').click();
      await expectPhase(page, 'stage');
      await check(`stage ${index + 1}`);
      await page.locator('#strip-toggle').click();
      await page.locator('#hint').click();
      await page.locator('#clues').evaluate((details) => { details.open = true; });
      await check(`stage ${index + 1} opened`);
      await page.locator('#strip-toggle').click();
      await reproduce(page, index);
      await check(`solved ${index + 1}`);
      await page.locator('#to-deduction').click();
      await expectPhase(page, 'deduction');
      await page.locator('#deduction-hint').click();
      await check(`deduction ${index + 1}`);
      for (const suspect of suspectsOf(caseDef).filter((item) => item.id !== caseDef.culprit)) {
        await page.locator(`[data-suspect-id="${suspect.id}"] .exclude`).click();
        await page.locator(`[data-suspect-id="${suspect.id}"] .accuse`).click();
        await check(`deduction ${index + 1} wrong ${suspect.id}`);
      }
      await page.locator(`[data-suspect-id="${caseDef.culprit}"] .accuse`).click();
      await expectPhase(page, 'verdict');
      await check(`verdict ${index + 1}`);
      await page.locator('#next-case').click();
    }
    await expectPhase(page, 'epilogue');
    await check('epilogue');
    for (const [opener, dialog] of [['#help', '#help-dialog'], ['#share-open', '#share-dialog']]) {
      await page.locator(opener).click();
      await expect(page.locator(dialog)).toBeVisible();
      await check(dialog);
      await page.locator(`${dialog} [data-close]`).click();
    }
    await page.locator('#restart').click();
    await expectPhase(page, 'home');
    await check('home after all nights');
    await page.locator('#reset-progress').click();
    await check('#reset-dialog');
    await page.locator('#reset-cancel').click();
  });
}

for (const [width, height] of [[360, 640], [390, 844]]) {
  test(`${width}×${height}: one tap opens the whole testimony, and the wall fits the first view while it is closed`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await open(page, { unlocked: 4 });
    await start(page, 4);
    expect(await scrollY(page)).toBe(0);
    await expectInView(page, '#wall');
    const toggle = page.locator('#strip-toggle');
    const quote = page.locator('#strip-quote');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toHaveAttribute('aria-controls', 'strip-quote');
    await expect(toggle).toContainText('全文を読む');
    expect((await toggle.boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect(await quote.evaluate((node) => node.scrollHeight > node.clientHeight + 1), 'clamped while closed').toBe(true);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(toggle).toContainText('たたむ');
    expect(await quote.evaluate((node) => node.scrollHeight <= node.clientHeight + 1), 'whole quote while open').toBe(true);
    await expect(quote).toContainText('長靴で。顔は見えませんでした。');
    expect(await scrollY(page)).toBe(0);
    await expectInView(page, '#strip-quote');
    expect((await page.locator('#sketch').boundingBox()).width).toBeGreaterThanOrEqual(140);
    await page.locator('#back').click();
    await start(page, 4);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
}

test('360×640 and 390×844 first views hold the wall, closeness, note, chips and controls', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await open(page, { unlocked: 4 });
  const bottom = async (selector) => {
    const box = await page.locator(selector).boundingBox();
    return box.y + box.height;
  };
  for (let index = 0; index < CASES.length; index += 1) {
    await page.locator(`[data-case-id="${CASES[index].id}"]`).click();
    await expectPhase(page, 'briefing');
    expect(await bottom('#start-case'), `briefing ${index + 1}`).toBeLessThanOrEqual(640);
    await page.locator('#start-case').click();
    await expectPhase(page, 'stage');
    expect(await scrollY(page)).toBe(0);
    // 題は見た目から隠すが、読み上げ用に残す（stage の見出し）。
    await expect(page.locator('#stage-title')).toHaveText(`第${index + 1}夜　${CASES[index].title}`);
    expect((await page.locator('#stage-title').boundingBox()).height).toBeLessThanOrEqual(1);
    for (const selector of ['#wall', '#band-text', '#note-text', '#item-select']) expect(await bottom(selector), `${selector} night ${index + 1}`).toBeLessThanOrEqual(640);
    const nudge = await page.locator('#nudge-minus').boundingBox();
    if (index < 4) expect(nudge.y + nudge.height, `nudges night ${index + 1}`).toBeLessThanOrEqual(640);
    else expect(640 - nudge.y, 'night 5 shows at least half of the nudges').toBeGreaterThanOrEqual(nudge.height / 2);
    await page.locator('#back').click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (let index = 0; index < 4; index += 1) {
    await start(page, index);
    expect(await scrollY(page)).toBe(0);
    for (const selector of ['#hint', '#guide-toggle', '#reset-stage']) expect(await bottom(selector), `${selector} night ${index + 1}`).toBeLessThanOrEqual(844);
    await page.locator('#back').click();
  }
});

for (const width of [360, 390]) {
  test(`width ${width}: the longest closeness line and its reason fit on one line beside the meter`, async ({ page }) => {
    await page.setViewportSize({ width, height: HEIGHTS[width] });
    await open(page, { unlocked: 4 });
    await start(page, 4);
    const { stage } = CASES[4];
    const before = await controlTops(page);
    await moveTo(page, 'lamp', stage.lamp.solution);
    for (const prop of stage.props.filter((item) => !item.decoy)) await moveTo(page, prop.id, prop.x.solution);
    await expect(page.locator('#band-text')).toHaveText('あと少し（関係ない道具の影が残っている）');
    expect(await page.locator('#band-text').evaluate((node) => node.scrollWidth <= node.clientWidth), 'not cut off').toBe(true);
    expect(await textLines(page, '#band-text')).toBe(1);
    // メーターは3つ満ちて、4つ目は空（合格だけが4つ目を満たす）。
    expect(await page.locator('#meter i').evaluateAll((ticks) => ticks.map((tick) => Number(tick.style.getPropertyValue('--fill'))))).toEqual([1, 1, 1, 0]);
    expectStill(before, await controlTops(page), 'longest closeness line');
  });
}

test('night one swaps its first line with the guide, and reset keeps the line and the wall consistent', async ({ page }) => {
  await open(page);
  await start(page);
  await expect(page.locator('#note-text')).toHaveText(CASES[0].coach);
  await page.locator('#guide-toggle').click();
  await expect(page.locator('#guide-toggle')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#note-text')).toHaveText(CASES[0].coachNoGuide);
  await page.locator('#nudge-minus').click();
  await page.locator('#reset-stage').click();
  await expect(page.locator('#guide-toggle')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#note-text')).toHaveText(CASES[0].coachNoGuide);
  await page.locator('#guide-toggle').click();
  await expect(page.locator('#note-text')).toHaveText(CASES[0].coach);
});

test('the tab icon is the SVG favicon and the header share button reads 共有', async ({ page }) => {
  await open(page);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', './favicon.svg');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('type', 'image/svg+xml');
  const response = await page.request.get(new URL('favicon.svg', sourceUrl).href);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('image/svg+xml');
  await expect(page.locator('#share-open')).toHaveText('共有');
  await expect(page.locator('#share-open')).toHaveAttribute('aria-label', 'このアプリを共有する');
  // 「現場メモと手がかり」の開閉の印。
  await start(page);
  const marker = () => page.locator('#clues summary').evaluate((node) => getComputedStyle(node, '::before').content);
  expect(await marker()).toBe('"▾"');
  await page.locator('#clues summary').click();
  expect(await marker()).toBe('"▸"');
  // ダイアログの左右の余白はページと同じ16px。
  await page.setViewportSize({ width: 360, height: 640 });
  await page.locator('#help').click();
  const box = await page.locator('#help-dialog').boundingBox();
  expect(Math.round(box.x)).toBe(16);
  expect(Math.round(box.width)).toBe(328);
});
