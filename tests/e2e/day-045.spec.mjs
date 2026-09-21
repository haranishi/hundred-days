import { expect, test } from '@playwright/test';

const PATH = '/day-045-read-your-shots/?seed=20260921';
const errors = new WeakMap(), external = new WeakMap(), failedAssets = new WeakMap();
test.beforeEach(async ({ page }) => {
  errors.set(page, []); external.set(page, []); failedAssets.set(page, new Set());
  page.on('response', response => {
    if (response.status() === 404 && /\/day-045-read-your-shots\/assets\//.test(response.url())) failedAssets.get(page).add(response.url());
  });
  page.on('console', message => {
    if (message.type() !== 'error') return;
    // 意図した画像404だけはブラウザのネットワーク診断として区別する。
    if (message.text().includes('Failed to load resource') && message.text().includes('404') && /\/day-045-read-your-shots\/assets\//.test(message.location().url)) return;
    errors.get(page).push(message.text());
  });
  page.on('pageerror', error => errors.get(page).push(error.message));
  page.on('request', request => {
    const url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) external.get(page).push(url.href);
  });
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page), 'アプリのコンソールエラー').toEqual([]);
  expect(external.get(page), '外部リクエスト').toEqual([]);
});
async function begin(page) {
  await page.goto(PATH);
  await expect(page.locator('#app')).toHaveAttribute('data-art', /images|fallback/);
  await page.evaluate(() => window.__day045.setManual(true));
  await page.locator('#start').click();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing');
}
const advance = (page, ms) => page.evaluate(ms => window.__day045.advance(ms), ms);

test('開始前の見出しとempty、はじめるでplaying', async ({ page }) => {
  await page.goto(PATH);
  await expect(page.locator('#app')).toHaveAttribute('data-art', /images|fallback/);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'empty');
  await expect(page.locator('h1')).toHaveText('その撃ち方、読まれてる');
  await page.locator('#start').click();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing');
});
test('キーボードだけで開始、自動連射、移動、一時停止', async ({ page }) => {
  await page.goto(PATH);
  await expect(page.locator('#app')).toHaveAttribute('data-art', /images|fallback/);
  await page.evaluate(() => window.__day045.setManual(true));
  await page.keyboard.press('Enter');
  await advance(page, 700);
  expect((await page.evaluate(() => window.__day045.snapshot())).alive).toBeLessThan(28);
  const x = await page.evaluate(() => window.__day045.snapshot().player.x);
  await page.keyboard.down('ArrowLeft'); await advance(page, 200); await page.keyboard.up('ArrowLeft');
  expect(await page.evaluate(() => window.__day045.snapshot().player.x)).toBeLessThan(x);
  await page.keyboard.press('p'); await expect(page.locator('#app')).toHaveAttribute('data-state', 'paused');
  await page.keyboard.press('Escape'); await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing');
});
test('同じレーン8発で読まれ度80、移動射撃で下がり艦隊がひるむ', async ({ page }) => {
  await begin(page);
  const result = await page.evaluate(() => {
    const api = window.__day045; api.recordEvents(true); 
    let flinched = false;
    for (let i = 0; i < 600 && api.events().filter(e => e.name === 'fire').length < 8; i++) {
      api.advance(1000 / 60); flinched ||= api.snapshot().fleet.offset !== 0;
    }
    return { flinched, shots: api.events().filter(e => e.name === 'fire').length };
  });
  const high = Number(await page.locator('#read-level').textContent());
  expect(result.shots).toBe(8); expect(result.flinched).toBe(true); expect(high).toBe(80); // 固定seedで1.900秒、熱0.9410（56.5点）＋位置の集中0.600（24点）
  await page.evaluate(() => {
    const api = window.__day045;
    for (let i = 0; i < 240; i++) { api.input({ targetX: Math.floor(i / 60) % 2 ? 456 : 24 }); api.advance(1000 / 60); }
    api.input({});
  });
  expect(Number(await page.locator('#read-level').textContent())).toBeLessThan(high);
});
test('結果と講評、ベスト保存、Enterで再挑戦', async ({ page }) => {
  await begin(page);
  await page.evaluate(() => { const a=window.__day045;  a.advance(800); a.input({}); a.advance(180000); });
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'over');
  await expect(page.locator('#final-score')).toHaveText(/\d+/);
  await expect(page.locator('#final-wave')).toHaveText(/\d+/);
  await expect(page.locator('#final-kills')).toHaveText(/\d+/);
  await expect(page.locator('#final-bonus')).toHaveText(/\d+/);
  await expect(page.locator('#review')).not.toBeEmpty(); await expect(page.locator('#retry')).toBeVisible();
  const best = await page.evaluate(() => JSON.parse(localStorage.getItem('day045.best.v1')));
  expect(best.score).toBe(Number(await page.locator('#final-score').textContent()));
  expect(best.wave).toBeGreaterThanOrEqual(1); expect(best.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await page.keyboard.press('Enter'); await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing');
  await expect(page.locator('#score')).toHaveText('0');
});
test('画像404でも図形で遊べる', async ({ page }) => {
  await page.route('**/day-045-read-your-shots/assets/*', route => route.fulfill({ status: 404, body: '' }));
  await begin(page);
  await expect(page.locator('#app')).toHaveAttribute('data-art', 'fallback');
  await expect(page.locator('#art-note')).toBeVisible();
  await advance(page, 700);
  expect(await page.evaluate(() => window.__day045.snapshot().score)).toBeGreaterThan(0);
  expect(failedAssets.get(page).size).toBe(5);
});
test('キャンバスの画素は単色ではない', async ({ page }) => {
  await begin(page);
  expect(await page.evaluate(() => {
    const c=document.querySelector('canvas'), data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    const colors=new Set(); for(let i=0;i<data.length;i+=16) colors.add(`${data[i]},${data[i+1]},${data[i+2]}`);
    return colors.size;
  })).toBeGreaterThan(5);
});
for (const width of [390, 768, 1440]) test(`${width}pxで横はみ出しなし`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await begin(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('ミュートを保存、再読込で復元', async ({ page }) => {
  await begin(page); await page.locator('#mute').click();
  await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('day045.mute.v1'))).toBe('true');
  await page.reload(); await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('m'); await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'false');
});
test('ポインタ押下中は追従し、離すと移動だけ止まり自動連射は続く', async ({ page }) => {
  await begin(page); const box=await page.locator('canvas').boundingBox();
  await page.mouse.move(box.x+box.width*.75,box.y+box.height*.8); await page.mouse.down(); await advance(page,400);
  const s=await page.evaluate(()=>window.__day045.snapshot()); expect(s.player.x).toBeGreaterThan(264); expect(s.readLevel).toBeGreaterThan(0);
  await page.mouse.up(); await page.evaluate(()=>window.__day045.recordEvents(true)); await advance(page,1000);
  const after=await page.evaluate(()=>window.__day045.snapshot()); expect(after.player.x).toBe(s.player.x);
  expect(await page.evaluate(()=>window.__day045.events().some(e=>e.name==='fire'))).toBe(true);
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) test(`${viewport.width}×${viewport.height}で初期ボタンと開始・再挑戦後の戦場が収まる`, async ({ page }) => {
  await page.setViewportSize(viewport); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(PATH); await expect(page.locator('#app')).toHaveAttribute('data-art', /images|fallback/);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  const start = await page.locator('#start').boundingBox();
  expect(start.y).toBeGreaterThanOrEqual(0); expect(start.y + start.height).toBeLessThanOrEqual(viewport.height);
  await page.evaluate(() => window.__day045.setManual(true)); await page.locator('#start').click();
  const fits = () => page.evaluate(() => {
    const canvas = document.querySelector('canvas').getBoundingClientRect(), hud = document.querySelector('.hud').getBoundingClientRect();
    return Math.abs(hud.top) <= 1 && canvas.top >= 0 && canvas.bottom <= innerHeight;
  });
  expect(await fits()).toBe(true);
  await advance(page, 180000); await expect(page.locator('#app')).toHaveAttribute('data-state', 'over');
  await page.evaluate(() => scrollTo(0, 0)); await page.keyboard.press('Enter'); expect(await fits()).toBe(true);
});
test('開始3秒は敵弾ゼロ', async ({ page }) => {
  await begin(page);
  const counts = await page.evaluate(() => { const a = window.__day045, counts = []; for (let i = 0; i < 180; i++) { a.advance(1000 / 60); counts.push(a.snapshot().enemyBullets.length); } return counts; });
  expect(counts.every(n => n === 0)).toBe(true);
});
test('LV1では自弾は同時2発まで', async ({ page }) => {
  await begin(page);
  const counts = await page.evaluate(() => { const a = window.__day045, counts = [];  for (let i = 0; i < 180; i++) { a.advance(1000 / 60); if(a.snapshot().level!==1)throw new Error('LV1の検証中にレベルが変わった'); counts.push(a.snapshot().bullets.length); } return counts; });
  expect(Math.max(...counts)).toBe(2);
});
test('ウェーブ通過の報酬と空白、その後35隻', async ({ page }) => {
  await begin(page);
  await page.evaluate(() => { const a = window.__day045; a.debug.clearFleet(); a.advance(1000 / 60); });
  await expect(page.locator('#wave')).toHaveText('2'); await expect(page.locator('#score')).toHaveText('50');
  await expect(page.locator('#remaining')).toHaveText('0');
  await advance(page, 1400); await expect(page.locator('#remaining')).toHaveText('0');
  await advance(page, 100); await expect(page.locator('#remaining')).toHaveText('35');
  expect((await page.evaluate(() => window.__day045.snapshot())).enemyBullets).toHaveLength(0);
});
test('撃破で残り隻数が減る', async ({ page }) => {
  await begin(page); await expect(page.locator('#remaining')).toHaveText('28');
  await page.evaluate(() => { const a = window.__day045;  a.advance(700); a.input({}); });
  const s = await page.evaluate(() => window.__day045.snapshot());
  expect(s.alive).toBeLessThan(28); expect(s.kills).toBe(28 - s.alive);
  await expect(page.locator('#remaining')).toHaveText(String(s.alive));
});
test('同じレーンを撃ち続けると読まれ度の帯が危険側へ変わる', async ({ page }) => {
  await begin(page);
  await expect(page.locator('.reading')).toHaveAttribute('data-level', 'calm');
  // 時定数3秒：1秒で47、2.1秒で熱が飽和して87、3秒で100。
  await advance(page, 1000);
  await expect(page.locator('#read-level')).toHaveText('47');
  await expect(page.locator('.reading')).toHaveAttribute('data-level', 'warm');
  await advance(page, 1100);
  await expect(page.locator('#read-level')).toHaveText('87');
  await expect(page.locator('.reading')).toHaveAttribute('data-level', 'hot');
  await advance(page, 900);
  await expect(page.locator('#read-level')).toHaveText('100');
  await expect(page.locator('.reading')).toHaveAttribute('data-level', 'critical');
});
test('390×664でも開始後にツールバーまで画面内に収まる', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(PATH); await expect(page.locator('#app')).toHaveAttribute('data-art', /images|fallback/);
  await page.evaluate(() => window.__day045.setManual(true));
  await page.locator('#start').click();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing');
  const fit = await page.evaluate(() => {
    const hud = document.querySelector('.hud').getBoundingClientRect();
    const canvas=document.querySelector('canvas').getBoundingClientRect(), reading=document.querySelector('.reading').getBoundingClientRect(), level=document.getElementById('level').getBoundingClientRect(), remaining=document.getElementById('remaining').getBoundingClientRect();
    return { levelFits: level.left>=reading.left&&level.right<=reading.right&&Math.abs(level.top-remaining.top)<1, canvasFits:canvas.top>=0&&canvas.bottom<=innerHeight, noOverflow:document.documentElement.scrollWidth<=innerWidth, hudTop: Math.abs(hud.top), pauseBottom: document.getElementById('pause').getBoundingClientRect().bottom, viewport: innerHeight };
  });
  await expect(page.locator('#level')).toHaveText('1');
  expect(fit.levelFits&&fit.canvasFits&&fit.noOverflow).toBe(true);
  expect(fit.hudTop).toBeLessThanOrEqual(1);
  expect(fit.pauseBottom).toBeLessThanOrEqual(fit.viewport);
});
test('結果画面のX投稿リンクに点数・アプリ名・到達LVと講評が入る', async ({ page }) => {
  await begin(page);
  await page.evaluate(() => { const a = window.__day045;  a.advance(800); a.input({}); a.advance(180000); });
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'over');
  const score = await page.locator('#final-score').textContent();
  const level = (await page.evaluate(() => window.__day045.snapshot())).level;
  await expect(page.locator('#final-level')).toHaveText(String(level));
  const x = page.locator('#result-x');
  await expect(x).toBeVisible();
  await expect(x).toHaveAttribute('rel', 'noopener noreferrer');
  const href = await x.getAttribute('href');
  expect(href).toContain('https://x.com/intent/post?');
  expect(href).toContain(encodeURIComponent('https://hundred-days.pages.dev/day-045-read-your-shots/'));
  const decoded = decodeURIComponent(href);
  expect(decoded).toContain('その撃ち方、読まれてる');
  expect(decoded).toContain(`${score}点`);
  expect(decoded).toContain(`LV${level}まで到達`);
  const text = new URL(href).searchParams.get('text');
  expect(text).toContain(await page.locator('#review').textContent());
  // 全文字を2として数える保守的な上限＋区切り1＋短縮URL23。
  expect([...text].length * 2 + 24).toBeLessThanOrEqual(280);
  await expect(page.locator('#result-copy')).toBeVisible();
  // 共通の共有欄は結果画面の追加で二重にならない
  await expect(page.locator('.share')).toHaveCount(1);
});

test('何も押さなくても自動連射しfire窓口は1フレーム進める', async ({ page }) => {
  await begin(page);
  expect(await page.evaluate(()=>{const a=window.__day045,before=a.seconds();a.fire();return a.seconds()-before;})).toBeCloseTo(1/60);
  expect((await page.evaluate(()=>window.__day045.snapshot())).bullets.length).toBeGreaterThan(0);
});
test('アイテム取得でHUDのLVが上がり再挑戦で戻る', async ({ page }) => {
  await begin(page); await expect(page.locator('#level')).toHaveText('1');
  await page.evaluate(()=>{const a=window.__day045;a.debug.dropItem();a.advance(1000/60);});
  await expect(page.locator('#level')).toHaveText('2');
  expect((await page.evaluate(()=>window.__day045.snapshot())).items).toHaveLength(0);
  await page.evaluate(()=>window.__day045.retry()); await expect(page.locator('#level')).toHaveText('1');
});
test('Spaceでも開始・再挑戦できる', async ({ page }) => {
  await page.goto(PATH); await expect(page.locator('#app')).toHaveAttribute('data-art', /images|fallback/);
  await page.evaluate(()=>window.__day045.setManual(true)); await page.keyboard.press('Space');
  await expect(page.locator('#app')).toHaveAttribute('data-state','playing');
  await advance(page,180000); await expect(page.locator('#app')).toHaveAttribute('data-state','over');
  await page.keyboard.press('Space'); await expect(page.locator('#app')).toHaveAttribute('data-state','playing');
});
