import {test,expect} from 'vitest';
import {inflateSync} from 'node:zlib';
import {rngFor} from '../../tools/worldgen/lib/rng.js';
import {periodicNoise, makeTile} from '../../tools/worldgen/lib/noise.js';
import {encodePNG} from '../../tools/worldgen/lib/png.js';
test('stage random streams are repeatable and independent',()=>{
  const a=rngFor('s','rain'),b=rngFor('s','rain'),c=rngFor('s','snow');
  for(let i=0;i<20;i++)expect(a()).toBe(b());
  expect(rngFor('s','rain')()).not.toBe(c());
});
test('noise repeats at its period and tile stays in range',()=>{
  expect(periodicNoise(0,2,8,42)).toBe(periodicNoise(8,2,8,42));
  const a=makeTile('test');
  expect(a.length).toBe(256**2);
  expect(Math.max(...a)).toBeLessThanOrEqual(1); expect(Math.min(...a)).toBeGreaterThanOrEqual(-1);
});
test('PNG signature, chunks and zlib payload are decodable',()=>{
  const bytes=encodePNG(2,2,new Uint8Array([255,0,0,255,0,255,0,255,0,0,255,255,255,255,255,255]));
  expect(bytes.subarray(1,4).toString()).toBe('PNG');
  let offset=8,payload;
  while(offset<bytes.length){const len=bytes.readUInt32BE(offset);if(bytes.toString('ascii',offset+4,offset+8)==='IDAT')payload=bytes.subarray(offset+8,offset+8+len);offset+=len+12;}
  expect(inflateSync(payload).length).toBe(18);
});

test('reference comparison PNG decoder roundtrips pixels and dimensions',async()=>{
 const {decodePNG,sideBySide}=await import('../../tools/worldgen/lib/png.js'),data=new Uint8Array([30,60,90,255,200,120,40,255]),a=decodePNG(encodePNG(2,1,data));
 expect(a.data).toEqual(data);const b=decodePNG(sideBySide(a,a,2,1));expect(b.width).toBe(4);expect(b.height).toBe(1);expect(b.data).toEqual(new Uint8Array([...data,...data]));
});
