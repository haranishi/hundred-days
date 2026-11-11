import {loft} from './cloth.mjs';
import {solid} from './sdf.mjs';
export const SKI_PARTS=[['ski','#237781'],['skiEdge','#c5d4dd'],['skiBinding','#b8c5d2'],['poleShaft','#a6bbc7'],['poleGrip','#202c39'],['poleBasket','#263546'],['poleStrap','#38495c'],['skiSide','#182731'],['skiBindingBody','#27333e'],['skiCuff','#202b36']];
export function addSkis(mesh,bones,j){
 const attr=(part,bone)=>({part,weights:[[bone,1]],wrinkle:0,flutter:0,ao:1,seam:1,tone:1});
 function inBone(bone,origin,build){
  const start=mesh.p.length;build();const f=bones[bone].basis;
  for(let i=start;i<mesh.p.length;i++){
   let p=mesh.p[i],n=mesh.n[i];if(bone===7||bone===10){p=[p[0],p[2],-p[1]];n=[n[0],n[2],-n[1]];}mesh.p[i]=origin.map((v,k)=>v+f[k]*p[0]+f[k+3]*p[1]+f[k+6]*p[2]);
   mesh.n[i]=[0,1,2].map(k=>f[k]*n[0]+f[k+3]*n[1]+f[k+6]*n[2]);
  }
 }
 for(const [s,bone,hand] of [['L',13,7],['R',16,10]]){
  inBone(bone,j['ankle'+s],()=>{
   for(const [part,width,y,thick] of [[19,.049,-.111,.002],[25,.048,-.102,.009],[18,.046,-.093,.003]])loft(mesh,24,6,(t,a)=>{
    const z=(t*2-1)*.85,tip=Math.max(0,(Math.abs(z)-.64)/.21),end=Math.sqrt(Math.max(.01,1-tip*tip));
    return {p:[width*(.86+.14*(z/.85)**2)*end*Math.cos(a),y+thick*Math.sin(a)+.065*tip*tip,z],
     a:{...attr(part,bone),tone:part===18?Math.max(0,Math.min(1,.5+(Math.abs(z+.28*Math.cos(a))-.3)/.06)):1}};
   },{reverse:false});
   for(const z of [-.20,.17]){
    solid(mesh,[0,-.079,z],[.052,.017,.046],4,()=>attr(26,bone),undefined,3);
    solid(mesh,[0,-.055,z],[.038,.015,.027],4,()=>attr(20,bone),undefined,2);
   }
   // Heel tower/lever and split toe wings read as different mechanisms.
   solid(mesh,[0,-.038,.20],[.036,.032,.024],4,()=>attr(26,bone),undefined,2);
   solid(mesh,[0,-.010,.225],[.027,.010,.027],4,()=>attr(20,bone),undefined,2);
   for(const x of [-.045,.045])solid(mesh,[x,-.045,-.18],[.012,.026,.026],4,()=>attr(26,bone),undefined,2);
   for(const y of [.015,.065])solid(mesh,[.055,y,-.035],[.012,.008,.027],4,()=>attr(20,bone),undefined,1);
  });
  inBone(hand===7?6:9,j['hand'+s],()=>{
   const bone=hand===7?6:9;
   loft(mesh,3,16,(t,a)=>({p:[(.074-.013*t)*Math.cos(a),-.12+.14*t,(.074-.013*t)*Math.sin(a)],a:attr(27,bone)}),{reverse:true});
  });
  const pole=hand===7?20:21;
  inBone(pole,j['hand'+s],()=>{
   // -Y is the shaft direction. Split the grip-side geometry for first person.
   for(const [part,from,to]of [[21,.36,1.16],[21,.039,.36]])loft(mesh,2,8,(t,a)=>({p:[.007*Math.cos(a),-from-(to-from)*t,.007*Math.sin(a)],a:attr(part,pole)}),{reverse:false});
   solid(mesh,[0,0,0],[.016,.039,.016],4,()=>attr(22,pole),undefined,2);
   // Closed torus basket, 7cm above the tip; total pole length below 1.20m.
   loft(mesh,12,6,(t,a)=>{const theta=t*Math.PI*2,r=.043+.006*Math.cos(a);return {p:[r*Math.cos(theta),-1.09+.006*Math.sin(a),r*Math.sin(theta)],a:attr(23,pole)};},{loop:true,reverse:false});
  });
  inBone(hand,j['hand'+s],()=>{
   loft(mesh,12,6,(t,a)=>{const theta=t*Math.PI*2;return {p:[.074*Math.cos(theta)+.004*Math.cos(a)*Math.cos(theta),.034*Math.sin(theta)+.004*Math.cos(a)*Math.sin(theta),.009+.004*Math.sin(a)],a:attr(24,hand)};},{loop:true});
  });
 }
}
