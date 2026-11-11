import {test,expect,vi,afterEach} from 'vitest';
import {createWorld,loadWorld} from '../../src/world/index.js';
import {fixture} from './fixture.js';
import {encodeBuffers,sha256} from '../../tools/worldgen/generate.mjs';
afterEach(()=>vi.unstubAllGlobals());
test('direct world exposes original arrays and all queries reuse outputs',()=>{
  const {meta,buffers}=fixture(),w=createWorld(meta,buffers),out={},snow={};
  expect(w.buffers.height).toBe(buffers.height);expect(w.half).toBe(3072);expect(w.size).toBe(6144);
  expect(w.sampleSurface(20,40,out)).toBe(out);expect(out.inBounds).toBe(true);expect(out.h).toBe(w.heightAt(20,40));
  expect(Math.hypot(out.nx,out.ny,out.nz)).toBeCloseTo(1,12);
  expect(w.snowAt(20,40,snow)).toBe(snow);expect(snow.powder+snow.packed+snow.ice).toBeCloseTo(1,14);
  expect(w.zoneAt(0,0)).toBe(meta.zones[0]);expect(w.sunVisibilityAt(0,0)).toBeCloseTo(1,12);
  expect(w.curvatureAlong(0,0,1,0)).toBeCloseTo(0,10);
  const before=out.h;w.sampleSurface(20,40,out);expect(out.h).toBe(before);
});
test('out of bounds clamps every continuous map and marks invalid surface input',()=>{
  const {meta,buffers}=fixture(),w=createWorld(meta,buffers),a={},b={};
  w.sampleSurface(9000,-4000,a);w.sampleSurface(3072,-3072,b);
  expect(a.inBounds).toBe(false);expect(a.h).toBe(b.h);expect(a.nx).toBe(b.nx);expect(a.nz).toBe(b.nz);
  for(const fn of ['heightAt','sunVisibilityAt','treeDensityAt'])expect(w[fn](9000,-4000)).toBe(w[fn](3072,-3072));
  w.sampleSurface(NaN,0,a);expect(a.h).toBe(0);expect(a.ny).toBe(1);expect(a.inBounds).toBe(false);
});
test('invalid arrays and metadata fail with regeneration instructions',()=>{
  const {meta,buffers}=fixture();expect(()=>createWorld({...meta,version:100},buffers)).toThrow(/npm run worldgen/);
  expect(()=>createWorld(meta,{...buffers,height:new Float32Array(1)})).toThrow(/npm run worldgen/);
  buffers.height[10]=NaN;expect(()=>createWorld(meta,buffers)).toThrow(/npm run worldgen/);
});
function fakeFetch(corrupt=false,version=2) {
  const {meta,buffers}=fixture(),files=encodeBuffers(buffers);meta.version=version;
  for(const [name,b]of Object.entries(files))meta.hashes[name]=sha256(b);
  if(corrupt)files['masks-a.bin'][0]^=255;
  const fetch=vi.fn(async url=>url.endsWith('world.json')?{ok:true,json:async()=>meta}:{ok:true,arrayBuffer:async()=>{
    const b=files[url.split('/').at(-1)];return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
  }});vi.stubGlobal('fetch',fetch);return fetch;
}
test('fetch loading verifies hashes and decodes little endian floats',async()=>{
  const fetch=fakeFetch(),w=await loadWorld('/fixture');expect(fetch).toHaveBeenCalledTimes(6);expect(w.heightAt(0,0)).toBeCloseTo(1000,4);
});
test('loading rejects incompatible version before fetching buffers',async()=>{
  const fetch=fakeFetch(false,1);await expect(loadWorld('/fixture/')).rejects.toThrow(/npm run worldgen/);expect(fetch).toHaveBeenCalledTimes(1);
});
test('loading rejects SHA mismatch and failed HTTP',async()=>{
  fakeFetch(true);await expect(loadWorld()).rejects.toThrow(/SHA-256/);
  vi.stubGlobal('fetch',async()=>({ok:false,status:404}));await expect(loadWorld()).rejects.toThrow(/npm run worldgen/);
});
test('infinite constants and null metadata entries produce actionable format errors',()=>{
  for(const change of [{size:Infinity,cell:Infinity},{zones:[null]},{drops:[null]}]){
    const {meta,buffers}=fixture();expect(()=>createWorld({...meta,...change},buffers)).toThrow(/npm run worldgen/);
  }
});

test('optional v2 lake is fetched, hash checked and read as categorical cells',async()=>{
  const {meta,buffers}=fixture();meta.lake={level:1180,x0:-100,z0:2000,size:512,grid:512};buffers.lake=new Uint8Array(512**2);buffers.lake[10*512+20]=230;
  const files=encodeBuffers(buffers);for(const [name,b]of Object.entries(files))meta.hashes[name]=sha256(b);
  const fetch=vi.fn(async url=>url.endsWith('world.json')?{ok:true,json:async()=>meta}:{ok:true,arrayBuffer:async()=>{const b=files[url.split('/').at(-1)];return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}});
  vi.stubGlobal('fetch',fetch);const w=await loadWorld('/lake/');expect(fetch).toHaveBeenCalledTimes(7);expect(w.waterAt(-79.5,2010.5)).toBe(true);expect(w.waterAt(-80.5,2010.5)).toBe(false);
  files['lake.u8'][0]^=1;await expect(loadWorld('/lake/')).rejects.toThrow(/SHA-256/);
});
