import {createContinuation} from './lib/continuation-ui.js';
import {CHARACTERS,EVIDENCE,EPISODE_CASE,PROOF_REASONS,OPENING,openingReply,MESSAGE_LINES,witnessLines,questionLines,CONFRONTATION,trustLines,reunionLines,endingLines,L} from './lib/episode-data.js';
import {newEpisode,advanceEpisode,judgeProof,loadEpisode,saveEpisode,objectiveFor,storyTime,PHASES} from './lib/episode-state.js';
import {formatTime} from './lib/logic.js';
import {STATIONS} from './lib/network.js';
import {createSound} from './lib/sound.js';

const $=id=>document.getElementById(id);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let continuation=null;
let storage;try{storage=window.localStorage;}catch{}
const loaded=loadEpisode(storage);
let state=loaded.state,storageAvailable=loaded.available,activeDialogue=false,typingTimer=0,lineDone=null,lastActor=null,toastTimer=0,bannerTimer=0;
let selected=[],world=null,worldLoading=null,mapPlaying=false,mapTime=1394,mapFrame=0,mapLast=0;
const sound=createSound(),reduced=matchMedia('(prefers-reduced-motion: reduce)');
const freePhases=['investigate','unlocked','platform'];
const canInvestigate=()=>['investigate','unlocked'].includes(state.phase);
const stationName=id=>STATIONS.find(s=>s.id===id)?.name||id;
function persist(){storageAvailable=saveEpisode(storage,state);$('storage-label').textContent=storageAvailable?'会話を読んでいる間に、物語の時間は進みません。':'このブラウザには保存できません。画面を開いている間は遊べます。';}
function dispatch(event){const next=advanceEpisode(state,event);if(next===state)return false;state=next;persist();if(event.type!=='log')renderChrome();return true;}
function toast(text){clearTimeout(toastTimer);$('episode-toast').textContent=text;$('episode-toast').hidden=false;toastTimer=setTimeout(()=>$('episode-toast').hidden=true,4400);}
function banner(text){clearTimeout(bannerTimer);const e=$('discovery-banner');e.textContent=text;e.hidden=true;void e.offsetWidth;e.hidden=false;bannerTimer=setTimeout(()=>e.hidden=true,2200);}
function actor(id,mood='neutral',idle=false){
 const person=CHARACTERS[id];const node=$('episode-actor');
 if(!person?.image){node.hidden=true;return;}
 lastActor=id;node.hidden=false;node.classList.toggle('npc-idle',idle);node.style.setProperty('--character','url("'+person.image+'")');$('episode-stage').dataset.mood=mood;
}
function renderChrome(){
 $('objective').textContent=objectiveFor(state);$('story-clock').textContent=storyTime(state);
 const rank=PHASES.indexOf(state.phase),step=rank===0?0:rank<3?1:rank<7?2:rank<=8?3:4;
 document.querySelectorAll('.chapter-steps li').forEach((e,i)=>{e.classList.toggle('current',i===step);e.classList.toggle('done',i<step);if(i===step)e.setAttribute('aria-current','step');else e.removeAttribute('aria-current');});
 $('relationship').textContent=rank>=5?'栞は、あなたに鍵を託した。':rank>=3?'栞は、何かを隠している。':'朝倉 透 / あなたの旅の相棒';
 $('evidence-count').textContent=String(state.evidence.length).padStart(2,'0');
 $('evidence-list').innerHTML=state.evidence.length?state.evidence.map((id,i)=>'<button id="evidence-'+id+'" class="evidence-card" type="button" data-evidence="'+id+'"><span class="evidence-index">'+String(i+1).padStart(2,'0')+'</span><span><strong>'+escape(EVIDENCE[id].title)+'</strong><small>'+escape(EVIDENCE[id].kind)+'</small></span></button>').join(''):'<p class="evidence-empty">透との約束が、最初の手がかりになる。</p>';
 $('present-button').hidden=state.phase!=='investigate';$('present-button').disabled=activeDialogue;
 $('witness-button').hidden=!canInvestigate();$('witness-button').disabled=activeDialogue;
 $('rail-button').hidden=rank<3;$('rail-button').disabled=activeDialogue;
 $('hint-button').disabled=activeDialogue;
 $('sound-button').setAttribute('aria-pressed',String(state.sound));$('sound-button').setAttribute('aria-label',state.sound?'音をオフにする':'音をオンにする');$('sound-button').querySelector('use').setAttribute('href',state.sound?'#ic-sound':'#ic-mute');
 sound.setEnabled(state.sound);
 if(!continuation?.isActive()){
 const platform=rank>=6;
 const src='./assets/episode/'+(platform?'platform-night':'concourse-night')+'.webp';
 if($('scene-background').getAttribute('src')!==src)$('scene-background').src=src;
 $('scene-background').alt=platform?'雨の閉鎖ホーム。ベンチに青い半券があり、奥の階段に灯りがともる。':'雨の霧山駅。ベンチにカメラが残り、奥のホームの扉は閉まっている。';
 $('scene-location').textContent=platform?'霧山駅・閉鎖ホーム':'霧山駅・待合室';
 $('scene-location-en').textContent=platform?'04 / CLOSED PLATFORM':'04 / KIRIYAMA STATION';
 }
 continuation?.render();
 if(!activeDialogue)renderHotspots();
}
function hotspotData(){
 if(continuation?.isActive())return continuation.hotspots();
 if(canInvestigate())return [
  {id:'camera',text:'ベンチのカメラ',x:27,y:69,visit:'camera'},
  {id:'board',text:'発車案内',x:18,y:24,visit:'board'},
  {id:'shiori',text:'栞に話す',x:85,y:85},
  {id:'door',text:state.phase==='unlocked'?'鍵で扉を開ける':'奥の閉じた扉',x:67,y:26,visit:'door',unlocked:state.phase==='unlocked'}
 ];
 if(state.phase==='platform')return [{id:'ticket',text:'ベンチの青い半券',x:36,y:65,visit:'ticket'},{id:'staircase',text:'階段の灯りへ',x:74,y:66}];
 return [];
}
function renderHotspots(){
 const show=!activeDialogue&&(freePhases.includes(state.phase)||continuation?.isFree());
 for(const mobile of [false,true]){
  const host=$(mobile?'mobile-hotspots':'scene-hotspots');host.hidden=!show;
  host.innerHTML=show?hotspotData().map(h=>'<button id="hotspot-'+h.id+(mobile?'-mobile':'')+'" type="button" class="scene-hotspot'+(h.visit&&state.visited.includes(h.visit)?' is-visited':'')+(h.unlocked?' is-unlocked':'')+'" data-hotspot="'+h.id+'" style="left:'+h.x+'%;top:'+h.y+'%">'+h.text+'</button>').join(''):'';
 }
}
function scrollNow(node,block='nearest'){
 const style=document.documentElement.style,old=style.scrollBehavior;style.scrollBehavior='auto';node.scrollIntoView({block,behavior:'auto'});style.scrollBehavior=old;
}
function focusControl(node){
 if(!node)return;node.focus({preventScroll:true});const r=node.getBoundingClientRect();if(r.top<0||r.bottom>innerHeight)scrollNow(node);
}
function revealStory(){const r=$('episode-dialogue').getBoundingClientRect();if(r.top<0||r.bottom>innerHeight)scrollNow($('episode-stage'),'start');}
function clearDialogue(){clearInterval(typingTimer);typingTimer=0;lineDone=null;$('episode-stage').dataset.speaking='false';}
function playLines(lines,onDone,key='scene'){
 clearDialogue();activeDialogue=true;$('episode-dialogue').hidden=false;$('scene-caption').hidden=true;$('ending-card').hidden=true;$('episode-choices').hidden=true;$('episode-next').hidden=false;
 renderChrome();renderHotspots();
 let index=0,full='',complete=false;
 const finish=()=>{clearInterval(typingTimer);typingTimer=0;$('episode-text').textContent=full;complete=true;$('episode-stage').dataset.speaking='false';$('episode-next').firstChild.textContent=index===lines.length-1?'続ける ':'次へ ';};
 const display=()=>{
  clearInterval(typingTimer);
  const line=lines[index],person=CHARACTERS[line.speaker]||CHARACTERS.narrator;full=line.text;complete=false;
  $('episode-speaker').textContent=person.name;$('episode-role').textContent=key==='message'&&line.speaker==='toru'?'携帯に残った伝言 / 23:12':person.role;$('episode-dialogue-count').textContent=String(index+1).padStart(2,'0')+' / '+String(lines.length).padStart(2,'0');
  $('scene-inset').hidden=!(key==='witness'&&index>=3);
  if(person.image)actor(line.speaker,line.mood);
  else if(line.speaker==='narrator'){actor(null);lastActor=null;}
  else if(lastActor)actor(lastActor,'neutral');
  dispatch({type:'log',line:{id:key+':'+index,name:person.name,text:full}});
  $('episode-announcement').textContent=person.name+'。'+full;
  $('episode-text').textContent='';$('episode-next').firstChild.textContent='全文を表示 ';
  if(reduced.matches)finish();
  else{let n=0;$('episode-stage').dataset.speaking=String(!!person.image);sound.play('talk-'+line.speaker);typingTimer=setInterval(()=>{n+=2;$('episode-text').textContent=full.slice(0,n);if(n>=full.length)finish();},26);}
 };
 lineDone=()=>{if(!complete){finish();return;}if(index<lines.length-1){index++;display();}else{clearDialogue();onDone?.();}};
 display();$('episode-next').focus({preventScroll:true});revealStory();
}
function choices(prompt,items,onChoose){
 clearDialogue();activeDialogue=true;$('episode-dialogue').hidden=false;$('episode-text').textContent=prompt;$('episode-announcement').textContent=prompt;$('episode-dialogue-count').textContent='あなたの言葉';$('episode-next').hidden=true;
 const host=$('episode-choices');host.hidden=false;host.replaceChildren();
 for(const item of items){const b=document.createElement('button');b.type='button';b.textContent=item.text;b.dataset.choice=item.id;b.addEventListener('click',()=>{host.hidden=true;onChoose(item.id);});host.append(b);}
 host.querySelector('button')?.focus({preventScroll:true});revealStory();
}
function freeScene(focus=false){
 clearDialogue();$('scene-inset').hidden=true;activeDialogue=false;$('episode-dialogue').hidden=true;$('scene-caption').hidden=false;$('ending-card').hidden=state.phase!=='ending';
 if(continuation?.freeScene(focus))return;
 $('open-message').hidden=state.phase!=='incoming';
 $('scene-description').textContent=state.phase==='incoming'?'雨音の向こうで、携帯が震えた。':state.phase==='investigate'?'ベンチに、見覚えのあるカメラ。栞の言葉を、駅に残った記録で確かめよう。':state.phase==='unlocked'?'栞が、扉の前から一歩どいた。受け取った鍵が、手の中で温かい。':state.phase==='platform'?'閉鎖ホームに、人の気配が残っている。奥の階段から、小さな音がした。':'約束の最終列車まで、あと26分。相棒と、新しい謎が残った。';
 renderChrome();
 if(canInvestigate())actor('shiori',state.phase==='unlocked'?'relieved':'neutral',true);
 else if(state.phase==='ending')actor('toru','relieved');else actor(null);
 if(focus){const target=state.phase==='incoming'?$('open-message'):state.phase==='ending'?$('continue-story'):[...document.querySelectorAll('[data-hotspot]')].find(e=>e.getClientRects().length);focusControl(target);}
}
function opening(){
 playLines(OPENING,()=>choices('透に、どう返す？',[{id:'promise',text:'約束。最後の一枚は、一緒に。'},{id:'tease',text:'今度こそ、遅れないでよ。'}],id=>{
  dispatch({type:'opening-choice',value:id});playLines(openingReply(id),()=>{dispatch({type:'begin'});sound.play();banner('手がかり：半分の青い切符');freeScene(true);},'opening-reply-'+id);
 }),'opening');
}
function message(){playLines(MESSAGE_LINES,()=>{dispatch({type:'read-message'});witness();},'message');}
function witness(){playLines(witnessLines(state.evidence.includes('photo')),()=>{dispatch({type:'heard-witness'});banner('栞の証言と、港の映像を記録');freeScene(true);},'witness');}
function trust(){
 playLines(CONFRONTATION,()=>choices('追ってきた人ではないと、どう伝える？',[{id:'ticket',text:'透と分けた、半分の切符を見せる'},{id:'concern',text:'ただ、無事か知りたいと伝える'}],id=>{
  dispatch({type:'trust-choice',value:id});playLines(trustLines(id,state.openingChoice),()=>{dispatch({type:'receive-key'});sound.play('success');banner('閉鎖ホームの鍵を受け取った');freeScene(true);},'trust-'+id);
 }),'confrontation');
}
function reunion(){
 playLines(reunionLines(state.evidence.includes('fragment')),()=>choices('やっと見つけた透に、何を言う？',[{id:'warm',text:'無事でよかった。まず、そう伝える'},{id:'urgent',text:'港の映像の人物について聞く'}],id=>{
  dispatch({type:'reunion-choice',value:id});playLines(endingLines(id),()=>{dispatch({type:'finish'});sound.play('success');freeScene(true);},'ending-'+id);
 }),'reunion');
}
function resume(){
 clearDialogue();lastActor=null;
 if(state.phase==='prologue')opening();
 else if(state.phase==='incoming')freeScene();
 else if(state.phase==='witness')witness();
 else if(state.phase==='trust')trust();
 else if(state.phase==='reunion')reunion();
 else if(!continuation?.resume())freeScene();
}
// Native dialogs return focus to the replacement of their original control after state renders.
const openers=new WeakMap();
function showDialog(dialog,source=document.activeElement){
 pauseMap();openers.set(dialog,{id:source?.id,node:source});dialog.showModal();
 const close=dialog.querySelector('[data-close]');close?.focus({preventScroll:true});
}
function closeDialog(dialog,restore=true){if(!dialog.open)return;dialog.dataset.restoreFocus=String(restore);dialog.close();}
for(const dialog of document.querySelectorAll('dialog')){
 dialog.addEventListener('keydown',event=>{
  if(event.key!=='Tab'||event.altKey||event.ctrlKey||event.metaKey)return;
  const candidates=[...dialog.querySelectorAll('button,a[href],input,select,textarea,[tabindex]')].filter(e=>!e.disabled&&e.tabIndex>=0&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');
  const items=candidates.filter(e=>e.tagName!=='INPUT'||e.type!=='radio'||!e.name||e===(candidates.find(r=>r.tagName==='INPUT'&&r.type==='radio'&&r.name===e.name&&r.checked)||candidates.find(r=>r.tagName==='INPUT'&&r.type==='radio'&&r.name===e.name)));
  if(!items.length)return;
  const current=document.activeElement,index=items.indexOf(current);
  let target;
  if(index>=0)target=items[(index+(event.shiftKey?-1:1)+items.length)%items.length];
  else target=(event.shiftKey?[...items].reverse().find(e=>current.compareDocumentPosition(e)&Node.DOCUMENT_POSITION_PRECEDING):items.find(e=>current.compareDocumentPosition(e)&Node.DOCUMENT_POSITION_FOLLOWING))||items[event.shiftKey?items.length-1:0];
  event.preventDefault();target.focus();
 });
 dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog(dialog);});
 dialog.addEventListener('close',()=>{
  if(dialog.id==='rail-dialog')pauseMap();
  if(dialog.dataset.restoreFocus==='false'){delete dialog.dataset.restoreFocus;return;}
  const opener=openers.get(dialog);const target=(opener?.id&&$(opener.id))||opener?.node;
  if(target?.isConnected&&!target.disabled&&target.getClientRects().length)target.focus({preventScroll:true});
 });
 dialog.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>closeDialog(dialog)));
}
function evidence(id,source){
 if(!state.evidence.includes(id))return;
 const info=EVIDENCE[id];$('evidence-kind').textContent=info.kind;$('evidence-title').textContent=info.title;
 let visual='';
 if(id==='photo')visual='<div class="evidence-visual photo-record"><img src="./assets/episode/concourse-night.webp" alt="霧山駅の駅名標と、透が写っているカメラの記録"><div class="photo-station-name">04 霧山</div><div class="photo-toru" aria-hidden="true"></div><div class="photo-envelope"><small>ORIGINAL FILM</small><span>三好 灯</span></div><span class="evidence-stamp">CAMERA / 保存時刻 23:14</span></div><p class="evidence-note">見るべきもの：カメラの保存時刻と、駅名標。壁の時計は故障中です。</p>';
 if(id==='footage')visual='<div class="evidence-visual"><img src="./assets/episode/harbor-footage.webp" alt="青い傘で顔が隠れた人物が、灯台港の急行へ歩いている"><span class="footage-grid"></span><span class="evidence-stamp">灯台港 / 23:14 / 記録映像</span></div>';
 if(['ticket','fragment'].includes(id))visual='<div class="episode-ticket"><small>SHIOMI RAILWAY / A PROMISE</small><strong>帰りは、一緒に。</strong><p>23:47　灯台港 発</p><p>'+ (id==='ticket'?'あなたが持っている、左半分。':'透が持っていた、右半分。裂け目が合う。')+'</p><span class="ticket-cut"></span></div>';
 const extra=continuation?.evidenceVisual(id);if(extra)visual=extra;
 $('evidence-body').innerHTML=visual+'<p class="evidence-detail">'+escape(info.summary)+'</p><p class="evidence-detail">'+escape(info.detail)+'</p>';
 showDialog($('evidence-dialog'),source);
}
function talkToShiori(){
 if(activeDialogue||!canInvestigate())return;
 if(state.phase==='unlocked'){playLines(questionLines('',true),()=>freeScene(true),'shiori-ally');return;}
 playLines([L('shiori','……まだ、気になることが？')],()=>choices('栞に聞くことを選ぶ。',[{id:'about-toru',text:'透を、前から知っている？'},{id:'why-locked',text:'奥のホームは、なぜ閉まっている？'}],id=>{
  dispatch({type:'ask',value:id});playLines(questionLines(id),()=>freeScene(true),'question-'+id);
 }),'shiori-question');
}
function hotspot(id,source){
 if(activeDialogue)return;
 if(continuation?.hotspot(id,source))return;
 if(id==='camera'&&canInvestigate()){const isNew=!state.evidence.includes('photo');dispatch({type:'inspect-camera'});if(isNew){sound.play();banner('23:14、透は霧山にいた。');}evidence('photo',source);}
 else if(id==='board'&&canInvestigate()){dispatch({type:'inspect-board'});openRail(source);}
 else if(id==='shiori')talkToShiori();
 else if(id==='door'&&canInvestigate()){
  if(state.phase==='unlocked'){dispatch({type:'enter-platform'});sound.play();banner('閉鎖ホームの扉が開いた');freeScene(true);}
  else{dispatch({type:'inspect-door'});playLines([L('narrator','扉には鍵がかかっている。そばには「夜間閉鎖」の小さな札。'),L('shiori','鍵は、私が持っています。今は……開けられません。')],()=>freeScene(true),'locked-door');}
 }
 else if(id==='ticket'&&state.phase==='platform'){dispatch({type:'inspect-ticket'});sound.play();evidence('fragment',source);}
 else if(id==='staircase'&&state.phase==='platform'){dispatch({type:'find-toru'});reunion();}
}
for(const id of ['scene-hotspots','mobile-hotspots'])$(id).addEventListener('click',event=>{const b=event.target.closest('[data-hotspot]');if(b)hotspot(b.dataset.hotspot,b);});
$('evidence-list').addEventListener('click',event=>{const b=event.target.closest('[data-evidence]');if(b)evidence(b.dataset.evidence,b);});
function openProof(source=document.activeElement){
 if(!['investigate','harbor'].includes(state.phase)||activeDialogue)return;selected=[];
 const info=state.phase==='harbor'?continuation.proofInfo():{title:'栞の証言に、矛盾がある。',person:'水瀬 栞',claim:'「透さんは23:15の急行で温泉へ。もう、ここにはいません」',reasons:PROOF_REASONS};
 $('proof-title').textContent=info.title;document.querySelector('#proof-dialog .proof-testimony').innerHTML='<strong>'+escape(info.person)+'</strong>'+escape(info.claim);
 $('proof-submit').firstChild.textContent='この証拠で、'+(state.phase==='harbor'?'高瀬':'栞')+'に聞く ';
 $('proof-selection').innerHTML=state.evidence.map(id=>'<button type="button" class="proof-evidence" data-proof="'+id+'" aria-pressed="false"><span><strong>'+escape(EVIDENCE[id].title)+'</strong><small>'+escape(EVIDENCE[id].summary)+'</small></span></button>').join('');
 $('proof-reasons').innerHTML='<legend>この証言が成り立たない理由は？</legend>'+info.reasons.map(r=>'<label class="proof-reason"><input type="radio" name="proof-reason" value="'+r.id+'"><span>'+escape(r.text)+'</span></label>').join('');
 $('proof-selection-count').textContent='選択 0 / 2';$('proof-feedback').hidden=true;showDialog($('proof-dialog'),source);
}
$('proof-selection').addEventListener('click',event=>{
 const b=event.target.closest('[data-proof]');if(!b)return;const id=b.dataset.proof;
 if(selected.includes(id))selected=selected.filter(x=>x!==id);else if(selected.length<2)selected.push(id);else{proofFeedback('手がかりは二つ。選び直すときは、一つ外してください。');return;}
 for(const e of $('proof-selection').querySelectorAll('[data-proof]'))e.setAttribute('aria-pressed',String(selected.includes(e.dataset.proof)));
 $('proof-selection-count').textContent='選択 '+selected.length+' / 2';$('proof-feedback').hidden=true;
});
function proofFeedback(text){$('proof-feedback').textContent=text;$('proof-feedback').hidden=false;$('proof-feedback').focus({preventScroll:false});}
$('proof-submit').addEventListener('click',()=>{
 const reason=$('proof-reasons').querySelector('input:checked')?.value;
 if(continuation?.handleProof(selected,reason))return;
 const answer=judgeProof(state.evidence,selected,reason);
 if(answer.status==='contradiction'){
  closeDialog($('proof-dialog'),false);dispatch({type:'present',selected,reason});sound.play('objection');banner('その急行には、乗れない。');trust();return;
 }
 sound.play('wrong');
 const messages={'choose-two':'示す手がかりを二つ選んでください。','not-owned':'まずは駅で、実際の記録を調べよう。',unrelated:'栞「それは、透さんの行き先が違うという証拠ですか？」 透がどこにいたかを示す記録と、急行の停車駅を結び付けよう。','choose-reason':'記録を結び付ける理由を、一つ選んでください。','wrong-reason':'栞「23:47は最終列車。急行は23:15です」 霧山から温泉へは普通列車で直行できます。急行に乗れたかどうかを、停車駅で確かめよう。'};
 proofFeedback(messages[answer.status]||'もう一度、時刻表を確かめよう。');
});
function renderTrains(){
 $('episode-trains').innerHTML=EPISODE_CASE.trains.map(t=>'<article class="episode-train'+(t.express?' is-express':'')+'" style="--train-color:'+t.color+'"><div class="episode-train-head"><strong>'+escape(t.name)+'</strong><div class="episode-train-actions">'+(t.express?'<button id="record-express" type="button">'+(state.evidence.includes('express')?'記録済み':'停車駅を手がかりに記録')+'</button>':'')+'<button type="button" data-follow="'+t.id+'">路線で追う</button></div></div><div class="train-stops">'+t.stops.map((s,i)=>'<div class="train-stop"><span class="train-stop-name">'+escape(stationName(s.station))+'</span><span class="train-time">'+formatTime(i===t.stops.length-1?s.arrive:s.depart)+'<i> '+(i===t.stops.length-1?'着':'発')+'</i></span></div>').join('')+'</div>'+(t.express?'<p class="express-note">この急行は、灯台港と星見温泉にだけ停車します。霧山は通過。</p>':'')+'</article>').join('');
 const b=$('record-express');if(b){b.disabled=state.evidence.includes('express')||!canInvestigate();b.addEventListener('click',()=>{if(dispatch({type:'record-express'})){renderTrains();toast('急行の停車駅を記録した。カメラの写真と結び付けてみよう。');sound.play();}});}
}
function openRail(source=document.activeElement){
 if(PHASES.indexOf(state.phase)<3||activeDialogue)return;
 if(canInvestigate())dispatch({type:'inspect-board'});
 renderTrains();$('rail-table-panel').hidden=false;$('rail-map-panel').hidden=true;
 $('rail-table-tab').setAttribute('aria-pressed','true');$('rail-map-tab').setAttribute('aria-pressed','false');showDialog($('rail-dialog'),source);
}
async function mapTab(){
 $('rail-table-panel').hidden=true;$('rail-map-panel').hidden=false;$('rail-table-tab').setAttribute('aria-pressed','false');$('rail-map-tab').setAttribute('aria-pressed','true');
 if(!world){
  worldLoading??=import('./lib/world.js').then(({createWorld})=>{
   world=createWorld($('world'),{onStation:s=>{$('station-caption').textContent=s.name+' / '+(s.id==='ridge'?'写真の記録：23:14':s.id==='onsen'?'栞の証言：23:36':'駅の位置を確認');},onNotice:toast,onViewChange:mode=>{for(const v of ['3d','2d'])$('view-'+v).setAttribute('aria-pressed',String(mode===v));}});
   world.setCase(EPISODE_CASE);world.setSelection('ridge','onsen');world.setTime(mapTime);
   return world;
  }).catch(()=>{toast('地図を読み込めませんでした。時刻表はそのまま調べられます。');worldLoading=null;});
  await worldLoading;
 }
 return world;
}
$('episode-trains').addEventListener('click',async event=>{const b=event.target.closest('[data-follow]');if(!b)return;const t=EPISODE_CASE.trains.find(t=>t.id===b.dataset.follow);await mapTab();if(!$('rail-dialog').open||$('rail-map-panel').hidden)return;setMapTime(t.stops[0].depart);world?.followTrain(t.id);startMap();});
function setMapTime(value){mapTime=Math.min(1439,Math.max(1380,Number(value)));$('clock').textContent=formatTime(mapTime);$('time-range').value=mapTime;$('time-range').setAttribute('aria-valuetext',formatTime(mapTime));world?.setTime(mapTime);}
function pauseMap(){mapPlaying=false;cancelAnimationFrame(mapFrame);$('play-button').setAttribute('aria-pressed','false');$('play-button').setAttribute('aria-label','列車の動きを再生');$('play-button').querySelector('use').setAttribute('href','#ic-play');}
function startMap(){if(reduced.matches){toast('動きを抑える設定です。時刻のつまみで列車を確かめられます。');return;}pauseMap();mapPlaying=true;mapLast=performance.now();$('play-button').setAttribute('aria-pressed','true');$('play-button').setAttribute('aria-label','列車の動きを止める');$('play-button').querySelector('use').setAttribute('href','#ic-pause');mapFrame=requestAnimationFrame(tick);}
function tick(now){if(!mapPlaying)return;const dt=Math.min(.1,(now-mapLast)/1000);mapLast=now;setMapTime(mapTime+dt*1.4);if(mapTime>=1439)pauseMap();else mapFrame=requestAnimationFrame(tick);}
$('rail-table-tab').addEventListener('click',()=>{pauseMap();$('rail-table-panel').hidden=false;$('rail-map-panel').hidden=true;$('rail-table-tab').setAttribute('aria-pressed','true');$('rail-map-tab').setAttribute('aria-pressed','false');});
$('rail-map-tab').addEventListener('click',mapTab);
for(const v of ['3d','2d'])$('view-'+v).addEventListener('click',()=>world?.setView(v));
$('time-range').addEventListener('input',event=>{pauseMap();setMapTime(event.target.value);});
$('play-button').addEventListener('click',()=>mapPlaying?pauseMap():startMap());
document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseMap();});
function openLog(source=document.activeElement){const host=$('episode-log-list');host.innerHTML=state.log.length?state.log.map(l=>'<li><strong>'+escape(l.name)+'</strong><p>'+escape(l.text)+'</p></li>').join(''):'<li>会話を進めると、ここに言葉が残ります。</li>';showDialog($('log-dialog'),source);}
function hint(){toast(objectiveFor(state));}
$('episode-next').addEventListener('click',()=>lineDone?.());
$('open-message').addEventListener('click',message);
$('present-button').addEventListener('click',event=>openProof(event.currentTarget));
$('witness-button').addEventListener('click',talkToShiori);
$('rail-button').addEventListener('click',event=>openRail(event.currentTarget));
for(const id of ['notebook-button','episode-log','ending-notebook'])$(id).addEventListener('click',event=>openLog(event.currentTarget));
for(const id of ['restart-button','ending-replay'])$(id).addEventListener('click',event=>showDialog($('restart-dialog'),event.currentTarget));
$('restart-confirm').addEventListener('click',()=>{closeDialog($('restart-dialog'),false);pauseMap();clearDialogue();state=newEpisode(state.sound);persist();resume();});
$('hint-button').addEventListener('click',hint);
$('help-button').addEventListener('click',event=>showDialog($('help-dialog'),event.currentTarget));
$('share-button').addEventListener('click',event=>showDialog($('share-dialog'),event.currentTarget));
$('sound-button').addEventListener('click',()=>{dispatch({type:'set-sound',value:!state.sound});if(state.sound)sound.play('play');});
document.addEventListener('keydown',event=>{if(event.key.toLowerCase()==='h'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!document.querySelector('dialog[open]')&&!activeDialogue&&!/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)){event.preventDefault();hint();}});
continuation=createContinuation({state:()=>state,isDialogue:()=>activeDialogue,actor,renderChrome,dispatch,playLines,choices,freeScene,showDialog,closeDialog,evidence,toast,banner,sound,openRail,proofFeedback,openLog,focusControl});
setMapTime(mapTime);renderChrome();persist();resume();document.body.dataset.ready='true';
