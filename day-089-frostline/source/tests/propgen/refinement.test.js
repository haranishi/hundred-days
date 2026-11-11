import {it,expect} from 'vitest';
import {fir,firSkeleton} from '../../tools/propgen/nature.mjs';
import {building} from '../../tools/propgen/buildings.mjs';
import {station} from '../../tools/propgen/structures.mjs';
it('keeps seeded irregular skeletons with seven to eleven tiers and six to nine branches',()=>{
 for(let v=0;v<3;v++){
  const a=firSkeleton(v),b=firSkeleton(v);expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  expect(a.tiers.length).toBeGreaterThanOrEqual(7);expect(a.tiers.length).toBeLessThanOrEqual(11);
  for(const t of a.tiers){expect(t.branches.length).toBeGreaterThanOrEqual(6);expect(t.branches.length).toBeLessThanOrEqual(9);for(const b of t.branches){expect(b.patch).toBeGreaterThanOrEqual(.08);expect(b.patch).toBeLessThanOrEqual(.15);}}
  const gaps=a.tiers.slice(1).map((t,i)=>+(t.y-a.tiers[i].y).toFixed(4));expect(new Set(gaps).size).toBeGreaterThan(3);
 }
});
it('distinguishes young, tall and broad tree proportions and exposes the bottom trunk',()=>{
 const trees=[0,1,2].map(v=>fir(v,'near',4));
 expect(trees.map(m=>m.bounds.max[1])).toEqual([9,15.5,13]);
 const ratio=m=>m.bounds.size[0]/m.bounds.size[1];expect(ratio(trees[1])).toBeLessThan(ratio(trees[0]));expect(ratio(trees[2])).toBeGreaterThan(ratio(trees[0])*1.3);
 for(const m of trees){const lowest=Math.min(...m.p.filter((_,i)=>m.material[i]===5).map(p=>p[1]));expect(lowest).toBeGreaterThanOrEqual(m.bounds.max[1]*.145);}
});
it('far LOD uses intersecting vertical sheets with snow separated from foliage',()=>{
 for(let v=0;v<3;v++){
  const m=fir(v,'far',4);expect(m.tri.length).toBe(40);
  const green=m.p.filter((_,i)=>m.material[i]===5),white=m.p.filter((_,i)=>m.material[i]===2);
  expect(green.every(p=>Math.abs(p[0])<1e-8||Math.abs(p[2])<1e-8)).toBe(true);
  expect(white.every(p=>Math.min(Math.abs(p[0]),Math.abs(p[2]))>.001)).toBe(true);
 }
});
it('all snowy roofs have a raised middle shoulder, bevelled lip and icicles',()=>{
 for(const m of [...['lodge','chalet-a','chalet-b','chalet-c'].map(n=>building(n,4)),station(4)]){
  for(const r of m.roofs){const a=r.corners[0],ridge=r.corners.reduce((p,q)=>p[1]>q[1]?p:q),edge=r.corners.reduce((p,q)=>p[1]<q[1]?p:q);
   const high=r.corners.filter(p=>p[1]===ridge[1]).sort((a,b)=>Math.hypot(a[0]-edge[0],a[2]-edge[2])-Math.hypot(b[0]-edge[0],b[2]-edge[2]))[0];
   const axis=Math.abs(high[0]-edge[0])>Math.abs(high[2]-edge[2])?0:2,along=axis===0?2:0,slope=(high[1]-edge[1])/(high[axis]-edge[axis]);
   expect(m.p.some((p,i)=>m.material[i]===2&&Math.abs(p[along]-edge[along])<1e-8&&Math.min(edge[axis],high[axis])<p[axis]&&p[axis]<Math.max(edge[axis],high[axis])&&p[1]-(edge[1]+slope*(p[axis]-edge[axis]))>.15)).toBe(true);
  }
  // Thin double-sided icicle triangles have three snow vertices and a low tip.
  expect(m.tri.filter(t=>t.every(i=>m.material[i]===2)&&Math.max(...t.map(i=>m.p[i][1]))-Math.min(...t.map(i=>m.p[i][1]))>.3&&Math.max(...t.map(i=>m.p[i][2]))-Math.min(...t.map(i=>m.p[i][2]))<.1).length).toBeGreaterThanOrEqual(4);
 }
});
