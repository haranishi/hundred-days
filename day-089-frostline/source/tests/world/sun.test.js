import {test,expect} from 'vitest';
import {bakeSun,eveningSun} from '../../tools/worldgen/lib/sunbake.js';
test('a 50 metre wall casts the theoretical evening shadow with a soft edge',()=>{
  const n=256,c={grid:n,cell:2,size:512},a=Float32Array.from({length:n*n},(_,k)=>k%n<98?50:0),s={x:-Math.cos(Math.PI/10),y:Math.sin(Math.PI/10),z:0},vis=bakeSun(a,c,s),row=128*n;
  const expected=98+50/Math.tan(Math.PI/10)/2;
  let crossing=98;while(crossing<n&&vis[row+crossing]<128)crossing++;
  expect(Math.abs(crossing-expected)).toBeLessThan(3);
  let partial=0;for(let i=98;i<n;i++)if(vis[row+i]>5&&vis[row+i]<250)partial++;
  expect(partial*2).toBeGreaterThan(20);expect(vis[row+240]).toBe(255);
});
test('flat terrain is fully lit and sun points SE at 28 degrees',()=>{
  const sun=eveningSun(),vis=bakeSun(new Float32Array(64**2),{grid:64,cell:3,size:192},sun);
  expect(sun.x).toBeGreaterThan(0);expect(sun.z).toBeGreaterThan(0);
  expect(Math.asin(sun.y)*180/Math.PI).toBeCloseTo(28,10);
  expect(vis[2000]).toBe(255);
});
