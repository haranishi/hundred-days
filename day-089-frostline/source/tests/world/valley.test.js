import {test,expect} from 'vitest';
import {lakeInside,lakeRadius} from '../../tools/worldgen/lib/alpine.js';
import {generateWorld} from '../../tools/worldgen/generate.mjs';
import {createWorld} from '../../src/world/index.js';
import {fixture} from './fixture.js';
import {routeFlow} from '../../tools/worldgen/lib/drainage.js';
import {bridgeDeck} from '../../src/world/structures.js';
test('lake is a real internal drainage outlet rather than a filled depression',()=>{
 const c={grid:32,cell:6,size:192},h=Float32Array.from({length:1024},(_,k)=>1180+Math.hypot(k%32-16,Math.floor(k/32)-16)*2),outlet=(x,z)=>Math.hypot(x,z)<20;
 const f=routeFlow(h,c,{outlet});expect(f.height[16*32+16]).toBe(h[16*32+16]);expect(f.receiver[16*32+16]).toBe(-1);
 let area=0;for(let k=0;k<h.length;k++)if(f.receiver[k]<0)area+=f.area[k];expect(area).toBe(192**2);
});
test('bridge overlay consistently changes height, normals and curvature without changing the lattice',()=>{
 const {meta,buffers}=fixture();meta.structures={bridge:{x:0,z:0,y:1100,yaw:Math.PI/2,length:22,width:4,rise:2.2},lodge:{x:2000,z:2000,y:1000,yaw:0,length:44,width:16},chalets:[],lift:{base:{x:2500,z:2500,y:1000,yaw:0,length:18,width:12},top:{x:2600,z:2600,y:1000,yaw:0,length:18,width:12},towers:[]}};
 const before=buffers.height.slice(),w=createWorld(meta,buffers);expect(w.heightAt(0,0)).toBeCloseTo(1102.2,8);expect(w.sampleSurface(0,0,{}).h).toBe(w.heightAt(0,0));expect(w.curvatureAlong(0,0,1,0)).toBeCloseTo(-4.4/121,5);expect(w.heightAt(0,8)).toBeLessThan(1100);expect(buffers.height).toEqual(before);
 const items=w.obstaclesNear(0,0,20,[]);expect(items.some(o=>o.id.startsWith('bridge-rail')&&o.type==='building')).toBe(true);expect(bridgeDeck(meta,NaN,0)).toBe(-Infinity);
});
test('valley publishes lake cells, pine-only forests, foundations, views and immutable reserved terrain',()=>{
 const a=generateWorld({quick:true,landscape:{iterations:12,cycles:1}}),w=createWorld(a.meta,a.buffers),l=a.meta.lake;
 expect(a.meta.structures.chalets).toHaveLength(8);expect(a.meta.structures.lift.towers).toHaveLength(8);expect(a.meta.views).toHaveLength(9);expect(a.meta.reserved[0]).toMatchObject({width:60,length:400});
 expect(w.waterAt(NaN,0)).toBe(false);expect(w.waterAt(640,1740)).toBe(false);expect(w.waterAt(l.x0+l.size,2500)).toBe(false);
 let water=0;for(let j=0;j<l.grid;j+=17)for(let i=0;i<l.grid;i+=17){const x=l.x0+(i+.5)*l.size/l.grid,z=l.z0+(j+.5)*l.size/l.grid;expect(w.waterAt(x,z)).toBe(a.buffers.lake[j*l.grid+i]>=200);if(w.waterAt(x,z)){water++;// A B-spline footprint crosses the bank within two terrain cells of the shore.
 if(lakeRadius(x,z)<1-2*a.meta.cell/172)expect(w.heightAt(x,z)).toBeCloseTo(l.level,1);else expect(Number.isFinite(w.heightAt(x,z))).toBe(true);expect(w.treeDensityAt(x,z)).toBeLessThan(.001);}}expect(water).toBeGreaterThan(0);
 for(const v of a.meta.views)expect(v.pos[1]).toBeGreaterThan(w.heightAt(v.pos[0],v.pos[2]));
 for(const [x,z]of [[-1000,1000],[1100,1000],[1600,0]])expect(w.obstaclesNear(x,z,150,[]).some(o=>o.type==='monster')).toBe(false);
 const b=a.meta.structures.lodge;expect(w.obstaclesNear(b.x,b.z,2,[]).some(o=>o.type==='building')).toBe(true);
 const t=a.meta.structures.lift.towers[0];expect(w.obstaclesNear(t.x,t.z,1,[]).some(o=>o.type==='tower')).toBe(true);
});

test('lake metadata and payload validation fail before unsafe categorical lookup',()=>{
 const {meta,buffers}=fixture();
 for(const lake of [{level:1180,x0:0,z0:0,size:10,grid:0},{level:NaN,x0:0,z0:0,size:10,grid:512}])expect(()=>createWorld({...meta,lake},buffers)).toThrow(/npm run worldgen/);
 const lake={level:1180,x0:0,z0:0,size:100,grid:512};expect(()=>createWorld({...meta,lake},buffers)).toThrow(/lake/);
});

test('I15b rotated foundation follows model X width and Z depth; lift points clockwise from north',async()=>{
 const {makeStructures,foundationWeight}=await import('../../tools/worldgen/lib/valley-objects.js');
 const s=makeStructures(),b=s.lodge,c=Math.cos(Math.PI/2-b.yaw),sn=Math.sin(Math.PI/2-b.yaw);
 expect(b.x).toBeGreaterThan(s.bridge.x);expect(b.z).toBeLessThan(s.bridge.z);expect(b.yaw).toBeCloseTo(-1.18,8);
 for(const [u,v]of [[23,9.5],[-23,9.5],[23,-9.5],[-23,-9.5]])expect(foundationWeight(b,b.x+c*u+sn*v,b.z-sn*u+c*v)).toBeCloseTo(1,10);
 expect(Math.hypot(s.bridge.x-b.x,s.bridge.z-b.z)).toBeGreaterThanOrEqual(40);expect(Math.hypot(s.bridge.x-b.x,s.bridge.z-b.z)).toBeLessThanOrEqual(125);
 expect(s.chalets.every(p=>Math.hypot(p.x-205,p.z-1255)<=250)).toBe(true);
 const lift=s.lift;expect(lift.base.yaw).toBeCloseTo(Math.atan2(lift.top.x-lift.base.x,lift.base.z-lift.top.z),12);
 expect(s.lodge.length).toBe(46);expect(s.lodge.width).toBe(19);
});

test('I15b real trees match 9–16m props and remain off categorical lake cells',()=>{
 const a=generateWorld({quick:true,landscape:{iterations:12,cycles:1}}),w=createWorld(a.meta,a.buffers);let trees=0;
 for(let z=600;z<1900;z+=100)for(let x=-1000;x<1100;x+=100)for(const o of w.obstaclesNear(x,z,25,[]))if(o.type==='tree'){
  trees++;expect(o.height).toBeGreaterThanOrEqual(9);expect(o.height).toBeLessThanOrEqual(16);
  const l=a.meta.lake,i=Math.floor((o.x-l.x0)*l.grid/l.size),j=Math.floor((o.z-l.z0)*l.grid/l.size);
  if(i>=0&&i<l.grid&&j>=0&&j<l.grid)expect(a.buffers.lake[j*l.grid+i]).toBe(0);
 }
 expect(trees).toBeGreaterThan(0);
});
