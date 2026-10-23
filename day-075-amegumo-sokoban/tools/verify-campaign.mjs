import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {LEVELS,SOLUTIONS} from '../lib/levels.js';
import {createState,move} from '../lib/game.js';
import {campaignEvents} from '../lib/campaign-view.js';

assert.equal(LEVELS.length,20,'Campaign content must be ready before browser verification.');
const modulePath=process.env.PLAYWRIGHT_MODULE;
const pw=await import(modulePath?pathToFileURL(modulePath).href:'playwright');
const url=process.env.TEST_URL||'http://127.0.0.1:4173/day-075-amegumo-sokoban/';
const out=fileURLToPath(new URL('../../test-results/day075-campaign/',import.meta.url));
const keys={up:'ArrowUp',right:'ArrowRight',down:'ArrowDown',left:'ArrowLeft'};
const directions=Object.keys(keys);
const legacy=Object.fromEntries(LEVELS.slice(0,3).map(level=>[level.id,level.par]));
const results=[];
await mkdir(out,{recursive:true});

function example(kind){
 for(let index=0;index<LEVELS.length;index++){
  const level=LEVELS[index],path=SOLUTIONS[level.id];
  let state=createState(level);
  for(let step=0;step<path.length;step++){
   const result=move(level,state,path[step]),events=campaignEvents(state,result.state,level);
   if((kind==='pickup'&&events.collected.length)||(kind==='warp'&&events.warped.length)){
    return {index,prefix:path.slice(0,step),direction:path[step],before:state,after:result.state,events};
   }
   state=result.state;
  }
 }
 throw new Error('No solution demonstrates '+kind);
}
function ledgeExample(){
 for(let index=0;index<LEVELS.length;index++){
  const level=LEVELS[index];if(!level.ledges?.length)continue;
  let state=createState(level);const prefix=[];
  for(const direction of [...SOLUTIONS[level.id],null]){
   for(const candidate of directions)if(move(level,state,candidate).reason==='ledge')return {index,prefix:[...prefix],direction:candidate,before:state};
   if(direction===null)break;
   state=move(level,state,direction).state;prefix.push(direction);
  }
 }
 // Some authored routes never stand on the forbidden side. Search only for a
 // reachable rejection, with the full resource state and an explicit limit.
 for(let index=0;index<LEVELS.length;index++){
  const level=LEVELS[index];if(!level.ledges?.length)continue;
  const key=s=>JSON.stringify([s.player,s.clouds,s.water,s.collected]);
  const initial=createState(level),queue=[{state:initial,prefix:[]}],seen=new Set([key(initial)]);
  for(let q=0;q<queue.length&&q<100000;q++){
   const {state,prefix}=queue[q];
   for(const direction of directions){
    const result=move(level,state,direction);
    if(result.reason==='ledge')return {index,prefix,direction,before:state};
    if(!result.moved||result.reason==='overwatered'||result.state.won)continue;
    const id=key(result.state);if(seen.has(id))continue;
    seen.add(id);queue.push({state:result.state,prefix:[...prefix,direction]});
   }
  }
 }
 throw new Error('No reachable reverse ledge push was found within the search limit.');
}
const pickup=example('pickup'),warp=example('warp'),ledge=ledgeExample();
const combinedIndex=LEVELS.findLastIndex(level=>level.ledges?.length&&level.dew?.length&&level.portals?.length);
assert(combinedIndex>=0,'The final chapter must include a garden with all three mechanics.');

async function assertBoard(page,index,state){
 const level=LEVELS[index];
 const actual=await page.evaluate(()=>({
  description:document.getElementById('board-description').textContent,
  moves:Number(document.getElementById('moves').textContent),
  rain:Number(document.getElementById('rain-left').textContent),
  collected:[...document.querySelectorAll('#garden [data-dew]')].map(n=>n.dataset.collected==='true'),
  actors:[...document.querySelectorAll('#garden [data-actor]')].map(n=>({key:n.dataset.actor,transform:n.getAttribute('transform')})),
 }));
 assert.equal(actual.moves,state.moves,'Displayed move count');
 assert.equal(actual.rain,state.clouds.reduce((sum,cloud)=>sum+cloud.drops,0),'Displayed remaining rain');
 assert.deepEqual(actual.collected,state.collected,'Displayed dew state');
 assert(actual.description.includes('庭師は上から'+(state.player.y+1)+'行、左から'+(state.player.x+1)+'列。'),'Accessible gardener position');
 state.clouds.forEach((cloud,i)=>{
  assert(actual.description.includes('雲'+(i+1)+'は'+(cloud.y+1)+'行'+(cloud.x+1)+'列、残り'+cloud.drops+'滴。'),'Accessible cloud position and drops');
  const actor=actual.actors.find(actor=>actor.key==='cloud-'+i);
  assert(actor,'Cloud actor '+i);
  assert.equal(actor.transform,'translate('+(92+cloud.x*76+38)+' '+(54+cloud.y*76+38-14)+')','Cloud final transform');
 });
 level.plots.forEach((plot,i)=>assert(actual.description.includes('畑'+(i+1)+'は'+(plot.y+1)+'行'+(plot.x+1)+'列、'+state.water[i]+'/'+plot.need+'滴。'),'Accessible plot water'));
 (level.dew||[]).forEach((dew,i)=>assert(actual.description.includes('雨玉は'+(dew.y+1)+'行'+(dew.x+1)+'列、'+(state.collected[i]?'取得済み。':'未取得。')),'Accessible dew state'));
 assert.equal(await page.locator('#level-name').textContent(),level.name);
}
async function assertNavigation(page,index){
 const chapter=Math.floor(index/5);
 assert.deepEqual(await page.locator('[data-chapter]').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.chapter))),[0,1,2,3]);
 assert.equal(await page.locator('[data-chapter][aria-current="true"]').getAttribute('data-chapter'),String(chapter));
 assert.deepEqual(await page.locator('[data-level]').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.level))),Array.from({length:5},(_,i)=>chapter*5+i));
 assert.equal(await page.locator('[data-level][aria-current="step"]').getAttribute('data-level'),String(index));
 assert.equal(await page.locator('#level-kicker').textContent(),'GARDEN '+String(index+1).padStart(2,'0')+' / 20');
 assert.equal(await page.locator('#level-par').textContent(),LEVELS[index].par+'手');
}
async function choose(page,index){
 await page.locator('[data-chapter="'+Math.floor(index/5)+'"]').click();
 await page.locator('[data-level="'+index+'"]').click();
 await assertNavigation(page,index);
 await assertBoard(page,index,createState(LEVELS[index]));
}
async function play(page,path){for(const direction of path)await page.keyboard.press(keys[direction]);}
const animations=page=>page.locator('#garden').evaluate(svg=>svg.getAnimations({subtree:true}).filter(a=>a.playState==='running').length);

for(const engine of ['chromium','webkit']){
 const browser=await pw[engine].launch();
 const context=await browser.newContext({viewport:{width:1440,height:1000},hasTouch:true,reducedMotion:'reduce'});
 await context.addInitScript(seed=>{
  if(sessionStorage.getItem('campaign-test-seeded')!=='1'){
   localStorage.setItem('amegumo-sokoban.v1',JSON.stringify(seed));
   sessionStorage.setItem('campaign-test-seeded','1');
  }
  localStorage.setItem('amegumo-sokoban.guide.v1','1');
 },legacy);
 const page=await context.newPage(),errors=[],external=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{if(!request.url().startsWith(url)&&!request.url().startsWith('data:'))external.push(request.url());});
 const result={engine,status:'running',levels:[],widths:[],consoleErrors:errors,externalRequests:external};results.push(result);
 try{
  await page.goto(url);await page.locator('#garden .gardener').waitFor();
  assert.equal(await page.locator('#help-dialog').evaluate(dialog=>dialog.open),false);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('amegumo-sokoban.v1'))),legacy);
  assert.match(await page.locator('#campaign-progress').textContent(),/3 \/ 20/);
  for(let chapter=0;chapter<4;chapter++){
   await page.locator('[data-chapter="'+chapter+'"]').click();
   await assertNavigation(page,chapter*5);
   await assertBoard(page,chapter*5,createState(LEVELS[chapter*5]));
  }
  await choose(page,0);
  for(let index=0;index<20;index++){
   const level=LEVELS[index],path=SOLUTIONS[level.id];
   await assertNavigation(page,index);
   await play(page,path);
   await page.locator('#win-dialog[open]').waitFor();
   const final=path.reduce((state,direction)=>move(level,state,direction).state,createState(level));
   assert.equal(final.won,true);await assertBoard(page,index,final);
   assert.match(await page.locator('#win-description').textContent(),/クリア/);
   assert.equal(await page.locator('#win-next').textContent(),index===19?'最初の庭へ':'次の庭へ');
   result.levels.push({id:level.id,moves:final.moves,par:level.par});
   await page.locator('#win-next').click();
   const next=(index+1)%20;
   await assertNavigation(page,next);await assertBoard(page,next,createState(LEVELS[next]));
  }
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('amegumo-sokoban.v1')));
  assert.deepEqual(Object.keys(saved).sort(),LEVELS.map(level=>level.id).sort());
  for(const level of LEVELS)assert.equal(saved[level.id],level.par);
  for(const [id,best]of Object.entries(legacy))assert.equal(saved[id],best,'Legacy best survives');
  await page.reload();await page.locator('#garden .gardener').waitFor();
  assert.match(await page.locator('#campaign-progress').textContent(),/20 \/ 20/);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('amegumo-sokoban.v1'))),saved);
  for(let chapter=0;chapter<4;chapter++){
   await page.locator('[data-chapter="'+chapter+'"]').click();
   assert.equal(await page.locator('.level-tab.is-complete').count(),5);
   assert.equal(await page.locator('.level-tab.is-complete .tab-achieved').evaluateAll(nodes=>nodes.filter(node=>getComputedStyle(node).display!=='none'&&node.getBoundingClientRect().width>0).length),5,'Achievement flowers stay visible');
   assert.match(await page.locator('#chapter-progress').textContent(),/5 \/ 5/);
  }
  result.persistence='legacy three preserved; all twenty saved and retained after reload';

  for(const [kind,event]of [['pickup',pickup],['warp',warp]]){
   await choose(page,event.index);await play(page,event.prefix);await assertBoard(page,event.index,event.before);
   await page.keyboard.press(keys[event.direction]);await assertBoard(page,event.index,event.after);
   assert.equal(await animations(page),0,'Reduced motion has no active animation');
   assert.equal(await page.locator('#garden [data-motion-fx]').count(),0,'Reduced motion creates no transient effects');
   assert.match(await page.locator('#status').textContent(),kind==='pickup'?/雨玉.*1滴/:/風穴/);
   await page.locator('#undo-button').click();await assertBoard(page,event.index,event.before);
   assert.equal(await page.locator('#garden [data-motion-fx]').count(),0);
   await page.keyboard.press(keys[event.direction]);await assertBoard(page,event.index,event.after);
   await page.locator('#reset-button').click();await page.locator('#reset-confirm').click();
   await assertBoard(page,event.index,createState(LEVELS[event.index]));
  }
  await choose(page,ledge.index);await play(page,ledge.prefix);await assertBoard(page,ledge.index,ledge.before);
  await page.keyboard.press(keys[ledge.direction]);await assertBoard(page,ledge.index,ledge.before);
  assert.match(await page.locator('#status').textContent(),/石段.*矢印/);
  result.mechanics={pickup:LEVELS[pickup.index].id,warp:LEVELS[warp.index].id,ledge:LEVELS[ledge.index].id,undoReset:'passed'};

  for(const width of [390,768,1440]){
   await page.setViewportSize({width,height:width===390?844:1000});await choose(page,combinedIndex);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Horizontal overflow at '+width);
   const sizes=await page.locator('#chapter-tabs button,#level-tabs button,#dpad button').evaluateAll(nodes=>nodes.map(node=>({name:node.textContent.trim(),width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height})));
   assert(sizes.every(size=>size.width>=44&&size.height>=44),'44px targets at '+width+': '+JSON.stringify(sizes));
   const legend=await page.locator('#mechanic-legend').textContent();
   assert.match(legend,/石段/);assert.match(legend,/雨玉/);assert.match(legend,/風穴/);
   assert.equal(await page.locator('#garden [data-portal]').count(),2);
   assert.equal(await page.locator('#garden [data-dew][data-collected="false"]').count(),LEVELS[combinedIndex].dew.length);
   // A full-page capture from a scrolled viewport can include a fixed skip
   // link above that viewport. Capture from the document origin instead.
   await page.evaluate(()=>scrollTo({top:0,left:0,behavior:'instant'}));
   const skipLink=await page.locator('.skip-link').evaluate(node=>({
    focused:node.matches(':focus'),bottom:node.getBoundingClientRect().bottom,
    transform:getComputedStyle(node).transform,
   }));
   assert.equal(skipLink.focused,false);assert(skipLink.bottom<0,'Unfocused skip link stays above the viewport');
   await page.screenshot({path:out+'/'+engine+'-'+width+'.png',fullPage:true});
   result.widths.push({width,overflow:false,minimumTarget:Math.min(...sizes.map(size=>Math.min(size.width,size.height))),skipLink});
  }

  await page.emulateMedia({reducedMotion:'no-preference'});
  await choose(page,pickup.index);await play(page,pickup.prefix);await page.waitForTimeout(200);
  await page.keyboard.press(keys[pickup.direction]);
  assert((await page.locator('#garden [data-pickup-fx]').count())>0,'Normal pickup effect appears');
  assert((await animations(page))>0);
  await page.locator('#undo-button').click();await assertBoard(page,pickup.index,pickup.before);
  assert.equal(await page.locator('#garden [data-motion-fx]').count(),0);
  await page.waitForTimeout(750);assert.equal(await page.locator('#garden [data-motion-fx]').count(),0);
  assert.equal(await page.locator('#win-dialog').evaluate(dialog=>dialog.open),false);

  await choose(page,warp.index);await play(page,warp.prefix);await page.waitForTimeout(200);
  await page.keyboard.press(keys[warp.direction]);await assertBoard(page,warp.index,warp.after);
  assert.equal(await page.locator('#garden [data-warp-fx]').count(),2,'Both warp rings appear');
  const otherChapter=(Math.floor(warp.index/5)+1)%4;
  await page.locator('[data-chapter="'+otherChapter+'"]').click();
  await assertBoard(page,otherChapter*5,createState(LEVELS[otherChapter*5]));
  assert.equal(await page.locator('#garden [data-motion-fx]').count(),0);
  await page.waitForTimeout(750);assert.equal(await page.locator('#garden [data-motion-fx]').count(),0);
  assert.equal(await page.locator('#win-dialog').evaluate(dialog=>dialog.open),false);
  result.motion='pickup undo and warp chapter-change cancel finite effects';
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);result.status='passed';
 }catch(error){
  result.status='failed';result.error=error.stack||String(error);
  await page.screenshot({path:out+'/'+engine+'-failure.png',fullPage:true}).catch(()=>{});
 }finally{
  await writeFile(out+'/browser-results.json',JSON.stringify(results,null,2));
  await browser.close();
 }
 console.log(engine+': '+result.status+(result.error?' '+result.error.split('\n')[0]:''));
}
assert(results.every(result=>result.status==='passed'),JSON.stringify(results.filter(result=>result.status!=='passed'),null,2));
console.log(JSON.stringify(results,null,2));
