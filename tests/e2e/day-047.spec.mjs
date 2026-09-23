import { expect,test } from '@playwright/test';
const PATH='/day-047-cat-lightspeed/',errors=new WeakMap(),external=new WeakMap();
test.beforeEach(async({page})=>{
  errors.set(page,[]);external.set(page,[]);
  page.on('pageerror',e=>errors.get(page).push(e.message));page.on('console',m=>{if(m.type()==='error')errors.get(page).push(m.text());});
  page.on('request',request=>{const u=new URL(request.url());if(['https:','http:'].includes(u.protocol)&&!['localhost','127.0.0.1','[::1]'].includes(u.hostname))external.get(page).push(u.href);});
});
test.afterEach(async({page})=>{expect(errors.get(page),'コンソールエラー0件').toEqual([]);expect(external.get(page),'外部リクエスト0件').toEqual([]);});
async function ready(page){await page.goto(PATH);await expect(page.locator('#app')).toHaveAttribute('data-state','ready');await page.evaluate(()=>window.__day047.setManual(true));}
async function begin(page){await ready(page);await page.locator('#start').click();await expect(page.locator('#app')).toHaveAttribute('data-state','playing');}
const advance=(page,ms)=>page.evaluate(ms=>window.__day047.advance(ms),ms);
const snapshot=page=>page.evaluate(()=>window.__day047.snapshot());

// v3 (PLAN-v3.md). Waits are conditions on snapshot().speed / events, never times derived from a curve.
const C=1079252849,MAX=C*.99999,GLOW=.9,LIGHT=.999;
const WORLD_IDS=['farm','city','sky','orbit','solar','interstellar'];
const WORLD_START={farm:0,city:100,sky:1000,orbit:10000,solar:100000,interstellar:1000000};
const MILESTONE_SPEEDS=[.05,1.4,4,20,37,60,100,110,320,390,603,900,1225,3530,11000,27600,40300,107200,692000,828000];
const SYMBOLS={farm:['pasture'],city:['street'],sky:['clouds'],orbit:['earth'],solar:['sun','ringedPlanet'],interstellar:['starfield']};
const VIEWPORTS=[{width:1280,height:900},{width:390,height:844},{width:390,height:664}];
// Advance the manual clock in 1/60 s ticks until `until` holds; `until` is data evaluated in the page:
// {kind:'speed'|'below'|'state'|'world'|'event'|'ticks', ...}. `stride` ticks run per advance() call (one draw each):
// 1 where a check must line up with a single tick, more where the test only needs to get somewhere.
async function step(page,until,{limit=7200,record=false,stride=1}={}){
  return page.evaluate(({until,limit,record,stride})=>{
    const g=window.__day047,samples=[];
    const met=s=>{const events=s.experience?.events||[];switch(until.kind){
      case 'speed':return s.speed>=until.value;case 'below':return s.speed<until.value;case 'state':return g.state()===until.value;
      case 'world':return s.world===until.value;case 'event':return events.some(e=>e.type===until.type&&e.id===until.id);default:return false;}};
    const pick=s=>({state:g.state(),elapsed:s.elapsed,speed:s.speed,earth:s.earthSeconds,world:s.world,
      cat:s.catScreen&&{x:s.catScreen.x,y:s.catScreen.y,w:s.catScreen.w,h:s.catScreen.h},
      render:s.render&&{calls:s.render.calls,triangles:s.render.triangles,pixelRatio:s.render.pixelRatio,visibleTargets:s.render.impact?.visibleTargets},
      impacts:s.impacts&&{total:s.impacts.total,flying:s.impacts.flying,fragments:s.impacts.fragments},
      x:s.experience&&{reducedMotion:s.experience.reducedMotion,phase:s.experience.light?.phase,amount:s.experience.light?.amount,shakePx:s.experience.motion?.shakePx,lines:s.experience.motion?.speedLineCount,landmarks:s.experience.landmarks}});
    let s=g.snapshot(),ticks=0;
    while(!met(s)&&ticks<limit&&(until.kind==='state'||g.state()==='playing')){g.advance(stride*1000/60);ticks+=stride;s=g.snapshot();if(record)samples.push(pick(s));}
    return {ok:met(s),ticks,snapshot:s,samples};
  },{until,limit,record,stride});
}
const FAST={stride:15};
const holdToResult=async(page,{stride=1,record=true}={})=>{await page.keyboard.down('Space');const run=await step(page,{kind:'state',value:'result'},{record,stride});await page.keyboard.up('Space');return run;};
const number=text=>{const m=String(text??'').replace(/,/g,'').match(/-?\d+(?:\.\d+)?/);return m?Number(m[0]):NaN;};
const examples=(list,f=s=>s)=>JSON.stringify(list.slice(0,3).map(f));
// On screen without scrolling, and not clipped by a scrolling container such as the result overlay.
const inViewport=(locator,within)=>locator.evaluate((el,within)=>{
  const r=el.getBoundingClientRect(),inside=(a,b)=>a.left>=b.left-.5&&a.top>=b.top-.5&&a.right<=b.right+.5&&a.bottom<=b.bottom+.5;
  if(!r.width||!r.height||!inside(r,{left:0,top:0,right:innerWidth,bottom:innerHeight}))return false;
  const box=within&&document.querySelector(within);return !box||inside(r,box.getBoundingClientRect());
},within);

test('開始でき、実際の3D描画がある',async({page})=>{await begin(page);const s=await snapshot(page);expect(s.speed).toBe(0);expect(s.render.calls).toBeGreaterThan(0);expect(s.render.triangles).toBeGreaterThan(0);});
test('描画領域を押し続けると速度が上がり、離すと下がる',async({page})=>{await begin(page);const box=await page.locator('#scene').boundingBox();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.65);await page.mouse.down();const up=await step(page,{kind:'speed',value:4},{limit:600});expect(up.ok,'押し続けて10秒以内に歩く速さ').toBe(true);expect(up.snapshot.pressed).toBe(true);await page.mouse.up();await advance(page,1000);expect((await snapshot(page)).speed).toBeLessThan(up.snapshot.speed);});
test('描画領域外の共有ボタンは操作でき、加速しない',async({page})=>{await page.addInitScript(()=>{window.copyCalls=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.copyCalls.push(text)},configurable:true});});await begin(page);const copy=page.locator('.share button').filter({hasText:'コピー'});await copy.click();expect(await page.evaluate(()=>window.copyCalls.length)).toBe(1);await advance(page,1000);expect((await snapshot(page)).pressed).toBe(false);expect((await snapshot(page)).speed).toBe(0);await expect(copy).toBeVisible();});
test('Spaceで開始・長押しで45〜60秒に自動結果・再挑戦',async({page})=>{await ready(page);await page.keyboard.down('Space');await expect(page.locator('#app')).toHaveAttribute('data-state','playing');const run=await step(page,{kind:'state',value:'result'},FAST);expect(run.ok,'結果まで到達').toBe(true);await expect(page.locator('#app')).toHaveAttribute('data-state','result');expect(run.snapshot.speed).toBeLessThan(C);expect(run.snapshot.elapsed,'最大推力の完走時刻').toBeGreaterThanOrEqual(45);expect(run.snapshot.elapsed,'最大推力の完走時刻').toBeLessThanOrEqual(60);await expect(page.locator('#final-count')).toHaveText('20');await expect(page.locator('#final-gamma')).toHaveText('223.6');await expect(page.locator('#result-x')).toHaveAttribute('href',/x.com\/intent\/post/);await expect(page.locator('#result-copy')).toBeVisible();await page.keyboard.up('Space');await page.keyboard.press('Space');await expect(page.locator('#app')).toHaveAttribute('data-state','playing');expect((await snapshot(page)).speed).toBe(0);});
test('Enterでも開始と加速、離した後に減速',async({page})=>{await ready(page);await page.keyboard.down('Enter');const up=await step(page,{kind:'speed',value:4},{limit:600});expect(up.ok).toBe(true);await page.keyboard.up('Enter');await advance(page,1000);expect((await snapshot(page)).speed).toBeLessThan(up.snapshot.speed);});
test('音の表示は音速で置き去り、軌道速度で真空に変わる（速度で待つ）',async({page})=>{await begin(page);await page.keyboard.down('Space');const sonic=await step(page,{kind:'speed',value:1225},FAST);expect(sonic.ok).toBe(true);expect(sonic.snapshot.audio).toBe('delayed');await expect(page.locator('#sound-note')).toHaveText(/置き去り/);const orbit=await step(page,{kind:'speed',value:27600},FAST);expect(orbit.ok).toBe(true);expect(orbit.snapshot.audio).toBe('silent');await expect(page.locator('#sound-note')).toHaveText('真空では音が伝わらない');await page.keyboard.up('Space');});
test('ミュート保存とベスト保存は2種類だけ',async({page})=>{await ready(page);await page.locator('#mute').click();await expect(page.locator('#mute')).toHaveAttribute('aria-pressed','true');await page.reload();await expect(page.locator('#app')).toHaveAttribute('data-state','ready');await expect(page.locator('#mute')).toHaveAttribute('aria-pressed','true');await page.evaluate(()=>window.__day047.setManual(true));await page.locator('#start').click();expect((await holdToResult(page,{stride:15,record:false})).ok).toBe(true);const values=await page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])));expect(Object.keys(values).sort()).toEqual(['day047.best.v1','day047.mute.v1']);expect(Object.keys(JSON.parse(values['day047.best.v1'])).sort()).toEqual(['date','seconds','speed']);});
test('フォーカスを失うと長押しを解除する',async({page})=>{await begin(page);await page.keyboard.down('Space');expect((await step(page,{kind:'speed',value:4},{limit:600})).ok).toBe(true);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));expect((await snapshot(page)).pressed).toBe(false);const v=(await snapshot(page)).speed;await advance(page,1000);expect((await snapshot(page)).speed).toBeLessThan(v);await page.keyboard.up('Space');});
test('3Dモジュールが読み込めないと再読み込みを案内',async({page})=>{await page.route('**/app3d.js',route=>route.fulfill({status:200,contentType:'text/javascript',body:'throw new Error("test import failure")'}));await page.goto(PATH);await expect(page.locator('#fatal-screen')).toBeVisible();await expect(page.locator('#reload-page')).toBeVisible();await expect(page.locator('#start-screen')).toBeHidden();});

test('指の移動量で入った推力は、止めてから450ms以内に0になり、その後は減速する',async({page})=>{
  await begin(page);
  // 180 normalized px over 0.6 s through the public input window, then the finger stays still.
  await page.evaluate(()=>{const g=window.__day047,t=g.snapshot().elapsed;g.inputSample({time:t,stroke:true});for(let i=1;i<=36;i++)g.inputSample({time:t+i/60,distance:5});});
  await advance(page,600);const moving=await snapshot(page);
  expect(moving.input.u,'送っている間は推力').toBeGreaterThan(0);expect(moving.speed).toBeGreaterThan(0);
  await advance(page,450);const stopped=await snapshot(page);expect(stopped.input.u,'止めて450ms後の推力').toBe(0);
  await advance(page,500);expect((await snapshot(page)).speed).toBeLessThan(stopped.speed);
});

test('snapshotは契約v3の experience を返し、開始直後の記録は時刻0の牧場1件',async({page})=>{
  await begin(page);const s=await snapshot(page),x=s.experience;
  expect(s.contractVersion).toBe(3);expect(x,'experience').toBeTruthy();
  expect(typeof x.reducedMotion).toBe('boolean');expect(x.reducedMotion).toBe(false);
  expect(Array.isArray(x.events)).toBe(true);expect(Array.isArray(x.landmarks)).toBe(true);
  expect(x.light.phase).toBe('coat');expect(typeof x.light.amount).toBe('number');expect(x.light.amount).toBeGreaterThanOrEqual(0);expect(x.light.amount).toBeLessThanOrEqual(1);
  expect(typeof x.motion.shakePx).toBe('number');expect(x.motion.shakePx).toBeGreaterThanOrEqual(0);
  expect(Number.isInteger(x.motion.speedLineCount)).toBe(true);expect(x.motion.speedLineCount).toBeGreaterThanOrEqual(0);
  expect(x.events).toHaveLength(1);expect(x.events[0]).toMatchObject({seq:1,type:'world',id:'farm',elapsed:0,speed:0});
  for(const l of x.landmarks){expect(typeof l.id).toBe('string');for(const k of ['x','y','w','h'])expect(typeof l.rect[k]).toBe('number');}
  for(const key of ['phase','speed','peak','elapsed','earthSeconds','passed','pressed','world','audio','gamma','catScreen','faceScreen','render','input','impacts','sound'])expect(s,`既存の欄 ${key}`).toHaveProperty(key);
});

// The checks below do not depend on the canvas size; a small canvas keeps one-draw-per-tick runs fast.
const SMALL={width:390,height:664};
test('events：通過は0〜19の昇順1回ずつ、世界は6種を順に、光はglow→light、resultは1回で最後、seqは連番、時刻は非減少、再挑戦で初期化',async({page})=>{
  await page.setViewportSize(SMALL);await begin(page);const run=await holdToResult(page,{stride:3});expect(run.ok,'結果まで到達').toBe(true);
  const events=run.snapshot.experience?.events||[],of=type=>events.filter(e=>e.type===type);
  expect(events.map(e=>e.seq),'seqは1始まりの連番').toEqual(events.map((_,i)=>i+1));
  for(let i=1;i<events.length;i++)expect(events[i].elapsed,`seq ${events[i].seq} の時刻は非減少`).toBeGreaterThanOrEqual(events[i-1].elapsed);
  expect(of('milestone').map(e=>e.id)).toEqual(MILESTONE_SPEEDS.map((_,i)=>String(i)));
  expect(of('world').map(e=>e.id)).toEqual(WORLD_IDS);
  expect(of('light').map(e=>e.id)).toEqual(['glow','light']);
  expect(of('finish').map(e=>e.id)).toEqual(['result']);
  expect(events.filter(e=>!['milestone','world','light','finish'].includes(e.type))).toEqual([]);
  const light=of('light')[1],finish=of('finish')[0];
  expect(finish.seq,'resultは光の後').toBeGreaterThan(light.seq);expect(events.at(-1).type).toBe('finish');
  // Each event is the real first crossing: it lies between the last recorded frame before the crossing and the first one
  // after it (3 ticks apart), in time and in speed (maximum thrust only accelerates).
  const frames=[{state:'playing',elapsed:0,speed:0,world:'farm'},...run.samples];
  const checks=[...MILESTONE_SPEEDS.map((v,i)=>[`通過 ${i}`,of('milestone')[i],s=>s.speed>=v,v]),...WORLD_IDS.slice(1).map((id,i)=>[`世界 ${id}`,of('world')[i+1],s=>s.world===id,WORLD_START[id]]),['glow',of('light')[0],s=>s.speed>=C*GLOW,C*GLOW],['light',light,s=>s.speed>=C*LIGHT,C*LIGHT],['result',finish,s=>s.state==='result',MAX]];
  for(const [name,event,cond,threshold] of checks){const i=frames.findIndex(cond),frame=frames[i],prev=frames[i-1];
    if(!prev){expect.soft(i,`${name}：開始時点ですでに成立`).toBeGreaterThan(0);continue;}
    expect.soft(event.elapsed>prev.elapsed-1e-9&&event.elapsed<=frame.elapsed+1e-9,`${name}：記録 ${event.elapsed}秒が実際の通過 ${prev.elapsed}〜${frame.elapsed}秒の間`).toBe(true);
    expect.soft(event.speed>=threshold*(1-1e-12)&&event.speed<=frame.speed*(1+1e-12),`${name}：記録時の速度 ${event.speed} が ${threshold}〜${frame.speed}`).toBe(true);}
  // P0-1 in the real app, read from the events (maximum thrust = Space).
  const at=(type,id)=>of(type).find(e=>e.id===id)?.elapsed;
  for(const [name,t,lo,hi] of [['最初の通過',at('milestone','0'),.3,1.5],['歩く人',at('milestone','2'),0,4],['自転車',at('milestone','3'),0,6],['街',at('world','city'),8,12],['空',at('world','sky'),14,18],['軌道',at('world','orbit'),19,24],['太陽系',at('world','solar'),24,29],['星間',at('world','interstellar'),29,34],['完走',finish.elapsed,45,60],['90%→完走',finish.elapsed-at('light','glow'),8,15]]){
    expect.soft(t,`${name}の時刻（${lo}〜${hi}秒）`).toBeGreaterThanOrEqual(lo);expect.soft(t,`${name}の時刻（${lo}〜${hi}秒）`).toBeLessThanOrEqual(hi);}
  await page.locator('#retry').click();await expect(page.locator('#app')).toHaveAttribute('data-state','playing');
  const again=(await snapshot(page)).experience;
  expect(again.events).toHaveLength(1);expect(again.events[0]).toMatchObject({seq:1,type:'world',id:'farm',elapsed:0,speed:0});expect(again.light.phase).toBe('coat');
});

test('events：減速で通過済みの速さや前の世界へ戻っても、再加速で通過・世界の記録を増やさない',async({page})=>{
  await begin(page);await page.keyboard.down('Space');expect((await step(page,{kind:'speed',value:150},{stride:5})).ok).toBe(true);
  await page.keyboard.up('Space');expect((await step(page,{kind:'below',value:50},{limit:3600,stride:5})).ok,'離して50km/h未満へ').toBe(true);
  await page.keyboard.down('Space');expect((await step(page,{kind:'speed',value:150},{stride:5})).ok).toBe(true);await page.keyboard.up('Space');
  const events=(await snapshot(page)).experience.events;
  expect(events.filter(e=>e.type==='milestone').map(e=>e.id)).toEqual(['0','1','2','3','4','5','6','7']);
  expect(events.filter(e=>e.type==='world').map(e=>e.id)).toEqual(['farm','city']);
  expect(events.map(e=>e.seq)).toEqual(events.map((_,i)=>i+1));
});

for(const viewport of VIEWPORTS)test(`${viewport.width}×${viewport.height}：各世界の1秒後・3秒後に象徴、全フレームで猫の投影・描画予算・可視対象が範囲内`,async({page})=>{
  await page.setViewportSize(viewport);await begin(page);const run=await holdToResult(page,{stride:2});expect(run.ok,'結果まで到達').toBe(true);
  const playing=run.samples.filter(s=>s.state==='playing');
  for(const world of WORLD_IDS){
    const entry=world==='farm'?0:playing.find(s=>s.world===world)?.elapsed;expect.soft(entry,`${world}に到達`).not.toBeUndefined();if(entry===undefined)continue;
    for(const after of [1,3]){
      const s=playing.find(x=>x.elapsed>=entry+after-1e-9),label=`${world}に入って${after}秒後`;
      expect.soft(s?.world,`${label}も同じ世界（各世界4秒以上）`).toBe(world);if(!s||s.world!==world)continue;
      const marks=s.x?.landmarks||[],ids=marks.map(l=>l.id),rect=id=>marks.find(l=>l.id===id)?.rect;
      for(const id of SYMBOLS[world])expect.soft(ids,`${label}：象徴 ${id}`).toContain(id);
      if(rect('earth')){expect.soft(rect('earth').w,`${label}：地球の弧の幅（画面幅70%以上）`).toBeGreaterThanOrEqual(.7);expect.soft(rect('earth').y+rect('earth').h/2,`${label}：地球の弧は下部`).toBeGreaterThan(.5);}
      if(rect('sun')){expect.soft(rect('sun').w,`${label}：太陽の直径（画面幅18〜28%）`).toBeGreaterThanOrEqual(.18);expect.soft(rect('sun').w,`${label}：太陽の直径（画面幅18〜28%）`).toBeLessThanOrEqual(.28);}
      if(rect('ringedPlanet')){expect.soft(rect('ringedPlanet').w,`${label}：環付き惑星（画面幅12〜20%）`).toBeGreaterThanOrEqual(.12);expect.soft(rect('ringedPlanet').w,`${label}：環付き惑星（画面幅12〜20%）`).toBeLessThanOrEqual(.2);}
    }
  }
  const foreign=playing.filter(s=>(s.x?.landmarks||[]).some(l=>!SYMBOLS[s.world].includes(l.id)));
  expect.soft(foreign.length,`いまの世界の象徴だけを返す：${examples(foreign,s=>({t:s.elapsed,world:s.world,ids:s.x.landmarks.map(l=>l.id)}))}`).toBe(0);
  const badRect=playing.flatMap(s=>(s.x?.landmarks||[]).filter(({rect:r})=>!(r.x>=0&&r.y>=0&&r.w>0&&r.h>0&&r.x+r.w<=1+1e-6&&r.y+r.h<=1+1e-6)).map(l=>({t:s.elapsed,...l})));
  expect.soft(badRect.length,`rectは0〜1：${examples(badRect)}`).toBe(0);
  const badCat=playing.filter(({cat:c})=>!(c&&c.x>=.4&&c.x<=.6&&c.h>=.18&&c.h<=.38&&c.x-c.w/2>.02&&c.x+c.w/2<.98&&c.y-c.h/2>.02&&c.y+c.h/2<.98));
  expect.soft(badCat.length,`猫の投影 h18〜38%・x40〜60%・四辺2%内側（${playing.length}フレーム中）：${examples(badCat,s=>({t:s.elapsed,world:s.world,cat:s.cat}))}`).toBe(0);
  const badBudget=run.samples.filter(({render:r})=>!(r&&r.calls<=48&&r.triangles<=18000&&r.pixelRatio<=1.5));
  expect.soft(badBudget.length,`描画予算 48 calls・18,000三角形・倍率1.5以下（結果を含む）：${examples(badBudget,s=>({t:s.elapsed,world:s.world,state:s.state,...s.render}))}`).toBe(0);
  for(const world of WORLD_IDS)expect.soft(playing.some(s=>s.world===world&&s.impacts?.flying>0),`${world}：衝突の最中も予算を測った`).toBe(true);
  const crowded=playing.filter(s=>!(s.render?.visibleTargets<=5)),normal=playing.filter(s=>s.render?.visibleTargets>=3&&s.render?.visibleTargets<=5).length/playing.length;
  expect.soft(crowded.length,`未破壊の可視対象は5個以下：${examples(crowded,s=>({t:s.elapsed,world:s.world,n:s.render?.visibleTargets}))}`).toBe(0);
  expect.soft(normal,'未破壊の可視対象は通常3〜5個（8割以上のフレーム）').toBeGreaterThanOrEqual(.8);
});

test('光の段階：90%未満coat・99.9%未満glow・以上light、lightでamount0.8以上、結果もlight、lightから結果まで1秒以上',async({page})=>{
  await page.setViewportSize(SMALL);await begin(page);const run=await holdToResult(page,{stride:2});expect(run.ok,'結果まで到達').toBe(true);
  const phaseOf=r=>r<GLOW?'coat':r<LIGHT?'glow':'light',edge=r=>Math.abs(r-GLOW)<1e-12||Math.abs(r-LIGHT)<1e-12;
  const playing=run.samples.filter(s=>s.state==='playing'&&!edge(s.speed/C));
  const wrong=playing.filter(s=>s.x?.phase!==phaseOf(s.speed/C));
  expect(wrong.length,`段階が光速比と合わない：${examples(wrong,s=>({ratio:s.speed/C,phase:s.x?.phase}))}`).toBe(0);
  const early=playing.filter(s=>s.speed/C<GLOW&&!(s.x?.amount<=.05));
  expect(early.length,`coatの間は光への変化なし（amount 0.05以下）：${examples(early,s=>({ratio:s.speed/C,amount:s.x?.amount}))}`).toBe(0);
  const lit=playing.filter(s=>s.x?.phase==='light');expect(lit.length,'light の段階がある').toBeGreaterThan(0);
  expect(lit.filter(s=>!(s.x.amount>=.8-1e-6)).length,'lightではamount 0.8以上').toBe(0);
  let drop=0,jump=0;for(let i=1;i<playing.length;i++){const d=(playing[i].x?.amount??0)-(playing[i-1].x?.amount??0);drop=Math.min(drop,d);jump=Math.max(jump,Math.abs(d));}
  expect(drop,'加速中にamountが戻らない').toBeGreaterThanOrEqual(-1e-9);expect(jump,'2tickで0.25を超えて跳ばない（連続変化）').toBeLessThanOrEqual(.25);
  expect(run.snapshot.experience.light.phase).toBe('light');expect(run.snapshot.experience.light.amount).toBeGreaterThanOrEqual(.8-1e-6);
  expect(run.snapshot.elapsed-lit[0].elapsed,'白い猫を結果の前に1秒以上').toBeGreaterThanOrEqual(1);
});

test('光の段階は減速で戻る：light→glow→coat',async({page})=>{
  await begin(page);await page.keyboard.down('Space');const up=await step(page,{kind:'speed',value:C*LIGHT},FAST);expect(up.ok).toBe(true);expect(up.snapshot.experience.light.phase).toBe('light');
  await page.keyboard.up('Space');
  const glow=await step(page,{kind:'below',value:C*LIGHT},{stride:5});expect(glow.ok).toBe(true);expect(glow.snapshot.experience.light.phase).toBe('glow');
  const coat=await step(page,{kind:'below',value:C*GLOW},{stride:5});expect(coat.ok).toBe(true);expect(coat.snapshot.experience.light.phase).toBe('coat');expect(coat.snapshot.experience.light.amount).toBeLessThanOrEqual(.05);
});

test('動き（通常）：揺れは接触時だけ2px以下・120ms以内、流線は120本以下で空12本以上・星間で空より多い、本体4・破片12以下',async({page})=>{
  await page.setViewportSize(SMALL);await begin(page);const run=await holdToResult(page);expect(run.ok).toBe(true);
  const playing=run.samples.filter(s=>s.state==='playing');
  expect(playing.filter(s=>s.x?.reducedMotion!==false).length).toBe(0);
  const shake=playing.map(s=>s.x?.shakePx??NaN);let longest=0,streak=0;for(const v of shake){streak=v>0?streak+1:0;longest=Math.max(longest,streak);}
  expect(Math.max(...shake),'揺れは最大2px').toBeLessThanOrEqual(2);
  expect(Math.max(...shake),'接触で揺れる（0のままだと reduced の検査が空振り）').toBeGreaterThan(0);
  expect(longest/60,'1回の揺れは120ms以内（+1tick）').toBeLessThanOrEqual(.12+1/60+1e-9);
  const lines=w=>playing.filter(s=>!w||s.world===w).map(s=>s.x?.lines??NaN);
  expect(Math.max(...lines()),'流線は最大120本').toBeLessThanOrEqual(120);
  expect(Math.max(...lines('sky')),'空の流線は12本以上').toBeGreaterThanOrEqual(12);
  expect(Math.max(...lines('interstellar')),'星間の流線は空より多い').toBeGreaterThan(Math.max(...lines('sky')));
  expect(Math.max(...playing.map(s=>s.impacts?.flying??99)),'同時に飛ぶ本体').toBeLessThanOrEqual(4);
  expect(Math.max(...playing.map(s=>s.impacts?.fragments??99)),'同時の破片').toBeLessThanOrEqual(12);
});

test('動き（reduced-motion）：揺れ0・流線0・破片4以下のまま、同じ条件で完走する',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:390,height:664});await begin(page);
  const run=await holdToResult(page,{stride:2});expect(run.ok,'reduced でも完走').toBe(true);const playing=run.samples.filter(s=>s.state==='playing');
  expect(playing.filter(s=>s.x?.reducedMotion!==true).length,'reducedMotion=true').toBe(0);
  expect(playing.filter(s=>s.x?.shakePx!==0).length,'揺れ0').toBe(0);
  expect(playing.filter(s=>s.x?.lines!==0).length,'流線0').toBe(0);
  expect(Math.max(...playing.map(s=>s.impacts?.fragments??99)),'破片4以下').toBeLessThanOrEqual(4);
  expect(run.snapshot.elapsed,'到達条件は同じ（45〜60秒）').toBeGreaterThanOrEqual(45);expect(run.snapshot.elapsed,'到達条件は同じ（45〜60秒）').toBeLessThanOrEqual(60);
  expect(run.snapshot.experience.events.filter(e=>e.type==='world').map(e=>e.id)).toEqual(WORLD_IDS);
});

test('動きを減らす設定をプレイ中に切り替えると、揺れと流線が止まり、入力と時計は続く',async({page})=>{
  await begin(page);await page.keyboard.down('Space');expect((await step(page,{kind:'world',value:'interstellar'},FAST)).ok).toBe(true);await step(page,{kind:'ticks'},{limit:30});
  expect((await snapshot(page)).experience.motion.speedLineCount,'通常の星間では流線あり').toBeGreaterThan(0);
  await page.emulateMedia({reducedMotion:'reduce'});await advance(page,1000/60);const calm=await snapshot(page);
  expect(calm.experience.reducedMotion).toBe(true);expect(calm.experience.motion.speedLineCount).toBe(0);expect(calm.experience.motion.shakePx).toBe(0);
  await advance(page,1000);const later=await snapshot(page);
  expect(later.speed,'入力は続き加速する').toBeGreaterThan(calm.speed);expect(later.earthSeconds,'地球の時計も進む').toBeGreaterThan(calm.earthSeconds);expect(later.experience.motion.speedLineCount).toBe(0);
  await page.emulateMedia({reducedMotion:'no-preference'});await advance(page,1000/60);const back=await snapshot(page);
  expect(back.experience.reducedMotion).toBe(false);expect(back.experience.motion.speedLineCount).toBeGreaterThan(0);await page.keyboard.up('Space');
});

test.describe('高DPR端末（deviceScaleFactor 3）',()=>{
  test.use({deviceScaleFactor:3,viewport:{width:390,height:844}});
  test('描画倍率は1.5以下のまま、全世界と結果で48 calls・18,000三角形以下',async({page})=>{
    await begin(page);const run=await holdToResult(page,{stride:5});expect(run.ok).toBe(true);
    const bad=run.samples.filter(({render:r})=>!(r&&r.pixelRatio<=1.5&&r.calls<=48&&r.triangles<=18000));
    expect(bad.length,examples(bad,s=>({t:s.elapsed,world:s.world,state:s.state,...s.render}))).toBe(0);
  });
});

test('終盤：光速比90%以上で猫と地球の二つの時計が出て差が広がり、結果に光の猫とγ223.6、再挑戦1操作で初期化',async({page})=>{
  await page.setViewportSize({width:390,height:844});await begin(page);await page.keyboard.down('Space');
  const cat=page.locator('[data-testid="cat-clock"]'),earth=page.locator('[data-testid="earth-clock"]'),read=async l=>number(await l.textContent());
  const a=await step(page,{kind:'speed',value:C*GLOW},FAST);expect(a.ok).toBe(true);
  for(const clock of [cat,earth]){await expect(clock).toBeVisible();expect(await inViewport(clock),'時計は画面内').toBe(true);}
  const catA=await read(cat),earthA=await read(earth);
  const b=await step(page,{kind:'speed',value:C*.9999},{stride:5});expect(b.ok).toBe(true);const catB=await read(cat),earthB=await read(earth);
  expect(Math.abs((catB-catA)-(b.snapshot.elapsed-a.snapshot.elapsed)),'猫の時計はプレイの秒で進む').toBeLessThanOrEqual(.25);
  const dEarth=b.snapshot.earthSeconds-a.snapshot.earthSeconds;
  expect(Math.abs((earthB-earthA)-dEarth),'地球の時計は累積の地球秒で進む').toBeLessThanOrEqual(Math.max(.5,.02*dEarth));
  expect(earthB-earthA,'二つの時計の差が広がる').toBeGreaterThan(catB-catA);expect(earthB).toBeGreaterThan(catB);
  const end=await step(page,{kind:'state',value:'result'},{stride:5});await page.keyboard.up('Space');expect(end.ok).toBe(true);
  expect(await page.locator('#result-screen').isVisible(),'99.999%で待たずに結果').toBe(true);
  const photo=page.locator('[data-testid="result-light-cat"]');await expect(photo).toBeVisible();
  const box=await photo.boundingBox();expect(box.height,'光の猫の高さ').toBeGreaterThanOrEqual(80);expect(box.height,'光の猫の高さ').toBeLessThanOrEqual(112);
  expect(await inViewport(photo,'#result-screen')).toBe(true);
  await expect(page.locator('#final-gamma')).toHaveText('223.6');await expect(page.locator('#final-count')).toHaveText('20');
  expect(Math.abs(number(await page.locator('#final-earth').textContent())-end.snapshot.earthSeconds),'累積の地球秒を詳細に残す').toBeLessThanOrEqual(Math.max(.1,end.snapshot.earthSeconds*1e-3));
  expect(Math.abs(number(await page.locator('#final-speed').textContent())-end.snapshot.peak),'到達速度を詳細に残す').toBeLessThanOrEqual(Math.max(1,end.snapshot.peak*1e-6));
  await expect(page.locator('#result-screen')).toContainText('簡略');await expect(page.locator('#result-screen')).toContainText('演出');
  const cy=async q=>{const r=await page.locator(q).boundingBox();return r.y+r.height/2;};
  const order=[await cy('[data-testid="result-light-cat"]'),await cy('#final-gamma'),await cy('#final-time'),await cy('#retry')];
  expect(order,'光の猫→γ→所要時間→再挑戦の順').toEqual([...order].sort((p,q)=>p-q));expect(await cy('#final-count')).toBeLessThan(order[3]);
  expect((await page.locator('.result-share').boundingBox()).y,'共有入口は再挑戦と同じ段か下').toBeGreaterThanOrEqual((await page.locator('#retry').boundingBox()).y-1);
  await page.locator('#retry').click();await expect(page.locator('#app')).toHaveAttribute('data-state','playing');
  const r=await snapshot(page);
  expect(r.experience.light.phase).toBe('coat');expect(r.experience.light.amount).toBeLessThan(.01);
  expect(r.experience.events).toHaveLength(1);expect(r.experience.events[0]).toMatchObject({seq:1,type:'world',id:'farm',elapsed:0,speed:0});
  expect([r.speed,r.elapsed,r.earthSeconds,r.impacts.total,r.input.u],'速度・時計・衝突・入力の初期化').toEqual([0,0,0,0,0]);
  if(await cat.isVisible())expect(await read(cat)).toBeLessThanOrEqual(.1);
});

for(const height of [844,664])test(`390×${height}：見出し＋速度HUDは160px以下、描画域は画面高の60%以上、開始・結果・再挑戦・共有がスクロールなしで画面内`,async({page})=>{
  await page.setViewportSize({width:390,height});await ready(page);expect(await inViewport(page.locator('#start'),'#start-screen'),'開始ボタン').toBe(true);
  await page.locator('#start').click();await expect(page.locator('#app')).toHaveAttribute('data-state','playing');
  await page.keyboard.down('Space');expect((await step(page,{kind:'speed',value:100},FAST)).ok).toBe(true);
  const top=await page.evaluate(()=>Math.max(...['.masthead','h1','#speed'].map(q=>document.querySelector(q)).filter(e=>e&&e.getClientRects().length).map(e=>e.getBoundingClientRect().bottom)));
  expect(top,'見出し＋速度HUDの下端').toBeLessThanOrEqual(160);
  const scene=await page.locator('#scene').boundingBox(),shell=await page.locator('.scene-shell').boundingBox();
  expect(Math.max(scene.height,shell.height),'描画域の高さ').toBeGreaterThanOrEqual(height*.6);
  expect(scene.y).toBeGreaterThanOrEqual(0);expect(scene.y+scene.height).toBeLessThanOrEqual(height);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'横にはみ出さない').toBe(true);
  expect((await page.locator('#page-strip').boundingBox()).width,'右端のページ移動帯').toBeGreaterThanOrEqual(44);
  expect((await step(page,{kind:'state',value:'result'},FAST)).ok).toBe(true);await page.keyboard.up('Space');
  await expect(page.locator('#result-screen')).toBeVisible();
  for(const q of ['#retry','#result-x','#result-copy','[data-testid="result-light-cat"]'])expect(await inViewport(page.locator(q),'#result-screen'),`${q} がスクロールなしで見える`).toBe(true);
  for(const q of ['#retry','#result-x','#result-copy','#mute'])expect((await page.locator(q).boundingBox()).height,`${q} は44px以上`).toBeGreaterThanOrEqual(44);
  await page.locator('#retry').click();const again=await page.locator('#scene').boundingBox();expect(again.y).toBeGreaterThanOrEqual(0);expect(again.y+again.height).toBeLessThanOrEqual(height);
});

test('1280×900：開始と結果の操作が画面内',async({page})=>{
  await page.setViewportSize({width:1280,height:900});await ready(page);expect(await inViewport(page.locator('#start'),'#start-screen')).toBe(true);
  await page.locator('#start').click();expect((await holdToResult(page,{stride:15,record:false})).ok).toBe(true);
  for(const q of ['#retry','#result-x','#result-copy','[data-testid="result-light-cat"]'])expect(await inViewport(page.locator(q),'#result-screen'),q).toBe(true);
});

// 390pxと1280pxの間（大きいスマホ・小さいタブレット）。欄の高さが固定で数字だけ画面幅に比例して大きくなり、
// 540px幅では数字の下が「次」の行に隠れていた（2026-09-23、デモ動画の撮影で発見）。
for(const width of [360,430,540,640,699,700])test(`${width}px幅：速度の数字が欄の上下左右に収まる`,async({page})=>{
  await page.setViewportSize({width,height:Math.round(width*16/9)});await begin(page);await page.keyboard.down('Space');
  for(const value of [1,1000000]){
    expect((await step(page,{kind:'speed',value},FAST)).ok).toBe(true);
    const gap=await page.evaluate(()=>{const row=document.querySelector('.speed-row').getBoundingClientRect(),s=document.querySelector('#speed').getBoundingClientRect();return {top:s.top-row.top,bottom:row.bottom-s.bottom,right:row.right-s.right};});
    for(const [side,px] of Object.entries(gap))expect(px,`${value}km/h：数字の${side}側`).toBeGreaterThanOrEqual(-.5);
  }
  await page.keyboard.up('Space');
});

test('操作説明は最初の入力が成功して2秒後に畳まれ、推力バーは残る',async({page})=>{
  await page.setViewportSize({width:390,height:844});await begin(page);
  const hint=page.locator('[data-testid="hint"]');await expect(hint).toBeVisible();
  const look=()=>hint.evaluate(el=>{const r=el.getBoundingClientRect(),cs=getComputedStyle(el);return {shown:Boolean(r.width&&r.height)&&cs.visibility!=='hidden'&&cs.display!=='none',height:r.height,opacity:Number(cs.opacity)};});
  const first=await look(),folded=s=>!s.shown||s.opacity<=.1||s.height<=first.height*.5;
  expect(first.opacity).toBeGreaterThan(.5);
  await advance(page,3000);expect(folded(await look()),'入力する前は畳まない').toBe(false);
  await page.keyboard.down('Space');await advance(page,200);await page.keyboard.up('Space');expect((await snapshot(page)).peak,'最初の入力が成功した').toBeGreaterThan(0);
  await advance(page,800);expect(folded(await look()),'入力から1秒ではまだ出ている').toBe(false);
  await advance(page,1500);await expect.poll(async()=>folded(await look()),{message:'入力から2秒後に畳む',timeout:3000}).toBe(true);
  await page.evaluate(()=>{const g=window.__day047,t=g.snapshot().elapsed;g.inputSample({time:t,stroke:true});g.inputSample({time:t,distance:200});});
  await advance(page,1000/60);await expect(page.locator('#thrust-bar'),'畳んだ後も推力バーは残る').toBeVisible();
});

test('右端のページ移動帯でホイールすると、ページ下部へ移動でき、加速しない',async({page})=>{
  await page.setViewportSize({width:390,height:664});await begin(page);
  const strip=await page.locator('#page-strip').boundingBox();await page.mouse.move(strip.x+strip.width/2,strip.y+strip.height/2);await page.mouse.wheel(0,600);
  await expect.poll(()=>page.evaluate(()=>scrollY),{message:'ページが下へ動く',timeout:3000}).toBeGreaterThan(0);
  await advance(page,500);expect((await snapshot(page)).speed).toBe(0);
});
