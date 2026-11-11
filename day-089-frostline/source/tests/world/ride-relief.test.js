import {test,expect} from 'vitest';
import {roundedCrest,practiceRelief,RELIEF_PARAMS} from '../../tools/worldgen/lib/relief.js';
import {countFloatableRuns} from '../../tools/worldgen/lib/ride-stats.js';

test('practice terrain preserves the upper 200x300m and has exactly three small crests at 30m spacing',()=>{
  for(let z=1590;z<=1890;z+=10)for(let x=1600;x<=1800;x+=10)expect(practiceRelief(x,z)).toBeLessThan(1e-12);
  const peaks=[];
  for(let z=1900;z<=2000;z+=.5)if(practiceRelief(1700,z)>practiceRelief(1700,z-.5)&&practiceRelief(1700,z)>practiceRelief(1700,z+.5))peaks.push(z);
  expect(peaks).toEqual(RELIEF_PARAMS.practiceCenters);
  for(const z of peaks){expect(practiceRelief(1700,z)).toBeCloseTo(.45,5);expect(practiceRelief(1850,z)).toBe(0);}
  expect(roundedCrest(3,1,5,3)).toBeLessThan(roundedCrest(-3,1,5,3));
});

test('floatable runs use the requested physical threshold, >=3m length and downhill tracing',()=>{
  const world={half:3072,heightAt:(x,z)=>1000-.3*z,sampleSurface:(x,z,out)=>Object.assign(out,{ny:1/Math.sqrt(1+.3**2)}),
    curvatureAlong:(x,z,dx,dz)=>{expect(Math.abs(dx)).toBeLessThan(1e-8);expect(dz).toBeCloseTo(1);return z>=100&&z<=106||z>=200&&z<=202?-.03:0;}};
  const r=countFloatableRuns(world,{x:0,z:0});
  expect(r.length).toBe(600);expect(r.count).toBe(1);expect(r.intervals[0].length).toBe(6);expect(r.perKm).toBeCloseTo(1/.6);
  expect(countFloatableRuns(world,{x:0,z:0,speed:10}).count).toBe(0);
});
