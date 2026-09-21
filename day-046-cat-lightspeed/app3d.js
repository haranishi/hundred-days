import { createScene } from './lib/scene.js';
import { createSound } from './lib/sound.js';
import { createRun,tick } from './lib/game.js';
import { LIGHT_SPEED,lastPassed,nextMilestone } from './lib/milestones.js';
import { lorentzFactor } from './lib/physics.js';
import { WORLDS,worldAt,bulletinAt } from './lib/worlds.js';
import { audioState,voicePlan,soundNote } from './lib/audio-state.js';
import { load,saveBest,saveMute } from './lib/store.js';
import { failure } from './boot.js';
const $=id=>document.getElementById(id),app=$('app'),canvas=$('scene'),scene=createScene(canvas),sound=createSound();
let storage;try{storage=localStorage;}catch{}
const saved=load(storage);let best=saved.best,mute=saved.mute,run={...createRun(),phase:'ready'},manual=false,lastFrame=0,pointer=null,held=new Set(),voiceAt=0,mouthUntil=0,raf=0,hudTime=0,storageAvailable=saved.available;
const pressed=()=>pointer!==null||held.size>0,format=n=>n.toLocaleString('ja-JP',{maximumFractionDigits:n>10?0:2}),url='https://hundred-days.pages.dev/day-046-cat-lightspeed/';
function release(){pointer=null;held.clear();app.dataset.pressed='false';}
function updateMute(){sound.setMute(mute);$('mute').textContent=mute?'音：オフ':'音：オン';$('mute').setAttribute('aria-pressed',String(mute));}
updateMute();
$('mute').addEventListener('click',()=>{mute=!mute;storageAvailable=saveMute(storage,mute);updateMute();if(!mute)sound.unlock();});
function start(){release();sound.stop();sound.setSilent(false);sound.unlock();run=createRun();voiceAt=0;mouthUntil=0;$('start-screen').hidden=true;$('result-screen').hidden=true;canvas.focus({preventScroll:true});render();scene.resize();app.scrollIntoView({block:'start',behavior:'instant'});}
$('start').addEventListener('click',start);$('retry').addEventListener('click',start);
function finish(){
  release();sound.stop();const result=saveBest(storage,best,run.peak,run.elapsed);best=result.best;storageAvailable=result.saved;
  $('final-speed').textContent=format(run.peak);$('final-time').textContent=run.elapsed.toFixed(1);$('final-count').textContent=run.passed;$('final-earth').textContent=run.earthSeconds.toLocaleString('ja-JP',{maximumFractionDigits:1});$('final-gamma').textContent=lorentzFactor(run.speed).toFixed(1);
  $('best').textContent=`ベスト ${best.seconds.toFixed(1)}秒 / ${best.date}${storageAvailable?'':'（この端末に保存できません）'}`;
  const text=`ねこ、光になる。光速の99.999%に${run.elapsed.toFixed(1)}秒で到達。20の速さを追い越した。私の1秒で、地球は223.6秒。`;
  $('result-x').href=`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;$('result-screen').hidden=false;$('result-screen').focus({preventScroll:true});scene.resize();
}
$('result-copy').addEventListener('click',async()=>{let copied=false;try{await navigator.clipboard.writeText(url);copied=true;}catch{const area=document.createElement('textarea');area.value=url;area.style.cssText='position:fixed;top:0;left:0;opacity:0';document.body.append(area);area.select();try{copied=document.execCommand('copy');}catch{}area.remove();$('result-copy').focus();}$('copy-status').textContent=copied?'リンクをコピーしました':'コピーできませんでした。アドレス欄からコピーしてください。';});
canvas.addEventListener('pointerdown',event=>{if(run.phase!=='playing'||(event.pointerType==='mouse'&&event.button!==0)||pointer!==null)return;event.preventDefault();pointer=event.pointerId;canvas.setPointerCapture(pointer);canvas.focus({preventScroll:true});sound.unlock();render();});
function releasePointer(event){if(pointer===event.pointerId){pointer=null;render();}}
for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,releasePointer);
document.addEventListener('keydown',event=>{
  if(!['Space','Enter'].includes(event.code)||event.altKey||event.ctrlKey||event.metaKey)return;
  const target=event.target;if(target.closest('a,button,input,textarea,select,summary')&&!['start','retry'].includes(target.id))return;
  event.preventDefault();if(event.repeat)return;
  if(run.phase==='ready'||run.phase==='result')start();if(run.phase==='playing'){held.add(event.code);sound.unlock();render();}
});
document.addEventListener('keyup',event=>{if(held.delete(event.code)){event.preventDefault();render();}});
function suspend(){release();sound.stop();lastFrame=0;}
window.addEventListener('blur',suspend);document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();});
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();cancelAnimationFrame(raf);suspend();run.phase='error';failure('3D描画との接続が切れました。読み込み直すと再開できます。');});
function step(dt){
  if(run.phase!=='playing')return;const previous=run.phase;run=tick(run,pressed(),dt);sound.setSilent(audioState(run.speed)==='silent');if(run.boom)sound.boom();
  if(run.speed>0&&run.elapsed>=voiceAt){const plan=voicePlan(run.speed);mouthUntil=run.elapsed+.3;voiceAt=run.elapsed+plan.interval;sound.meow(run.speed);}
  if(previous==='playing'&&run.phase==='result')finish();
}
function render(){
  app.dataset.state=run.phase;app.dataset.pressed=String(pressed());$('speed').textContent=format(run.speed);const last=lastPassed(run.speed),next=nextMilestone(run.speed),world=worldAt(run.speed),index=WORLDS.indexOf(world);
  $('passed').textContent=last?`${last.name}を追い越した`:'最初の相手は、カタツムリ。';$('count').textContent=`${run.passed} / 20`;$('world-name').textContent=`${world.name} / 0${index+1}`;
  $('scene-code').textContent=['01 — THE MEADOW','02 — THE CITY','03 — THE SKY','04 — THE ORBIT','05 — THE SOLAR SYSTEM','06 — INTERSTELLAR'][index];
  $('next').textContent=next.wall?'FINAL / 光速の壁':`NEXT / ${next.name}`;$('progress').style.width=`${Math.min(100,Math.log10(1+run.speed/.05)/Math.log10(1+LIGHT_SPEED/.05)*100)}%`;$('news').textContent=bulletinAt(run.speed);
  const mode=audioState(run.speed);$('sound-note').textContent=soundNote(run.speed,run.elapsed,run.phase,mute);
  const near=run.speed>=LIGHT_SPEED*.9;$('relativity').hidden=!near;$('ratio').textContent=`光速の ${(run.speed/LIGHT_SPEED*100).toFixed(run.speed/LIGHT_SPEED>=.9999?3:run.speed/LIGHT_SPEED>=.999?2:1)}%`;$('gamma').textContent=lorentzFactor(run.speed).toFixed(1);
  $('meow').textContent=run.phase==='playing'&&run.elapsed<mouthUntil?(mode==='silent'?'…':'ニャー') :'';
}
function advance(ms){if(!Number.isFinite(ms)||ms<0)return;let remaining=Math.min(ms,600000)/1000;while(remaining>1e-9){const dt=Math.min(1/60,remaining);step(dt);remaining-=dt;}render();scene.draw(run.speed,0,run.phase==='playing',run.elapsed<mouthUntil);}
function frame(now){const dt=lastFrame?Math.min((now-lastFrame)/1000,.1):0;lastFrame=now;if(!manual&&!document.hidden){let left=dt;while(left>1e-9){const stepTime=Math.min(1/60,left);step(stepTime);left-=stepTime;}hudTime+=dt;if(hudTime>=.08){render();hudTime=0;}scene.draw(run.speed,dt,run.phase==='playing',run.elapsed<mouthUntil);}raf=requestAnimationFrame(frame);}
window.__day046={state:()=>run.phase,snapshot:()=>({...run,pressed:pressed(),world:worldAt(run.speed).id,audio:audioState(run.speed),gamma:lorentzFactor(run.speed),catScreen:scene.catScreen(),render:scene.stats()}),setManual(value=true){manual=Boolean(value);sound.stop();lastFrame=0;},advance,start};
$('loading-screen').hidden=true;$('start-screen').hidden=false;render();scene.draw(0,0,false,false);raf=requestAnimationFrame(frame);
