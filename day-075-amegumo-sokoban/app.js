import {CHAPTERS,flowerColor,terrainMarkup,mechanicLegend,campaignEvents} from './lib/campaign-view.js';
import {createGardenAudio} from './lib/audio.js';
import {setupAudioControls} from './lib/audio-ui.js';
import {createGardenMotion} from './lib/motion.js';
import {setupGuide} from './lib/guide.js';
import {LEVELS} from './lib/levels.js';
import {createState,move} from './lib/game.js';
import {readProgress,recordWin} from './lib/progress.js';

const $=id=>document.getElementById(id);
let audioControls;
const sound=createGardenAudio({onChange:()=>audioControls?.render()});
const STEP=76, OX=92, OY=54;
const directionDelta={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
let levelIndex=0, state, history=[], progress=readProgress(), showHint=false;
let saveFailed=false, pendingWin=null, completion=null, presentationVersion=0;
const description=document.createElement('p');
description.id='board-description';description.className='sr-only';
$('garden').after(description);$('garden').setAttribute('aria-describedby',description.id);
const escapeText=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const level=()=>LEVELS[levelIndex];
const dialogOpen=()=>Boolean(document.querySelector('dialog[open]'));
const coord=(x,y)=>[OX+x*STEP+STEP/2,OY+y*STEP+STEP/2];
const drop=(x,y,color='#628e9c',scale=1)=>'<path d="M0 -8 C-2 -4 -6 0 -6 4 A6 6 0 0 0 6 4 C6 0 2 -4 0 -8Z" fill="'+color+'" transform="translate('+x+' '+y+') scale('+scale+')"/>';
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const motion=createGardenMotion($('garden'),{coord,reducedMotion:()=>reducedMotion.matches});
const resultButton=document.createElement('button');
resultButton.id='result-button';resultButton.type='button';resultButton.className='secondary-button result-button';resultButton.textContent='結果を見る';resultButton.hidden=true;$('status').after(resultButton);
function cloud(x,y,drops,index){
 const [cx,cy]=coord(x,y);
 return '<g class="actor-position cloud'+(drops===0?' cloud-empty':'')+'" data-actor="cloud-'+index+'" transform="translate('+cx+' '+(cy-14)+')"><g class="cloud-sprite"><ellipse cy="32" rx="30" ry="8" fill="#526f4b" opacity=".19"/><path d="M-23 17 C-44 17 -41 -6 -24 -9 C-24 -28 1 -34 10 -17 C28 -25 41 -10 33 2 C49 18 24 24 14 21 L-21 21Z" fill="'+(drops?'#fffdf2':'#e6e9dc')+'" stroke="#718d82" stroke-width="1.6"/><path d="M-25 13 Q0 21 29 12" fill="none" stroke="#d6e4db" stroke-width="2"/></g></g>';
}
function cloudLabel(cloud,index){
 const [cx,cy]=coord(cloud.x,cloud.y);
 return '<g data-actor-label="cloud-'+index+'" transform="translate('+cx+' '+(cy-14)+')" pointer-events="none"><g transform="translate(16 -12)"><rect x="-20" y="-11" width="40" height="22" rx="10" fill="#fffdf2" stroke="#809581" stroke-width="1.2"/>'+drop(-10,-1,cloud.drops?'#507f8e':'#97aaa0',.65)+'<text x="1" y="6" fill="#274f46" font-size="20" font-weight="750">'+cloud.drops+'</text></g></g>';
}
function farmer(x,y){
 const [cx,cy]=coord(x,y);
 return '<g class="actor-position gardener" data-actor="gardener" transform="translate('+cx+' '+cy+')"><g class="gardener-sprite"><ellipse cy="24" rx="18" ry="6" fill="#385e43" opacity=".2"/><path d="M-11 15 L-13 28 M9 15 L11 28" stroke="#405950" stroke-width="7" stroke-linecap="round"/><path d="M-13 23 Q-20 2 -10 -5 L10 -5 Q20 2 13 23Z" fill="#d9ad51" stroke="#8e723c" stroke-width="1.5"/><path d="M0 2 L0 21 M-6 7 L6 7" stroke="#f6d785" stroke-width="2"/><circle cy="-12" r="11" fill="#e8bd91"/><path d="M-20 -15 Q0 -25 20 -15 Q17 -8 0 -9 Q-17 -8 -20 -15Z" fill="#e9cd8a" stroke="#9d8151" stroke-width="1.3"/><path d="M-11 -19 Q-10 -34 1 -31 Q13 -29 12 -18" fill="#e9cd8a" stroke="#9d8151" stroke-width="1.3"/><path d="M-11 -19 Q0 -16 12 -18" stroke="#76885c" stroke-width="3"/><circle cx="-3" cy="-9" r="1.1" fill="#405950"/><circle cx="4" cy="-9" r="1.1" fill="#405950"/></g></g>';
}
function plot(x,y,water,need,index){
 const [cx,cy]=coord(x,y),over=water>need,done=water===need;
 return '<g class="plot'+(over?' plot-over':done?' plot-done':'')+'" data-plot-index="'+index+'"><rect x="'+(cx-33)+'" y="'+(cy-31)+'" width="66" height="64" rx="9" fill="'+(over?'#b5aea0':water?'#a7805b':'#c6a273')+'" stroke="'+(over?'#985f45':'#a27f59')+'" stroke-width="1.5"/>'+[-17,0,17].map(d=>'<path d="M'+(cx-25)+' '+(cy+d)+' q23 -3 49 1" fill="none" stroke="#805f45" opacity=".35" stroke-width="2"/>').join('')+'</g>';
}
function plants(x,y,water,need,index){
 const [cx,cy]=coord(x,y),over=water>need,done=water===need;
 const color=flowerColor(levelIndex);
 let content='';
 for(let i=0;i<3;i++){
  const px=cx-23+i*23,py=cy+23+(i===1?-3:0);
  if(water===0){content+='<g class="seed" transform="translate('+px+' '+py+')"><ellipse rx="3.7" ry="2.3" fill="#7c5b3d" transform="rotate(-25)"/><path d="M-3 4 q3 1 6 0" stroke="#dfbd88" stroke-width="1" fill="none"/></g>';continue;}
  const height=done?23-(i%2)*2:over?14:15;
  let head='';
  if(done){head='<g class="flower-head" transform="translate(0 '+(-height)+')"><g class="flower-petals">'+Array.from({length:8},(_,j)=>'<ellipse cx="0" cy="-7" rx="4.2" ry="6.5" transform="rotate('+(j*45)+')" fill="'+color+'" stroke="#8d9064" stroke-width=".65"/>').join('')+'</g><circle r="4.1" fill="#dba848" stroke="#9f7c38" stroke-width=".8"/></g>';}
  else if(over){head='<path d="M0 -16 q12 -6 13 5" fill="none" stroke="#8b7952" stroke-width="2.5"/><ellipse cx="13" cy="-8" rx="4.5" ry="6" fill="#b39875" transform="rotate(-30 13 -8)"/>';}
  else{head='<path d="M-3 -18 q3 -7 6 0" fill="#99b679" stroke="#4d7850" stroke-width="1"/>';}
  content+='<g transform="translate('+px+' '+py+')"><g class="plant-growth'+(over?' plant-wilted':done?' plant-flowering':' plant-sprout')+'"><path d="M0 3 Q-2 -8 0 '+(-height)+'" fill="none" stroke="'+(over?'#8b7952':'#47784e')+'" stroke-width="2.6" stroke-linecap="round"/><path d="M0 -6 C-12 -4 -14 -12 -12 -15 C-3 -15 0 -11 0 -6Z" fill="'+(over?'#a18c69':'#66925b')+'"/><path d="M0 -12 C9 -13 13 -19 10 -22 C2 -22 0 -17 0 -12Z" fill="'+(over?'#a18c69':'#7da46a')+'"/>'+head+'</g></g>';
 }
 return '<g data-plant-plot="'+index+'" class="plot-plants" style="--flower-color:'+color+'" pointer-events="none">'+content+'</g>';
}
function flowerStamp(){
 return '<svg class="tab-blossom" viewBox="0 0 24 24" aria-hidden="true">'+Array.from({length:6},(_,i)=>'<ellipse cx="12" cy="6.8" rx="3" ry="4.7" fill="currentColor" transform="rotate('+(i*60)+' 12 12)"/>').join('')+'<circle cx="12" cy="12" r="3" fill="#d9ad51"/></svg>';
}
function renderGarden(){
 const l=level();let svg='<defs><pattern id="paper-speckle" width="19" height="23" patternUnits="userSpaceOnUse"><circle cx="3" cy="5" r=".7" fill="#4e755b" opacity=".13"/><circle cx="15" cy="17" r=".5" fill="#4e755b" opacity=".1"/></pattern></defs>';
 svg+='<rect width="640" height="600" rx="24" fill="#dfe8d6"/><path d="M0 95 Q95 50 190 93 T390 79 T640 86 V0 H0Z" fill="#e8eddf"/><circle cx="577" cy="48" r="22" fill="#f2d291"/><circle cx="577" cy="48" r="29" fill="none" stroke="#f2d291" stroke-width="1" stroke-dasharray="2 7"/>';
 svg+='<ellipse cx="322" cy="548" rx="251" ry="26" fill="#748968" opacity=".19"/><rect x="82" y="62" width="476" height="476" rx="24" fill="#8c8661"/><rect x="82" y="46" width="476" height="476" rx="24" fill="#b3bf8d" stroke="#87996b" stroke-width="2"/>';
 for(let y=0;y<6;y++)for(let x=0;x<6;x++){
  const [cx,cy]=coord(x,y),wall=l.grid[y][x]==='#',p=l.plots.findIndex(p=>p.x===x&&p.y===y);
  svg+='<g data-x="'+x+'" data-y="'+y+'"><rect class="tile" x="'+(cx-36)+'" y="'+(cy-36)+'" width="72" height="72" rx="8" fill="'+(wall?'#92a77e':((x+y)%2?'#d0d8b4':'#d7debd'))+'"/>';
  if(wall){
   svg+='<path d="M'+(cx-23)+' '+(cy+17)+' Q'+(cx-40)+' '+(cy-7)+' '+(cx-17)+' '+(cy-14)+' Q'+(cx-15)+' '+(cy-35)+' '+(cx+7)+' '+(cy-22)+' Q'+(cx+32)+' '+(cy-27)+' '+(cx+28)+' '+(cy+4)+' Q'+(cx+43)+' '+(cy+24)+' '+(cx+13)+' '+(cy+24)+'Z" fill="'+((x+y)%2?'#638461':'#779268')+'"/><path d="M'+(cx-16)+' '+(cy+11)+' Q'+cx+' '+(cy-6)+' '+(cx+17)+' '+(cy+10)+'" fill="none" stroke="#a6ba87" stroke-width="2"/>';
   if((x+y)%3===0)svg+='<path d="M'+(cx-15)+' '+(cy+24)+' L'+(cx-21)+' '+(cy+9)+' L'+(cx-10)+' '+(cy-1)+' L'+(cx+6)+' '+(cy+2)+' L'+(cx+13)+' '+(cy+21)+'Z" fill="#a7ae9d" stroke="#7c8d78"/>';
  } else if(p!==-1)svg+=plot(x,y,state.water[p],l.plots[p].need,p);
  else {
   svg+='<path d="M'+(cx-18)+' '+(cy+16)+' l-2 -6 m2 6 l4 -5 M'+(cx+16)+' '+(cy-18)+' l-2 -5 m2 5 l3 -5" stroke="#9bab7c" stroke-width="1.5" fill="none" stroke-linecap="round"/>';
  }
  svg+='</g>';
 }
 svg+='<rect x="90" y="54" width="460" height="460" rx="13" fill="url(#paper-speckle)" pointer-events="none"/>';
 svg+=terrainMarkup(l,state,coord);
 const adjacent=Object.values(directionDelta).map(([dx,dy])=>({x:state.player.x+dx,y:state.player.y+dy}));
 for(const p of adjacent)if(p.x>=0&&p.y>=0&&p.x<6&&p.y<6&&l.grid[p.y][p.x]!== '#'){const [cx,cy]=coord(p.x,p.y);svg+='<circle cx="'+cx+'" cy="'+cy+'" r="3" fill="#71895c" opacity=".5"/>';}
 state.clouds.forEach((c,i)=>{svg+=cloud(c.x,c.y,c.drops,i);});
 l.plots.forEach((p,i)=>{svg+=plants(p.x,p.y,state.water[i],p.need,i);});
 svg+=farmer(state.player.x,state.player.y);
 l.plots.forEach((p,i)=>{const [cx,cy]=coord(p.x,p.y),water=state.water[i],done=water===p.need,over=water>p.need;
 svg+='<g pointer-events="none"><rect x="'+(cx-7)+'" y="'+(cy+12)+'" width="44" height="26" rx="7" fill="'+(over?'#8e513f':done?'#325f49':'#fff8e7')+'"/><text x="'+(cx+15)+'" y="'+(cy+32)+'" text-anchor="middle" fill="'+(done||over?'#fff9e9':'#4e5947')+'" font-size="20" font-weight="700">'+water+'/'+p.need+'</text></g>';
 });
 state.clouds.forEach((c,i)=>{svg+=cloudLabel(c,i);});

 svg+='<g fill="none" stroke="#a6966c" stroke-width="4" stroke-linecap="round"><path d="M119 545 L119 567 M163 545 L163 567 M207 545 L207 567 M113 552 H215 M113 561 H215"/></g><path d="M481 554 q13 -22 22 -17 q-6 19 -22 17 M482 553 q-17 -17 -24 -7 q13 14 24 7" fill="#6f9066"/><text x="319" y="563" text-anchor="middle" font-family="serif" font-size="13" fill="#4b6b53" letter-spacing="3">ひと雨、ひとつの芽。</text>';
 svg+='<rect class="garden-glow" x="82" y="46" width="476" height="476" rx="24" fill="#f5d577" opacity="0" pointer-events="none"/><g data-fx-layer="" pointer-events="none"></g>';
 $('garden').innerHTML=svg;
 description.textContent='庭師は上から'+(state.player.y+1)+'行、左から'+(state.player.x+1)+'列。'+state.clouds.map((c,i)=>'雲'+(i+1)+'は'+(c.y+1)+'行'+(c.x+1)+'列、残り'+c.drops+'滴。').join('')+l.plots.map((p,i)=>'畑'+(i+1)+'は'+(p.y+1)+'行'+(p.x+1)+'列、'+state.water[i]+'/'+p.need+'滴。').join('')+(l.ledges||[]).map(e=>'石段は'+(e.from.y+1)+'行'+(e.from.x+1)+'列から'+(e.to.y+1)+'行'+(e.to.x+1)+'列へ雲を押せます。').join('')+(l.dew||[]).map((d,i)=>'雨玉は'+(d.y+1)+'行'+(d.x+1)+'列、'+(state.collected?.[i]?'取得済み。':'未取得。')).join('')+(l.portals||[]).map((p,i)=>'風穴'+(i?'B':'A')+'は'+(p.y+1)+'行'+(p.x+1)+'列。').join('')+'矢印キーまたは方向ボタンで移動できます。';
}
function render({garden=true}={}){
 const l=level(),done=l.plots.filter((p,i)=>state.water[i]===p.need).length;
 $('level-kicker').textContent='GARDEN '+String(levelIndex+1).padStart(2,'0')+' / '+LEVELS.length;
 $('level-name').textContent=l.name;$('level-story').textContent=l.story||l.subtitle;
 $('moves').textContent=String(state.moves).padStart(2,'0');
 $('rain-left').textContent=state.clouds.reduce((n,c)=>n+c.drops,0);
 $('plot-count').textContent=done+' / '+l.plots.length;
 $('best').textContent=progress[l.id] ? progress[l.id]+'手' : '—';
 $('progress-fill').style.width=(done/l.plots.length*100)+'%';
 $('undo-button').disabled=!history.length;
 resultButton.hidden=!state.won;
 $('level-hint').hidden=!showHint;$('level-hint').textContent=l.hint||'雲の行き先だけでなく、その後ろに回り込める道も残しておこう。';
 $('hint-button').setAttribute('aria-expanded',String(showHint));
 const chapter=Math.floor(levelIndex/5),chapterLevels=LEVELS.slice(chapter*5,chapter*5+5);
 $('chapter-tabs').innerHTML=CHAPTERS.map((c,i)=>'<button type="button" class="chapter-button" data-chapter="'+i+'" aria-current="'+(i===chapter)+'" aria-label="第'+(i+1)+'章 '+c.name+'"><span class="chapter-number">0'+(i+1)+'</span><span>'+c.name+'</span></button>').join('');
 $('chapter-theme').textContent=CHAPTERS[chapter].theme;
 $('campaign-progress').textContent='育った庭 '+LEVELS.filter(l=>progress[l.id]).length+' / '+LEVELS.length;
 $('chapter-progress').textContent='この章 '+chapterLevels.filter(l=>progress[l.id]).length+' / '+chapterLevels.length;
 $('level-par').textContent=l.par+'手';
 $('level-tabs').innerHTML=chapterLevels.map((item,n)=>{
  const i=chapter*5+n;
  return '<button type="button" data-level="'+i+'" class="level-tab'+(i===levelIndex?' is-active':'')+(progress[item.id]?' is-complete':'')+'" aria-label="第'+(i+1)+'の庭 '+escapeText(item.name)+(progress[item.id]?' 達成済み':'')+'"'+(i===levelIndex?' aria-current="step"':'')+'><span class="level-tab-number">'+String(i+1).padStart(2,'0')+'</span>'+(progress[item.id]?'<span class="tab-achieved" aria-hidden="true">'+flowerStamp()+'</span>':'')+'</button>';
 }).join('');
 const legend=mechanicLegend(l,state);$('mechanic-legend').innerHTML=legend;$('mechanic-legend').hidden=!legend;
 if(garden)renderGarden();
}
function say(message,tone='normal'){$('status').textContent=message;$('status').dataset.tone=tone;}
function cancelPresentation({forgetResult=false}={}){
 presentationVersion++;
 if(pendingWin!==null){clearTimeout(pendingWin);pendingWin=null;}
 motion.cancel();
 sound.cancelEffects();
 if(forgetResult)completion=null;
}
function scheduleResult(delay=0){
 if(pendingWin!==null){clearTimeout(pendingWin);pendingWin=null;}
 if(!completion||completion.shown||completion.state!==state||!state.won)return;
 const version=presentationVersion,current=completion;
 const display=()=>{
  pendingWin=null;
  if(version!==presentationVersion||completion!==current||current.state!==state||!state.won)return;
  if(document.hidden||dialogOpen())return;
  current.shown=true;showWin();
 };
 if(delay>0)pendingWin=setTimeout(display,delay);else display();
}
function syncSoundScene(){
 const dialog=document.querySelector('dialog[open]');
 sound.setScene({playing:Boolean(state&&!state.won&&!document.hidden&&(!dialog||dialog.id==='sound-dialog')),level:levelIndex});
}
function resumePendingResult(){scheduleResult(0);syncSoundScene();}
function startLevel(index,focus=false,cue='select'){
 cancelPresentation({forgetResult:true});
 levelIndex=index;state=createState(level());history=[];showHint=false;
 for(const d of document.querySelectorAll('dialog[open]'))d.close();
 render();say(levelIndex===0?'まずは右へひと押し。雲を畑へ運ぶと1滴です。':'畑の数字をちょうどに。雲の通り道を考えよう。');
 if(focus)$('garden').focus({preventScroll:true});
 syncSoundScene();sound.play(cue,{variant:levelIndex});
}
function applyMove(dir){
 if(dialogOpen())return;
 const before=state,result=move(level(),state,dir);
 if(!result.moved){if(!state.won){say(result.reason==='ledge'?'この石段は矢印の方向だけ。雲の押し方を変えてみよう。':result.reason==='portal-blocked'?'風穴の出口がふさがっています。出口の雲や庭師を動かそう。':'その先は通れません。雲の向こうに空きがあるか見てみよう。');sound.play('blocked');}return;}
 const positions=motion.capture();
 cancelPresentation({forgetResult:true});
 history.push(before);state=result.state;
 if(state.won){
  const saved=recordWin(progress,level().id,state.moves);progress=saved.progress;saveFailed=!saved.saved;
  completion={state,levelId:level().id,shown:false,sounded:false};
 }
 render();
 const duration=motion.play({before,after:state,level:level(),positions});
 const events=campaignEvents(before,state,level());
 sound.play('step',{variant:state.moves+levelIndex});
 if(result.pushed)sound.play('push',{variant:levelIndex});
 if(events.collected.length)sound.play('pickup',{delay:reducedMotion.matches?0:120});
 if(events.warped.length)sound.play('warp');
 if(result.rained){
  sound.play('rain',{delay:reducedMotion.matches?0:150,variant:levelIndex});
  const changed=state.water.findIndex((water,i)=>water>before.water[i]);
  const event=state.water[changed]>level().plots[changed].need?'overwater':state.water[changed]===level().plots[changed].need?'bloom':'sprout';
  sound.play(event,{delay:reducedMotion.matches?50:event==='bloom'?520:350,variant:levelIndex});
 }
 syncSoundScene();
 const over=state.water.some((n,i)=>n>level().plots[i].need);
 const blooming=state.water.some((n,i)=>n===level().plots[i].need&&n>before.water[i]);
 if(over)say('雨が多すぎる畑があります。「一手もどす」で雨も戻せます。','warning');
 else if(result.rained&&blooming)say('ぱっ。ちょうどの雨で、花が咲きました。','bloom');
 else if(result.rained)say('ぽつり。芽が出ました。あと'+level().plots.reduce((n,p,i)=>n+Math.max(0,p.need-state.water[i]),0)+'滴を届けよう。','rain');
 else if(events.collected.length)say('雨玉を拾って、雲に1滴補充しました。','rain');
 else if(events.warped.length)say('ふわり。雲がもう一方の風穴へ移りました。');
 else if(result.pushed)say('雲を押しました。空の地面では雨を使いません。');
 else say('庭師が移動しました。雲の後ろへ回り込もう。');
 if(state.won)scheduleResult(reducedMotion.matches?0:Math.max(1100,duration));
}
function undo(){
 if(!history.length)return;
 cancelPresentation({forgetResult:true});
 state=history.pop();render();say('一手もどしました。雨も、芽も、元どおり。');
 sound.play('undo');syncSoundScene();
}
function openDialog(id,opener){
 cancelPresentation();
 $(opener).focus({preventScroll:true});
 $(id).showModal();
 syncSoundScene();
}
function showWin(){
 if(!state.won)return;
 const shouldSound=completion&&!completion.sounded;
 if(completion){completion.shown=true;completion.sounded=true;}
 const all=LEVELS.every(l=>progress[l.id]);
 $('win-dialog').style.setProperty('--reward-flower',flowerColor(levelIndex));
 $('win-title').textContent=levelIndex===LEVELS.length-1?'庭いっぱいに、花が咲いた。':'ひと雨から、花が咲いた。';
 $('win-description').textContent=level().name+'を'+state.moves+'手でクリア。'+(saveFailed?' この端末では記録を保存できませんでした。':all?' '+LEVELS.length+'の庭をすべて潤しました。':' 記録をこの端末に残しました。');
 $('win-next').textContent=levelIndex===LEVELS.length-1?'最初の庭へ':'次の庭へ';
 $('win-replay').textContent='この庭をもう一度';
 openDialog('win-dialog','garden');
 if(shouldSound)sound.play('clear',{variant:levelIndex});
}
function chooseGarden(index){
 startLevel(index,true);
 if(innerWidth<761)document.querySelector('.garden-section').scrollIntoView({block:'start',behavior:'instant'});
}
$('level-tabs').addEventListener('click',e=>{const b=e.target.closest('[data-level]');if(b)chooseGarden(Number(b.dataset.level));});
$('chapter-tabs').addEventListener('click',e=>{const b=e.target.closest('[data-chapter]');if(b)chooseGarden(Number(b.dataset.chapter)*5);});
$('dpad').addEventListener('click',e=>{const b=e.target.closest('[data-dir]');if(b)applyMove(b.dataset.dir);});
$('undo-button').addEventListener('click',undo);
resultButton.addEventListener('click',()=>showWin());
$('reset-button').addEventListener('click',()=>{if(state.moves)openDialog('reset-dialog','reset-button');else say('この庭は、まだ最初の状態です。');});
$('reset-confirm').addEventListener('click',()=>startLevel(levelIndex,true,'reset'));
$('reset-cancel').addEventListener('click',()=>$('reset-dialog').close());
$('share-button').addEventListener('click',()=>openDialog('share-dialog','share-button'));
$('share-close').addEventListener('click',()=>$('share-dialog').close());
$('win-close').addEventListener('click',()=>$('win-dialog').close());
$('win-next').addEventListener('click',()=>startLevel((levelIndex+1)%LEVELS.length,true));
$('win-replay').addEventListener('click',()=>startLevel(levelIndex,true,'reset'));
$('hint-button').addEventListener('click',()=>{showHint=!showHint;render({garden:false});});
document.addEventListener('keydown',e=>{
 if(dialogOpen()||e.altKey||e.metaKey||e.ctrlKey||e.repeat||e.target.closest('input,textarea,select,[contenteditable="true"]'))return;
 const dir={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',w:'up',s:'down',a:'left',d:'right'}[e.key];
 if(dir){e.preventDefault();applyMove(dir);}
 if(e.key.toLowerCase()==='z'){e.preventDefault();undo();}
});
let pointer=null,suppressClick=false;
$('garden').addEventListener('pointerdown',e=>{if(e.isPrimary&&e.button===0){suppressClick=false;pointer={x:e.clientX,y:e.clientY,id:e.pointerId};$('garden').setPointerCapture(e.pointerId);}});
$('garden').addEventListener('pointerup',e=>{
 if(!pointer||pointer.id!==e.pointerId)return;
 const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;pointer=null;
 if(Math.max(Math.abs(dx),Math.abs(dy))>25){suppressClick=true;applyMove(Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up');}
});
$('garden').addEventListener('pointercancel',()=>{pointer=null;});
$('garden').addEventListener('click',e=>{
 if(suppressClick){suppressClick=false;return;}if(dialogOpen())return;
 const matrix=$('garden').getScreenCTM();if(!matrix)return;
 const point=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());
 const x=Math.floor((point.x-OX)/STEP),y=Math.floor((point.y-OY)/STEP);
 const dx=x-state.player.x,dy=y-state.player.y;
 const dir=Object.keys(directionDelta).find(key=>directionDelta[key][0]===dx&&directionDelta[key][1]===dy);
 if(dir)applyMove(dir);else say('庭師のとなりをタップするか、下の矢印で動かそう。');
});
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
const local=['localhost','127.0.0.1',''].includes(location.hostname)||location.hostname==='[::1]';
$('local-share-note').hidden=!local;
for(const dialog of document.querySelectorAll('dialog:not(#help-dialog)'))dialog.addEventListener('close',resumePendingResult);
document.addEventListener('visibilitychange',()=>{
 if(document.hidden)cancelPresentation();
 else resumePendingResult();
 Promise.resolve(sound.setVisible(!document.hidden)).then(syncSoundScene).catch(()=>{});
 syncSoundScene();
});
reducedMotion.addEventListener('change',()=>{
 cancelPresentation();renderGarden();resumePendingResult();
});
function resumeAudioFromGesture(event){
 if(!event.isTrusted||event.target.closest('[data-audio-toggle]'))return;
 if(event.type==='keydown'&&['Shift','Control','Alt','Meta'].includes(event.key))return;
 const snapshot=sound.snapshot();
 if(snapshot.enabled&&!snapshot.ready)void sound.unlock().then(syncSoundScene).catch(()=>{});
}
document.addEventListener('pointerdown',resumeAudioFromGesture,{capture:true});
document.addEventListener('keydown',resumeAudioFromGesture,{capture:true});
startLevel(0);
audioControls=setupAudioControls(sound,{onBeforeOpen:()=>cancelPresentation(),onAfterClose:resumePendingResult});
const guide=setupGuide({
 onBeforeOpen:()=>{cancelPresentation();sound.setScene({playing:false,level:levelIndex});},
 onAfterClose:resumePendingResult,
 onDemo:()=>{
  sound.cancelEffects();sound.play('push');
  sound.play('rain',{delay:reducedMotion.matches?0:190});
  sound.play('bloom',{delay:reducedMotion.matches?50:590});
 },
 onDemoCancel:()=>sound.cancelEffects()
});
guide.showFirstVisit();
syncSoundScene();
