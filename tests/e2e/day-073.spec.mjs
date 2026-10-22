import { expect, test } from '@playwright/test';

const base = '/day-073-offbeat/';
const read = page => page.evaluate(async () => {
  const { audio, game } = await import('/day-073-offbeat/src/app.js');
  return {
    context: audio.context?.state ?? null, now: audio.now, level: audio.level(),
    playing: audio.decks.map(d => d.playing), scratching: audio.decks.map(d => d.scratching),
    reversed: audio.decks.map(d => d.source?.reversed ?? false),
    bpm: audio.decks.map(d => d.bpm), phase: audio.decks.map(d => audio.phase(d.id)),
    faders: audio.decks.map(d => d.fader?.gain.value),
    loop: audio.decks.map(d => ({ on: d.loop, position: audio.position(d.id), start: d.loopStart, end: d.loopEnd })),
    score: game.score, counts: game.counts, paused: game.paused, elapsed: game.elapsed(audio.now),
    echo: audio.echo, tracks: audio.decks.map(d => d.track.id),
  };
});
async function open(page) { await page.goto(new URL(base, test.info().project.use.baseURL).href); await expect(page.locator('[data-vinyl=a]')).toBeVisible(); }
async function start(page) { await page.locator('#session-start').click(); await expect.poll(async () => (await read(page)).playing).toEqual([true, true]); }

test('first gesture starts real audio; keys work after the start button and Space freezes both clocks', async ({ page }) => {
  await open(page); expect((await read(page)).context).toBeNull();
  await start(page); expect((await read(page)).playing).toEqual([true, true]);
  await expect.poll(async () => (await read(page)).level).toBeGreaterThan(.001);
  await page.keyboard.press('s'); await expect.poll(async () => (await read(page)).score).toBeGreaterThan(0);
  await expect.poll(async () => (await read(page)).scratching[0]).toBe(false);
  await page.keyboard.press('Space'); await expect.poll(async () => (await read(page)).paused).toBe(true);
  const now = (await read(page)).now; await page.waitForTimeout(180); expect((await read(page)).now).toBe(now);
  await page.keyboard.press('Space'); await expect.poll(async () => (await read(page)).paused).toBe(false);
});

test('pointer scratch reverses real playback and releases the needle', async ({ page }) => {
  await open(page); await start(page);
  const box = await page.locator('[data-vinyl=a]').boundingBox(), x = box.x + box.width * .45, y = box.y + box.height * .35;
  await page.mouse.move(x, y); await page.mouse.down();
  await expect.poll(async () => (await read(page)).scratching[0]).toBe(true);
  await page.mouse.move(x + 50, y, { steps: 8 }); expect((await read(page)).reversed[0]).toBe(false);
  await page.mouse.move(x - 35, y, { steps: 10 }); expect((await read(page)).reversed[0]).toBe(true);
  await page.mouse.up(); expect((await read(page)).scratching).toEqual([false, false]);
  expect((await read(page)).playing).toEqual([true, true]);
});

test('crossfader, tempo sync and four-beat loop affect the real audio engine', async ({ page }) => {
  await open(page); await start(page);
  const fader = page.locator('#crossfader'); await fader.focus(); await fader.press('End');
  await expect.poll(async () => (await read(page)).faders[0]).toBeLessThan(.001);
  await expect.poll(async () => (await read(page)).faders[1]).toBeGreaterThan(.99);
  await page.locator('[data-sync=b]').click(); let s = await read(page); expect(s.bpm[0]).toBe(s.bpm[1]);
  const error = Math.abs(s.phase[0] - s.phase[1]); expect(Math.min(error, 1 - error)).toBeLessThan(.03);
  await page.locator('[data-loop=b]').click(); await page.waitForTimeout(2300); s = await read(page);
  expect(s.loop[1].on).toBe(true); expect(s.loop[1].position).toBeGreaterThanOrEqual(s.loop[1].start);
  expect(s.loop[1].position).toBeLessThan(s.loop[1].end);
  await page.locator('[data-loop=b]').click(); expect((await read(page)).loop[1].on).toBe(false);
});

test('samplers, echo, mute and changing a record stay usable', async ({ page }) => {
  await open(page); await start(page);
  for (const kind of ['kick', 'clap', 'hat', 'horn']) { await page.locator(`[data-sample=${kind}]`).click(); await page.waitForTimeout(140); }
  expect((await read(page)).score).toBeGreaterThan(0);
  await page.locator('#echo').click(); expect((await read(page)).echo).toBe(true);
  await page.locator('#mute').click(); await expect.poll(async () => (await read(page)).level).toBeLessThan(.0001);
  await page.locator('#mute').click();
  await page.locator('#library-open').click(); await page.locator('[data-load=dusty][data-target=a]').click();
  expect((await read(page)).tracks[0]).toBe('dusty'); expect((await read(page)).playing[0]).toBe(false);
  await page.locator('#help').click(); for (let i = 0; i < 7; i++) await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement.closest('dialog')?.id)).toBe('help-dialog');
  await page.keyboard.press('Escape'); await expect(page.locator('#help-dialog')).not.toBeVisible();
});

test('slow audio start and immediate retry do not lose the first scratch', async ({ page }) => {
  await page.addInitScript(() => {
    const resume = AudioContext.prototype.resume;
    AudioContext.prototype.resume = function () { return resume.call(this).then(() => new Promise(resolve => setTimeout(resolve, 250))); };
  });
  await open(page); await page.locator('#mode-challenge').click(); await page.locator('#session-start').click(); await page.keyboard.press('s');
  await expect.poll(async () => (await read(page)).counts[0]).toBe(1);
  // A result-state fixture keeps this regression fast; the real 60s flow is also played before publication.
  await page.evaluate(async () => { const { audio, game } = await import('/day-073-offbeat/src/app.js'); game.start('challenge', audio.now - 60); });
  await expect(page.locator('#result-dialog')).toBeVisible(); await page.locator('#retry').click(); await page.keyboard.press('s');
  await expect.poll(async () => (await read(page)).counts[0]).toBe(1);
});

test('touch scratches cancel cleanly and the mobile performance HUD stays on screen', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(); await open(page); await page.tap('#mobile-transport');
  await expect.poll(async () => (await read(page)).context).toBe('running');
  await page.waitForTimeout(400);
  const box = await page.locator('[data-vinyl=a]').boundingBox(), x = Math.round(box.x + box.width * .4), y = Math.round(box.y + box.height * .3);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await expect.poll(async () => (await read(page)).scratching[0]).toBe(true);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 50, y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  expect((await read(page)).scratching).toEqual([false, false]);
  await expect(page.locator('.mobile-hud')).toBeVisible(); await expect(page.locator('#mobile-goal')).toContainText('ミックス');
  const fader = await page.locator('#crossfader').boundingBox(); expect(fader.y).toBeGreaterThan(600); expect(fader.y).toBeLessThan(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await context.close();
});

test('all controls fit 390, 768 and 1440px and shared links use the published URL', async ({ page }) => {
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 }); await open(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
  await page.getByRole('button', { name: 'このアプリを共有する', exact: true }).click();
  await expect(page.locator('.share')).toHaveCount(1);
  const x = page.locator('.share').getByRole('link', { name: 'Xで投稿' });
  expect(decodeURIComponent(await x.getAttribute('href'))).toContain('https://hundred-days.pages.dev/day-073-offbeat/');
});
