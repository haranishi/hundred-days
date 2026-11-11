import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildProps} from './model.mjs';
import {encodeProps} from './format.mjs';
import {readPropData} from '../../src/render/objects/prop-data.js';
import {renderViews} from './preview.mjs';
import {forestPreview} from './forest-preview.mjs';
export async function generate({revision=4,buildingRound=5,outDir='public/models',previewDir='.agent-harness/runs/propgen',previews=true}={}){
 const start=performance.now(),models=buildProps({revision,buildingRound}),encoded=encodeProps(models),data=readPropData(encoded.bin.buffer.slice(encoded.bin.byteOffset,encoded.bin.byteOffset+encoded.bin.byteLength),encoded.meta);
 await mkdir(outDir,{recursive:true});await writeFile(resolve(outDir,'props-v1.bin'),encoded.bin);await writeFile(resolve(outDir,'props-v1.json'),encoded.json);
 const views=previews?await renderViews(data,previewDir,`i16c-${buildingRound}`):{};
 if(previews)views.forest=await forestPreview(revision,previewDir);
 return {meshes:models.map(m=>({name:m.name,lod:m.lod,triangles:m.tri.length,size:m.bounds.size.map(v=>+v.toFixed(3))})),bytes:encoded.bin.length+Buffer.byteLength(encoded.json),seconds:+((performance.now()-start)/1000).toFixed(3),views};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const i=process.argv.indexOf('--revision'),revision=i<0?4:Number(process.argv[i+1]);
 if(!Number.isInteger(revision)||revision<1||revision>4)throw Error('revision must be 1, 2, 3 or 4');
 console.log(JSON.stringify(await generate({revision}),null,2));
}
