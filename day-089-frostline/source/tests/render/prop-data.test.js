import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {buildProps} from '../../tools/propgen/model.mjs';
import {encodeProps} from '../../tools/propgen/format.mjs';
import {readPropData} from '../../src/render/objects/prop-data.js';
const models=buildProps(),{bin,meta,json}=encodeProps(models),buffer=()=>bin.buffer.slice(bin.byteOffset,bin.byteOffset+bin.byteLength);
describe('readPropData',()=>{
 it('accepts parsed or string metadata and has no renderer or I/O imports',()=>{expect(readPropData(buffer(),json).meshes.length).toBe(20);expect(readFileSync('src/render/objects/prop-data.js','utf8')).not.toMatch(/\bimport\b|\brequire\s*\(/);expect(meta.meshes[0].vertexCount).toBeGreaterThan(0);});
 it.each(models.map((m,i)=>[m.name+'/'+m.lod,m,i]))('%s round-trips all attributes and local indices',(_,m,i)=>{
  const data=readPropData(buffer(),meta),d=data.meshes[i];expect(data.byName[m.name][m.lod]).toBe(d);
  expect(d.position).toBeInstanceOf(Float32Array);expect(d.normal).toBeInstanceOf(Float32Array);expect(d.color).toBeInstanceOf(Float32Array);expect(d.material).toBeInstanceOf(Uint8Array);expect(d.ao).toBeInstanceOf(Float32Array);expect(d.index).toBeInstanceOf(Uint32Array);
  for(let v=0;v<m.p.length;v++){for(let k=0;k<3;k++){expect(d.position[v*3+k]).toBeCloseTo(m.p[v][k],5);expect(d.normal[v*3+k]).toBeCloseTo(m.n[v][k],4);expect(d.color[v*3+k]).toBeCloseTo(m.color[v][k]/255,6);}expect(d.material[v]).toBe(m.material[v]);expect(d.ao[v]).toBeCloseTo(m.ao[v],2);}
  expect(Array.from(d.index)).toEqual(m.tri.flat());
 });
 it.each([
  ['format',m=>{m.format='other';}],['version',m=>{m.version=2;}],['byteLength',m=>{m.byteLength++;}],['counts',m=>{m.vertexCount=Infinity;}],['materials',m=>{m.materials[0].id=7;}],['axes',m=>{m.axes.up='+Z';}],
  ['layout',m=>{m.attributes.position.offset=1;}],['overlap',m=>{m.attributes.color.offset=0;}],['meshes',m=>{m.meshes=null;}],['duplicate',m=>{m.meshes[1].name='lodge';}],['ranges',m=>{m.meshes[0].vertexStart=1;}],['bounds',m=>{m.meshes[0].bounds.size[0]=-1;}],['collision',m=>{m.meshes[0].collision.size=[-1,2];}],['stretchAxes',m=>{m.meshes[0].stretchAxes=['Q'];}],['roof corners',m=>{m.meshes[0].roofPlanes[0].corners.pop();}],['roof winding',m=>{m.meshes[0].roofPlanes[0].corners.reverse();}],['roof planarity',m=>{m.meshes[0].roofPlanes[0].corners[3][1]++;}],['deck',m=>{m.meshes[4].deck.length=-1;}],['coverage',m=>{m.meshes.pop();}],
 ])('rejects corrupt %s with a reason',(reason,change)=>{const m=structuredClone(meta);change(m);expect(()=>readPropData(buffer(),m)).toThrow(/Invalid prop data: .+/);});
 it('rejects non ArrayBuffer, invalid JSON and truncated bytes',()=>{expect(()=>readPropData(bin,meta)).toThrow('ArrayBuffer');expect(()=>readPropData(buffer(),'{')).toThrow('JSON syntax');expect(()=>readPropData(buffer().slice(0,-1),meta)).toThrow('byteLength');});
 it.each([
  ['position',Float32Array,NaN,'position/bounds'],['normal',Int16Array,0,'normal length'],['material',Uint8Array,9,'material index'],['index',Uint32Array,999999,'triangle index'],
 ])('rejects corrupt %s payload',(name,C,value,reason)=>{const b=buffer(),a=new C(b,meta.attributes[name].offset,meta.attributes[name].count);if(name==='normal')a.fill(0,0,3);else a[0]=value;expect(()=>readPropData(b,meta)).toThrow(reason);});
 it('rejects collapsed and reversed triangles',()=>{for(const reversed of [false,true]){const b=buffer(),a=new Uint32Array(b,meta.attributes.index.offset,3);if(reversed)[a[1],a[2]]=[a[2],a[1]];else a[1]=a[0];expect(()=>readPropData(b,meta)).toThrow(reversed?'inverted normal':'degenerate triangle');}});
 it('does not mutate either input and exposes zero-copy position views',()=>{const m=structuredClone(meta),before=JSON.stringify(m),b=buffer(),copy=new Uint8Array(b).slice(),d=readPropData(b,m);expect(JSON.stringify(m)).toBe(before);expect(Buffer.compare(Buffer.from(b),Buffer.from(copy))).toBe(0);expect(d.meshes[1].position.buffer).toBe(b);});
});
