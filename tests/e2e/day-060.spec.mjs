import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { checkRights } from '../../day-060-prize-explained/lib/rights-check.js';
const APP = '/day-060-prize-explained/';
const fixture = (name) => JSON.parse(readFileSync(new URL(`../../day-060-prize-explained/tests/fixtures/${name}.json`, import.meta.url)));
// 既定は物理学賞の発表後（2026-10-06 18:53 の実応答）。発表前の応答（18:45）は「データ待ち」の確認に使う
const prizes = fixture('prizes-2026-1006-physics'), laureates = fixture('laureates-2026-1006-physics');
const prizesBefore = fixture('prizes-2026-1006'), laureatesBefore = fixture('laureates-2026-1006');
const chemistryPrizes = fixture('prizes-2026-1007-chemistry'), chemistryLaureates = fixture('laureates-2026-1007-chemistry');
const commentary = fixture('commentary-test');
const realCommentary = JSON.parse(readFileSync(new URL('../../day-060-prize-explained/data/commentary.json',import.meta.url)));
const officialSlugs = {med:'medicine',phy:'physics',che:'chemistry',lit:'literature',pea:'peace',eco:'economic-sciences'};
const errors = new WeakMap(), outside = new WeakMap(), knobs = new WeakMap();
test.beforeEach(async ({ page }) => {
  errors.set(page, []); outside.set(page, []); knobs.set(page, { status: 200, prizes, laureates, commentary: structuredClone(commentary) });
  page.on('pageerror', (error) => errors.get(page).push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.get(page).push(message.text()); });
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/data/commentary.json') && knobs.get(page).realCommentary) return route.continue();
    if (url.pathname.endsWith('/data/commentary.json')) return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(knobs.get(page).commentary)});
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
  await expect(page.locator('#week')).not.toHaveAttribute('data-live', 'loading');
}
async function age(page, value) { await page.locator('#age-input').fill(value); }
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
  await expect(page.locator('#answer')).toContainText('のべ1,001回のうち3回');
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
  await expect(page.locator('#age-input')).toHaveValue('25');
  await expect(page.locator('#answer')).toHaveAttribute('aria-label','25歳で受賞した人は、2人');
  await expect(page.locator('#answer')).toContainText('ローレンス・ブラッグ');
  await expect(page.locator('#matches')).toContainText('ローレンス・ブラッグ');
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
  await expect(page.locator('#age-input')).toHaveAttribute('aria-invalid','true'); await expect(page.locator('#result-share')).toBeHidden();
});
test('発表前・発表済み・データ待ちを固定時計で区別',async ({page})=>{
  Object.assign(knobs.get(page),{prizes:prizesBefore,laureates:laureatesBefore});
  await open(page,'2026-10-05T18:29:59+09:00'); await expect(page.locator('[data-cat="med"].announcement')).toHaveAttribute('data-announcement','waiting');
  await open(page); await expect(page.locator('[data-cat="med"].announcement')).toHaveAttribute('data-announcement','announced');
  await expect(page.locator('[data-cat="med"].announcement')).not.toContainText('歳');
  await expect(page.locator('[data-cat="phy"].announcement')).toHaveAttribute('data-announcement','pending');
  await expect(page.locator('[data-cat="phy"].announcement')).toContainText('発表予定の時刻を過ぎました。結果がデータに入りしだい出ます');
  await expect(page.locator('[data-cat="che"].announcement')).toContainText('10月7日（水） 18時45分以降の予定');
  await expect(page.locator('[data-cat="pea"].announcement')).toContainText('10月9日（金） 18時の予定');
});
test('物理学賞の発表後は名前リンク・年齢検索だけ82歳で出る',async ({page})=>{
  await open(page,'2026-10-06T21:00:00+09:00');
  await expect(page.locator('[data-cat="phy"].announcement')).toHaveAttribute('data-announcement','announced');
  await expect(page.locator('[data-cat="phy"].announcement')).toContainText('フランシス・ハルツェン ↗');
  await age(page,'82'); await expect(page.locator('#matches .laureate').first()).toContainText('フランシス・ハルツェン');
});
test('合成応答で発表が進む・英語名のリンクを出す',async ({page})=>{
  const sample=structuredClone(prizes);
  sample.nobelPrizes.find(p=>p.category.en==='Physics').laureates=[{id:'999901',knownName:{en:'Test Laureate A'}}];
  knobs.get(page).prizes=sample; await open(page);
  await expect(page.locator('[data-cat="phy"].announcement')).toContainText('発表済み');
  await expect(page.locator('[data-cat="phy"].announcement')).toContainText('Test Laureate A ↗');
});
test('APIが500でも同梱の受賞者と解説が出る・再試行',async ({page})=>{
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
  await expect(page.locator('#week')).toHaveAttribute('data-live','error');
  await expect(page.locator('#today .prize-card')).toHaveAttribute('data-cat','phy');
  await expect(page.locator('#week .announcement[data-cat=med] details .prize-card')).toHaveAttribute('data-commentary','ready');
  await expect(page.locator('#live-note')).toContainText('今年の受賞者を取得できませんでした');
  await page.evaluate(()=>{window.__failCurrent=false;});await page.getByRole('button',{name:'もう一度取りにいく'}).click();
  await expect(page.locator('#week')).toHaveAttribute('data-live','ready');
});
test('新しい保存分は通信せず、前回の年齢も戻る',async ({page})=>{
  await open(page);await age(page,'26');outside.set(page,[]);await page.reload();
  await expect(page.locator('#week')).toHaveAttribute('data-live','stale');
  await expect(page.locator('#live-note')).toContainText('19時00分に取った分を表示しています');
  await expect(page.locator('#age-input')).toHaveValue('26');expect(outside.get(page)).toEqual([]);
  await age(page,'');await page.reload();await expect(page.locator('#age-input')).toHaveValue('');
});
test('期限切れ保存分は取得失敗時も残る',async ({page})=>{
  await open(page);
  await page.addInitScript(()=>{
    const nativeFetch=window.fetch.bind(window);
    window.fetch=(url,options)=>String(url).startsWith('https://api.nobelprize.org/')?Promise.resolve(new Response('{}',{status:500})):nativeFetch(url,options);
  });
  await open(page,'2026-10-06T19:31:00+09:00');
  await expect(page.locator('#week')).toHaveAttribute('data-live','stale');
  await expect(page.locator('#live-note')).toContainText('保存分で表示しています');
  await expect(page.locator('.announcement[data-cat="med"]')).not.toContainText('歳');
});
test('10月13日から年の見出しで、発表日時を外す',async ({page})=>{
  await open(page,'2026-10-13T00:00:00+09:00');
  await expect(page.locator('#week-title')).toHaveText('2026年の受賞者');await expect(page.locator('.schedule')).toHaveCount(0);
});
test('結果の共有とコピーは題名とURLを渡す',async ({page,context})=>{
  await context.grantPermissions(['clipboard-read','clipboard-write']);await open(page);await age(page,'26');
  const href=new URL(await page.locator('#result-x').getAttribute('href'));
  expect(href.hostname).toBe('x.com');expect(href.searchParams.get('text')).toBe('26歳で受賞した人は、1901年からまだいません。— 今年の受賞の解説');
  expect(href.searchParams.get('url')).toBe('https://hundred-days.pages.dev/day-060-prize-explained/');
  await page.getByRole('button',{name:'文をコピー',exact:true}).click();await expect(page.locator('#copy-note')).toHaveText('コピーしました');
  expect(await page.evaluate(()=>navigator.clipboard.readText())).toContain(href.searchParams.get('text'));
});
for(const width of [390,768,1280]) for(const colorScheme of ['light','dark']) test(`${width}px・${colorScheme}で横スクロールなし・操作44px`,async ({page})=>{
  await page.setViewportSize({width,height:900});await page.emulateMedia({colorScheme});await open(page);await age(page,'26');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBe(0);
  const heights=await page.locator('button:visible,.result-share a:visible').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().height));
  expect(heights.every(height=>height>=44)).toBe(true);
  await page.screenshot({path:test.info().outputPath(`day060-${width}-${colorScheme}.png`),fullPage:true});
});
test('入力や分野の変更で外部通信せず、通信先は公式API2本のみ',async ({page})=>{
  await open(page);await age(page,'54');await age(page,'26');await page.locator('#categories [data-cat="phy"]').click();
  const urls=outside.get(page);expect(urls).toHaveLength(2);
  expect(urls.map(url=>new URL(url).pathname).sort()).toEqual(['/2.1/laureates','/2.1/nobelPrizes']);
  for(const url of urls) expect([...new URL(url).searchParams.keys()].sort()).toEqual(['limit','nobelPrizeYear']);
});

test('物理後は先頭が物理・今日の受賞・解説なしは準備中',async({page})=>{
  await open(page,'2026-10-06T19:00:00+09:00');
  await expect(page.locator('#today-title')).toHaveText('今日の受賞');
  await expect(page.locator('#today .prize-card')).toHaveAttribute('data-cat','phy');
  await expect(page.locator('#today .prize-card')).toHaveAttribute('data-commentary','pending');
  await expect(page.locator('#today')).toContainText('この賞の解説は準備中です。公式の発表と論文で事実を確かめてから載せます。');
  await expect(page.locator('#today')).toContainText('フランシス・ハルツェン ↗');
  await expect(page.locator('#today [lang=en]')).toHaveText(prizes.nobelPrizes.find(p=>p.category.en==='Physics').laureates[0].motivation.en);
  await expect(page.locator('#week .announcement[data-cat=phy]')).toContainText('上に表示中');
  await expect(page.locator('#pulse,#current')).toHaveCount(0);
  expect(await page.locator('#app').evaluate(node=>[...node.children].map(n=>n.id||n.tagName.toLowerCase()))).toEqual(['header','boot-note','noscript','today','week','age','footer']);
});
test('化学後は先頭が化学、翌朝は最新の見出し',async({page})=>{
  Object.assign(knobs.get(page),{prizes:chemistryPrizes,laureates:chemistryLaureates});
  await open(page,'2026-10-07T19:05:00+09:00');
  await expect(page.locator('#today .prize-card')).toHaveAttribute('data-cat','che');
  await expect(page.locator('#today-title')).toHaveText('今日の受賞');
  await open(page,'2026-10-08T10:00:00+09:00');
  await expect(page.locator('#today .prize-card')).toHaveAttribute('data-cat','che');
  await expect(page.locator('#today-title')).toHaveText('いちばん新しい受賞');
});
test('医学のみの応答では医学が先頭、確認日と期待の札がある',async({page})=>{
  Object.assign(knobs.get(page),{prizes:prizesBefore,laureates:laureatesBefore});
  await open(page);
  await expect(page.locator('#today .prize-card')).toHaveAttribute('data-cat','med');
  await expect(page.locator('#today .prize-card')).toHaveAttribute('data-commentary','ready');
  await expect(page.locator('#today')).toContainText('テスト用の作り話');
  await expect(page.locator('#today')).toContainText('確認日：2026年10月5日');
  await expect(page.locator('#today .expectation-label')).toHaveText('まだ実現していません');
});
test('今週のdetailsを開くと解説が読め、出典番号が対応する欄へ飛ぶ',async({page})=>{
  await open(page);
  const details=page.locator('#week .announcement[data-cat=med] details');
  await details.locator('summary').click();
  await expect(details).toHaveAttribute('open','');
  await expect(details.locator('.headline')).toBeVisible();
  await age(page,'26');
  await expect(details).toHaveAttribute('open','');
  const ref=details.locator('.source-ref').first();
  const href=await ref.getAttribute('href');
  await ref.click();
  expect(new URL(page.url()).hash).toBe(href);
  await expect(page.locator(href)).toContainText('テスト用の論文B');
  const positions=await page.locator(href).evaluate(node=>({top:node.getBoundingClientRect().top,bottom:node.getBoundingClientRect().bottom,height:innerHeight}));
  expect(positions.top).toBeGreaterThanOrEqual(0);expect(positions.top).toBeLessThan(positions.height);
  const ids=await page.locator('[id]').evaluateAll(nodes=>nodes.map(n=>n.id));expect(new Set(ids).size).toBe(ids.length);
});
test('解説JSONの取得に失敗しても受賞者と準備中を表示する',async({page})=>{
  await page.route('**/data/commentary.json',route=>route.fulfill({status:200,contentType:'application/json',body:'broken JSON'}));
  await open(page);
  await expect(page.locator('#today .prize-card')).toHaveAttribute('data-commentary','pending');
  await expect(page.locator('#week .announcement[data-cat=med]')).toContainText('準備中');
});
test('解説の共有はひとこと・年数と公開URL',async({page})=>{
  Object.assign(knobs.get(page),{prizes:prizesBefore,laureates:laureatesBefore});await open(page);
  const url=new URL(await page.locator('#today .commentary-share').getAttribute('href'));
  expect(url.hostname).toBe('x.com');expect(url.searchParams.get('text')).toContain(commentary.entries.med.headline);
  expect(url.searchParams.get('text')).toContain('24年');expect(url.searchParams.get('url')).toBe('https://hundred-days.pages.dev/day-060-prize-explained/');
});
async function rightsSnapshot(page) {
  const snapshot=await page.evaluate(()=>{
    const titles=[document.title,...[...document.querySelectorAll('h1,h2,h3,h4,h5,h6,meta[property="og:title"],meta[name="share:text"],meta[name="description"]')].map(n=>n.content||n.textContent)];
    let firstScreen='';const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()) {
      const node=walker.currentNode,parent=node.parentElement;
      if(!parent || parent.closest('script,style') || getComputedStyle(parent).visibility==='hidden')continue;
      const range=document.createRange();range.selectNodeContents(node);
      if([...range.getClientRects()].some(r=>r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth))firstScreen+=node.textContent;
    }
    return {titles,firstScreen,origin:location.origin,mediaCount:document.querySelectorAll('img,video,audio,iframe').length,links:[...document.querySelectorAll('a[href]')].map(n=>n.href),requests:[],cards:[...document.querySelectorAll('.prize-card')].map(n=>({state:n.dataset.commentary,mode:n.dataset.mode,cat:n.dataset.cat,note:n.querySelector('.commentary-note')?.textContent||'',expected:!!n.querySelector('.commentary-expected'),labels:[...n.querySelectorAll('.expectation-label')].map(v=>v.textContent),headings:[...n.querySelectorAll('h4')].map(v=>v.textContent)}))};
  });
  snapshot.requests=outside.get(page);
  return snapshot;
}
async function openFacts(page) {
  const sample=structuredClone(chemistryPrizes);
  for(const [cat,en,date] of [['lit','Literature','2026-10-08'],['pea','Peace','2026-10-09']]) {
    const p=sample.nobelPrizes.find(p=>p.category.en===en);
    p.dateAwarded=date;p.laureates=[{id:'999901',knownName:{en:'Test Writer'},motivation:{en:'test fixture only'}}];
    if(cat==='pea')knobs.get(page).commentary.entries.pea=structuredClone(commentary.entries.lit);
  }
  Object.assign(knobs.get(page),{prizes:sample,laureates:chemistryLaureates});await open(page,'2026-10-09T19:00:00+09:00');
}
test('権利の関門a〜f・390×844・readyと文学賞と平和賞のfacts',async({page})=>{
  await page.setViewportSize({width:390,height:844});await openFacts(page);
  expect(checkRights(await rightsSnapshot(page))).toEqual([]);
  for(const cat of ['lit','pea']) {
    const card=page.locator(`.prize-card[data-cat=${cat}]`);
    await expect(card).toHaveAttribute('data-mode','facts');
    await expect(card.locator('h4')).toContainText(['何をした人か（活動の事実）','公式の受賞理由（原文）','出典']);
  }
  await expect(page.locator('.share')).toHaveCount(1);
  await expect(page.locator('link[rel=canonical],meta[property="og:title"]')).toHaveCount(2);
});
for(const [name,code,mutation] of [
  ['a 題名','a',()=>{document.title='Nobel';}],
  ['a 最初の画面','a',()=>{document.querySelector('h1').textContent='ノーベル';}],
  ['b メディア','b',()=>{document.body.append(document.createElement('video'));}],
  ['c 直リンク','c',()=>{const a=document.createElement('a');a.href='https://www.nobelprize.org/uploads/test.pdf';document.body.append(a);}],
  ['d 作者の注記','d',()=>{document.querySelector('.commentary-note').remove();}],
  ['d 確認日','d',()=>{const n=document.querySelector('.commentary-note');n.textContent=n.textContent.replace(/確認日：.*/, '');}],
  ['e 期待の札','e',()=>{document.querySelector('.expectation-label').remove();}],
  ['f factsの見出し','f',()=>{const n=document.createElement('h4');n.textContent='何が変わったか';document.querySelector('.prize-card[data-mode=facts]').append(n);}]
]) test(`壊して確認：${name}`,async({page})=>{
  await page.setViewportSize({width:390,height:844});await openFacts(page);
  expect(checkRights(await rightsSnapshot(page))).toEqual([]);
  await page.evaluate(mutation);
  expect(checkRights(await rightsSnapshot(page)).some(e=>e.startsWith(`${code}:`))).toBe(true);
});
test('壊して確認：b 外部通信の判定',async({page})=>{
  await open(page);const snapshot=await rightsSnapshot(page);snapshot.requests=[...snapshot.requests,'https://outside.example/test.css'];
  expect(checkRights(snapshot).some(e=>e.startsWith('b:'))).toBe(true);
});

test('実データを差し替えず化学後に読む・空なら準備中を検査',async({page})=>{
  Object.assign(knobs.get(page),{prizes:chemistryPrizes,laureates:chemistryLaureates,realCommentary:true});
  await open(page,'2026-10-07T19:05:00+09:00');
  const card=page.locator('#today .prize-card');
  await expect(card).toHaveAttribute('data-cat','che');
  if(Object.keys(realCommentary.entries).length===0) {
    await expect(card).toHaveAttribute('data-commentary','pending');
    await expect(card).toContainText('この賞の解説は準備中です');
    await expect(page.locator('#week .announcement[data-cat=med]')).toContainText('準備中');
    await expect(page.locator('#week .announcement[data-cat=phy]')).toContainText('準備中');
  } else {
    await expect(card).toHaveAttribute('data-commentary','ready');
    for(const cat of ['med','phy']) {
      const details=page.locator(`#week .announcement[data-cat=${cat}] details`);
      await details.locator('summary').click();
      await expect(details.locator('.prize-card')).toHaveAttribute('data-commentary','ready');
      await expect(details.locator('.headline')).toHaveText(realCommentary.entries[cat].headline);
      await expect(details.locator('.commentary-fact').first()).toContainText(realCommentary.entries[cat].what[0].text);
    }
    const refs=page.locator('.prize-card .source-ref');
    expect(await refs.count()).toBeGreaterThan(0);
    for(const ref of await refs.all()) {
      const href=await ref.getAttribute('href'),number=(await ref.textContent()).match(/^\[(\d+)\]$/)[1];
      expect(href.endsWith(`-source-${number}`)).toBe(true);
      await expect(page.locator(href)).toHaveCount(1);
      await expect(page.locator(href).locator('..')).toHaveJSProperty('tagName','OL');
    }
  }
});
test('2件の年数が390pxで縦に並び、出典と共有文が読める',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  Object.assign(knobs.get(page),{prizes:chemistryPrizes,laureates:chemistryLaureates});
  await open(page,'2026-10-07T19:05:00+09:00');
  const card=page.locator('#today .prize-card'),lines=card.locator('.year-line');
  await expect(lines).toHaveCount(2);
  for(const [i,gap] of commentary.entries.che.gap.entries()) {
    await expect(lines.nth(i)).toHaveAttribute('aria-label',`（${gap.label}）${gap.startYear}年から2026年まで${gap.years}年`);
    await expect(card.locator('.gap-item').nth(i)).toContainText(gap.what);
    await expect(card.locator('.gap-item').nth(i).locator('.source-ref')).toHaveCount(1);
  }
  const boxes=await lines.evaluateAll(nodes=>nodes.map(n=>({top:n.getBoundingClientRect().top,bottom:n.getBoundingClientRect().bottom})));
  expect(boxes[1].top).toBeGreaterThan(boxes[0].bottom);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBe(0);
  expect(new URL(await card.locator('.commentary-share').getAttribute('href')).searchParams.get('text')).toContain('論文の出版年と2026年の差：24年・40年。');
});
test('ready・facts・pendingの発表ページはHTMLリンクで44px以上',async({page})=>{
  await open(page);
  await verifyOfficialLinks(page);
  await openFacts(page);
  await verifyOfficialLinks(page);
});
async function verifyOfficialLinks(page) {
  for(const details of await page.locator('#week details').all()) await details.locator('summary').click();
  for(const card of await page.locator('.prize-card').all()) {
    const cat=await card.getAttribute('data-cat'),link=card.locator('.official-link');
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute('href',`https://www.nobelprize.org/prizes/${officialSlugs[cat]}/2026/press-release/`);
    await expect(link).toHaveAttribute('target','_blank');
    await expect(link).toHaveAttribute('rel','noopener noreferrer');
    if(await link.isVisible())expect((await link.boundingBox()).height).toBeGreaterThanOrEqual(44);
  }
  expect(checkRights(await rightsSnapshot(page)).filter(e=>e.startsWith('c:'))).toEqual([]);
}

test('解説の名前に年齢を出さず、年齢検索には82歳を出す',async({page})=>{
  await open(page);await age(page,'82');
  for(const row of await page.locator('#today .person,#week .person').all()) {
    await expect(row).not.toContainText(/歳|年齢|生まれ|団体/);
    const link=row.locator('a.person-link');await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute('href',/^https:\/\/www\.nobelprize\.org\/laureate\/\d+$/);
    await expect(link).toHaveAttribute('aria-label',/の公式の紹介ページ（外部サイト）$/);
    await expect(link).toHaveAttribute('target','_blank');await expect(link).toHaveAttribute('rel','noopener noreferrer');
    await expect(link).toContainText('↗');
  }
  await expect(page.locator('#today .same-age,#week .same-age')).toHaveCount(0);
  await expect(page.locator('#matches .laureate').first()).toContainText('82歳');
});
test('移動リンク4本・上に表示中・解説の開閉と重複しないカード',async({page})=>{
  await open(page);
  const jump=page.locator('nav.jump');await expect(jump).toHaveAttribute('aria-label','ページ内の移動');
  await expect(jump.locator('a')).toHaveText(['今日の受賞','今週の発表','その歳で、受賞した人','数え方・データの出典']);
  for(const id of ['today','week','age','rules']) {
    const link=jump.locator(`a[href="#${id}"]`);await expect(link).toHaveCount(1);await expect(page.locator(`#${id}`)).toHaveCount(1);
    expect((await link.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await link.click();expect(new URL(page.url()).hash).toBe(`#${id}`);
  }
  const above=page.locator('.shown-above');await expect(above).toHaveAttribute('href','#today');
  await above.click();expect(new URL(page.url()).hash).toBe('#today');
  const details=page.locator('#week .announcement[data-cat=med] details'),summary=details.locator('summary');
  await expect(summary.locator('.when-closed')).toBeVisible();await expect(summary.locator('.when-open')).toBeHidden();
  await summary.click();await expect(summary.locator('.when-closed')).toBeHidden();await expect(summary.locator('.when-open')).toBeVisible();
  await expect(details.locator('.person,.prize-heading,h3')).toHaveCount(0);
  await expect(details.locator('h4')).toHaveText(['何をした人か','何が変わったか','これから期待されていること','発見から受賞まで','公式の受賞理由（原文）','出典']);
  await summary.click();await expect(summary.locator('.when-closed')).toBeVisible();await expect(summary.locator('.when-open')).toBeHidden();
  await expect(page.locator('#current-year')).toHaveText('2026年の発表');
  await expect(page.locator('#live-note')).toHaveText('10月6日 19時00分に公式データを確認しました。');
  await page.reload();await expect(page.locator('#live-note')).toHaveText('10月6日 19時00分に取った分を表示しています。');
});
test('390×844の本文幅・番号の高さ・行高・カード内外の文字サイズ',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  Object.assign(knobs.get(page),{prizes:chemistryPrizes,laureates:chemistryLaureates});
  await open(page,'2026-10-07T19:05:00+09:00');
  const details=page.locator('#week .announcement[data-cat=med] details');await details.locator('summary').click();
  const widths=await page.locator('.commentary-fact li:visible').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().width));
  expect(widths.length).toBeGreaterThan(0);expect(widths.every(w=>w>=300)).toBe(true);
  const heights=await page.locator('.source-ref:visible').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThan(0);expect(heights.every(h=>h<=22)).toBe(true);
  const measurements=await page.locator('.commentary-fact li:visible').evaluateAll(nodes=>nodes.map(n=>{
    // 同じ一行の文で番号がある場合と無い場合を比較し、折り返しによる高さの差を除く。
    const withRef=n.cloneNode(true),withoutRef=n.cloneNode(true);
    for(const copy of [withRef,withoutRef]) {
      const refs=copy.querySelector('.refs');copy.replaceChildren(document.createTextNode('事実です。\u2060'),refs);
    }
    withoutRef.querySelector('.refs').remove();
    const list=n.parentNode;list.append(withRef,withoutRef);
    const result={withRef:withRef.getBoundingClientRect().height,withoutRef:withoutRef.getBoundingClientRect().height};
    withRef.remove();withoutRef.remove();return result;
  }));
  for(const m of measurements)expect(Math.abs(m.withRef-m.withoutRef)).toBeLessThanOrEqual(1);
  for(const selector of ['.headline','.commentary-note','.small','h4']) {
    const sizes=[];
    for(const card of [page.locator('#today .prize-card'),details.locator('.prize-card')])sizes.push(await card.locator(selector).first().evaluate(n=>getComputedStyle(n).fontSize));
    expect(sizes).toEqual([selector==='.headline'?'18px':selector==='h4'?'16px':'12px',selector==='.headline'?'18px':selector==='h4'?'16px':'12px']);
  }
  expect(await page.locator('.prize-card .prose wbr').count()).toBeGreaterThan(0);
  await expect(page.locator('.prize-card .prose[lang=en] wbr')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBe(0);
});
test('実データの英語の印と自然な折り返し',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  Object.assign(knobs.get(page),{prizes:chemistryPrizes,laureates:chemistryLaureates,realCommentary:true});
  await open(page,'2026-10-07T19:05:00+09:00');
  for(const details of await page.locator('#week details').all())await details.locator('summary').click();
  await expect(page.locator('.source-meta').filter({hasText:'英語'}).first()).toBeVisible();
  // 「企業の発表」の印は、実データには無い（医学賞の開発会社の発表は、本人の判断で外した）。印の表示は単体テストが全8種類で見ている
  const badStarts=await page.locator('.prize-card .prose:visible').evaluateAll(nodes=>{
    const failures=[];
    for(const block of nodes) {
      const lines=new Map(),walker=document.createTreeWalker(block,NodeFilter.SHOW_TEXT);
      while(walker.nextNode()) {
        const node=walker.currentNode;if(node.parentElement.closest('.refs'))continue;
        for(let i=0;i<node.length;i++) {
          const char=node.textContent[i];if(/[\s\u2060]/.test(char))continue;
          const range=document.createRange();range.setStart(node,i);range.setEnd(node,i+1);
          const box=range.getBoundingClientRect();if(!box.width||!box.height)continue;
          const key=Math.round(box.top);if(!lines.has(key))lines.set(key,char);
        }
      }
      for(const char of lines.values())if(/[。、）・ー]/.test(char))failures.push({char,text:block.textContent});
    }
    return failures;
  });
  expect(badStarts).toEqual([]);
  const stranded=await page.locator('.refs:visible').evaluateAll(nodes=>nodes.filter(n=>{
    // 番号は文末の字と同じ行にある（上付きによる数pxの差は許容する）。
    let text=n.previousSibling;
    while(text && text.nodeType!==Node.TEXT_NODE)text=text.lastChild;
    const range=document.createRange();range.setStart(text,text.length-2);range.setEnd(text,text.length-1);
    return Math.abs(n.getBoundingClientRect().top-range.getBoundingClientRect().top)>12;
  }).map(n=>n.textContent));
  expect(stranded).toEqual([]);
});

// DOM Rangeで文字位置を集め、タグをまたぐ語も同じ文字列として検査する。
async function wrappingViolations(page, selector) {
  return page.locator(selector).evaluateAll(blocks => {
    const failures=[];
    const tokens=[/\d{4}年\d{1,2}月(?:\d{1,2}日)?/g,/\d{1,2}月\d{1,2}日/g,
      /約?\d[\d,.]*(?:人|倍|年|件|回|か月|か国|か所|%|機関)/g,
      /[A-Za-z]+ \d[\d+\-]*/g,/[ァ-ヶー]+・[ァ-ヶー]+/g,/確認日：\d{4}年\d{1,2}月\d{1,2}日/g];
    for(const block of blocks) {
      if(block.closest('[lang=en]') || !block.getClientRects().length || getComputedStyle(block).visibility==='hidden')continue;
      let text='';const positions=[],walker=document.createTreeWalker(block,NodeFilter.SHOW_TEXT);
      while(walker.nextNode()) {
        const node=walker.currentNode;
        if(node.parentElement.closest('.refs,[lang=en]'))continue;
        for(let i=0;i<node.length;i++) {
          const char=node.textContent[i];if(char==='\u2060')continue;
          const range=document.createRange();range.setStart(node,i);range.setEnd(node,i+1);
          const rect=[...range.getClientRects()].find(r=>r.width>0 && r.height>0);
          positions.push(rect ? Math.round(rect.top) : null);text+=char;
        }
      }
      const lines=new Map();
      for(let i=0;i<text.length;i++)if(positions[i]!==null && !/\s/.test(text[i]) && !lines.has(positions[i]))lines.set(positions[i],i);
      for(const index of lines.values()) {
        const char=text[index];
        if(/[·、。，．）」』】〕〉》・ー！？ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ]/.test(char))failures.push({rule:'A',char,text});
        // 閉じ括弧のすぐあとの助詞が行頭に来る（「（2018年）／や、」）
        if(index>0 && /[）」』】〕〉》]/.test(text[index-1]) && /[はがをにへでとものや]/.test(char))failures.push({rule:'D',char,text});
      }
      const check=(index,word,rule)=>{
        const rows=new Set(positions.slice(index,index+word.length).filter(p=>p!==null));
        if(rows.size>1)failures.push({rule,word,text});
      };
      // 13字以上のカタカナの名前（アイスキューブ・ジェンツー）は、幅の狭い画面に入りきらないので「・」のあとで折れてよい（lib/render.js の protectHtml と同じ除外）
      for(const token of tokens)for(const m of text.matchAll(token)) {
        if(token.source.startsWith('[ァ-ヶー]') && m[0].length>12)continue;
        check(m.index,m[0],'B');
      }
      for(const part of new Intl.Segmenter('ja',{granularity:'word'}).segment(text))if(part.isWordLike && part.segment.length>=2)check(part.index,part.segment,'C');
    }
    return failures;
  });
}
const wrapTargets='.prize-card .prose,.gap-label,footer p,footer li,.intro,.intro-sub,.schedule';
async function realCards(page, cat='che') {
  Object.assign(knobs.get(page),{prizes:cat==='che'?chemistryPrizes:prizes,laureates:cat==='che'?chemistryLaureates:laureates,realCommentary:true});
  await open(page,cat==='che'?'2026-10-07T19:05:00+09:00':'2026-10-06T19:05:00+09:00');
  for(const details of await page.locator('#week details').all())await details.locator('summary').click();
}
for(const width of [390,768,1280])for(const cat of ['che','phy'])test(`折り返しの関門 ${width}px ${cat}・全カード`,async({page})=>{
  await page.setViewportSize({width,height:844});await realCards(page,cat);
  expect(await wrappingViolations(page,wrapTargets)).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBe(0);
});
test('壊して確認：通常のword-breakで折り返しの関門が落ちる',async({page})=>{
  await page.route('**/app.css',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text())+'\n.prose{word-break:normal}'});});
  await page.setViewportSize({width:390,height:844});await realCards(page);
  expect((await wrappingViolations(page,wrapTargets)).length).toBeGreaterThan(0);
});
test('壊して確認：閉じ括弧のあとの助詞が行頭に来る文を、ルールDが検出する',async({page})=>{
  await page.setViewportSize({width:390,height:844});await realCards(page,'che');
  // 折り位置を <br> で決めた見本を足す（フォントによらず、同じ結果になる）。閉じ括弧の直後で改行すると、助詞が行頭に来る
  await page.evaluate(()=>{
    for(const [id,html] of [['gate-bad','臨床試験（第I・II相）<br>と、2036年の欧州での販売承認です。'],['gate-good','臨床試験（第I・II相）と、<br>2036年の欧州での販売承認です。']]) {
      const p=document.createElement('p');p.id=id;p.className='prose';p.innerHTML=html;document.body.prepend(p);
    }
  });
  expect((await wrappingViolations(page,'#gate-bad')).filter(f=>f.rule==='D').length).toBeGreaterThan(0);
  expect(await wrappingViolations(page,'#gate-good')).toEqual([]);
});
test('390pxの左右余白・本文幅・出典の間隔と区切り',async({page})=>{
  await page.setViewportSize({width:390,height:844});await realCards(page);
  for(const box of await page.locator('.commentary-fact,.commentary-expected').all()) {
    const m=await box.evaluate(n=>{const s=getComputedStyle(n);return [parseFloat(s.paddingLeft),parseFloat(s.paddingRight)];});
    expect(Math.abs(m[0]-m[1])).toBeLessThanOrEqual(1);
    for(const li of await box.locator('li').all())expect((await li.boundingBox()).width).toBeGreaterThanOrEqual(300);
  }
  const gaps=await page.locator('.commentary-sources li').evaluateAll(nodes=>nodes.map(n=>{
    const a=n.querySelector('a'),meta=n.querySelector('.source-meta'),rects=[...a.getClientRects()];
    return {gap:meta.getBoundingClientRect().top-Math.max(...rects.map(r=>r.bottom)),height:Math.max(...rects.map(r=>r.height)),margin:parseFloat(getComputedStyle(n).marginBottom)};
  }));
  for(const m of gaps){expect(m.height).toBeLessThan(40);expect(m.margin).toBe(16);}
  expect(Math.max(...gaps.map(m=>m.gap))-Math.min(...gaps.map(m=>m.gap))).toBeLessThanOrEqual(2);
  expect(await wrappingViolations(page,'.source-meta')).toEqual([]);
});
for(const width of [390,768,1280])test(`階層と部品の一貫性 ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:844});await realCards(page);
  const styles=await page.evaluate(()=>{
    const font=s=>parseFloat(getComputedStyle(document.querySelector(s)).fontSize);
    const answer=getComputedStyle(document.querySelector('.answer'));
    return {h2:font('#today-title'),h3:font('.prize-heading h3'),headline:font('.headline'),answer:font('.answer-number'),h1:font('h1'),borders:[answer.borderTopWidth,answer.borderRightWidth,answer.borderBottomWidth,answer.borderLeftWidth]};
  });
  expect(styles.h2).toBeGreaterThan(styles.h3);expect(styles.h3).toBeGreaterThan(styles.headline);expect(styles.answer).toBeLessThanOrEqual(styles.h1);
  expect(new Set(styles.borders).size).toBe(1);
  for(const button of await page.locator('.share__button').all())expect(await button.evaluate(n=>parseFloat(getComputedStyle(n).borderRadius))).toBeLessThanOrEqual(4);
  for(const row of await page.locator('.announcement').all()) {
    const title=await row.locator('h3').boundingBox(),state=await row.locator('.state').boundingBox();expect(state.y).toBeGreaterThanOrEqual(title.y+title.height);
    if(width>=768 && await row.locator('.person-link').count()) {
      const delta=await row.evaluate(n=>{const glyph=selector=>{const range=document.createRange();range.selectNodeContents(n.querySelector(selector));return range.getClientRects()[0].top;};return Math.abs(glyph('h3')-glyph('.person-link'));});
      expect(delta).toBeLessThanOrEqual(3);
    }
  }
});
test('見出しと移動リンク・末尾で閉じる・下線とフッターのinline',async({page})=>{
  for(const at of ['2026-10-07T19:05:00+09:00','2026-10-08T10:00:00+09:00']) {
    Object.assign(knobs.get(page),{prizes:chemistryPrizes,laureates:chemistryLaureates});await open(page,at);
    await expect(page.locator('.jump a[href="#today"]')).toHaveText(await page.locator('#today-title').textContent());
  }
  const details=page.locator('#week details').first(),summary=details.locator('summary');await summary.click();
  const close=details.locator('.close-card');expect((await close.boundingBox()).height).toBeGreaterThanOrEqual(44);await close.click();
  await expect(details).not.toHaveAttribute('open','');await expect(summary).toBeFocused();await expect(summary).toBeInViewport();
  await expect(page.locator('#today .close-card')).toHaveCount(0);
  expect(await summary.evaluate(n=>getComputedStyle(n).textDecorationLine)).toBe('none');
  expect(await summary.locator('.when-closed').evaluate(n=>getComputedStyle(n).textDecorationLine)).toBe('underline');
  for(const a of await page.locator('footer p a,footer li a').all())expect(await a.evaluate(n=>getComputedStyle(n).display)).toBe('inline');
});
test('390pxで化学賞の2人が同じ行に並ぶ',async({page})=>{
  await page.setViewportSize({width:390,height:844});await realCards(page);
  for(const selector of ['#today .persons','#week .announcement[data-cat=che] .persons']) {
    const links=page.locator(selector+' .person-link');await expect(links).toHaveCount(2);
    expect(Math.abs((await links.nth(0).boundingBox()).y-(await links.nth(1).boundingBox()).y)).toBeLessThanOrEqual(1);
  }
});
async function delayedCLS(page, broken=false) {
  Object.assign(knobs.get(page),{prizes:chemistryPrizes,laureates:chemistryLaureates,realCommentary:true});
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(()=>{window.layoutShiftTotal=0;new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)window.layoutShiftTotal+=e.value;}).observe({type:'layout-shift',buffered:true});});
  let apiAnswered=false;
  await page.route('https://api.nobelprize.org/**',async route=>{
    await new Promise(resolve=>setTimeout(resolve,1500));
    apiAnswered=true;
    const url=new URL(route.request().url());await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(url.pathname.endsWith('/nobelPrizes')?chemistryPrizes:chemistryLaureates)});
  });
  if(broken)await page.route('**/app.css',async route=>{const response=await route.fetch();const body=(await response.text()).replace(/#app\[data-state="loading"\] > section, #app\[data-state="loading"\] > footer \{ visibility:hidden; \}/,'');await route.fulfill({response,body});});
  await page.goto(`${APP}?now=${encodeURIComponent('2026-10-07T19:05:00+09:00')}`);
  // 公式データの返事（1.5秒後）を待たずに、同梱の記録で解説カードが出る＝遅い回線でページを隠したまま待たせない
  await expect(page.locator('#today-card .prize-card')).toBeVisible({timeout:1000});
  expect(apiAnswered).toBe(false);
  await expect(page.locator('#app')).toHaveAttribute('data-state','ready');
  // 取得が終わって画面が落ち着くまで待ってから、ずれの合計を読む
  await expect(page.locator('#live-note')).toContainText('公式データを確認しました',{timeout:5000});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  return page.evaluate(()=>window.layoutShiftTotal);
}
test('遅延1.5秒のAPIでも、解説は先に出て、CLSが0.05未満',async({page})=>expect(await delayedCLS(page)).toBeLessThan(0.05));
test('壊して確認：visibilityを消すとCLSが0.1を超える',async({page})=>expect(await delayedCLS(page,true)).toBeGreaterThan(0.1));
