import { expect, test } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CASES, EPILOGUE, stageOf } from '../../day-071-kage-shogen/lib/cases.js';
import { judge, readingOf, suspectsOf, witnessOf } from '../../day-071-kage-shogen/lib/deduction.js';
import { hitTest, propScreenRect } from '../../day-071-kage-shogen/lib/hit.js';
import { createSession, describeAssessment, HINT_END, setLamp, useHint } from '../../day-071-kage-shogen/lib/stage.js';
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
// 色のトークン（app.css の :root）を、getComputedStyle の書き方で。
const AMBER = 'rgb(255, 184, 77)';
const LINE_STRONG = 'rgb(106, 99, 166)';
// 'rgb(…)' / 'rgba(…)' / '#rrggbb' どうしのコントラスト比（WCAG）。
function contrastRatio(a, b) {
  const channels = (color) => {
    const hex = /^#([0-9a-f]{6})$/i.exec(color.trim());
    if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16));
    return color.match(/[\d.]+/g).slice(0, 3).map(Number);
  };
  const luminance = (color) => {
    const [r, g, b] = channels(color).map((value) => {
      const c = value / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}
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
  // 夜1の灯りは135cmから始まる（正解の99cmまで、Shiftの5cm刻み7回と1cm1回）。
  expect(CASES[0].stage.lamp.start).toBe(135);
  await expect(page.locator('#lamp-readout')).toHaveAttribute('data-ly', String(CASES[0].stage.lamp.start));
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
  const down = CASES[0].stage.lamp.start - CASES[0].stage.lamp.solution;
  for (let i = 0; i < Math.floor(down / 5); i += 1) await page.keyboard.press('Shift+ArrowDown');
  for (let i = 0; i < down % 5; i += 1) await page.keyboard.press('ArrowDown');
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
  await expect(page.locator('#lamp-readout')).toHaveAttribute('data-ly', String(CASES[2].stage.lamp.start));
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
  expect(await lampValue(page)).toBe(CASES[0].stage.lamp.start);
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
  // 夜2以降は短く「ガイド（★−1）」（押したあとは「ガイドを消す」）。
  await expect(page.locator('#guide-toggle')).toHaveText('ガイド（★−1）');
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
    // 案内の「再読み込み」ボタンで、ページを読み直せる。
    const reload = page.locator('#unsupported #reload');
    await expect(reload).toBeVisible();
    await expect(reload).toHaveText('再読み込み');
    expect((await reload.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await Promise.all([page.waitForEvent('load'), reload.click()]);
    await expect(page.locator('#unsupported')).toBeVisible();
    await expect(page.locator('#case-list [data-case-id]')).toHaveCount(5);
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
  expect(await lampValue(page)).toBe(CASES[0].stage.lamp.start + 1);
  await expect.poll(() => lampValue(page)).toBeGreaterThan(152);
  await page.mouse.move(box.x - 10, box.y - 10);
  const stopped = await lampValue(page);
  await page.waitForTimeout(250);
  expect(await lampValue(page)).toBe(stopped);
  await page.mouse.up();
  expect(await lampValue(page)).toBe(stopped);
  await button.click();
  expect(await lampValue(page)).toBe(Math.min(CASES[0].stage.lamp.max, stopped + 1));
});

for (const interrupt of ['dialog', 'blur', 'hidden', 'reset', 'home']) {
  test(`${interrupt} cancels the pending solve and old timers cannot change a fresh night`, async ({ page }) => {
    await open(page);
    await start(page);
    // Apply all keystrokes and interrupt in one task, before the real 350ms hold can fire.
    const down = CASES[0].stage.lamp.start - CASES[0].stage.lamp.solution;
    await page.evaluate(({ action, coarse, fine }) => {
      const wall = document.getElementById('wall');
      for (let i = 0; i < coarse; i += 1) wall.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true, cancelable: true }));
      for (let i = 0; i < fine; i += 1) wall.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
      if (action === 'dialog') document.getElementById('help').click();
      if (action === 'blur') window.dispatchEvent(new Event('blur'));
      if (action === 'hidden') {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
      }
      if (action === 'reset') document.getElementById('reset-stage').click();
      if (action === 'home') document.getElementById('back').click();
    }, { action: interrupt, coarse: Math.floor(down / 5), fine: down % 5 });
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
    expect(await lampValue(page)).toBe(CASES[0].stage.lamp.start);
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
  // 見出しは「灯りを提げたのは、誰か。」（2行目が3字だけにならない）。
  await expect(page.locator('#deduction-title')).toHaveText('灯りを提げたのは、誰か。');
  expect(await page.locator('#deduction-clues [data-kind]').evaluateAll((nodes) => nodes.map((node) => node.dataset.kind))).toEqual(['rule', 'stool', 'alibi', 'result']);
  // 夜4の踏み台の手がかりは、式を書かずに事実だけ。
  await expect(page.locator('#deduction-clues [data-kind="stool"] .clue-text')).toHaveText('犯人は、20cmの踏み台の上に立って灯りを提げた。');
  const exclude = page.locator('[data-suspect-id="kiritani"] .exclude');
  await expect(exclude).toHaveText('外す ✕');
  await exclude.click();
  await expect(exclude).toHaveAttribute('aria-pressed', 'true');
  await expect(exclude).toHaveText('✕ 外した（戻す）');
  // 外した人も薄くしない（肩書き・証言の文字はそのまま読める濃さ）。
  expect(await page.locator('[data-suspect-id="kiritani"]').evaluate((card) => getComputedStyle(card).opacity)).toBe('1');
  // 外した人の「この人だ」は枠だけのボタン（琥珀の塗りと影なし、文字はカードの地に対して4.5:1以上）。押せるまま。
  const look = (selector) => page.locator(selector).evaluate((node) => {
    const style = getComputedStyle(node);
    return { background: style.backgroundColor, color: style.color, border: style.borderTopColor, shadow: style.boxShadow };
  });
  const subdued = await look('[data-suspect-id="kiritani"] .accuse');
  expect(subdued.background).toBe('rgba(0, 0, 0, 0)');
  expect(subdued.shadow).toBe('none');
  const cardBackground = await page.locator('[data-suspect-id="kiritani"]').evaluate((card) => getComputedStyle(card).backgroundColor);
  expect(contrastRatio(subdued.color, cardBackground)).toBeGreaterThanOrEqual(4.5);
  expect((await look('[data-suspect-id="saeki"] .accuse')).background).toBe(AMBER);
  await expect(page.locator('[data-suspect-id="kiritani"] .accuse')).toBeEnabled();
  // 「✕ 外した（戻す）」の枠は、ほかの「外す ✕」と同じ色（押せる部品の枠 --line-strong）。
  expect((await look('[data-suspect-id="kiritani"] .exclude')).border).toBe(LINE_STRONG);
  expect((await look('[data-suspect-id="saeki"] .exclude')).border).toBe(LINE_STRONG);
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
// 要素の箱（注記の内側の span など）の矩形は数えない：文字の行とは上端がずれ、1行多く数えてしまう。
const textLines = (page, selector) => page.locator(selector).evaluate((node) => {
  const tops = [];
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    const range = document.createRange();
    range.selectNodeContents(text);
    for (const rect of range.getClientRects()) if (rect.width > 0) tops.push(rect.top);
  }
  tops.sort((a, b) => a - b);
  return tops.reduce((lines, top) => (lines.length && top - lines[lines.length - 1] < 6 ? lines : [...lines, top]), []).length;
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
    expect(await lampValue(page)).toBeLessThan(CASES[0].stage.lamp.start);
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
    // 判子（傾いた外形）は、ヘッダと下の見出しから12px以上離れる。
    let clearance = await stampClearance(page, '#verdict-panel', '#verdict-title');
    expect(clearance.above, 'verdict stamp above').toBeGreaterThanOrEqual(12);
    expect(clearance.below, 'verdict stamp below').toBeGreaterThanOrEqual(12);
    await page.locator('#next-case').click();
    await expectPhase(page, 'epilogue');
    await page.waitForTimeout(1100);
    await page.evaluate(() => window.scrollTo(0, 0));
    clearance = await stampClearance(page, '#epilogue-panel', '#epilogue-panel > .eyebrow');
    expect(clearance.above, 'epilogue stamp above').toBeGreaterThanOrEqual(12);
    expect(clearance.below, 'epilogue stamp below').toBeGreaterThanOrEqual(12);
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

test('night three shows two suspects of the matching height, and only the alibi tells them apart', async ({ page }) => {
  await open(page, { unlocked: 4 });
  // 同じ身長の2人を、アリバイだけで分けるのは夜3だけ（夜5は小数まで計算して分ける。下の試験）。
  for (const index of [2]) {
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

test('night five: the alibi rules out 188cm, and the decimal reading of 108cm separates 178cm from 180cm', async ({ page }) => {
  await open(page, { unlocked: 4 });
  const caseDef = CASES[4];
  await start(page, 4);
  await reproduce(page, 4);
  await page.locator('#to-deduction').click();
  await expectPhase(page, 'deduction');
  await expect(page.locator('#deduction-clues [data-kind="result"] .clue-text')).toHaveText(readingOf(caseDef));
  expect(await page.locator('#suspect-list .suspect-meta').allTextContents()).toEqual(['書生・178cm', '大工・180cm', '郵便配達・188cm']);
  // 蓮見（188cm）はアリバイで外れる。
  const alibi = caseDef.clues.find((clue) => clue.kind === 'alibi');
  expect(alibi.rulesOut).toEqual(['hasumi']);
  await page.locator('[data-suspect-id="hasumi"] .accuse').click();
  await expect(page.locator('[data-suspect-id="hasumi"] #deduction-message')).toContainText(alibi.text);
  // 日向（178cm）は、6割が106.8cm（小数1桁）で、再現した108cmと合わない。
  await page.locator('[data-suspect-id="hinata"] .accuse').click();
  await expect(page.locator('[data-suspect-id="hinata"] #deduction-message')).toHaveText(judge(caseDef, 'hinata').message);
  await expect(page.locator('[data-suspect-id="hinata"] #deduction-message')).toContainText('身長178cmの6割は106.8cm。再現した灯りは108cmで、合わない。');
  await expectPhase(page, 'deduction');
  await page.locator('[data-suspect-id="hiiragi"] .accuse').click();
  await expectPhase(page, 'verdict');
  await expect(page.locator('#verdict-stars')).toContainText('星2つ（誤った推理があった）');
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
    // 「全文を読む」は枠付きの小さなピル（見た目の高さ36px以上）。
    expect((await page.locator('#strip-toggle .strip-pill').boundingBox()).height).toBeGreaterThanOrEqual(36);
    if (height <= 700) {
      // 高さ700px以下：閉じているあいだは引用を隠し、スケッチを小さく（72×54）。スケッチは小さくても描く。
      await expect(quote).toBeHidden();
      const sketch = await page.locator('#sketch').boundingBox();
      expect(Math.round(sketch.width)).toBe(72);
      expect(Math.round(sketch.height)).toBe(54);
    } else {
      expect(await quote.evaluate((node) => node.scrollHeight > node.clientHeight + 1), 'clamped while closed').toBe(true);
    }
    await expect.poll(() => page.locator('#sketch').evaluate((canvas) => {
      const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      let ink = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] < 240) ink += 1;
      return ink;
    }), 'the sketch silhouette is drawn').toBeGreaterThan(20);
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

// 「ヒント／ガイド／はじめから」が1段に並んでいるか（3つの上端が同じ）。
const assistOneRow = (page) => page.evaluate(() => new Set(['hint', 'guide-toggle', 'reset-stage']
  .map((id) => Math.round(document.getElementById(id).getBoundingClientRect().top))).size === 1);

test('360×640: every night shows the nudges whole (8px clear of the bottom on nights 1–4) and the hint, guide and reset row; 390×844 keeps that row on one line', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await open(page, { unlocked: 4 });
  const bottom = async (selector) => {
    const box = await page.locator(selector).boundingBox();
    return box.y + box.height;
  };
  for (let index = 0; index < CASES.length; index += 1) {
    const night = `night ${index + 1}`;
    await page.locator(`[data-case-id="${CASES[index].id}"]`).click();
    await expectPhase(page, 'briefing');
    expect(await bottom('#start-case'), `briefing ${index + 1}`).toBeLessThanOrEqual(640);
    // 幅560px未満の導入では、スケッチをカードの中央に置く（左に寄って右が空かない）。
    expect(Math.abs(await centerX(page, '#sketch-brief') - await centerX(page, '#briefing-panel .witness-card')), `briefing sketch ${night}`).toBeLessThanOrEqual(1);
    await page.locator('#start-case').click();
    await expectPhase(page, 'stage');
    expect(await scrollY(page)).toBe(0);
    // 題は見た目から隠すが、読み上げ用に残す（stage の見出し）。
    await expect(page.locator('#stage-title')).toHaveText(`第${index + 1}夜　${CASES[index].title}`);
    expect((await page.locator('#stage-title').boundingBox()).height).toBeLessThanOrEqual(1);
    for (const selector of ['#wall', '#band-text', '#note-text', '#item-select']) expect(await bottom(selector), `${selector} ${night}`).toBeLessThanOrEqual(640);
    // 「下げる/上げる」は全部見える（夜1〜4は下端から8px以上離れる）。
    for (const selector of ['#nudge-minus', '#nudge-plus']) {
      const box = await page.locator(selector).boundingBox();
      expect(box.y, `${selector} ${night}`).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height, `${selector} ${night}`).toBeLessThanOrEqual(index < 4 ? 632 : 640);
    }
    // 「ヒント／ガイド／はじめから」の行も最初の画面に入り、1段に並ぶ。
    for (const selector of ['#hint', '#guide-toggle', '#reset-stage']) expect(await bottom(selector), `${selector} ${night}`).toBeLessThanOrEqual(640);
    expect(await assistOneRow(page), `assist row ${night}`).toBe(true);
    // 注記の欄は2行分の高さで固定（幅360で2行に収まる）。
    expect(await textLines(page, '#note-text'), `note ${night}`).toBeLessThanOrEqual(2);
    // 道具のチップは1段（段が増えない）。続きがあれば右端をぼかす。
    const chips = await page.locator('#item-select').evaluate((row) => ({
      tops: new Set([...row.children].map((chip) => Math.round(chip.offsetTop))).size,
      more: row.dataset.more, overflow: row.scrollWidth > row.clientWidth + 1,
    }));
    expect(chips.tops, `chips ${night}`).toBe(1);
    expect(chips.more, `chips ${night}`).toBe(chips.overflow ? 'right' : '');
    await page.locator('#back').click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (let index = 0; index < CASES.length; index += 1) {
    await start(page, index);
    expect(await scrollY(page)).toBe(0);
    for (const selector of ['#hint', '#guide-toggle', '#reset-stage']) expect(await bottom(selector), `${selector} night ${index + 1}`).toBeLessThanOrEqual(844);
    // 夜2以降は「ガイド（★−1）」。押す前・ヒントのあと・ガイドを付けたあとも1段のまま。
    await expect(page.locator('#guide-toggle')).toHaveText(index === 0 ? 'ガイドを消す' : 'ガイド（★−1）');
    expect(await assistOneRow(page), `assist row night ${index + 1}`).toBe(true);
    await page.locator('#hint').click();
    await expect(page.locator('#hint')).toHaveText('次のヒント');
    expect(await assistOneRow(page), `assist row after a hint, night ${index + 1}`).toBe(true);
    await page.locator('#guide-toggle').click();
    expect(await assistOneRow(page), `assist row after the guide, night ${index + 1}`).toBe(true);
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
    // ほかの理由の文も、「近い」「あと少し」と並べて1行に収まる（app.js と同じ組み方で、文だけ差し替えて測る）。
    const fits = await page.locator('#band-text').evaluate((node, details) => {
      const saved = [...node.childNodes];
      const result = [];
      for (const label of ['近い', 'あと少し']) {
        for (const detail of details) {
          const span = document.createElement('span');
          span.className = 'band-detail';
          span.textContent = `（${detail}）`;
          node.replaceChildren(label, span);
          result.push({ text: node.textContent, fits: node.scrollWidth <= node.clientWidth });
        }
      }
      node.replaceChildren(...saved);
      return result;
    }, ['関係ない道具の影が残っている', '灯りの高さがずれている', '道具の横位置がずれている', 'ずれている道具がある']);
    expect(fits.filter((item) => !item.fits)).toEqual([]);
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

// ---- 改修2（第2周の評価の指摘）の回帰防止 ----

// 判子（傾いた外形）と、上のヘッダ・下の見出しとのあいだ。
const stampClearance = (page, panel, next) => page.evaluate(([panelSelector, nextSelector]) => {
  const header = document.querySelector('.app-header').getBoundingClientRect();
  const stamp = document.querySelector(`${panelSelector} .stamp`).getBoundingClientRect();
  const below = document.querySelector(nextSelector).getBoundingClientRect();
  return { above: stamp.top - header.bottom, below: below.top - stamp.bottom };
}, [panel, next]);
// 要素の中心の x。
const centerX = (page, selector) => page.locator(selector).evaluate((node) => {
  const rect = node.getBoundingClientRect();
  return (rect.left + rect.right) / 2;
});

test('hints go from the worst offset to each line of the night, then an unnumbered end, and never repeat a line', async ({ page }) => {
  await open(page, { unlocked: 1 });
  await start(page, 1);
  const caseDef = CASES[1];
  expect(caseDef.hints).toHaveLength(2);
  const model = createSession(caseDef);
  const expected = [useHint(model), useHint(model), useHint(model)];
  expect(expected.map((hint) => hint.kind)).toEqual(['diagnosis', 'principle', 'principle']);
  for (const hint of expected) {
    await page.locator('#hint').click();
    const line = `ヒント${hint.index + 1}：${hint.text}`;
    await expect(page.locator('#note-text')).toHaveText(line);
    await expect(page.locator('#note-text .note-tag')).toHaveText(`ヒント${hint.index + 1}：`);
    await expect(page.locator('#feedback')).toHaveText(line);
  }
  expect(new Set(expected.map((hint) => hint.text)).size).toBe(3);
  expect(expected.slice(1).map((hint) => hint.text)).toEqual(caseDef.hints);
  // 出し尽くしたら「ここまで」。番号（ヒントN：）を付けない。何度押しても同じ。
  for (let i = 0; i < 2; i += 1) {
    expect(useHint(model).kind).toBe('end');
    await page.locator('#hint').click();
    await expect(page.locator('#note-text')).toHaveText(HINT_END);
    await expect(page.locator('#note-text')).toHaveAttribute('data-kind', 'hint');
    await expect(page.locator('#note-text .note-tag')).toHaveCount(0);
    await expect(page.locator('#feedback')).toHaveText(HINT_END);
  }
  // 配置が変わって名指しの文が替わったら、また名指しを先に出す（番号は押した回数の続き）。
  await moveTo(page, 'lamp', 88);
  await expectPhase(page, 'stage');
  setLamp(model, 88);
  const renamed = useHint(model);
  expect(renamed.kind).toBe('diagnosis');
  expect(expected.map((hint) => hint.text)).not.toContain(renamed.text);
  await page.locator('#hint').click();
  await expect(page.locator('#note-text')).toHaveText(`ヒント${renamed.index + 1}：${renamed.text}`);
});

test('night one guide is practice: turning it off and on again and again still ends with three stars', async ({ page }) => {
  await open(page);
  await start(page);
  await expect(page.locator('#guide-toggle')).toHaveText('ガイドを消す');
  for (let i = 0; i < 5; i += 1) await page.locator('#guide-toggle').click();
  await expect(page.locator('#guide-toggle')).toHaveText('ガイドを重ねる');
  await expect(page.locator('#feedback')).not.toHaveText('ガイドを使ったので、この夜の星が1つ減ります');
  // 出て入り直しても、練習のガイドは使用に数えない。
  await page.locator('#back').click();
  await start(page);
  await page.locator('#guide-toggle').click();
  await page.locator('#guide-toggle').click();
  await reproduce(page);
  await finish(page);
  await expect(page.locator('#verdict-stars')).toContainText('星3つ（ガイド・ヒント・誤答なし）');
});

test('a guide used on night four still costs its star after leaving and re-entering, until the night is solved', async ({ page }) => {
  await open(page, { unlocked: 3 });
  await start(page, 3);
  await page.locator('#guide-toggle').click();
  await expect(page.locator('#feedback')).toHaveText('ガイドを使ったので、この夜の星が1つ減ります');
  await page.locator('#back').click();
  await expectPhase(page, 'home');
  await start(page, 3);
  // 画面は初めから（ガイドは消えた状態、注記はその夜の一言）。使ったことは覚えている。
  await expect(page.locator('#guide-toggle')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#note-text')).toHaveText(CASES[3].coach);
  await reproduce(page, 3);
  await finish(page, 3);
  await expect(page.locator('#verdict-stars')).toContainText('星2つ（ガイドを使った）');
  // 解決したら使用歴は消える：遊び直すと、補助なしで星3つ。
  await page.locator('#to-home').click();
  await start(page, 3);
  await reproduce(page, 3);
  await finish(page, 3);
  await expect(page.locator('#verdict-stars')).toContainText('星3つ（ガイド・ヒント・誤答なし）');
});

test('hints, a wrong answer and the deduction hint are kept across leaving the night, and a replay after solving starts fresh', async ({ page }) => {
  await open(page, { unlocked: 1 });
  const caseDef = CASES[1];
  await start(page, 1);
  const [first, second] = startHints(1);
  await page.locator('#hint').click();
  await expect(page.locator('#note-text')).toHaveText(`ヒント1：${first.text}`);
  await page.locator('#back').click();
  await start(page, 1);
  // 入り直すと注記はその夜の一言に戻るが、ボタンは「次のヒント」のまま。出した文はくり返さない。
  await expect(page.locator('#note-text')).toHaveText(caseDef.coach);
  await expect(page.locator('#hint')).toHaveText('次のヒント');
  await page.locator('#hint').click();
  await expect(page.locator('#note-text')).toHaveText(`ヒント2：${second.text}`);
  await reproduce(page, 1);
  await page.locator('#to-deduction').click();
  await page.locator('#deduction-hint').click();
  await expect(page.locator('#deduction-hint-text')).toHaveText(caseDef.deductionHint);
  const wrong = suspectsOf(caseDef).find((suspect) => suspect.id !== caseDef.culprit);
  await page.locator(`[data-suspect-id="${wrong.id}"] .accuse`).click();
  await expect(page.locator('#deduction-message')).toBeVisible();
  // 推理の途中で事件簿へ戻り、もう一度入る。
  await page.locator('#back').click();
  await start(page, 1);
  await reproduce(page, 1);
  await page.locator('#to-deduction').click();
  await expect(page.locator('#deduction-hint')).toBeDisabled();
  await expect(page.locator('#deduction-hint-text')).toHaveText(caseDef.deductionHint);
  await page.locator(`[data-suspect-id="${caseDef.culprit}"] .accuse`).click();
  await expectPhase(page, 'verdict');
  await expect(page.locator('#verdict-stars')).toContainText('星1つ（ヒントを使った・誤った推理があった）');
  // 解決したあとは、遊び直すと補助なしから。
  await page.locator('#to-home').click();
  await start(page, 1);
  await expect(page.locator('#hint')).toHaveText('ヒント（★−1）');
  await expect(page.locator('#guide-toggle')).toHaveText('ガイド（★−1）');
  await reproduce(page, 1);
  await page.locator('#to-deduction').click();
  await expect(page.locator('#deduction-hint')).toBeEnabled();
  await expect(page.locator('#deduction-hint-text')).toBeHidden();
  await page.locator(`[data-suspect-id="${caseDef.culprit}"] .accuse`).click();
  await expect(page.locator('#verdict-stars')).toContainText('星3つ（ガイド・ヒント・誤答なし）');
});

test('resetting progress also forgets the aids used on an unsolved night', async ({ page }) => {
  await open(page);
  await start(page);
  await page.locator('#hint').click();
  await expect(page.locator('#hint')).toHaveText('次のヒント');
  await page.locator('#back').click();
  await page.locator('#reset-progress').click();
  await page.locator('#reset-confirm').click();
  await expect(page.locator('#reset-dialog')).toBeHidden();
  await start(page);
  await expect(page.locator('#hint')).toHaveText('ヒント（★−1）');
  await reproduce(page);
  await finish(page);
  await expect(page.locator('#verdict-stars')).toContainText('星3つ（ガイド・ヒント・誤答なし）');
});

for (const reducedMotion of ['reduce', 'no-preference']) {
  test(`390×844 night one (${reducedMotion}): the deduction hint answer scrolls into view below its button`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await open(page);
    await start(page);
    await reproduce(page);
    await page.locator('#to-deduction').click();
    await expectPhase(page, 'deduction');
    // ボタンが画面の下端に来る位置までスクロールし、スクロールせずに押す（答えはボタンの下＝画面の外に出る）。
    await page.locator('#deduction-hint').evaluate((button) => {
      window.scrollTo(0, Math.max(0, button.getBoundingClientRect().bottom + window.scrollY - window.innerHeight));
      button.click();
    });
    // 答えの下端が画面の下端より上（小数の位置の丸めに1px残す）。
    const inView = async () => {
      const box = await page.locator('#deduction-hint-text').boundingBox();
      return box !== null && box.y >= 0 && box.y + box.height <= 844 + 1;
    };
    if (reducedMotion === 'reduce') expect(await inView(), 'instantly').toBe(true);
    else await expect.poll(inView).toBe(true);
    await expect(page.locator('#deduction-hint-text')).toHaveText(CASES[0].deductionHint);
  });
}

for (const width of [360, 390]) {
  test(`width ${width}: the verdict reasons break only between reasons, never inside one`, async ({ page }) => {
    await page.setViewportSize({ width, height: HEIGHTS[width] });
    await open(page, { unlocked: 1 });
    await start(page, 1);
    await page.locator('#guide-toggle').click();
    await page.locator('#hint').click();
    await reproduce(page, 1);
    await page.locator('#to-deduction').click();
    const wrong = suspectsOf(CASES[1]).find((suspect) => suspect.id !== CASES[1].culprit);
    await page.locator(`[data-suspect-id="${wrong.id}"] .accuse`).click();
    await page.locator(`[data-suspect-id="${CASES[1].culprit}"] .accuse`).click();
    await expectPhase(page, 'verdict');
    await expect(page.locator('#verdict-stars .stars-reason')).toHaveText('星1つ（ガイドを使った・ヒントを使った・誤った推理があった）');
    // 理由は1つずつ折り返さない範囲。
    await expect(page.locator('#verdict-stars .stars-reason > .nb')).toHaveText(['星1つ', 'ガイドを使った', 'ヒントを使った', '誤った推理があった']);
    // 折り返しは「・」のあとか「（」の前だけ。
    const breaks = await page.locator('#verdict-stars .stars-reason').evaluate((node) => {
      const chars = [];
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        for (let i = 0; i < text.data.length; i += 1) {
          const range = document.createRange();
          range.setStart(text, i);
          range.setEnd(text, i + 1);
          const rect = range.getClientRects()[0];
          if (rect) chars.push({ ch: text.data[i], top: rect.top, height: rect.height });
        }
      }
      const found = [];
      for (let k = 1; k < chars.length; k += 1) {
        if (chars[k].top >= chars[k - 1].top + chars[k - 1].height / 2) found.push(`${chars[k - 1].ch}｜${chars[k].ch}`);
      }
      return found;
    });
    expect(breaks.length, 'the reasons wrap at this width').toBeGreaterThan(0);
    for (const item of breaks) expect(item.startsWith('・') || item.endsWith('（'), item).toBe(true);
  });
}

test('arrow keys on the axis that cannot move explain it for four seconds, without covering a hint', async ({ page }) => {
  await open(page, { unlocked: 2 });
  const note = page.locator('#note-text');
  // 夜1（灯りだけ）：←→。
  await start(page, 0);
  await expect(page.locator('#feedback')).toHaveText(startLabel(0));
  await page.keyboard.press('ArrowLeft');
  await expect(note).toHaveText('灯りは上下だけ動きます。↑↓キーで動かそう。');
  await expect(note).toHaveAttribute('data-kind', 'notice');
  expect(await lampValue(page)).toBe(CASES[0].stage.lamp.start);
  await page.locator('#back').click();
  // 夜3：灯りを選んだまま←→。
  await start(page, 2);
  await expect(page.locator('#feedback')).toHaveText(startLabel(2));
  await page.keyboard.press('ArrowRight');
  const lampLine = '灯りは上下だけ動きます。道具は、選ぶ札（←→キー）から選べます。';
  await expect(note).toHaveText(lampLine);
  await expect(note).toHaveAttribute('data-kind', 'notice');
  await expect(page.locator('#feedback')).toHaveText(lampLine);
  expect(await lampValue(page)).toBe(CASES[2].stage.lamp.start);
  // 4秒たつと、その夜の一言へ戻る。
  await expect(note).toHaveText(CASES[2].coach, { timeout: 6000 });
  await expect(note).toHaveAttribute('data-kind', 'coach');
  // 道具を選んでいて↑↓。
  await page.locator('#item-select [data-item="hat"]').click();
  await page.locator('#wall').focus();
  await page.keyboard.press('ArrowUp');
  const propLine = '道具は左右だけ動きます。灯りは、選ぶ札から選べます。';
  await expect(note).toHaveText(propLine);
  await expect(page.locator('#feedback')).toHaveText(propLine);
  await expect(page.locator('#item-readout')).toHaveText(`帽子 横 ${CASES[2].stage.props.find((prop) => prop.id === 'hat').x.start}cm`);
  // ヒントが出ているときは、ヒントの文を消さない（読み上げだけ）。
  await page.locator('#hint').click();
  await expect(note).toHaveAttribute('data-kind', 'hint');
  const hintLine = await note.textContent();
  await page.locator('#wall').focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#feedback')).toHaveText(propLine);
  await expect(note).toHaveText(hintLine);
  await expect(note).toHaveAttribute('data-kind', 'hint');
});

test('width 360: clue cards keep 8px gaps, put the label above a full-width text, and keep testimony, footprints and the stool within three lines', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 360, height: 640 });
  await open(page, { unlocked: 4 });
  const cards = (selector) => page.locator(selector).evaluate((list) => {
    const items = [...list.children];
    return items.map((item, index) => {
      const card = item.getBoundingClientRect();
      const label = item.querySelector('.clue-kind').getBoundingClientRect();
      const text = item.querySelector('.clue-text');
      const box = text.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(text);
      const tops = [...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => rect.top).sort((a, b) => a - b);
      const lines = tops.reduce((acc, top) => (acc.length && top - acc[acc.length - 1] < 6 ? acc : [...acc, top]), []).length;
      return {
        kind: item.dataset.kind, lines, labelAbove: label.bottom <= box.top + 0.5,
        gap: index ? card.top - items[index - 1].getBoundingClientRect().bottom : 8,
        inset: Math.max(box.left - card.left, card.right - box.right),
      };
    });
  });
  const check = (list, label) => {
    for (const card of list) {
      expect(Math.abs(card.gap - 8), `${label} ${card.kind} gap`).toBeLessThanOrEqual(0.5);
      expect(card.labelAbove, `${label} ${card.kind} label above`).toBe(true);
      expect(card.inset, `${label} ${card.kind} text spans the card`).toBeLessThanOrEqual(12);
      if (['witness', 'footprint', 'stool'].includes(card.kind)) expect(card.lines, `${label} ${card.kind} lines`).toBeLessThanOrEqual(3);
    }
  };
  for (let index = 0; index < CASES.length; index += 1) {
    await start(page, index);
    await page.locator('#clues').evaluate((details) => { details.open = true; });
    check(await cards('#stage-clues'), `stage ${index + 1}`);
    await reproduce(page, index);
    await page.locator('#to-deduction').click();
    await expectPhase(page, 'deduction');
    check(await cards('#deduction-clues'), `deduction ${index + 1}`);
    await page.locator('#back').click();
  }
});

for (const [width, height] of [[768, 1024], [1440, 900]]) {
  test(`width ${width}: home, briefing, stage, solved and deduction start at the header's left edge; verdict and epilogue stay centred with clear stamps`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, { unlocked: 4 });
    const left = (selector) => page.locator(selector).evaluate((node) => node.getBoundingClientRect().left);
    const header = await left('.app-header');
    const firsts = { home: await left('#home-panel > .eyebrow') };
    await page.locator('[data-case-id="umbrella"]').click();
    firsts.briefing = await left('#briefing-place');
    await page.locator('#start-case').click();
    await expectPhase(page, 'stage');
    firsts.stage = await left('#stage-title');
    await reproduce(page, 4);
    firsts.solved = await left('#solved-panel > .eyebrow');
    await page.locator('#to-deduction').click();
    await expectPhase(page, 'deduction');
    firsts.deduction = await left('#deduction-panel > .eyebrow');
    for (const [name, x] of Object.entries(firsts)) expect(Math.abs(x - header), name).toBeLessThanOrEqual(1);
    // 読む列は右側だけを絞る（680px）。
    expect(Math.round((await page.locator('#deduction-panel').boundingBox()).width)).toBeLessThanOrEqual(680);
    await page.locator(`[data-suspect-id="${CASES[4].culprit}"] .accuse`).click();
    await expectPhase(page, 'verdict');
    const middle = await centerX(page, '#app');
    for (const selector of ['#verdict-panel .stamp', '#verdict-title', '#verdict-stars .stars', '#verdict-panel .verdict-actions']) {
      expect(Math.abs(await centerX(page, selector) - middle), selector).toBeLessThanOrEqual(1);
    }
    let clearance = await stampClearance(page, '#verdict-panel', '#verdict-title');
    expect(clearance.above).toBeGreaterThanOrEqual(12);
    expect(clearance.below).toBeGreaterThanOrEqual(12);
    await page.locator('#next-case').click();
    await expectPhase(page, 'epilogue');
    for (const selector of ['#epilogue-panel .stamp', '#epilogue-title', '#epilogue-panel .verdict-actions']) {
      expect(Math.abs(await centerX(page, selector) - middle), selector).toBeLessThanOrEqual(1);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    clearance = await stampClearance(page, '#epilogue-panel', '#epilogue-panel > .eyebrow');
    expect(clearance.above).toBeGreaterThanOrEqual(12);
    expect(clearance.below).toBeGreaterThanOrEqual(12);
  });
}

test('the lock line stays on one line from 720px, and the next night reads はじめる → in a 36px pill', async ({ page }) => {
  await open(page);
  const lockLines = () => page.locator('[data-case-id="hat"] .lock-note').evaluate((note) => {
    const text = [...note.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
    const range = document.createRange();
    range.selectNodeContents(text);
    const tops = [...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => rect.top).sort((a, b) => a - b);
    return tops.reduce((acc, top) => (acc.length && top - acc[acc.length - 1] < 6 ? acc : [...acc, top]), []).length;
  });
  for (const width of [720, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await lockLines(), `width ${width}`).toBe(1);
  }
  const pill = await page.locator('[data-case-id="rack"] .next-label').evaluate((node) => ({ height: node.getBoundingClientRect().height, size: getComputedStyle(node).fontSize }));
  expect(pill.height).toBeGreaterThanOrEqual(36);
  expect(pill.size).toBe('14px');
});

test('pressable parts use the strong outline, the pressed guide is amber, and small controls are real bordered buttons', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await open(page, { unlocked: 2 });
  const look = (selector) => page.locator(selector).first().evaluate((node) => {
    const style = getComputedStyle(node);
    return { border: style.borderTopColor, width: style.borderTopWidth, background: style.backgroundColor, height: node.getBoundingClientRect().height };
  });
  // 事件簿：「進行をリセット」は枠付きの補助ボタン（44px）。ヘッダの丸ボタンも同じ枠。
  for (const selector of ['#reset-progress', '#help', '#share-open']) {
    const item = await look(selector);
    expect(item.border, selector).toBe(LINE_STRONG);
    expect(item.width, selector).toBe('1px');
    expect(item.height, selector).toBeGreaterThanOrEqual(44);
  }
  // 壁の目盛りの色は、紙の壁に対して4.5:1以上（--ruler。目盛りの線も同じ色）。
  const tokens = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return { ruler: root.getPropertyValue('--ruler').trim(), wall: root.getPropertyValue('--wall').trim() };
  });
  expect(tokens.ruler.toLowerCase()).toBe('#6b4f2a');
  expect(contrastRatio(tokens.ruler, tokens.wall)).toBeGreaterThanOrEqual(4.5);
  await start(page, 0);
  // 夜1は最初からガイドが重なっている：「ガイドを消す」は琥珀の枠と薄い琥珀の面（朱は使わない）。
  const guide = await look('#guide-toggle');
  await expect(page.locator('#guide-toggle')).toHaveAttribute('aria-pressed', 'true');
  expect(guide.border).toBe(AMBER);
  expect(guide.background).toBe('rgba(255, 184, 77, 0.16)');
  for (const selector of ['#hint', '#reset-stage', '#nudge-minus', '#nudge-plus']) {
    const item = await look(selector);
    expect(item.border, selector).toBe(LINE_STRONG);
    expect(item.height, selector).toBeGreaterThanOrEqual(44);
  }
  // 注記の文は、高さ固定の欄の縦の中央（1行でも2行でも）。
  const centred = () => page.locator('#note-text').evaluate((note) => {
    const outer = note.getBoundingClientRect();
    const inner = note.querySelector('.note-body').getBoundingClientRect();
    return Math.abs((outer.top + outer.bottom) / 2 - (inner.top + inner.bottom) / 2);
  });
  expect(await centred()).toBeLessThanOrEqual(1);
  // 「次のヒント」は見た目はそのまま、2回目以降は星が減らないことを title と読み上げで伝える。
  await page.locator('#hint').click();
  await expect(page.locator('#hint')).toHaveText('次のヒント');
  await expect(page.locator('#hint')).toHaveAttribute('title', 'ヒントは最初の1回で星が1つ減ります。2回目以降は追加で減りません');
  await expect(page.locator('#hint')).toHaveAttribute('aria-label', '次のヒント。ヒントは最初の1回で星が1つ減ります。2回目以降は追加で減りません');
  expect(await centred()).toBeLessThanOrEqual(1);
  await page.locator('#back').click();
  await start(page, 2);
  // 選んでいないチップの枠も --line-strong。
  expect((await look('#item-select .chip[aria-checked="false"]')).border).toBe(LINE_STRONG);
  expect(await centred()).toBeLessThanOrEqual(1);
});

test('dialogs: share buttons match the secondary buttons, the note is muted, the URL shows whole at 360, and help fits or says it continues', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await open(page);
  await page.locator('#share-open').click();
  await expect(page.locator('#share-dialog')).toBeVisible();
  const buttons = await page.locator('#share .share__button').evaluateAll((nodes) => nodes.map((node) => {
    const style = getComputedStyle(node);
    return { name: node.textContent.trim(), border: style.borderTopColor, width: style.borderTopWidth, height: node.getBoundingClientRect().height };
  }));
  expect(buttons.length).toBeGreaterThanOrEqual(3);
  for (const button of buttons) {
    expect(button.border, button.name).toBe(LINE_STRONG);
    expect(button.width, button.name).toBe('1px');
    expect(button.height, button.name).toBeGreaterThanOrEqual(44);
  }
  const note = await page.locator('#share .share__note').evaluate((node) => ({ color: getComputedStyle(node).color, opacity: getComputedStyle(node).opacity }));
  const muted = await page.locator('#share-dialog .dialog-note').first().evaluate((node) => getComputedStyle(node).color);
  expect(note).toEqual({ color: muted, opacity: '1' });
  // URL 欄は折り返して全部見せる（値・readonly・ID はそのまま）。
  const url = page.locator('#share-url');
  await expect(url).toHaveValue(CANONICAL);
  await expect(url).toHaveAttribute('readonly', '');
  expect(await url.evaluate((node) => node.scrollWidth <= node.clientWidth && node.scrollHeight <= node.clientHeight + 1)).toBe(true);
  await page.locator('#share-dialog [data-close]').click();
  // 遊び方は 360×640 で最後の段落まで入る。入らないときは「↓ 続きがあります」を出す。
  await page.locator('#help').click();
  const help = await page.locator('#help-dialog').evaluate((dialog) => ({
    overflow: dialog.scrollHeight - dialog.clientHeight,
    more: !dialog.querySelector('.more-hint').hidden,
    last: [...dialog.querySelectorAll('.dialog-note')].at(-1).getBoundingClientRect().bottom,
  }));
  if (help.overflow > 8) expect(help.more).toBe(true);
  else {
    expect(help.more).toBe(false);
    expect(help.last).toBeLessThanOrEqual(640);
  }
  await page.locator('#help-dialog [data-close]').click();
  // 低い画面では、続きの印が出て、最後までスクロールすると消える。
  await page.setViewportSize({ width: 360, height: 480 });
  await page.locator('#help').click();
  await expect(page.locator('#help-dialog .more-hint')).toBeVisible();
  await expect(page.locator('#help-dialog .more-hint')).toHaveText('↓ 続きがあります');
  await page.locator('#help-dialog').evaluate((dialog) => { dialog.scrollTop = dialog.scrollHeight; });
  await expect(page.locator('#help-dialog .more-hint')).toBeHidden();
  await page.locator('#help-dialog [data-close]').click();
  await expect(page.locator('#help')).toBeFocused();
});

test('the help dialog explains that a raised lamp lowers the shadow and that the night one guide is free', async ({ page }) => {
  await open(page);
  await page.locator('#help').click();
  await expect(page.locator('#help-dialog .help-rules li').nth(1)).toContainText('灯りを上げると影は下がり、下げると影は上がります。');
  await expect(page.locator('#help-dialog .dialog-note').last()).toHaveText('ガイド・ヒント・誤った推理を使うと、星が減ります。夜1のガイドは練習用なので、何度出し入れしても減りません。');
});

for (const [width, height] of [[640, 360], [844, 390], [1440, 900]]) {
  test(`${width}×${height}: hint, guide and reset stay on one line inside their column whatever the labels say`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await open(page, { unlocked: 4 });
    const row = () => page.evaluate(() => {
      const box = document.querySelector('#stage-panel .assist-row').getBoundingClientRect();
      const buttons = ['hint', 'guide-toggle', 'reset-stage'].map((id) => document.getElementById(id).getBoundingClientRect());
      return {
        oneRow: new Set(buttons.map((rect) => Math.round(rect.top))).size === 1,
        inside: buttons.every((rect) => rect.left >= box.left - 0.5 && rect.right <= box.right + 0.5),
        tall: buttons.every((rect) => rect.height >= 44),
      };
    });
    for (const index of [0, 4]) {
      await start(page, index);
      // 押す前／ヒントのあと／ガイドを付けたあと／外したあと（文言が替わっても、段と位置が変わらない）。
      const states = [await row()];
      await page.locator('#hint').click();
      states.push(await row());
      await page.locator('#guide-toggle').click();
      states.push(await row());
      await page.locator('#guide-toggle').click();
      states.push(await row());
      for (const [i, state] of states.entries()) expect(state, `night ${index + 1} state ${i}`).toEqual({ oneRow: true, inside: true, tall: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.locator('#back').click();
    }
  });
}
