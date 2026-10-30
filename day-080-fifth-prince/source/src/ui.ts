import { BROTHERS, CHARACTERS, ENEMIES, ITEMS } from './content';
import { EPISODES, done as storyDone, eligible, eventAt, remembered, storyBlock, activeEpisode, storyTasks } from './story';
import { scriptFor, brotherPrelude, reconciliation, brotherResponse, awakening, demonPrelude, endingStory, campConversation, replayEpisode, townResponse } from './story-content';
import { PIXELS } from './pixel-gallery';
import { OpeningDirector } from './opening';
import { MARKET_START, OPENING_RECAP } from './opening-script';
import { createMap, safePosition } from './maps';
import { loadGame, saveGame } from './persistence';
import { attack, freshState, newAdventure, has, level, maxHp, objective, rank, transition, travelAllowed } from './state';
import { createWorld, type WorldScene } from './world';
import { Soundscape } from './audio';
import { battleTemplate, animateBattle } from './battle-view';
import { DISCOVERIES } from './exploration';
import type { Action, Brother, DialoguePage, EnemyId, GameState, Item, Point, SceneStaging, StoryChoice, StoryEpisode, StoryEvent, Zone } from './types';
const $=<T extends HTMLElement=HTMLElement>(selector:string)=>document.querySelector<T>(selector)!;
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const portrait=(id:string,cls='')=>`<span class="portrait pixel-portrait ${cls}" style="--accent:${CHARACTERS[id]?.color??'#c8b783'}"><img src="${PIXELS.face(id)}" alt=""/></span>`;
interface Choice { id?:string; label:string; action:()=>void; secondary?:boolean; disabled?:boolean; note?:string }
export class GameUI {
 state:GameState;private readonly storage={getItem:(key:string)=>window.localStorage.getItem(key),setItem:(key:string,value:string)=>window.localStorage.setItem(key,value)};private saved:GameState|null;private storyHeading='';private inStoryScene=false;private mode:'title'|'play'|'dialogue'|'shop'|'battle'|'journal'|'party'|'map'|'ending'|'confirm'|'opening'='title';private scene:WorldScene|null=null;private ready=false;private worldReady=false;private artReady=false;private opening:OpeningDirector|null=null;private nearby:Point|null=null;private toastTimer:number|undefined;private sound=new Soundscape();private modalReturn:HTMLElement|null=null;private sessionActive=false;private sessionStart=Date.now();private elapsedAtStart=0;private loadWarning='';private guardCooldown=false;private battleCommandFocus='attack';private endingPlayback=false;private endingLineOffset=0;
 constructor(){
 const loaded=loadGame(this.storage);this.saved=loaded.state;this.state=loaded.state??freshState();this.loadWarning=loaded.warning;
 this.mount();this.renderSound();this.renderHud();this.renderTitle();void this.preloadArt();
 const world=createWorld($('#game-canvas'),this.state,{blocked:()=>this.mode!=='play'||!!document.activeElement?.closest('.share'),interact:p=>this.interact(p),step:(surface,running)=>this.sound.footstep(surface,running),nearby:p=>this.setNearby(p),position:(x,y)=>{if(this.mode==='play'&&!this.inStoryScene)this.state.position={x,y};},ready:()=>{this.worldReady=true;this.finishLoading();}});
 this.scene=world.scene;
 this.bindKeys();
 const activate=(event:Event)=>{const target=event.target as HTMLElement;if(target?.closest?.('#sound-button,[data-opening="sound"],#audio-enabled'))return;void this.sound.unlock();};
 window.addEventListener('pointerdown',activate,{capture:true});window.addEventListener('keydown',event=>{if(!event.repeat)activate(event);},{capture:true});
 document.addEventListener('visibilitychange',()=>this.sound.setHidden(document.hidden));window.addEventListener('pagehide',()=>this.sound.setHidden(true));window.addEventListener('pageshow',()=>this.sound.setHidden(document.hidden));

 window.addEventListener('pagehide',()=>{if(this.sessionActive&&!['title','opening'].includes(this.mode)&&!this.state.battle)this.persist(false);});
 if(import.meta.env.DEV){Object.defineProperty(window,'__FIFTH_PRINCE__',{value:()=>({state:structuredClone(this.state),mode:this.mode,world:this.scene?.getSnapshot(),audio:this.sound.debugSnapshot()}),configurable:true});}
 }
 private finishLoading(){if(this.worldReady&&this.artReady){this.ready=true;this.renderHud();this.renderTitle();$('#loading').hidden=true;}}
 private async preloadArt(){
  try{await Promise.all([PIXELS.load(),document.fonts.load('16px KingdomPixel')]);this.artReady=true;this.finishLoading();}
  catch{const loading=$('#loading');loading.innerHTML='<div><p>ドット絵の読み込みに失敗しました。</p><button class="gold-button" id="retry-loading">もう一度読み込む</button></div>';$('#retry-loading').onclick=()=>location.reload();}
 }
 private mount(){
 $('#app').innerHTML=`<header class="site-header"><a class="brand" href="./" aria-label="第五王子と、名もなき加護 ホーム"><span class="brand-seal">王</span><span>第五王子と、名もなき加護<small>THE FIFTH PRINCE · AN ORIGINAL RPG</small></span></a><nav aria-label="ゲームメニュー"><button id="journal-button" class="nav-button" aria-label="冒険手帳を開く">▤ <span>手帳</span><kbd>J</kbd></button><button id="party-button" class="nav-button" aria-label="仲間の一覧を開く">♧ <span>仲間</span><kbd>P</kbd></button><button id="sound-button" class="icon-button" aria-label="音をオフにする" title="音をオフにする">♪</button><button id="save-button" class="save-button" aria-label="冒険を記録する">記録 <span aria-hidden="true">↗</span></button></nav></header>
 <main class="game-layout"><section class="adventure"><div class="chapter-heading"><div><span class="eyebrow">YOUR LITTLE, GREAT ADVENTURE</span><h1 id="chapter-name">ある、小さな勇者の物語。</h1></div><span class="edition">短編RPG <span>01</span></span></div>
 <div class="stage-frame"><div class="stage" id="stage"><div id="game-canvas" aria-label="王都の探索マップ。矢印キーまたはWASDで移動。Eで話す。地面や人物をタップしても移動できます。"></div><div class="location-tag" id="location-tag"><span class="location-icon">⌖</span><span id="location-name">アステリア王都<small>はじまりの市場</small></span></div><button id="map-button" class="map-button" aria-label="地域の地図を開く">▧ 地図</button><div id="loading" class="loading">物語の世界を準備しています…</div><div id="title-screen" class="title-screen"></div><div id="modal" class="modal" hidden></div><div id="toast" class="toast" role="status" aria-live="polite" hidden></div></div><div class="game-toolbar"><div class="key-hints"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / <kbd>↑</kbd> 移動</span><span><kbd>E</kbd> 話す・調べる</span><span class="tap-hint">地面をタップして移動</span></div><button id="fullscreen" class="icon-button" aria-label="画面を大きくする">⛶</button></div></div>
 <div class="touch-controls" aria-label="タッチ操作"><div class="dpad"><button data-dir="up" aria-label="上へ移動">↑</button><button data-dir="left" aria-label="左へ移動">←</button><button data-dir="down" aria-label="下へ移動">↓</button><button data-dir="right" aria-label="右へ移動">→</button></div><button id="interact-button" class="interact-button" disabled>話す・調べる <kbd>E</kbd></button></div>
 <section class="objective-card" aria-label="現在の目標"><span class="objective-glyph">◇</span><div><span class="eyebrow">NEXT CHAPTER</span><h2><button id="objective-toggle" aria-controls="objective-hint" aria-expanded="false"><span id="objective-title">あなたの最初の一歩を。</span><span class="objective-chevron" aria-hidden="true">⌄</span></button></h2><p id="objective-hint">「はじめから」で物語が始まります。</p></div><button id="guide-button" class="outline-button" aria-label="目標へ歩く"><span class="guide-label">目標へ歩く</span><span aria-hidden="true">→</span></button></section>
 <div class="journey-footer"><span>小さな約束が、いつか世界を変える。</span><div><i class="element fire">火</i><i class="element water">水</i><i class="element wood">木</i><i class="element thunder">雷</i><i class="element bond">絆</i></div></div></section>
 <aside class="sidebar" aria-label="冒険の記録"><section class="hero-card"><div class="card-caption"><span>冒険の記録</span><span>✧</span></div><div class="hero-identity">${portrait('lyca','hero-portrait')}<div><span class="eyebrow">FIFTH PRINCE</span><h2>リュカ <span id="hero-level">Lv.1</span></h2><p id="hero-rank">名もなき第五王子</p></div></div><div class="blessing"><span>授かった加護</span><strong id="hero-blessing">—— まだ、何もない。</strong></div><div class="stat-grid"><div><span class="stat-label">所持金</span><strong id="gold-value">60 <small>G</small></strong></div><div><span class="stat-label">王都の信頼</span><strong id="trust-value">0 <small>pt</small></strong></div></div><div class="trust-meter"><div id="trust-fill"></div></div><p class="rank-hint" id="rank-hint">ひとつの出会いから、はじめよう。</p></section>
 <section class="party-card"><div class="card-caption"><span>ともに歩く仲間</span><span id="party-count">0 / 3</span></div><div id="party-list"></div><button id="party-detail" class="text-button">仲間の物語を見る <span>↗</span></button></section>
 <section class="brother-card"><div class="card-caption"><span>五人の王子</span><span class="tiny-label">ASTELIA</span></div><div class="brother-emblems" id="brother-emblems"></div><p id="brother-note">四つの才能と、ひとつの空席。</p></section>
 <div class="sidebar-note"><span>“</span><p>勇者に必要なのは、<br>強い魔法だけだろうか。</p><small>— アステリアの古い言い伝え</small></div></aside></main>
 <footer class="site-footer"><span>第五王子と、名もなき加護</span><span>オリジナル短編RPG · セーブはこのブラウザに保存されます</span><button id="share-button">物語を共有 ↗</button></footer>`;
 $('#stage').append(document.querySelector('.objective-card')!);$('#stage').append(document.querySelector('.game-toolbar')!);$('#stage').append(document.querySelector('.touch-controls')!);const field=document.createElement('div');field.id='field-hud';field.className='field-hud';$('#stage').append(field);const share=$('#share-button');share.textContent='↗';share.className='icon-button';share.setAttribute('aria-label','物語を共有');share.setAttribute('title','物語を共有');$('.site-header nav').append(share);
 $('#journal-button').onclick=()=>this.menu('journal');$('#party-button').onclick=()=>this.menu('party');$('#party-detail').onclick=()=>this.menu('party');$('#map-button').onclick=()=>this.menu('map');
 $('#objective-toggle').onclick=()=>{const expanded=$('.objective-card').classList.toggle('expanded');$('#objective-toggle').setAttribute('aria-expanded',String(expanded));};
 $('#guide-button').onclick=()=>this.guide();$('#interact-button').onclick=()=>this.scene?.interact();
 $('#save-button').onclick=()=>{if(this.mode==='title')this.toast('冒険をはじめると記録できます。');else this.persist(true);};
 $('#sound-button').onclick=()=>this.toggleSound(true);
 $('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('#stage').requestFullscreen();}catch{this.toast('この端末では全画面に対応していません。横向きでも遊べます。');}};
 $('#share-button').onclick=()=>this.share();
 document.querySelectorAll<HTMLButtonElement>('[data-dir]').forEach(b=>{
 b.onpointerdown=e=>{if(this.mode!=='play')return;e.preventDefault();b.setPointerCapture(e.pointerId);this.scene?.cancelRoute();const d=b.dataset.dir;if(this.scene)this.scene.touch={x:d==='left'?-1:d==='right'?1:0,y:d==='up'?-1:d==='down'?1:0};};
 const clear=()=>{if(this.scene)this.scene.touch={x:0,y:0};};b.onpointerup=clear;b.onpointercancel=clear;b.onlostpointercapture=clear;
 });
 }
 private gridChoice(choices:HTMLButtonElement[],origin:HTMLButtonElement,code:string){
 const rows:HTMLButtonElement[][]=[];
 for(const button of choices){const y=button.getBoundingClientRect().top;let row=rows.find(row=>Math.abs(row[0].getBoundingClientRect().top-y)<8);if(!row){row=[];rows.push(row);}row.push(button);}
 rows.sort((a,b)=>a[0].getBoundingClientRect().top-b[0].getBoundingClientRect().top);for(const row of rows)row.sort((a,b)=>a.getBoundingClientRect().left-b.getBoundingClientRect().left);
 const rowIndex=rows.findIndex(row=>row.includes(origin)),row=rows[rowIndex];
 if(code==='ArrowLeft'||code==='ArrowRight')return row[(row.indexOf(origin)+(code==='ArrowLeft'?-1:1)+row.length)%row.length];
 const target=rows[(rowIndex+(code==='ArrowUp'?-1:1)+rows.length)%rows.length],rect=origin.getBoundingClientRect(),center=rect.left+rect.width/2;
 return target.reduce((best,button)=>{const r=button.getBoundingClientRect(),b=best.getBoundingClientRect();return Math.abs(r.left+r.width/2-center)<Math.abs(b.left+b.width/2-center)?button:best;});
 }
 private handleChoiceInput(event:KeyboardEvent):boolean{
 const modal=$('#modal'),battle=this.mode==='battle';if(!['dialogue','battle','ending'].includes(this.mode)||modal.hidden)return false;
 const direction:Record<string,number>={ArrowUp:-1,ArrowLeft:-1,ArrowDown:1,ArrowRight:1},confirm=['Enter','NumpadEnter','KeyE','Space'].includes(event.code);
 const active=document.activeElement;if(confirm&&active instanceof HTMLElement&&!modal.contains(active)&&active.matches('button,input,select,a'))return false;
 const recovery=modal.querySelector('.battle-loading button');
 if(battle&&(this.guardCooldown||(modal.querySelector<HTMLElement>('.battle-controls')?.inert&&!recovery))){if(event.code in direction||confirm){event.preventDefault();return true;}return false;}
 const selector=battle?'.command-grid [data-command],.battle-finish-actions button,.battle-loading button':this.mode==='ending'?'.ending-actions button':'[data-choice]';
 const choices=Array.from(modal.querySelectorAll<HTMLButtonElement>(selector)).filter(button=>!button.disabled&&button.getClientRects().length>0&&!button.closest('[inert]'));
 if(!choices.length)return false;
 const focused=choices.indexOf(document.activeElement as HTMLButtonElement);
 if(event.code in direction){
  event.preventDefault();if(event.repeat)return true;
  const target=focused<0?choices[0]:battle&&modal.querySelector('.command-grid')?this.gridChoice(choices,choices[focused],event.code):choices[(focused+direction[event.code]+choices.length)%choices.length];
  target.focus({preventScroll:true});target.scrollIntoView({block:'nearest'});if(target!==choices[focused])this.sound.ping();return true;
 }
 if(confirm){
  event.preventDefault();if(!event.repeat)(choices[focused<0?0:focused]).click();return true;
 }
 if(event.code==='Escape'){
  const back=[...choices].reverse().find(button=>button.classList.contains('secondary')||button.id==='battle-retreat');if(!back)return false;
  event.preventDefault();if(!event.repeat)back.click();return true;
 }
 return false;
 }
 private bindKeys(){
 window.addEventListener('keydown',e=>{
 if(e.target instanceof Element&&e.target.closest('.share'))return;
 if(e.key==='Tab'&&!$('#modal').hidden){const items=Array.from($('#modal').querySelectorAll<HTMLElement>('button:not([disabled]),select,a,input')).filter(e=>e.getClientRects().length>0&&!e.closest('[inert]'));if(items.length){const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}return;}
 if(this.mode==='opening'){this.opening?.handleKey(e);return;}
 if(this.handleChoiceInput(e))return;
 if((e.target as HTMLElement).tagName==='SELECT')return;
 if(e.code==='KeyJ'){e.preventDefault();this.menu('journal');return;}if(e.code==='KeyP'){e.preventDefault();this.menu('party');return;}
 if(e.code==='Escape'&&['shop','journal','party','map','confirm'].includes(this.mode)){e.preventDefault();this.close();return;}
 if(this.mode==='play'&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();
 if(this.mode==='play'&&['KeyE','Enter','Space'].includes(e.code)&&!e.repeat){e.preventDefault();this.scene?.interact();}
 else if(this.mode==='dialogue'&&['Enter','NumpadEnter','KeyE','Space'].includes(e.code)&&$('#modal button[data-next]')){e.preventDefault();if(!e.repeat)$('#modal button[data-next]')?.click();}
 });
 }
 private renderTitle(){
 this.sound.setMode('title');
 document.body.classList.add('is-title');document.body.classList.remove('is-playing');const title=$('#title-screen');title.hidden=false;title.style.backgroundImage='none';this.scene?.showTitle();
 const continueLabel=this.saved&&has(this.saved,'ended')?(has(this.saved,'ending:seen')?'クリア後の世界へ':'結末を見届ける'):'冒険のつづきから';
 title.innerHTML=`<div class="title-kicker">五人の兄弟と、名もなき勇者の物語</div><div class="title-copy"><span class="title-overline">火も、水も、雷もない。</span><h2>第五王子と、<br>名もなき加護<span>僕には、あなたがいる。</span></h2><div class="title-actions">${this.saved?'<button id="continue" class="gold-button">'+continueLabel+' <span>→</span></button>':''}<button id="new-game" class="${this.saved?'title-secondary':'gold-button'}">はじめから <span>→</span></button></div><p class="title-meta">探索・商売・仲間づくりで、勇者になる短編RPG</p><button id="opening-replay" class="title-replay">序章を観る ▶</button>${this.loadWarning?`<p class="load-warning" role="status">${esc(this.loadWarning)}</p>`:''}</div>`;
 $('#new-game').onclick=()=>{if(this.saved)this.showChoices('新しい冒険','はじめから遊ぶと、現在の冒険の記録を更新します。',[{label:'新しくはじめる',action:()=>this.start(false)},{label:'いまの記録を残す',secondary:true,action:()=>{this.mode='title';$('#modal').hidden=true;}}]);else this.start(false);};
 $('#opening-replay').onclick=()=>{if(this.ready)this.playOpening(true);};
 if(this.saved)$('#continue').onclick=()=>this.start(true);
 }
 private start(continuing:boolean){
 if(!this.ready){this.toast('世界を準備しています。少しお待ちください。');return;}
 this.sessionActive=continuing;document.body.classList.remove('is-title');document.body.classList.add('is-playing');if(!continuing)this.state=newAdventure();this.state.position=safePosition(createMap(this.state.zone),this.state.position);this.elapsedAtStart=this.state.playSeconds;this.sessionStart=Date.now();this.scene?.setSnapshot(this.state,true);$('#title-screen').hidden=true;this.mode='play';this.close();this.renderHud();
 if(continuing){if(has(this.state,'ended')&&!has(this.state,'ending:seen'))this.playEnding();else this.toast(this.loadWarning||'冒険のつづきへ、おかえりなさい。');}
 else this.playOpening(false);
 }
 private renderSound(){const on=!this.sound.muted,b=$('#sound-button');b.innerHTML=on?'♪':'♪<span class="sound-off">×</span>';b.setAttribute('aria-label',on?'音をオフにする':'音をオンにする');b.setAttribute('aria-pressed',String(on));b.title=on?'音をオフにする':'音をオンにする';const enabled=$<HTMLInputElement>('#audio-enabled');if(enabled)enabled.checked=on;}
 private async toggleSound(notify=false){const result=this.sound.toggle();this.renderSound();const on=await result;this.renderSound();if(notify)this.toast(on?'BGMと効果音をオンにしました。':'音をオフにしました。');return on;}
 private playOpening(replay:boolean){
  this.opening?.dispose();document.body.classList.add('is-opening');$('#title-screen').hidden=true;this.setMode('opening','<div id="opening-host"></div>');
  const title=()=>{this.opening?.dispose();this.opening=null;this.sessionActive=false;document.body.classList.remove('is-opening');this.sound.setStoryZone(null);this.state=this.saved?structuredClone(this.saved):freshState();$('#modal').hidden=true;this.mode='title';this.renderHud();this.renderTitle();};
  this.opening=new OpeningDirector($('#opening-host'),portrait,{frame:beat=>{this.scene?.showOpening(beat);this.sound.setStoryZone(beat.scene==='market'?'town':'palace');},muted:()=>this.sound.muted,toggleSound:()=>this.toggleSound(),cancel:title,finish:()=>{
   if(replay){title();return;}this.opening=null;this.sessionActive=true;document.body.classList.remove('is-opening');this.sound.setStoryZone(null);this.mode='play';this.state.position={...MARKET_START};this.scene?.setSnapshot(this.state,true);this.act({type:'flag',flag:'intro'},true);this.close();
  }},replay);
 }
 private setMode(mode:GameUI['mode'],html:string,preserveStage=false){
 if(mode!=='dialogue'&&!preserveStage)this.restoreStoryStage();
 if($('#modal').hidden)this.modalReturn=document.activeElement instanceof HTMLElement?document.activeElement:null;
 this.mode=mode;this.scene?.cancelRoute();this.sound.setMode(this.endingPlayback?'ending':mode==='battle'?'battle':mode==='opening'?'opening':mode==='dialogue'?'dialogue':mode==='ending'?'ending':'menu',this.state.battle?.enemy);const m=$('#modal');m.hidden=false;m.setAttribute('role','dialog');m.setAttribute('aria-modal','true');m.setAttribute('aria-label',mode==='opening'?'物語の序章':mode==='battle'?'ターン制戦闘':mode==='shop'?'商人オルンの店':'冒険の会話とメニュー');m.innerHTML=html;
 requestAnimationFrame(()=>{if(!m.contains(document.activeElement))m.querySelector<HTMLElement>('button:not([disabled]),select')?.focus({preventScroll:true});});
 }
 private close(){
 this.endingPlayback=false;document.body.classList.remove('is-ending-sequence');this.restoreStoryStage();this.storyHeading='';
 $('#modal').hidden=true;this.mode='play';this.sound.setMode('field');this.scene?.cancelRoute();this.renderHud();if(this.modalReturn?.isConnected)this.modalReturn.focus({preventScroll:true});
 }
 private act(a:Action,quiet=false):boolean{
 const previousLevel=level(this.state);const r=transition(this.state,a);if(!r.ok){this.toast(r.message,'bad');return false;}
 this.state=r.state;if(a.type==='trade')this.sound.reward('trade');else if(a.type==='gather')this.sound.reward('gather');else if(a.type==='discover')this.sound.reward('discover');else if(!this.state.battle&&level(this.state)>previousLevel)this.sound.reward('level');if(!this.inStoryScene)this.scene?.setSnapshot(this.state);this.renderHud();if(r.message&&!quiet)this.toast(r.message,'good');if(a.type==='gather')this.scene?.pickup('月しずく草 +2');
 if(a.type==='startBattle')this.persist(false);else if(!this.state.battle||this.state.battle.enemy==='demon'&&this.state.battle.result==='won')this.persist(false);
 return true;
 }
 private persist(notify:boolean){
 if(!this.sessionActive||this.mode==='opening')return;
 if(this.state.battle&&!(this.state.battle.enemy==='demon'&&this.state.battle.result==='won')){if(notify)this.toast('戦闘後に記録します。再読込すると戦闘前から再開します。');return;}
 this.state.playSeconds=this.elapsedAtStart+Math.floor((Date.now()-this.sessionStart)/1000);const r=saveGame(this.storage,this.state);if(r.ok)this.saved=structuredClone({...this.state,battle:null});if(notify||!r.ok)this.toast(r.message,r.ok?'good':'bad');
 }
 private renderHud(){
 const s=this.state,o=objective(s),started=this.mode!=='title';this.sound.setZone(s.zone);$('#chapter-name').textContent=started?o.chapter:'ある、小さな勇者の物語。';
 $('#hero-level').textContent=`Lv.${level(s)}`;$('#hero-rank').textContent=rank(s);$('#hero-blessing').textContent=has(s,'awakened')?'共鳴 — 心と力をつなぐ':'—— まだ、何もない。';
 $('#gold-value').innerHTML=`${s.gold.toLocaleString()} <small>G</small>`;$('#trust-value').innerHTML=`${s.trust} <small>pt</small>`;$('#trust-fill').style.width=`${Math.min(100,s.trust)}%`;
 $('#rank-hint').textContent=has(s,'ended')?'王都の誰もが、あなたの名を知っている。':has(s,'promoted')?'王都の使節として、兄たちと向き合おう。':`次の地位へ：信頼 ${Math.min(s.trust,30)} / 30 ・ 商い利益 ${Math.min(s.profit,24)} / 24G`;
 $('#party-count').textContent=`${s.party.length} / 3`;
 $('#party-list').innerHTML=['nora','mira','toma'].map(id=>s.party.includes(id as GameState['party'][number])?`<div class="party-member">${portrait(id)}<div><strong>${CHARACTERS[id].name}</strong><small>${CHARACTERS[id].role}</small></div><span class="joined-mark">✦</span></div>`:`<div class="party-member unknown"><span class="empty-portrait">＋</span><div><strong>まだ見ぬ仲間</strong><small>出会いを、待っている。</small></div></div>`).join('');
 $('#brother-emblems').innerHTML=[...BROTHERS,'lyca'].map(id=>`<span class="brother-sigil ${s.brothers.includes(id as Brother)||id==='lyca'&&has(s,'awakened')?'united':''}" style="--accent:${CHARACTERS[id].color}" title="${CHARACTERS[id].role} ${CHARACTERS[id].name}">${id==='lyca'?(has(s,'awakened')?'絆':'？'):CHARACTERS[id].symbol}</span>`).join('');
 $('#brother-note').textContent=has(s,'awakened')?'五つの光は、ひとつの希望になる。':s.brothers.length?`協力を約束した兄：${s.brothers.length} / 4人`:'四つの才能と、ひとつの空席。';
 $('#field-hud').innerHTML=`${portrait('lyca','field-portrait')}<div><strong>リュカ <small>Lv.${level(s)}</small></strong><span>${rank(s)}</span><div class="field-counters"><b>◈ ${s.gold}G</b><b>♧ ${s.trust}</b><b>♙ ${s.party.length}</b></div></div>`;
 $('#objective-title').textContent=started?o.title:'あなたの最初の一歩を。';$('#objective-hint').textContent=started?o.hint:'「はじめから」で物語が始まります。';
 const map=createMap(s.zone);$('#location-name').innerHTML=`${map.name}<small>${map.subtitle}</small>`;
 const complete=has(s,'ended')&&!activeEpisode(s),guideLabel=complete?(has(s,'ending:seen')?'結末・旅の記録':'結末を見届ける'):'目標へ歩く';
 $('#guide-button .guide-label').textContent=guideLabel;$('#guide-button').setAttribute('aria-label',guideLabel);$('.objective-card .eyebrow').textContent=complete?'STORY COMPLETE':'NEXT CHAPTER';
 $('#guide-button').toggleAttribute('disabled',!started||this.mode!=='play');
 }
 private setNearby(p:Point|null){
 this.nearby=p;const b=$<HTMLButtonElement>('#interact-button');b.disabled=!p;b.innerHTML=p?`${p.kind==='chest'?'宝箱を開ける':p.kind==='lore'||p.kind==='story'?'調べる':p.kind==='herb'?'採集する':p.kind==='gate'?'先へ進む':p.kind==='enemy'?'調べる':esc(p.label)+'と話す'} <kbd>E</kbd>`:'話す・調べる <kbd>E</kbd>';
 }
 private toast(message:string,kind:'good'|'bad'|'click'='click'){
 const t=$('#toast');t.textContent=message;t.hidden=false;t.className='toast '+kind;if(this.toastTimer)clearTimeout(this.toastTimer);this.toastTimer=window.setTimeout(()=>t.hidden=true,4800);this.sound.ping(kind);
 }
 private showStoryStage(stage:SceneStaging){if(!this.inStoryScene)$('#toast').hidden=true;this.inStoryScene=true;document.body.classList.add('is-story-scene');this.sound.setStoryZone(stage.zone);this.scene?.showNarrative(stage,'story:'+JSON.stringify(stage));}
 private restoreStoryStage(){if(!this.inStoryScene)return;this.inStoryScene=false;document.body.classList.remove('is-story-scene');this.sound.setStoryZone(null);this.scene?.setSnapshot(this.state,true);}
 private story(pages:DialoguePage[],onComplete=()=>this.close(),finish='冒険を続ける',keepStage=false){
 let index=0;const render=()=>{
 const page=pages[index];if(page.stage)this.showStoryStage(page.stage);else this.restoreStoryStage();const id=Object.keys(CHARACTERS).find(k=>CHARACTERS[k].name===page.speaker)|| (page.speaker==='国王レオニス'?'king':page.speaker==='エルダ'?'sage':page.speaker==='ヴェイル'?'demon':'');
 this.setMode('dialogue',`<div class="dialogue-card"><div class="dialogue-top"><span>${esc(page.heading||this.storyHeading||'物語')} <small>${this.endingPlayback?index+1+this.endingLineOffset:index+1} / ${this.endingPlayback?14:pages.length}</small></span><span class="dialogue-dots">${pages.map((_,i)=>`<i class="${i===index?'active':''}"></i>`).join('')}</span></div><div class="dialogue-body">${id?portrait(id,'dialogue-portrait'):'<span class="narrator-portrait">✧</span>'}<div><h3>${esc(page.speaker)}</h3><p>${esc(page.text)}</p></div></div><div class="dialogue-actions"><span class="advance-hint">Enter / E / タップで進む</span><button data-next class="gold-button">${index===pages.length-1?finish:'つぎへ'} <span>→</span></button></div></div>`);
 $('#modal button[data-next]').onclick=()=>{this.sound.ping();if(++index<pages.length)render();else {if(!keepStage)this.restoreStoryStage();onComplete();}};
 if(page.cue){const button=$<HTMLButtonElement>('#modal button[data-next]'),card=$('#modal .dialogue-card');button.disabled=true;card.classList.add('cue-playing');card.setAttribute('aria-busy','true');if(page.cue==='release')this.sound.effect('magic');else if(page.cue==='serve')this.sound.effect('heal');void(this.scene?.playEndingCue(page.cue)??Promise.resolve()).finally(()=>{if(!button.isConnected)return;button.disabled=false;card.classList.remove('cue-playing');card.removeAttribute('aria-busy');if(!$('#modal').contains(document.activeElement))button.focus({preventScroll:true});});}
 };render();
 }
 private showChoices(speaker:string,text:string,choices:Choice[],id?:string,stage?:SceneStaging){
 if(stage)this.showStoryStage(stage);else this.restoreStoryStage();
 this.setMode('dialogue',`<div class="dialogue-card"><div class="dialogue-top"><span>出会い</span><span class="choice-keyhint">↑↓ 選ぶ · Enter 決定</span></div><div class="dialogue-body">${id?portrait(id,'dialogue-portrait'):'<span class="narrator-portrait">◇</span>'}<div><h3>${esc(speaker)}</h3><p>${esc(text)}</p></div></div><div class="choice-list">${choices.map((v,i)=>`<button data-choice="${i}" data-choice-action="${esc(v.id??'')}" class="${v.secondary?'choice-button secondary':'choice-button'}" ${v.disabled?'disabled':''}><span class="choice-cursor" aria-hidden="true">▶</span><span class="choice-copy">${esc(v.label)}${v.note?`<small>${esc(v.note)}</small>`:''}</span><span class="choice-arrow">→</span></button>`).join('')}</div></div>`);
 choices.forEach((c,i)=>{$(`#modal [data-choice="${i}"]`).onclick=()=>{this.sound.ping();c.action();};});
 }
 private guide(){
 if(this.mode!=='play')return;if(has(this.state,'ended')&&!activeEpisode(this.state)){if(has(this.state,'ending:seen'))this.menu('journal');else this.playEnding();return;}const o=objective(this.state);let target=o.target;
 if(o.zone!==this.state.zone){const zone=this.state.zone;target=zone==='town'?(o.zone==='forest'?'toForest':'toPalace'):zone==='forest'?'toTown':zone==='palace'?(o.zone==='abyss'?'toAbyss':'toTown'):'toPalace';}
 this.scene?.guide(target);this.toast('目標への道を歩きます。移動キーで中断できます。');
 }
 private askToTalk(point:Point,read:()=>void,topic='話を聞く'){
 this.showChoices(point.label,'話すことを選ぼう。',[{id:'talk',label:topic,action:read},{label:'別れる',secondary:true,action:()=>this.close()}],point.character);
 }
 private interact(p:Point){
 if(this.mode!=='play')return;
 const s=this.state;this.sound.ping();
 const event=eventAt(s,p.id);if(event){
  const begin=()=>this.runStory(event),task=storyTasks(s,event.split('.')[0] as StoryEpisode).find(t=>t.event===event);const services:Choice[]=[];
  if(p.id==='merchant')services.push({label:'先に仕入れ・販売をする',action:()=>this.shop()});
  if(p.id==='toma'&&s.party.includes('toma')&&!s.weapon)services.push({label:'先に剣を鍛える · 60G',action:()=>{if(this.act({type:'equip'}))this.close();}});
  if(p.id==='inn')services.push({label:'先にひと休みする',note:'癒やしの薬を3つまで無料補充',action:()=>{this.act({type:'heal'});this.close();}});
  if(p.id==='nora'&&s.gold<8)services.push({label:'先に店の手伝いをする · 報酬8G',action:()=>{if(this.act({type:'work'}))this.close();}});
  if(services.length||p.character||p.kind==='npc')this.showChoices(p.label,task?.hint??'話のつづきを聞こう。',[{id:'story',label:'物語のつづきを聞く',note:task?.title,action:begin},...services,{label:'あとで話す',secondary:true,action:()=>this.close()}],p.character);
  else begin();return;
 }
 const reply=townResponse(s,p.id);if(reply&&!(p.id==='nora'&&s.gold<8)){this.askToTalk(p,()=>this.story(reply),'近況を聞く');return;}
 if(p.kind==='story'){const sealed=p.id.startsWith('story:')&&s.zone==='abyss';this.story([{speaker:'語り手',text:sealed?(storyDone(s,'citadel')?'二つの封印は開いた。玉座への道で、仲間の声が確かに聞こえる。':'石は静かに脈打っている。先に仲間と話し、手帳の約束を確かめよう。'):'今は静かな場所だ。必要なときには、手帳に訪れる理由が記される。'}]);return;}

 if(p.kind==='chest'||p.kind==='lore'){const d=DISCOVERIES[p.id];if(!d)return;const read=()=>{if(!has(this.state,'found:'+p.id)){this.act({type:'discover',id:p.id});this.scene?.pickup(d.kind==='chest'?'発見！':'新しい物語');}this.story([{speaker:CHARACTERS[p.character??'']?.name??p.label,text:d.text}]);};if(p.character)this.askToTalk(p,read,'町の話を聞く');else read();return;}
 if(p.kind==='herb'){this.act({type:'gather',id:p.id});return;}
 if(p.kind==='gate'&&p.target){const z=p.target,reason=travelAllowed(s,z);this.showChoices(p.label,reason??`${createMap(z).name}へ向かいますか？`,[{label:'先へ進む',disabled:!!reason,action:()=>{if(this.act({type:'travel',zone:z}))this.close();}},{label:'ここにとどまる',secondary:true,action:()=>this.close()}]);return;}
 const done={label:'また話そう',secondary:true,action:()=>this.close()};
 switch(p.id){
 case 'merchant':this.showChoices('商人 オルン',has(s,'bread')?'王子様も、ここでは一人の商人だ。黄金麦は8Gで仕入れて14Gで売れる。小さな利益を積み重ねよう。':'ノラの頼みで黄金麦を？ 1つ8Gで仕入れられるよ。まずは麦を届けて、約束を守っておいで。',[{label:'仕入れ・販売をする',action:()=>this.shop()},done],'merchant');break;
 case 'nora':
 if(s.gold<8){this.showChoices('パン職人 ノラ','お財布が心細くなった？ お店の片づけを手伝ってくれたら8Gを渡せるよ。黄金麦を1つ買って、また商いを始められる。',[{label:'店の手伝いをする',note:'報酬8G ／ 黄金麦1つの仕入れ代',action:()=>{if(this.act({type:'work'}))this.close();}},done],'nora');break;}
 if(has(s,'bread'))this.askToTalk(p,()=>this.story([{speaker:'ノラ',text:has(s,'ended')?'おかえり！ 今日のパンは、いつもより少し甘く焼けたよ。勇者だって、お腹はすくでしょう？':'あなたの麦で焼いたパン、街で評判なんだ。「できる」と言ってくれた声、今も覚えてるよ。'}]));
 else this.showChoices('パン職人 ノラ','うちのパン屋、麦が足りなくて……。黄金麦を1つ届けてくれる？ お礼は32G。あなたが届けてくれたら、もう一度お店を頑張れそう。',[{label:'黄金麦を1つ渡す',note:`所持 ${s.inventory.wheat}個 ／ お礼 32G・信頼＋14`,action:()=>{if(this.act({type:'deliver',quest:'bread'}))this.story([{speaker:'ノラ',text:'ありがとう。王子様なのに、私の話を最後まで聞いてくれたんだね。まずは、今日の配達を手伝ってくれる？ 旅の食事も、私に任せて。'},{speaker:'リュカ',text:'僕こそ、ありがとう。一人より、きっと心強い。'}]);}},done],'nora');break;
 case 'mira':
 if(has(s,'medicine'))this.askToTalk(p,()=>this.story([{speaker:'ミラ',text:'助けを必要とする人は、まだたくさんいる。私、自分の手で誰かを救いたい。あなたとなら、歩いていけるよ。'}]));
 else this.showChoices('見習い薬師 ミラ','薬の調合に失敗してばかりで、自信がなくなっちゃった。でも街の人の薬は必要で……。月しずく草を3つ、一緒に探してくれる？ 森の光る草から採れるよ。',[{label:'月しずく草を3つ渡す',note:`所持 ${s.inventory.herb}個 ／ お礼 45G・信頼＋16`,action:()=>{if(this.act({type:'deliver',quest:'medicine'}))this.story([{speaker:'ミラ',text:'できた……！ 失敗したって、やめなくていいんだね。あなたの声を聞くと、もう一歩だけ頑張りたくなる。でも、もう一人、ちゃんと診たい人がいるの。少ししてから薬房で話せる？'}]);}},done],'mira');break;
 case 'inn':this.showChoices('宿屋の主人 エマ','少し休んでいくかい？ いつでも癒やしの薬を3つまで、無料で分けてあげる。無理せず、帰っておいで。',[{label:'ひと休みする',note:'無料 ／ 癒やしの薬を3つまで補充',action:()=>{this.act({type:'heal'});this.close();}},done],'inn');break;
 case 'toma':if(s.party.includes('toma'))this.showChoices('鍛冶師 トーマ',s.weapon?'この剣は、お前さんの約束を覚えてる。いつだって、握る手のためにある。':'助けてもらった礼だ。60Gで、その古い剣を「絆の剣」に鍛え直してやる。必要なら声をかけな。',[{label:s.weapon?'絆の剣を装備済み':'剣を鍛える · 60G',note:'攻撃力＋9',disabled:s.weapon,action:()=>{if(this.act({type:'equip'}))this.close();}},{id:'talk',label:'工房の話を聞く',action:()=>this.story([{speaker:'トーマ',text:storyDone(s,'forge')?'ノラの窯は、今朝もいい火だった。修理の道具は工房に置いてある。次の仕事が来たら、また一緒に行こう。':'戦いの道具だけが仕事じゃない。包丁や鍋も、町の暮らしを守っているんだ。'}])},done],'toma');break;
 case 'bramble':if(has(s,'bramble'))this.story([{speaker:'トーマ',text:'お前さんには、不思議と頼りたくなる。……いや、そうじゃないな。あのとき、逃げずに来てくれた。それが嬉しかったんだ。'}]);else this.showChoices('旅の鍛冶師 トーマ','いばらの番獣に道をふさがれちまった。剣一本じゃ歯が立たん。力を貸してくれないか？ 3ターン目ごとの強攻撃では「守る」が役立つぞ。',[{label:'番獣に立ち向かう',action:()=>this.startBattle('bramble')},done],'toma');break;
 case 'king':if(has(s,'promoted'))this.askToTalk(p,()=>this.story([{speaker:'国王レオニス',text:has(s,'ended')?'勇者よ、おかえり。お前たち五人がともに歩む姿こそ、この国の希望だ。':'民がお前の名を語るようになった。リュカ、兄たちにも、お前が見た世界を伝えてほしい。'}]));else this.showChoices('国王 レオニス','商いで道を開き、人々の声を聞き、危険に身を投じたそうだな。お前の歩みを、私に聞かせてくれるか。',[{label:'王都での歩みを報告する',action:()=>{if(this.act({type:'audience'}))this.story([{speaker:'国王レオニス',text:'今日よりお前を、王都の使節に任命する。魔法の強さだけでは測れぬ力を、確かに見せてもらった。'},{speaker:'リュカ',text:'僕一人の成果じゃありません。みんなが、僕をここまで連れてきてくれました。'}]);}},done],'king');break;
 case 'flame':case 'tide':case 'grove':case 'storm':{
 const b=p.id as Brother,c=CHARACTERS[b];if(s.brothers.includes(b)){this.askToTalk(p,()=>this.story(brotherResponse(s,b)),'兄弟の話を聞く');break;}
 if(!has(s,'promoted')){this.askToTalk(p,()=>this.story([{speaker:c.name,text:'リュカ。まずは父上に、お前がしてきたことを話してこい。'}]));break;}
 const block=storyBlock(s,'trial');if(block){this.askToTalk(p,()=>this.story([{speaker:c.name,text:block}]));break;}
 this.askToTalk(p,()=>this.story(brotherPrelude(s,b),()=>this.showChoices(`${c.role} ${c.name}`,'手合わせを始めよう。仲間の声と、相手の予兆を頼りに。',[{label:'仲間と、試練に挑む',note:'戦闘は全快で開始 ／ 勝つと協力を約束',action:()=>this.startBattle(b)},done],b)),'試練について聞く');break;}
 case 'sage':{
 const read=()=>{if(has(s,'awakened'))this.story([{speaker:'エルダ',text:'共鳴は、誰かの心を縛る力ではありません。あなたが差し出す手に、応えようとした心をつなぐ力です。'}]);else if(s.brothers.length<4)this.story([{speaker:'エルダ',text:'四つの光が再び並ぶとき、消えた第五の記録が開かれます。まずは、お兄様たちと向き合っておいでなさい。'}]);else if(storyBlock(s,'awaken'))this.story([{speaker:'エルダ',text:storyBlock(s,'awaken')!}]);else this.story(awakening(s),()=>{this.act({type:'awaken'});this.close();},'五人で、魔王城へ');};this.askToTalk(p,read,'加護について聞く');break;}
 case 'demon':{const read=()=>{if(has(s,'ended'))this.story([{speaker:'語り手',text:'孤独の玉座は、静かに光を浴びていた。もう、ここに闇はない。'}]);else if(storyBlock(s,'demon'))this.story([{speaker:'ヴェイル',text:'まだ仲間の声は届かぬ。二つの封印を前にしても、お前はひとりで進むつもりか。'},{speaker:'リュカ',text:storyBlock(s,'demon')!}]);else this.story(demonPrelude(s),()=>this.showChoices('魔王 ヴェイル','五つの光と、町へ帰る約束を胸に。',[{label:'五人で、最後の戦いへ',note:'共鳴5で「五光の共鳴」 ／ 3ターンごとの予兆に注意',action:()=>this.startBattle('demon')},done],'demon'));};if(has(s,'ended'))read();else this.askToTalk(p,read,'魔王と話す');break;}
 }
 }
 private runStory(event:StoryEvent){
 const script=scriptFor(event,this.state);this.storyHeading=script.title;
 const finish=(choice?:StoryChoice)=>{
  const commit=()=>{this.restoreStoryStage();this.act({type:'story',event,choice});this.close();};
  const response=choice?script.response?.(choice):undefined;
  if(response?.length)this.story(response,commit,'手帳の続きを確かめる');else commit();
 };
 this.story(script.pages,()=>{
  const d=script.decision;if(!d){finish();return;}
  this.showChoices(d.speaker,d.text,[...d.options.map(option=>({label:option.label,note:option.note,disabled:option.id==='crystal'&&this.state.inventory.crystal<1,action:()=>finish(option.id)})),{label:'あとで続ける',secondary:true,action:()=>this.close()}],d.character,script.pages[script.pages.length-1].stage);
 },script.decision?'自分の言葉で答える':'約束を手帳に記す');
 }
 private audioSettings(){const p=this.sound.preferences;return `<details class="audio-settings"><summary>音の設定</summary><label class="audio-enabled"><input id="audio-enabled" type="checkbox" ${p.muted?'':'checked'}> BGMと効果音を鳴らす</label><label>BGM <input id="music-volume" type="range" min="0" max="100" step="5" value="${p.music}" aria-label="BGMの音量"><output id="music-value">${p.music}%</output></label><label>効果音 <input id="effects-volume" type="range" min="0" max="100" step="5" value="${p.effects}" aria-label="効果音の音量"><output id="effects-value">${p.effects}%</output></label><p>音量はこのブラウザに保存します。右上の ♪ でもオン／オフを切り替えられます。</p></details>`;}
 private storyCatalogue(){
 const s=this.state;return `<section class="story-catalogue"><h3 class="section-label">町で重ねた物語</h3><p>終えた章は読み返せます。以前の記録でも、条件を満たした章をここから案内できます。</p>${EPISODES.map(e=>{const complete=storyDone(s,e.id),available=eligible(s,e.id);return `<article class="story-entry ${complete?'complete':''}"><div><h4>${complete?'✓ ':''}${available?e.title:'まだ見ぬ物語'}</h4><p>${available?e.summary:'仲間や兄弟と歩むうちに、続きが開きます。'}</p>${remembered(s,e.id)?`<small>${remembered(s,e.id)}</small>`:''}</div>${complete?`<button data-replay-story="${e.id}" class="outline-button">読み返す</button>`:available?`<button data-focus-story="${e.id}" class="outline-button">つづきを案内</button>`:'<span aria-label="まだ始められません">◇</span>'}</article>`;}).join('')}</section>`;
 }
 private shop(){
 const first=!has(this.state,'bread'),carrying=this.state.inventory.wheat>0;
 this.setMode('shop',`<section class="menu-panel shop-panel ${first?'shop-intro':''}"><div class="menu-heading"><div><span class="eyebrow">THE LITTLE MARKET</span><h2>オルンの商店</h2><p>${first?(carrying?'黄金麦を仕入れました。ノラのパン屋へ届けましょう。':'ノラの依頼：黄金麦を1つ、8Gで仕入れましょう。'):'商いの利益は、仕入れと販売の差額です。黄金麦なら1つ6G、4つで24G。'}</p></div><button data-close class="close-button" aria-label="店を閉じる">×</button></div><div class="shop-summary"><span>所持金 <strong>${this.state.gold} G</strong></span>${first?'<span>最初の約束 <strong>黄金麦 1つ</strong></span>':`<span>累計の商い利益 <strong>${this.state.profit} / 24 G</strong></span>`}</div><div class="shop-items">${(Object.keys(ITEMS) as Item[]).map(id=>{const it=ITEMS[id];return `<article class="shop-item ${id==='wheat'?'request-item':''}"><span class="item-symbol ${id}">${it.symbol}</span><div class="item-description"><h3>${it.name} <small>所持 ${this.state.inventory[id]}個</small></h3><p>${it.description}</p></div><div class="trade-actions"><label class="quantity-label">個数 <select data-quantity="${id}" aria-label="${it.name}の取引個数"><option value="1">1</option><option value="3">3</option><option value="4">4</option><option value="5">5</option></select></label><button data-buy="${id}" class="trade-button" ${this.state.gold<it.buy?'disabled':''}>仕入れ <b>${it.buy}G</b></button><button data-sell="${id}" class="trade-button sell" ${!this.state.inventory[id]||id==='potion'?'disabled':''}>${id==='potion'?'販売不可':'販売'} <b>${id==='potion'?'—':it.sell+'G'}</b></button></div></article>`;}).join('')}</div>${first?`<div class="shop-tip">${carrying?'黄金麦を手に入れました。次は、ノラのパン屋へ。':'「仕入れ 8G」を選ぶと、所持金から8Gを払い、黄金麦を1つ受け取ります。'}</div><div class="shop-onboarding"><button id="other-stock" class="outline-button">ほかの商品を見る</button>${carrying?'<button id="shop-to-nora" class="gold-button">ノラに届けに行く ▶</button>':''}</div>`:'<div class="shop-tip">✧ ノラの32Gは配達のお礼。商いの実績は、商品を仕入れ・販売して積み重ねよう。</div>'}</section>`);
 $('#modal [data-close]').onclick=()=>this.close();
 if(first)$('#other-stock').onclick=()=>{$('.shop-panel').classList.toggle('all-stock');$('#other-stock').textContent=$('.shop-panel').classList.contains('all-stock')?'黄金麦の依頼に戻る':'ほかの商品を見る';};if(first&&carrying)$('#shop-to-nora').onclick=()=>{this.close();this.scene?.guide('nora');};
 for(const item of Object.keys(ITEMS) as Item[])for(const direction of ['buy','sell'] as const){$(`#modal [data-${direction}="${item}"]`).onclick=()=>{
 const quantity=Number($<HTMLSelectElement>(`[data-quantity="${item}"]`).value);const ok=this.act({type:'trade',item,direction,quantity});if(ok){this.shop();requestAnimationFrame(()=>$<HTMLButtonElement>(`[data-${direction}="${item}"]`)?.focus());}
 };}
 }
 private startBattle(enemy:EnemyId){
 // Persist the last safe snapshot before combat changes any consumables or progress.
 this.persist(false);if(this.act({type:'startBattle',enemy},true)){this.battleCommandFocus='attack';this.battle();}
 }
 private battle(){
 const b=this.state.battle;if(!b)return;const warm=this.mode==='battle'&&$('#modal').querySelector<HTMLElement>('.battle-v2.visuals-ready')?.dataset.enemy===b.enemy;const finished=b.result!=='active';this.sound.setMode('battle',b.enemy);
 this.setMode('battle',battleTemplate(this.state,portrait));const panel=$('.battle-v2');if(warm)panel.classList.add('visuals-ready');else void this.prepareBattleVisuals(panel);
 if(finished)$('#battle-finish').onclick=()=>{
 const enemy=b.enemy,win=b.result==='won';if(!this.act({type:'leaveBattle'},true))return;
 if(win&&enemy==='bramble')this.story([{speaker:'トーマ',text:'命の恩人だ。俺の腕、お前さんに預けるよ。王都の工房にも寄ってくれ。いい剣を打ってやる。'}]);
 else if(win&&enemy==='demon')this.playEnding();
 else if(win&&BROTHERS.includes(enemy as Brother))this.story(reconciliation(this.state,enemy as Brother));
 else this.startBattle(enemy);
 };
 if(b.result==='lost')$('#battle-retreat').onclick=()=>{if(this.act({type:'leaveBattle'},true))this.close();};
 if(!finished) document.querySelectorAll<HTMLButtonElement>('[data-command]').forEach(button=>button.onclick=async()=>{
  if(this.guardCooldown)return;this.guardCooldown=true;document.querySelectorAll<HTMLButtonElement>('[data-command]').forEach(b=>b.disabled=true);
  this.battleCommandFocus=button.dataset.command!;const command=button.dataset.command as 'attack'|'guard'|'support'|'potion'|'resonate';
  try{if(this.act({type:'combat',command},true))await animateBattle($('#modal'),this.state.battle?.events??[],this.sound);}
  finally{this.guardCooldown=false;if(this.state.battle)this.battle();}
 });
 if(warm)this.focusBattleControl(panel);
 }
 private focusBattleControl(panel:HTMLElement){const selected=panel.querySelector<HTMLButtonElement>(`[data-command="${this.battleCommandFocus}"]:not([disabled])`);(selected??panel.querySelector<HTMLButtonElement>('button:not([disabled])'))?.focus({preventScroll:true});}
 private async prepareBattleVisuals(panel:HTMLElement){
  const controls=panel.querySelector<HTMLElement>('.battle-controls')!;controls.inert=true;panel.setAttribute('aria-busy','true');
  const loading=document.createElement('div');loading.className='battle-loading';loading.innerHTML='<span>✧</span><p>戦いの幕が、開く。</p>';panel.append(loading);
  try{
   const images=Array.from(panel.querySelectorAll<HTMLImageElement>('.fighter img'));const bg=new Image();bg.src=panel.querySelector<HTMLElement>('.battle-arena')!.style.backgroundImage.slice(5,-2);
   await Promise.all([...images.map(img=>img.decode()),bg.decode()]);
   if(!panel.isConnected)return;await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));panel.classList.add('visuals-ready');panel.setAttribute('aria-busy','false');controls.inert=false;loading.remove();this.focusBattleControl(panel);
  }catch{panel.setAttribute('aria-busy','false');loading.innerHTML='<p>戦いの絵を読み込めませんでした。</p><button class="gold-button">戦闘前の記録から再開する</button>';const recover=loading.querySelector('button')!;recover.onclick=()=>location.reload();recover.focus({preventScroll:true});}
 }
 private menu(mode:'journal'|'party'|'map'){
 if(this.mode===mode){this.close();return;}if(!['play','journal','party','map'].includes(this.mode)){this.toast('いまの会話や戦闘を終えてから開けます。');return;}
 if(mode==='map'){this.mapMenu();return;}
 const s=this.state,o=objective(s);
 const completed=[['bread','ノラへ黄金麦を届けた'],['medicine','ミラの薬づくりを手伝った'],['bramble','鍛冶師トーマを救った'],['promoted','王都の使節に任命された'],['awakened','第五の加護が目覚めた'],['ended','五人で魔王を倒した']];
 this.setMode(mode,`<section class="menu-panel"><div class="menu-heading"><div><span class="eyebrow">${mode==='journal'?'ADVENTURE JOURNAL':'OUR LITTLE COMPANY'}</span><h2>${mode==='journal'?'冒険手帳':'ともに歩く人々'}</h2></div><button data-close class="close-button" aria-label="メニューを閉じる">×</button></div>${mode==='journal'?`<div class="journal-objective"><span class="eyebrow">${o.chapter}</span><h3>${o.title}</h3><p>${o.hint}</p><div class="journey-progress"><i style="width:${o.progress}%"></i></div></div><details class="origin-recap"><summary>この冒険のはじまり</summary><p>${OPENING_RECAP.map(([,text])=>text).join(' ')}</p></details>${has(s,'ended')?'<section class="ending-memory"><h3 class="section-label">本編クリア・結末の記録</h3><p>魔王との決着、王都への帰還、五人の食卓を見返せます。</p><button id="replay-ending" class="outline-button">結末を読み返す</button></section>':''}${this.audioSettings()}${this.storyCatalogue()}<h3 class="section-label">これまでの約束</h3><ul class="quest-list">${completed.map(([f,text])=>`<li class="${has(s,f)?'complete':''}"><span>${has(s,f)?'✓':'◇'}</span>${f==='awakened'&&!has(s,'awakened')?'まだ見ぬ物語':text}</li>`).join('')}</ul><div class="inventory-line"><h3 class="section-label">かばんの中</h3>${(Object.keys(ITEMS) as Item[]).map(id=>`<span>${ITEMS[id].name} <b>×${s.inventory[id]}</b></span>`).join('')}<span>装備 <b>${s.weapon?'絆の剣':'旅立ちの剣'}</b></span></div><button id="return-title" class="outline-button">記録してタイトルへ</button>`:`<button id="camp-talk" class="gold-button">少し休んで、仲間と話す</button><p class="camp-note">旅の進み方で、話す内容が変わります。</p><div class="party-detail-list">${['lyca','nora','mira','toma',...BROTHERS].map(id=>{const known=id==='lyca'||s.party.includes(id as GameState['party'][number])||s.brothers.includes(id as Brother);const c=CHARACTERS[id];return `<article class="party-detail ${known?'':'unmet'}">${known?portrait(id):'<span class="empty-portrait">？</span>'}<div><small>${known?c.role:'まだ見ぬ道'}</small><h3>${known?c.name:'出会いは、これから。'}</h3><p>${known?c.description:'あなたの一歩が、物語をつなぐ。'}</p></div></article>`;}).join('')}</div>`}</section>`);
 $('#modal [data-close]').onclick=()=>this.close();
 $('#audio-enabled')?.addEventListener('change',()=>void this.toggleSound());
 for(const key of ['music','effects'] as const){const input=$<HTMLInputElement>('#'+key+'-volume');if(input)input.oninput=()=>{this.sound.setVolumes({[key]:Number(input.value)});$('#'+key+'-value').textContent=input.value+'%';};}
 $('#camp-talk')?.addEventListener('click',()=>{this.storyHeading='ひと休み';this.story(campConversation(this.state),()=>{this.close();this.menu('party');},'仲間の一覧へ');});
 document.querySelectorAll<HTMLButtonElement>('[data-focus-story]').forEach(b=>b.onclick=()=>{if(this.act({type:'focusStory',episode:b.dataset.focusStory as StoryEpisode})){this.close();this.guide();}});
 document.querySelectorAll<HTMLButtonElement>('[data-replay-story]').forEach(b=>b.onclick=()=>{this.storyHeading='旅の記録・読み返し';this.story(replayEpisode(this.state,b.dataset.replayStory as StoryEpisode),()=>{this.close();this.menu('journal');},'手帳へ戻る');});
 $('#replay-ending')?.addEventListener('click',()=>this.playEnding(true));
 if(mode==='journal')$('#return-title').onclick=()=>this.returnToTitle();
 }
 private mapMenu(){
 const m=createMap(this.state.zone);this.setMode('map',`<section class="menu-panel map-panel"><div class="menu-heading"><div><span class="eyebrow">ASTELIA · LOCAL MAP</span><h2>${m.name}</h2><p>訪ねたい場所を選ぶと、そこまで歩きます。</p></div><button data-close class="close-button" aria-label="地図を閉じる">×</button></div><div class="map-list">${m.points.filter(p=>!(p.id==='toma'&&!has(this.state,'bramble'))).map(p=>`<button data-destination="${p.id}"><span>${p.kind==='gate'?'➜':p.kind==='herb'?'✦':p.kind==='enemy'?'⚔':'◇'}</span><div><strong>${p.label}</strong><small>${p.kind==='gate'?'地域を移動':p.kind==='herb'?(has(this.state,'gather:'+p.id)?'採集済み':'薬草を採集'):'会いに行く'}</small></div><span>→</span></button>`).join('')}</div></section>`);
 $('#modal [data-close]').onclick=()=>this.close();m.points.forEach(p=>{const b=document.querySelector<HTMLButtonElement>(`[data-destination="${p.id}"]`);if(b)b.onclick=()=>{this.close();this.scene?.guide(p.id);};});
 }
 private playEnding(replay=false){
 this.endingPlayback=true;document.body.classList.add('is-ending-sequence');this.storyHeading=replay?'旅の記録・結末':'終章　名もなき加護';
 const pages=endingStory(this.state),town=pages.slice(6,9),supper=pages.slice(9),welcomeStage=town[0].stage!;
 const part=(text:DialoguePage[],offset:number,next:()=>void,finish:string)=>{this.endingLineOffset=offset;this.story(text,next,finish,true);};
 const serve=()=>this.showChoices('リュカ','町でもらった温かいパンを、五人の席へ。',[{id:'ending-serve',label:'五人の皿に、パンを配る',action:()=>part([supper[2]],13,()=>this.endingCredits(replay),'食卓を見届ける')}],'lyca',supper[0].stage);
 const table=()=>part(supper.slice(0,2),11,serve,'みんなのパンを配ろう');
 const reply=(together:boolean)=>part([{speaker:'ピピ',text:together?'うん、みんな！ 五人のぶん、ちゃんと包んであるよ。今度は、私から届ける番だね。':'おかえり、リュカ！ 今日は、受け取る方なんだね。まだ温かいよ。',heading:town[0].heading,stage:welcomeStage,cue:'welcome'},...town],7,table,'五人の食卓へ');
 const welcome=()=>part([{speaker:'ピピ',text:storyDone(this.state,'bread')?'おかえり！ 今日は私が、みんなのパンを届けたんだよ。リュカのぶんも、あるよ。':'王子さま、おかえりなさい！ 町のみんなから、お祝いのパンだよ。',heading:town[0].heading,stage:welcomeStage}],6,()=>this.showChoices('ピピ','パンの包みを持って、あなたの返事を待っている。',[{id:'ending-home',label:'「ただいま」と、パンを受け取る',action:()=>reply(false)},{id:'ending-together',label:'「みんなで帰ったよ」と伝える',action:()=>reply(true)}],'citizen1',welcomeStage),'ピピに、ただいまを返す');
 part(pages.slice(0,3),0,()=>part(pages.slice(3,6),3,welcome,'町のみんなのもとへ'),'五人で、王都へ帰る');
 }
 private endingCredits(replay:boolean){
 this.setMode('ending',`<section class="ending-credits" aria-label="五人の食卓とエンディングクレジット"><span class="eyebrow">第五王子と、名もなき加護</span><h2>ただいま。<small>今夜は、五人で。</small></h2><div class="ending-credit-list"><p><span>ドット絵・音楽</span>Pixel-Boy / AAA</p><p><span>書体</span>DotGothic16</p></div><p class="ending-thanks">最後まで遊んでくれて、ありがとう。</p><div class="ending-actions"><button id="ending-credits-finish" class="gold-button"><span class="command-cursor" aria-hidden="true">▶</span>${replay?'手帳へ戻る':'物語の幕を閉じる'} <span>→</span></button></div></section>`,true);
 $('#ending-credits-finish').onclick=()=>{if(replay){this.close();this.menu('journal');}else this.ending();};
 }
 private returnToTitle(){
 this.persist(false);this.endingPlayback=false;document.body.classList.remove('is-ending-sequence');this.restoreStoryStage();this.sessionActive=false;$('#modal').hidden=true;this.mode='title';this.renderTitle();this.renderHud();
 }
 private ending(){
 if(!has(this.state,'ending:seen')&&!this.act({type:'finishEnding'},true))return;
 this.persist(false);this.setMode('ending',`<section class="ending-panel"><div class="ending-stars">✦</div><span class="eyebrow">THE END · 本編クリア</span><h2>五人で、<br>帰ってきた。</h2><p>無加護と呼ばれた王子の物語は、<br>ここで幕を閉じます。</p><div class="ending-portraits">${[...BROTHERS,'lyca'].map(id=>portrait(id)).join('')}</div><div class="ending-stats"><span>仲間 <b>${this.state.party.length}人</b></span><span>王都の信頼 <b>${this.state.trust}</b></span><span>商いの利益 <b>${this.state.profit}G</b></span></div><div class="ending-actions"><button id="epilogue" class="gold-button"><span class="command-cursor" aria-hidden="true">▶</span>クリア後の王都を歩く <span>→</span></button><button id="ending-title" class="outline-button"><span class="command-cursor" aria-hidden="true">▶</span>記録してタイトルへ</button></div><small>この先の散策と、手帳からの読み返しは自由です。</small></section>`,true);
 $('#epilogue').onclick=()=>{this.close();this.toast('本編クリア。王都で自由に過ごせます。','good');};
 $('#ending-title').onclick=()=>this.returnToTitle();
 }
 private async share(){
 if(this.mode!=='play'){this.toast(this.mode==='title'?'冒険をはじめてから共有できます。':'いまの会話や戦闘を終えてから共有できます。');return;}
 if(['localhost','127.0.0.1'].includes(location.hostname)){this.showChoices('物語を共有','いまはこのパソコンで動くローカル版です。公開URLができると、X・LINE・端末の共有・リンクコピーを利用できます。',[{label:'冒険へ戻る',action:()=>this.close()}]);return;}
 const url=location.origin+location.pathname;this.showChoices('物語を共有','火も、水も、雷もない。僕には、あなたがいる。',[{label:'端末の共有シート',disabled:!navigator.share,action:()=>{navigator.share({title:'第五王子と、名もなき加護',url}).catch(()=>{});}},{label:'リンクをコピー',action:()=>{navigator.clipboard.writeText(url).then(()=>this.toast('リンクをコピーしました。')).catch(()=>this.toast('リンクをコピーできませんでした。アドレスバーからコピーできます。','bad'));}},{label:'Xで共有',action:()=>{window.open('https://x.com/intent/post?text='+encodeURIComponent('第五王子と、名もなき加護')+'&url='+encodeURIComponent(url),'_blank','noopener,noreferrer');}},{label:'LINEで共有',action:()=>{window.open('https://social-plugins.line.me/lineit/share?url='+encodeURIComponent(url),'_blank','noopener,noreferrer');}},{label:'閉じる',secondary:true,action:()=>this.close()}]);
 }
}
