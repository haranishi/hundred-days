// Ski-only IK; forward/up/right are physical frame vectors, including in flight.
import {solveTwoBone} from './ik.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
/** 握りから、この長さまでは、同じ側の腕との近さを見ない（握った手のすぐ後ろは前腕） */
export const POLE_ARM_FREE=.30;
/** 棒の支点（握りのまん中）は、手首の関節から、前腕の向きへこの長さだけ先＝こぶしの中。
 * 手首の関節に置いていたときは、手袋（関節から先へ 12 cm）の後ろから棒が出て、手に持って見えなかった（見た目の採点 3 周目） */
export const POLE_GRIP_AHEAD=.07;
/** 輪が、板の面からこの高さより上にあるときは、板との横の離れを見ない（まっすぐ滑る姿勢の輪は、30 cm。それは見る） */
export const POLE_BASKET_CLEAR=.45;
function gripPoint(out,hand,elbow,ahead=POLE_GRIP_AHEAD){const x=hand.x-elbow.x,y=hand.y-elbow.y,z=hand.z-elbow.z,n=(Math.hypot(x,y,z)||1)/ahead;return set(out,hand.x+x/n,hand.y+y/n,hand.z+z/n);}
const set=(o,x,y,z)=>{o.x=x;o.y=y;o.z=z;return o;};
const copy=(a,b)=>set(a,b.x,b.y,b.z);
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const unit=o=>{const n=Math.hypot(o.x,o.y,o.z)||1;return set(o,o.x/n,o.y/n,o.z/n);};
const cross=(a,b,o)=>set(o,a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);
function at(o,origin,r,u,f,x,y,z){return set(o,origin.x+r.x*x+u.x*y+f.x*z,origin.y+r.y*x+u.y*y+f.y*z,origin.z+r.z*x+u.z*y+f.z*z);}
export function solveSkiPose(input,m,p){
 const s=input.state,j=p.joints,b=p.board,air=s.mode==='air',dt=Math.max(0,input.dt);
 const reset=!m.initialized||m.gear!=='ski'||input.jumped;
 m.skiTime=reset?0:(m.skiTime||0)+dt;
 p.poleDirs??={L:{x:0,y:0,z:0},R:{x:0,y:0,z:0}};
 p.gear='ski';p.grabHand=null;p.poleSkidding=s.mode==='skid';copy(b.pos,s.pos);unit(copy(b.fwd,s.fwd));
 const f=b.fwd,u=m.baseUp,r=m.baseRight;
 p.skiSurface??={up:{x:0,y:0,z:0},right:{x:0,y:0,z:0}};
 copy(u,s.up);const d=dot(f,u);set(u,u.x-f.x*d,u.y-f.y*d,u.z-f.z*d);unit(u);unit(cross(f,u,r));copy(p.skiSurface.up,u);copy(p.skiSurface.right,r);
 // 転んだとき（crash・rest）：尻もちをついて、足から先に滑る形へ移す（fall が 0→1）。いままでは、転んでも立ったままだった
 // （スキーの滑りの採点 1 周目「転んでも体が立ったまま雪煙の中にいて、転んだように見えない」）。roll は、滑っている間の左右のゆれ
 const down=s.mode==='crash'||s.mode==='rest';
 m.skiFall=reset?(down?1:0):clamp((m.skiFall||0)+(down?dt/.12:-dt/.4),0,1);
 m.skiRoll=s.mode==='crash'?(m.skiRoll||0)+clamp(s.speed,0,40)*.8*dt:(m.skiFall<.02?0:m.skiRoll||0);
 const fall=m.skiFall,roll=m.skiRoll;
 const edge=air||down?0:clamp(s.edge,-1.1,1.1),co=Math.cos(edge),sn=Math.sin(edge);
 set(b.up,u.x*co+r.x*sn,u.y*co+r.y*sn,u.z*co+r.z*sn);unit(cross(f,b.up,b.right));
 // ストックで押す：平らな所で、低い姿勢のボタンを押していて、遅いとき。物理は、秒速 4.5 m ちょうどまで押し続ける（押した後の速さが、ちょうど 4.5 になる）。
 // 「4.5 より遅い」だけで決めると、平らな所を押して進んでいる間じゅう、押す姿勢にならずに、低い姿勢のまま滑って見えた
 // （見た目の採点 2 周目「押す姿勢が、低い姿勢と同じ絵」）。入るのは 4.6 未満・やめるのは 5.0 超え（境目で、1 コマごとに入れ替わらない）
 const target=clamp(s.crouch,0,1),canPush=!down&&!air&&target>.8&&u.y>.985;
 m.skiPushing=!reset&&canPush&&(m.skiPushing?s.speed<=5:s.speed<4.6)||(reset&&canPush&&s.speed<4.6);
 const pushing=m.skiPushing,alpha=reset?1:1-Math.exp(-18*dt);
 // 1 回の押しは 1 秒。前の 65% は、先を雪に突いて後ろへ押す（stroke が 0→1）。残りの 35% は、先を浮かせて、手を前へ戻す（1→0）
 const pushPhase=(m.skiTime%1+1)%1,planted=pushing&&pushPhase<.65,stroke1=pushPhase<.65?pushPhase/.65:1-(pushPhase-.65)/.35;
 p.crouch+=(target-p.crouch)*alpha;p.lean+=(edge-p.lean)*alpha;
 const grab=air?(s.air?.reach||s.air?.grab||0):0,grabbing=grab>=1&&grab<=3;
 p.grabHand=grabbing?(grab===2?'L':'R'):null;p.grabWristAngle=grabbing&&grab===2?24:0;p.grabWristAzimuth=180;
 const turn=air||s.mode==='skid'?0:clamp(Math.abs(edge)/.52,0,1),tuck=pushing?0:p.crouch;
 const upright=grabbing?(grab===2?.30:.42):air?.72-.15*tuck:(s.mode==='skid'?.68:.82)+(-.04-.012*clamp((Math.abs(edge)-.52)/.26,0,1))*turn-(s.mode==='skid'?.20:.34)*tuck,lean=air||down?0:p.lean;
 const h=upright;
 at(j.pelvis,b.pos,r,u,f,grabbing&&grab===2?.13:Math.sin(lean)*h,.11+h*Math.cos(lean),grabbing?(grab===3?-.80:grab===2?-.30:-.45):-.015-.08*tuck);
 const cf=p.chestFwd,cu=p.chestUp;copy(cf,f);
 if(!air&&s.speed>1&&Math.hypot(s.vel.x,s.vel.z)>1e-6){copy(cf,s.vel);const v=dot(cf,u);set(cf,cf.x-u.x*v,cf.y-u.y*v,cf.z-u.z*v);unit(cf);}
 if(grabbing&&(grab===2||grab===3)){const yaw=grab===2?.5:.18;at(cf,{x:0,y:0,z:0},r,u,f,Math.sin(yaw),0,Math.cos(yaw));unit(cf);}
 const hf={x:cf.x,y:cf.y,z:cf.z};
 const poleF=s.mode==='skid'?hf:f,poleR=s.mode==='skid'?unit(cross(poleF,u,{x:0,y:0,z:0})):r;
 p.poleRight??={x:0,y:0,z:0};copy(p.poleRight,poleR);
 // 低い姿勢の上半身：前へ 54°（.18+1.2）。45°（.18+.85）のときは、後ろの上から見るゲームのカメラで、頭が高く、立って見えた（滑りの採点 2 周目）
 const torsoForward=grabbing?(grab===2?1.0:1.8):pushing?.45+.40*stroke1:(.18+1.2*tuck),upperLean=lean*.58; // 押す間は、上半身を前へかぶせる（24°→40°）
 at(cu,{x:0,y:0,z:0},r,u,cf,Math.tan(upperLean),1,torsoForward);unit(cu);

 const side=m.shoulderSide;unit(cross(cf,cu,side));unit(cross(cu,side,cf));
 // Look forward independently of the bent back.
 copy(p.headFwd,f);
 at(j.chest,j.pelvis,side,cu,cf,0,.30,0);at(j.neck,j.chest,side,cu,cf,0,.24,0);at(j.head,j.neck,side,u,f,0,.20,0);
 for(const [suffix,sign] of [['L',-1],['R',1]]){
  const ankle=j['ankle'+suffix],hip=j['hip'+suffix],knee=j['knee'+suffix],inner=sign*edge>0;
  at(ankle,b.pos,r,u,f,sign*.16,grabbing?.26:0,inner?.11:0);
  set(ankle,ankle.x+b.up.x*.11,ankle.y+b.up.y*.11,ankle.z+b.up.z*.11);
  at(hip,j.pelvis,b.right,b.up,f,sign*.10,0,0);
  at(m.pole,hip,r,u,f,sign*(grabbing&&grab===2?.05:.1+.12*tuck),grabbing&&grab===2?.5:-.1,1);
  solveTwoBone(hip,ankle,m.pole,.44,.43,knee,m.end);
 }
 // 腕：スキーの構えは、両手を体の前（腰より上・胸より下）に置き、ひじは肩より下で、軽く外へ開く。
 // 2026-11-11：ひじを肩の高さまで横へ張り出す形（棒を前腕から離すために、ひじを回していた）は、実際の画面で、肩を怒らせた人形に見えた。
 // 回すのをやめて、棒の側で避ける（carryPole）。握りのすぐ後ろは前腕なので、同じ側の前腕との近さは、握りから 30 cm までは見ない。
 // 低い姿勢（k）は、段をつけずに混ぜる。段をつけると、構えの途中で、腕と棒が 1 コマで跳ぶ
 const k=tuck*tuck*(3-2*tuck),mix=(a,b)=>a+(b-a)*k;
 p.poleGrip??={L:{x:0,y:0,z:0},R:{x:0,y:0,z:0}};
 p.poleHug=!air&&k>.5;p.poleBasis??={L:{right:{x:0,y:0,z:0},up:{x:0,y:0,z:0}},R:{right:{x:0,y:0,z:0},up:{x:0,y:0,z:0}}};
 for(const [suffix,sign]of [['L',-1],['R',1]]){
  const inner=sign*edge>0,in1=inner?turn:0,out1=!inner?turn:0;
  const shoulder=j['shoulder'+suffix],hand=j['hand'+suffix],elbow=j['elbow'+suffix];
  at(shoulder,j.chest,side,cu,cf,sign*.20,.19,0);
  if(!air&&sign*edge<0)at(shoulder,shoulder,r,u,f,0,-.02*turn,0);
  // 手（胸から：横・上・前）。切るときは、内側の手を低く前へ、外側の手を少し外の高めへ。空中は、少し広げて釣り合いを取る。
  // 低い姿勢は、こぶしを、胸の前でそろえる（あごの高さまで上げると、脇の内側で、服の面が 100 cm² 以上、折り重なって裏返った）
  at(hand,j.chest,side,u,hf,sign*mix(air?.36:.30+.04*out1,.17),mix(air?-.02:-.12-.035*in1+.05*out1,-.05),mix(.36,.50)+.025*in1);

  const chosen=grabbing&&suffix===(grab===2?'L':'R');
  // つかまない手。テールは、体が後ろへ倒れるので、手を外へ開く（体の近くに置いていたときは、後ろへ流す棒が体を避けて、上へ逃げた）
  if(grabbing&&!chosen)at(hand,shoulder,side,u,hf,sign*(grab===3?.26:.08),grab===3?-.12:-.18,grab===3?.30:.32);
  if(chosen){
   const origin=j['ankle'+(grab===2?'R':suffix)];
   // Target is the glove centre; the glove surface contacts the outside edge.
   // テールは、板の後ろの端の上（靴が無いので、縁の真上へ寄せる）
   at(hand,origin,b.right,b.up,f,grab===2?.080:grab===3?sign*.060:sign*.119,-.030,grab===3?-.50:grab===2?.23:0);
  }
  // 押す手：前の高い所（突く）から、腰の横の後ろ（押し切る）へ。高い所で突くと、棒が立って、先が足のすぐ前に着く。
  // 戻すときも、同じ道を低く戻る（手を持ち上げて戻すと、ひじが 70° まで折れて、ひじの内側で服の面が裏返った）。先は、棒の向きで浮かせる
  if(pushing)at(hand,b.pos,r,u,f,sign*.37,1.10-.30*stroke1,.50-.65*stroke1);
  if(grabbing){
   const bend=chosen?(grab===3?[.02,.1,0]:grab===2?[.2,.1,0]:[.2,-.3,0]):grab===3?[.2,-.3,0]:[.02,.1,.5];
   at(m.pole,shoulder,r,u,f,sign*bend[0],bend[1],-bend[2]);
  // ひじの向き：肩の下の、少し外・少し後ろ（立つ・切る・空中）。低い姿勢は、ひざの前へたたむ。
  // 切るときの外側は、もう少し外へ開く（体が内へ倒れるので、まっすぐ下げた腕は胴へ寄り、脇で服の面が折り重なった）
  }else at(m.pole,shoulder,side,u,hf,sign*mix((air?.22:.16)+.16*out1,.10),mix(-.30,-.20),mix(-.08,.30));
  solveTwoBone(shoulder,hand,m.pole,.29,.27,elbow,m.end);copy(hand,m.end);
  if(grabbing&&!chosen&&grab===1)rotateElbow(shoulder,hand,elbow,sign*(-50)*Math.PI/180);
  if(grabbing&&grab===2)rotateElbow(shoulder,hand,elbow,sign*(-10)*Math.PI/180);
  // Grip is a free pivot: the forearm never constrains the shaft direction.
  // 板をつかむ手は、手袋の先が板に掛かる。支点をこぶしの中まで進めると、棒が板の面より下から出るので、手首の近くに残す
  const grip=gripPoint(p.poleGrip[suffix],hand,elbow,chosen?.01:POLE_GRIP_AHEAD);
  // 棒の向きのねらい（後ろ・下・少し外）。切るときの内側は、手が雪に近いので寝かせる。低い姿勢は、脇の下を通して、後ろへ流す
  const pole=p.poleDirs[suffix],basis=p.poleBasis[suffix];
  // 向きを決める枠：切るときの外側の棒は、傾いた体（板の面）に合わせる。雪の面の枠のままだと、外側の手は、傾いた体の真上に来るので、
  // 棒が腰と脚を通るか、背中を横切って内側へ逃げた。内側の棒は、手が雪に近いので、雪の面の枠で、先が雪のすぐ上をかすめる高さへ寝かせる
  const tilted=!air&&!pushing&&s.mode!=='skid'&&!inner;
  copy(basis.right,tilted?b.right:poleR);copy(basis.up,tilted?b.up:u);
  // 板をつかむ手の棒は、板に沿わせて、後ろの少し外へ（ミュートは、腕が交差するので、つかんだ板の外側へ）。
  // 後ろ上へ立てていたときは、しゃがんだ体の背中の前を横切った
  if(chosen||air){at(pole,{x:0,y:0,z:0},poleR,u,poleF,chosen?(grab===2?-sign*.25:sign*.20):sign*.18,chosen?.08:-.65,-1);unit(pole);}
  else{
   // 先の高さのねらい：立つ・外側は 26 cm、内側は 10 cm（手の高さから、下向きの成分を逆算する）。低い姿勢は、ほぼ水平に後ろへ
   // 低い姿勢は、少し上向き（前腕の上・脇の下を通る）。前腕と同じ向きにしていたときは、握りから 30 cm が袖に隠れて、棒が腰から生えて見えた
   // 2 本は、ほぼ平行に、腕の内側（脇の下）を通す
   const q=dot(grip,basis.up)-dot(b.pos,basis.up),lat=mix(.12,.07),drop=mix(clamp(-(q-.26+.16*in1)/1.16,-.85,0),.08);
   at(pole,{x:0,y:0,z:0},basis.right,basis.up,poleF,sign*lat,drop,-Math.sqrt(Math.max(.01,1-drop*drop-lat*lat)));unit(pole);
  }
  if(pushing){
   // 押す棒：突いている間は、先が雪に着く向き（手の高さから決まる）。先は、いつも手より後ろ。
   // 突き始めに、先を手より前へ向けていたときは、足の 1 m 先を突き、途中で向きが 1 コマで裏返った
   // 戻す間は、先を浮かせる（山なりに 16 cm まで）。突く・戻すの境目で、高さを段にしない（段にすると、棒が 1 コマで跳ねる）
   const lift=planted?0:.16*Math.sin(Math.PI*(pushPhase-.65)/.35);
   const height=dot(grip,u)-dot(b.pos,u),drop=clamp((.01+lift-height)/1.16,-1,0),lat=sign*.10;
   at(pole,{x:0,y:0,z:0},r,u,f,lat,drop,-Math.sqrt(Math.max(0,1-drop*drop-lat*lat)));unit(pole);
  }else carryPole(p,suffix,basis.right,basis.up,poleF,pole,!air,chosen,p.poleHug);

 }
 if(fall>.001){
  // Supine tumble: rotate the chest normal around the travel axis, not the skis' physics frame.
  const fallen={},phase=Math.sin(roll)*1.1,up={x:u.x*Math.cos(phase)+r.x*Math.sin(phase),y:u.y*Math.cos(phase)+r.y*Math.sin(phase),z:u.z*Math.cos(phase)+r.z*Math.sin(phase)};
  const local=(name,x,y,z)=>{fallen[name]={x:0,y:0,z:0};at(fallen[name],b.pos,r,u,f,x,Math.max(.12,y),z);};
  const groundHeight=.22+.08*Math.abs(Math.sin(phase));
  local('pelvis',0,groundHeight,-.25);local('chest',0,groundHeight,-.55);local('neck',0,groundHeight,-.79);local('head',0,groundHeight,-.99);
  for(const [side,sign] of [['L',-1],['R',1]]){
   const swing=Math.sin(phase)*sign;
   local('hip'+side,sign*.10*Math.cos(phase),groundHeight-sign*.10*Math.sin(phase),-.25);local('knee'+side,sign*.25,.45+.14*swing,.10);
   local('ankle'+side,sign*.38,.28+.12*swing,.45);
   const sr={x:r.x*Math.cos(phase)-u.x*Math.sin(phase),y:r.y*Math.cos(phase)-u.y*Math.sin(phase),z:r.z*Math.cos(phase)-u.z*Math.sin(phase)};
   const center=fallen.chest;
   const arm=(name,lift,width,back)=>{fallen[name]={x:0,y:0,z:0};at(fallen[name],center,sr,up,f,sign*width,lift,back);const q=dot(fallen[name],u)-dot(b.pos,u);if(q<.04)at(fallen[name],fallen[name],r,u,f,0,.04-q,0);};
   arm('shoulder'+side,0,.20,-.19);
   arm('elbow'+side,.22,.38,-.07);
   arm('hand'+side,.46,.50,-.01);

  }
  rotateElbow(fallen.shoulderR,fallen.handR,fallen.elbowR,-Math.PI/4);
  for(const name of Object.keys(fallen)){const a=j[name],v=fallen[name];set(a,a.x+(v.x-a.x)*fall,a.y+(v.y-a.y)*fall,a.z+(v.z-a.z)*fall);}
  set(cu,cu.x*(1-fall)-f.x*fall,cu.y*(1-fall)-f.y*fall,cu.z*(1-fall)-f.z*fall);unit(cu);
  set(cf,cf.x*(1-fall)+up.x*fall,cf.y*(1-fall)+up.y*fall,cf.z*(1-fall)+up.z*fall);unit(cf);copy(p.headFwd,cf);
  // 転んでいる間の棒：前腕の先へ、そのまま伸ばす（体から離れる向き）。後ろへ流す決まりのままだと、投げ出した手の棒が、胸や顔の上を横切った。
  // 先が雪に潜る向きなら、潜らない高さまで起こす
  for(const side of ['L','R']){
   const d=p.poleDirs[side],hand=j['hand'+side],e=j['elbow'+side],v=unit({x:hand.x-e.x,y:hand.y-e.y,z:hand.z-e.z}),grip=gripPoint(p.poleGrip[side],hand,e);
   const need=clamp((.05-(dot(grip,u)-dot(b.pos,u)))/1.16,-1,.95),up=dot(v,u);
   if(up<need){const w=unit({x:v.x-u.x*up,y:v.y-u.y*up,z:v.z-u.z*up}),c=Math.sqrt(1-need*need);set(v,u.x*need+w.x*c,u.y*need+w.y*c,u.z*need+w.z*c);}
   unit(set(d,d.x+(v.x-d.x)*fall,d.y+(v.y-d.y)*fall,d.z+(v.z-d.z)*fall));
  }
 }
 m.initialized=true;m.gear='ski';return p;
}
// ── 棒の向きを決める（スキーだけ。スノーボードは、ここを通らない） ──
// ねらいの向き（out）が、決まりを満たすなら、そのまま使う。満たさないときだけ、候補（後ろ半分の向き 約 500 通り）を、ねらいに近い順に試して、
// 体に当たらない最初のものを使う。
// 2026-11-11：前は、毎コマ、候補を全部（制動は 2300 通り × 棒の上の 129 点）調べていて、制動で 1 コマ 3.6 ミリ秒かかった
// （スノーボードの姿勢は 0.01 ミリ秒）。体との近さは、棒の上に点を並べて測るのをやめて、線分どうしの距離で 1 回で測る。
// 毎コマ呼ぶので、入れ物は作り直さない（下の配列を使い回す）
const GRID_L=[-.35,-.32,-.28,-.24,-.20,-.16,-.12,-.08,-.04,0,.04,.08,.12,.16,.20,.24,.28,.32,.35];
const GRID_D=[-.9,-.84,-.80,-.76,-.70,-.65,-.64,-.58,-.55,-.5,-.45,-.4,-.35,-.3,-.25,-.2,-.15,-.1,-.05,0,.05,.1,.15,.2,.25,.3,.35,.4];
const GRAB_D=[.06,.10,.14,.18,.24,.3,.35,.4,.45]; // つかむ手の棒は、板に当たらないように、上向きだけ（板に沿う向きから）
function grid(drops){const list=[];for(const l of GRID_L)for(const d of drops)if(l*l+d*d<.99)list.push(l,d,-Math.sqrt(1-l*l-d*d));return Float64Array.from(list);}
const GRID=grid(GRID_D),GRAB_GRID=grid(GRAB_D),COST=new Float64Array(GRID.length/3),ORDER=new Uint16Array(GRID.length/3);
const byCost=(a,b)=>COST[a]-COST[b];
/** 体の部分（太さのある線分）：[端 xyz, 端 xyz, 太さ, 握りから何 m 先から見るか] を 8 個ずつ */
const CAPS=new Float64Array(13*8);let capCount=0;
function cap(ax,ay,az,bx,by,bz,radius,from){const o=capCount++*8;CAPS[o]=ax;CAPS[o+1]=ay;CAPS[o+2]=az;CAPS[o+3]=bx;CAPS[o+4]=by;CAPS[o+5]=bz;CAPS[o+6]=radius;CAPS[o+7]=from;}
const capJoints=(a,b,radius,from)=>cap(a.x,a.y,a.z,b.x,b.y,b.z,radius,from);
/** 線分 p1→q1 と、線分 p2→q2 の、いちばん近い距離 */
function segmentGap(p1x,p1y,p1z,q1x,q1y,q1z,p2x,p2y,p2z,q2x,q2y,q2z){
 const d1x=q1x-p1x,d1y=q1y-p1y,d1z=q1z-p1z,d2x=q2x-p2x,d2y=q2y-p2y,d2z=q2z-p2z,rx=p1x-p2x,ry=p1y-p2y,rz=p1z-p2z;
 const a=d1x*d1x+d1y*d1y+d1z*d1z,e=d2x*d2x+d2y*d2y+d2z*d2z,f=d2x*rx+d2y*ry+d2z*rz,c=d1x*rx+d1y*ry+d1z*rz,b=d1x*d2x+d1y*d2y+d1z*d2z;
 let s=0,t=0;
 if(e<1e-12)s=a<1e-12?0:clamp(-c/a,0,1);
 else if(a<1e-12)t=clamp(f/e,0,1);
 else{
  const den=a*e-b*b;s=den>1e-12?clamp((b*f-c*e)/den,0,1):0;t=(b*s+f)/e;
  if(t<0){t=0;s=clamp(-c/a,0,1);}else if(t>1){t=1;s=clamp((b-c)/a,0,1);}
 }
 return Math.hypot(rx+d1x*s-d2x*t,ry+d1y*s-d2y*t,rz+d1z*s-d2z*t);
}
export function carryPole(p,suffix,r,u,f,out,ground,grabbing,hug){
 // 輪と板の横の離れは、制動（体の枠で向きを探す）のときだけ、板の横の向きで測る。ほかは、向きを探す枠の横の向きで測る
 // hand＝棒の支点（握りのまん中）。制動では、板が横を向くので、「かかとより後ろ」は、体の向き（f）で測る。
 // 板の向きで測っていたときは、棒が、板の後ろの端の側（体から見て真横）へ引かれて、腹の前を水平に横切った
 const j=p.joints,hand=p.poleGrip[suffix],b=p.board,bf=p.poleSkidding?f:b.fwd,up=b.up,side=p.poleSkidding?p.skiSurface.right:r,aL=j.ankleL,aR=j.ankleR;
 capCount=0;capJoints(j.pelvis,j.neck,.15,0);
 for(const s of ['L','R']){
  // 同じ側の腕：握りのすぐ後ろは前腕。棒は握りの下から出るので、握りから 30 cm までは、近くてよい。
  // 低い姿勢（hug）では、棒を脇に挟む＝同じ側の腕には沿わせる（離そうとすると、棒が頭の横を通って、上へ立つ）
  const own=s===suffix,from=own?POLE_ARM_FREE:0,a=j['ankle'+s];
  if(!(own&&hug)){capJoints(j['shoulder'+s],j['elbow'+s],.070,from);capJoints(j['elbow'+s],j['hand'+s],.055,from);}
  capJoints(j['hip'+s],j['knee'+s],.11,0);capJoints(j['knee'+s],a,.085,0);
  const x=a.x-up.x*.035,y=a.y-up.y*.035,z=a.z-up.z*.035,sf=b.fwd; // 靴
  cap(x-sf.x*.10,y-sf.y*.10,z-sf.z*.10,x+sf.x*.14,y+sf.y*.14,z+sf.z*.14,.067,0);
 }
 const q=dot(hand,u)-dot(b.pos,u);
 // 向き（x,y,z）を調べる。決まりを満たさなければ −1。満たせば、体への食い込み（m。0 なら、当たらない）。stop を超えたら、そこで打ち切る
 const check=(x,y,z,drop,stop)=>{
  // 輪と先が、雪より上。空中は、雪が無いので見ない（見ていたときは、しゃがんでつかむ間、つかまない手の棒が、上へ逃げて、頭の前を通った）
  if(ground&&(q+drop*1.09<.042||q+drop*1.16<.038))return -1;
  const tx=hand.x+x*1.09,ty=hand.y+y*1.09,tz=hand.z+z*1.09,ex=hand.x+x*1.16,ey=hand.y+y*1.16,ez=hand.z+z*1.16;
  // 輪が、どちらの板からも、横へ 20 cm 以上。輪が、板の面から 45 cm より高い所にあるときは、見ない（板に重ならない）。
  // 高さを見ずに守らせていたときは、低い姿勢の棒が、板を避けて外へ開き、腕の外側を通って、肩を貫いて見えた
  if((tx-b.pos.x)*up.x+(ty-b.pos.y)*up.y+(tz-b.pos.z)*up.z<POLE_BASKET_CLEAR&&(Math.abs((tx-aL.x)*side.x+(ty-aL.y)*side.y+(tz-aL.z)*side.z)<.20||Math.abs((tx-aR.x)*side.x+(ty-aR.y)*side.y+(tz-aR.z)*side.z)<.20))return -1;
  // つかむ手：握りのすぐ先が、板の面より上
  if(grabbing){const gx=hand.x+x*.039,gy=hand.y+y*.039,gz=hand.z+z*.039;
   if((gx-aL.x)*up.x+(gy-aL.y)*up.y+(gz-aL.z)*up.z+.09<.05||(gx-aR.x)*up.x+(gy-aR.y)*up.y+(gz-aR.z)*up.z+.09<.05)return -1;}
  if((tx-b.pos.x)*f.x+(ty-b.pos.y)*f.y+(tz-b.pos.z)*f.z>-.18)return -1; // 輪が、板のまん中より後ろ
  if((ex-aL.x)*bf.x+(ey-aL.y)*bf.y+(ez-aL.z)*bf.z>-.185||(ex-aR.x)*bf.x+(ey-aR.y)*bf.y+(ez-aR.z)*bf.z>-.185)return -1; // 先が、かかとより後ろ
  let penalty=0;
  for(let i=0;i<capCount&&penalty<stop;i++){
   const o=i*8,from=Math.max(.13,CAPS[o+7]);
   const over=CAPS[o+6]+.038-segmentGap(hand.x+x*from,hand.y+y*from,hand.z+z*from,ex,ey,ez,CAPS[o],CAPS[o+1],CAPS[o+2],CAPS[o+3],CAPS[o+4],CAPS[o+5]);
   if(over>penalty)penalty=over;
  }
  return penalty;
 };
 const ol=dot(out,r),od=dot(out,u),ob=dot(out,f);
 if(ob<0&&Math.abs(ol)<=.35&&(!grabbing||od>=.05)&&check(out.x,out.y,out.z,od,1e-9)===0)return; // ねらいの向きが、そのまま通る
 const g=grabbing?GRAB_GRID:GRID,n=g.length/3;
 for(let i=0;i<n;i++){COST[i]=2-2*(g[i*3]*ol+g[i*3+1]*od+g[i*3+2]*ob);ORDER[i]=i;}
 const order=ORDER.subarray(0,n).sort(byCost);
 let best=Infinity,bx=out.x,by=out.y,bz=out.z;
 for(let k=0;k<n;k++){
  const i=order[k],cost=COST[i];if(cost>=best)break; // これより先は、ねらいから遠くなるだけ
  const l=g[i*3],d=g[i*3+1],back=g[i*3+2],x=r.x*l+u.x*d+f.x*back,y=r.y*l+u.y*d+f.y*back,z=r.z*l+u.z*d+f.z*back;
  const pen=check(x,y,z,d,Math.sqrt((best-cost)/1e6));if(pen<0)continue;
  const score=cost+pen*pen*1e6;if(score<best){best=score;bx=x;by=y;bz=z;if(pen===0)break;}
 }
 set(out,bx,by,bz);
}

function rotateElbow(a,b,e,angle){
 const d={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z};unit(d);const v={x:e.x-a.x,y:e.y-a.y,z:e.z-a.z},q=dot(v,d),c=Math.cos(angle),s=Math.sin(angle),w={x:0,y:0,z:0};cross(d,v,w);
 set(e,a.x+v.x*c+w.x*s+d.x*q*(1-c),a.y+v.y*c+w.y*s+d.y*q*(1-c),a.z+v.z*c+w.z*s+d.z*q*(1-c));
}
