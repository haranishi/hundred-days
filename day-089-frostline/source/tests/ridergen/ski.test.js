import {beforeAll,it,expect} from 'vitest';
import {Triangle,Vector3} from 'three';
import {buildModel} from '../../tools/ridergen/model.mjs';
import {encodeModel} from '../../tools/ridergen/format.mjs';
import {skinMesh,exportedModel,inversionStats} from '../../tools/ridergen/preview.mjs';
import {skiPoses} from '../../tools/ridergen/ski-preview.mjs';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
let model,encoded;
beforeAll(()=>{model=buildModel();encoded=encodeModel(model);});
it('preserves every original board vertex attribute and triangle byte for byte',()=>{
 const old=JSON.parse(readFileSync(new URL('./board-geometry.json',import.meta.url))),bin=Buffer.alloc(old.bytes);
 for(const [name,a]of Object.entries(old.attributes)){
  const b=encoded.meta.attributes[name],size={Float32Array:4,Uint16Array:2,Int16Array:2,Uint8Array:1}[a.type];
  encoded.bin.copy(bin,a.offset,b.offset,b.offset+a.count*size);
 }
 expect(createHash('sha256').update(bin).digest('hex')).toBe(old.sha256);
});
it('appends ski-only rigid parts, retains 22 bones and respects the ski asset budget',()=>{
 expect(model.parts.slice(18).map(p=>p.name)).toEqual(['ski','skiEdge','skiBinding','poleShaft','poleGrip','poleBasket','poleStrap','skiSide','skiBindingBody','skiCuff']);
 expect(model.bones).toHaveLength(22);expect(model.bones.slice(20).map(b=>b.name)).toEqual(['poleL','poleR']);expect(model.mesh.tri.length).toBeLessThanOrEqual(40000);expect(encoded.bin.length+Buffer.byteLength(encoded.json)).toBeLessThanOrEqual(1000000);
 for(const a of model.mesh.a.filter(a=>a.part>=18))expect(a.weights).toHaveLength(1);
});
it('authors 1.70m twin-tip skis with 9–10cm edges on both foot bones',()=>{
 const m=model.mesh;
 for(const bone of [13,16]){
  const b=model.bones[bone],local=m.p.flatMap((p,i)=>m.a[i].part===19&&m.a[i].weights[0][0]===bone?[p].map(p=>[0,1,2].map(axis=>p.reduce((sum,v,k)=>sum+(v-b.position[k])*b.basis[axis*3+k],0))):[]);
  const range=k=>Math.max(...local.map(p=>p[k]))-Math.min(...local.map(p=>p[k]));
  expect(range(2)).toBeCloseTo(1.7,5);expect(range(0)).toBeGreaterThan(.09);expect(range(0)).toBeLessThan(.10);
  for(const z of [-.8,.8])expect(Math.min(...local.filter(p=>Math.sign(p[2])===Math.sign(z)&&Math.abs(p[2])>.8).map(p=>p[1]))).toBeGreaterThan(-.06);
 }
});
// 2026-11-11：決まりを「裏返りが 0 面」から「曲げた腕の関節の内側だけ・合わせて 8 cm² まで」へ変えた。
// 0 面を守れたのは、ひじを肩の高さまで横へ張り出す腕（元の形の腕の開きに近い）のときだけだった。その腕は、実際の画面で、
// 肩を怒らせた人形に見えた（見た目の採点 3 周目の前に、設計役が撮って確かめた）。ひじを下げた自然な腕では、脇の内側で、
// 服の面が数 cm² 折り重なる（腕と胸に隠れて、外からは見えない）。それより広い裏返り・腕の関節の外の裏返りは、いままでどおり通さない。
// 低い姿勢で、こぶしをあごの高さまで上げたときは 113 cm² 裏返ったので、こぶしを胸の前へ下げてある（ski-pose.js）
it.each(skiPoses().map(([name])=>name))('keeps the ski %s surface outward after skinning (folds only inside arm joints, <= 8 cm2)',name=>{
 const actual=exportedModel(model),p=skiPoses().find(([n])=>n===name)[1],stats=inversionStats(actual,p);
 expect(stats.ignored).toBe(0);expect(stats.area).toBeLessThanOrEqual(8e-4);
 for(const joint of Object.keys(stats.joints))expect(joint).toMatch(/^(chest\+upperArm[LR]|chest\+clavicle[LR]|clavicle[LR]\+upperArm[LR]|forearm[LR]\+upperArm[LR])$/);
});
it('keeps ski poles within 1.15–1.20m including grip, wrist loop and basket',()=>{
 const m=model.mesh;
 for(const bone of [20,21]){
  const b=model.bones[bone],ys=m.p.flatMap((p,i)=>m.a[i].part>=21&&m.a[i].part<=24&&m.a[i].weights[0][0]===bone?[p.reduce((sum,v,k)=>sum+(v-b.position[k])*b.basis[k+3],0)]:[]);
  const length=Math.max(...ys)-Math.min(...ys);expect(length).toBeGreaterThanOrEqual(1.15);expect(length).toBeLessThanOrEqual(1.20);
 }
});

function localVertices(part,bone){
 const m=model.mesh,b=model.bones[bone];return m.p.flatMap((p,i)=>m.a[i].part===part&&m.a[i].weights[0][0]===bone?[[0,1,2].map(axis=>p.reduce((v,x,k)=>v+(x-b.position[k])*b.basis[axis*3+k],0))]:[]);
}
it('I18d builds a 14mm+ dark sidewall under a separate top and metal edge',()=>{
 for(const bone of [13,16]){
  const dark=localVertices(25,bone).filter(p=>Math.abs(p[2])<.3),top=localVertices(18,bone),edge=localVertices(19,bone);
  expect(Math.max(...dark.map(p=>p[1]))-Math.min(...dark.map(p=>p[1]))).toBeGreaterThanOrEqual(.014);
  expect(Math.min(...top.map(p=>p[1]))).toBeGreaterThan(Math.min(...dark.map(p=>p[1])));
  expect(Math.min(...edge.map(p=>p[1]))).toBeLessThan(Math.min(...dark.map(p=>p[1])));
  const mechanisms=localVertices(26,bone);expect(mechanisms.some(p=>p[2]<-.16)).toBe(true);expect(mechanisms.some(p=>p[2]>.20&&p[1]>-.03)).toBe(true);
 }
});
it('I18d authors 32mm black grips, exposed loop straps and closed baskets',()=>{
 for(const bone of [20,21]){
  expect(Math.max(...localVertices(22,bone).map(p=>Math.abs(p[1])))).toBeLessThanOrEqual(.04);
  const shaft=localVertices(21,bone);expect(Math.max(...shaft.map(p=>p[1]))).toBeCloseTo(Math.min(...localVertices(22,bone).map(p=>p[1])),5);
  const grip=localVertices(22,bone).filter(p=>Math.abs(p[0])>.014),strap=localVertices(24,bone===20?7:10);
  expect(Math.max(...grip.map(p=>p[0]))-Math.min(...grip.map(p=>p[0]))).toBeCloseTo(.032,5);
  expect(Math.max(...strap.map(p=>Math.abs(p[0])))).toBeGreaterThan(.07);
  // Every torus edge has two incident faces, from either viewing hemisphere.
  const edges=new Map();for(const t of model.mesh.tri.filter(t=>model.mesh.a[t[0]].part===23&&model.mesh.a[t[0]].weights[0][0]===bone))for(let k=0;k<3;k++){
   const key=[t[k],t[(k+1)%3]].sort((a,b)=>a-b).join(':');edges.set(key,(edges.get(key)||0)+1);
  }
  expect([...edges.values()].every(n=>n===2)).toBe(true);
 }
});

// Measure the glove surface against the real skinned ski triangles (metres).
it.each([1,2,3])('I18d grab %s puts the glove within 2cm of the authored ski edge',grab=>{
 const actual=exportedModel(model),p=skiPoses().find(([n])=>n==='grab-'+grab)[1],m=skinMesh(actual,p),bone=grab===2?6:9,foot=16;
 const glove=m.p.filter((v,i)=>m.a[i].part===2&&m.a[i].weights.some(([b,w])=>b===bone&&w>.9));
 const tris=m.tri.filter(t=>[18,19].includes(m.a[t[0]].part)&&m.a[t[0]].weights.some(([b,w])=>b===foot&&w>.9));
 let gap=Infinity;const triangle=new Triangle(),point=new Vector3(),closest=new Vector3();
 for(const v of glove)for(const t of tris){triangle.set(...t.map(i=>new Vector3(...m.p[i])));point.set(...v);triangle.closestPointToPoint(point,closest);gap=Math.min(gap,point.distanceTo(closest));}
 expect(gap).toBeLessThanOrEqual(.02);
 // The visible metal shaft begins past the grip; it clears the ski top plane.
 const ankle=p.joints.ankleR,up=p.board.up;
 const heights=m.p.flatMap((v,i)=>m.a[i].part===21&&m.a[i].weights.some(([b,w])=>b===(grab===2?20:21)&&w>.9)?[(v[0]-ankle.x)*up.x+(v[1]-ankle.y)*up.y+(v[2]-ankle.z)*up.z+.09]:[]);
 // 2026-11-11：つかむ手の棒は、板に沿わせて後ろへ流す（後ろ上へ立てると、しゃがんだ体の背中の前を横切って見えた）。
 // 板の面からの高さは、6 cm から 4 cm へ下げた（板には当たらない）
 expect(Math.min(...heights.map(Math.abs))).toBeGreaterThanOrEqual(.04);
});
