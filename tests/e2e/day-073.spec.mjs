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
    eq: audio.decks.map(d => d.eq), filter: audio.decks.map(d => d.filterValue), volume: audio.decks.map(d => d.volume),
    crossfade: audio.crossfade, echo: audio.echo, tracks: audio.decks.map(d => d.track.id),
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
  await expect(page.locator('.mobile-hud')).toBeVisible(); await expect(page.locator('#mobile-goal')).toContainText('スクラッチ');
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
  expect(decodeURIComponent(await x.getAttribute('href'))).toContain('https://rairakku.com/100days/day-073-offbeat/');
});


test('phone booths keep the record and 44px controls visible in portrait and landscape', async ({ browser }) => {
  for (const [width, height] of [[320, 568], [390, 700], [390, 844], [430, 932], [844, 390]]) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true });
    const page = await context.newPage(); await open(page);
    await expect(page.locator('body')).toHaveClass(/mobile-layout/);
    await expect(page.locator('#deck-b')).toBeHidden();
    const record = page.locator('[data-vinyl=a]');
    await expect.poll(async () => (await record.boundingBox()).width).toBeGreaterThanOrEqual(140);
    const r = await record.boundingBox(), controls = await page.locator('.performance').boundingBox();
    expect(r.y).toBeGreaterThan(0);
    expect(r.y + r.height < controls.y || r.x + r.width < controls.x, `${width} record must not overlap the controls`).toBe(true);
    for (const selector of ['#mobile-transport', '#crossfader', '[data-sample=kick]', '[data-sample=clap]', '[data-sample=hat]', '[data-sample=horn]', '[data-sync=a]', '[data-loop=a]', '#mobile-tab-a', '#mobile-tab-b', '#mobile-tab-mixer', '#library-open', '#help']) {
      const box = await page.locator(selector).boundingBox();
      expect(box, `${width} ${selector}`).toBeTruthy();
      expect(box.width, `${width} ${selector} width`).toBeGreaterThanOrEqual(44);
      expect(box.height, `${width} ${selector} height`).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.y, `${width} ${selector} top`).toBeGreaterThanOrEqual(0); expect(box.y + box.height, `${width} ${selector} bottom`).toBeLessThanOrEqual(height);
    }
    expect(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight])).toEqual([width, height]);
    await context.close();
  }
});

test('two fingers, deck switching and rotation preserve the live mix without a stuck scratch', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(); await open(page); await page.tap('#mobile-transport');
  await expect.poll(async () => (await read(page)).playing).toEqual([true, true]);
  await expect.poll(async () => (await read(page)).level).toBeGreaterThan(.001);
  const cdp = await context.newCDPSession(page);
  const r = await page.locator('[data-vinyl=a]').boundingBox(), p = await page.locator('[data-sample=kick]').boundingBox();
  const finger = { x: Math.round(r.x + r.width * .4), y: Math.round(r.y + r.height * .4), id: 1 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger] });
  await expect.poll(async () => (await read(page)).scratching[0]).toBe(true);
  finger.x += 40;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [finger] });
  // Scoring accepts distinct hits at least 120ms apart; keep the first finger held.
  await page.waitForTimeout(140);
  const beforePad = (await read(page)).score;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger, { x: Math.round(p.x + p.width / 2), y: Math.round(p.y + p.height / 2), id: 2 }] });
  await expect.poll(async () => (await read(page)).score).toBeGreaterThan(beforePad);
  expect((await read(page)).scratching[0]).toBe(true);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [finger] });
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(async () => (await read(page)).scratching).toEqual([false, false]);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await page.tap('#mobile-tab-b'); await expect(page.locator('[data-vinyl=b]')).toBeVisible();
  let state = await read(page); expect(state.playing).toEqual([true, true]); expect(state.paused).toBe(false);
  const fader = page.locator('#crossfader'), box = await fader.boundingBox();
  await fader.tap({ position: { x: box.width * .8, y: box.height / 2 } });
  const mix = (await read(page)).crossfade;
  const gains = [Math.cos(mix * Math.PI / 2), Math.sin(mix * Math.PI / 2)];
  await expect.poll(async () => (await read(page)).faders[1]).toBeCloseTo(gains[1], 3);
  await page.locator('#mobile-tab-b').focus(); await page.keyboard.press('ArrowRight');
  await expect(page.locator('#mobile-tab-mixer')).toBeFocused();
  expect((await read(page)).crossfade).toBe(mix);
  (await read(page)).faders.forEach((gain, i) => expect(gain).toBeCloseTo(gains[i], 3));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator('#deck-a')).toBeVisible(); await expect(page.locator('#deck-b')).toBeVisible();
  await expect(page.locator('.mixer-top .beat-lights')).toBeVisible(); await expect(page.locator('.performance #echo')).toBeVisible();
  state = await read(page); expect(state.playing).toEqual([true, true]); expect(state.paused).toBe(false); expect(state.crossfade).toBe(mix); state.faders.forEach((gain, i) => expect(gain).toBeCloseTo(gains[i], 3));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.tap('#mobile-tab-a'); await expect(page.locator('#mobile-beats .beat-lights')).toBeVisible();
  await expect(page.locator('#crossfader')).toHaveCount(1); await expect(page.locator('#echo')).toHaveCount(1);
  await context.close();
});

test('mobile mixer exposes both channels and choosing a record returns to its deck', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(); await open(page); await page.tap('#mobile-transport'); await page.tap('#mobile-tab-mixer');
  for (const id of ['a', 'b']) {
    for (const band of ['0', '1', '2', 'filter']) await expect(page.locator(`[data-deck=${id}][data-knob="${band}"]`)).toBeVisible();
  }
  await page.locator('[data-deck=b][data-knob="2"]').tap({ position: { x: 10, y: 28 } });
  await expect.poll(async () => (await read(page)).eq[1][2]).not.toBe(0);
  await page.locator('[data-deck=b][data-knob=filter]').tap({ position: { x: 15, y: 30 } });
  await expect.poll(async () => (await read(page)).filter[1]).toBeLessThan(.5);
  const volume = page.locator('[data-volume=b]'), box = await volume.boundingBox();
  await volume.tap({ position: { x: box.width * .25, y: box.height / 2 } });
  await expect.poll(async () => (await read(page)).volume[1]).toBeLessThan(.5);
  await page.tap('#echo'); expect((await read(page)).echo).toBe(true);
  await page.tap('#library-open'); await page.locator('[data-load=dusty][data-target=b]').tap();
  await expect(page.locator('#mobile-tab-b')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-vinyl=b]')).toBeVisible();
  expect((await read(page)).tracks[1]).toBe('dusty');
  await page.tap('#help'); await expect(page.locator('#help-dialog')).toBeVisible();
  await page.locator('#help-dialog [data-close]').first().tap(); await expect(page.locator('#help-dialog')).toBeHidden();
  await context.close();
});

test('small-phone result dialog scrolls to retry and returns to free play', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(); await open(page); await page.tap('#mode-challenge'); await page.tap('#mobile-transport');
  await expect.poll(async () => (await read(page)).playing).toEqual([true, true]);
  const showResult = () => page.evaluate(async () => { const { audio, game } = await import('/day-073-offbeat/src/app.js'); game.start('challenge', audio.now - 60); });
  // This fixture checks the scrollable result UI; the real 60s live is played separately.
  await showResult(); await expect(page.locator('#result-dialog')).toBeVisible();
  await expect(page.locator('#result-message')).toContainText('レコードを擦って');
  await page.locator('#retry').tap(); await expect(page.locator('#result-dialog')).toBeHidden();
  await expect.poll(async () => (await read(page)).playing).toEqual([true, true]);
  expect((await read(page)).counts).toEqual([0, 0, 0, 0, 0]);
  expect((await read(page)).elapsed).toBeLessThan(2);
  await showResult(); await expect(page.locator('#result-dialog')).toBeVisible();
  await page.locator('#back-free').tap(); await expect(page.locator('#result-dialog')).toBeHidden();
  await expect(page.locator('#mode-free')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await read(page)).playing).toEqual([true, true]);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await context.close();
});
