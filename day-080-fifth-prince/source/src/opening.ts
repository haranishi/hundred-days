import { OPENING, OPENING_RECAP, type OpeningBeat } from './opening-script';
type Portrait=(id:string,cls?:string)=>string;
interface Hooks {frame:(beat:OpeningBeat)=>void;finish:()=>void;cancel:()=>void;toggleSound:()=>Promise<boolean>;muted:()=>boolean}
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export class OpeningDirector {
 private index=0;private revealed=false;private auto=false;private summary=false;private disposed=false;private revealTimer:number|undefined;private autoTimer:number|undefined;
 private query=<T extends HTMLElement=HTMLElement>(s:string)=>this.root.querySelector<T>(s)!;
 constructor(private root:HTMLElement,private portrait:Portrait,private hooks:Hooks,private replay=false){
  root.innerHTML=`<section class="opening-panel" aria-label="序章：灯らない第五の星"><header class="opening-header"><div><span>序章</span><strong id="opening-place"></strong></div><div class="opening-tools"><button data-opening="sound" aria-label="音楽を切り替える"></button><button data-opening="auto" aria-pressed="false">自動送り OFF</button><button data-opening="skip">あらすじへ</button><button data-opening="cancel">タイトルへ</button></div></header><div class="opening-heading"><span>第五王子と、名もなき加護</span><h1 id="opening-heading"></h1></div><div class="opening-dialogue"><div class="opening-speaker"><span id="opening-portrait"></span><div><span id="opening-position"></span><h2 id="opening-speaker"></h2></div></div><p id="opening-text" class="opening-text" aria-live="polite"><span class="sr-only" id="opening-full"></span><span aria-hidden="true" id="opening-visible"></span></p><div class="opening-controls"><span class="opening-keyhint">Enter / E でつぎへ</span><button data-opening="back">← ひとつ前</button><button data-opening="next" data-next class="pixel-primary">つぎへ ▶</button></div><div class="opening-progress" aria-hidden="true">${OPENING.map(()=>'<i></i>').join('')}</div></div><section class="opening-recap" hidden aria-label="物語のはじまりと最初の約束"><span class="opening-recap-label">第一章　銀貨60枚の旅立ち</span><h2>最初の約束を、あなたの手で。</h2><dl>${OPENING_RECAP.map(([q,a])=>`<div><dt>${q}</dt><dd>${a}</dd></div>`).join('')}</dl><div class="opening-errand">${portrait('merchant') }<span>オルンから<br><b>黄金麦 1つ・8G</b></span><span class="errand-arrow">→</span>${portrait('nora')}<span>ノラに届ける<br><b>旅立ちの所持金 60G</b></span></div>${replay?'<p class="opening-note">序章の再生です。冒険の記録は変わりません。</p>':''}<div class="opening-recap-actions"><button data-opening="resume">序章に戻る</button><button id="opening-begin" data-opening="finish" class="pixel-primary">${replay?'タイトルへ戻る':'市場へ踏み出す'} ▶</button></div></section></section>`;
  root.onclick=e=>{const b=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-opening]');if(b&&!b.disabled)this.action(b.dataset.opening!);};
  document.addEventListener('visibilitychange',this.visibility);this.syncSound();this.show();requestAnimationFrame(()=>{if(!this.disposed)this.query('[data-opening="next"]').focus({preventScroll:true});});
 }
 private action(action:string){
  if(this.disposed)return;
  if(action==='next')this.next();else if(action==='back')this.back();else if(action==='skip')this.showSummary();else if(action==='resume'){this.summary=false;delete this.root.dataset.summary;this.query('.opening-recap').hidden=true;this.query('.opening-dialogue').hidden=false;this.show(true);}else if(action==='finish'){this.dispose();this.hooks.finish();}else if(action==='cancel'){this.dispose();this.hooks.cancel();}else if(action==='sound'){void this.hooks.toggleSound().then(()=>{if(!this.disposed)this.syncSound();});}else if(action==='auto'){this.auto=!this.auto;this.syncAuto();if(this.auto&&this.revealed)this.scheduleAuto();else this.clearAuto();}
 }
 private syncSound(){this.query('[data-opening="sound"]').textContent=this.hooks.muted()?'♪ 音 OFF':'♪ 音 ON';}
 private syncAuto(){const b=this.query('[data-opening="auto"]');b.textContent=this.auto?'自動送り ON':'自動送り OFF';b.setAttribute('aria-pressed',String(this.auto));}
 private clearAuto(){if(this.autoTimer!==undefined)clearTimeout(this.autoTimer);this.autoTimer=undefined;}
 private clearTimers(){if(this.revealTimer!==undefined)clearTimeout(this.revealTimer);this.revealTimer=undefined;this.clearAuto();}
 private visibility=()=>{this.clearAuto();if(!document.hidden&&this.auto&&this.revealed)this.scheduleAuto();};
 private scheduleAuto(){this.clearAuto();if(!this.auto||this.summary||document.hidden||this.disposed)return;this.autoTimer=window.setTimeout(()=>this.next(),2200+OPENING[this.index].text.length*45);}
 private show(instant=false){
  this.clearTimers();const beat=OPENING[this.index];this.root.dataset.beat=beat.id;this.root.dataset.scene=beat.scene;this.hooks.frame(beat);
  this.query('#opening-place').textContent=beat.place;this.query('#opening-heading').textContent=beat.heading;this.query('#opening-position').textContent=`${this.index+1} / ${OPENING.length}`;this.query('#opening-speaker').textContent=beat.speaker;this.query('#opening-portrait').innerHTML=beat.character?this.portrait(beat.character,'opening-face'):'<span class="opening-narrator">◇</span>';
  this.query('#opening-full').textContent=beat.text;this.query('#opening-visible').textContent='';this.query<HTMLButtonElement>('[data-opening="back"]').disabled=this.index===0;this.root.querySelectorAll('.opening-progress i').forEach((e,i)=>e.classList.toggle('read',i<=this.index));this.revealed=false;this.root.dataset.lineReady='false';
  if(instant||matchMedia('(prefers-reduced-motion: reduce)').matches){this.completeLine();return;}
  const chars=Array.from(beat.text);let n=0;const tick=()=>{if(this.disposed||this.summary)return;this.query('#opening-visible').textContent=chars.slice(0,++n).join('');if(n<chars.length)this.revealTimer=window.setTimeout(tick,22);else this.completeLine();};tick();
 }
 private completeLine(){if(this.revealTimer!==undefined)clearTimeout(this.revealTimer);this.revealTimer=undefined;this.query('#opening-visible').textContent=OPENING[this.index].text;this.revealed=true;this.root.dataset.lineReady='true';this.scheduleAuto();}
 private next(){if(this.summary||this.disposed)return;if(!this.revealed){this.completeLine();return;}if(this.index<OPENING.length-1){this.index++;this.show();}else this.showSummary();}
 private back(){if(this.disposed||this.summary||this.index===0)return;this.index--;this.show(true);}
 private showSummary(){if(this.disposed)return;this.clearTimers();this.auto=false;this.syncAuto();this.summary=true;this.query('.opening-dialogue').hidden=true;this.query('.opening-recap').hidden=false;this.root.dataset.summary='true';this.query('#opening-begin').focus({preventScroll:true});}
 handleKey(e:KeyboardEvent){
  if(e.ctrlKey||e.metaKey||e.altKey||e.code==='Tab')return;
  const focused=(e.target as HTMLElement).closest('button');if(['Enter','Space'].includes(e.code)&&focused&&focused.getAttribute('data-opening')!=='next')return;
  if(['Enter','Space','KeyE','ArrowRight'].includes(e.code)){e.preventDefault();if(!e.repeat)this.next();}else if(e.code==='ArrowLeft'){e.preventDefault();if(!e.repeat)this.back();}else if(e.code==='Escape'){e.preventDefault();if(!e.repeat)this.showSummary();}
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.clearTimers();this.root.onclick=null;document.removeEventListener('visibilitychange',this.visibility);}
}
