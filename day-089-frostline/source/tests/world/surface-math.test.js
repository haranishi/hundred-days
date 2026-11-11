import { test, expect } from 'vitest';
import { spline, splineDerivative, heightAt, sampleSurface, curvatureAlong } from '../../src/world/surface-math.js';
const n=32, data=Float32Array.from({length:n*n},(_,k)=> 4*(k%n)+2*Math.floor(k/n)+7);
const c={size:32,grid:n,cell:1,maskGrid:16,tileGrid:256,tilePeriod:96};
const b={height:data,tileA:new Float32Array(256**2), masksB:new Uint8Array(16**2*4)};
test('spline partition of unity and linear reproduction',()=>{
  const ones=new Float32Array(n*n).fill(1);
  for (const x of [4,4.1,10.7,22.99]) {
    expect(spline(ones,n,x,8.4)).toBeCloseTo(1,13);
    expect(spline(data,n,x,8.4)).toBeCloseTo(4*x+2*8.4+7,10);
    expect(splineDerivative(data,n,x,8.4,1,0)).toBeCloseTo(4,10);
    const h=.0001;
    expect((spline(data,n,x+h,8.4)-spline(data,n,x-h,8.4))/(2*h)).toBeCloseTo(4,7);
  }
});
test('composite surface slopes are continuous at actual height, mask and periodic knots on X and Z',()=>{
  const c={size:384,grid:128,cell:3,maskGrid:64,tileGrid:256,tilePeriod:96};
  const b={height:Float32Array.from({length:128**2},(_,k)=>Math.sin(k%128*.1)*10+Math.cos(Math.floor(k/128)*.13)*8),
    tileA:Float32Array.from({length:256**2},(_,k)=>Math.sin(k%256*.11)*Math.cos(Math.floor(k/256)*.09)),
    masksB:Uint8Array.from({length:64**2*4},(_,k)=>k%4===1?(k*17)%256:0)};
  const knots=[(64+.5)*c.cell-c.size/2,(32+.5)*c.cell*2-c.size/2,c.tilePeriod+c.tilePeriod/c.tileGrid*.5-c.size/2];
  const eps=1e-6,out={};
  for(const knot of knots)for(const axis of ['x','z']){
    const x=axis==='x'?knot:17,z=axis==='z'?knot:17;
    sampleSurface(c,b,x-(axis==='x'?eps:0),z-(axis==='z'?eps:0),out);const nx=out.nx,nz=out.nz,h=out.h;
    sampleSurface(c,b,x+(axis==='x'?eps:0),z+(axis==='z'?eps:0),out);
    expect(Math.abs(out.nx-nx)).toBeLessThan(.0001);expect(Math.abs(out.nz-nz)).toBeLessThan(.0001);expect(Math.abs(out.h-h)).toBeLessThan(.0001);
  }
});
test('normal curvature includes transverse slope and is positive in a bowl',()=>{
  const q=Float32Array.from({length:n*n},(_,i)=>{
    const x=i%n+.5-16,z=Math.floor(i/n)+.5-16;
    return .6*z+.02*x*x/2;
  });
  const flat={...b,height:q,tileA:new Float32Array(256**2),masksB:new Uint8Array(16**2*4)};
  expect(curvatureAlong(c,flat,0,0,1,0)).toBeCloseTo(.02/Math.sqrt(1+.6**2),6);
  const out={}; sampleSurface(c,flat,0,0,out);
  expect(Math.hypot(out.nx,out.ny,out.nz)).toBeCloseTo(1,12);
  expect(curvatureAlong(c,flat,0,0,0,1)).toBeCloseTo(0,6);
});
test('out of range clamps the whole composite surface; invalid input is finite',()=>{
  expect(heightAt(c,b,50,3)).toBe(heightAt(c,b,16,3));
  expect(heightAt(c,b,NaN,0)).toBe(0);
  const out={}; sampleSurface(c,b,Infinity,0,out); expect(out.h).toBe(0); expect(out.inBounds).toBe(false);
});
