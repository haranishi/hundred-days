import * as THREE from '../vendor/three.js';
import { mergeParts } from './sets.js';
import { progressAtSpeed } from './physics.js';
// P1：追い越す相手のうち4種だけを画面に出す（PLAN-v3 P1）。同時に1体、追い越す前後の約2.4秒だけ。
// 相手との位置関係は「最大推力で何秒先の速さか」の差で決める：追い越す前は前方、追い越すと後ろへ下がる。
export const RIVALS=Object.freeze([
  {id:'snail',milestone:0,speed:.05,x:-1.35,y:0},
  {id:'shinkansen',milestone:8,speed:320,x:-2.35,y:0},
  {id:'airliner',milestone:11,speed:900,x:-3.2,y:5.2},
  {id:'station',milestone:15,speed:27600,x:-3.4,y:2.6}
].map(r=>Object.freeze(r)));
// 1秒ぶんの速さの差を何単位の前後差にするか。前方8単位〜後方4単位の間だけ見せる＝最大推力で約2.4秒。
export const RIVAL_SPACING=5,RIVAL_AHEAD=8,RIVAL_BEHIND=4;
export function rivalAt(speed){
  const p=progressAtSpeed(speed);let best=null;
  for(const r of RIVALS){const z=RIVAL_SPACING*(p-progressAtSpeed(r.speed));if(z>=-RIVAL_AHEAD&&z<=RIVAL_BEHIND&&(!best||Math.abs(z)<Math.abs(best.z)))best={...r,z};}
  return best;
}
const box=new THREE.BoxGeometry(1,1,1),sphere=new THREE.SphereGeometry(1,10,8),cyl=new THREE.CylinderGeometry(1,1,1,10),cone=new THREE.ConeGeometry(1,1,10),torus=new THREE.TorusGeometry(1,.45,6,12);
// どれも −Z（猫と同じ向き）へ進む形。底面 y=0。
export function rivalGeometries(){
  return {
    // カタツムリは道の色に溶けないよう、濃い茶の殻に明るい渦を入れ、体は灰緑にする。
    snail:mergeParts([[torus,0x7a3f1d,0,.78,.2,.62,.62,.62,0,Math.PI/2,0],[torus,0xf2c46b,.02,.78,.2,.36,.36,.36,0,Math.PI/2,0],[sphere,0x5c2e14,0,.78,.2,.3,.3,.3],[box,0x9fb08a,0,.16,-.1,.42,.32,1.8],[cyl,0x9fb08a,-.13,.6,-.9,.05,.6,.05,.3,0,0],[cyl,0x9fb08a,.13,.6,-.9,.05,.6,.05,.3,0,0],[sphere,0x1e1e1e,-.13,.92,-1.02,.08,.08,.08],[sphere,0x1e1e1e,.13,.92,-1.02,.08,.08,.08]]),
    shinkansen:mergeParts([[box,0xf2f4f5,0,.6,.6,1.05,1,3.8],[cone,0xf2f4f5,0,.55,-2.05,.52,1.6,.52,-Math.PI/2,0,0],[box,0x1e8a55,0,.42,.6,1.07,.12,3.82],[box,0x223344,0,.82,.6,1.07,.2,3.4],[box,0x223344,0,.72,-1.55,.7,.18,.5,.35,0,0],[box,0x9aa3a8,0,.08,.6,.9,.16,3.8]]),
    airliner:mergeParts([[cyl,0xf4f6f8,0,0,0,.34,4.2,.34,Math.PI/2,0,0],[cone,0xf4f6f8,0,0,-2.35,.34,.55,.34,-Math.PI/2,0,0],[box,0xdfe4e8,0,-.05,.1,4.4,.08,.95],[box,0xdfe4e8,0,.1,1.85,1.5,.06,.5],[box,0x2d6fb5,0,.55,1.9,.07,.85,.6],[cyl,0x9aa3ab,-.9,-.28,.05,.13,.55,.13,Math.PI/2,0,0],[cyl,0x9aa3ab,.9,-.28,.05,.13,.55,.13,Math.PI/2,0,0],[box,0x2d6fb5,0,.12,-.2,.7,.06,2.6]]),
    station:mergeParts([[box,0xc9ced3,0,0,0,4.2,.16,.16],[cyl,0xe6e8ea,0,0,0,.26,1.2,.26,Math.PI/2,0,0],[cyl,0xe6e8ea,0,0,.9,.22,.8,.22,Math.PI/2,0,0],...[-1.7,-1.1,1.1,1.7].flatMap(x=>[[box,0x2b4f8f,x,.62,0,.5,.03,1.05],[box,0x2b4f8f,x,-.62,0,.5,.03,1.05],[box,0xb7bdc2,x,0,0,.05,1.25,.05]]),[box,0xd9c38c,0,.34,.2,.35,.3,.35]])
  };
}
export function createRivalView(){
  const group=new THREE.Group(),material=new THREE.MeshLambertMaterial({vertexColors:true,flatShading:true}),geometry=rivalGeometries(),meshes={};
  for(const [id,g] of Object.entries(geometry)){const m=new THREE.Mesh(g,material);m.visible=false;m.frustumCulled=false;group.add(m);meshes[id]=m;}
  let current=null;
  return {group,
    // catZ：猫の中心のz。相手は進行方向の奥（−Z）から近づき、追い越すと手前（+Z）へ下がる。
    update(speed,catZ,clock){
      const r=rivalAt(speed);current=r;for(const [id,m] of Object.entries(meshes))m.visible=Boolean(r&&r.id===id);
      if(!r)return null;const m=meshes[r.id];m.position.set(r.x,r.y+(r.id==='airliner'?Math.sin(clock*1.3)*.08:0),catZ+r.z);m.rotation.set(0,0,r.id==='station'?.2:r.id==='airliner'?Math.sin(clock*.9)*.05:0);
      return r;},
    stats:()=>current&&{id:current.id,z:+current.z.toFixed(2)}};
}
