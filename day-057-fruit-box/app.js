import {FRUITS,SCORES,TOP,clampAim,canConsumePair,mergeOutcome,advanceDanger} from "./lib/rules.mjs";
import {createAudio} from "./lib/audio.mjs";

(function(){
'use strict';
var $=function(s){return document.querySelector(s);};
if(!window.Matter){ $('#hint').textContent='物理エンジンを読み込めませんでした。再読み込みしてください。'; return; }
var Engine=Matter.Engine, Composite=Matter.Composite, Bodies=Matter.Bodies,
    Body=Matter.Body, Events=Matter.Events, Sleeping=Matter.Sleeping;

/* ── 世界の寸法（論理座標。表示だけ縮小して合わせる）──────── */
var W=420, H=700, WALL=14;
var LEFT=WALL, RIGHT=W-WALL, FLOOR=H-16;
var DANGER=132, SPAWN_Y=72, TAU=Math.PI*2;
var REDUCED=matchMedia('(prefers-reduced-motion:reduce)').matches;



/* ── 果物スプライト（一度描いて使い回す）──────────────── */
var SS=2.5, sprites=[];
function pad(r){ return Math.max(7,r*0.36); }

function stem(c,r,len,lean){
  c.strokeStyle='#6B4A22'; c.lineWidth=Math.max(1.6,r*0.09); c.lineCap='round';
  c.beginPath(); c.moveTo(0,-r*0.9);
  c.quadraticCurveTo(lean*r*0.3,-r*(0.9+len*0.6),lean*r*0.55,-r*(0.9+len));
  c.stroke();
}
function leaf(c,x,y,w,h,rot,col){
  c.save(); c.translate(x,y); c.rotate(rot);
  c.fillStyle=col; c.beginPath(); c.ellipse(0,0,w,h,0,0,TAU); c.fill();
  c.restore();
}
/* phase 'in' = 円の内側の模様（クリップされる） / 'out' = 枝や葉（はみ出してよい） */
function detail(c,f,r,phase){
  var k=f.k, i;
  c.save();
  if(k==='blueberry'){
    if(phase==='in'){
      c.fillStyle='#334482'; c.beginPath();
      for(var j=0;j<10;j++) {var a=j*Math.PI/5-Math.PI/2,rr=r*(j%2?.17:.35);c.lineTo(Math.cos(a)*rr,Math.sin(a)*rr-r*.2);} c.closePath();c.fill();
    }
  }else if(k==='plum'){
    if(phase==='in'){c.strokeStyle='rgba(255,224,229,.35)';c.lineWidth=r*.045;c.beginPath();c.moveTo(0,-r*.88);c.quadraticCurveTo(-r*.16,0,0,r*.88);c.stroke();}
    else {stem(c,r,.24,.1);leaf(c,r*.32,-r*.95,r*.28,r*.1,-.5,'#72A45A');}
  }else if(k==='mandarin'){
    if(phase==='in'){c.fillStyle='rgba(158,89,21,.24)';for(i=0;i<24;i++){var aa=i*2.4,rr=r*(.2+.65*((i*7%13)/13));c.beginPath();c.arc(Math.cos(aa)*rr,Math.sin(aa)*rr,r*.025,0,TAU);c.fill();}}
    else {leaf(c,r*.23,-r*.98,r*.25,r*.09,-.4,'#5C9344');stem(c,r,.12,0);}
  }else if(k==='kiwi'){
    if(phase==='in'){
      c.fillStyle='#DFEAAF';c.beginPath();c.ellipse(0,0,r*.23,r*.38,0,0,TAU);c.fill();
      c.fillStyle='#31462B';for(i=0;i<15;i++){var a=i*TAU/15;c.beginPath();c.ellipse(Math.cos(a)*r*.48,Math.sin(a)*r*.48,r*.033,r*.065,a,0,TAU);c.fill();}
      c.strokeStyle='#896F44';c.lineWidth=r*.09;c.beginPath();c.arc(0,0,r*.93,0,TAU);c.stroke();
    }
  }else if(k==='cherry'){
    if(phase==='out'){ stem(c,r,0.8,0.75); leaf(c,r*0.46,-r*1.42,r*0.30,r*0.13,-0.35,'#5FA344'); }
  }else if(k==='apple'){
    if(phase==='in'){
      c.fillStyle='rgba(255,255,255,.15)';
      c.beginPath(); c.ellipse(-r*0.44,-r*0.06,r*0.15,r*0.42,-0.2,0,TAU); c.fill();
    }else{ leaf(c,r*0.40,-r*1.12,r*0.30,r*0.14,-0.55,'#63A845'); stem(c,r,0.34,0.1); }
  }else if(k==='peach'){
    if(phase==='in'){
      c.strokeStyle='rgba(190,90,120,.45)'; c.lineWidth=Math.max(1.2,r*0.045);
      c.beginPath(); c.moveTo(r*0.02,-r*0.98); c.quadraticCurveTo(-r*0.24,0,r*0.02,r*0.98); c.stroke();
    }else leaf(c,r*0.46,-r*1.02,r*0.32,r*0.15,-0.6,'#6FAF4E');
  }else if(k==='pineapple'){
    if(phase==='in'){
      c.strokeStyle='rgba(150,95,10,.38)'; c.lineWidth=Math.max(1,r*0.035);
      for(i=-4;i<=4;i++){
        c.beginPath(); c.moveTo(-r,i*r*0.30-r*0.55); c.lineTo(r,i*r*0.30+r*0.55); c.stroke();
        c.beginPath(); c.moveTo(-r,-i*r*0.30+r*0.55); c.lineTo(r,-i*r*0.30-r*0.55); c.stroke();
      }
    }else{
      for(i=-2;i<=2;i++){
        c.save(); c.rotate(i*0.30);
        c.fillStyle=i===0?'#5CA84A':'#48903D';
        c.beginPath(); c.moveTo(-r*0.12,-r*0.80); c.lineTo(0,-r*1.40); c.lineTo(r*0.12,-r*0.80); c.closePath(); c.fill();
        c.restore();
      }
    }
  }else if(k==='melon'){
    if(phase==='in'){
      c.strokeStyle='rgba(255,255,255,.45)'; c.lineWidth=Math.max(1,r*0.038); c.lineCap='round';
      var net=[[-.72,-.38,.10,-.78,.74,-.34],[-.80,.04,-.06,-.14,.80,.10],[-.64,.50,.04,.24,.70,.52],[-.30,-.86,-.22,0,-.36,.82],[.34,-.84,.26,.02,.42,.78]];
      for(i=0;i<net.length;i++){
        var v=net[i]; c.beginPath(); c.moveTo(v[0]*r,v[1]*r); c.quadraticCurveTo(v[2]*r,v[3]*r,v[4]*r,v[5]*r); c.stroke();
      }
    }else stem(c,r,0.20,0);
  }else if(k==='watermelon'){
    if(phase==='in'){
      c.fillStyle='rgba(9,45,22,.72)';
      for(i=-2;i<=2;i++){
        c.save(); c.rotate(i*0.42);
        c.beginPath(); c.moveTo(-r*0.09,-r*1.05); c.quadraticCurveTo(r*0.15,0,-r*0.09,r*1.05);
        c.quadraticCurveTo(-r*0.32,0,-r*0.09,-r*1.05); c.fill(); c.restore();
      }
    }else stem(c,r,0.16,-0.3);
  }
  c.restore();
}
function buildSprite(i){
  var f=FRUITS[i], r=f.r, p=pad(r), size=Math.ceil((r+p)*2*SS);
  var cvs=document.createElement('canvas'); cvs.width=cvs.height=size;
  var c=cvs.getContext('2d');
  c.setTransform(SS,0,0,SS,(r+p)*SS,(r+p)*SS);
  detail(c,f,r,'out');                         /* 枝葉は本体の後ろに */
  var g=c.createRadialGradient(-r*0.34,-r*0.38,r*0.08,0,0,r*1.08);
  g.addColorStop(0,f.l); g.addColorStop(.52,f.c); g.addColorStop(1,f.d);
  c.beginPath(); c.arc(0,0,r,0,TAU); c.fillStyle=g; c.fill();
  c.save(); c.beginPath(); c.arc(0,0,r,0,TAU); c.clip();
  detail(c,f,r,'in');
  c.fillStyle='rgba(255,255,255,.26)';
  c.beginPath(); c.ellipse(-r*0.36,-r*0.44,r*0.26,r*0.15,-0.65,0,TAU); c.fill();
  c.restore();
  c.beginPath(); c.arc(0,0,r,0,TAU);
  c.strokeStyle='rgba(20,10,0,.22)'; c.lineWidth=Math.max(1,r*0.05); c.stroke();

  return {cv:cvs,half:r+p};
}
for(var si=0;si<FRUITS.length;si++) sprites.push(buildSprite(si));

/* ── 物理 ─────────────────────────────────────────────── */
var engine=Engine.create();
engine.gravity.y=1.05;
engine.enableSleeping=true;
engine.positionIterations=8;
engine.velocityIterations=6;
var world=engine.world;
var st={isStatic:true,friction:.5,restitution:.05};
Composite.add(world,[
  Bodies.rectangle(LEFT/2,H/2,WALL,H*2,st),
  Bodies.rectangle(RIGHT+WALL/2,H/2,WALL,H*2,st),
  Bodies.rectangle(W/2,FLOOR+18,W,36,st)
]);

/* ── 状態 ─────────────────────────────────────────────── */
var fruits=[], parts=[], pops=[], mergeQ=[];
var score=0, best=0, bestAtStart=0, seen={}, maxLv=0;
var held=0, nextLv=0, canDrop=true, dropAt=0, aimX=W/2;
var over=false, paused=false, heat=0, shakeAmt=0, tPrev=0, acc=0, elapsed=0, started=false;

var cv=$('#cv'), ctx=cv.getContext('2d'), frame=$('#frame'), board=$('#board');
var elScore=$('#score'), elBest=$('#best'), elHint=$('#hint'), veil=$('#veil');
var nextCv=$('#nextcv'), nextCtx=nextCv.getContext('2d'), nextName=$('#nextname');
var chainEl=$('#chain'), chainItems=[], viewScale=1;

for(var ci=0;ci<FRUITS.length;ci++){
  var li=document.createElement('li');
  li.style.setProperty('--c',FRUITS[ci].c);
  li.title=FRUITS[ci].n; li.setAttribute('aria-label',FRUITS[ci].n);
  var icon=document.createElement('img');icon.src=sprites[ci].cv.toDataURL('image/png');icon.alt='';li.append(icon);
  chainEl.appendChild(li); chainItems.push(li);
}

/* ── 音（合成のみ。音声ファイルは持たない）────────────── */
var sfx=createAudio();

/* ── 表示合わせ ───────────────────────────────────────── */
function fit(){
  var b=board.getBoundingClientRect();
  if(b.width<10||b.height<10) return;
  var s=Math.min(b.width/W,b.height/H);
  var cw=Math.max(1,Math.floor(W*s)), ch=Math.max(1,Math.floor(H*s));
  frame.style.width=cw+'px'; frame.style.height=ch+'px';
  var dpr=Math.min(window.devicePixelRatio||1,2);
  cv.width=Math.round(cw*dpr); cv.height=Math.round(ch*dpr);
  viewScale=cw/W*dpr;
}
new ResizeObserver(fit).observe(board);
addEventListener('resize',fit);

/* ── 木箱の下地 ───────────────────────────────────────── */
var crate=(function(){
  var o=document.createElement('canvas'), S=2;
  o.width=W*S; o.height=H*S;
  var c=o.getContext('2d'); c.setTransform(S,0,0,S,0,0);
  var seed=7; function rnd(){ seed=(seed*1103515245+12345)&0x7fffffff; return seed/0x7fffffff; }
  var inner=c.createLinearGradient(0,0,0,FLOOR);
  inner.addColorStop(0,'#2B2040'); inner.addColorStop(.55,'#1D1530'); inner.addColorStop(1,'#140E1F');
  c.fillStyle=inner; c.fillRect(LEFT,0,RIGHT-LEFT,FLOOR);
  var glow=c.createRadialGradient(W/2,24,8,W/2,24,W*1.05);          /* 提灯の光が上から差す */
  glow.addColorStop(0,'rgba(255,196,110,.22)'); glow.addColorStop(1,'rgba(255,196,110,0)');
  c.fillStyle=glow; c.fillRect(LEFT,0,RIGHT-LEFT,FLOOR);
  var pool=c.createRadialGradient(W/2,FLOOR,4,W/2,FLOOR,W*0.66);    /* 床に落ちる光だまり */
  pool.addColorStop(0,'rgba(255,190,110,.13)'); pool.addColorStop(1,'rgba(255,190,110,0)');
  c.fillStyle=pool; c.fillRect(LEFT,0,RIGHT-LEFT,FLOOR);
  var vig=c.createRadialGradient(W/2,FLOOR*0.5,W*0.22,W/2,FLOOR*0.5,W*0.80);
  vig.addColorStop(0,'rgba(0,0,0,0)'); vig.addColorStop(1,'rgba(0,0,0,.42)');
  c.fillStyle=vig; c.fillRect(LEFT,0,RIGHT-LEFT,FLOOR);
  function plank(x,y,w,h,vertical){
    var g=vertical?c.createLinearGradient(x,0,x+w,0):c.createLinearGradient(0,y,0,y+h);
    g.addColorStop(0,'#8A5A2C'); g.addColorStop(.35,'#A46F3A'); g.addColorStop(.72,'#7A4C24'); g.addColorStop(1,'#5C3717');
    c.fillStyle=g; c.fillRect(x,y,w,h);
    c.strokeStyle='rgba(50,28,10,.26)'; c.lineWidth=.7;
    var n=Math.round((vertical?h:w)/34);
    for(var i=0;i<n;i++){
      c.beginPath();
      if(vertical){ var yy=y+rnd()*h; c.moveTo(x+1,yy); c.bezierCurveTo(x+w*.4,yy+rnd()*4-2,x+w*.6,yy+rnd()*4-2,x+w-1,yy+rnd()*5-2.5); }
      else{ var xx=x+rnd()*w; c.moveTo(xx,y+1); c.bezierCurveTo(xx+rnd()*4-2,y+h*.4,xx+rnd()*4-2,y+h*.6,xx+rnd()*5-2.5,y+h-1); }
      c.stroke();
    }
  }
  plank(0,0,WALL,FLOOR+16,true);
  plank(RIGHT,0,WALL,FLOOR+16,true);
  plank(0,FLOOR,W,H-FLOOR,false);
  c.fillStyle='rgba(255,214,160,.5)'; c.fillRect(0,0,WALL,3); c.fillRect(RIGHT,0,WALL,3);
  c.fillStyle='rgba(255,214,160,.14)'; c.fillRect(WALL-2,0,2,FLOOR); c.fillRect(RIGHT,0,2,FLOOR); c.fillRect(LEFT,FLOOR,RIGHT-LEFT,2);
  c.fillStyle='rgba(0,0,0,.26)'; c.fillRect(LEFT,0,7,FLOOR); c.fillRect(RIGHT-7,0,7,FLOOR);
  return o;
})();

/* ── 進行 ─────────────────────────────────────────────── */
try{ best=parseInt(localStorage.getItem('fruit-box.best')||'0',10)||0; }catch(e){}
if(!Number.isFinite(best)||best<0) best=0;
bestAtStart=best;
elBest.textContent=best;

function pickLv(){ return Math.floor(Math.random()*5); }
function markSeen(lv){
  if(seen[lv]) return;
  seen[lv]=1;
  var el=chainItems[lv];
  el.classList.add('on','pop');
  setTimeout(function(){ el.classList.remove('pop'); },260);
  if(lv>maxLv) maxLv=lv;$('#goal').textContent=maxLv===TOP?'スイカ、できた！もう1つ合わせよう':'最高到達 '+FRUITS[maxLv].n+' · スイカを目指そう';
}
function spawn(lv,x,y,popIn){
  var b=Bodies.circle(x,y,FRUITS[lv].r,{
    restitution:.14, friction:.42, frictionStatic:.7, frictionAir:.002,
    density:.0013, slop:.02, label:'fruit'
  });
  b.plugin={lv:lv,dead:false,landed:false,over:0,popT:popIn?0:null,born:elapsed};
  Composite.add(world,b); fruits.push(b); frame.dataset.fruits=String(fruits.length);
  markSeen(lv);
  return b;
}
function drop(){
  if(over||paused||!canDrop) return;
  var r=FRUITS[held].r;
  var b=spawn(held,clampAim(aimX,r),SPAWN_Y,false);
  Body.setVelocity(b,{x:0,y:2.4});
  canDrop=false; dropAt=elapsed;
  held=nextLv; nextLv=pickLv(); paintNext();
  sfx.drop();
  if(!started){ started=true; elHint.classList.add('gone'); }
}
function addScore(v,x,y){
  score+=v; elScore.textContent=score; pops.push({x:x,y:y,v:'+'+v,t:0});
  if(score>best){best=score;elBest.textContent=best;try{localStorage.setItem('fruit-box.best',String(best));}catch(e){}}
}
function burst(x,y,col,n){
  if(REDUCED) n=Math.min(n,6);
  for(var i=0;i<n;i++){
    var a=Math.random()*TAU, sp=1.2+Math.random()*3.4;
    parts.push({x:x,y:y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-1,r:1.6+Math.random()*3.4,t:0,life:380+Math.random()*320,c:col});
  }
}
function shake(v){ if(!REDUCED) shakeAmt=Math.min(14,shakeAmt+v); }

Events.on(engine,'collisionStart',function(ev){
  for(var i=0;i<ev.pairs.length;i++){
    var a=ev.pairs[i].bodyA, b=ev.pairs[i].bodyB;
    var pa=a.plugin, pb=b.plugin;
    if(pa&&pa.lv!=null) pa.landed=true;
    if(pb&&pb.lv!=null) pb.landed=true;
    if(!pa||!pb||pa.lv==null||pb.lv==null) continue;
    if(!canConsumePair(pa,pb)) continue;
    pa.dead=pb.dead=true;
    mergeQ.push([a,b]);
  }
});
function removeBody(b){
  Composite.remove(world,b);
  var i=fruits.indexOf(b); if(i>=0) fruits.splice(i,1); frame.dataset.fruits=String(fruits.length);
}
function runMerges(){
  if(!mergeQ.length) return;
  for(var i=0;i<mergeQ.length;i++){
    var a=mergeQ[i][0], b=mergeQ[i][1], lv=a.plugin.lv;
    var x=(a.position.x+b.position.x)/2, y=(a.position.y+b.position.y)/2;
    var vx=(a.velocity.x+b.velocity.x)/2, vy=(a.velocity.y+b.velocity.y)/2;
    removeBody(a); removeBody(b);
    var outcome=mergeOutcome(lv);
    if(outcome.level===null){
      addScore(outcome.score,x,y);
      burst(x,y,FRUITS[TOP].l,40); burst(x,y,'#FF6A5A',20); shake(11); sfx.big();
    }else{
      var nb=spawn(outcome.level,x,y,true);
      Body.setVelocity(nb,{x:vx*.5,y:vy*.5-1.4});
      addScore(outcome.score,x,y);
      burst(x,y,FRUITS[lv+1].l,10+lv*3); shake(1.6+lv*.75); sfx.merge(lv+1);
    }
  }
  mergeQ.length=0;
  for(var j=0;j<fruits.length;j++) Sleeping.set(fruits[j],false);
}
function checkOver(dt){
  var h=0;
  for(var i=0;i<fruits.length;i++){
    var p=fruits[i].plugin;
    p.over=advanceDanger({landed:p.landed,age:elapsed-p.born,top:fruits[i].position.y-fruits[i].circleRadius,previous:p.over},dt);
    if(p.over>=1700 && !over) gameOver();
    if(p.over>h) h=p.over;
  }
  heat=Math.min(1,h/1700);
}
function gameOver(){
  over=true; heat=1; pressing=false; sfx.setActive(false); sfx.over(); shake(8); frame.dataset.state='over';
  var rec=score>bestAtStart;
  if(rec){ best=score; try{ localStorage.setItem('fruit-box.best',String(best)); }catch(e){} }
  $('#fbadge').hidden=!rec;
  elBest.textContent=best;
  $('#fscore').textContent=score;
  $('#fmeta').textContent='ベスト '+best+'点 ／ 最高到達 '+FRUITS[maxLv].n;
  buildShare();setBackgroundInert(true);
  veil.hidden=false;
  $('#notice').textContent='箱の線を越えたまま積み上がったので終了。'+score+'点です。';
  setTimeout(function(){ try{ $('#btn-again').focus({preventScroll:true}); }catch(e){} },60);
}
function restart(){
  for(var i=fruits.length-1;i>=0;i--) Composite.remove(world,fruits[i]);
  fruits.length=0; parts.length=0; pops.length=0; mergeQ.length=0;
  score=0; elScore.textContent='0'; seen={}; maxLv=0;$('#goal').textContent='スイカを目指そう';
  for(var j=0;j<chainItems.length;j++) chainItems[j].classList.remove('on');
  over=false; paused=false; heat=0; shakeAmt=0; canDrop=true; started=false;
  acc=0; tPrev=0; elapsed=0; pressing=false; activePointer=null; armed=0; bestAtStart=best; aimX=W/2;
  btnRestart.classList.remove('arm');btnRestart.setAttribute('aria-label','やり直す');
  elHint.textContent='左右に動かして、離すと落ちる';
  frame.dataset.fruits='0';frame.dataset.state='playing';$('#pause-veil').hidden=true;setBackgroundInert(false);paintPause();
  $('#notice').textContent='新しい箱で、もう一度。';sfx.setActive(true);
  elHint.classList.remove('gone');
  held=pickLv(); nextLv=pickLv(); paintNext();
  veil.hidden=true;
}
function paintNext(){
  var s=sprites[nextLv], size=nextCv.width, d=size*0.92;
  nextCtx.clearRect(0,0,size,size);
  nextCtx.drawImage(s.cv,(size-d)/2,(size-d)/2,d,d);
  nextName.textContent=FRUITS[nextLv].n;
}

/* ── 描画 ─────────────────────────────────────────────── */
function drawBody(b){
  var p=b.plugin, s=sprites[p.lv], sc=1;
  if(p.popT!==null){
    var t=Math.min(1,p.popT/210), c1=1.70158, c3=c1+1;
    sc=.55+.45*(1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2));
    if(t>=1) p.popT=null;
  }
  var half=s.half*sc;
  ctx.save();
  ctx.translate(b.position.x,b.position.y);
  ctx.rotate(b.angle);
  ctx.drawImage(s.cv,-half,-half,half*2,half*2);
  ctx.restore();
}
function render(){
  ctx.setTransform(viewScale,0,0,viewScale,0,0);
  ctx.clearRect(0,0,W,H);
  ctx.save();
  if(shakeAmt>.1) ctx.translate((Math.random()-.5)*shakeAmt,(Math.random()-.5)*shakeAmt);

  ctx.drawImage(crate,0,0,W,H);

  var warn=heat>.02;
  if(warn){ ctx.fillStyle='rgba(226,86,74,'+(0.11*heat)+')'; ctx.fillRect(LEFT,0,RIGHT-LEFT,DANGER); }
  ctx.save();
  ctx.setLineDash([9,8]);
  ctx.lineWidth=warn?1.4+heat*2.2:1.4;
  ctx.strokeStyle=warn?'rgba(226,86,74,'+(0.4+0.6*heat)+')':'rgba(240,232,215,.20)';
  ctx.beginPath(); ctx.moveTo(LEFT,DANGER); ctx.lineTo(RIGHT,DANGER); ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.font='700 10px "Zen Maru Gothic",system-ui,sans-serif';
  ctx.textAlign='left';
  ctx.globalAlpha=started?.30:.85;
  ctx.fillStyle='#F0E8D7';
  ctx.fillText('ここを越えたらおしまい',LEFT+8,DANGER-8);
  ctx.restore();
  if(heat>0.34&&!over){
    ctx.globalAlpha=Math.min(1,(heat-0.34)/0.3)*(0.6+0.4*Math.sin(elapsed/110));
    ctx.font='700 13px "Zen Maru Gothic",system-ui,sans-serif';
    ctx.textAlign='right'; ctx.fillStyle='#E2564A';
    ctx.fillText('あぶない',RIGHT-8,DANGER-9);
    ctx.globalAlpha=1;
  }

  if(!over){
    var r=FRUITS[held].r, x=clampAim(aimX,r);
    ctx.save();
    ctx.setLineDash([4,9]);
    ctx.strokeStyle='rgba(245,166,35,'+(canDrop?.42:.16)+')';
    ctx.lineWidth=1.6;
    ctx.beginPath(); ctx.moveTo(x,SPAWN_Y+r+6); ctx.lineTo(x,FLOOR-2); ctx.stroke();
    ctx.restore();
    ctx.fillStyle='rgba(245,166,35,'+(canDrop?.18:.07)+')';
    ctx.beginPath(); ctx.ellipse(x,FLOOR-3,r*.72,4.5,0,0,TAU); ctx.fill();
  }

  for(var i=0;i<fruits.length;i++) drawBody(fruits[i]);

  for(var j=0;j<parts.length;j++){
    var p=parts[j], k=1-p.t/p.life;
    ctx.globalAlpha=Math.max(0,k); ctx.fillStyle=p.c;
    ctx.beginPath(); ctx.arc(p.x,p.y,p.r*(0.4+k*0.8),0,TAU); ctx.fill();
  }
  ctx.globalAlpha=1;

  if(!over){
    var r2=FRUITS[held].r, x2=clampAim(aimX,r2);
    var s2=sprites[held], half=s2.half*(canDrop?1:.86);
    ctx.globalAlpha=canDrop?1:.5;
    ctx.drawImage(s2.cv,x2-half,SPAWN_Y+Math.sin(elapsed/380)*2.6-half,half*2,half*2);
    ctx.globalAlpha=1;
  }

  ctx.textAlign='center';
  for(var m=0;m<pops.length;m++){
    var q=pops[m], kk=1-q.t/900, dy=(1-kk)*36;
    ctx.globalAlpha=Math.max(0,Math.min(1,kk*1.6));
    ctx.font='700 '+(15+(1-kk)*5)+'px "Zen Maru Gothic",system-ui,sans-serif';
    ctx.lineWidth=3; ctx.strokeStyle='rgba(9,14,32,.75)';
    ctx.strokeText(q.v,q.x,q.y-dy);
    ctx.fillStyle='#FFD37A';
    ctx.fillText(q.v,q.x,q.y-dy);
  }
  ctx.globalAlpha=1;
  ctx.restore();
}

/* ── ループ ───────────────────────────────────────────── */
function step(dt){
  elapsed+=dt;
  if(!over){
    acc+=dt;
    var guard=0;
    while(acc>=16.666&&guard<5){ Engine.update(engine,16.666); acc-=16.666; guard++; }
    if(acc>60) acc=0;
    runMerges();
    checkOver(dt);
    if(!canDrop&&elapsed-dropAt>430) canDrop=true;
  }
  for(var i=fruits.length-1;i>=0;i--){
    var b=fruits[i];
    if(b.plugin.popT!==null) b.plugin.popT+=dt;
    if(b.position.y>H+240||b.position.x<-200||b.position.x>W+200) removeBody(b);
  }
  for(var j=parts.length-1;j>=0;j--){
    var p=parts[j];
    p.t+=dt; p.vy+=dt*0.022; p.x+=p.vx*dt/16.6; p.y+=p.vy*dt/16.6;
    if(p.t>=p.life) parts.splice(j,1);
  }
  for(var m=pops.length-1;m>=0;m--){ pops[m].t+=dt; if(pops[m].t>900) pops.splice(m,1); }
  shakeAmt*=Math.pow(.86,dt/16.6);
}
function loop(t){
  var dt=tPrev?Math.min(50,t-tPrev):16.6; tPrev=t;
  if(!paused && !document.hidden) step(dt); render();
  requestAnimationFrame(loop);
}

/* ── 入力 ─────────────────────────────────────────────── */
function toWorld(e){ var r=cv.getBoundingClientRect(); return (e.clientX-r.left)/r.width*W; }
var pressing=false, activePointer=null;
cv.addEventListener('pointerdown',function(e){
  if(over||paused||e.button!==0||!e.isPrimary) return;
  void sfx.unlock(); pressing=true; activePointer=e.pointerId; aimX=toWorld(e);
  cv.focus({preventScroll:true});
  try{ cv.setPointerCapture(e.pointerId); }catch(err){}
});
cv.addEventListener('pointermove',function(e){
  if(over||paused) return;
  if((pressing&&e.pointerId===activePointer)||(!pressing&&e.pointerType==='mouse')) aimX=toWorld(e);
});
cv.addEventListener('pointerup',function(e){
  if(over||paused||!pressing||e.pointerId!==activePointer) return;
  pressing=false;activePointer=null;aimX=toWorld(e);drop();
});
cv.addEventListener('pointercancel',function(e){if(e.pointerId===activePointer){pressing=false;activePointer=null;}});
cv.addEventListener('lostpointercapture',function(){pressing=false;activePointer=null;});
addEventListener('keydown',function(e){
  var modal=!veil.hidden?veil:!$('#pause-veil').hidden?$('#pause-veil'):null;
  if(e.key==='Tab'&&modal){
    var items=Array.from(modal.querySelectorAll('button:not([hidden]),a[href],input'));
    var at=items.indexOf(document.activeElement),next=e.shiftKey?(at<=0?items.length-1:at-1):(at+1)%items.length;
    e.preventDefault();items[next]?.focus();return;
  }
  if(e.key==='Escape'&&paused){e.preventDefault();setPaused(false);return;}
  if(e.target.closest('button,a,input,select,textarea')||e.ctrlKey||e.metaKey||e.altKey) return;
  if(e.key==='Escape'||e.key.toLowerCase()==='p'){if(!over){e.preventDefault();setPaused(!paused);}return;}
  if(paused) return;
  if(over){ if(e.key==='Enter'||e.key===' '){e.preventDefault();restart();cv.focus({preventScroll:true});} return; }
  var r=FRUITS[held].r, sx=e.shiftKey?6:22;
  if(e.key==='ArrowLeft'){ aimX=clampAim(aimX-sx,r);e.preventDefault(); }
  else if(e.key==='ArrowRight'){ aimX=clampAim(aimX+sx,r);e.preventDefault(); }
  else if((e.key===' '||e.key==='Enter'||e.key==='ArrowDown')&&!e.repeat){void sfx.unlock();drop();e.preventDefault();}
});

function setBackgroundInert(value){cv.inert=value;document.querySelector(".sign").inert=value;document.querySelector(".tray").inert=value;}
function paintPause(){
  $('#btn-pause').setAttribute('aria-pressed',String(paused));
  $('#btn-pause').setAttribute('aria-label',paused?'ゲームを再開':'一時停止');
  $('#btn-pause').textContent=paused?'▶':'Ⅱ';
}
function setPaused(value){
  if(over) return;
  paused=value;pressing=false;activePointer=null;tPrev=0;acc=0;
  frame.dataset.state=paused?'paused':'playing';$('#pause-veil').hidden=!paused;setBackgroundInert(paused);paintPause();
  sfx.setActive(!paused);
  if(paused)$('#btn-resume').focus({preventScroll:true});
  else{void sfx.unlock();cv.focus({preventScroll:true});}
}
$('#btn-pause').addEventListener('click',()=>{void sfx.unlock();setPaused(!paused);});
$('#btn-resume').addEventListener('click',()=>setPaused(false));
function pauseAway(){sfx.setActive(false);if(!over)setPaused(true);}
document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseAway();});
window.addEventListener('pagehide',pauseAway);
window.addEventListener('blur',pauseAway);
$('#btn-again').addEventListener('click',()=>{restart();cv.focus({preventScroll:true});});

var btnRestart=$('#btn-restart'),armed=0;
btnRestart.addEventListener('click',function(){
  if(over||!fruits.length||(armed&&Date.now()-armed<2500)){restart();cv.focus({preventScroll:true});return;}
  armed=Date.now();btnRestart.classList.add('arm');btnRestart.setAttribute('aria-label','もう一度押すと最初から');
  $('#notice').textContent='もう一度やり直すボタンを押すと、今の箱を空にします。';
  setTimeout(function(){if(armed&&Date.now()-armed>=2400){armed=0;btnRestart.classList.remove('arm');btnRestart.setAttribute('aria-label','やり直す');}},2500);
});
function paintAudio(){
  var state=sfx.get();
  ['music','effects'].forEach(function(key){var btn=$('#btn-'+key);btn.classList.toggle('off',!state[key]);btn.setAttribute('aria-pressed',String(state[key]));btn.setAttribute('aria-label',(key==='music'?'BGM':'効果音')+(state[key]?'をオフにする':'をオンにする'));});
  $('#music-volume').value=state.musicVolume;$('#effects-volume').value=state.effectsVolume;
  $('#music-value').textContent=state.musicVolume+'%';$('#effects-value').textContent=state.effectsVolume+'%';
}
['music','effects'].forEach(function(key){$('#btn-'+key).addEventListener('click',function(){sfx.set(key,!sfx.get()[key]);void sfx.unlock();paintAudio();});});
['music','effects'].forEach(function(key){$('#'+key+'-volume').addEventListener('input',function(){sfx.set(key+'Volume',Number(this.value));paintAudio();});});
paintAudio();paintPause();

/* ── 共有 ─────────────────────────────────────────────── */
function shareText(){return '夜店のくだもの箱で '+score+'点。'+FRUITS[maxLv].n+'まで育てました。';}
function shareUrl(){return document.querySelector('link[rel="canonical"]').href;}
function buildShare(){
  var url=encodeURIComponent(shareUrl()),text=encodeURIComponent(shareText());
  $('#sh-x').href='https://x.com/intent/post?text='+text+'&url='+url;
  $('#sh-line').href='https://social-plugins.line.me/lineit/share?url='+url;
  $('#sh-native').hidden=typeof navigator.share!=='function';$('#share-said').textContent='';
}
$('#sh-native').addEventListener('click',async()=>{
  try{await navigator.share({title:'夜店のくだもの箱',text:shareText(),url:shareUrl()});}
  catch(e){if(e.name!=='AbortError')$('#share-said').textContent='共有できませんでした。リンクをコピーして送れます。';}
});
$('#sh-copy').addEventListener('click',async()=>{
  var text=shareText()+' '+shareUrl(),ok=false;
  try{await navigator.clipboard.writeText(text);ok=true;}
  catch{
    var area=document.createElement('textarea');area.value=text;area.style.cssText='position:fixed;top:-1000px;opacity:0';document.body.append(area);area.select();
    try{ok=document.execCommand('copy');}catch{}area.remove();
  }
  $('#share-said').textContent=ok?'スコアとリンクをコピーしました。':'コピーできませんでした。ブラウザの共有メニューからリンクを送れます。';
});

/* ── 開始 ─────────────────────────────────────────────── */
held=pickLv(); nextLv=pickLv(); paintNext();
fit();frame.dataset.state='playing';frame.dataset.fruits='0';sfx.setActive(true);
requestAnimationFrame(loop);
})();
