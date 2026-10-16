import { CASES } from './lib/cases.js';
import { STATIONS } from './lib/network.js';
import { formatTime, investigate, readProgress, saveProgress, validateCase } from './lib/logic.js';
import { createSound } from './lib/sound.js';
import { STORIES, assessEvidence } from './lib/story.js';
import { createConversation } from './lib/conversation.js';
const $=(id)=>document.getElementById(id);
const esc=(s)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stationName=(id)=>STATIONS.find(s=>s.id===id).name;
const icons=(name)=>'<svg class="icon" aria-hidden="true"><use href="#ic-'+name+'"/></svg>';
let storage=null;
try{storage=window.localStorage;}catch{/* Private browsing may block storage. */}
const progress=readProgress(storage,CASES.map(c=>c.id)),sound=createSound();
sound.setEnabled(progress.sound);
let saveUnavailable=!storage;
if(saveUnavailable)$('storage-label').textContent='このブラウザには進み具合を保存できません。';
let caseIndex=0,personIndex=0,hintCount=0,time=0,playing=false,lastFrame=0,world=null,noticeTimeout;
let activeTab='testimony',mode='3d',trackedTrain=null,conversation=null;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const resultDialog=$('result-dialog'),dialogOpeners=new WeakMap();
function showDialog(dialog,opener){dialogOpeners.set(dialog,opener);dialog.showModal();}
function closeDialog(dialog,restoreFocus=true){
  const opener=dialogOpeners.get(dialog);dialog.close();dialogOpeners.delete(dialog);
  if(restoreFocus&&opener?.isConnected)opener.focus({preventScroll:true});
}
for(const c of CASES)validateCase(c,STATIONS);

function notice(message){
  clearTimeout(noticeTimeout);$('app-notice').textContent=message;$('app-notice').hidden=false;
  noticeTimeout=setTimeout(()=>$('app-notice').hidden=true,8000);
}
function persist(){
  if(!saveProgress(storage,progress)){
    saveUnavailable=true;$('storage-label').textContent='このブラウザには進み具合を保存できません。';
    notice('このブラウザには進み具合を保存できません。画面を閉じるまでは、そのまま遊べます。');
  }
}
function portrait(index){
  return '<span class="portrait cast-portrait cast-portrait-'+['shiori','toru','akari'][index]+'" aria-hidden="true"></span>';
}
function updateHeard(ids){
  $('heard-count').textContent='聴取 '+ids.length+' / 3';
  for(const button of $('person-list').children){
    const p=CASES[caseIndex].people[Number(button.dataset.person)],heard=ids.includes(p.id);
    button.dataset.heard=String(heard);
    button.querySelector('.person-heard').textContent=heard?'聴取済み':'話を聞く';
  }
}
function updateCaseNav(){
  $('progress-label').textContent='解決 '+progress.solved.length+' / '+CASES.length;
  $('case-nav').innerHTML=CASES.map((c,i)=>'<button type="button" data-case="'+i+'" aria-label="事件'+(i+1)+' '+esc(c.title)+(progress.solved.includes(c.id)?' 解決済み':'')+'" aria-pressed="'+(i===caseIndex)+'" class="'+(progress.solved.includes(c.id)?'is-solved':'')+'">CASE 0'+(i+1)+(progress.solved.includes(c.id)?' ✓':'')+'</button>').join('');
}
function setTime(value){
  const c=CASES[caseIndex];
  time=Math.max(c.start,Math.min(c.end,value));
  const formatted=formatTime(time);
  if($('clock').textContent!==formatted)$('clock').textContent=formatted;
  $('time-range').value=String(time);
  $('time-range').setAttribute('aria-valuetext',formatted.replace(':','時')+'分');
  world?.setTime(time);
}
function pause(){
  playing=false;
  $('play-button').setAttribute('aria-pressed','false');
  $('play-button').setAttribute('aria-label','列車の動きを再生');
  $('play-button').innerHTML=icons('play');
}
function play(){
  if(time>=CASES[caseIndex].end)setTime(CASES[caseIndex].start);
  playing=true;lastFrame=performance.now();
  $('play-button').setAttribute('aria-pressed','true');
  $('play-button').setAttribute('aria-label','列車の動きを一時停止');
  $('play-button').innerHTML=icons('pause');sound.play('play');
}
function setTab(tab,focus=false){
  activeTab=tab;
  for(const t of ['testimony','timetable']){
    const active=t===tab,button=$('tab-'+t);
    button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
    $('panel-'+t).hidden=!active;
  }
  if(focus)$('tab-'+tab).focus();
}
function selectPerson(index,{resetTime=true}={}){
  personIndex=index;
  const c=CASES[caseIndex],p=c.people[index];
  $('person-list').innerHTML=c.people.map((p,i)=>'<button type="button" class="person-button" data-person="'+i+'" aria-label="'+esc(p.name)+'の証言" aria-pressed="'+(i===index)+'">'+portrait(p.portrait)+'<span class="person-name">'+esc(p.name)+'</span><span class="person-role">'+esc(p.role)+'</span><span class="person-heard">話を聞く</span></button>').join('');
  $('file-person').textContent=p.name+' / '+p.role;
  updateHeard(conversation?.heardFor(c.id)||[]);
  conversation?.select(c,p);
  $('record-time').textContent=formatTime(p.record.time);$('record-station').textContent=stationName(p.record.station);
  $('claim-time').textContent=formatTime(p.claim.time);$('claim-station').textContent=stationName(p.claim.station);
  $('person-words').textContent='「'+p.words+'」';
  $('accuse-button').setAttribute('aria-label',p.name+'の証言を証拠で追及');
  $('answer-feedback').hidden=true;
  world?.setSelection(p.record.station,p.claim.station);
  if(resetTime){pause();setTime(p.record.time);}
}
function renderTrains(){
  $('train-list').innerHTML=CASES[caseIndex].trains.map(t=>
    '<article class="train-row" data-train="'+t.id+'" style="--train-color:'+t.color+'">'+
    '<div class="train-row-head"><span class="train-name"><span class="train-line"></span>'+esc(t.name)+'</span><button class="follow-button" type="button" data-follow="'+t.id+'" aria-label="'+esc(t.name)+'を追う" aria-pressed="false">追う</button></div>'+
    '<div class="train-stops">'+t.stops.map((s,i)=>'<div class="train-stop"><span class="train-stop-name">'+stationName(s.station)+'</span>'+
      (i===t.stops.length-1?'<span class="train-time"><i>着</i>'+formatTime(s.arrive)+'</span>':
        i===0?'<span class="train-time"><i>発</i>'+formatTime(s.depart)+'</span>':
        '<span class="train-time"><i>着</i>'+formatTime(s.arrive)+'</span><span class="train-time"><i>発</i>'+formatTime(s.depart)+'</span>')+'</div>').join('')+'</div>'+
      (t.express?'<p class="train-pass">汐見中央・霧山は通過（乗降できません）</p>':'')+'</article>'
  ).join('');
}
function loadCase(index){
  if(index<0||index>=CASES.length)return;
  pause();caseIndex=index;personIndex=0;hintCount=0;trackedTrain=null;
  const c=CASES[index];
  $('case-title').textContent=c.title;
  $('case-intro').textContent=c.intro;
  $('case-number').innerHTML='CASE 0'+(index+1)+'<span>第'+(index+1)+'夜 ・ '+c.theme+'</span>';
  $('difficulty').textContent=c.difficulty;
  $('case-subtitle').textContent=c.subtitle;
  $('hint-text').hidden=true;$('hint-count').textContent='0 / 3';
  $('hint-button').disabled=false;
  $('tracking-label').textContent='';
  $('time-range').min=c.start;$('time-range').max=c.end;
  $('start-time').textContent=formatTime(c.start);$('middle-time').textContent=formatTime((c.start+c.end)/2);$('end-time').textContent=formatTime(c.end);
  updateCaseNav();renderTrains();world?.setCase(c);setTab('testimony');
  selectPerson(0,{resetTime:false});setTime(c.start+12);
  document.body.dataset.case=c.id;
}
function showHint(){
  if(hintCount>=3)return;
  const c=CASES[caseIndex];
  let text=c.hints[hintCount];
  if(hintCount===2){
    const p=c.people.find(p=>investigate(c,p).contradiction),answer=investigate(c,p);
    text=p.name+'さんの確認記録から、'+stationName(p.claim.station)+'へ最も早く着けるのは'+formatTime(answer.arrival)+'。証言の時刻と比べよう。';
  }
  hintCount++;$('hint-count').textContent=hintCount+' / 3';
  $('hint-text').textContent=text;$('hint-text').hidden=false;
  $('hint-button').disabled=hintCount>=3;sound.play();
}
function accuse(){
  pause();conversation.finishTyping();
  const c=CASES[caseIndex],p=c.people[personIndex];
  $('proof-person').textContent=p.name;
  $('proof-response').textContent=STORIES[c.id].people[p.id].defense;
  $('proof-witness').dataset.mood='neutral';
  $('proof-portrait').style.setProperty('--character','url("./assets/'+p.id+'-expressions.webp")');
  $('proof-claim').textContent='確認記録：'+stationName(p.record.station)+' '+formatTime(p.record.time)+' → 証言：'+stationName(p.claim.station)+' '+formatTime(p.claim.time);
  $('proof-feedback').hidden=true;
  $('proof-list').innerHTML=STORIES[c.id].evidence.map((e,i)=>'<button type="button" class="proof-option" data-proof="'+e.id+'"><span class="proof-number">0'+(i+1)+'</span><span><strong>'+esc(e.title)+'</strong><small>'+esc(e.detail)+'</small></span><span aria-hidden="true">→</span></button>').join('');
  showDialog($('proof-dialog'),$('accuse-button'));
}
function presentEvidence(evidenceId){
  const c=CASES[caseIndex],p=c.people[personIndex],answer=assessEvidence(c,p,evidenceId);
  if(answer.status==='invalid')return;
  if(answer.status!=='contradiction'){
    sound.play('wrong');
    const box=$('proof-feedback'),supported=answer.status==='supported';
    box.innerHTML=supported?'<strong>この証言は、成り立ちます。</strong>'+esc(stationName(p.claim.station))+'へは'+formatTime(answer.arrival)+'に着けます。証言の時刻まで待つこともできます。ほかの人物の話も調べよう。':'<strong>その資料だけでは、反証できない。</strong>'+esc(STORIES[c.id].wrongEvidence[evidenceId]);
    box.hidden=false;
    $('proof-response').textContent=supported?STORIES[c.id].people[p.id].defense:STORIES[c.id].wrongEvidence[evidenceId];
    box.focus({preventScroll:true});
    $('answer-feedback').innerHTML=box.innerHTML;$('answer-feedback').hidden=false;
    return;
  }
  closeDialog($('proof-dialog'),false);
  $('answer-feedback').hidden=true;
  if(!progress.solved.includes(c.id)){progress.solved.push(c.id);persist();}
  updateCaseNav();sound.play('objection');
  conversation.reveal(c,p,answer,()=>showResult(c,p,answer));
}
function showResult(c,p,answer){
  pause();sound.play('success');
  $('result-person').textContent=p.name+'さんの、'+stationName(p.claim.station)+'にいたという証言。';
  $('result-claim').textContent=formatTime(p.claim.time);
  $('result-arrival').textContent=formatTime(answer.arrival);
  $('result-reason').textContent=(c.id==='two-minutes'?'別の列車への乗換えには2分が必要です。':c.id==='passing-station'?'急行は霧山を通過するため、普通列車で乗り継ぎます。':'中央から山手線に乗り継いで温泉へ向かいます。')+'最も早い到着でも'+answer.gap+'分遅れるため、この証言は成り立ちません。';
  $('result-journey').innerHTML=answer.legs.map(leg=>{
    const train=c.trains.find(t=>t.id===leg.train);
    return '<div class="journey-leg"><strong>'+esc(train.name)+'</strong>'+stationName(leg.from)+' '+formatTime(leg.depart)+'発 → '+stationName(leg.to)+' '+formatTime(leg.arrive)+'着</div>';
  }).join('');
  $('result-save-note').hidden=!saveUnavailable;
  const allSolved=progress.solved.length===CASES.length;
  $('ending-ticket').hidden=!allSolved;
  $('result-title').innerHTML=allSolved?'全3事件、<br>調査完了。':'時刻表が、<br>証言を覆した。';
  $('result-closing').textContent=allSolved?'青い切符は、霧山の待合室に戻っていた。3人の証言と時刻表が、切符に込められた思いをつないだ。栞と一緒に切符を回収し、開業日の物語とともに展示台へ返した。':STORIES[c.id].clue;
  $('next-case').innerHTML=(allSolved?'3つの事件を振り返る':caseIndex===CASES.length-1?'未解決の事件へ':'次の事件へ')+icons('arrow');
  showDialog(resultDialog,$('accuse-button'));
}
function updateSound(){
  $('sound-button').setAttribute('aria-pressed',String(progress.sound));
  $('sound-button').setAttribute('aria-label',progress.sound?'音をオフにする':'音をオンにする');
  $('sound-button').innerHTML=icons(progress.sound?'sound':'mute');
}
conversation=createConversation({
  motion:reducedMotion,sound,onHeard:updateHeard,
  onInvestigate:()=>{setTab('timetable');$('dossier').scrollIntoView({block:'start',behavior:reducedMotion.matches?'auto':'smooth'});$('tab-timetable').focus({preventScroll:true});},
  openLog:showDialog
});
$('proof-list').addEventListener('click',e=>{const button=e.target.closest('[data-proof]');if(button)presentEvidence(button.dataset.proof);});
$('proof-back').addEventListener('click',()=>{closeDialog($('proof-dialog'),false);setTab('timetable');$('tab-timetable').focus();});
$('case-nav').addEventListener('click',e=>{
  const button=e.target.closest('[data-case]');if(!button)return;
  const index=Number(button.dataset.case);loadCase(index);sound.play();
  $('case-nav').querySelector('[data-case="'+index+'"]').focus({preventScroll:true});
});
$('person-list').addEventListener('click',e=>{
  const button=e.target.closest('[data-person]');if(!button)return;
  const index=Number(button.dataset.person);selectPerson(index);sound.play();
  if(innerWidth<=1000)$('conversation').scrollIntoView({block:'start',behavior:reducedMotion.matches?'auto':'smooth'});
  $('person-list').querySelector('[data-person="'+index+'"]').focus({preventScroll:true});
});
for(const tab of ['testimony','timetable']){
  $('tab-'+tab).addEventListener('click',()=>setTab(tab));
  $('tab-'+tab).addEventListener('keydown',e=>{
    if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){
      e.preventDefault();setTab(e.key==='Home'?'testimony':e.key==='End'?'timetable':activeTab==='testimony'?'timetable':'testimony',true);
    }
  });
}
$('train-list').addEventListener('click',e=>{
  const button=e.target.closest('[data-follow]');if(!button)return;
  trackedTrain=button.dataset.follow;
  const train=CASES[caseIndex].trains.find(t=>t.id===trackedTrain);
  for(const row of $('train-list').children){
    const active=row.dataset.train===trackedTrain;
    row.classList.toggle('is-tracked',active);row.querySelector('button').setAttribute('aria-pressed',String(active));
  }
  world?.followTrain(trackedTrain);setTime(train.stops[0].depart);play();
  $('tracking-label').textContent=train.name+'を追跡';
  const bounds=$('world').getBoundingClientRect();
  if(innerWidth<=1000||bounds.top<0||bounds.bottom>innerHeight){
    $('world').closest('.world-wrap').scrollIntoView({block:'start',behavior:reducedMotion.matches?'auto':'smooth'});
  }
});
$('time-range').addEventListener('input',e=>{pause();setTime(Number(e.target.value));});
$('play-button').addEventListener('click',()=>playing?pause():play());
$('minute-back').addEventListener('click',()=>{pause();setTime(time-1);});
$('minute-forward').addEventListener('click',()=>{pause();setTime(time+1);});
$('accuse-button').addEventListener('click',accuse);
$('hint-button').addEventListener('click',showHint);
$('restart-button').addEventListener('click',()=>{conversation.reset(CASES[caseIndex].id);loadCase(caseIndex);notice('この事件の調査を、最初からやり直します。解決済みの記録は残ります。');});
$('next-case').addEventListener('click',()=>{
  closeDialog(resultDialog,false);
  const completed=progress.solved.length===CASES.length;
  const forward=CASES.findIndex((c,i)=>i>caseIndex&&!progress.solved.includes(c.id));
  const unresolved=CASES.findIndex(c=>!progress.solved.includes(c.id));
  loadCase(completed?0:forward>=0?forward:unresolved);
  if(completed)notice('全3事件の調査、おつかれさまでした。解決した事件は、いつでも調べ直せます。');
  $('dossier').focus({preventScroll:true});
});
$('sound-button').addEventListener('click',()=>{
  progress.sound=!progress.sound;sound.setEnabled(progress.sound);updateSound();persist();sound.play();
});
for(const name of ['help','share'])$(''+name+'-button').addEventListener('click',()=>{pause();conversation.finishTyping();showDialog($(name+'-dialog'),$(name+'-button'));});
for(const dialog of document.querySelectorAll('dialog')){
  dialog.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>closeDialog(dialog)));
  dialog.addEventListener('cancel',e=>{e.preventDefault();closeDialog(dialog);});
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog(dialog);}});
}
function updateViewControls(next){
  mode=next;$('view-3d').setAttribute('aria-pressed',String(mode==='3d'));$('view-2d').setAttribute('aria-pressed',String(mode==='2d'));
  $('view-3d').disabled=$('world').dataset.renderer!=='webgl'||$('world').dataset.contextLost==='true';
  for(const id of ['zoom-in','zoom-out','reset-view'])$(id).disabled=mode==='2d';
}
for(const next of ['3d','2d'])$('view-'+next).addEventListener('click',()=>updateViewControls(world?.setView(next)||'2d'));
$('reset-view').addEventListener('click',()=>world?.resetView());
$('zoom-in').addEventListener('click',()=>world?.zoomBy(1.15));
$('zoom-out').addEventListener('click',()=>world?.zoomBy(1/1.15));
document.addEventListener('keydown',e=>{
  if(document.querySelector('dialog[open]')||e.ctrlKey||e.metaKey||e.altKey||e.target.matches('input,textarea,select'))return;
  if(e.key.toLowerCase()==='h'){e.preventDefault();showHint();}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
reducedMotion.addEventListener('change',()=>{if(reducedMotion.matches)pause();});
function frame(now){
  const delta=Math.min((now-lastFrame)/1000,.1);lastFrame=now;
  if(playing&&!document.hidden){
    setTime(time+delta*1.5);
    if(time>=CASES[caseIndex].end)pause();
  }
  requestAnimationFrame(frame);
}
updateSound();
const requested=new URL(location.href).searchParams.get('case');
const requestedIndex=CASES.findIndex(c=>c.id===requested);
const firstUnsolved=CASES.findIndex(c=>!progress.solved.includes(c.id));
loadCase(requestedIndex>=0?requestedIndex:firstUnsolved>=0?firstUnsolved:0);
requestAnimationFrame(frame);
try{
  const {createWorld}=await import('./lib/world.js');
  world=createWorld($('world'),{
    onStation:s=>{$('station-caption').textContent=s.name+'駅 / '+s.en;sound.play();},
    onNotice:notice,onViewChange:updateViewControls
  });
  world.setCase(CASES[caseIndex]);world.setTime(time);
  const p=CASES[caseIndex].people[personIndex];world.setSelection(p.record.station,p.claim.station);
  mode=world.setView('3d');
  updateViewControls(mode);$('world-loading').hidden=true;
}catch(error){
  $('world-loading').textContent='路線表示を読み込めませんでした。再読み込みしてください。証言と時刻表の捜査はそのまま遊べます。';
  $('world').dataset.ready='error';
}
