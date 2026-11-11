// Acceptance measurements in the physical forward/up/right frame (metres).
import {POLE_ARM_FREE,POLE_BASKET_CLEAR} from '../../src/render/ride/ski-pose.js';
export const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
export const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
export const advance=(a,d,t)=>({x:a.x+d.x*t,y:a.y+d.y*t,z:a.z+d.z*t});
export function pointSegment(p,a,b){const d=sub(b,a),t=Math.max(0,Math.min(1,dot(sub(p,a),d)/(dot(d,d)||1)));return Math.hypot(...Object.values(sub(p,advance(a,d,t))));}
export function capsules(p){const j=p.joints,b=p.board,list=[[j.pelvis,j.neck,.15,'torso']];
 for(const s of ['L','R']){const a=j['ankle'+s],boot=advance(a,b.up,-.035);list.push([j['shoulder'+s],j['elbow'+s],.070,'upperArm'+s],[j['elbow'+s],j['hand'+s],.055,'forearm'+s],[j['hip'+s],j['knee'+s],.11,'thigh'+s],[j['knee'+s],a,.085,'shin'+s],[advance(boot,b.fwd,-.10),advance(boot,b.fwd,.14),.067,'boot'+s]);}return list;
}
// 2026-11-11：測り方を、姿勢の決め方（ski-pose.js の carryPole）にそろえた。
// ・同じ側の腕：握りのすぐ後ろは前腕。棒は握りの下から出るので、握りから POLE_ARM_FREE（30 cm）までは、近さを見ない。
//   低い姿勢（p.poleHug）では、棒を脇に挟むので、同じ側の腕は見ない。
// ・横の成分と、輪と板の離れ：切るときの外側の棒は、傾いた体の枠（p.poleBasis）で測る。雪の面の枠で測ると、
//   体と一緒に傾いた自然な棒が「真横」「板の真上」と数えられる（先は、雪から 50 cm 上の空中にある）。
// ・輪と板の離れ（edgeGap）：輪が、板の面から 45 cm より高い所にあるときは、数えない（板に重ならない）。
export function measures(p){const j=p.joints,b=p.board,r=p.skiSurface.right,u=p.skiSurface.up;
 // 棒の始まりは、握りのまん中（p.poleGrip）。「かかとより後ろ」は、制動では体の向きで測る（板は横を向く）
 const out={},back=p.poleSkidding?p.chestFwd:b.fwd;for(const s of ['L','R']){const hand=p.poleGrip?.[s]??j['hand'+s],d=p.poleDirs[s],tip=advance(hand,d,1.16),basket=advance(hand,d,1.09);let clearance=Infinity,hit;
  const side=p.poleBasis?.[s]?.right??p.poleRight??r,gapAxis=p.poleSkidding?r:side;
  for(let i=0;i<=128;i++){const t=.13+1.03*i/128,q=advance(hand,d,t);for(const [a,b,r,name]of capsules(p)){
   if(name==='forearm'+s||name==='upperArm'+s){if(p.poleHug||t<POLE_ARM_FREE)continue;}
   const gap=pointSegment(q,a,b)-r-.007;if(gap<clearance){clearance=gap;hit=name;}}}
  out[s]={lateral:Math.abs(dot(d,side)),tipHeight:dot(sub(tip,b.pos),u),edgeGap:dot(sub(basket,b.pos),b.up)>=POLE_BASKET_CLEAR?Infinity:Math.min(...['L','R'].map(s=>Math.abs(dot(sub(basket,j['ankle'+s]),gapAxis))-.049-.043)),behindHeel:dot(sub(tip,j['ankle'+s]),back)+.18,clearance,hit};
 }return out;
}
