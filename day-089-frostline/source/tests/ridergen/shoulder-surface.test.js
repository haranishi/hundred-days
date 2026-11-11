import {beforeAll,it,expect} from 'vitest';
import {buildModel} from '../../tools/ridergen/model.mjs';
import {exportedModel,skinMesh,realPoses,CAPTURE_VIEWS} from '../../tools/ridergen/preview.mjs';
import {dot,unit,sub,cross} from '../../tools/ridergen/sdf.mjs';
let model;
beforeAll(()=>{model=exportedModel(buildModel());});
it('joins the torso and both sleeves in one welded surface, with neighboring shoulder normals within 35°',()=>{
 const m=model.mesh,parent=m.p.map((_,i)=>i),root=i=>{while(parent[i]!==i)i=parent[i];return i;};
 for(const t of m.tri)if(m.a[t[0]].part===0)for(const i of t)parent[root(i)]=root(t[0]);
 const arm=bone=>m.a.findIndex(a=>a.part===0&&a.weights.some(([b,w])=>b===bone&&w>.7));
 const component=root(arm(5));expect(root(arm(8))).toBe(component);
 const torso=m.a.findIndex((a,i)=>a.part===0&&Math.abs(m.p[i][2])<.08&&m.p[i][1]>1.2&&m.p[i][1]<1.3);
 expect(root(torso)).toBe(component);
 const shoulders=['L','R'].map(s=>Object.values(model.pose.joints['shoulder'+s]));let count=0,max=0;
 for(const t of m.tri)if(root(t[0])===component)for(let k=0;k<3;k++){
  const a=t[k],b=t[(k+1)%3];if(!shoulders.some(s=>Math.hypot(...sub(m.p[a],s))<.145&&Math.hypot(...sub(m.p[b],s))<.145))continue;
  const angle=Math.acos(Math.max(-1,Math.min(1,dot(unit(m.n[a]),unit(m.n[b])))))*180/Math.PI;max=Math.max(max,angle);count++;
  expect(m.a[a].seam).toBe(1); // no attachment ring in geometry or AO/seam attributes
 }
 expect(count).toBeGreaterThan(200);expect(max).toBeLessThanOrEqual(35);
 console.info('shoulder maximum neighboring normal angle',max);
});
it('leaves at least the top third of the helmet above the pack in the low rear grab view',()=>{
 for(const [name,pose]of realPoses().filter(([n])=>['grab','air-ready'].includes(n))){
  const [, ,distance,az,el]=CAPTURE_VIEWS.find(([n])=>n==='6-air-grab-1'),a=az*Math.PI/180,e=el*Math.PI/180;
  const direction=unit([-Math.sin(a)*Math.cos(e),Math.sin(e),Math.cos(a)*Math.cos(e)]),up=cross(direction,unit(cross([0,1,0],direction))),center=Object.values(pose.joints.pelvis),m=skinMesh(model,pose);
  const heights=part=>m.p.filter((_,i)=>m.a[i].part===part).map(p=>{const v=sub(p,center);return dot(v,up)*distance/(distance-dot(v,direction));});
  const helmet=heights(5),pack=heights(11),ratio=(Math.max(...helmet)-Math.max(...pack))/(Math.max(...helmet)-Math.min(...helmet));
  expect(ratio,name).toBeGreaterThanOrEqual(1/3);console.info('helmet exposure against pack',name,ratio);
 }
});
