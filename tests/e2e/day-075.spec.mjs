import {expect,test} from '@playwright/test';
import {LEVELS,SOLUTIONS} from '../../day-075-amegumo-sokoban/lib/levels.js';
import {createState,move} from '../../day-075-amegumo-sokoban/lib/game.js';
import {campaignEvents} from '../../day-075-amegumo-sokoban/lib/campaign-view.js';

const base='/day-075-amegumo-sokoban/';
const publicURL='https://rairakku.com/100days'+base;
const progressKey='amegumo-sokoban.v1',guideKey='amegumo-sokoban.guide.v1',audioKey='amegumo-sokoban.audio.v1';
const keys={up:'ArrowUp',right:'ArrowRight',down:'ArrowDown',left:'ArrowLeft'};
const legacy=Object.fromEntries(LEVELS.slice(0,3).map(level=>[level.id,level.par]));
const pageErrors=new WeakMap();
const externalRequests=new WeakMap();
test.use({reducedMotion:'reduce'});
test.beforeEach(async({page,baseURL})=>{
 const errors=[],external=[];pageErrors.set(page,errors);externalRequests.set(page,external);
 page.on('pageerror',error=>errors.push(error.message));
 const origin=new URL(baseURL).origin;
 page.on('request',request=>{if(!request.url().startsWith(origin+'/')&&!/^(data|blob):/.test(request.url()))external.push(request.url());});
});
test.afterEach(async({page})=>{
 expect(pageErrors.get(page)).toEqual([]);
 expect(externalRequests.get(page)).toEqual([]);
});
async function open(page,{seen=true,progress}={}){
 await page.addInitScript(({seen,progress,guideKey,progressKey})=>{
  if(seen)localStorage.setItem(guideKey,'1');
  if(progress&&sessionStorage.getItem('day075-seeded')!=='1'){
   localStorage.setItem(progressKey,JSON.stringify(progress));sessionStorage.setItem('day075-seeded','1');
  }
 },{seen,progress,guideKey,progressKey});
 await page.goto(base);await expect(page.locator('#garden .gardener')).toBeVisible();
}
async function board(page,index,state){
 const level=LEVELS[index],description=await page.locator('#board-description').textContent();
 expect(Number(await page.locator('#moves').textContent())).toBe(state.moves);
 expect(Number(await page.locator('#rain-left').textContent())).toBe(state.clouds.reduce((sum,cloud)=>sum+cloud.drops,0));
 expect(await page.locator('#garden [data-dew]').evaluateAll(nodes=>nodes.map(node=>node.dataset.collected==='true'))).toEqual(state.collected);
 expect(description).toContain('庭師は上から'+(state.player.y+1)+'行、左から'+(state.player.x+1)+'列。');
 for(const [i,cloud]of state.clouds.entries()){
  expect(description).toContain('雲'+(i+1)+'は'+(cloud.y+1)+'行'+(cloud.x+1)+'列、残り'+cloud.drops+'滴。');
  await expect(page.locator('[data-actor="cloud-'+i+'"]')).toHaveAttribute('transform','translate('+(92+cloud.x*76+38)+' '+(54+cloud.y*76+24)+')');
 }
 level.plots.forEach((plot,i)=>expect(description).toContain('畑'+(i+1)+'は'+(plot.y+1)+'行'+(plot.x+1)+'列、'+state.water[i]+'/'+plot.need+'滴。'));
 await expect(page.locator('#level-name')).toHaveText(level.name);
}
async function navigation(page,index){
 const chapter=Math.floor(index/5);
 expect(await page.locator('[data-chapter]').evaluateAll(nodes=>nodes.map(node=>Number(node.dataset.chapter)))).toEqual([0,1,2,3]);
 await expect(page.locator('[data-chapter][aria-current="true"]')).toHaveAttribute('data-chapter',String(chapter));
 expect(await page.locator('[data-level]').evaluateAll(nodes=>nodes.map(node=>Number(node.dataset.level)))).toEqual(Array.from({length:5},(_,n)=>chapter*5+n));
 await expect(page.locator('[data-level][aria-current="step"]')).toHaveAttribute('data-level',String(index));
 await expect(page.locator('#level-par')).toHaveText(LEVELS[index].par+'手');
}
async function choose(page,index){
 await page.locator('[data-chapter="'+Math.floor(index/5)+'"]').click();
 await page.locator('[data-level="'+index+'"]').click();
 await navigation(page,index);await board(page,index,createState(LEVELS[index]));
}
async function play(page,path){for(const direction of path)await page.keyboard.press(keys[direction]);}
function eventExample(kind){
 for(let index=0;index<LEVELS.length;index++){
  const level=LEVELS[index],path=SOLUTIONS[level.id];let before=createState(level);
  for(let step=0;step<path.length;step++){
   const result=move(level,before,path[step]),events=campaignEvents(before,result.state,level);
   if((kind==='pickup'&&events.collected.length)||(kind==='warp'&&events.warped.length))return {index,prefix:path.slice(0,step),direction:path[step],before,after:result.state};
   before=result.state;
  }
 }
 throw new Error('No solution uses '+kind);
}
function ledgeExample(){
 for(let index=0;index<LEVELS.length;index++){
  const level=LEVELS[index];if(!level.ledges?.length)continue;
  let state=createState(level);const prefix=[];
  for(const direction of [...SOLUTIONS[level.id],null]){
   for(const candidate of Object.keys(keys))if(move(level,state,candidate).reason==='ledge')return {index,prefix:[...prefix],direction:candidate,before:state};
   if(direction===null)break;state=move(level,state,direction).state;prefix.push(direction);
  }
 }
 throw new Error('No reachable reverse ledge push beside an authored solution.');
}
const pickup=eventExample('pickup'),warp=eventExample('warp'),ledge=ledgeExample();
const combinedIndex=LEVELS.findLastIndex(level=>level.ledges?.length&&level.dew?.length&&level.portals?.length);

test('初回の図解で一滴を試し、盤面と旧記録を保って遊び始められる',async({page})=>{
 await open(page,{seen:false,progress:legacy});
 await expect(page.locator('#help-dialog')).toBeVisible();
 await page.keyboard.press('ArrowRight');await board(page,0,createState(LEVELS[0]));
 await page.locator('#guide-next').click();await page.locator('#guide-demo-action').click();
 await expect(page.locator('#guide-demo-count')).toHaveText(/1\s*\/\s*1/);
 await board(page,0,createState(LEVELS[0]));
 await page.locator('#guide-next').click();await page.locator('#guide-next').click();
 await expect(page.locator('#help-dialog')).toBeHidden();
 await expect(page.locator('#best')).toHaveText(legacy[LEVELS[0].id]+'手');
 await page.keyboard.press('ArrowRight');await page.locator('#undo-button').click();
 await board(page,0,createState(LEVELS[0]));
 await page.reload();await expect(page.locator('#garden .gardener')).toBeVisible();
 await expect(page.locator('#help-dialog')).toBeHidden();
 expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),progressKey)).toEqual(legacy);
 await page.locator('#help-button').click();await expect(page.locator('#help-dialog')).toBeVisible();
 await page.locator('#guide-skip').click();await expect(page.locator('#help-dialog')).toBeHidden();
});

test('全20面をキー操作で解き、章をまたいで次へ進み、最後は最初へ戻って記録を保つ',async({page})=>{
 test.setTimeout(90000);expect(LEVELS).toHaveLength(20);
 await open(page,{progress:legacy});
 for(let chapter=0;chapter<4;chapter++){await page.locator('[data-chapter="'+chapter+'"]').click();await navigation(page,chapter*5);}
 await choose(page,0);
 for(let index=0;index<LEVELS.length;index++){
  const level=LEVELS[index],path=SOLUTIONS[level.id];await navigation(page,index);await play(page,path);
  await expect(page.locator('#win-dialog')).toBeVisible();
  const final=path.reduce((state,direction)=>move(level,state,direction).state,createState(level));
  expect(final.won).toBe(true);expect(final.moves).toBe(level.par);await board(page,index,final);
  await expect(page.locator('#win-description')).toContainText('クリア');
  await expect(page.locator('#win-next')).toHaveText(index===19?'最初の庭へ':'次の庭へ');
  await page.locator('#win-next').click();const next=(index+1)%20;
  await navigation(page,next);await board(page,next,createState(LEVELS[next]));
 }
 const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),progressKey);
 expect(Object.keys(saved).sort()).toEqual(LEVELS.map(level=>level.id).sort());
 for(const level of LEVELS)expect(saved[level.id]).toBe(level.par);
 for(const[id,best]of Object.entries(legacy))expect(saved[id]).toBe(best);
 await page.reload();await expect(page.locator('#campaign-progress')).toHaveText('育った庭 20 / 20');
 expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),progressKey)).toEqual(saved);
 for(let chapter=0;chapter<4;chapter++){
  await page.locator('[data-chapter="'+chapter+'"]').click();
  await expect(page.locator('.level-tab.is-complete')).toHaveCount(5);
  expect(await page.locator('.tab-achieved').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).display!=='none'&&node.getBoundingClientRect().width>0))).toBe(true);
  await expect(page.locator('#chapter-progress')).toHaveText('この章 5 / 5');
 }
});

for(const[kind,event]of [['pickup',pickup],['warp',warp]])test(kind+'の位置・残り雨は一手戻すと復元され、やり直しで初期化される',async({page})=>{
 await open(page);await choose(page,event.index);await play(page,event.prefix);await board(page,event.index,event.before);
 await page.keyboard.press(keys[event.direction]);await board(page,event.index,event.after);
 await expect(page.locator('#status')).toHaveText(kind==='pickup'?/雨玉.*1滴/:/風穴/);
 await expect(page.locator('#garden [data-motion-fx]')).toHaveCount(0);
 await page.locator('#undo-button').click();await board(page,event.index,event.before);
 await page.keyboard.press(keys[event.direction]);await board(page,event.index,event.after);
 await page.locator('#reset-button').click();await page.locator('#reset-confirm').click();
 await board(page,event.index,createState(LEVELS[event.index]));
});

test('石段の逆向き押しは手数・雲・雨玉を変えず、理由を知らせる',async({page})=>{
 await open(page);await choose(page,ledge.index);await play(page,ledge.prefix);await board(page,ledge.index,ledge.before);
 await page.keyboard.press(keys[ledge.direction]);await board(page,ledge.index,ledge.before);
 await expect(page.locator('#status')).toHaveText(/石段.*矢印/);
});

test('通常の雨玉と風穴の演出は、戻す操作や章の移動で取り消せる',async({page})=>{
 await open(page);await page.emulateMedia({reducedMotion:'no-preference'});
 await choose(page,pickup.index);await play(page,pickup.prefix);await page.waitForTimeout(200);
 await page.keyboard.press(keys[pickup.direction]);await expect(page.locator('[data-pickup-fx]')).toHaveCount(1);
 await page.locator('#undo-button').click();await board(page,pickup.index,pickup.before);
 await expect(page.locator('[data-motion-fx]')).toHaveCount(0);
 await page.waitForTimeout(700);await expect(page.locator('[data-motion-fx]')).toHaveCount(0);
 await choose(page,warp.index);await play(page,warp.prefix);await page.waitForTimeout(200);
 await page.keyboard.press(keys[warp.direction]);await expect(page.locator('[data-warp-fx]')).toHaveCount(2);
 const chapter=(Math.floor(warp.index/5)+1)%4;await page.locator('[data-chapter="'+chapter+'"]').click();
 await board(page,chapter*5,createState(LEVELS[chapter*5]));await expect(page.locator('[data-motion-fx]')).toHaveCount(0);
 await page.waitForTimeout(700);await expect(page.locator('#win-dialog')).toBeHidden();
});

for(const width of [390,768,1440])test(width+'pxで四章・五面と全仕掛けの表示が収まり、操作は44px以上ある',async({page})=>{
 await page.setViewportSize({width,height:width===390?844:1000});await open(page);expect(combinedIndex).toBeGreaterThanOrEqual(0);
 await choose(page,combinedIndex);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
 const sizes=await page.locator('#chapter-tabs button,#level-tabs button,#dpad button').evaluateAll(nodes=>nodes.map(node=>({width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height})));
 for(const size of sizes){expect(size.width).toBeGreaterThanOrEqual(44);expect(size.height).toBeGreaterThanOrEqual(44);}
 await expect(page.locator('#mechanic-legend')).toContainText('石段');await expect(page.locator('#mechanic-legend')).toContainText('雨玉');await expect(page.locator('#mechanic-legend')).toContainText('風穴');
 await expect(page.locator('[data-portal]')).toHaveCount(2);
 await expect(page.locator('[data-dew][data-collected="false"]')).toHaveCount(LEVELS[combinedIndex].dew.length);
 await page.evaluate(()=>scrollTo({top:0,left:0,behavior:'instant'}));
 expect(await page.locator('.skip-link').evaluate(node=>node.matches(':focus')||node.getBoundingClientRect().bottom>0)).toBe(false);
 await test.info().attach('day075-'+width,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
});

test('音は操作で始まり、オン・オフと保存後の再開でAudioContextが重複しない',async({page})=>{
 await page.addInitScript(()=>{
  window.__day075AudioContexts=[];
  const Native=window.AudioContext||window.webkitAudioContext;
  if(Native)window.AudioContext=class extends Native{constructor(...args){super(...args);window.__day075AudioContexts.push(this);}};
 });
 await open(page);expect(await page.evaluate(()=>window.__day075AudioContexts.length)).toBe(0);
 await page.locator('#sound-toggle').click();await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed','true');
 await expect.poll(()=>page.evaluate(()=>window.__day075AudioContexts.map(context=>context.state))).toEqual(['running']);
 await page.locator('#sound-toggle').click();await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed','false');
 expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).enabled,audioKey)).toBe(false);
 await page.locator('#sound-toggle').click();await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed','true');
 expect(await page.evaluate(()=>window.__day075AudioContexts.length)).toBe(1);
 await page.reload();await expect(page.locator('#garden .gardener')).toBeVisible();
 await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed','false');
 expect(await page.evaluate(()=>window.__day075AudioContexts.length)).toBe(0);
 await page.keyboard.press('ArrowRight');await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed','true');
 await expect.poll(()=>page.evaluate(()=>window.__day075AudioContexts.map(context=>context.state))).toEqual(['running']);
 await board(page,0,move(LEVELS[0],createState(LEVELS[0]),'right').state);
});

test('URLや端末保存値をHTMLとして実行せず、共有には正規URLだけを渡す',async({page})=>{
 const payload='<img data-day075-injected src=x onerror="window.__day075Injected=true">';
 await page.addInitScript(({payload,progressKey,audioKey,guideKey})=>{
  window.__day075Injected=false;localStorage.setItem(guideKey,'1');
  localStorage.setItem(progressKey,JSON.stringify({'first-rain':payload,'return-rain':9,[payload]:1,['__proto__']:{polluted:true}}));
  localStorage.setItem(audioKey,JSON.stringify({enabled:payload,music:payload,effects:payload}));
 },{payload,progressKey,audioKey,guideKey});
 await page.goto(base+'?garden='+encodeURIComponent(payload)+'#'+encodeURIComponent(payload));
 await expect(page.locator('#garden .gardener')).toBeVisible();await board(page,0,createState(LEVELS[0]));
 await expect(page.locator('#best')).toHaveText('—');await expect(page.locator('[data-day075-injected]')).toHaveCount(0);
 expect(await page.evaluate(()=>window.__day075Injected)).toBe(false);
 expect(await page.evaluate(()=>Object.prototype.polluted)).toBeUndefined();
 await choose(page,1);await expect(page.locator('#best')).toHaveText('9手');
 await page.getByRole('button',{name:'このアプリを共有する',exact:true}).click();
 const x=new URL(await page.locator('.share').getByRole('link',{name:'Xで投稿'}).getAttribute('href'));
 expect(x.searchParams.get('url')).toBe(publicURL);expect(x.searchParams.get('text')).not.toContain(payload);
 await expect(page.locator('[data-day075-injected]')).toHaveCount(0);
 expect(await page.evaluate(()=>window.__day075Injected)).toBe(false);
});
