import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {buildProps} from '../../tools/propgen/model.mjs';
import {encodeProps} from '../../tools/propgen/format.mjs';
import {cross,sub,dot} from '../../tools/propgen/mesh.mjs';
const models=buildProps(),encoded=encodeProps(models);
const limits={'lodge':14000,'chalet-a':2600,'chalet-b':2600,'chalet-c':2600,bridge:2500,'lift-tower':500,'lift-chair':220,'lift-station':2200,fence:120,'boulder-a':260,'boulder-b':260};
const dimensions={lodge:[[46,51],[14,16],[19,24]],'chalet-a':[[10.7,15.7],[6,9],[8.5,13.5]],'chalet-b':[[12.2,17.2],[7,9],[9.85,14.85]],'chalet-c':[[13.7,18.7],[7.5,9],[10.15,15.15]],bridge:[[22,23],[4,5],[4,4.5]],'lift-tower':[[6,6.5],[9.9,10.1],[1.2,1.4]],'lift-chair':[[1.19,1.21],[3.2,3.4],[.6,.8]],'lift-station':[[14,14.5],[5.9,6.1],[8,8.5]],fence:[[3,3.1],[1.1,1.2],[.2,.3]],'boulder-a':[[2,3],[1.5,2.2],[1.5,2.5]],'boulder-b':[[4,5.5],[2.8,3.5],[3,4.2]]};
describe('prop geometry',()=>{
 it('has fourteen unique assets and twenty uniquely named LOD meshes',()=>{expect(new Set(models.map(m=>m.name)).size).toBe(14);expect(models.length).toBe(20);expect(new Set(models.map(m=>m.name+'/'+m.lod)).size).toBe(20);});
 it.each(models.map(m=>[m.name+'/'+m.lod,m]))('%s respects independent budgets, dimensions, orientation and nondegeneracy',(_,m)=>{
  const limit=m.name.startsWith('fir-')?{near:1400,mid:320,far:40}[m.lod]:limits[m.name];expect(m.tri.length).toBeLessThanOrEqual(limit);
  expect(m.bounds.min[1]).toBeGreaterThanOrEqual(-1e-7);expect(m.bounds.min[1]).toBeLessThanOrEqual(.1);
  const ranges=dimensions[m.name]??[[2,6.5],[{'fir-a':9,'fir-b':15.5,'fir-c':13}[m.name],{'fir-a':9.2,'fir-b':15.5,'fir-c':13}[m.name]],[2,6.5]];
  m.bounds.size.forEach((v,k)=>{expect(v).toBeGreaterThanOrEqual(ranges[k][0]);expect(v).toBeLessThanOrEqual(ranges[k][1]);});
  for(const t of m.tri){const p=t.map(i=>m.p[i]),n=cross(sub(p[1],p[0]),sub(p[2],p[0]));expect(Math.hypot(...n)).toBeGreaterThan(1e-9);for(const i of t){expect(dot(n,m.n[i])).toBeGreaterThan(0);expect(Math.hypot(...m.n[i])).toBeCloseTo(1,6);}}
  // Piece centroids are independent of the supplied shading normals. They catch
  // a fully reversed solid even if its normals were reversed at the same time.
  for(const s of m.shells)for(const t of m.tri.slice(s.start,s.start+s.count)){const p=t.map(i=>m.p[i]),n=cross(sub(p[1],p[0]),sub(p[2],p[0])),c=[0,1,2].map(k=>p.reduce((v,p)=>v+p[k],0)/3);expect(dot(n,sub(c,s.center))).toBeGreaterThan(0);}
  if(!['lift-tower','lift-chair'].includes(m.name))expect(m.material).toContain(2);expect(m.ao.some(v=>v>0)).toBe(true);
 });
 it('has deterministic bytes and JSON within the total 2.5MB budget',()=>{const second=encodeProps(buildProps());expect(Buffer.compare(encoded.bin,second.bin)).toBe(0);expect(encoded.json===second.json).toBe(true);expect(encoded.bin.length+Buffer.byteLength(encoded.json)).toBeLessThanOrEqual(2500000);});
 it('checked-in payload exactly matches the default generator',()=>{expect(Buffer.compare(readFileSync('public/models/props-v1.bin'),encoded.bin)).toBe(0);expect(readFileSync('public/models/props-v1.json','utf8')===encoded.json).toBe(true);});
 it('exports two upward snow roof planes per gable, lying on actual snow vertices',()=>{
  for(const m of models.filter(m=>m.roofs.length)){expect(m.roofs.length).toBe(({lodge:10,'chalet-a':4,'chalet-b':4,'chalet-c':6}[m.name]??2));for(const roof of m.roofs){const [a,b,c]=roof.corners;expect(cross(sub(b,a),sub(c,a))[1]).toBeGreaterThan(0);for(const p of roof.corners)expect(m.p.some((q,i)=>m.material[i]===2&&q.every((v,k)=>Math.abs(v-p[k])<1e-8))).toBe(true);}}
 });
 it('bridge crown is 2.2m above the ends, with 4m deck width and continuous snow',()=>{
  const m=models.find(m=>m.name==='bridge');expect(m.deck).toMatchObject({length:22,width:4,rise:2.2,axis:'X'});
  for(let i=0;i<=16;i++){const x=-11+i*22/16,y=2.2*(1-(x/11)**2)+1.11;expect(m.p.some((p,k)=>m.material[k]===2&&Math.abs(p[0]-x)<1e-6&&Math.abs(p[1]-y)<1e-6&&Math.abs(p[2])===2)).toBe(true);}
 });
 it('all tree LODs keep their ground anchor and tip height',()=>{for(const name of ['fir-a','fir-b','fir-c']){const lods=models.filter(m=>m.name===name);expect(lods.map(m=>m.lod)).toEqual(['near','mid','far']);for(const m of lods){expect(m.bounds.min[1]).toBe(0);expect(m.bounds.max[1]).toBeCloseTo(lods[0].bounds.max[1],6);expect(m.collision.type).toBe('circle');expect(m.collision.radius).toBe(lods[0].collision.radius);expect(m.collision.height).toBeCloseTo(lods[0].collision.height,8);}}});
 it('builds at least 10cm of snow above the wooden roof and boulder tops',()=>{for(const m of models.filter(m=>m.name.startsWith('boulder-'))){const snow=Math.max(...m.p.filter((p,i)=>m.material[i]===2).map(p=>p[1])),stone=Math.max(...m.p.filter((p,i)=>m.material[i]===1).map(p=>p[1]));expect(snow-stone).toBeGreaterThan(.1);}for(const m of models.filter(m=>m.roofs.length)){const wood=m.p.filter((p,i)=>m.material[i]===0);for(const r of m.roofs){const corner=r.corners[1];expect(wood.some(p=>Math.abs(p[0]-corner[0])<.2&&Math.abs(p[2]-corner[2])<1e-5&&corner[1]-p[1]>.1)).toBe(true);}}});
});
