import {beforeAll,it,expect} from 'vitest';
import {buildModel} from '../../tools/ridergen/model.mjs';
import {exportedModel,skinMesh,realPoses} from '../../tools/ridergen/preview.mjs';
import {visibleNeck,headTurns} from '../../tools/ridergen/audit.mjs';
let model;
beforeAll(()=>{model=exportedModel(buildModel());});
it.each([-60,0,60])('exposes at most 8cm of neck at yaw %s and true pitch ±20°',yaw=>{
 for(const {pitch,pose}of headTurns(model).filter(p=>p.yaw===yaw))expect(visibleNeck(model,pose,pitch)).toBeLessThanOrEqual(.08);
});
it('has a gaiter about 85% of helmet width and overlapping its lower rim',()=>{
 const m=model.mesh,points=part=>m.p.filter((_,i)=>m.a[i].part===part);
 const width=part=>Math.max(...points(part).map(p=>p[2]))-Math.min(...points(part).map(p=>p[2]));
 expect(width(3)/width(5)).toBeGreaterThanOrEqual(.83);expect(width(3)/width(5)).toBeLessThanOrEqual(.87);
 expect(Math.max(...points(3).map(p=>p[1]))).toBeGreaterThan(Math.min(...points(5).map(p=>p[1])));
});
it('keeps the whole pack at least 4cm below the shoulder line in bind and real poses',()=>{
 for(const pose of [model.pose,...realPoses().map(([,p])=>p)]){
  const mesh=skinMesh(model,pose),chest=pose.joints.chest,u=pose.chestUp;
  const top=Math.max(...mesh.p.filter((_,i)=>mesh.a[i].part===11).map(p=>(p[0]-chest.x)*u.x+(p[1]-chest.y)*u.y+(p[2]-chest.z)*u.z));
  expect(top).toBeLessThanOrEqual(.19-.04);
 }
 const p=model.mesh.p.filter((_,i)=>model.mesh.a[i].part===11);
 expect(Math.max(...p.map(p=>p[1]))-Math.min(...p.map(p=>p[1]))).toBeLessThanOrEqual(.275);
 expect(Math.max(...p.map(p=>p[0]))-Math.min(...p.map(p=>p[0]))).toBeLessThanOrEqual(.14);
});
it('exports dark crease valleys and bright cloth with the runtime AO convention',()=>{
 for(const part of [0,1]){
  const a=model.mesh.a.filter(a=>a.part===part&&a.wrinkle>.4);
  expect(Math.min(...a.map(a=>a.ao))).toBeLessThan(.4);
  expect(Math.max(...a.map(a=>a.ao))).toBeGreaterThan(.95);
 }
});
it('uses a low collar 6–8cm high and about 80% of shell width',()=>{
 const m=model.mesh,neck=model.pose.joints.neck.y;
 const collar=m.p.filter((p,i)=>m.a[i].part===0&&m.a[i].weights.some(([b,w])=>b===2&&w>.999)&&p[1]>neck);
 const height=Math.max(...collar.map(p=>p[1]))-Math.min(...collar.map(p=>p[1]));
 const width=points=>Math.max(...points.map(p=>p[2]))-Math.min(...points.map(p=>p[2]));
 const shell=m.p.filter((_,i)=>m.a[i].part===5);
 expect(height).toBeGreaterThanOrEqual(.06);expect(height).toBeLessThanOrEqual(.08);
 expect(width(collar)/width(shell)).toBeGreaterThan(.75);expect(width(collar)/width(shell)).toBeLessThan(.95);
});
it('keeps the folded hood within 1cm of jacket across its width, in bind and all real poses',()=>{
 // Seven independent surface contact bands prevent a detached ring from passing
 // just because one end touches. Vertex distance is an upper bound on surface gap.
 for(const pose of [model.pose,...realPoses().map(([,p])=>p)]){
  const m=skinMesh(model,pose),bind=model.mesh;
  const hood=bind.a.map((a,i)=>a.part===4?i:-1).filter(i=>i>=0);
  const jacket=bind.a.map((a,i)=>a.part===0&&bind.p[i][1]>model.pose.joints.neck.y-.1?i:-1).filter(i=>i>=0);
  for(const z of [-.09,-.06,-.03,0,.03,.06,.09]){
   const band=hood.filter(i=>Math.abs(bind.p[i][2]-z)<.015);let gap=Infinity;
   expect(band.length).toBeGreaterThan(0);
   for(const i of band)for(const j of jacket)gap=Math.min(gap,Math.hypot(...m.p[i].map((v,k)=>v-m.p[j][k])));
   expect(gap).toBeLessThanOrEqual(.01);
  }
 }
});

it('connects the hood front directly to the rear collar within 1cm',()=>{
 const m=model.mesh,hood=m.p.filter((_,i)=>m.a[i].part===4);
 const collar=m.p.filter((p,i)=>m.a[i].part===0&&p[1]>model.pose.joints.neck.y);
 let gap=Infinity;for(const a of hood)for(const b of collar)gap=Math.min(gap,Math.hypot(...a.map((v,k)=>v-b[k])));
 expect(gap).toBeLessThanOrEqual(.01);
});
