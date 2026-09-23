import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadModels} from '../scripts/audit-models.mjs';
import {MODEL_FILES,createBatch} from '../lib/models.js';
import * as THREE from '../vendor/three.js';
const read=async file=>{const b=readFileSync(new URL(`../assets/models/${file}`,import.meta.url));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);};
test('15点のglTF材質・UV・PNG画素とKHR_texture_transformを保持',async()=>{
  const models=await loadModels(read);assert.equal(Object.keys(models).length,15);
  for(const [id,file] of Object.entries(MODEL_FILES)){
    const bytes=await read(file),n=new DataView(bytes).getUint32(12,true),json=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,20,n)));
    const geometry=models[id],batch=createBatch(geometry,1),materials=Array.isArray(batch.material)?batch.material:[batch.material];
    assert.equal(materials.length,json.materials.length);assert.equal(geometry.attributes.color,undefined);
    for(let i=0;i<materials.length;i++){
      const mat=materials[i],original=json.materials.find(m=>m.name===mat.name),pbr=original.pbrMetallicRoughness;
      if(pbr.baseColorTexture){
        assert.ok(mat.map);assert.equal(mat.map.colorSpace,THREE.SRGBColorSpace);assert.equal(mat.map.flipY,false);
        assert.equal(mat.map.image.width,512);assert.equal(mat.map.image.data.length,512*512*4);assert.ok(new Set(mat.map.image.data).size>10);
        const transform=pbr.baseColorTexture.extensions.KHR_texture_transform;assert.equal(mat.map.channel,transform.texCoord??0);
        assert.deepEqual(mat.map.offset.toArray(),transform.offset??[0,0]);assert.deepEqual(mat.map.repeat.toArray(),transform.scale??[1,1]);assert.equal(mat.map.rotation,transform.rotation??0);
      }else assert.deepEqual(mat.color.toArray(),pbr.baseColorFactor.slice(0,3));
    }
  }
});
test('GLTFLoaderのKHR_texture_transformは非既定offset/scale/rotationも反映',async()=>{
  const models=await loadModels(async file=>{
    const buffer=await read(file);if(file!=='building-type-a.glb')return buffer;
    const view=new DataView(buffer),length=view.getUint32(12,true),json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,length)));
    json.materials[0].pbrMetallicRoughness.baseColorTexture.extensions.KHR_texture_transform={offset:[.25,.5],scale:[.5,.25],rotation:.4,texCoord:0};
    const text=new TextEncoder().encode(JSON.stringify(json)),padding=Math.ceil(text.length/4)*4,rest=new Uint8Array(buffer,20+length),out=new ArrayBuffer(20+padding+rest.length),header=new DataView(out);
    header.setUint32(0,0x46546c67,true);header.setUint32(4,2,true);header.setUint32(8,out.byteLength,true);header.setUint32(12,padding,true);header.setUint32(16,0x4e4f534a,true);
    new Uint8Array(out,20,padding).fill(32);new Uint8Array(out,20,text.length).set(text);new Uint8Array(out,20+padding).set(rest);return out;
  });
  const map=models.buildingA.userData.material.map;assert.deepEqual(map.offset.toArray(),[.25,.5]);assert.deepEqual(map.repeat.toArray(),[.5,.25]);assert.equal(map.rotation,.4);
});
