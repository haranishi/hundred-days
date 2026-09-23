import { createInput,enqueueInput,consumeInput,normalizeDistance,wheelDistance,pulseThrust } from './lib/input.js';
import { createImpacts,updateImpacts,impactCounts } from './lib/impacts.js';
import { createVoiceState,advanceVoice } from './lib/audio-state.js';
import { createScene } from './lib/scene.js';
import { createSound } from './lib/sound.js';
import { createRun,tick } from './lib/game.js';
import { LIGHT_SPEED,MILESTONES,lastPassed,nextMilestone } from './lib/milestones.js';
import { lorentzFactor } from './lib/physics.js';
import { WORLDS,worldAt,bulletinAt } from './lib/worlds.js';
import { audioState,soundNote } from './lib/audio-state.js';
import { lightPhase,lightAmount } from './lib/cat-light.js';
import { load,saveBest,saveMute } from './lib/store.js';
import { failure } from './boot.js';
const $=id=>document.getElementById(id),app=$('app'),canvas=$('scene'),scene=await createScene(canvas),sound=createSound();
let storage;try{storage=localStorage;}catch{}
const saved=load(storage);let best=saved.best,mute=saved.mute,run={...createRun(),phase:'ready'},manual=false,lastFrame=0,pointer=null,held=new Set(),voiceState=createVoiceState(),mouthUntil=0,raf=0,hudTime=0,storageAvailable=saved.available;
let input=createInput(),impacts=createImpacts(),pointerY=0,pointerTime=0,pointerKind='',touches=new Set(),accumulator=0;
const inputSurface=$('input-surface'),reduced=matchMedia('(prefers-reduced-motion: reduce)');
// 震え防止に最初は動きを無視する距離（CSS px）。v3-r2 は4pxで、ゆっくりこすると推力が出るまで100msを超えた。
const TOUCH_DEADZONE_PX=2;
// 指を置いた瞬間に、その場所へ小さな波紋を出す（入力を受け取ったことを推力より先に見せる）。
function ripple(x,y){const box=inputSurface.getBoundingClientRect(),el=document.createElement('i');el.className='ripple';el.style.left=`${x-box.left}px`;el.style.top=`${y-box.top}px`;inputSurface.append(el);setTimeout(()=>el.remove(),450);}
const pressed=()=>input.u>0,format=n=>n.toLocaleString('ja-JP',{maximumFractionDigits:n>10?0:2}),url='https://hundred-days.pages.dev/day-047-cat-lightspeed/';

// 進行の記録（メモリ内だけ。保存も送信もしない）：追い越し・世界・光・終了を、初めて起きた順に1回ずつ。
let surge=0,lastPulse=0,events=[],seq=0,seenWorlds=new Set(),seenLight=new Set(),passedSeen=0,finished=false,hintOffAt=Infinity,toasts=[],toastUntil=-1;
function record(type,id){events.push({seq:++seq,type,id:String(id),elapsed:run.elapsed,speed:run.speed});}
function observe(){
  const passes=MILESTONES.filter(m=>!m.wall&&m.speed<=run.peak).length;
  for(let i=passedSeen;i<passes;i++){record('milestone',i);toasts.push({kind:'pass',text:`<b>${MILESTONES[i].name}</b>を追い越した`});}passedSeen=Math.max(passedSeen,passes);
  const world=worldAt(run.speed);if(!seenWorlds.has(world.id)){seenWorlds.add(world.id);record('world',world.id);if(world.id!=='farm')toasts.push({kind:'world',text:`<b>${String(WORLDS.indexOf(world)+1).padStart(2,'0')}</b> ${world.name}へ`});}
  const ratio=run.speed/LIGHT_SPEED;
  for(const [name,at] of [['glow',.9],['light',.999]])if(ratio>=at&&!seenLight.has(name)){seenLight.add(name);record('light',name);}
}
function resetRecord(){events=[];seq=0;seenWorlds=new Set();seenLight=new Set();passedSeen=0;finished=false;hintOffAt=Infinity;toasts=[];toastUntil=-1;$('toast').className='';$('toast').innerHTML='';app.dataset.hint='on';observe();}
function release(){const old=pointer;pointer=null;held.clear();input={...createInput(),time:run.elapsed};if(old!==null&&inputSurface.hasPointerCapture(old))inputSurface.releasePointerCapture(old);app.dataset.pressed='false';}
function sample(data,stamp=performance.now()){const time=manual||!lastFrame?run.elapsed:Math.max(input.time,run.elapsed+accumulator+Math.max(0,(stamp-lastFrame)/1000));input=enqueueInput(input,{time,...data});}
function hold(value){if(value){input={...input,q:0,u:1,samples:[]};sample({held:true});}else {input={...createInput(),time:run.elapsed};}}

function updateMute(){sound.setMute(mute);voiceState=createVoiceState();mouthUntil=0;$('mute').textContent=mute?'音：オフ':'音：オン';$('mute').setAttribute('aria-pressed',String(mute));}
updateMute();
$('mute').addEventListener('click',()=>{mute=!mute;storageAvailable=saveMute(storage,mute);updateMute();if(!mute)sound.unlock();});
function start(){release();sound.stop();sound.setSilent(false);sound.unlock();run=createRun();input=createInput();surge=0;lastPulse=0;impacts=createImpacts();updateImpacts(impacts,{speed:0,world:'farm',dt:0});scene.reset();voiceState=createVoiceState();mouthUntil=0;accumulator=0;resetRecord();$('start-screen').hidden=true;$('result-screen').hidden=true;canvas.focus({preventScroll:true});render();scene.resize();scene.draw(0,0,true,false,impacts);app.scrollIntoView({block:'start',behavior:'instant'});}
$('start').addEventListener('click',start);$('retry').addEventListener('click',start);
// 「くわしい記録」を開いたら、その最後まで結果の画面の中でスクロールして見せる。
document.querySelector('.result-detail').addEventListener('toggle',event=>{if(event.target.open)event.target.scrollIntoView({block:'end',behavior:reduced.matches?'auto':'smooth'});});
function finish(){
  release();sound.stop();if(!finished){finished=true;record('finish','result');}
  const result=saveBest(storage,best,run.peak,run.elapsed);best=result.best;storageAvailable=result.saved;
  $('final-speed').textContent=format(run.peak);$('final-time').textContent=run.elapsed.toFixed(1);$('final-count').textContent=run.passed;$('final-earth').textContent=run.earthSeconds.toLocaleString('ja-JP',{maximumFractionDigits:1});$('final-gamma').textContent=lorentzFactor(run.speed).toFixed(1);
  $('best').textContent=`ベスト ${best.seconds.toFixed(1)}秒 / ${best.date}${result.improved?'（更新）':''}${storageAvailable?'':'（この端末に保存できません）'}`;
  const text=`ねこ、光になる。光速の99.999%に${run.elapsed.toFixed(1)}秒で到達。20の速さを追い越した。猫の1秒で、地球は223.6秒。`;
  $('result-x').href=`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  scene.draw(run.speed,0,true,false,impacts);scene.capture($('result-photo'));
  render();$('result-screen').hidden=false;$('retry').focus({preventScroll:true});scene.resize();
}
$('result-copy').addEventListener('click',async()=>{let copied=false;try{await navigator.clipboard.writeText(url);copied=true;}catch{const area=document.createElement('textarea');area.value=url;area.style.cssText='position:fixed;top:0;left:0;opacity:0';document.body.append(area);area.select();try{copied=document.execCommand('copy');}catch{}area.remove();$('result-copy').focus();}$('copy-status').textContent=copied?'リンクをコピーしました':'コピーできませんでした。アドレス欄からコピーしてください。';});
inputSurface.addEventListener('pointerdown',event=>{
  if(run.phase!=='playing'||touches.size>1||(event.pointerType==='mouse'&&event.button!==0))return;
  if(pointer!==null){release();sound.stop();voiceState=createVoiceState();return;}
  pointer=event.pointerId;pointerKind=event.pointerType;pointerY=event.clientY;pointerTime=event.timeStamp;inputSurface.setPointerCapture(pointer);canvas.focus({preventScroll:true});sound.unlock();ripple(event.clientX,event.clientY);
  if(pointerKind==='mouse')hold(true);else sample({stroke:true});render();
});
inputSurface.addEventListener('pointermove',event=>{
  if(event.pointerId!==pointer||pointerKind==='mouse'||run.phase!=='playing')return;
  const coalesced=event.getCoalescedEvents?.(),list=coalesced?.length?coalesced:[event];
  for(const e of list){const gap=e.timeStamp-pointerTime;if(gap>=0&&gap<=250)sample({distance:normalizeDistance(e.clientY-pointerY,inputSurface.clientHeight),deadzone:normalizeDistance(TOUCH_DEADZONE_PX,inputSurface.clientHeight)},e.timeStamp);if(gap>250)sample({stroke:true});pointerY=e.clientY;pointerTime=e.timeStamp;}sound.unlock();
});
inputSurface.addEventListener('pointerup',event=>{if(event.pointerId!==pointer)return;const mouse=pointerKind==='mouse';pointer=null;if(mouse)hold(held.size>0);render();});
for(const type of ['pointercancel','lostpointercapture'])inputSurface.addEventListener(type,event=>{if(event.pointerId===pointer)suspend();});
// ページのパンやピンチは開始した場所の既定動作に任せる（ここでは止めない）。
document.addEventListener('pointerdown',event=>{
  if(event.pointerType==='touch'){touches.add(event.pointerId);if(touches.size>1){suspend();return;}}
  if(event.target!==inputSurface){release();sound.stop();voiceState=createVoiceState();}
},true);
for(const type of ['pointerup','pointercancel'])document.addEventListener(type,e=>touches.delete(e.pointerId),true);
inputSurface.addEventListener('wheel',event=>{
  if(run.phase!=='playing'||document.activeElement!==canvas||event.ctrlKey||event.metaKey)return;
  event.preventDefault();sample({distance:normalizeDistance(wheelDistance(event.deltaY,event.deltaMode,inputSurface.clientHeight),inputSurface.clientHeight)});sound.unlock();
},{passive:false});
$('page-strip').addEventListener('wheel',()=>release(),{passive:true});
document.addEventListener('keydown',event=>{
  if(!['Space','Enter'].includes(event.code)||event.altKey||event.ctrlKey||event.metaKey||!['scene','start','retry'].includes(event.target.id))return;
  event.preventDefault();if(event.repeat)return;
  if(run.phase==='ready'||run.phase==='result')start();if(run.phase==='playing'){held.add(event.code);hold(true);sound.unlock();render();}
});
document.addEventListener('keyup',event=>{if(held.delete(event.code)){event.preventDefault();hold(held.size>0||(pointer!==null&&pointerKind==='mouse'));render();}});
function suspend(){release();sound.stop();voiceState=createVoiceState();mouthUntil=0;lastFrame=0;accumulator=0;}
window.addEventListener('resize',()=>{touches.clear();suspend();});
window.addEventListener('blur',()=>{touches.clear();suspend();});document.addEventListener('visibilitychange',()=>{if(document.hidden){touches.clear();suspend();}});
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();cancelAnimationFrame(raf);suspend();run.phase='error';failure('3D描画との接続が切れました。読み込み直すと再開できます。');});
function integrate(u,dt){
  if(run.phase!=='playing')return;
  if(u>0&&hintOffAt===Infinity)hintOffAt=run.elapsed+2;
  run=tick(run,u,dt);observe();sound.setSilent(audioState(run.speed)==='silent');if(run.boom&&!manual)sound.boom(run.elapsed);
  const hits=updateImpacts(impacts,{speed:run.speed,world:worldAt(run.speed).id,dt,reduced:reduced.matches});impacts.speed=run.speed;
  if(!manual)sound.impact(hits,run.elapsed,run.speed);
  const voice=advanceVoice(voiceState,run.elapsed,run.speed,sound.durations(),mute);voiceState=voice.state;
  if(voice.emission)mouthUntil=run.elapsed+voice.emission.duration;
  if(voice.play&&!manual)sound.meow(voice.play);
  scene.simulate(run.speed,dt,true,surge);
}
function step(dt){
  if(run.phase!=='playing')return;
  input=consumeInput(input,dt,integrate);
  // 往復のたびのひと押し：こする勢いが戻った瞬間に立ち上がり、約0.2秒で消える（長押し・Spaceでは起きない）。
  const pulse=pulseThrust(input.pulse);surge=reduced.matches?0:Math.max(surge*Math.exp(-dt*6),Math.min(1,(pulse-lastPulse)*3));lastPulse=pulse;
  if(run.phase==='result')finish();
}
// 一言は1つずつ0.9秒（続くときは0.6秒）。時計はゲーム内の経過秒なので、手動の時計でも同じに動く。
function updateToast(){
  const box=$('toast');if(run.phase!=='playing'){box.className='';return;}
  if(run.elapsed>=toastUntil&&toasts.length){if(toasts.length>2)toasts.splice(0,toasts.length-2);const next=toasts.shift();box.innerHTML=next.text;box.className=`show ${next.kind}`;toastUntil=run.elapsed+(toasts.length?.6:.9);}
  else if(run.elapsed>=toastUntil)box.className=box.className.replace('show','').trim();
}
function render(){
  shownThrust=input.u;$('thrust-bar').style.transform=`scaleX(${input.u})`;app.dataset.state=run.phase;app.dataset.pressed=String(pressed());
  if(run.phase==='playing'&&run.elapsed>=hintOffAt)app.dataset.hint='off';
  const speedText=format(run.speed);$('speed').textContent=speedText;$('speed').dataset.len=speedText.length>9?'long':'';const last=lastPassed(run.speed),next=nextMilestone(run.speed),world=worldAt(run.speed),index=WORLDS.indexOf(world);
  $('passed').textContent=last?`${last.name}を追い越した`:'最初の相手は、カタツムリ。';$('count').textContent=`${run.passed} / 20`;$('world-name').textContent=`${String(index+1).padStart(2,'0')} ${world.name}`;
  $('next').innerHTML=next.wall?'<i>最後</i>光速の壁':`<i>次</i>${next.name}`;$('progress').style.width=`${Math.min(100,Math.log10(1+run.speed/.05)/Math.log10(1+LIGHT_SPEED/.05)*100)}%`;$('news').textContent=bulletinAt(run.speed);
  const mode=audioState(run.speed);$('sound-note').textContent=soundNote(run.speed,run.elapsed,run.phase,mute);
  const ratio=run.speed/LIGHT_SPEED,near=ratio>=.9&&run.phase==='playing';$('relativity').hidden=!near;
  if(near){$('ratio').textContent=`光速の ${(ratio*100).toFixed(ratio>=.9999?3:ratio>=.999?2:1)}%`;$('gamma').textContent=lorentzFactor(run.speed).toFixed(1);$('cat-clock').textContent=run.elapsed.toFixed(1);$('earth-clock').textContent=run.earthSeconds.toFixed(1);}
  const speaking=run.phase==='playing'&&run.elapsed<mouthUntil;$('meow').textContent=speaking?(mode==='silent'?'…':'ニャー'):'';
  if(speaking){const face=scene.catScreen().face;if(face){$('meow').style.left=`${Math.min(82,Math.max(8,face.x*100+6))}%`;$('meow').style.top=`${Math.min(80,Math.max(6,face.y*100-14))}%`;}}
  updateToast();
}
function advance(ms){if(!Number.isFinite(ms)||ms<0)return;let remaining=Math.min(ms,600000)/1000;while(remaining>1e-9){const dt=Math.min(1/60,remaining);step(dt);remaining-=dt;}render();scene.draw(run.speed,0,run.phase==='playing',run.elapsed<mouthUntil,impacts);}
// 推力バーと押下状態だけは毎コマ更新する（速度などの文字は0.08秒おき）。指を動かしてから表示が変わるまでを100ms以内にするため。
let shownThrust=-1;
function showThrust(){if(input.u!==shownThrust){shownThrust=input.u;$('thrust-bar').style.transform=`scaleX(${input.u})`;app.dataset.pressed=String(pressed());}}
function frame(now){const dt=lastFrame?Math.min((now-lastFrame)/1000,.1):0;lastFrame=now;if(!manual&&!document.hidden){accumulator+=dt;while(accumulator>=1/60-1e-10){step(1/60);accumulator-=1/60;}showThrust();hudTime+=dt;if(hudTime>=.08){render();hudTime=0;}scene.draw(run.speed,0,run.phase==='playing',run.elapsed<mouthUntil,impacts);}raf=requestAnimationFrame(frame);}
function experience(){
  const ratio=run.speed/LIGHT_SPEED,phase=run.phase==='result'?'light':lightPhase(ratio);
  return {reducedMotion:reduced.matches,events:events.map(e=>({...e})),landmarks:scene.landmarks(),light:{phase,amount:run.phase==='result'?Math.max(lightAmount(ratio),.8):lightAmount(ratio)},motion:scene.motion()};
}
window.__day047={state:()=>run.phase,snapshot:()=>({...run,contractVersion:3,pressed:pressed(),surge,world:worldAt(run.speed).id,audio:audioState(run.speed),gamma:lorentzFactor(run.speed),catScreen:scene.catScreen(),faceScreen:scene.faceScreen(),render:scene.stats(),input:{u:input.u,q:input.q},impacts:{total:impacts.total,last:impacts.last,...impactCounts(impacts)},sound:sound.stats(),experience:experience()}),setManual(value=true){manual=Boolean(value);sound.stop();lastFrame=0;},advance,start,inputSample(sample){input=enqueueInput(input,sample);}};
$('loading-screen').hidden=true;$('start-screen').hidden=false;$('start').focus({preventScroll:true});render();scene.draw(0,0,false,false);raf=requestAnimationFrame(frame);
