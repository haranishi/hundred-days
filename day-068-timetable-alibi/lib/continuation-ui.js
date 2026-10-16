import {REQUEST_LINES,PHOTO_QUESTION,photoReply,CROSSROADS_LINES,routeIntro,rideLines,harborIntro,akariLines,EDITOR_LINES,confessionLines,cameraLines,epilogueLines,FINAL_REASONS} from './continuation-data.js';
import {NEXT_PHASES,NEXT_FREE_PHASES,judgeBoarding,judgeFinalProof,planningPoint} from './continuation-state.js';
import {EPISODE_CASE} from './episode-data.js';
import {formatTime} from './logic.js';
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const station=id=>({ridge:'霧山',central:'汐見中央',harbor:'灯台港',onsen:'星見温泉'}[id]||id);
const inNext=s=>NEXT_PHASES.includes(s.phase);
export function createContinuation(api){
 const state=()=>api.state();
 let chosenTrain=null;
 const setScene=(file,name,en,alt)=>{
  const img=$('scene-background'),src='./assets/'+file;
  if(img.getAttribute('src')!==src)img.src=src;
  img.alt=alt;$('scene-location').textContent=name;$('scene-location-en').textContent=en;
 };
 function secondary(id,visible){const e=$('episode-secondary');e.hidden=!visible;if(id)e.style.setProperty('--character','url("./assets/'+(id==='akari'?'akari-expressions.webp':'complete/takase-expressions.webp')+'")');}
 function render(){
  const s=state(),next=inNext(s);document.body.dataset.storyPhase=s.phase;
  $('continuation-panel').hidden=api.isDialogue()||!['travel','central'].includes(s.phase);$('camera-controls').hidden=api.isDialogue()||s.phase!=='camera';$('story-complete').hidden=api.isDialogue()||s.phase!=='complete';
  $('viewfinder').hidden=true;$('ticket-composition').hidden=true;secondary(null,false);
  $('episode-actor').classList.remove('harbor-cast-left');
  $('continue-story').hidden=s.phase!=='ending';
  $('episode-stage').dataset.photoFrame='';
  $('present-button').firstChild.textContent='栞に証拠を示す ';
  if(!next){$('chapter-label').innerHTML='第1幕 <span>「映像の嘘」</span>';return;}
  $('chapter-label').innerHTML=s.phase==='request'||s.phase==='crossroads'?'第2幕 <span>「消したい一枚」</span>':'最終幕 <span>「名前を取り戻す夜」</span>';
  $('present-button').hidden=s.phase!=='harbor';$('present-button').disabled=api.isDialogue();
  $('present-button').firstChild.textContent='高瀬に証拠を示す ';
  $('rail-button').hidden=false;$('rail-button').disabled=api.isDialogue();$('witness-button').hidden=true;
  $('relationship').textContent=s.photoChoice==='erase'?'写真を消し、透との約束を守った。':s.photoChoice==='keep'?'写真を非公開で残す理由を、透と共有した。':'相棒にも、守りたい秘密があった。';
  const platform=['request','crossroads','travel'].includes(s.phase);
  if(platform)setScene('episode/platform-night.webp','霧山駅・閉鎖ホーム','04 / KIRIYAMA STATION','雨の閉鎖ホーム。港へ向かう列車を待つ。');
  else if(s.phase==='archive')setScene('complete/station-office.webp','霧山駅・駅務室','04 / STATION OFFICE','灯る机に、入構の帳簿と赤い受領控えの封筒が置かれている。');
  else if(s.phase==='riding')setScene('complete/train-car-night.webp','夜の車両・'+EPISODE_CASE.trains.find(t=>t.id===s.activeLeg?.trainId)?.name,'SHIOMI / ON THE TRAIN','木の車内と青緑の座席。雨の窓の向こうに港の灯りが見える。');
  else if(s.phase==='central')setScene('complete/train-car-night.webp','汐見中央・乗換え','02 / SHIOMI CENTRAL','中央駅に停車した車内。港への列車を乗換案内で確かめる。');
  else setScene('complete/harbor-platform.webp','灯台港・最終列車のホーム','01 / TODAI PORT','雨の港。灯台が光り、暖かな列車の扉が開いている。');
  if(s.phase==='camera'||s.phase==='complete'){
   $('viewfinder').hidden=false;$('episode-stage').dataset.photoFrame=s.framing;
   $('viewfinder-label').textContent=s.phase==='complete'?'23:47 / 記録した一枚':'23:47 / 最後の一枚';
  }
  if(api.isDialogue())return;
  if(s.phase==='archive')api.actor('shiori','neutral');
  else if(['request','crossroads','travel'].includes(s.phase))api.actor('toru','neutral');
  else if(s.phase==='central')api.actor(s.route==='escort'?'toru':null,'neutral');
  else if(s.phase==='harbor'){
   if(s.route==='escort'){api.actor('akari','neutral');$('episode-actor').classList.add('harbor-cast-left');secondary('takase',true);}
   else api.actor('takase','neutral',true);
  }else if(s.phase==='camera'||s.phase==='complete'){
   const people=s.framing==='people';api.actor(people?'toru':null,'relieved');secondary('akari',people);$('ticket-composition').hidden=people;
  }
 }
 function freeScene(focus){
  const s=state();if(!inNext(s))return false;
  $('ending-card').hidden=true;$('scene-caption').hidden=false;$('open-message').hidden=true;api.renderChrome();
  const descriptions={
   archive:'帳簿と受領控え。栞と一緒に、あの男が来た理由と時刻を確かめよう。',
   travel:s.route==='escort'?'透と同じ車両へ。港へ行く列車を選ぼう。直通と、中央止まりの普通列車がある。':'駅務室で得た記録を持ち、港へ。23:22の直通は出た。後発便と、中央での乗換えを考えよう。',
   central:'汐見中央23:37着。別の列車への乗換えには2分。港へ向かう便を、到着時刻と一緒に確かめよう。',
   harbor:s.route==='escort'?'青い傘を持つ灯と、列車のそばの編集者。選んだ道で得た話を、記録と結び付けよう。':'駅務室の記録を持って、港に着いた。黒いコートの男の言葉を、あなたが確かめた足取りと照合しよう。',
   camera:'二人で帰る約束の時刻。構図を選んで、あなたの手でシャッターを切ろう。',
   complete:'同じ列車へ乗り込む前、23:47の一枚が残った。'
  };
  $('scene-description').textContent=descriptions[s.phase]||'次の行動を選ぼう。';
  const trip=['travel','central'].includes(s.phase);
  $('continuation-panel').hidden=!trip;
  if(trip){
   const p=planningPoint(s);$('journey-heading').textContent=station(p.station)+' '+formatTime(p.time)+' → 灯台港';
   $('journey-note').textContent=s.phase==='central'?'乗換えは2分。23:47の港発最終列車までに着く便を選びます。':'直通なら中央でも同じ車両。中央止まりの便なら、港行きへの乗換えが必要です。';
   $('plan-trip').textContent=s.phase==='central'?'乗り継ぐ列車を選ぶ':'乗る列車を選ぶ';
  }
  $('camera-controls').hidden=s.phase!=='camera';
  if(s.phase==='camera')document.querySelectorAll('input[name=framing]').forEach(e=>e.checked=e.value===s.framing);
  $('story-complete').hidden=s.phase!=='complete';
  if(s.phase==='complete'){
   $('complete-title').textContent=s.photoChoice==='erase'?'消した一枚、残った約束。':'名前のある、最後の一枚。';
   $('complete-description').textContent=s.framing==='tickets'?'合わせた半券と、港の灯り。帰りの約束を、あなたの構図で残した。':'透と灯が、カメラの向こうで笑った。撮った人の名前が、写真に戻った。';
   $('complete-postscript').textContent='数日後、写真展の案内に「撮影・三好 灯」の名前が戻った。港の映像にいたのは、傘を借りて待っていた灯。あなたと透は、同じ最終列車で帰った。';
   $('decision-record').innerHTML='<span>'+(s.photoChoice==='erase'?'現場写真を削除':'現場写真を非公開で保持')+'</span><span>'+(s.route==='escort'?'透と港で聞き込み':'栞と駅務室を調査')+'</span><span>'+s.journey.map(l=>esc(EPISODE_CASE.trains.find(t=>t.id===l.trainId).name)).join(' → ')+'</span>';
  }
  if(focus){
   const target=s.phase==='complete'?$('review-photo'):s.phase==='camera'?$('take-photo'):trip?$('plan-trip'):[...document.querySelectorAll('[data-hotspot]')].find(e=>e.getClientRects().length);
   api.focusControl(target);
  }
  return true;
 }
 function hotspots(){
  const s=state();
  if(s.phase==='archive')return [{id:'archive-ledger',text:'入構の帳簿',x:57,y:69,visit:'archive-ledger'},{id:'archive-envelope',text:'赤い封筒の受領控え',x:36,y:77,visit:'archive-envelope'},{id:'leave-archive',text:'調べて、港へ出発',x:79,y:84}];
  if(s.phase==='harbor')return [
   ...(s.route==='escort'?[{id:'akari',text:'青い傘の灯に話す',x:22,y:85,visit:'akari'}]:[]),
   {id:'editor',text:'高瀬に話す',x:83,y:85,visit:'editor'},
   {id:'harbor-board',text:'霧山から港への運行表',x:53,y:27,visit:'harbor-board'}
  ];
  return [];
 }
 function photoDecision(){
  api.choices('この写真を、どうする？ 消すと写真そのものは失い、足取りのメモだけが残ります。',[
   {id:'erase',text:'写真を消す。匿名の約束を守る'},
   {id:'keep',text:'公開せずに残す。理由を本人と確かめる'},
   {id:'ask-photo',text:'決める前に、誰の名前なのか聞く'}
  ],value=>{
   if(value==='ask-photo'){api.playLines(PHOTO_QUESTION,photoDecision,'ct-photo-question');return;}
   if(!api.dispatch({type:'photo-decision',value}))return;
   api.banner(value==='erase'?'写真を削除。足取りのメモが残った。':'写真を非公開で残した。');
   api.playLines(photoReply(value),crossroads,'ct-photo-'+value);
  });
 }
 function request(){api.playLines(REQUEST_LINES,photoDecision,'ct-request');}
 function crossroads(){
  api.playLines(CROSSROADS_LINES,()=>api.choices('どちらの道で、真相を確かめる？',[
   {id:'escort',text:'透と港へ行く。青い傘の人に直接会う'},
   {id:'station',text:'栞と駅に残る。入構記録と受領控えを調べる（出発は23:25）'}
  ],value=>{
   if(api.dispatch({type:'choose-route',value}))api.playLines(routeIntro(value),()=>api.freeScene(true),'ct-route-'+value);
  }),'ct-crossroads');
 }
 function ride(){api.playLines(rideLines(state()),()=>{if(api.dispatch({type:'arrive'})){api.sound.play('play');resume();}},'ct-ride-'+state().activeLeg.trainId);}
 function harborArrival(){api.playLines(harborIntro(state().route),()=>{api.dispatch({type:'heard-harbor'});api.freeScene(true);},'ct-harbor-'+state().route);}
 function confession(){
  const s=state(),answer=judgeFinalProof(s,s.finalProof.selected,s.finalProof.reason);
  api.playLines(confessionLines(s,answer),()=>{api.dispatch({type:'resolve'});cameraIntro();},'ct-confession-'+s.route);
 }
 function cameraIntro(){api.playLines(cameraLines(state()),()=>api.freeScene(true),'ct-camera-'+state().photoChoice);}
 function resume(){
  switch(state().phase){
   case 'request':request();return true;
   case 'crossroads':crossroads();return true;
   case 'riding':ride();return true;
   case 'harbor-intro':harborArrival();return true;
   case 'confession':confession();return true;
   case 'camera':cameraIntro();return true;
   default:if(inNext(state())){api.freeScene();return true;}return false;
  }
 }
 function hotspot(id,source){
  const s=state();if(!inNext(s))return false;
  if(id==='archive-ledger'||id==='archive-envelope'){
   const proof=id==='archive-ledger'?'station-log':'archive-note';
   if(api.dispatch({type:id})){api.sound.play();api.evidence(proof,source);}
  }else if(id==='leave-archive'){
   if(api.dispatch({type:'leave-archive'}))api.freeScene(true);else api.toast('先に、入構の帳簿と赤い封筒の受領控えを調べよう。');
  }else if(id==='akari'&&s.route==='escort'){
   api.playLines(akariLines(s.photoChoice),()=>{api.dispatch({type:'heard-akari'});api.banner('透の目撃記録と、青い傘の真相を記録');api.freeScene(true);},'ct-akari-'+s.photoChoice);
  }else if(id==='editor'){
   api.playLines(EDITOR_LINES,()=>{api.dispatch({type:'heard-editor'});api.freeScene(true);},'ct-editor');
  }else if(id==='harbor-board'){
   if(api.dispatch({type:'record-return-table'}))api.evidence('return-table',source);
  }else return false;
  return true;
 }
 function tripFeedback(text){$('trip-feedback').textContent=text;$('trip-feedback').hidden=false;$('trip-reselect').hidden=false;$('trip-feedback').focus({preventScroll:false});}
 function boardingMessage(a){
  const messages={
   'not-served':'この駅には停まりません。急行は港と温泉だけ。霧山からは乗れません。',
   departed:'その列車は、現在の物語の時刻より前に出ています。後発の便を選ぼう。',
   transfer:'中央23:37着から23:38発では1分しかありません。別の列車への乗換えは2分必要です。',
   'wrong-destination':'この便は温泉へ向かいます。港へ行く便、または中央で乗り継げる便を選ぼう。'
  };
  return messages[a.status]||'乗る列車を一つ選んでください。';
 }
 function renderTrip(){
  chosenTrain=null;$('trip-reselect').hidden=true;$('trip-board').disabled=true;$('trip-feedback').hidden=true;$('trip-preview').textContent='列車を選ぶと、停車駅と到着時刻を確認できます。';
  const s=state(),point=planningPoint(s),ids=s.phase==='central'?['E404','E405','R502']:['R502','R504','M501','EX1'];
  $('trip-title').textContent=station(point.station)+'から、港へ。';
  $('trip-current').textContent='現在 '+formatTime(point.time)+' / '+station(point.station)+(point.transfer?'着・乗換えは2分':'');
  $('trip-options').innerHTML=ids.map(id=>{
   const t=EPISODE_CASE.trains.find(t=>t.id===id);
   return '<button type="button" class="trip-option" data-trip="'+id+'" aria-pressed="false"><strong>'+esc(t.name)+'</strong><span>'+t.stops.map((x,i)=>station(x.station)+' '+formatTime(i===t.stops.length-1?x.arrive:x.depart)).join(' → ')+'</span><small>'+(id==='R502'?'同じ車両で港まで直通':id==='R504'?'中央止まり・港へは乗換え':id==='EX1'?'途中の駅は通過':'停車駅と乗換え時間を確認')+'</small></button>';
  }).join('');
 }
 function openTrip(source){if(!['travel','central'].includes(state().phase)||api.isDialogue())return;renderTrip();api.showDialog($('trip-dialog'),source);}
 $('trip-options').addEventListener('click',event=>{
  const b=event.target.closest('[data-trip]');if(!b)return;chosenTrain=b.dataset.trip;
  for(const e of $('trip-options').querySelectorAll('[data-trip]'))e.setAttribute('aria-pressed',String(e===b));
  const a=judgeBoarding(state(),chosenTrain);$('trip-feedback').hidden=true;$('trip-reselect').hidden=true;
  if(a.status!=='valid'){$('trip-board').disabled=true;tripFeedback(boardingMessage(a));return;}
  $('trip-board').disabled=false;$('trip-preview').textContent=formatTime(a.leg.depart)+' '+station(a.leg.from)+'発 → '+formatTime(a.leg.arrive)+' '+station(a.leg.to)+'着。'+(a.connection?'中央で港行きへ乗り換えます。':'最終列車23:47に間に合います。');
 });
 $('trip-board').addEventListener('click',()=>{
  const a=judgeBoarding(state(),chosenTrain);if(a.status!=='valid'){tripFeedback(boardingMessage(a));return;}
  api.closeDialog($('trip-dialog'),false);
  if(api.dispatch({type:'board-train',trainId:chosenTrain})){api.sound.play('play');api.banner('乗車：'+EPISODE_CASE.trains.find(t=>t.id===chosenTrain).name);ride();}
 });
 $('trip-reselect').addEventListener('click',()=>{ $('trip-options').querySelector('button')?.focus(); });
 $('plan-trip').addEventListener('click',e=>openTrip(e.currentTarget));
 $('trip-map').addEventListener('click',()=>{api.closeDialog($('trip-dialog'),false);api.openRail($('plan-trip'));});
 $('continue-story').addEventListener('click',()=>{if(api.dispatch({type:'continue-story'}))request();});
 $('take-photo').addEventListener('click',()=>{
  if(api.isDialogue()||!api.dispatch({type:'take-photo'}))return;
  $('capture-flash').classList.remove('is-capturing');void $('capture-flash').offsetWidth;$('capture-flash').classList.add('is-capturing');
  api.sound.play('success');api.banner('23:47の一枚を、記録した。');
  api.playLines(epilogueLines(state()),()=>api.freeScene(true),'ct-epilogue-'+state().framing);
 });
 document.querySelectorAll('input[name=framing]').forEach(e=>e.addEventListener('change',()=>{api.dispatch({type:'set-framing',value:e.value});api.freeScene();}));
 $('review-photo').addEventListener('click',e=>api.evidence('last-photo',e.currentTarget));
 $('final-notebook').addEventListener('click',e=>api.openLog(e.currentTarget));
 $('rewind-story').addEventListener('click',()=>{if(api.dispatch({type:'rewind-continuation'}))api.freeScene(true);});
 function proofInfo(){return {title:'23:34の港。その証言を、確かめる。',person:'高瀬 玲',claim:'「23:34には、私は港にいました。霧山へ回収になど行っていません」',reasons:FINAL_REASONS};}
 function handleProof(selected,reason){
  if(state().phase!=='harbor')return false;
  const a=judgeFinalProof(state(),selected,reason);
  if(a.status==='contradiction'){
   api.closeDialog($('proof-dialog'),false);api.dispatch({type:'present-final',selected,reason});api.sound.play('objection');api.banner('23:34の港には、着けない。');confession();return true;
  }
  const messages={'choose-two':'霧山にいた時刻の記録と、港への運行表。二つの手がかりを選ぼう。','not-owned':'その手がかりは、まだ持っていません。選んだ調査経路で、実際の記録を集めよう。',unrelated:'高瀬「その記録が、私の行動とどう関係するんですか？」 霧山にいた時刻の記録と、港への運行表を結び付けよう。','choose-reason':'二つの記録が証言を崩す理由を、一つ選んでください。','wrong-reason':'傘だけでは人物を決められません。直通列車なら中央で乗換えも不要です。霧山から港への最速到着を確かめよう。'};
  api.sound.play('wrong');api.proofFeedback(messages[a.status]||'もう一度、足取りと運行表を照合しよう。');return true;
 }
 function evidenceVisual(id){
  if(id==='station-log')return '<div class="ledger-record"><small>霧山駅 / 夜間入構記録</small><div class="ledger-row"><span>時刻</span><strong>23:16</strong></div><div class="ledger-row"><span>氏名</span><strong>高瀬 玲</strong></div><div class="ledger-row"><span>用件</span><strong>写真展・原板確認</strong></div><p>駅務室の帳簿から、栞と確認した記録。</p></div>';
  if(id==='archive-note')return '<div class="red-envelope"><small>原板確認 / 受領控え</small><strong>三好 灯 → 朝倉 透</strong><p>本人の了承まで、実名は伏せる。<br>写真の作者を確かめるため、昼に預けた原板。</p></div>';
  if(id==='return-table')return '<div class="return-route"><small>山海直通502 / 同じ列車で港へ</small><div><strong>霧山<span>23:22 発</span></strong><i>→</i><strong>汐見中央<span>23:32 着<br>23:34 発</span></strong><i>→</i><strong>灯台港<span>23:43 着</span></strong></div><p>23:16の霧山から、最も早い港への到着は23:43。</p></div>';
  if(id==='last-photo')return photoHTML();
  return '';
 }
 function photoHTML(){
  const s=state(),people=s.framing==='people';
  return '<figure class="saved-photo"><div class="saved-photo-image"><img src="./assets/complete/harbor-platform.webp" alt="灯台港の灯りと最終列車">'+(people?'<div class="photo-person photo-person-toru"></div><div class="photo-person photo-person-akari"></div>':'<div class="saved-tickets"><span>帰りは、</span><span>一緒に。</span></div>')+'<span class="photo-dateline">23:47 / SHIOMI RAILWAY</span></div><figcaption>'+ (people?'撮っていいと伝えた二人と、港の灯り。':'二つの半券を合わせた手元と、港の灯り。')+'</figcaption></figure>';
 }
 return {render,freeScene,hotspots,hotspot,resume,proofInfo,handleProof,evidenceVisual,isActive:()=>inNext(state()),isFree:()=>NEXT_FREE_PHASES.includes(state().phase)};
}
