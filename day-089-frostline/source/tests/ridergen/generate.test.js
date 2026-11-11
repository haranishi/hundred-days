import {beforeAll,it,expect} from 'vitest';
import {buildModel} from '../../tools/ridergen/model.mjs';
import {encodeModel} from '../../tools/ridergen/format.mjs';
import {readRiderData} from '../../src/render/ride/rider-data.js';
import {bendPose,exportedModel,realPoses,inversionStats} from '../../tools/ridergen/preview.mjs';
import {sub,cross,dot} from '../../tools/ridergen/sdf.mjs';
let model,encoded;
beforeAll(()=>{model=buildModel();encoded=encodeModel(model);},90000);
it('is byte deterministic, in budget, and generates within 90 seconds',()=>{const start=performance.now(),other=encodeModel(buildModel());expect(other.bin.equals(encoded.bin)).toBe(true);expect(other.json).toBe(encoded.json);expect(performance.now()-start).toBeLessThan(90000);expect(model.mesh.tri.length).toBeLessThanOrEqual(40000);expect(encoded.bin.length+Buffer.byteLength(encoded.json)).toBeLessThanOrEqual(1000000);});
it('has closed manifold components, consistent winding and no degenerate faces',()=>{const mesh=model.mesh,edges=new Map();
 for(const t of mesh.tri){const n=cross(sub(mesh.p[t[1]],mesh.p[t[0]]),sub(mesh.p[t[2]],mesh.p[t[0]]));expect(Math.hypot(...n)).toBeGreaterThan(1e-12);
  for(let k=0;k<3;k++){const a=t[k],b=t[(k+1)%3],key=Math.min(a,b)+':'+Math.max(a,b),v=edges.get(key)||[0,0];v[0]++;v[1]+=a<b?1:-1;edges.set(key,v);}
 }
 expect([...edges.values()].filter(([count,balance])=>count!==2||balance!==0)).toHaveLength(0);
});
it('has unit, nonnegative weights and single-bone rigid equipment',()=>{const d=readRiderData(encoded.bin.buffer.slice(encoded.bin.byteOffset,encoded.bin.byteOffset+encoded.bin.byteLength),encoded.meta);
 for(let i=0;i<d.metadata.vertexCount;i++){let sum=0;for(let k=0;k<4;k++){expect(d.skinWeight[i*4+k]).toBeGreaterThanOrEqual(0);sum+=d.skinWeight[i*4+k];}expect(sum).toBeCloseTo(1,6);}
 expect([...new Set(d.part)].sort((a,b)=>a-b)).toEqual(model.parts.filter(p=>p.id!==16).map(p=>p.id)); // graphic (16) is retained as a reserved palette slot; tone replaces its geometry.
 for(const t of model.mesh.tri)expect(new Set(t.map(i=>model.mesh.a[i].part)).size).toBe(1);
});
it('keeps synthetic 90 degree bends within ten flipped faces',()=>{
 const actual=exportedModel(model),stats=inversionStats(actual,bendPose(actual.pose));
 expect(stats.ignored).toBe(0);expect(stats.flipped).toBeLessThanOrEqual(10);
});
it.each(['stand','toe','heel','crouch','grab','air-ready','deep-toe','deep-heel'])('has zero inverted triangles in actual solvePose %s',name=>{
 const actual=exportedModel(model),pose=realPoses().find(([n])=>n===name)[1],stats=inversionStats(actual,pose);
 expect(stats.ignored).toBe(0);expect(stats.flipped).toBe(0);
});
it('all closed connected shells have outward winding',()=>{
 const m=model.mesh,parent=m.p.map((_,i)=>i),root=i=>{while(parent[i]!==i)i=parent[i];return i;};
 for(const t of m.tri)for(const i of t)parent[root(i)]=root(t[0]);
 const volumes=new Map();for(const [a,b,c]of m.tri){const key=root(a);volumes.set(key,(volumes.get(key)||0)+dot(m.p[a],cross(m.p[b],m.p[c]))/6);}
 for(const volume of volumes.values())expect(volume).toBeGreaterThan(1e-10);
});
it('exports distance seams, continuous tone and a single pants color',()=>{
 const actual=exportedModel(model);let near=0,far=0,first=0,second=0;
 for(const a of actual.mesh.a){expect(a.seam).toBeGreaterThanOrEqual(0);expect(a.seam).toBeLessThanOrEqual(1);expect(Number.isFinite(a.tone)).toBe(true);
  if(a.part===1)expect(a.tone).toBe(1);
  if(a.part===0){if(a.seam<.05)near++;if(a.seam>.9)far++;if(a.tone>.6)first++;if(a.tone<.4)second++;}
 }
 expect(Math.min(near,far,first,second)).toBeGreaterThan(30);
});

function components(mesh,part){
 const parent=mesh.p.map((_,i)=>i),root=i=>{while(parent[i]!==i)i=parent[i];return i;};
 for(const t of mesh.tri)if(mesh.a[t[0]].part===part)for(const i of t)parent[root(i)]=root(t[0]);
 const groups=new Map();for(let i=0;i<mesh.p.length;i++)if(mesh.a[i].part===part){const r=root(i);if(!groups.has(r))groups.set(r,[]);groups.get(r).push(i);}
 return [...groups.values()];
}
it('keeps the hip-height hem independent of thighs and disables its flutter',()=>{
 const h=model.pose.joints.pelvis.y,m=model.mesh;
 // Inspect the torso component, excluding sleeves that also reach hip height.
 const torso=components(m,0).sort((a,b)=>b.length-a.length)[0];
 const hem=torso.filter(i=>m.p[i][1]<=h+.03&&Math.abs(m.p[i][2])<.23);
 expect(hem.length).toBeGreaterThan(100);
 for(const i of hem){expect(m.p[i][1]).toBeGreaterThanOrEqual(h-1e-9);expect(m.a[i].weights.every(([b])=>b===0||b===1)).toBe(true);expect(m.a[i].flutter).toBe(0);}
});
it('has no trouser top disk and a fabric neck at least sixty percent of helmet width',()=>{
 const h=model.pose.joints.pelvis.y,m=model.mesh;
 const top=ids=>Math.max(...ids.map(i=>m.p[i][1]));
 const waist=components(m,1).sort((a,b)=>top(b)-top(a))[0];
 expect(top(waist)).toBeGreaterThan(h+.09);
 // The top has an annular lip; no fan centre across the waistband opening.
 for(const i of waist.filter(i=>m.p[i][1]>h))expect(Math.hypot(m.p[i][0],m.p[i][2])).toBeGreaterThan(.07);
 const width=part=>{const z=m.p.filter((_,i)=>m.a[i].part===part).map(p=>p[2]);return Math.max(...z)-Math.min(...z);};
 expect(width(3)/width(5)).toBeGreaterThanOrEqual(.6);
});
