import {test,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {createWorld} from '../../src/world/index.js';
import {fixture} from './fixture.js';
import {inDropCorridor} from '../../src/world/drop-clearance.js';
const hash=items=>createHash('sha256').update(JSON.stringify(items.map(o=>[o.id,o.type,o.x,o.y,o.z,o.radius,o.height]))).digest('hex');
test('cached cells and eviction give deterministic obstacles and reuse object references',()=>{
  const {meta,buffers}=fixture(),w=createWorld(meta,buffers),a=[],b=[];
  expect(w.obstaclesNear(0,0,100,a)).toBe(a);expect(a.length).toBeGreaterThan(0);const original=hash(a),ref=a[0];
  w.obstaclesNear(0,0,100,b);expect(hash(b)).toBe(original);expect(b[0]).toBe(ref);
  w.obstaclesNear(1000,1000,600,b);w.obstaclesNear(0,0,100,b);expect(hash(b)).toBe(original);
  const other=createWorld({...meta,seed:'other'},buffers);other.obstaclesNear(0,0,100,b);expect(hash(b)).not.toBe(original);
});
test('all neighboring trunks stay at least 3m apart, including across 48m cell boundaries',()=>{
  const {meta,buffers}=fixture(),w=createWorld(meta,buffers),out=[];w.obstaclesNear(24,24,100,out);
  for(let i=0;i<out.length;i++)for(let j=i+1;j<out.length;j++)expect(Math.hypot(out[i].x-out[j].x,out[i].z-out[j].z)).toBeGreaterThanOrEqual(3);
  for(const o of out){expect(o.radius).toBeGreaterThanOrEqual(.25);expect(o.radius).toBeLessThanOrEqual(.45);expect(o.height).toBeGreaterThanOrEqual(4);expect(o.height).toBeLessThanOrEqual(9);}
});
test('trees are absent above treeline, on >38 degree slopes and on the practice center',()=>{
  const {meta,buffers}=fixture(),out=[];
  buffers.height.fill(1700);createWorld(meta,buffers).obstaclesNear(0,0,100,out);expect(out.length).toBe(0);
  for(let j=0;j<32;j++)for(let i=0;i<32;i++)buffers.height[j*32+i]=1100+1.1*((i+.5)*192-3072);
  createWorld(meta,buffers).obstaclesNear(0,0,100,out);expect(out.length).toBe(0);
  buffers.height.fill(1100);createWorld(meta,buffers).obstaclesNear(1700,1800,60,out);expect(out.length).toBe(0);
});
test('snow monsters, exposed rocks, drop corridors and invalid queries obey their conditions',()=>{
  const {meta,buffers}=fixture(),out=[];buffers.height.fill(1400);let w=createWorld(meta,buffers);w.obstaclesNear(0,0,100,out);expect(out.every(o=>o.type==='monster')).toBe(true);
  for(let k=0;k<buffers.masksA.length;k+=4){buffers.masksA[k+3]=150;buffers.masksB[k]=0;}
  w=createWorld(meta,buffers);w.obstaclesNear(0,0,100,out);expect(out.length).toBeGreaterThan(0);expect(out.every(o=>o.type==='rock')).toBe(true);
  const d={id:'safe',name:'安全',x:0,y:1400,z:0,heading:0,zone:1,level:1,kind:'practice',hidden:false,finish:'test',about:'試験'};meta.drops=[d];w=createWorld(meta,buffers);w.obstaclesNear(0,70,100,out);
  expect(out.every(o=>!inDropCorridor(meta.drops,o.x,o.z,o.radius))).toBe(true);
  w.obstaclesNear(NaN,0,100,out);expect(out.length).toBe(0);w.obstaclesNear(0,0,-1,out);expect(out.length).toBe(0);
});
