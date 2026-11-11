import {mesh,cylinder,ringSolid,poly,face,finish} from './mesh.mjs';
// Separate random streams keep all LODs anchored to the same branch skeleton.
export function firSkeleton(variant){
 let seed=19271+variant*983;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const h=[9,15.5,13][variant],radius=[1.45,1.85,2.95][variant],count=[8,10,9][variant];
 const tiers=Array.from({length:count},(_,i)=>{
  const t=i/(count-1),y=h*(.21+.69*t)+(random()-.5)*h*.035,r=radius*Math.pow(1-.90*t,variant===2?.85:1.1)*( .88+random()*.24),phase=random()*Math.PI*2;
  const branches=Array.from({length:6+Math.floor(random()*3)},(_,j)=>({j,length:.79+random()*.35,tilt:(random()-.5)*.30,tone:.72+random()*.36,snow:random(),patch:.08+random()*.07}));
  return {y,r,phase,branches};
 });return {h,radius,tiers};
}
export function fir(variant,lod='near',revision=3){
 const {h,radius,tiers}=firSkeleton(variant),near=lod==='near',far=lod==='far',m=mesh(`fir-${'abc'[variant]}`,lod,near?1400:far?40:320);
 if(far){
  // Two stepped, intersecting sheets; each branch fan exposes green below its snow.
  for(const a of [0,Math.PI/2]){
   const p=(x,y,offset=0)=>[Math.cos(a)*x+Math.sin(a)*offset,y,Math.sin(a)*x-Math.cos(a)*offset];
   const both=(q,mat,tone=1)=>{face(m,q,mat,[Math.sin(a),0,-Math.cos(a)],tone);face(m,[...q].reverse(),mat,[-Math.sin(a),0,Math.cos(a)],tone);};
   for(let i=0;i<4;i++){
    const t=i/4,y=h*(.18+.175*i),r=radius*(1-.80*t),top=y+h*.27;
    both([p(-r,y),p(r*.91,y+h*.015),p(0,top)],5,.83+i*.05);
    const q=[p(-r*.73,y+h*.065,.018),p(r*.48,y+h*.09,.018),p(-r*.10,top-h*.035,.018)];
    // Separate front/back patches avoid coplanar foliage/snow depth fighting.
    face(m,q,2,[Math.sin(a),0,-Math.cos(a)],.94);
    face(m,q.map(v=>[v[0]-Math.sin(a)*.036,v[1],v[2]+Math.cos(a)*.036]).reverse(),2,[-Math.sin(a),0,Math.cos(a)],.94);
   }
   both([p(-.16,h*.84),p(.12,h*.84),p(0,h)],5);
   both([p(-h*.018,0),p(h*.018,0),p(0,h*.45)],6,.65);
  }
 }else{
  if(revision===1)cylinder(m,[0,0,0],[0,h*.96,0],h*.018,6,near?7:4,.65);
  else ringSolid(m,[[0,h*.014],[h*.52,h*.007],[h*.94,.012]].map(([y,r])=>Array.from({length:near?7:4},(_,i)=>[Math.cos(i/(near?7:4)*Math.PI*2)*r,y,Math.sin(i/(near?7:4)*Math.PI*2)*r])),6,.65);
  // One fine, dark leader, with the exact same tip height at every LOD.
  poly(m,[[-.11,h*.87,0],[.11,h*.87,0],[0,h*.87,.12],[0,h,0]],[[0,1,2],[0,3,1],[1,3,2],[2,3,0]],5,.80);
  for(const tier of tiers)for(const b of tier.branches){
   const a=tier.phase+b.j/tier.branches.length*Math.PI*2+(revision>=4?b.tilt*.4:0),r=tier.r*b.length,drop=r*(revision>=2?.30+(revision>=4?b.tilt*.4:0):.18),spread=(revision>=3?.30:.38),y=Math.max(tier.y+b.tilt*(revision>=3?2.3:1),h*.15+r*.14+drop+.13);
   const p=(d,w,lift=0)=>[Math.cos(a)*d-Math.sin(a)*w,y-r*.14-d/r*drop+lift,Math.sin(a)*d+Math.cos(a)*w];
   const shoulder=revision>=3?r*.22:r*.42;
   const leaf=[p(.06,0,shoulder),p(r*.48,-r*spread,r*.12),p(r*.88,-r*spread*.53,-.03),p(r,0,-.13),p(r*.85,r*spread*.6,-.03),p(r*.45,r*spread,r*.12)];
   if(near){const bottom=p(r*.46,0,-r*.12);poly(m,[...leaf,bottom],[[0,1,2],[0,2,3],[0,3,4],[0,4,5],[6,1,0],[6,2,1],[6,3,2],[6,4,3],[6,5,4],[6,0,5]],5,b.tone,.30);}
   else {const q=revision>=4?[leaf[0],p(r*.94,-r*spread,-.08),p(r*.91,r*spread,-.10)]:[leaf[0],leaf[2],leaf[4]];face(m,q,5,[0,1,0],b.tone,.3);face(m,[...q].reverse(),5,[0,-1,0],b.tone,.3);}
   // Inset two independent snow pillows on the two sides of the branch fan.
   // Vertices interpolate the leaf surface; the only added height is 8..15cm.
   const sunny=Math.cos(a)+Math.sin(a)>1;
   if(near&&revision>=3){
    for(const ids of [[0,1,3],[0,3,5]]){
     const base=ids.map(i=>leaf[i]),center=[0,1,2].map(k=>base.reduce((sum,p)=>sum+p[k],0)/3);
     const coverage=sunny?.52:.68,shrink=Math.sqrt(coverage),shift=revision>=4?(b.snow-.5)*.04:0;
     const q=base.map(p=>p.map((v,k)=>center[k]+(v-center[k])*shrink+(k===0?Math.cos(a)*r*shift:k===2?Math.sin(a)*r*shift:0)));
     const top=q.map(p=>[p[0],p[1]+b.patch,p[2]]),bottom=center.map((v,k)=>v+(k===1?.008:0));
     poly(m,[...top,bottom],[[0,1,2],[3,1,0],[3,2,1],[3,0,2]],2,.93+.06*b.snow,.04);
    }
   }else{
    const coverage=sunny?.53:.68,end=revision>=4?.84:.90,start=revision>=4?.12:.06;
    const snow=[p(r*start,0,shoulder+b.patch),p(r*.48,-r*spread*coverage,r*.12+b.patch),p(r*end,0,b.patch-.06),p(r*.45,r*spread*coverage,r*.12+b.patch)];
    if(near){const bottom=p(r*.45,0,r*.03);poly(m,[...snow,bottom],[[0,1,2],[0,2,3],[4,1,0],[4,2,1],[4,3,2],[4,0,3]],2,.93+.06*b.snow,.04);}
    else {const q=[snow[0],snow[1],snow[2]];face(m,q,2,[0,1,0],.97);face(m,[...q].reverse(),2,[0,-1,0],.97);}
   }
  }
 }
 return finish(m,{type:'circle',center:[0,0],radius:h*.022});
}
export function boulder(variant,revision=1){
 const m=mesh(`boulder-${'ab'[variant]}`,'near',260),w=variant?4.7:2.6,h=variant?2.9:1.65,d=w*.8,n=9;
 const ring=(y,r,phase=0)=>Array.from({length:n},(_,i)=>{const a=i/n*Math.PI*2,rr=r*(1+.13*Math.sin(i*4.8+variant));return [Math.cos(a+phase)*w/2*rr,y+Math.sin(i*2.1)*h*.035,Math.sin(a+phase)*d/2*rr];});
 const lower=ring(.08,1),shoulder=ring(h*.55,.93,.08),upper=ring(h*.87,.57,.12),cap=ring(h,.24,.2);
 if(revision>=3&&variant)for(const r of [shoulder,upper,cap])for(const p of r){p[0]+=p[1]*.18;p[2]+=.16*Math.sin(p[0]*2);}
 // Clamp the foot to y=0; upper fractured faces remain angular and asymmetric.
 for(const p of lower)p[1]=0;
 ringSolid(m,[lower,shoulder,upper,cap],1,.92,.22);
 const snowLower=upper.map(p=>[p[0]*1.10,p[1]+.04,p[2]*1.10]),snowTop=cap.map(p=>[p[0]*1.12,p[1]+(revision>=2?.24:.12),p[2]*1.12]);
 ringSolid(m,[snowLower,snowTop],2,1,.06);
 return finish(m,{type:'circle',center:[0,0],radius:Math.max(...m.p.map(p=>Math.hypot(p[0],p[2])))});
}
