import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {readRiderData} from '../../src/render/ride/rider-data.js';
const bytes=readFileSync('public/models/rider-v1.bin'),meta=JSON.parse(readFileSync('public/models/rider-v1.json','utf8'));
const buffer=()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
it('decodes typed arrays without three and accepts JSON text',()=>{const d=readRiderData(buffer(),JSON.stringify(meta));expect(d.position).toBeInstanceOf(Float32Array);expect(d.skinWeight).toBeInstanceOf(Float32Array);expect(d.index.length).toBe(meta.triangleCount*3);expect(d.bones.length).toBe(22);});
it.each(['syntax','truncated','overlap','weight','bone','normal','index','rigid'])('rejects corrupt %s with reason',kind=>{
 const m=structuredClone(meta),b=buffer(),view=new DataView(b);
 if(kind==='syntax')return expect(()=>readRiderData(b,'{')).toThrow(/JSON syntax/);
 if(kind==='truncated')return expect(()=>readRiderData(b.slice(0,-1),m)).toThrow(/byteLength/);
 if(kind==='overlap')m.attributes.normal.offset=m.attributes.position.offset;
 if(kind==='weight')new Uint16Array(b,m.attributes.skinWeight.offset,4).fill(0);
 if(kind==='bone')m.bones[0].basis[0]=4;
 if(kind==='normal')view.setInt16(m.attributes.normal.offset,0,true),view.setInt16(m.attributes.normal.offset+2,0,true),view.setInt16(m.attributes.normal.offset+4,0,true);
 if(kind==='index')view.setUint16(m.attributes.index.offset,65535,true);
 if(kind==='rigid'){const parts=new Uint8Array(b,m.attributes.part.offset,m.vertexCount),weights=new Uint16Array(b,m.attributes.skinWeight.offset,m.vertexCount*4),id=parts.findIndex(p=>m.parts[p].rigid);weights.set([32768,32767,0,0],id*4);}
 expect(()=>readRiderData(b,m)).toThrow(/Invalid rider data:/);
});
it.each(['bones','parts'])('rejects null %s entries with a format reason',key=>{const m=structuredClone(meta);m[key][0]=null;expect(()=>readRiderData(buffer(),m)).toThrow(/Invalid rider data:/);});
it('adds normalized tone without removing the v1 fields',()=>{const d=readRiderData(buffer(),meta);expect(d.tone).toBeInstanceOf(Float32Array);expect(d.tone.length).toBe(meta.vertexCount);expect(d.seam.length).toBe(meta.vertexCount);expect(d.tone.every(v=>v>=0&&v<=1)).toBe(true);});
it('accepts a previous v1 layout without tone and supplies primary color',()=>{const m=structuredClone(meta);delete m.attributes.tone;const d=readRiderData(buffer(),m);expect(d.tone.every(v=>v===1)).toBe(true);});
it('validates the optional tone layout with the other attribute ranges',()=>{const m=structuredClone(meta);m.attributes.tone.offset=m.attributes.part.offset;expect(()=>readRiderData(buffer(),m)).toThrow(/tone overlap/);});
