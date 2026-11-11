import {test,expect} from 'vitest';
import {makeDrops,checkDrop} from '../../tools/worldgen/lib/drops.js';
import {inDropCorridor} from '../../src/world/drop-clearance.js';
const c={grid:64,size:6144,cell:96,maskGrid:32,tileGrid:256,tilePeriod:96};
function plane(slope){const height=Float32Array.from({length:4096},(_,k)=>2000-slope*((Math.floor(k/64)+.5)*96-3072)),masksA=new Uint8Array(32**2*4);for(let i=0;i<masksA.length;i+=4){masksA[i]=100;masksA[i+1]=120;}return {height,tileA:new Float32Array(256**2),masksA,masksB:new Uint8Array(32**2*4)};}
test('seven named drops face downhill and have snow for the next 150 metres',()=>{
  const b=plane(.2679),drops=makeDrops(c,b);expect(drops.length).toBe(7);expect(drops[0].id).toBe('first-snow');
  for(const d of drops){expect(checkDrop(c,b,d).safe).toBe(true);expect(-Math.cos(d.heading)).toBeGreaterThan(.99);expect(checkDrop(c,b,d).downhillAngle).toBeLessThanOrEqual(60);expect(inDropCorridor(drops,d.x,d.z+100)).toBe(true);}
});
test('no safe candidate fails generation rather than silently accepting a cliff',()=>{
  expect(()=>makeDrops(c,plane(3),[{id:'cliff',name:'崖',x:0,z:0,level:3}])).toThrow(/安全/);
});

test('north and east corridors follow the physics heading convention',()=>{
  const north=[{x:0,z:0,heading:0}],east=[{x:0,z:0,heading:Math.PI/2}];
  expect(inDropCorridor(north,0,-100)).toBe(true);expect(inDropCorridor(north,0,100)).toBe(false);
  expect(inDropCorridor(east,100,0)).toBe(true);expect(inDropCorridor(east,-100,0)).toBe(false);
  expect(checkDrop(c,plane(.2679),{x:0,z:0,heading:0}).safe).toBe(false);
});
