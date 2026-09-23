// Node-only PNG loader: decode the supplied indexed PNG, then let GLTFLoader
// apply its normal texture assignment and KHR_texture_transform path.
import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import * as THREE from '../vendor/three.js';
import {loadModels as load} from '../lib/models.js';
export function decodePalettePNG(bytes){
  let width,height,palette,alpha,data=[];
  for(let p=8;p<bytes.length;){const n=bytes.readUInt32BE(p),kind=bytes.toString('ascii',p+4,p+8),chunk=bytes.subarray(p+8,p+8+n);p+=n+12;
    if(kind==='IHDR'){width=chunk.readUInt32BE(0);height=chunk.readUInt32BE(4);if(chunk[8]!==8||chunk[9]!==3||chunk[12]!==0)throw Error('Expected 8-bit indexed noninterlaced PNG');}
    if(kind==='PLTE')palette=chunk;if(kind==='tRNS')alpha=chunk;if(kind==='IDAT')data.push(chunk);
  }
  const raw=inflateSync(Buffer.concat(data)),indices=new Uint8Array(width*height),pixels=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x,a=x?indices[i-1]:0,b=y?indices[i-width]:0,c=x&&y?indices[i-width-1]:0,f=raw[y*(width+1)];
    const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);
    const predictor=[0,a,b,Math.floor((a+b)/2),pa<=pb&&pa<=pc?a:pb<=pc?b:c][f];if(predictor===undefined)throw Error('PNG filter');
    const index=indices[i]=(raw[y*(width+1)+x+1]+predictor)&255;
    pixels.set([palette[index*3],palette[index*3+1],palette[index*3+2],alpha?.[index]??255],i*4);
  }
  return {width,height,pixels};
}
export async function loadModels(read){
  globalThis.self=globalThis;
  const manager=new THREE.LoadingManager();manager.addHandler(/\.png$/, {load(url,onLoad,_progress,onError){
    try{const {width,height,pixels}=decodePalettePNG(readFileSync(new URL(url))),texture=new THREE.DataTexture(pixels,width,height);texture.needsUpdate=true;onLoad(texture);return texture;}catch(e){onError(e);}
  }});return load(read,manager);
}
