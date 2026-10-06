import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const APP = '/day-059-laureate-age/';
const fixture = (name) => JSON.parse(readFileSync(new URL(`../../day-059-laureate-age/tests/fixtures/${name}.json`, import.meta.url)));
// 既定は物理学賞の発表後（2026-10-06 18:53 の実応答）。発表前の応答（18:45）は「データ待ち」の確認に使う
const prizes = fixture('prizes-2026-1006-physics'), laureates = fixture('laureates-2026-1006-physics');
const prizesBefore = fixture('prizes-2026-1006'), laureatesBefore = fixture('laureates-2026-1006');
const errors = new WeakMap(), outside = new WeakMap(), knobs = new WeakMap();
test.beforeEach(async ({ page }) => {
  errors.set(page, []); outside.set(page, []); knobs.set(page, { status: 200, prizes, laureates });
  page.on('pageerror', (error) => errors.get(page).push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.get(page).push(message.text()); });
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (['127.0.0.1', 'localhost'].includes(url.hostname)) return route.continue();
    outside.get(page).push(url.href);
    if (url.hostname !== 'api.nobelprize.org') return route.abort();
    return route.fulfill({ status: knobs.get(page).status, contentType: 'application/json', body: JSON.stringify(url.pathname.endsWith('/nobelPrizes') ? knobs.get(page).prizes : knobs.get(page).laureates) });
  });
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
  expect(outside.get(page).every((url) => new URL(url).hostname === 'api.nobelprize.org')).toBe(true);
});
async function open(page, at = '2026-10-06T19:00:00+09:00') {
  await page.goto(`${APP}?now=${encodeURIComponent(at)}`);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#current')).not.toHaveAttribute('data-live', 'loading');
}
async function age(page, value) { await page.locator('#age').fill(value); }
test('空欄は幅17〜97歳と中央値60歳の事実', async ({ page }) => {
  await open(page); await expect(page.locator('#app')).toHaveAttribute('data-input','empty');
  await expect(page.locator('#answer')).toContainText('17'); await expect(page.locator('#answer')).toContainText('97歳');
  await expect(page.locator('#answer')).toContainText('真ん中は60歳');
  await expect(page.locator('#result-share')).toBeHidden();
});
test('26歳の0人が答え・近い歳・最年少・帯の印', async ({ page }) => {
  await open(page); await age(page,'26');
  await expect(page.locator('#answer')).toHaveAttribute('aria-label','26歳で受賞した人は、まだいません');
  await expect(page.locator('#answer .answer-number')).toContainText('0');
  await expect(page.locator('#answer')).toContainText('のべ999回のうち3回');
  await expect(page.getByRole('button',{name:'25歳の2人を見る'})).toBeVisible();
  await expect(page.getByRole('button',{name:'30歳の1人を見る'})).toBeVisible();
  await expect(page.locator('#answer')).toContainText('最年少は17歳のマララ・ユスフザイ');
  await expect(page.locator('#band svg')).toHaveAttribute('aria-label',/あなたは26歳、0回/);
});
test('54歳は34人・10人ずつ見せる', async ({ page }) => {
  await open(page); await age(page,'54');
  await expect(page.locator('#answer')).toHaveAttribute('aria-label','54歳で受賞した人は、34人');
  await expect(page.locator('#matches-title')).toHaveText('54歳で受賞した34人');
  await expect(page.locator('#matches .laureate')).toHaveCount(10);
  await expect(page.locator('#matches .laureate').first()).toContainText('2026年');
  await expect(page.locator('#matches .motivation').first()).toHaveAttribute('lang','en');
  await page.getByRole('button',{name:'残り24人を見る'}).click();
  await expect(page.locator('#matches .laureate')).toHaveCount(20);
  await page.getByRole('button',{name:'残り14人を見る'}).click();
  await page.getByRole('button',{name:'残り4人を見る'}).click();
  await expect(page.locator('#matches .laureate')).toHaveCount(34); await expect(page.locator('#more')).toBeHidden();
});
test('0人の答えの「近い歳」を押すと、その歳に入れ替わる', async ({ page }) => {
  await open(page); await age(page,'26');
  await page.getByRole('button',{name:'25歳の2人を見る'}).click();
  await expect(page.locator('#age')).toHaveValue('25');
  await expect(page.locator('#answer')).toHaveAttribute('aria-label','25歳で受賞した人は、2人');
  await expect(page.locator('#answer')).toContainText('ローレンス・ブラッグ');
  await expect(page.locator('#matches')).toContainText('ローレンス・ブラッグ');
});
test('答えの下に今年の発表の1行が出る', async ({ page }) => {
  await open(page,'2026-10-06T21:00:00+09:00');
  await expect(page.locator('#pulse')).toContainText('生理学・医学賞、物理学賞が発表済み。');
  await expect(page.locator('#pulse')).toContainText('次は化学賞、10月7日（水） 18時45分以降の予定。');
});
test('受賞理由の原文の斜体タグは文字として出さない', async ({ page }) => {
  await open(page); await age(page,'54'); await page.locator('#categories [data-cat="med"]').click();
  const text = await page.locator('#matches').textContent();
  expect(text).not.toMatch(/<\/?i>/i);
});
test('17歳と97歳の人が出る', async ({ page }) => {
  await open(page); await age(page,'17'); await expect(page.locator('#matches')).toContainText('マララ・ユスフザイ');
  await age(page,'97'); await expect(page.locator('#matches')).toContainText('ジョン・グッドイナフ');
});
test('分野で絞ると主語・一覧・集計・共有が変わる', async ({ page }) => {
  await open(page); await age(page,'26'); await page.locator('#categories [data-cat="phy"]').click();
  await expect(page.locator('#answer')).toHaveAttribute('aria-label','物理学賞を26歳で受賞した人は、まだいません');
  await expect(page.locator('#categories [data-cat="phy"]')).toHaveAttribute('aria-label',/選択中/);
  await expect(page.locator('#count-note')).toContainText('物理学賞');
  expect(new URL(await page.locator('#result-x').getAttribute('href')).searchParams.get('text')).toContain('物理学賞を26歳');
  await age(page,'54'); await expect(page.locator('#matches .details').first()).toContainText('物理学賞');
});
for (const invalid of ['abc','0','121']) test(`${invalid}は入力の注意`,async ({page})=>{
  await open(page); await age(page,invalid); await expect(page.locator('#app')).toHaveAttribute('data-input','invalid');
  await expect(page.locator('#answer')).toContainText('1〜120の整数で入れてください');
  await expect(page.locator('#age')).toHaveAttribute('aria-invalid','true'); await expect(page.locator('#result-share')).toBeHidden();
});
test('発表前・発表済み・データ待ちを固定時計で区別',async ({page})=>{
  Object.assign(knobs.get(page),{prizes:prizesBefore,laureates:laureatesBefore});
  await open(page,'2026-10-05T18:29:59+09:00'); await expect(page.locator('[data-cat="med"].announcement')).toHaveAttribute('data-announcement','waiting');
  await open(page); await expect(page.locator('[data-cat="med"].announcement')).toHaveAttribute('data-announcement','announced');
  await expect(page.locator('[data-cat="med"].announcement')).toContainText('54歳');
  await expect(page.locator('[data-cat="phy"].announcement')).toHaveAttribute('data-announcement','pending');
  await expect(page.locator('[data-cat="phy"].announcement')).toContainText('発表予定の時刻を過ぎました。結果がデータに入りしだい出ます');
  await expect(page.locator('[data-cat="che"].announcement')).toContainText('10月7日（水） 18時45分以降の予定');
  await expect(page.locator('[data-cat="pea"].announcement')).toContainText('10月9日（金） 18時の予定');
});
test('物理学賞の発表後は、日本語名と82歳で出る',async ({page})=>{
  await open(page,'2026-10-06T21:00:00+09:00');
  await expect(page.locator('[data-cat="phy"].announcement')).toHaveAttribute('data-announcement','announced');
  await expect(page.locator('[data-cat="phy"].announcement')).toContainText('フランシス・ハルツェン · 82歳');
  await age(page,'82'); await expect(page.locator('#matches .laureate').first()).toContainText('フランシス・ハルツェン');
});
test('題名・見出し・OGの題に賞の名前を入れず、出典と無関係の表記を出す',async ({page})=>{
  // API規約の Use of Trademarks：アプリの題名やロゴに名前・商標を使わない（出典としての表記は勧められている）
  await open(page);
  expect(await page.title()).not.toContain('ノーベル');
  await expect(page.locator('h1')).not.toContainText('ノーベル');
  const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
  expect(ogTitle).not.toContain('ノーベル'); expect(ogTitle).not.toMatch(/nobel/i);
  await expect(page.locator('footer')).toContainText('ノーベル財団・Nobel Prize Outreachとは関係ありません');
  await expect(page.locator('footer')).toContainText('アルフレッド・ノーベル記念スウェーデン国立銀行経済学賞');
  await expect(page.locator('footer a[href*="terms-of-use-for-api"]')).toHaveCount(1);
});
test('合成応答で発表が進む・英語名と年齢のデータ待ち',async ({page})=>{
  const sample=structuredClone(prizes);
  sample.nobelPrizes.find(p=>p.category.en==='Physics').laureates=[{id:'999901',knownName:{en:'Test Laureate A'}}];
  knobs.get(page).prizes=sample; await open(page);
  await expect(page.locator('[data-cat="phy"].announcement')).toContainText('発表済み');
  await expect(page.locator('[data-cat="phy"].announcement')).toContainText('Test Laureate A · 年齢はデータ待ち');
});
test('APIが500でも答えは出る・今年だけ失敗・再試行',async ({page})=>{
  // fetchが受けるHTTP500を再現する。ブラウザ自身のHTTPエラーログを発生させず、
  // アプリのpageerrorとconsole.errorはafterEachで他の試験と同じく0件を確認する。
  await page.addInitScript(()=>{
    const nativeFetch=window.fetch.bind(window);
    window.__failCurrent=true;
    window.fetch=(url, options)=>window.__failCurrent && String(url).startsWith('https://api.nobelprize.org/')
      ? Promise.resolve(new Response('{}',{status:500,headers:{'Content-Type':'application/json'}})) : nativeFetch(url, options);
  });
  await open(page); await age(page,'26');
  await expect(page.locator('#answer')).toHaveAttribute('aria-label','26歳で受賞した人は、まだいません');
  await expect(page.locator('#current')).toHaveAttribute('data-live','error');
  await expect(page.locator('#live-note')).toContainText('今年の受賞者を取得できませんでした');
  await page.evaluate(()=>{window.__failCurrent=false;});await page.getByRole('button',{name:'もう一度取りにいく'}).click();
  await expect(page.locator('#current')).toHaveAttribute('data-live','ready');
});
test('新しい保存分は通信せず、前回の年齢も戻る',async ({page})=>{
  await open(page);await age(page,'26');outside.set(page,[]);await page.reload();
  await expect(page.locator('#current')).toHaveAttribute('data-live','stale');
  await expect(page.locator('#live-note')).toContainText('19時00分に取った分を表示しています');
  await expect(page.locator('#age')).toHaveValue('26');expect(outside.get(page)).toEqual([]);
  await age(page,'');await page.reload();await expect(page.locator('#age')).toHaveValue('');
});
test('期限切れ保存分は取得失敗時も残る',async ({page})=>{
  await open(page);
  await page.addInitScript(()=>{
    const nativeFetch=window.fetch.bind(window);
    window.fetch=(url,options)=>String(url).startsWith('https://api.nobelprize.org/')?Promise.resolve(new Response('{}',{status:500})):nativeFetch(url,options);
  });
  await open(page,'2026-10-06T19:31:00+09:00');
  await expect(page.locator('#current')).toHaveAttribute('data-live','stale');
  await expect(page.locator('#live-note')).toContainText('保存分で表示しています');
  await expect(page.locator('.announcement[data-cat="med"]')).toContainText('54歳');
});
test('10月13日から年の見出しで、発表日時を外す',async ({page})=>{
  await open(page,'2026-10-13T00:00:00+09:00');
  await expect(page.locator('#current-title')).toHaveText('2026年の受賞者');await expect(page.locator('.schedule')).toHaveCount(0);
});
test('結果の共有とコピーは題名とURLを渡す',async ({page,context})=>{
  await context.grantPermissions(['clipboard-read','clipboard-write']);await open(page);await age(page,'26');
  const href=new URL(await page.locator('#result-x').getAttribute('href'));
  expect(href.hostname).toBe('x.com');expect(href.searchParams.get('text')).toBe('26歳で受賞した人は、1901年からまだいません。— その歳で、受賞した人');
  expect(href.searchParams.get('url')).toBe('https://hundred-days.pages.dev/day-059-laureate-age/');
  await page.getByRole('button',{name:'文をコピー',exact:true}).click();await expect(page.locator('#copy-note')).toHaveText('コピーしました');
  expect(await page.evaluate(()=>navigator.clipboard.readText())).toContain(href.searchParams.get('text'));
});
for(const width of [390,768,1280]) for(const colorScheme of ['light','dark']) test(`${width}px・${colorScheme}で横スクロールなし・操作44px`,async ({page})=>{
  await page.setViewportSize({width,height:900});await page.emulateMedia({colorScheme});await open(page);await age(page,'26');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBe(0);
  const heights=await page.locator('button:visible,.result-share a:visible').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().height));
  expect(heights.every(height=>height>=44)).toBe(true);
  await page.screenshot({path:test.info().outputPath(`day059-${width}-${colorScheme}.png`),fullPage:true});
});
test('入力や分野の変更で外部通信せず、通信先は公式API2本のみ',async ({page})=>{
  await open(page);await age(page,'54');await age(page,'26');await page.locator('#categories [data-cat="phy"]').click();
  const urls=outside.get(page);expect(urls).toHaveLength(2);
  expect(urls.map(url=>new URL(url).pathname).sort()).toEqual(['/2.1/laureates','/2.1/nobelPrizes']);
  for(const url of urls) expect([...new URL(url).searchParams.keys()].sort()).toEqual(['limit','nobelPrizeYear']);
});
