import {test,expect} from 'vitest';
import {makeSnow} from '../../tools/worldgen/lib/snow.js';
import {snowAt} from '../../src/world/masks.js';
const c={grid:64,size:768,cell:12,maskGrid:32};
test('wind, steep slopes and snow accumulation govern surface maps',()=>{
  const a=Float32Array.from({length:64**2},(_,k)=>1500+(k%64)*12*1.8),b=makeSnow(a,c,'snow'),out={};
  snowAt(c,b,0,0,out);expect(out.rock).toBeGreaterThan(.7);expect(out.depth).toBeLessThan(.15);
  const flat=makeSnow(new Float32Array(64**2).fill(1500),c,'snow');
  snowAt(c,flat,0,0,out);expect(out.depth).toBeGreaterThan(1);
  expect(out.powder+out.packed+out.ice).toBeCloseTo(1,14);
  for(const x of [-100,0,123]){expect(snowAt(c,flat,x,20,out)).toBe(out);expect(out.rough).toBeGreaterThanOrEqual(0);}
});
test('sheltered forest density increases powder and reduces ice independently of height',()=>{
  const flat=new Float32Array(64**2).fill(1200),a=makeSnow(flat,c,'forest-a'),b=makeSnow(flat,c,'forest-b');
  let powderResponse=0,iceResponse=0;
  for(let k=0;k<a.masksA.length;k+=4){const delta=a.masksB[k]-b.masksB[k];powderResponse+=delta*(a.masksA[k+1]-b.masksA[k+1]);iceResponse+=delta*(a.masksA[k+2]-b.masksA[k+2]);}
  expect(powderResponse).toBeGreaterThan(0);expect(iceResponse).toBeLessThan(0);
});

test('northwest wind exposes northwest-facing slopes and deposits on southeast-facing slopes',()=>{
  const plane=sign=>Float32Array.from({length:64**2},(_,k)=>1500+sign*.35*((k%64+.5)*12-384+(Math.floor(k/64)+.5)*12-384));
  const windward=makeSnow(plane(1),c,'wind'),leeward=makeSnow(plane(-1),c,'wind'),a={},b={};
  snowAt(c,windward,0,0,a);snowAt(c,leeward,0,0,b);
  expect(a.wind).toBeGreaterThan(b.wind);expect(b.depth).toBeGreaterThan(a.depth);expect(a.ice).toBeGreaterThan(b.ice);expect(b.powder).toBeGreaterThan(a.powder);
});

test('I15c snow surface never cuts bedrock, retains flat snow and leaves >50 degree faces bare',async()=>{
 const {depositSnow}=await import('../../tools/worldgen/lib/valley-snow.js'),c={grid:64,cell:64,size:4096};
 const flat=new Float32Array(64**2).fill(1800),f=depositSnow(flat,c);expect(f.depth[32*64+32]).toBeCloseTo(1.4,4);
 const rock=Float32Array.from({length:64**2},(_,k)=>1800+1.5*((k%64+.5)*64-2048)),copy=rock.slice(),s=depositSnow(rock,c);
 expect(rock).toEqual(copy);expect(s.depth[32*64+32]).toBe(0);
 for(let k=0;k<rock.length;k++){expect(s.height[k]).toBeGreaterThanOrEqual(rock[k]);expect(s.depth[k]).toBeGreaterThanOrEqual(0);expect(s.depth[k]).toBeLessThanOrEqual(15);}
});
