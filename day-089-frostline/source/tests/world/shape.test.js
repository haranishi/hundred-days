import {test,expect} from 'vitest';
import {makeShape} from '../../tools/worldgen/lib/shape.js';
import {makeLandscapeInputs} from '../../tools/worldgen/lib/landscape-inputs.js';
import {growLandscape,calibrateUplift} from '../../tools/worldgen/lib/landscape.js';
import {lakeInside} from '../../tools/worldgen/lib/valley-layout.js';
test('I15c begins within five metres of a plane; mountains grow only through uplift and erosion',()=>{
 const c={size:4096,grid:48,cell:4096/48},a=makeShape(c,'growth'),before=a.slice(),f=makeLandscapeInputs(c,'growth');
 expect(Math.min(...a)).toBeGreaterThanOrEqual(1175);expect(Math.max(...a)).toBeLessThanOrEqual(1185);
 const b=growLandscape(a,c,f,'growth',100),copy=b.slice(),u=f.uplift.slice();calibrateUplift(b,c,f);
 expect(a).toEqual(before);expect(b).toEqual(copy);expect(f.uplift).not.toEqual(u);
 const zero={...f,uplift:new Float32Array(f.uplift.length)},control=growLandscape(a,c,zero,'growth',100);expect(b[24*c.grid+24]).toBeGreaterThan(control[24*c.grid+24]+20);expect(b.every(Number.isFinite)).toBe(true);
 for(let j=0;j<c.grid;j++)for(let i=0;i<c.grid;i++){const x=(i+.5)*c.cell-2048,z=(j+.5)*c.cell-2048,k=j*c.grid+i;if(lakeInside(x,z))expect(b[k]).toBe(1180);if(f.fixed[k])expect(b[k]).toBe(f.base[k]);}
});
test('reservation selects an existing slope and never flattens it',async()=>{
 const {chooseReserve}=await import('../../tools/worldgen/lib/valley-snow.js'),c={grid:64,cell:64,size:4096},a=Float32Array.from({length:64**2},(_,k)=>1900-.38*((Math.floor(k/64)+.5)*64-2048)),before=a.slice(),r=chooseReserve(a,c);
 expect(a).toEqual(before);expect(r.length).toBe(400);expect(r.width).toBe(60);expect(r.slopeRange[0]).toBeGreaterThan(18);expect(r.slopeRange[1]).toBeLessThan(24);for(const s of [0,400])for(const t of [-30,30]){const x=r.x+Math.sin(r.heading)*s+Math.cos(r.heading)*t,z=r.z-Math.cos(r.heading)*s+Math.sin(r.heading)*t;expect(x).toBeGreaterThanOrEqual(350);expect(x).toBeLessThanOrEqual(1700);expect(z).toBeGreaterThanOrEqual(-600);expect(z).toBeLessThanOrEqual(1150);}
});
