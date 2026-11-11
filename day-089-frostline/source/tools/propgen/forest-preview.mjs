// Offline context inspection: same decoded geometry, no browser or dependencies.
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildProps} from './model.mjs';
import {encodeProps} from './format.mjs';
import {readPropData} from '../../src/render/objects/prop-data.js';
import {raster,sheet,save} from './preview.mjs';
import {decodePNG,resize} from './png.mjs';
import {sub} from './mesh.mjs';
export async function forestPreview(revision=4,dir='.agent-harness/runs/propgen'){
 const prefix=`${dir}/i16b-round-${revision}`;await mkdir(dir,{recursive:true});
 const {bin,meta}=encodeProps(buildProps({revision})),data=readPropData(bin.buffer.slice(bin.byteOffset,bin.byteOffset+bin.byteLength),meta);
 const singles=[];
 for(const lod of ['near','mid','far'])for(const name of ['fir-a','fir-b','fir-c']){
  const im=raster([{mesh:data.byName[name][lod]}],440,620,[.8,.16,-1.7]);await save(im,`${prefix}-${name}-${lod}.png`);singles.push(im);
 }
 await save(sheet(singles,3),`${prefix}-trees.png`);
 let seed=871;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const ground=(x,z)=>z*.12,instances=[];
 for(let i=0;i<40;i++){
  const side=i%2?1:-1,x=side*(7+random()*28),z=15-Math.floor(i/8)*20+random()*8,scale=.79+random()*.32,name=['fir-a','fir-b','fir-c'][i%3];
  instances.push({mesh:data.byName[name].near,at:[x,ground(x,z),z],yaw:random()*Math.PI*2,scale});
 }
 const terrain=[[-180,ground(-180,-250),-250],[-180,ground(-180,26),26],[180,ground(180,26),26],[180,ground(180,-250),-250]];
 const camera=[0,ground(0,28)+1.7,28],target=[0,ground(0,-45)+6,-45];
 const eye=raster(instances,1100,720,sub(camera,target),{camera,ground:terrain,fov:64});
 const cameraHigh=[43,41,62],high=raster(instances,1100,720,sub(cameraHigh,[0,-4,-20]),{camera:cameraHigh,ground:terrain,fov:52});
 await save(eye,`${prefix}-forest-eye.png`);await save(high,`${prefix}-forest-high.png`);
 const ref=resize(decodePNG(await readFile('refs/valley/08-forest-trail.png')),1100,720);
 await save(sheet([ref,eye,ref,high],2),`${prefix}-forest-comparison.png`);
 return prefix;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(await forestPreview(Number(process.argv[2]??4)));
