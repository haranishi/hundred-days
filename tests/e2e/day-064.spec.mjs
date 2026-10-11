import { test, expect } from '@playwright/test';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const evidence = fileURLToPath(new URL(`../../docs/day064/verification/${process.env.DAY064_EVIDENCE_DIR || 'purpose-ui'}/`, import.meta.url));
const unit = (page, value) => page.locator(`#unit-tabs [data-unit="${value}"]`);
async function analysis(page, view) {
  const button = page.locator(`#view-${view}`);
  if (!await button.isVisible()) await page.locator('#analysis-menu summary').click();
  await button.click();
}
async function chooseUnit(page, value) {
  if (!await unit(page, value).isVisible()) await analysis(page, 'compare');
  await unit(page, value).click();
}
async function selectFilter(page, field, value) {
  const select = page.locator(`#${field}`);
  if (!await select.isVisible()) await page.locator('#open-explorer').click();
  await select.selectOption(value);
  await page.locator('#apply-filters').click();
}
async function charts(page) {
  if (!await page.locator('#overview-charts').evaluate(element => element.open)) await page.locator('#overview-charts summary').click();
}
async function reset(page) {
  await page.locator('#active-filters [data-reset-all]').click();
}
async function ready(page, url = './') {
  const target = new URL(url, 'http://127.0.0.1:5464/day-064-breach-atlas/');
  target.searchParams.set('view','timeline');
  await page.goto(target.href);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#timeline-view')).toHaveAttribute('aria-busy', 'false');
}
async function settled(page) { await expect(page.locator('#timeline-view')).toHaveAttribute('aria-busy', 'false'); }
async function chooseRecord(page, id) {
  const selector = await page.locator('#timeline-view').isVisible() ? '.incident-card' : await page.locator('#comparison-view').isVisible() ? '.compare-row' : '.company-item';
  if (selector === '.company-item' && !await page.locator('#explorer').isVisible()) await page.locator('#open-explorer').click();
  await page.locator(id ? `${selector}[data-incident-id="${id}"]` : selector).first().click();
}
await mkdir(evidence, { recursive: true });

async function readyGlobe(page) {
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-view', 'globe');
  await expect(page.locator('#globe-stage')).toHaveAttribute('data-rendered', 'true');
}

test('record details show media copyright and official-source processing credits', async ({ page }) => {
  for (const [id, credit] of [
    ['jp-notice-20261008-e7758e6fd1fb', '出典・著作権：サイバーセキュリティ.com'],
    ['kddi-isp-mail-2026', '出典：個人情報保護委員会'],
    ['ipa-narrative-2024-08-a63843c0', '出典：IPA'],
  ]) {
    await ready(page, `?incident=${id}`);
    await expect(page.locator('.source-credit')).toContainText(credit);
    await expect(page.locator('.source-shortcut')).toHaveAttribute('href', /^https:\/\//);
  }
});

test('ten-stage globe exploration @experience', async ({ page }) => {
  test.setTimeout(370000);
  const started = Date.now(), stages = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await readyGlobe(page);
  async function stage(name, action) {
    await action(); await page.waitForTimeout(200);
    await page.screenshot({ path: `${evidence}/globe-experience-${String(stages.length + 1).padStart(2,'0')}.png`, fullPage: true });
    const snapshot = await page.evaluate(() => ({ summary: document.querySelector('#globe-summary').textContent, count: document.querySelector('#visible-count').textContent, selected: document.querySelector('.note-company')?.textContent || null, location: document.querySelector('#globe-location').value, renderer: document.querySelector('#globe-stage').dataset.renderer, source: document.querySelector('.source-shortcut')?.getAttribute('href') || null }));
    stages.push({ name, elapsedSeconds: Number(((Date.now() - started) / 1000).toFixed(1)), ...snapshot });
    await writeFile(`${evidence}/globe-experience.json`, JSON.stringify({ asOf: '2026-10-12', method: 'Automated real Chromium operations with scenes held for primary-agent image and source review; self-review, not a user study.', elapsedSeconds: Number(((Date.now() - started) / 1000).toFixed(1)), stages, errors, completed: false }, null, 2) + '\n');
    console.log(`Globe experience ${stages.length}/10: ${name}`);
    await page.waitForTimeout(30000);
  }
  await stage('全記録と未特定地域の定義', async () => {
    await expect(page.locator('#globe-summary')).toHaveText('18,001記録 / 92地域 · 国単位 2,324');
    await expect(page.locator('#globe-definition')).toContainText('地域の代表点');
  });
  await stage('日本と地域未特定の記録', async () => {
    await page.locator('[data-region="japan"]').click(); await expect(page.locator('#visible-count')).toContainText('4,652記録');
    await page.locator('#globe-location').selectOption('JP'); await expect(page.locator('#visible-count')).toContainText('2,301記録');
  });
  await stage('東京都から組織名の根拠と原資料へ', async () => {
    await page.locator('#globe-location').selectOption('JP-13'); await expect(page.locator('#visible-count')).toContainText('55記録');
    await page.locator('.globe-record').nth(1).click(); await expect(page.locator('.geographic-note')).toContainText('組織名に明記された都道府県');
  });
  await stage('3Dの回転と拡大縮小', async () => {
    await page.locator('#globe-mount canvas').focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowUp');
    await page.keyboard.press('+'); await page.locator('#globe-zoom-out').click(); await page.locator('#globe-fit').click();
    await expect(page.locator('#visible-count')).toContainText('55記録');
  });
  await stage('平面地図の実際の地域点を選択', async () => {
    await page.locator('#globe-2d').click(); await expect(page.locator('#globe-stage')).toHaveAttribute('data-renderer','svg');
    await page.locator('.flat-point[data-geo-code="JP-13"]').click({ force: true });
    await page.locator('#globe-mount svg').focus(); await page.keyboard.press('+'); await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#visible-count')).toContainText('55記録');
  });
  await stage('2014年の記録を原因と企業名で探す', async () => {
    await page.locator('[data-region="japan"]').click();
    await page.locator('#globe-year').evaluate(element => { element.value = '2014'; element.dispatchEvent(new Event('input', { bubbles: true })); });
    await expect(page.locator('#period')).toHaveValue('2014');
    await page.locator('.globe-legend summary').click();await page.locator('#globe-causes [data-cause="insider"]').click(); await page.locator('#quick-search').fill('ベネッセ');
    await expect(page.locator('.globe-record')).not.toHaveCount(0); await page.locator('.globe-record').first().click();
    await expect(page.locator('.source-shortcut')).toHaveAttribute('href', /benesse/);
  });
  await stage('過去資料の年代再生と停止', async () => {
    await page.locator('#quick-search').fill(''); await page.locator('#globe-play').click();
    await expect(page.locator('#period')).toHaveValue('2015'); await page.locator('#globe-play').click();
    await expect(page.locator('#globe-play')).toHaveAttribute('aria-pressed','false');
  });
  await stage('California通知州とHHS報告州の違い', async () => {
    await page.locator('#active-filters [data-reset-all]').click(); await selectFilter(page, 'registry', 'california');
    await page.locator('#globe-location').selectOption('US-CA'); await expect(page.locator('#visible-count')).toContainText('5,336記録');
    await expect(page.locator('.geographic-note')).toContainText('Californiaの通知対象の州');
    await selectFilter(page, 'registry', 'hhs'); await page.locator('#globe-location').selectOption('US-CA');
    await expect(page.locator('.geographic-note')).toContainText('HHSへ報告された組織の州・地域');
  });
  await stage('スマホで企業検索から原資料・地図へ戻る', async () => {
    await page.locator('#active-filters [data-reset-all]').click(); await page.setViewportSize({ width:390, height:844 }); await page.emulateMedia({ reducedMotion:'reduce' });
    await page.locator('#quick-search').fill('ＫＤＤＩ'); await expect(page.locator('.globe-record')).toHaveCount(3);
    await page.locator('.globe-record[data-incident-id="kddi-dion-2006"]').click(); await expect(page.locator('.note-company')).toBeInViewport();
    await expect(page.locator('.note-scale-exact')).toContainText('3,996,789');
    await page.locator('#back-to-records').click(); await expect(page.locator('#view-globe')).toBeInViewport();
  });
  await stage('ゼロ件から復帰し収録の範囲を確認', async () => {
    await page.locator('#quick-search').fill('未収録zx997'); await expect(page.locator('#globe-empty')).toBeVisible();
    await page.locator('#active-filters [data-reset-all]').click(); await expect(page.locator('#globe-summary')).toContainText('18,001記録');
    await page.locator('#open-coverage').click(); await expect(page.locator('#coverage-content')).toContainText('4,652'); await page.keyboard.press('Escape');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
  expect(errors).toEqual([]); expect(Date.now() - started).toBeGreaterThanOrEqual(300000);
  await writeFile(`${evidence}/globe-experience.json`, JSON.stringify({ asOf:'2026-10-12', method:'Automated real Chromium operations with primary-agent screenshot and source-note self-review; not an independent evaluation or a user study.', elapsedSeconds:Number(((Date.now() - started) / 1000).toFixed(1)), stages, errors, completed:true }, null, 2) + '\n');
});

test('geographic globe accounts for the whole archive and Tokyo selection reaches the source', async ({ page }) => {
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (new URL(request.url()).hostname !== '127.0.0.1') external.push(request.url()); });
  await readyGlobe(page);
  await expect(page.locator('html')).toHaveAttribute('data-engine', 'rust-wasm-worker');
  await expect(page.locator('#globe-stage')).toHaveAttribute('data-renderer', 'webgl');
  await expect(page.locator('#globe-summary')).toHaveText('18,001記録 / 92地域 · 国単位 2,324');
  await expect(page.locator('.flat-point')).toHaveCount(92);
  await expect(page.locator('.globe-record')).toHaveCount(24);
  await page.locator('#globe-location').selectOption('JP-13');
  await expect(page.locator('#visible-count')).toContainText('55記録');
  await expect(page.locator('#location')).toHaveValue('JP-13');
  await expect(page.locator('.geographic-note')).toContainText('組織名に明記された都道府県');
  await expect(page.locator('.geographic-note')).toContainText('東京都');
  await expect(page.locator('.source-shortcut')).toHaveAttribute('href', await page.locator('.source-link').first().getAttribute('href'));
  await page.locator('.globe-record').nth(1).click();
  await expect(page.locator('.globe-record').nth(1)).toHaveAttribute('aria-current', 'true');
  await page.locator('#view-timeline').click();
  await expect(page.locator('#visible-count')).toContainText('55記録');
  await expect(page.locator('.incident-card')).toHaveCount(24);
  await page.locator('[data-reset-all]').click();
  await expect(page.locator('#visible-count')).toContainText('18,001記録');
  expect(errors).toEqual([]); expect(external).toEqual([]);
});

test('globe labels, keyboard controls and actual WebGL loss preserve geographic browsing', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await readyGlobe(page);
  await page.locator('.globe-point-label[data-geo-code="JP"]').click();
  await expect(page.locator('#globe-location')).toHaveValue('JP');
  await expect(page.locator('#visible-count')).toContainText('2,301記録');
  const canvas = page.locator('#globe-mount canvas'); await canvas.focus();
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('+');
  await page.locator('#globe-fit').click(); await canvas.focus();
  const lost = await canvas.evaluate(element => {
    const extension = element.getContext('webgl2')?.getExtension('WEBGL_lose_context');
    if (!extension) return false; extension.loseContext(); return true;
  });
  expect(lost).toBe(true);
  await expect(page.locator('#globe-stage')).toHaveAttribute('data-renderer', 'svg');
  await expect(page.locator('#globe-3d')).toBeDisabled();
  await expect(page.locator('#globe-mount svg')).toBeFocused();
  const before = await page.locator('#globe-mount svg').getAttribute('viewBox');
  await page.keyboard.press('+'); await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#globe-mount svg')).not.toHaveAttribute('viewBox', before);
  await expect(page.locator('#visible-count')).toContainText('2,301記録');
  await page.screenshot({ path: `${evidence}/globe-context-loss.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test('flat geographic points, drag and pinch retain distinct notification and reported-state evidence', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) { return String(type).startsWith('webgl') ? null : original.call(this, type, ...args); };
  });
  await readyGlobe(page);
  await expect(page.locator('#globe-stage')).toHaveAttribute('data-renderer', 'svg');
  await expect(page.locator('#globe-3d')).toBeDisabled();
  await page.locator('.flat-point[data-geo-code="US-CA"]').click({ force: true });
  await expect(page.locator('#globe-location')).toHaveValue('US-CA');
  await selectFilter(page, 'registry', 'california');
  await page.locator('#globe-location').selectOption('US-CA');
  await expect(page.locator('#visible-count')).toContainText('5,336記録');
  await expect(page.locator('.geographic-note')).toContainText('Californiaの通知対象の州');
  await selectFilter(page, 'registry', 'hhs');
  await page.locator('#globe-location').selectOption('US-CA');
  await settled(page);
  await expect(page.locator('#active-filters [data-clear-filter="location"]')).toBeVisible();
  await expect(page.locator('.geographic-note')).toContainText('HHSへ報告された組織の州・地域');
  const svg = page.locator('#globe-mount svg');
  await svg.scrollIntoViewIfNeeded();
  const bounds = await svg.boundingBox(), before = await svg.getAttribute('viewBox');
  await page.mouse.move(bounds.x + bounds.width * .4, bounds.y + bounds.height * .6);
  await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width * .55, bounds.y + bounds.height * .6, { steps: 4 }); await page.mouse.up();
  await expect(svg).not.toHaveAttribute('viewBox', before);
  const dragged = await svg.getAttribute('viewBox');
  await svg.evaluate(element => {
    // Two touch pointers exercise the same handler without requiring a physical device.
    const originalCapture = element.setPointerCapture; element.setPointerCapture = () => {};
    const fire = (type, pointerId, x) => element.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId, pointerType: 'touch', clientX: x, clientY: 100 }));
    fire('pointerdown', 41, 100); fire('pointerdown', 42, 180); fire('pointermove', 42, 250);
    fire('pointerup', 41, 100); fire('pointerup', 42, 250); element.setPointerCapture = originalCapture;
  });
  await expect(svg).not.toHaveAttribute('viewBox', dragged);
  await page.locator('#globe-fit').click();
  await expect(svg).toHaveAttribute('viewBox', '0 0 1000 500');
  await page.screenshot({ path: `${evidence}/globe-flat-fallback.png`, fullPage: true });
});

test('historical year playback has explicit start, stop, reset and reduced-motion idle behavior', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await readyGlobe(page);
  const canvas = page.locator('#globe-mount canvas');
  const first = await canvas.screenshot(); await page.waitForTimeout(250);
  expect(await canvas.screenshot()).toEqual(first);
  await page.locator('#globe-year').focus(); await page.keyboard.press('Home');
  await expect(page.locator('#period')).toHaveValue('2000');
  await expect(page.locator('#globe-year-label')).toHaveText('2000年');
  await page.locator('#globe-year').evaluate(element => { element.value = '2014'; element.dispatchEvent(new Event('input', { bubbles: true })); });
  await expect(page.locator('#period')).toHaveValue('2014');
  await page.locator('#globe-play').click();
  await expect(page.locator('#period')).toHaveValue('2015');
  await expect(page.locator('#globe-play')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#globe-play').click();
  await page.waitForTimeout(1450); await expect(page.locator('#period')).toHaveValue('2015');
  await page.locator('#globe-all-years').click();
  await expect(page.locator('#visible-count')).toContainText('18,001記録');
  await expect(page.locator('#globe-year')).toHaveValue('2026');
  await page.locator('#globe-play').click(); await page.locator('#view-timeline').click();
  await expect(page.locator('#globe-play')).toHaveAttribute('aria-pressed', 'false');
});

test('failed globe land download offers a retry while records and sources remain usable', async ({ page }) => {
  await page.route('**/data/map-land.json', route => route.abort());
  await page.goto('./'); await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#retry-globe')).toBeVisible();
  await expect(page.locator('.globe-record')).toHaveCount(24);
  await page.locator('#quick-search').fill('KDDI'); await expect(page.locator('.globe-record')).toHaveCount(3);
  await page.locator('.globe-record').last().click(); await expect(page.locator('.source-shortcut')).toHaveAttribute('href', /kddi/);
  await page.unroute('**/data/map-land.json'); await page.locator('#retry-globe').click();
  await expect(page.locator('#globe-stage')).toHaveAttribute('data-rendered', 'true');
  await expect(page.locator('#globe-error')).toBeHidden();
  await expect(page.locator('#globe-summary')).toHaveText('3記録 / 1地域 · 国単位 3');
});

test('globe screens expose legible controls, counts and sources across desktop, tablet and phones', async ({ page }) => {
  for (const [name, width, height] of [['desktop', 1440, 1000], ['tablet', 768, 1100], ['mobile', 390, 1000], ['small', 375, 844], ['landscape', 844, 390]]) {
    await page.setViewportSize({ width, height }); await readyGlobe(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('#quick-search')).toBeVisible(); await expect(page.locator('#globe-location')).toBeVisible();
    await expect(page.locator('#globe-2d')).toBeVisible(); await expect(page.locator('#globe-play')).toBeVisible();
    await page.screenshot({ path: `${evidence}/globe-${name}.png`, fullPage: true });
    if (width === 390) {
      await page.locator('#globe-location').selectOption('JP-13');
      await expect(page.locator('.globe-record')).toHaveCount(24);
      await page.locator('.globe-record').first().click();
      await expect(page.locator('.note-company')).toBeInViewport();
      await page.locator('#back-to-records').click();
      await expect(page.locator('#view-globe')).toBeInViewport();
      await page.screenshot({ path: `${evidence}/globe-mobile-tokyo.png`, fullPage: true });
    }
  }
});

test('18,001 actual records load with Rust/Wasm, a bounded page, and no eager 3D', async ({ page }) => {
  const errors = [], paths = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { const url = new URL(request.url()); paths.push(url.pathname); if (url.hostname !== '127.0.0.1') external.push(url.origin); });
  await ready(page);
  await expect(page.locator('html')).toHaveAttribute('data-engine', 'rust-wasm-worker');
  await expect(page.locator('#total-incidents')).toHaveText('18,001');
  await charts(page);
  const yearA = page.locator('#year-chart [data-year="2020"]'), yearB = page.locator('#year-chart [data-year="2023"]');
  const countA = Number((await yearA.locator('.year-count').textContent()).replaceAll(',', ''));
  const countB = Number((await yearB.locator('.year-count').textContent()).replaceAll(',', ''));
  const heightA = (await yearA.locator('.year-bar').boundingBox()).height, heightB = (await yearB.locator('.year-bar').boundingBox()).height;
  expect(heightA / heightB).toBeCloseTo(countA / countB, 2);
  await expect(page.locator('.company-item')).toHaveCount(24);
  await expect(page.locator('.incident-card')).toHaveCount(24);
  await expect(page.locator('#page-range')).toHaveText('1–24 / 18,001');
  expect(paths.some(path => path.includes('graph-'))).toBe(false);
  expect(paths.some(path => path.endsWith('/incidents.json'))).toBe(false);
  expect(paths.filter(path => path.includes('/data/details/')).length).toBe(1);
  expect(errors).toEqual([]); expect(external).toEqual([]);
  await page.locator('#page-next').click();
  await expect(page.locator('#page-range')).toHaveText('25–48 / 18,001');
  await expect(page.locator('.incident-card')).toHaveCount(24);
  await page.locator('#page-last').click();
  await expect(page.locator('#page-range')).toHaveText('18,001–18,001 / 18,001');
  await expect(page.locator('.incident-card')).toHaveCount(1);
  await expect(page.locator('#page-next')).toBeDisabled();
});

test('screens at desktop, tablet and mobile show the new archive and selected source', async ({ page }) => {
  await mkdir(evidence, { recursive: true });
  for (const [name, width, height] of [['wide', 1920, 1080], ['desktop', 1440, 1000], ['tablet', 768, 1100], ['mobile', 390, 1000]]) {
    await page.setViewportSize({ width, height }); await ready(page);
    await expect(page.locator('.note-company')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${evidence}/history-${name}.png`, fullPage: true });
    await page.locator('[data-region="japan"]').click();
    await expect(page.locator('#visible-count')).toContainText('4,652記録');
    await page.locator('#view-timeline').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${evidence}/history-${name}-japan.png`, fullPage: true });
  }
});

test('regions, years and causes link to the same searchable history', async ({ page }) => {
  await ready(page); await page.locator('[data-region="japan"]').click();
  await expect(page.locator('#visible-count')).toContainText('4,652記録');
  await charts(page);
  await page.locator('#year-chart [data-year="2014"]').click();
  await expect(page.locator('#period')).toHaveValue('2014');
  await expect(page.locator('#year-chart [data-year="2014"]')).toHaveAttribute('aria-pressed','true');
  await page.locator('#cause-chart [data-cause="insider"]').click();
  await expect(page.locator('#cause')).toHaveValue('insider');
  await expect(page.locator('.incident-card[data-incident-id="benesse-customer-2014"]')).toBeVisible();
  await page.locator('.incident-card[data-incident-id="benesse-customer-2014"]').click();
  await expect(page.locator('.note-scale-exact')).toContainText('2,895万');
  await expect(page.locator('.source-link').first()).toHaveAttribute('href',/benesse/);
});

test('fullwidth search retains all three KDDI incidents and correct source units', async ({ page }) => {
  await ready(page); await page.locator('[data-region="japan"]').click();
  await page.locator('#quick-search').fill('ＫＤＤＩ');
  await expect(page.locator('.company-item')).toHaveCount(3);
  await expect(page.locator('#list-count')).toHaveText('3記録');
  await chooseRecord(page, 'kddi-isp-mail-2026');
  await expect(page.locator('.note-scale-exact')).toHaveText('12,231,954人');
  await expect(page.locator('[data-other-id]')).toHaveCount(2);
  await chooseUnit(page, 'records');
  await expect(page.locator('#comparison-content')).toContainText('この単位の記録はありません');
  await expect(unit(page,'people').locator('span')).toHaveText('3');
  await chooseUnit(page, 'people'); await expect(page.locator('.company-item')).toHaveCount(3);
  await chooseRecord(page, 'kddi-dion-2006');
  await expect(page.locator('.note-scale-exact')).toContainText('3,996,789');
});

test('service aliases lead to revised corporate sources; unknown totals stay unknown', async ({ page }) => {
  await ready(page); await page.locator('#quick-search').fill('Ｐｌａｌａ');
  await expect(page.locator('.company-item')).toHaveCount(1);
  await chooseRecord(page);
  await expect(page.locator('.note-scale-exact')).toHaveText('約596万件');
  await expect(page.locator('.count-note')).toContainText('約529万件から約596万件へ訂正');
  await expect(page.locator('.source-link').first()).toHaveAttribute('href','https://www.docomo.ne.jp/info/notice/page/230721_00_m.html');
  await page.locator('#quick-search').fill('リゾートトラスト');
  await expect(page.locator('.company-item')).toHaveCount(2); await chooseRecord(page,'resorttrust-web-2026');
  await expect(page.locator('.note-scale')).toHaveText('合計不明');
  await expect(page.locator('.count-note')).toContainText('全体の規模は不明');
  await expect(page.locator('.count-note')).not.toContainText('value');
});

test('same-unit proportional comparison and government-notice definitions remain explicit', async ({ page }) => {
  await ready(page); await analysis(page, 'compare');
  await expect(page.locator('#comparison-content')).toContainText('同じ単位の数字');
  await page.locator('#comparison-content [data-unit="people"]').click();
  await expect(page.locator('.compare-row')).toHaveCount(24);
  await expect(page.locator('#comparison-description')).toContainText('人数');
  await selectFilter(page, 'registry', 'hhs');
  await expect(page.locator('#visible-count')).toContainText('8,012記録');
  await expect(page.locator('[data-region="us"]')).toHaveAttribute('aria-pressed','true');
  await page.locator('.compare-row').first().click();
  await expect(page.locator('.status-badge')).toContainText('当局への届出');
  await expect(page.locator('.note-scale-exact')).toContainText('届出に記載された対象人数');
  await expect(page.locator('.record-details')).toContainText('Hacking/IT Incident');
  const widths = await page.locator('.compare-fill').evaluateAll(elements => elements.map(element => parseFloat(element.parentElement.parentElement.style.getPropertyValue('--scale-width'))));
  expect(widths[0]).toBe(100); expect(widths.at(-1)).toBeLessThanOrEqual(widths[0]);
  await page.screenshot({ path: `${evidence}/history-comparison.png`, fullPage:true });
  await chooseUnit(page, 'unknown'); await expect(page.locator('#comparison-content')).toContainText('同じ単位の数字');
});

test('CA notices preserve report dates, original breach dates and no guessed victim counts', async ({ page }) => {
  await ready(page); await selectFilter(page, 'registry', 'california');
  await expect(page.locator('#visible-count')).toContainText('5,336記録');
  await chooseRecord(page);
  await expect(page.locator('.note-scale')).toHaveText('合計不明');
  await expect(page.locator('.note-dates')).toContainText('当局への届出日');
  await expect(page.locator('#note-content')).toContainText('台帳記載の発生日');
  await expect(page.locator('.count-note')).toContainText('対象人数・原因・流出確定を推定しません');
});

test('dataset coverage accounts for every register export and its exclusions', async ({ page }) => {
  await ready(page); await page.locator('#open-coverage').click();
  await expect(page.locator('#coverage-dialog')).toBeVisible();
  await expect(page.locator('.coverage-table')).toHaveCount(8);
  await expect(page.locator('.coverage-heading').filter({ hasText: '横浜市' })).toContainText('66資料');
  await expect(page.locator('.coverage-heading').filter({ hasText: 'さいたま市' })).toContainText('29資料');
  await expect(page.locator('#coverage-content')).toContainText('5,350');
  await expect(page.locator('#coverage-content')).toContainText('7,261');
  await expect(page.locator('#coverage-content')).toContainText('重複14行');
  const table = page.locator('.coverage-table').filter({hasText:'2016年度'});
  await expect(table).toContainText('25');
  await page.keyboard.press('Escape'); await expect(page.locator('#open-coverage')).toBeFocused();
});

test('lazy 3D is capped; actual context loss recovers focus, selection and exploration', async ({ page }) => {
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await ready(page); await analysis(page, 'map');
  await expect(page.locator('#graph-stage')).toHaveAttribute('data-renderer','webgl');
  await expect(page.locator('#graph-stage')).toHaveAttribute('data-rendered','true');
  await expect(page.locator('.node-label')).toHaveCount(120);
  await expect(page.locator('#map-scale-note')).toContainText('120 / 18,001');
  await page.locator('#quick-search').fill('ＫＤＤＩ'); await expect(page.locator('.company-item')).toHaveCount(3);
  await expect(page.locator('.node-label')).toHaveCount(3);
  await chooseRecord(page, 'kddi-dion-2006');
  await expect(page.locator('.note-scale-exact')).toContainText('3,996,789');
  const canvas=page.locator('#graph-mount canvas'); await canvas.focus();
  const lost=await canvas.evaluate(element=>{const gl=element.getContext('webgl2');const extension=gl?.getExtension('WEBGL_lose_context');if(!extension)return false;extension.loseContext();return true;});
  expect(lost).toBe(true);
  await expect(page.locator('#graph-stage')).toHaveAttribute('data-renderer','svg');
  await expect(page.locator('#mode-3d')).toBeDisabled();
  await expect(page.locator('#graph-mount svg')).toBeFocused();
  await expect(page).toHaveURL(/incident=kddi-dion-2006/);
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('+'); await page.locator('#fit-map').click();
  await page.locator('#quick-search').fill('ぷらら');await expect(page.locator('.company-item')).toHaveCount(1);
  await chooseRecord(page);await expect(page.locator('.note-company')).toHaveText('NTTドコモ');
  await expect(page.locator('.source-link').first()).toHaveAttribute('href',/docomo\.ne\.jp/);
  await page.screenshot({path:`${evidence}/history-context-loss.png`,fullPage:true});expect(errors).toEqual([]);
});

test('Wasm download failure keeps identical searchable records in the Worker', async ({page})=>{
  await page.route('**/engine/search.wasm',route=>route.abort());await ready(page);
  await expect(page.locator('html')).toHaveAttribute('data-engine','js-worker');
  await page.locator('#quick-search').fill('ＫＤＤＩ');await expect(page.locator('.company-item')).toHaveCount(3);
});

test('Worker startup failure preserves browsing with the main-thread fallback',async({page})=>{
  await page.route('**/assets/search.worker-*.js',route=>route.abort());await ready(page);
  await expect(page.locator('html')).toHaveAttribute('data-engine','js-main');
  await page.locator('#quick-search').fill('ぷらら');await expect(page.locator('.company-item')).toHaveCount(1);
});

test('failed detail loads offer a working retry without losing the index',async({page})=>{
  await page.route('**/data/details/0.json',route=>route.abort());await ready(page);
  await expect(page.locator('#retry-detail')).toBeVisible();
  await page.unroute('**/data/details/0.json');await page.locator('#retry-detail').click();
  await expect(page.locator('.note-scale')).toBeVisible();await expect(page.locator('.source-link')).not.toHaveCount(0);
});

test('mobile keyboard drawer, focus trap, dialogs and reduced motion remain usable',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await ready(page);
  await page.keyboard.press('/');await expect(page.locator('#search')).toBeFocused();
  await expect(page.locator('#explorer')).toHaveAttribute('aria-modal','true');
  await expect(page.locator('.overview')).toHaveAttribute('inert','');
  await page.locator('#search').fill('ＫＤＤＩ');await expect(page.locator('.company-item')).toHaveCount(3);
  await page.locator('#close-explorer').focus();await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#apply-filters')).toBeFocused();
  await page.keyboard.press('Escape');await expect(page.locator('.overview')).not.toHaveAttribute('inert','');
  await page.locator('#open-explorer').click();await page.locator('.company-item').first().click();
  await expect(page.locator('.note-company')).toBeInViewport();
  await page.locator('#open-method').click();await expect(page.locator('#method-dialog')).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.locator('#open-method')).toBeFocused();
});

test('deep links find old records and sharing omits search and filter state',async({page})=>{
  await ready(page,'./?incident=kddi-dion-2006&q=private-search#private-note');
  await expect(page.locator('.note-scale-exact')).toContainText('3,996,789');
  await expect(page.locator('.incident-card[data-incident-id="kddi-dion-2006"]')).toBeVisible();
  await page.evaluate(()=>{Object.defineProperty(navigator,'share',{value:undefined,configurable:true});Object.defineProperty(navigator,'clipboard',{value:undefined,configurable:true});});
  await page.locator('#copy-link').click();await expect(page.locator('#share-dialog')).toBeVisible();
  const url=new URL(await page.locator('#share-link').inputValue());expect(url.search).toBe('?incident=kddi-dion-2006');expect(url.hash).toBe('');
});

test('unavailable WebGL starts an operable SVG map with the same records',async({page})=>{
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return String(type).startsWith('webgl')?null:original.call(this,type,...args);};});
  await ready(page);await page.locator('#quick-search').fill('KDDI');await expect(page.locator('.company-item')).toHaveCount(3);
  await analysis(page, 'map');await expect(page.locator('#graph-stage')).toHaveAttribute('data-renderer','svg');
  await expect(page.locator('#mode-3d')).toBeDisabled();
  await expect(page.locator('#graph-mount svg')).toHaveAttribute('viewBox',/./);await page.locator('circle[data-circle-id="kddi-dion-2006"]').click({force:true});await expect(page.locator('.note-scale-exact')).toContainText('3,996,789');
  await page.locator('#graph-mount svg').focus();await page.keyboard.press('+');await page.keyboard.press('ArrowLeft');await page.locator('#fit-map').click();
});

test('an unavailable archive has a working reload and medium-width filters stay accessible',async({page})=>{
  await page.route('**/data/index.json',route=>route.abort());await page.goto('./');
  await expect(page.locator('#retry-load')).toBeVisible();await page.unroute('**/data/index.json');await page.locator('#retry-load').click();
  await expect(page.locator('html')).toHaveAttribute('data-ready','true');
  await page.setViewportSize({width:1024,height:900});
  await expect(page.locator('#quick-search')).toBeVisible();await page.locator('#open-explorer').click();
  for(const field of ['registry','cause','period','status'])await expect(page.locator(`#${field}`)).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('keyboard chart controls keep focus when their selected state updates',async({page})=>{
  await ready(page);await charts(page);const year=page.locator('#year-chart [data-year="2014"]');await year.focus();await page.keyboard.press('Enter');
  await expect(page.locator('#period')).toHaveValue('2014');await expect(year).toBeFocused();
  await page.keyboard.press('Enter');await expect(page.locator('#period')).toHaveValue('all');await expect(year).toBeFocused();
  const cause=page.locator('#cause-chart [data-cause="intrusion"]');await cause.focus();await page.keyboard.press('Enter');
  await expect(page.locator('#cause')).toHaveValue('intrusion');await expect(cause).toBeFocused();
});

test('OG metadata and rendered preview use the current public-record count',async({page})=>{
  await ready(page);await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content',/米国政府/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href','https://hundred-days.pages.dev/day-064-breach-atlas/');
  await page.setViewportSize({width:1200,height:630});await page.goto('./og-card.svg');
  await expect(page.locator('svg')).toContainText('18,001の公表記録');
  await page.screenshot({path:fileURLToPath(new URL('../../day-064-breach-atlas/source/public/og.png',import.meta.url))});
  await page.screenshot({path:`${evidence}/history-og.png`});
});

test('browser performance uses all 18,001 real records and records Worker and UI latency',async({page,browserName})=>{
  await ready(page);const workerFile=(await readdir(fileURLToPath(new URL('../../day-064-breach-atlas/source/dist/assets/',import.meta.url)))).find(name=>name.startsWith('search.worker-'));
  const measurement=await page.evaluate(async workerFile=>{
    const snapshot=await(await fetch('/day-064-breach-atlas/data/index.json')).json();
    const records=snapshot.rows.map((r,index)=>({id:r[0],company:r[1],companyId:r[2],shortName:r[3]||r[1],aliases:r[4]||[],cause:r[5],year:r[6],announcedAt:r[7],status:r[8],scale:{unit:r[9],value:r[10],qualifier:r[11],bound:r[12]},region:r[13],registry:r[14],geoCode:r[16],geoBasis:r[17],index}));
    const worker=new Worker(`/day-064-breach-atlas/assets/${workerFile}`,{type:'module'});let sequence=0;
    const send=message=>new Promise((resolve,reject)=>{const id=++sequence;const start=performance.now();worker.onmessage=({data})=>{if(data.id===id){if(data.error)reject(new Error(data.error));else resolve({...data,roundTrip:performance.now()-start});}};worker.onerror=()=>reject(new Error('Worker unavailable'));worker.postMessage({id,...message});});
    const init=await send({type:'init',records});const base={query:'',unit:'all',cause:'all',period:'all',status:'all',region:'all',registry:'all',location:'all'};
    const scenarios=[base,{...base,query:'ＫＤＤＩ'},{...base,region:'japan',location:'JP-13'},{...base,region:'us',registry:'hhs',unit:'people'}];
    const engine=[],roundTrips=[];
    for(let i=0;i<80;i++){const response=await send({type:'query',filters:scenarios[i%scenarios.length],order:'date'});if(i%4===0&&response.result.count!==18001)throw new Error('Incomplete archive');if(i>=8){engine.push(response.elapsed);roundTrips.push(response.roundTrip);}}
    worker.terminate();
    const percentile=(values,p)=>{values.sort((a,b)=>a-b);return Number(values[Math.floor((values.length-1)*p)].toFixed(3));};
    return {mode:init.mode,records:records.length,samples:engine.length,engineMedianMs:percentile(engine,.5),engineP95Ms:percentile(engine,.95),workerRoundTripMedianMs:percentile(roundTrips,.5),workerRoundTripP95Ms:percentile(roundTrips,.95),userAgent:navigator.userAgent};
  },workerFile);
  expect(measurement.mode).toBe('rust-wasm-worker');expect(measurement.engineP95Ms).toBeLessThan(100);
  const inputTimes=[];
  for(let i=0;i<12;i++){
    const [query,count]=[['ＫＤＤＩ',3],['Ｐｌａｌａ',1],['',18001],['未収録zx997',0]][i%4];
    const start=Date.now();await page.locator('#quick-search').fill(query);await expect(page.locator('#list-count')).toHaveText(`${new Intl.NumberFormat('ja-JP').format(count)}記録`);inputTimes.push(Date.now()-start);
  }
  inputTimes.sort((a,b)=>a-b);
  await writeFile(`${evidence}/performance-browser.json`,JSON.stringify({asOf:'2026-10-12',browserName,...measurement,inputToResult:{samples:inputTimes.length,medianMs:inputTimes[Math.floor(inputTimes.length*.5)],p95Ms:inputTimes[Math.floor(inputTimes.length*.95)],debounceMs:90},limitation:'Local desktop Chromium. Worker measurements include filtering, sorting and contextual aggregates; UI measurements include input debounce and DOM updates. Not measured on physical phones or a production deployment.'},null,2)+'\n');
});

test('a visible search and removable conditions lead to the matching record and source', async ({ page }) => {
  await ready(page);
  await expect(page.locator('#quick-search')).toBeInViewport();
  await expect(page.locator('.company-list')).not.toBeVisible();
  await page.locator('[data-search-example="KDDI"]').click();
  await expect(page.locator('.incident-card')).toHaveCount(3);
  await expect(page.locator('#quick-search')).toHaveValue('KDDI');
  await expect(page.locator('#search')).toHaveValue('KDDI');
  await expect(page.locator('#total-incidents')).toHaveText('18,001');
  await chooseRecord(page, 'kddi-dion-2006');
  await expect(page.locator('.note-scale-exact')).toHaveText('3,996,789人');
  await expect(page.locator('.source-shortcut')).toHaveAttribute('href', await page.locator('.source-link').first().getAttribute('href'));
  await page.locator('[data-region="japan"]').click();
  await expect(page.locator('[data-region="japan"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#quick-search').fill('ＫＤＤＩ');
  await page.locator('[data-clear-filter="query"]').focus();
  await expect(page.locator('[data-clear-filter="query"]')).toContainText('ＫＤＤＩ');
  await expect(page.locator('[data-clear-filter="query"]')).toBeFocused();
  await page.locator('[data-clear-filter="query"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#quick-search')).toHaveValue('');
  await expect(page.locator('#visible-count')).toContainText('4,652記録');
  await expect(page.locator('[data-clear-filter="region"]')).toBeFocused();
  await page.locator('[data-reset-all]').click();
  await expect(page.locator('#visible-count')).toContainText('18,001記録');
  await page.locator('#quick-search').fill('未収録zx997');
  await expect(page.locator('.history-empty')).toContainText('条件に合う記録がありません');
  await page.locator('.history-empty [data-reset-all]').click();
  await expect(page.locator('.incident-card')).toHaveCount(24);
});

test('mobile search stays visible while charts open on demand and details return to the list', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  await expect(page.locator('#quick-search')).toBeInViewport();
  await expect(page.locator('#overview-charts')).not.toHaveAttribute('open', '');
  await page.locator('#overview-charts summary').click();
  await expect(page.locator('#year-chart')).toBeVisible();
  await expect(page.locator('#year-chart [data-year="2026"]')).toBeInViewport();
  await page.locator('#overview-charts summary').click();
  await page.locator('#quick-search').fill('ＫＤＤＩ');
  await expect(page.locator('.incident-card')).toHaveCount(3);
  await page.locator('#quick-search-form button').click();
  await expect(page.locator('#map-title')).toBeInViewport();
  await chooseRecord(page, 'kddi-dion-2006');
  await expect(page.locator('.note-company')).toBeInViewport();
  await expect(page.locator('.source-shortcut')).toBeInViewport();
  await page.locator('#back-to-records').click();
  await expect(page.locator('#map-title')).toBeFocused();
  await expect(page.locator('#map-title')).toBeInViewport();
  await page.locator('#open-explorer').click();
  await expect(page.locator('#search')).toHaveValue('ＫＤＤＩ');
  await page.locator('#search').fill('ぷらら');
  await expect(page.locator('.company-item')).toHaveCount(1);
  await page.locator('#close-explorer').click();
  await expect(page.locator('#quick-search')).toHaveValue('ぷらら');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Japanese intrusion entry, publication status and original-source checks remain distinct', async ({ page }) => {
  const errors=[]; page.on('pageerror', error=>errors.push(error.message));
  await ready(page);
  await page.locator('#show-japan-intrusions').click();
  await expect(page.locator('[data-region="japan"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#cause')).toHaveValue('intrusion');
  await expect(page.locator('#visible-count')).toContainText('1,622記録');
  await selectFilter(page, 'status', 'notice');
  await expect(page.locator('#visible-count')).toContainText('1,497記録');
  await page.locator('#quick-search').fill('かわさき新産業');
  await expect(page.locator('.incident-card')).toHaveCount(1);
  await chooseRecord(page);
  await expect(page.locator('.note-company')).toContainText('川崎市');
  await expect(page.locator('.status-badge')).toContainText('流出なし');
  await expect(page.locator('.count-note')).toContainText('流出確認人数ではありません');
  await expect(page.locator('.source-link')).toHaveCount(4);
  await expect(page.locator('.note-scale')).toHaveText('合計不明');
  await page.screenshot({path:`${evidence}/japan-no-leak.png`,fullPage:true});
  await ready(page,'./?incident=jp-notice-20261008-cd7e5353d2c6');
  await expect(page.locator('.note-company')).toContainText('ローソン');
  await expect(page.locator('.status-badge')).toContainText('流出・公開等の確認');
  await expect(page.locator('.note-scale-exact')).toContainText('215万5,345件');
  await expect(page.locator('.note-scale-exact')).toContainText('26件');
  await expect(page.locator('.source-shortcut')).toHaveAttribute('href','https://www.lawson.co.jp/contents/cont07/1533174_3310.html');
  await expect(page.locator('.count-note')).toContainText('合算せず');
  await ready(page,'./?incident=jp-notice-20260210-74d10850b277');
  await expect(page.locator('.record-context').first()).toContainText('報道一覧');
  await expect(page.locator('.source-shortcut')).toContainText('参照記事・一覧');
  await expect(page.locator('.note-dates')).toContainText('公表・発生・報道');
  await expect(page.locator('#note-content')).toContainText('サイバーセキュリティ.com');
  await page.screenshot({path:`${evidence}/japan-news-reference.png`,fullPage:true});
  expect(errors).toEqual([]);
});

test('municipal disclosure rows show departments, original pages and separate publication and awareness dates', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await ready(page, './?incident=jp-municipal-ff943fbc073c98');
  await expect(page.locator('.note-company')).toContainText('横浜市 · 中区 地域振興課');
  await expect(page.locator('.note-dates')).toContainText('2025.11.17');
  await expect(page.locator('.note-dates')).toContainText('2025.10.01');
  await expect(page.locator('.note-dates')).toContainText('発生日とは別');
  await expect(page.locator('.note-scale-exact')).toContainText('6人（漏えいのおそれを含む公表値）');
  await expect(page.locator('.record-context').first()).toHaveText('日本 / 自治体公表');
  await expect(page.locator('.source-shortcut')).toHaveAttribute('href', /0093_20251114\.pdf#page=2$/);
  await expect(page.locator('.geographic-note')).toContainText('神奈川県');
  await page.screenshot({ path: `${evidence}/municipal-desktop.png`, fullPage: true });
  await page.locator('#quick-search').fill('横浜市 中区 地域振興課');
  await expect(page.locator('.incident-card').first()).toContainText('地域振興課');
  await page.locator('#view-globe').click();
  await expect(page.locator('#globe-summary')).toContainText('1地域');
  await expect(page.locator('#globe-summary')).toContainText('国単位 0');
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page, './?incident=jp-municipal-a5d9efa930efbc');
  await expect(page.locator('.note-company')).toContainText('さいたま市 · スポーツ文化局 文化振興課');
  await expect(page.locator('.note-dates')).toContainText('資料の覚知日');
  await expect(page.locator('.note-dates')).toContainText('2025.02.17');
  await expect(page.locator('.note-dates')).toContainText('2025.03.17');
  await page.locator('.note-extra summary').click();
  await expect(page.locator('.municipal-details')).toContainText('No.10');
  await expect(page.locator('.municipal-details')).toContainText('本アプリの整理区分');
  await expect(page.locator('.municipal-details')).toContainText('紛失・盗難など');
  await expect(page.locator('.geographic-note')).toContainText('埼玉県');
  await page.locator('.note-company').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${evidence}/municipal-mobile.png`, fullPage: false });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('ten-stage archive exploration @experience',async({page})=>{
  test.setTimeout(370000);await mkdir(evidence,{recursive:true});const started=Date.now();const stages=[];const errors=[];
  page.on('pageerror',error=>errors.push(error.message));await ready(page);
  async function stage(name,action){await action();await settled(page);await page.waitForTimeout(250);await page.screenshot({path:`${evidence}/history-experience-${String(stages.length+1).padStart(2,'0')}.png`,fullPage:true});stages.push({name,elapsedSeconds:Number(((Date.now()-started)/1000).toFixed(1)),visible:await page.locator('#visible-count').textContent(),selected:await page.locator('.note-company').textContent().catch(()=>null),exactScale:await page.locator('.note-scale-exact').textContent().catch(()=>null),sources:await page.locator('.source-link').evaluateAll(links=>links.map(link=>({title:link.innerText,url:link.href}))),engine:await page.locator('html').getAttribute('data-engine')});await writeFile(`${evidence}/history-experience.json`,JSON.stringify({asOf:'2026-10-12',method:'Automated real Chromium operations; scenes held for primary-agent screenshot and source-note review. Not a human user study.',elapsedSeconds:Number(((Date.now()-started)/1000).toFixed(1)),stages,errors},null,2)+'\n');console.log(`Experience ${stages.length}/10: ${name}`);await page.waitForTimeout(30000);}
  await stage('全履歴の分布と資料定義',async()=>{await expect(page.locator('#total-incidents')).toHaveText('18,001');});
  await stage('国内の別事故をKDDIの履歴からたどる',async()=>{await page.locator('[data-region="japan"]').click();await page.locator('#quick-search').fill('ＫＤＤＩ');await expect(page.locator('.company-item')).toHaveCount(3);await chooseRecord(page, 'kddi-dion-2006');await expect(page.locator('.note-scale-exact')).toContainText('3,996,789');});
  await stage('ぷららの訂正値と公式資料',async()=>{await page.locator('#quick-search').fill('Ｐｌａｌａ');await expect(page.locator('.company-item')).toHaveCount(1);await chooseRecord(page);await expect(page.locator('.note-scale-exact')).toContainText('596万');});
  await stage('2014年の内部持ち出しと同単位比較',async()=>{await reset(page);await page.locator('[data-region="japan"]').click();await selectFilter(page, 'period', '2014');await selectFilter(page, 'cause', 'insider');await analysis(page, 'compare');await chooseUnit(page, 'records');await expect(page.locator('.compare-row')).not.toHaveCount(0);await page.locator('.compare-row').first().click();});
  await stage('HHS届出の規模と対象範囲',async()=>{await reset(page);await selectFilter(page, 'registry', 'hhs');await chooseUnit(page, 'people');await expect(page.locator('#visible-count')).toContainText('8,012記録');await page.locator('.compare-row').first().click();await expect(page.locator('.status-badge')).toContainText('当局への届出');});
  await stage('州の通知日と発生日・規模未記載',async()=>{await reset(page);await selectFilter(page, 'registry', 'california');await page.locator('#view-timeline').click();await expect(page.locator('#visible-count')).toContainText('5,336記録');await chooseRecord(page);await expect(page.locator('.note-scale')).toHaveText('合計不明');});
  await stage('3DとSVGの実際の球を選択',async()=>{await reset(page);await page.locator('#quick-search').fill('KDDI');await expect(page.locator('.company-item')).toHaveCount(3);await analysis(page, 'map');await expect(page.locator('#graph-stage')).toHaveAttribute('data-renderer','webgl');await page.locator('#graph-mount canvas').focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('+');await page.locator('#fit-map').click();await page.locator('#mode-2d').click();await expect(page.locator('#graph-stage')).toHaveAttribute('data-rendered','true');await expect(page.locator('#graph-mount svg')).toHaveAttribute('viewBox',/./);await page.locator('circle[data-circle-id="kddi-dion-2006"]').click({force:true});await expect(page.locator('.note-scale-exact')).toContainText('3,996,789');});
  await stage('ゼロ件からの復帰と最古のページ',async()=>{await page.locator('#view-timeline').click();await page.locator('#quick-search').fill('未収録zx997');await expect(page.locator('.history-empty')).toBeVisible();await page.locator('.history-empty [data-reset-all]').click();await expect(page.locator('#visible-count')).toContainText('18,001記録');await page.locator('#page-last').click();await expect(page.locator('#page-range')).toContainText('18,001');});
  await stage('390px・動きを減らす設定で検索から資料へ',async()=>{await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#open-explorer').click();await page.locator('#search').fill('KDDI');await expect(page.locator('.company-item')).toHaveCount(3);await page.locator('.company-item').first().click();await expect(page.locator('.note-company')).toBeInViewport();});
  await stage('台帳の全行確認・除外と共有の定義',async()=>{await page.locator('#open-coverage').click();await expect(page.locator('#coverage-content')).toContainText('7,261');await page.keyboard.press('Escape');await page.locator('#native-share').click();await expect(page.locator('#share-dialog')).toBeVisible();await page.keyboard.press('Escape');});
  expect(errors).toEqual([]);expect(Date.now()-started).toBeGreaterThanOrEqual(300000);
  await writeFile(`${evidence}/history-experience.json`,JSON.stringify({asOf:'2026-10-12',method:'Automated real Chromium operations; primary-agent review of screenshots and notes. Not a human user study.',elapsedSeconds:Number(((Date.now()-started)/1000).toFixed(1)),stages,errors,completed:true},null,2)+'\n');
});

// Public-interest learning and the reorganized interface.
test('learning connects public guidance, Japanese records and the same reading theme', async ({ page }) => {
  const errors=[], external=[];
  page.on('pageerror', error=>errors.push(error.message));
  page.on('request', request=>{if(new URL(request.url()).hostname!=='127.0.0.1')external.push(request.url());});
  await readyGlobe(page);
  await expect(page.locator('#overview-title')).toHaveText('過去の記録から、これからの備えへ。');
  await expect(page.locator('#explorer')).not.toBeVisible();
  await expect(page.locator('.view-tabs > button')).toHaveCount(3);
  await page.locator('#view-learn').click();
  await expect(page.locator('.lesson-card')).toHaveCount(6);
  await expect(page.locator('#company-note')).not.toBeVisible();
  await expect(page.locator('#lesson-intrusion a')).toHaveAttribute('href', /www\.ipa\.go\.jp\/security\/guide\/sme\/.+#page=26/);
  await expect(page.locator('.learning-response a')).toHaveAttribute('href','https://www.ppc.go.jp/personalinfo/legal/leakAction/');
  await page.locator('[data-lesson-records="intrusion"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-view','timeline');
  await expect(page.locator('#visible-count')).toContainText('1,622記録');
  await expect(page.locator('#cause')).toHaveValue('intrusion');
  await expect(page.locator('[data-region="japan"]')).toHaveAttribute('aria-pressed','true');
  await page.locator('.incident-card').first().click();
  await expect(page.locator('.source-shortcut')).toHaveAttribute('href',await page.locator('.source-link').first().getAttribute('href'));
  await page.locator('[data-learn-cause="intrusion"]').click();
  await expect(page.locator('#lesson-intrusion')).toHaveAttribute('data-highlight','true');
  await expect(page.locator('#lesson-title-intrusion')).toBeFocused();
  await page.locator('#quick-search').fill('KDDI');
  await expect(page.locator('html')).toHaveAttribute('data-view','timeline');
  await expect(page.locator('.incident-card')).toHaveCount(3);
  await expect(page.locator('#cause')).toHaveValue('all');
  await expect(page.locator('#total-incidents')).toHaveText('18,001');
  expect(errors).toEqual([]);expect(external).toEqual([]);
});

test('desktop conditions open as a dialog and disclosure preserves full source definitions', async ({ page }) => {
  await ready(page);
  await page.locator('#open-explorer').click();
  await expect(page.locator('#explorer')).toHaveAttribute('aria-modal','true');
  await expect(page.locator('#search')).toBeFocused();
  await page.locator('#registry').selectOption('california');
  await expect(page.locator('#visible-count')).toContainText('5,336記録');
  await page.keyboard.press('Escape');
  await expect(page.locator('#open-explorer')).toBeFocused();
  await expect(page.locator('#explorer')).not.toBeVisible();
  await expect(page.locator('.note-extra')).not.toHaveAttribute('open','');
  await expect(page.locator('.source-shortcut')).toBeVisible();
  await page.locator('.note-extra summary').click();
  await expect(page.locator('.note-extra')).toHaveAttribute('open','');
  await expect(page.locator('.note-extra')).toContainText('対象人数・原因・流出確定を推定しません');
  await expect(page.locator('.source-link').first()).toBeVisible();
  await page.locator('#open-explorer').click();
  await page.locator('#cause').selectOption('unknown');
  await page.locator('#apply-filters').click();
  await expect(page.locator('#map-title')).toBeFocused();
  await expect(page.locator('.overview')).not.toHaveAttribute('inert','');
});

test('search and reset align the geographic view after exploring the United States', async ({ page }) => {
  await readyGlobe(page);
  await page.locator('[data-region="us"]').click();
  await page.locator('#globe-location').selectOption('US-CA');
  await expect(page.locator('.globe-point-label[data-geo-code="US-CA"]')).toBeVisible();
  await reset(page);
  await page.locator('#quick-search').fill('KDDI');
  await expect(page.locator('.globe-record')).toHaveCount(3);
  await expect(page.locator('.globe-point-label[data-geo-code="JP"]')).toBeVisible();
  await expect(page.locator('#globe-summary')).toContainText('3記録 / 1地域');
  await reset(page);
  await expect(page.locator('#globe-summary')).toContainText('18,001記録');
  await expect(page.locator('.globe-point-label[data-geo-code="JP"]')).toBeVisible();
});

test('public-interest reading and learning flow @experience', async ({ page }) => {
  test.setTimeout(160000);page.setDefaultTimeout(10000);
  const started=Date.now(), stages=[], errors=[];page.on('pageerror',error=>errors.push(error.message));
  await readyGlobe(page);await page.emulateMedia({reducedMotion:'reduce'});
  const stage=async(name,act)=>{
    const begin=Date.now();await act();
    await page.waitForTimeout(Math.max(0,8000-(Date.now()-begin)));
    const snapshot=await page.evaluate(()=>({view:document.documentElement.dataset.view,engine:document.documentElement.dataset.engine,query:document.querySelector('#quick-search').value,count:document.querySelector('#visible-count').textContent,cause:document.querySelector('#cause').value,company:document.querySelector('.note-company')?.textContent||null,focus:document.activeElement.id||document.activeElement.tagName,width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth}));
    const screenshot=`purpose-experience-${String(stages.length+1).padStart(2,'0')}.png`;
    await page.screenshot({path:`${evidence}/${screenshot}`,fullPage:false});stages.push({name,elapsedSeconds:Number(((Date.now()-started)/1000).toFixed(1)),snapshot,screenshot});
    await writeFile(`${evidence}/purpose-experience-progress.json`,JSON.stringify(stages,null,2));
  };
  await stage('初期画面から目的・検索・入口を読む',async()=>{
    await expect(page.locator('#quick-search')).toBeInViewport();await expect(page.locator('#explorer')).not.toBeVisible();await expect(page.locator('#total-incidents')).toHaveText('18,001');
  });
  await stage('キーボードで学習へ進み公的資料を確認',async()=>{
    await page.locator('#view-learn').focus();await page.keyboard.press('Enter');await expect(page.locator('.lesson-card')).toHaveCount(6);await expect(page.locator('#lesson-intrusion a')).toHaveAttribute('href',/www\.ipa\.go\.jp/);await page.locator('#lesson-intrusion').scrollIntoViewIfNeeded();
  });
  await stage('国内の侵入記録から要旨・原資料・補足を読む',async()=>{
    await page.locator('[data-lesson-records="intrusion"]').click();await expect(page.locator('#visible-count')).toContainText('1,622記録');await page.locator('.incident-card').first().click();await page.locator('.note-extra summary').click();await expect(page.locator('.geographic-note')).toBeVisible();await expect(page.locator('.source-shortcut')).toHaveAttribute('href',await page.locator('.source-link').first().getAttribute('href'));
  });
  await stage('同じ学習テーマへ戻り内部持ち出しの事例を探す',async()=>{
    await page.locator('[data-learn-cause="intrusion"]').click();await expect(page.locator('#lesson-title-intrusion')).toBeFocused();await page.locator('[data-lesson-records="insider"]').click();await page.locator('#quick-search').fill('ベネッセ');await page.locator('.incident-card[data-incident-id="benesse-customer-2014"]').click();await expect(page.locator('.note-scale-exact')).toContainText('2,895万');await expect(page.locator('.source-shortcut')).toHaveAttribute('href',/benesse/);
  });
  await stage('ゼロ件を理解し条件を解除して戻る',async()=>{
    await page.locator('#quick-search').fill('未収録zx997');await expect(page.locator('.history-empty')).toBeVisible();await page.locator('.history-empty [data-reset-all]').click();await expect(page.locator('#visible-count')).toContainText('18,001記録');await expect(page.locator('#quick-search')).toHaveValue('');
  });
  await stage('米国の地図から日本企業検索へ移動',async()=>{
    await page.locator('#view-globe').click();await page.locator('[data-region="us"]').click();await page.locator('#globe-location').selectOption('US-CA');await reset(page);await page.locator('#quick-search').fill('KDDI');await expect(page.locator('.globe-record')).toHaveCount(3);await expect(page.locator('.globe-point-label[data-geo-code="JP"]')).toBeVisible();await page.locator('#globe-2d').click();await page.locator('#globe-stage').scrollIntoViewIfNeeded();
  });
  await stage('390pxで公表規模・出典から学習へ進む',async()=>{
    await page.setViewportSize({width:390,height:844});await page.locator('.globe-record[data-incident-id="kddi-dion-2006"]').click();await expect(page.locator('.note-company')).toBeInViewport();await expect(page.locator('.note-scale-exact')).toContainText('3,996,789');await page.locator('[data-learn-cause="unknown"]').click();await expect(page.locator('#learning-title')).toBeFocused();await expect(page.locator('.lesson-card[data-highlight=true]')).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
  await stage('スマホで別テーマ・条件パネル・一覧へ戻る',async()=>{
    await page.locator('[data-lesson-records="ransomware"]').click();await expect(page.locator('#visible-count')).toContainText('280記録');await page.locator('#open-explorer').click();await expect(page.locator('#search')).toBeFocused();await expect(page.locator('#apply-filters')).toBeInViewport();await page.keyboard.press('Escape');await expect(page.locator('#open-explorer')).toBeFocused();await expect(page.locator('.overview')).not.toHaveAttribute('inert','');await page.locator('#map-title').scrollIntoViewIfNeeded();
  });
  expect(errors).toEqual([]);expect(stages.every(item=>!item.snapshot.overflow)).toBe(true);
  await writeFile(`${evidence}/purpose-experience.json`,JSON.stringify({date:'2026-10-11',method:'Changed-flow real Chromium operations and primary-agent visual self-review; not independent evaluation or a user study.',elapsedSeconds:Number(((Date.now()-started)/1000).toFixed(1)),stages,errors,completed:true},null,2)+'\n');
});
