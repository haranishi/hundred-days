import {WORLD_FORMAT_VERSION,FILES,validateMeta,formatError} from './format.js';
import {heightAt,sampleSurface,curvatureAlong,spline,clamp} from './surface-math.js';
import {snowAt,maskValue,lakeValue} from './masks.js';
import {createObstacleStore} from './obstacles.js';
export {WORLD_FORMAT_VERSION};
function validateBuffers(meta,b) {
  const n=meta.grid,m=meta.maskGrid;
  if(meta.lake&&(!(b?.lake instanceof Uint8Array)||b.lake.length!==meta.lake.grid**2))throw formatError('lake の配列が不正です');
  for(const key of ['height','tileA','masksA','masksB','sunVis']){
    const array=b?.[key],float=key==='height'||key==='tileA',length=key==='height'||key==='sunVis'?n*n:key==='tileA'?meta.tileGrid**2:m*m*4;
    if(!(array instanceof (float?Float32Array:Uint8Array))||array.length!==length)throw formatError(`${key} の配列の長さか型が不正です`);
    if(float)for(let i=0;i<array.length;i++)if(!Number.isFinite(array[i]))throw formatError(`${key} に非数が含まれています`);
  }
}
/** Arrays stay public and retain identity for GPU upload. Construction allocates; hot queries do not. */
export function createWorld(meta,buffers) {
  validateMeta(meta);validateBuffers(meta,buffers);
  const half=meta.size/2,zones=new Array(256);for(const z of meta.zones)zones[z.id]=z;
  const world={meta,buffers,size:meta.size,half,drops:meta.drops,
    waterAt(x,z){return lakeValue(meta,buffers,x,z)>=200;},
    heightAt(x,z){return heightAt(meta,buffers,x,z);},
    sampleSurface(x,z,out){return sampleSurface(meta,buffers,x,z,out);},
    curvatureAlong(x,z,dx,dz){return curvatureAlong(meta,buffers,x,z,dx,dz);},
    snowAt(x,z,out){return snowAt(meta,buffers,x,z,out);},
    treeDensityAt(x,z){return lakeValue(meta,buffers,x,z)>0?0:maskValue(meta,buffers.masksB,x,z,0)/255;},
    zoneAt(x,z){
      if(!Number.isFinite(x)||!Number.isFinite(z))return meta.zones[0];
      const i=clamp(Math.floor((x+half)/(2*meta.cell)),0,meta.maskGrid-1),j=clamp(Math.floor((z+half)/(2*meta.cell)),0,meta.maskGrid-1);
      return zones[buffers.masksB[(j*meta.maskGrid+i)*4+3]]??meta.zones[0];
    },
    sunVisibilityAt(x,z){
      if(!Number.isFinite(x)||!Number.isFinite(z))return 0;
      return spline(buffers.sunVis,meta.grid,(clamp(x,-half,half)+half)/meta.cell-.5,(clamp(z,-half,half)+half)/meta.cell-.5)/255;
    },
  };
  world.obstaclesNear=createObstacleStore(world);
  return world;
}
export async function loadWorld(baseUrl='world/') {
  const base=baseUrl.endsWith('/')?baseUrl:baseUrl+'/';
  async function get(file){const response=await fetch(base+file);if(!response.ok)throw formatError(`${file} の読み込みに失敗 (${response.status})`);return response;}
  const meta=validateMeta(await (await get('world.json')).json()),buffers={};
  await Promise.all(Object.entries(FILES).map(async([key,file])=>{
    if(key==='lake'&&!meta.lake)return;
    const raw=await(await get(file)).arrayBuffer();
    const digest=await globalThis.crypto.subtle.digest('SHA-256',raw);
    const hash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
    if(hash!==meta.hashes[file])throw formatError(`${file} の SHA-256 が一致しません`);
    if(key==='height'||key==='tileA'){
      if(raw.byteLength%4)throw formatError(`${file} のバイト数が不正です`);
      const view=new DataView(raw),a=new Float32Array(raw.byteLength/4);for(let i=0;i<a.length;i++)a[i]=view.getFloat32(i*4,true);buffers[key]=a;
    }else buffers[key]=new Uint8Array(raw);
  }));
  return createWorld(meta,buffers);
}
