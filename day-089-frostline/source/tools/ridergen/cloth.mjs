import {jacket} from './jacket.mjs';
import {cross,sub,unit,mix,solid} from './sdf.mjs';
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>{x=clamp(x);return x*x*(3-2*x);};
const gauss=(x,w)=>Math.exp(-((x/w)**2));
// Garment radii and maximum fold allowance, in metres. Capsule tests use these
// plus conservative slack around the joint and the skinned cuff.
export const GARMENT=Object.freeze({upperArm:.098,wrist:.055,thigh:.110,ankle:.085,fold:.012,mitten:.055,mittenReach:.12});
const base=(part,weights)=>({part,weights,wrinkle:0,flutter:0,ao:1,seam:1,tone:1});
// Welded periodic loft, with closed end fans. Distances are authored in metres.
// Rings include all seam curves so interpolation preserves thin lines.
export function loft(mesh,rows,segments,sample,{reverse=true,loop=false}={}){
 const start=mesh.p.length,angles=Array.isArray(segments)?segments:Array.from({length:segments},(_,i)=>i/segments*Math.PI*2);
 segments=angles.length;
 for(let r=0;r<(loop?rows:rows+1);r++)for(let s=0;s<segments;s++){
  const t=r/rows,a=angles[s],v=sample(t,a);
  mesh.p.push(v.p);mesh.a.push(v.a);mesh.n.push([0,0,0]);
 }
 const id=(r,s)=>start+(loop?r%rows:r)*segments+(s+segments)%segments;
 for(let r=0;r<rows;r++)for(let s=0;s<segments;s++)mesh.tri.push([id(r,s),id(r,s+1),id(r+1,s)],[id(r,s+1),id(r+1,s+1),id(r+1,s)]);
 for(const r of (loop?[]:[0,rows])){
  const center=[0,1,2].map(k=>Array.from({length:segments},(_,s)=>mesh.p[id(r,s)][k]).reduce((a,b)=>a+b,0)/segments),c=mesh.p.length;
  mesh.p.push(center);mesh.n.push([0,0,0]);mesh.a.push({...mesh.a[id(r,0)],seam:1});
  for(let s=0;s<segments;s++)mesh.tri.push(r===0?[c,id(r,s+1),id(r,s)]:[c,id(r,s),id(r,s+1)]);
 }
 // Loft ordering has outward winding when tangent x radial axes agree.
 const tris=mesh.tri.filter(t=>t[0]>=start);
 if(reverse)for(const t of tris)[t[1],t[2]]=[t[2],t[1]];
 for(const tri of tris){const n=cross(sub(mesh.p[tri[1]],mesh.p[tri[0]]),sub(mesh.p[tri[2]],mesh.p[tri[0]]));for(const i of tri)for(let k=0;k<3;k++)mesh.n[i][k]+=n[k];}
 for(let i=start;i<mesh.p.length;i++)mesh.n[i]=unit(mesh.n[i]);
}
const seamAngles=(n,axes)=>[...Array.from({length:n},(_,i)=>i/n*Math.PI*2),...axes.flatMap(a=>[a-.025,a+.025].map(a=>(a+Math.PI*2)%(Math.PI*2)))].sort((a,b)=>a-b);
export function buildCloth(mesh,j){
 const h=j.pelvis[1],neck=j.neck[1];
 const profile=o=>{const top=ease((o-.88)/.12);return [.190-.025*Math.sin(o*Math.PI)+.025*ease((o-.60)/.20)-.105*top,.151-.012*Math.sin(o*Math.PI)-.025*top];};
 const attr=(part,w,seam=1,tone=1,wrinkle=0,flutter=0)=>({...base(part,w),seam:clamp(seam/.08),tone:clamp(tone),wrinkle,flutter,ao:1-.25*(1-ease(seam/.008))});
 // The first four rows return inward/upward from the hip-height hem.
 // Its closed underside is orange fabric; no thigh weights or flutter at the hem.
 jacket(mesh,j,attr,profile);
 // Small cloth panels follow the torso surface exactly. Their top is 3 mm proud.
 function frontSurface(y,z){
  const [width,depth]=profile((y-h)/.545);
  return depth*Math.max(.01,1-(Math.abs(z)/width)**(2/.65))**(.65/2);
 }
 function panel(y,z,halfWidth,halfHeight){
  // Rounded rectangular prism: rows across height, angle around its thin section.
  loft(mesh,8,[0,.06,.12,.3,Math.PI/2,Math.PI-.3,Math.PI-.12,Math.PI-.06,Math.PI,Math.PI+.06,Math.PI+.3,Math.PI*1.5,Math.PI*2-.3,Math.PI*2-.06],(t,a)=>{
   const py=y+(t*2-1)*halfHeight,pz=z+halfWidth*Math.cos(a);
   const x=frontSurface(py,pz)+.0015+.0015*Math.sin(a);
   const seam=Math.min(Math.abs(py-y+halfHeight),Math.abs(Math.abs(pz-z)-halfWidth));
   return {p:[x,py,pz],a:attr(0,[[1,1]],seam,.5+(py-h-.28-.23*pz)/.10,.3)};
  },{reverse:false});
 }
 panel(h+.365,-.105,.037,.018); // left chest flap only
 for(const sg of [-1,1])panel(h+.15,sg*.12,.033,.006); // welt pocket mouths
 // Open-topped waist vessel: annular upper lip, with a closed rounded seat below.
 // Both end fans lie at the crotch, never across the top of the waistband.
 const waist=[[-.090,.018,.028],[-.080,.065,.090],[-.060,.106,.149],[-.030,.120,.167],
  [.020,.120,.167],[.070,.120,.167],[.100,.114,.161],[.070,.104,.151],
  [.020,.104,.151],[-.020,.100,.144],[-.040,.080,.110],[-.055,.035,.050],[-.055,.018,.028]];
 loft(mesh,12,32,(t,a)=>{
  const [y,rx,rz]=waist[Math.round(t*12)],fold=.014*gauss(y+.03,.045)*Math.sin(a*5+y*80),valley=Math.max(0,-fold/.014);
  return {p:[(rx+fold)*Math.cos(a),h+y,(rz+fold)*Math.sin(a)],a:{...attr(1,[[0,1]],1,1,.6),ao:1-.85*valley}};
 });
 for(const [side,upper,lower,hand,sg] of [['L',5,6,7,-1],['R',8,9,10,1]]){

  chain(1,j['hip'+side],j['knee'+side],j['ankle'+side],side==='L'?11:14,side==='L'?12:15,GARMENT.thigh,GARMENT.ankle,sg);
  const p=j['hand'+side],e=j['elbow'+side],axis=unit(sub(p,e)),rad=unit(cross(axis,[1,0,0])),front=cross(rad,axis);
  loft(mesh,12,20,(t,a)=>{
   if(Math.abs(t*12-7)<.1)t=.55;
   const c=mix(p,e,.16-t*.60),r=(.046+.010*(1-t)+.003*gauss(t-.1,.05))*(t<.68?1:Math.sqrt(Math.max(.04,1-((t-.68)/.34)**2))),radial=front.map((v,k)=>v*Math.cos(a)+rad[k]*Math.sin(a));
   return {p:c.map((v,k)=>v+radial[k]*r*(k===0?.85:1)),a:attr(2,[[lower,1]],Math.abs(t-.55)*.11,1,.5)};
  },{reverse:false});
  const thumb=[p[0]+.032,p[1]-.019,p[2]-sg*.032];
  solid(mesh,thumb,[.024,.032,.026],2,()=>attr(2,[[lower,1]]),undefined,4);
 }
 // Hollow raised collar: both rims are annuli, exposing the fabric gaiter above.
 loft(mesh,12,32,(t,a)=>{
  const theta=t*Math.PI*2,r=.112+.008*Math.cos(theta);
  return {p:[r*Math.cos(a),neck+.040+.035*Math.sin(theta)-.008*Math.max(0,Math.cos(a)),r*Math.sin(a)],a:attr(0,[[2,1]],1,1,.3)};
 },{loop:true});
 // Broad neck fabric overlaps the helmet rim above and the raised collar below.
 loft(mesh,18,32,(t,a)=>{
  const r=.106+.003*Math.cos(t*Math.PI*6),y=neck-.035+t*.185;
  return {p:[r*Math.cos(a),y,r*Math.sin(a)],a:attr(3,[[3,1]],1,1,.5)};
 });
 // Soft folded hood resting on the upper back; no crescent rim.
 solid(mesh,[-.122,neck-.035,0],[.035,.025,.120],2,()=>attr(4,[[2,1]],1,1,.6),p=>{p[1]+=.7*p[0]+.008*Math.cos(p[2]/.120*Math.PI);return p;},6);
 function chain(part,a,b,c,upper,lower,r0,r1,sg){
  if(part===0)a=[a[0],a[1]-.025,a[2]-sg*.085];
  else c=[c[0],c[1]+.09,c[2]];
  const u=sub(b,a),v=sub(c,b),length=Math.hypot(...u)+Math.hypot(...v),split=Math.hypot(...u)/length;
  const plane=unit(cross(u,v));
  loft(mesh,40,seamAngles(28,[0,Math.PI]),(t,angle)=>{
   const row=t*40;for(const target of (part===0?[.065,length*.83]:[split*length-.065,split*length+.065,.085,.215])){const at=Math.round(target/length*40);if(Math.abs(row-at)<=1)t=(target+(row-at)*.003)/length;}
   const upperT=clamp(t/split),lowerT=clamp((t-split)/(1-split)),center=t<split?mix(a,b,upperT):mix(b,c,lowerT);
   const rounding=.08,q=clamp((t-split+rounding)/(2*rounding));
   if(part===0&&t>split-rounding&&t<split+rounding){const pa=mix(a,b,(split-rounding)/split),pc=mix(b,c,rounding/(1-split));for(let k=0;k<3;k++)center[k]=(1-q)**2*pa[k]+2*q*(1-q)*b[k]+q*q*pc[k];}
   const tangent=part===0?unit(mix(unit(u),unit(v),q)):unit(t<split?u:v),front=unit(cross(plane,tangent)),radial=plane.map((x,k)=>x*Math.cos(angle)+front[k]*Math.sin(angle));
   const blend=ease((t-split+.27)/.54),weights=[[upper,1-blend],[lower,blend]].filter(([,w])=>w>0);
   let r=r0+(r1-r0)*t;
   // Closed caps disappear inside the shoulder/pelvis or overlapping cuff/boot.
   if(part===0&&t<.07)r*=.5+.5*ease(t/.07);
   else if(part===1&&t<.035)r*=.88;
   const joint=gauss(t-split,.12),ankle=part===1?gauss(t-.92,.055):0,pit=part===0?gauss(t-.09,.055):0;
   r-=.005*pit*(.5+.5*Math.cos(t*length*150));if(part===0)r+=.0035*gauss(t-.83,.014);
   r+=.014*ankle*Math.sin(t*length*120+angle*.5);
   // Two transverse folds confined to the inside of the bend plane.
   const inside=Math.max(0,Math.sin(angle));
   const bendDistance=(t-split)*length;
   const crease=inside*(gauss(bendDistance+.065,.015)+gauss(bendDistance-.065,.015))
    +(part===1?.7*gauss(bendDistance-.13,.025):0);
   if(part===0)r+=.010*joint*inside*Math.cos(bendDistance*90);
   else {r-=.015*crease;r+=.006*inside*gauss(bendDistance,.025);}
   if(part===0)r+=.010*joint*(1-inside);
   const valley=part===0?joint*inside*Math.max(0,-Math.cos(bendDistance*90)):clamp(crease);
   if(part===1)r+=.009*joint;
   if(part===0)r+=.005*(1-ease((Math.abs(t-.87)*length-.0125)/.005));
   if(part===1)r-=.004*ankle*(.5+.5*Math.cos(t*length*170+Math.sin(angle)));
   const p=center.map((x,k)=>x+radial[k]*r),along=t*length;
   let seam=1;
   if(part===0)seam=Math.min(Math.abs(along-.065),Math.abs(along-length*.83)); // shoulder attachment
   else {
    seam=Math.abs(Math.sin(angle))*r;
    // Joint folds are geometry, not intersecting seam distance fields.
   }
   const tone=part===0?.5+(p[1]-h-.28-.23*p[2])/.10:1;
   return {p,a:{...attr(part,weights,seam,tone,clamp(joint+ankle+pit),part===0?gauss(t-.92,.08)*.2:0),ao:(1-.25*(1-ease(seam/.008)))*(1-.9*valley-.5*ankle*(.5+.5*Math.cos(t*length*170+Math.sin(angle))))}};
  });
 }
}
